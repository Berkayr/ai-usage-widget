"""Best-effort statusline hooks that write atomic observation snapshots."""
from __future__ import annotations

import json
import os
import subprocess
import sys
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


def run_hook(provider: str, chain: str | None = None) -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
        result = _claude(payload) if provider == "claude" else _agy(payload)
        if result:
            atomic_json(data_path("claude-observation.json" if provider == "claude" else "gemini-kota.json"), result)
    except Exception:
        pass
    if chain:
        try:
            completed = subprocess.run(chain, input=(raw if "raw" in locals() else "").encode("utf-8"),
                                       shell=True, capture_output=True)
            if hasattr(sys.stdout, "buffer"):
                sys.stdout.buffer.write(completed.stdout)
                sys.stdout.buffer.flush()
            else:
                sys.stdout.write(completed.stdout.decode("utf-8", errors="replace"))
                sys.stdout.flush()
            return completed.returncode
        except Exception:
            return 0
    return 0
