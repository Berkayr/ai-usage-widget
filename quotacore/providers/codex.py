"""Codex app-server quota reader using JSON-RPC only (no model requests)."""
from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

from ..schema import iso_now, provider_record
from .common import kind_for, make_window, safe_error

META = {"id": "codex", "label": "OpenAI Codex", "category": "subscription", "auth": "cli-login", "experimental": False, "docs_url": "https://developers.openai.com/codex/"}


def _executable() -> str | None:
    found = shutil.which("codex")
    if found:
        return found
    if os.name == "nt":
        roots = [Path(os.environ.get("APPDATA", "")) / "npm", Path.home() / "AppData" / "Roaming" / "npm"]
        for root in roots:
            for name in ("codex.cmd", "codex.exe", "codex"):
                candidate = root / name
                if candidate.is_file():
                    return str(candidate)
    return None


def detect() -> bool:
    return _executable() is not None


def _command(exe: str) -> list[str] | str:
    # A .cmd shim must go through cmd.exe as ONE string: passing a list makes
    # subprocess backslash-escape the inner quotes, which cmd.exe does not
    # understand, so app-server never starts.
    if os.name == "nt" and exe.lower().endswith((".cmd", ".bat")):
        comspec = os.environ.get("COMSPEC", "cmd.exe")
        return f'"{comspec}" /d /s /c ""{exe}" app-server"'
    return [exe, "app-server"]


def _exchange(timeout: float = 20.0) -> dict[str, Any]:
    process = subprocess.Popen(_command(_executable() or "codex"), stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               text=True, encoding="utf-8", errors="replace", bufsize=1,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    responses: queue.Queue[dict[str, Any]] = queue.Queue()

    def reader() -> None:
        try:
            for line in process.stdout:
                try:
                    message = json.loads(line)
                    if isinstance(message, dict) and message.get("id") == 2:
                        responses.put(message)
                        return
                except ValueError:
                    continue
        except (OSError, ValueError):
            return

    thread = threading.Thread(target=reader, daemon=True)
    try:
        thread.start()
        messages = [
            {"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "quotacore", "version": "1"}}},
            {"method": "initialized", "params": {}},
            {"id": 2, "method": "account/rateLimits/read", "params": None},
        ]
        process.stdin.write("".join(json.dumps(item) + "\n" for item in messages))
        process.stdin.flush()
        response = responses.get(timeout=timeout)
        if "error" in response:
            raise RuntimeError("Codex rate limits unavailable")
        result = response.get("result")
        if not isinstance(result, dict):
            raise ValueError("Invalid Codex response")
        return result
    finally:
        try:
            process.kill()
        except OSError:
            pass
        try:
            process.wait(timeout=2)
        except (subprocess.TimeoutExpired, OSError):
            pass
        if process.stdin:
            try:
                process.stdin.close()
            except OSError:
                pass


def windows_from_response(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
    limits = payload.get("rateLimits") or payload.get("rate_limits") or {}
    windows = []
    for key, entry in limits.items():
        if not isinstance(entry, dict):
            continue
        duration = entry.get("windowDurationMins", entry.get("window_duration_mins"))
        try:
            duration = int(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration = None
        label = "5 hour" if duration == 300 else "7 day" if duration == 10080 else str(entry.get("name") or key).replace("_", " ").title()
        window = make_window(str(key), label, entry.get("usedPercent", entry.get("used_percent")),
                             entry.get("resetsAt", entry.get("resets_at")), duration,
                             kind_for(label, duration))
        if key not in ("primary", "secondary", "credits"):
            window.update(hidden_by_default=True, label="Extra window", raw_label=label)
        windows.append(window)
    return windows, limits.get("planType", limits.get("plan_type")) if isinstance(limits, dict) else None


def read(prev: dict[str, Any] | None = None) -> dict[str, Any]:
    if not detect():
        return provider_record("codex", "OpenAI Codex", state="NOT_INSTALLED", error="Codex CLI not detected")
    try:
        payload = _exchange()
        windows, plan = windows_from_response(payload)
        if not windows:
            return provider_record("codex", "OpenAI Codex", plan=plan, state="SCHEMA_CHANGED",
                                   source="app-server", error="No quota windows in app-server response")
        return provider_record("codex", "OpenAI Codex", plan=plan, state="OK", source="app-server",
                               captured_at=iso_now(), last_success_at=iso_now(), windows=windows)
    except Exception as exc:
        error = "Codex app-server unavailable" if isinstance(exc, (OSError, subprocess.SubprocessError, queue.Empty)) else "Codex app-server returned invalid data"
        if prev and prev.get("windows"):
            result = dict(prev)
            result.update(state="STALE", stale=True, error=error)
            return result
        return provider_record("codex", "OpenAI Codex", state="SOURCE_UNAVAILABLE", source="app-server", error=safe_error(error))
