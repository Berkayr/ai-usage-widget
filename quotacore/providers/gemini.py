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
from .common import kind_for, make_window, number, slugify, timestamp

META = {"id": "gemini", "label": "Google Gemini", "category": "subscription", "auth": "cli-login", "experimental": False, "docs_url": "https://github.com/google-gemini/gemini-cli"}


def _agy() -> str | None:
    found = shutil.which("agy")
    if found:
        return found
    if os.name == "nt":
        candidate = Path(os.environ.get("LOCALAPPDATA", "")) / "agy" / "bin" / "agy.exe"
        if candidate.is_file():
            return str(candidate)
    else:
        # Desktop launchers do not normally inherit the user's shell PATH.
        candidate = Path.home() / ".local" / "bin" / "agy"
        if candidate.is_file() and os.access(candidate, os.X_OK):
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


def _group_pool(group: dict[str, Any], group_index: int, buckets: list[Any],
                seen_pools: set[str]) -> tuple[str, dict[str, str]]:
    raw_name = group.get("name")
    has_name = isinstance(raw_name, str) and bool(raw_name.strip())
    group_name = raw_name.strip() if has_name else "Gemini"
    if group_index == 0:
        seen_pools.add("main")
        return group_name, {"id": "main", "label": group_name}
    first_bucket_id = next(
        (str(b.get("id")).strip() for b in buckets if isinstance(b, dict) and b.get("id")),
        "",
    )
    base = slugify(group_name, fallback="") if has_name else slugify(first_bucket_id, fallback="")
    if not base or base == "main":
        base = slugify(first_bucket_id, fallback="")
    if not base or base == "main":
        base = f"group-{group_index}"
    pool_id = base if base not in seen_pools else f"{base}-{group_index}"
    seen_pools.add(pool_id)
    return group_name, {"id": pool_id, "label": group_name}


def _pool_from_label(label: str, item: dict[str, Any], primary_group: str) -> dict[str, str]:
    raw_pool = item.get("pool")
    if isinstance(raw_pool, dict) and raw_pool.get("id") and raw_pool.get("label"):
        return {"id": str(raw_pool["id"]), "label": str(raw_pool["label"])}
    group_part = label.split(" · ", 1)[0].strip() if " · " in label else "Gemini"
    group_part = group_part or "Gemini"
    if not item.get("hidden_by_default") and group_part == primary_group:
        return {"id": "main", "label": group_part}
    pool_id = slugify(group_part, fallback="")
    if not pool_id or pool_id == "main":
        pool_id = slugify(item.get("id"), fallback="extra")
        if pool_id == "main":
            pool_id = "extra"
    return {"id": pool_id, "label": group_part}


def windows_from_usage(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
    if not isinstance(payload, dict):
        return [], None
    command = payload.get("command")
    data = command.get("data") if isinstance(command, dict) else None
    if not isinstance(data, dict):
        return [], None
    groups = data.get("groups")
    if not isinstance(groups, list):
        groups = []
    windows = []
    seen_pools: set[str] = set()
    for group_index, group in enumerate(groups):
        if not isinstance(group, dict):
            continue
        buckets = group.get("buckets") if isinstance(group.get("buckets"), list) else []
        group_name, pool = _group_pool(group, group_index, buckets, seen_pools)
        for bucket in buckets:
            if not isinstance(bucket, dict):
                continue
            fraction = number(bucket.get("remaining_fraction"))
            if fraction is None:
                continue
            win = bucket.get("window")
            minutes = _window_minutes(win)
            window_name = str(win or bucket.get("name") or bucket.get("id") or "Quota")
            label = f"{group_name} · {window_name}"
            bucket_id = str(bucket.get("id") or label)
            kind = "session" if isinstance(win, str) and win.lower() == "5h" else kind_for(label, minutes)
            window = make_window(bucket_id, label, (1.0 - fraction) * 100,
                                 bucket.get("reset_time"), minutes, kind, pool=pool)
            if group_index > 0:
                window["hidden_by_default"] = True
            windows.append(window)
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
        dict_items = [item for item in raw_windows if isinstance(item, dict)]
        first_visible = next((item for item in dict_items if not item.get("hidden_by_default")), dict_items[0] if dict_items else None)
        if first_visible is not None:
            first_label = str(first_visible.get("window") or first_visible.get("label") or first_visible.get("name") or first_visible.get("id") or "Quota")
            primary_group = first_label.split(" · ", 1)[0].strip() if " · " in first_label else "Gemini"
            primary_group = primary_group or "Gemini"
        else:
            primary_group = "Gemini"
        windows = []
        for item in dict_items:
            label = str(item.get("window") or item.get("label") or item.get("name") or item.get("id") or "Quota")
            pct = item.get("used_percent", item.get("usedPercent"))
            minutes = _window_minutes(item.get("window"))
            if minutes is None and isinstance(item.get("window_minutes"), int):
                minutes = item["window_minutes"]
            if pct is None and item.get("remaining_fraction") is not None:
                remaining = number(item.get("remaining_fraction"))
                pct = (1 - remaining) * 100 if remaining is not None else None
            pool = _pool_from_label(label, item, primary_group)
            window = make_window(str(item.get("id") or item.get("name") or label), label,
                                 pct, item.get("resets_at", item.get("reset_time")), minutes,
                                 item.get("kind") if item.get("kind") in ("session", "weekly", "model", "other") else kind_for(label, minutes),
                                 pool=pool)
            # Keep visibility metadata when re-reading a normalized record.
            if item.get("hidden_by_default"):
                window["hidden_by_default"] = True
            windows.append(window)
        plan = data.get("plan") if isinstance(data.get("plan"), str) else None
        captured = timestamp(data.get("checked_at") or data.get("captured_at")) or iso_now()
        source = data.get("source") if data.get("source") in ("agy-usage", "agy-statusline") else "agy-statusline"
    if not windows:
        return None
    # Visible windows first, then session before weekly, keeping the provider's order otherwise.
    rank = {"session": 0, "weekly": 1, "model": 2, "other": 3}
    windows.sort(key=lambda w: (bool(w.get("hidden_by_default")), rank.get(w.get("kind"), 3)))
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
        try:
            parsed = json.loads(result.stdout)
        except ValueError:
            parsed = None
        for line in ([] if isinstance(parsed, dict) else reversed(result.stdout.splitlines())):
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
