"""Codex app-server quota reader using JSON-RPC only (no model requests)."""
from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
from datetime import date
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


def _exchange(timeout: float = 20.0) -> tuple[dict[str, Any], Any | None]:
    process = subprocess.Popen(_command(_executable() or "codex"), stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               text=True, encoding="utf-8", errors="replace", bufsize=1,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    responses: queue.Queue[dict[str, Any] | None] = queue.Queue()

    def reader() -> None:
        try:
            for line in process.stdout:
                try:
                    message = json.loads(line)
                    if isinstance(message, dict) and message.get("id") in (2, 3):
                        responses.put(message)
                except ValueError:
                    continue
        except (OSError, ValueError):
            pass
        finally:
            responses.put(None)

    thread = threading.Thread(target=reader, daemon=True)
    try:
        thread.start()
        messages = [
            {"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "quotacore", "version": "1"}}},
            {"method": "initialized", "params": {}},
            {"id": 2, "method": "account/rateLimits/read", "params": None},
            {"id": 3, "method": "account/usage/read", "params": None},
        ]
        process.stdin.write("".join(json.dumps(item) + "\n" for item in messages))
        process.stdin.flush()
        # app-server may answer the two reads in either order.
        received: dict[int, dict[str, Any]] = {}
        while 2 not in received:
            message = responses.get(timeout=timeout)
            if message is None:
                raise RuntimeError("Codex rate limits unavailable")
            received[message["id"]] = message
        response = received[2]
        if "error" in response:
            raise RuntimeError("Codex rate limits unavailable")
        result = response.get("result")
        if not isinstance(result, dict):
            raise ValueError("Invalid Codex response")
        try:
            while 3 not in received:
                message = responses.get(timeout=5)
                if message is None:
                    break
                received[message["id"]] = message
        except queue.Empty:
            pass
        history_response = received.get(3)
        history_payload = history_response.get("result") if history_response and "error" not in history_response else None
        return result, history_payload
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


def history_from_usage(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    raw_summary = payload.get("summary")
    fields = {
        "lifetime_tokens": "lifetimeTokens",
        "peak_daily_tokens": "peakDailyTokens",
        "current_streak_days": "currentStreakDays",
        "longest_streak_days": "longestStreakDays",
    }
    summary = {}
    if isinstance(raw_summary, dict):
        for key, source in fields.items():
            value = raw_summary.get(source)
            summary[key] = value if isinstance(value, int) and not isinstance(value, bool) else None
    else:
        summary = {key: None for key in fields}

    buckets = payload.get("dailyUsageBuckets")
    daily = []
    if isinstance(buckets, list):
        for bucket in buckets:
            if not isinstance(bucket, dict):
                continue
            day, tokens = bucket.get("startDate"), bucket.get("tokens")
            try:
                if not isinstance(day, str) or date.fromisoformat(day).isoformat() != day:
                    continue
            except ValueError:
                continue
            if not isinstance(tokens, int) or isinstance(tokens, bool) or tokens < 0:
                continue
            daily.append({"date": day, "tokens": tokens})
    daily = daily[-30:]
    if not daily and all(value is None for value in summary.values()):
        return None
    return {"scope": "account", "source": "app-server", "unit": "tokens",
            "summary": summary, "daily": daily}


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
        payload, usage = _exchange()
        windows, plan = windows_from_response(payload)
        if not windows:
            return provider_record("codex", "OpenAI Codex", plan=plan, state="SCHEMA_CHANGED",
                                   source="app-server", error="No quota windows in app-server response")
        record = provider_record("codex", "OpenAI Codex", plan=plan, state="OK", source="app-server",
                                 captured_at=iso_now(), last_success_at=iso_now(), windows=windows)
        history = history_from_usage(usage)
        if history is not None:
            record["history"] = history
        return record
    except Exception as exc:
        error = "Codex app-server unavailable" if isinstance(exc, (OSError, subprocess.SubprocessError, queue.Empty)) else "Codex app-server returned invalid data"
        if prev and prev.get("windows"):
            result = dict(prev)
            result.update(state="STALE", stale=True, error=error)
            return result
        return provider_record("codex", "OpenAI Codex", state="SOURCE_UNAVAILABLE", source="app-server", error=safe_error(error))
