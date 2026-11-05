"""Best-effort statusline hooks that write atomic observation snapshots."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import signal
from datetime import datetime, timezone
from typing import Any

from .paths import atomic_json, data_path
from .providers.gemini import windows_from_usage


def _claude(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    limits = payload.get("rate_limits")
    if not isinstance(limits, dict):
        return None
    output: dict[str, Any] = {"epoch": datetime.now(timezone.utc).timestamp()}
    for source, target in (("five_hour", "five"), ("seven_day", "seven")):
        value = limits.get(source)
        if not isinstance(value, dict):
            continue
        pct = value.get("used_percentage")
        if isinstance(pct, (int, float)) and not isinstance(pct, bool) and 0 < pct <= 100:
            output[target] = float(pct)
            reset = value.get("resets_at")
            if isinstance(reset, (int, float)) and not isinstance(reset, bool):
                output[target + "_reset"] = float(reset)
    return output if "five" in output or "seven" in output else None


def _agy(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    windows, plan = windows_from_usage(payload)
    if not windows:
        quota = payload.get("quota")
        if isinstance(quota, dict):
            groups = [{"buckets": [{"id": key, **(value if isinstance(value, dict) else {})} for key, value in quota.items()]}]
            windows, plan = windows_from_usage({"command": {"data": {"groups": groups, "plan_tier": payload.get("plan_tier")}}})
    if not windows:
        return None
    return {"checked_at": datetime.now(timezone.utc).isoformat(), "plan": plan, "windows": windows}


MAX_CHAIN_OUTPUT = 64 * 1024
CHAIN_TIMEOUT = 5


def _chain(command, raw: str, *, shell: bool = False) -> tuple[int, bytes]:
    """Drain output with a strict cap; bound input writes and runtime too."""
    process = subprocess.Popen(command, shell=shell, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               start_new_session=os.name != "nt",
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    output = bytearray()
    overflow = threading.Event()
    def stop():
        try:
            if os.name != "nt": os.killpg(process.pid, signal.SIGKILL)
            else: process.kill()
        except OSError: pass
    def read():
        try:
            while True:
                chunk = process.stdout.read(4096)
                if not chunk: break
                if len(output) + len(chunk) > MAX_CHAIN_OUTPUT:
                    overflow.set()
                    stop()
                    break
                output.extend(chunk)
        except (OSError, ValueError): pass
    def write():
        try:
            process.stdin.write(raw.encode("utf-8"))
            process.stdin.close()
        except (OSError, ValueError): pass
    reader = threading.Thread(target=read, daemon=True)
    writer = threading.Thread(target=write, daemon=True)
    reader.start(); writer.start()
    try:
        code = process.wait(timeout=CHAIN_TIMEOUT)
        reader.join(timeout=max(0.1, CHAIN_TIMEOUT / 10))
        writer.join(timeout=max(0.1, CHAIN_TIMEOUT / 10))
        if reader.is_alive() or writer.is_alive():
            stop()
            return 124, b""
        return (125, b"") if overflow.is_set() else (code, bytes(output))
    except subprocess.TimeoutExpired:
        stop()
        process.wait(timeout=2)
        return 124, b""
    finally:
        stop()  # also clean up children left behind by a successful Unix command
        reader.join(timeout=0.5); writer.join(timeout=0.5)
        if not reader.is_alive(): process.stdout.close()


def run_hook(provider: str, chain: list[str] | None = None, *, chain_shell: str | None = None) -> int:
    raw = ""
    try:
        raw = sys.stdin.read(1024 * 1024 + 1)
        if len(raw.encode("utf-8")) > 1024 * 1024:
            return 125
        payload = json.loads(raw)
        result = _claude(payload) if provider == "claude" else _agy(payload)
        if result:
            atomic_json(data_path("claude-observation.json" if provider == "claude" else "gemini-kota.json"), result)
    except Exception:
        pass
    if chain or chain_shell:
        if chain is not None and (not isinstance(chain, list) or not chain or not all(isinstance(x, str) for x in chain)):
            return 2
        try:
            code, output = _chain(chain_shell if chain_shell else chain, raw, shell=bool(chain_shell))
            if hasattr(sys.stdout, "buffer"):
                sys.stdout.buffer.write(output)
                sys.stdout.buffer.flush()
            else:
                sys.stdout.write(output.decode("utf-8", errors="replace"))
                sys.stdout.flush()
            return code
        except Exception:
            return 0
    return 0
