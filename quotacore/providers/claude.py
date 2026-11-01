"""Claude Code usage reader: live OAuth endpoint, statusline, then local cache."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..paths import data_path
from ..schema import iso_now, provider_record
from .common import kind_for, make_window, safe_error, timestamp, read_response

LABEL = "Claude Code"
META = {"id": "claude", "label": LABEL, "category": "subscription", "auth": "local-file", "experimental": False, "docs_url": "https://docs.anthropic.com/"}
USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
MAX_OBSERVATION_AGE = 45 * 60
RETRY_AFTER: float | None = None


def detect() -> bool:
    return (Path.home() / ".claude").is_dir()


def _oauth() -> dict[str, Any]:
    try:
        data = json.loads((Path.home() / ".claude" / ".credentials.json").read_text(encoding="utf-8"))
        value = data.get("claudeAiOauth", {}) if isinstance(data, dict) else {}
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _live() -> tuple[dict[str, Any] | None, str | None, str | None]:
    global RETRY_AFTER
    RETRY_AFTER = None
    auth = _oauth()
    token = auth.get("accessToken")
    expiry = auth.get("expiresAt")
    if not isinstance(token, str) or not token or isinstance(expiry, (int, float)) and expiry / 1000 < time.time():
        return None, "AUTH_REQUIRED", "Claude credentials unavailable or expired"

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    request = urllib.request.Request(USAGE_URL, headers={
        "Authorization": "Bearer " + token,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "quotacore/0.1",
    })
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            parsed = json.loads(read_response(response).decode("utf-8"))
            return (parsed, None, None) if isinstance(parsed, dict) else (None, "SCHEMA_CHANGED", "Invalid usage response")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return None, "AUTH_REQUIRED", "Usage endpoint rejected credentials"
        if exc.code == 429:
            try:
                RETRY_AFTER = max(0.0, float(exc.headers.get("Retry-After", "0")))
            except (TypeError, ValueError):
                RETRY_AFTER = None
            detail = f"Usage endpoint rate limited the request; retry after {RETRY_AFTER:g} seconds" if RETRY_AFTER is not None else "Usage endpoint rate limited the request"
            return None, "RATE_LIMITED", detail
        return None, "SOURCE_UNAVAILABLE", f"Usage endpoint returned HTTP {exc.code}"
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None, "SOURCE_UNAVAILABLE", "Usage endpoint unavailable or returned invalid data"


def _usage_windows(data: dict[str, Any]) -> list[dict[str, Any]]:
    windows: list[dict[str, Any]] = []
    for key, entry in data.items():
        if not isinstance(entry, dict):
            continue
        pct = entry.get("utilization", entry.get("used_percentage"))
        pct_num = pct
        known = {"five_hour": "5 hour", "fiveHour": "5 hour", "seven_day": "7 day", "sevenDay": "7 day"}
        raw_label = key.replace("_", " ").title()
        is_extra = key not in known
        label = "Extra window" if is_extra else known[key]
        minutes = 300 if key in ("five_hour", "fiveHour") else 10080 if key in ("seven_day", "sevenDay") else None
        window = make_window(key, label, pct_num, entry.get("resets_at"), minutes, kind_for(label, minutes))
        if is_extra:
            window.update(hidden_by_default=True, raw_label=raw_label)
        windows.append(window)
    return windows


def _observation_paths() -> list[Path]:
    override = os.environ.get("QUOTACORE_CLAUDE_OBSERVATION")
    paths = [Path(override)] if override else []
    paths.append(data_path("claude-observation.json"))
    return paths


def _read_observation() -> tuple[dict[str, Any] | None, str | None]:
    for path in _observation_paths():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            epoch = float(data.get("epoch"))
            age = time.time() - epoch
            if age < 0 or age > MAX_OBSERVATION_AGE or not isinstance(data, dict):
                continue
            windows = []
            for key, label, minutes in (("five", "5 hour", 300), ("seven", "7 day", 10080)):
                pct = data.get(key)
                if isinstance(pct, (int, float)) and not isinstance(pct, bool) and 0 <= pct <= 100 and pct != 0:
                    windows.append(make_window(key, label, pct, data.get(key + "_reset"), minutes, kind_for(label, minutes)))
            if windows:
                return {"windows": windows, "captured_at": timestamp(epoch), "plan": None}, None
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return None, None


def _read_cache() -> tuple[dict[str, Any] | None, str | None]:
    try:
        data = json.loads((Path.home() / ".claude.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, None
    cached = data.get("cachedUsageUtilization") if isinstance(data, dict) else None
    if not isinstance(cached, dict):
        return None, None
    windows = _usage_windows(cached.get("utilization") or {})
    captured = timestamp(cached.get("fetchedAtMs") / 1000) if isinstance(cached.get("fetchedAtMs"), (int, float)) else None
    if not captured:
        return None, None
    try:
        age = datetime.now(timezone.utc).timestamp() - datetime.fromisoformat(captured).timestamp()
    except (ValueError, TypeError):
        return None, None
    if age < 0 or age > MAX_OBSERVATION_AGE:
        return None, None
    if windows:
        return {"windows": windows, "captured_at": captured, "plan": None}, "cache"
    return None, None


def _success(source: str, data: dict[str, Any], plan: str | None = None) -> dict[str, Any]:
    windows = data.get("windows") if source == "statusline" else _usage_windows(data)
    captured = data.get("captured_at") if source == "statusline" else iso_now()
    return provider_record("claude", LABEL, plan=plan, state="OK", source=source,
                           captured_at=captured, last_success_at=iso_now(), windows=windows)


def read(prev: dict[str, Any] | None = None) -> dict[str, Any]:
    if not detect():
        return provider_record("claude", LABEL, state="NOT_INSTALLED", error="Claude Code not detected")
    auth = _oauth()
    plan = auth.get("subscriptionType") if isinstance(auth.get("subscriptionType"), str) else None
    live, state, error = _live()
    if live is not None:
        windows = _usage_windows(live)
        if windows:
            return provider_record("claude", LABEL, plan=plan, state="OK", source="oauth-usage",
                                   captured_at=iso_now(), last_success_at=iso_now(), windows=windows)
        state, error = "SCHEMA_CHANGED", "Usage response contained no recognized quota windows"
    observation, _ = _read_observation()
    if observation:
        return _success("statusline", observation, plan)
    cache, cache_source = _read_cache()
    if cache and cache_source:
        return _success(cache_source, cache, plan)
    if prev and prev.get("windows"):
        result = dict(prev)
        result.update(state=(state if state in ("AUTH_REQUIRED", "RATE_LIMITED") else "STALE"),
                      stale=True, error=safe_error(error or "No current quota source available"))
        return result
    return provider_record("claude", LABEL, plan=plan, state=state or "SOURCE_UNAVAILABLE",
                           source=None, error=safe_error(error or "No quota source available"))
