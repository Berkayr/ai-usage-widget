"""Quota pacing calculations and compact persistence helpers."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

DEFAULT_CEILINGS = {"codex": 90.0, "gemini": 100.0, "claude": 90.0}


def _date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except (ValueError, TypeError):
        return None


def window_length(window: dict[str, Any]) -> int | None:
    length = window.get("window_minutes")
    if isinstance(length, (int, float)) and length > 0:
        return int(length)
    hint = " ".join(str(window.get(k, "")) for k in ("kind", "id", "label")).lower()
    if "session" in hint or "5h" in hint or "five_hour" in hint:
        return 300
    if "weekly" in hint or "week" in hint or "7d" in hint or "seven_day" in hint:
        return 10080
    return None


def _age_minutes(provider: dict[str, Any], now: datetime) -> float | None:
    stamp = _date(provider.get("captured_at")) or _date(provider.get("last_success_at"))
    if stamp is None:
        return None
    return max(0.0, (now - stamp).total_seconds() / 60)


def calculate_pace(snapshot: dict[str, Any], *, now: datetime | None = None,
                   ceilings: dict[str, float] | None = None,
                   previous_profiles: dict[str, str] | None = None,
                   max_age_minutes: float = 30) -> dict[str, Any]:
    """Build a pacing report. Pure apart from the supplied snapshot and clock."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    ceilings = ceilings or {}
    previous_profiles = previous_profiles or {}
    output = []
    for provider in snapshot.get("providers", []):
        if not isinstance(provider, dict):
            continue
        pid = str(provider.get("id", "unknown"))
        age = _age_minutes(provider, now)
        stale = bool(provider.get("stale") or provider.get("error") or provider.get("state") != "OK")
        hard_unknown = provider.get("state") in {"AUTH_REQUIRED", "NO_SUBSCRIPTION", "DISABLED", "NOT_INSTALLED"}
        stale_usable = stale and not hard_unknown and age is not None and age <= max_age_minutes
        windows = []
        for source in provider.get("windows", []):
            if not isinstance(source, dict) or source.get("hidden_by_default"):
                continue
            used = source.get("used_percent")
            reset = _date(source.get("resets_at"))
            if used is None or reset is None:
                continue
            try:
                used = float(used)
            except (TypeError, ValueError):
                continue
            length = window_length(source)
            rolled = bool(reset < now)
            if rolled and length is not None:
                periods = int((now - reset).total_seconds() // (length * 60)) + 1
                reset = reset.fromtimestamp(reset.timestamp() + periods * length * 60, tz=reset.tzinfo)
                used = 0.0
            common = {"id": source.get("id"), "label": source.get("label"), "kind": source.get("kind"),
                      "used": used, "resets_at": reset.isoformat()}
            if length is None:
                windows.append({**common, "status": "unknown"})
                continue
            elapsed = max(0.0, min(1.0, 1 - max(0.0, (reset - now).total_seconds() / 60) / length))
            ceiling = float(ceilings.get(pid, DEFAULT_CEILINGS.get(pid, 90.0)))
            expected = ceiling * elapsed
            projected = min(100.0, used / max(elapsed, 0.05))
            windows.append({**common, "status": "known", "window_minutes": length, **({"rolled": True} if rolled else {}),
                            "used": round(used, 2), "elapsed": round(elapsed, 4),
                            "gap": round(expected - used, 2), "hours_left": round(max(0, (reset-now).total_seconds()) / 3600, 2),
                            "projected_unused": round(max(0.0, ceiling - projected), 2), "ceiling": ceiling})
        if not windows:
            continue
        bad_state = hard_unknown or (stale and not stale_usable)
        valid = [w for w in windows if w["status"] == "known"]
        if bad_state:
            profile = "UNKNOWN"
        elif not valid:
            profile = "UNKNOWN"
        else:
            short = [w for w in valid if w["window_minutes"] <= 300]
            weekly = [w for w in valid if w["window_minutes"] >= 10000]
            if any(w["used"] >= 85 for w in short) or any(w["gap"] <= -10 for w in weekly):
                profile = "SAVE"
            elif any(w["elapsed"] >= .85 and w["ceiling"] - w["used"] >= 10 for w in weekly) and not any(w["used"] >= 85 for w in short):
                profile = "LAST_CALL"
            elif any(w["gap"] >= 15 for w in weekly):
                profile = "SPARE"
            elif previous_profiles.get(pid) == "SPARE" and any(w["gap"] >= 5 for w in weekly):
                profile = "SPARE"
            else:
                profile = "NORMAL"
        item = {"id": pid, "label": provider.get("label", pid), "profile": profile, "windows": windows}
        if stale_usable:
            item.update(stale=True, age_minutes=round(age, 2))
        output.append(item)
    return {"generated_at": now.astimezone(timezone.utc).isoformat(), "providers": output}


def reset_events(current: dict[str, Any], previous: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Detect reset timestamps moving forward since the prior run."""
    if not previous:
        return []
    old = {}
    for provider in previous.get("providers", []):
        for window in provider.get("windows", []):
            old[(provider.get("id"), window.get("id"))] = window
    events = []
    for provider in current.get("providers", []):
        for window in provider.get("windows", []):
            prior = old.get((provider.get("id"), window.get("id")))
            old_reset, new_reset = _date(prior.get("resets_at")) if prior else None, _date(window.get("resets_at"))
            if prior and old_reset and new_reset and new_reset > old_reset:
                events.append({"event": "reset", "provider": provider["id"], "window": window.get("id"),
                               "last_used_percent": prior.get("used"),
                               "unused": round(float(prior.get("ceiling", 90)) - float(prior.get("used", 0)), 2),
                               "resets_at": prior.get("resets_at")})
    return events
