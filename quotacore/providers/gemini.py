"""Gemini quota reader. Passive reads never start agy."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..paths import data_path
from ..schema import iso_now, provider_record
from .common import kind_for, make_window, number, safe_error, timestamp

META = {"id": "gemini", "label": "Google Gemini", "category": "subscription", "auth": "cli-login", "experimental": False, "docs_url": "https://github.com/google-gemini/gemini-cli"}


def _agy() -> str | None:
    found = shutil.which("agy")
    if found:
        return found
    if os.name == "nt":
        candidate = Path(os.environ.get("LOCALAPPDATA", "")) / "agy" / "bin" / "agy.exe"
        if candidate.is_file():
            return str(candidate)
    return None


def detect() -> bool:
    return _agy() is not None


def snapshot_path() -> Path:
    override = os.environ.get("QUOTACORE_GEMINI_SNAPSHOT")
    return Path(override) if override else data_path("gemini-kota.json")


def _window_minutes(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    try:
        if text.endswith("h"):
            return int(float(text[:-1]) * 60)
        if text.endswith("m"):
            return int(float(text[:-1]))
        if text.endswith("d"):
            return int(float(text[:-1]) * 1440)
        if text.endswith("w"):
            return int(float(text[:-1]) * 10080)
    except ValueError:
        return None
    return None


def windows_from_usage(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
    command = payload.get("command") or {}
    data = command.get("data") or {}
    groups = data.get("groups") or []
    windows = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        for bucket in group.get("buckets") or []:
            if not isinstance(bucket, dict):
                continue
            fraction = number(bucket.get("remaining_fraction"))
            if fraction is None:
                continue
            win = bucket.get("window")
            minutes = _window_minutes(win)
            group_name = str(group.get("name") or "Gemini")
            window_name = str(win or bucket.get("name") or bucket.get("id") or "Quota")
            label = f"{group_name} · {window_name}"
            bucket_id = str(bucket.get("id") or label)
            kind = "session" if isinstance(win, str) and win.lower() == "5h" else kind_for(label, minutes)
            windows.append(make_window(bucket_id, label, (1.0 - fraction) * 100,
                                       bucket.get("reset_time"), minutes, kind))
    plan = data.get("plan_tier") or data.get("plan")
    return windows, plan if isinstance(plan, str) else None


def read_snapshot() -> dict[str, Any] | None:
    try:
        data = json.loads(snapshot_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    # Accept normalized hook records and agy's raw /usage response.
    if isinstance(data.get("command"), dict):
        windows, plan = windows_from_usage(data)
        captured = timestamp(data.get("checked_at")) or iso_now()
        source = "agy-usage"
    else:
        raw_windows = data.get("windows")
        if not isinstance(raw_windows, list):
            return None
        windows = []
        for item in raw_windows:
            if not isinstance(item, dict):
                continue
            label = str(item.get("window") or item.get("label") or item.get("name") or item.get("id") or "Quota")
            pct = item.get("used_percent", item.get("usedPercent"))
            minutes = _window_minutes(item.get("window"))
            if pct is None and item.get("remaining_fraction") is not None:
                remaining = number(item.get("remaining_fraction"))
                pct = (1 - remaining) * 100 if remaining is not None else None
            windows.append(make_window(str(item.get("id") or item.get("name") or label), label,
                                       pct, item.get("resets_at", item.get("reset_time")), minutes,
                                       item.get("kind") if item.get("kind") in ("session", "weekly", "model", "other") else kind_for(label, minutes)))
        plan = data.get("plan") if isinstance(data.get("plan"), str) else None
        captured = timestamp(data.get("checked_at") or data.get("captured_at")) or iso_now()
        source = data.get("source") if data.get("source") in ("agy-usage", "agy-statusline") else "agy-statusline"
    if not windows:
        return None
    try:
        age = datetime.now(timezone.utc).timestamp() - datetime.fromisoformat(captured).timestamp()
    except (ValueError, TypeError):
        age = float("inf")
    if age < 0 or age > 7 * 24 * 60 * 60:
        return None
    return provider_record("gemini", "Google Gemini", plan=plan, state="OK", source=source,
                           captured_at=captured, last_success_at=captured, windows=windows)


def read(prev: dict[str, Any] | None = None) -> dict[str, Any]:
    if not detect():
        return provider_record("gemini", "Google Gemini", state="NOT_INSTALLED", error="agy not detected")
    value = read_snapshot()
    if value:
        return value
    if prev and prev.get("windows"):
        result = dict(prev)
        result.update(state="STALE", stale=True, error="No recent agy snapshot available")
        return result
    return provider_record("gemini", "Google Gemini", state="SOURCE_UNAVAILABLE",
                           error="No recent agy snapshot available")


def refresh_gemini(timeout: float = 45.0) -> int:
    executable = _agy()
    if not executable:
        return 1
    env = dict(os.environ)
    if os.name != "nt":
        env["BROWSER"] = "true"
    try:
        result = subprocess.run([executable, "-p", "/usage", "--output-format", "json"],
                                stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", env=env, timeout=timeout,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode != 0:
            return result.returncode or 1
        parsed = None
        for line in reversed(result.stdout.splitlines()):
            if line.lstrip().startswith("{"):
                try:
                    parsed = json.loads(line)
                    break
                except ValueError:
                    continue
        if not isinstance(parsed, dict):
            return 1
        windows, plan = windows_from_usage(parsed)
        if not windows:
            return 1
        snapshot_path().parent.mkdir(parents=True, exist_ok=True)
        from ..paths import atomic_json
        atomic_json(snapshot_path(), {"checked_at": iso_now(), "plan": plan, "windows": windows, "source": "agy-usage"})
        return 0
    except (OSError, subprocess.SubprocessError, ValueError):
        return 1
