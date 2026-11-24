"""Claude Code usage reader: live OAuth endpoint, statusline, then local cache."""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..paths import data_path
from ..schema import iso_now, provider_record
from .common import NoRedirect, kind_for, make_window, number, read_response, safe_error, slugify, timestamp

LABEL = "Claude Code"
MAIN_POOL = {"id": "main", "label": "Claude"}
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


def _scope_name(scope: Any) -> str | None:
    if isinstance(scope, str) and scope.strip():
        return scope.strip()
    if not isinstance(scope, dict):
        return None
    for field in ("model", "surface"):
        sub = scope.get(field)
        if isinstance(sub, str) and sub.strip():
            return sub.strip()
        if isinstance(sub, dict):
            for key in ("display_name", "name", "id"):
                val = sub.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
    for key in ("display_name", "name", "id"):
        val = scope.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    for val in scope.values():
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, dict):
            for key in ("display_name", "name", "id"):
                nested = val.get(key)
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
    return None


def _parse_limits(raw_limits: Any) -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[dict[str, Any]], set[tuple[str, str]]]:
    fallback_session = None
    fallback_weekly = None
    scoped_windows: list[dict[str, Any]] = []
    covered_scoped: set[tuple[str, str]] = set()
    if not isinstance(raw_limits, list):
        return fallback_session, fallback_weekly, scoped_windows, covered_scoped
    for entry in raw_limits:
        if not isinstance(entry, dict):
            continue
        raw_kind = entry.get("kind")
        entry_kind = raw_kind.strip() if isinstance(raw_kind, str) and raw_kind.strip() else ""
        raw_group = entry.get("group")
        group = raw_group.strip().lower() if isinstance(raw_group, str) else ""
        pct = entry.get("percent", entry.get("utilization", entry.get("used_percentage")))
        resets_at = entry.get("resets_at")
        if entry_kind == "session":
            if fallback_session is None:
                fallback_session = make_window("five_hour", "5 hour", pct, resets_at, 300, "session", pool=MAIN_POOL)
            continue
        if entry_kind == "weekly_all":
            if fallback_weekly is None:
                fallback_weekly = make_window("seven_day", "7 day", pct, resets_at, 10080, "weekly", pool=MAIN_POOL)
            continue
        if not entry_kind and number(pct) is None:
            continue
        minutes = 300 if group == "session" else 10080 if group == "weekly" else None
        human_kind = (entry_kind or "limit").replace("_", " ").strip()
        kind_part = re.sub(r"[^a-z0-9_]+", "-", (entry_kind or "limit").lower()).strip("-_") or "limit"
        extracted = _scope_name(entry.get("scope"))
        if extracted is not None:
            display_name = extracted
            scope_slug = slugify(extracted, fallback=slugify(entry_kind, fallback="extra"))
        else:
            display_name = human_kind.title() or "Extra"
            scope_slug = slugify(entry_kind, fallback="extra")
        if group == "weekly":
            label = f"{display_name} · weekly"
        elif group == "session":
            label = f"{display_name} · session"
        else:
            label = f"{display_name} · {human_kind.lower()}" if extracted is not None else display_name
        window = make_window(
            f"limit-{kind_part}-{scope_slug}",
            label,
            pct,
            resets_at,
            minutes,
            kind_for(label, minutes),
            pool={"id": scope_slug, "label": display_name},
        )
        window["hidden_by_default"] = True
        scoped_windows.append(window)
        if group in ("weekly", "session"):
            covered_scoped.add((group, scope_slug))
    return fallback_session, fallback_weekly, scoped_windows, covered_scoped


def _usage_windows(data: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    fallback_session, fallback_weekly, scoped_windows, covered_scoped = _parse_limits(data.get("limits"))
    windows: list[dict[str, Any]] = []
    known = {"five_hour": "5 hour", "fiveHour": "5 hour", "seven_day": "7 day", "sevenDay": "7 day"}
    has_five = False
    has_seven = False
    for key, entry in data.items():
        if not isinstance(entry, dict):
            continue
        pct = entry.get("utilization", entry.get("used_percentage"))
        if key in known:
            minutes = 300 if key in ("five_hour", "fiveHour") else 10080
            label = known[key]
            windows.append(make_window(key, label, pct, entry.get("resets_at"), minutes,
                                       kind_for(label, minutes), pool=MAIN_POOL))
            if minutes == 300:
                has_five = True
            else:
                has_seven = True
            continue
        if key.startswith("seven_day_") and len(key) > len("seven_day_") and number(pct) is not None:
            suffix = key[len("seven_day_"):]
            slug = slugify(suffix, fallback="extra")
            if ("weekly", slug) in covered_scoped:
                continue
            name = suffix.replace("_", " ").strip().title()
            window = make_window(key, f"{name} · weekly", pct, entry.get("resets_at"), 10080,
                                 "weekly", pool={"id": slug, "label": name})
            window["hidden_by_default"] = True
            windows.append(window)
            continue
        if key.startswith("five_hour_") and len(key) > len("five_hour_") and number(pct) is not None:
            suffix = key[len("five_hour_"):]
            slug = slugify(suffix, fallback="extra")
            if ("session", slug) in covered_scoped:
                continue
            name = suffix.replace("_", " ").strip().title()
            window = make_window(key, f"{name} · session", pct, entry.get("resets_at"), 300,
                                 "session", pool={"id": slug, "label": name})
            window["hidden_by_default"] = True
            windows.append(window)
            continue
        raw_label = key.replace("_", " ").title()
        window = make_window(key, "Extra window", pct, entry.get("resets_at"), None,
                             kind_for("Extra window", None), pool=MAIN_POOL)
        window.update(hidden_by_default=True, raw_label=raw_label)
        windows.append(window)
    missing_main = []
    if not has_five and fallback_session is not None:
        missing_main.append(fallback_session)
    if not has_seven and fallback_weekly is not None:
        missing_main.append(fallback_weekly)
    return missing_main + windows + scoped_windows


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
                if isinstance(pct, (int, float)) and not isinstance(pct, bool) and 0 <= pct <= 100:
                    windows.append(make_window(key, label, pct, data.get(key + "_reset"), minutes,
                                               kind_for(label, minutes), pool=MAIN_POOL))
            if windows:
                return {"windows": windows, "captured_at": timestamp(epoch), "plan": None}, None
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return None, None


def _carry_scoped_windows(observation: dict[str, Any], prev: dict[str, Any] | None) -> dict[str, Any]:
    """Preserve unexpired scoped windows from prev when statusline only reports main windows."""
    if not isinstance(prev, dict) or not isinstance(prev.get("windows"), list):
        return observation
    now = datetime.now(timezone.utc)
    base = list(observation.get("windows") or [])
    seen_ids = {w.get("id") for w in base if isinstance(w, dict)}
    carried = []
    prev_captured = prev.get("captured_at")
    for window in prev["windows"]:
        if not isinstance(window, dict):
            continue
        pool = window.get("pool")
        is_scoped = (isinstance(pool, dict) and pool.get("id") and pool.get("id") != "main") or str(window.get("id") or "").startswith("limit-")
        if not is_scoped or window.get("id") in seen_ids:
            continue
        reset = timestamp(window.get("resets_at"))
        if not reset or datetime.fromisoformat(reset) <= now:
            continue
        item = dict(window)
        item["stale"] = True
        if prev_captured and "captured_at" not in item:
            item["captured_at"] = prev_captured
        carried.append(item)
    if not carried:
        return observation
    merged = dict(observation)
    merged["windows"] = base + carried
    return merged


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
    normalized = source in ("statusline", "cache")
    windows = data.get("windows") if normalized else _usage_windows(data)
    captured = data.get("captured_at") if normalized else iso_now()
    return provider_record("claude", LABEL, plan=plan, state="OK", source=source,
                           captured_at=captured, last_success_at=iso_now(), windows=windows)


def read(prev: dict[str, Any] | None = None) -> dict[str, Any]:
    history_enabled = False
    try:
        from ..paths import load_config
        history_enabled = load_config()["providers"].get("claude", {}).get("local_history") is True
    except Exception:  # noqa: BLE001, S110
        # History configuration failures must not interrupt quota collection.
        pass

    def with_history(record: dict[str, Any]) -> dict[str, Any]:
        if not history_enabled:
            record.pop("history", None)
            return record
        previous = (prev or {}).get("history")
        if isinstance(previous, dict):
            try:
                computed = datetime.fromisoformat(previous["computed_at"].replace("Z", "+00:00"))
                fresh = (datetime.now(timezone.utc) - computed.astimezone(timezone.utc)).total_seconds() < 1800
                # Hourly data belongs to one local day; recompute after midnight.
                if fresh and computed.astimezone().date() == datetime.now().astimezone().date():
                    record["history"] = previous
                    return record
            except (KeyError, ValueError, TypeError):
                pass
        # A stale summary copied from prev must not survive a failed recompute.
        record.pop("history", None)
        try:
            from ..local_history import claude_history
            history = claude_history()
            if history is not None:
                record["history"] = history
        except Exception:  # noqa: BLE001, S110
            # Local history failures must not interrupt quota collection.
            pass
        return record

    if not detect():
        return with_history(provider_record("claude", LABEL, state="NOT_INSTALLED", error="Claude Code not detected"))
    auth = _oauth()
    plan = auth.get("subscriptionType") if isinstance(auth.get("subscriptionType"), str) else None
    live, state, error = _live()
    if live is not None:
        windows = _usage_windows(live)
        if windows:
            return with_history(provider_record("claude", LABEL, plan=plan, state="OK", source="oauth-usage",
                                                captured_at=iso_now(), last_success_at=iso_now(), windows=windows))
        state, error = "SCHEMA_CHANGED", "Usage response contained no recognized quota windows"
    observation, _ = _read_observation()
    if observation:
        return with_history(_success("statusline", _carry_scoped_windows(observation, prev), plan))
    cache, cache_source = _read_cache()
    if cache and cache_source:
        return with_history(_success(cache_source, cache, plan))
    if prev and prev.get("windows"):
        result = dict(prev)
        result.update(state=(state if state in ("AUTH_REQUIRED", "RATE_LIMITED") else "STALE"),
                      stale=True, error=safe_error(error or "No current quota source available"))
        return with_history(result)
    return with_history(provider_record("claude", LABEL, plan=plan, state=state or "SOURCE_UNAVAILABLE",
                                        source=None, error=safe_error(error or "No quota source available")))
