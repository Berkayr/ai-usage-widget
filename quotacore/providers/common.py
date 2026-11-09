"""Shared provider parsing helpers."""
from __future__ import annotations

import math
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from ..schema import window_record
from ..paths import config_dir


def api_key(provider_id: str, env_name: str) -> str | None:
    value = os.environ.get(env_name)
    if value:
        return value.strip() or None
    try:
        data = json.loads((config_dir() / "secrets.json").read_text(encoding="utf-8"))
        value = data.get(provider_id) if isinstance(data, dict) else None
        return value.strip() if isinstance(value, str) and value.strip() else None
    except (OSError, ValueError):
        return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


MAX_HTTP_BYTES = 1024 * 1024


def read_response(response) -> bytes:
    value = response.read(MAX_HTTP_BYTES + 1)
    if len(value) > MAX_HTTP_BYTES:
        raise ValueError("Provider response exceeds 1 MiB")
    return value


def get_json(url: str, key: str, *, headers: dict[str, str] | None = None) -> tuple[Any, str | None, str | None, str | None]:
    request_headers = {"Authorization": "Bearer " + key, "Accept": "application/json", "User-Agent": "quotacore/0.2"}
    request_headers.update(headers or {})
    request = urllib.request.Request(url, headers=request_headers)
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            payload = json.loads(read_response(response).decode("utf-8"))
        return payload, None, None, None
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return None, "AUTH_REQUIRED", "Provider rejected credentials", None
        if exc.code == 429:
            retry = exc.headers.get("Retry-After") if exc.headers else None
            return None, "RATE_LIMITED", "Provider rate limited the request", retry
        return None, "SOURCE_UNAVAILABLE", f"Provider returned HTTP {exc.code}", None
    except (urllib.error.URLError, TimeoutError, OSError):
        return None, "SOURCE_UNAVAILABLE", "Provider request unavailable", None
    except (ValueError, UnicodeError):
        return None, "SCHEMA_CHANGED", "Provider returned invalid JSON", None


def timestamp(value: Any) -> str | None:
    try:
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, timezone.utc).isoformat()
        if isinstance(value, str) and value:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
    except (ValueError, OverflowError, OSError):
        pass
    return None


def number(value: Any) -> float | None:
    try:
        if isinstance(value, bool):
            return None
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def make_window(key: str, label: str, pct: Any, reset: Any = None, minutes: Any = None,
                kind: str = "other") -> dict[str, Any]:
    n = number(pct)
    try:
        mins = int(minutes) if minutes is not None else None
        if mins is not None and mins < 0:
            mins = None
    except (TypeError, ValueError):
        mins = None
    return window_record(key, label, max(0.0, min(100.0, n)) if n is not None else None,
                         timestamp(reset), mins, kind)


def kind_for(label: str, minutes: int | None = None) -> str:
    text = label.lower()
    if minutes and minutes >= 10080 or "week" in text or "7-day" in text or "weekly" in text:
        return "weekly"
    if "session" in text or minutes and minutes <= 360:
        return "session"
    if "model" in text:
        return "model"
    return "other"


def safe_error(message: str | None) -> str | None:
    if not message:
        return None
    return " ".join(str(message).replace("\n", " ").split())[:180]


def estimate_expired_windows(record: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    """Mark expired cached quota windows as estimated zero on stale records."""
    now = now or datetime.now(timezone.utc)
    result = dict(record)
    windows = []
    for window in record.get("windows", []):
        item = dict(window)
        reset = timestamp(item.get("resets_at"))
        if reset:
            parsed = datetime.fromisoformat(reset)
            if parsed < now:
                item["used_percent"] = 0.0
                item["estimated"] = True
        windows.append(item)
    result["windows"] = windows
    return result
