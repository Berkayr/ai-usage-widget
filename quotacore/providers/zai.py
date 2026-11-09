"""Z.ai GLM Coding Plan quota reader."""

from ..schema import iso_now, provider_record
from .common import api_key, get_json, kind_for, number, timestamp

META = {
    "id": "zai",
    "label": "Z.ai GLM Coding Plan",
    "category": "subscription",
    "auth": "api-key",
    "experimental": True,
    "docs_url": "https://api.z.ai/",
}
URL = "https://api.z.ai/api/monitor/usage/quota/limit"


def detect():
    return bool(api_key("zai", "ZAI_API_KEY"))


def read(prev=None):
    key = api_key("zai", "ZAI_API_KEY")
    if not key:
        return provider_record(
            "zai",
            META["label"],
            state="AUTH_REQUIRED",
            error="API key not configured",
            experimental=True,
            category=META["category"],
            auth=META["auth"],
        )
    data, state, error, _retry = get_json(URL, key)
    if state:
        if prev and prev.get("windows"):
            out = dict(prev)
            out.update(state=state, stale=True, error=error)
            return out
        return provider_record(
            "zai",
            META["label"],
            state=state,
            error=error,
            experimental=True,
            category=META["category"],
            auth=META["auth"],
        )
    if isinstance(data, dict) and data.get("success") is False:
        code = data.get("code")
        state = "AUTH_REQUIRED" if code in (401, 403) else "SOURCE_UNAVAILABLE"
        if prev and prev.get("windows"):
            out = dict(prev)
            out.update(state=state, stale=True, error="Provider rejected the request")
            return out
        return provider_record(
            "zai",
            META["label"],
            state=state,
            error="Provider rejected the request",
            experimental=True,
            category=META["category"],
            auth=META["auth"],
        )
    d = data.get("data") if isinstance(data, dict) else None
    limits = d.get("limits") if isinstance(d, dict) else None
    if not isinstance(limits, list):
        return provider_record(
            "zai",
            META["label"],
            state="SCHEMA_CHANGED",
            error="Unexpected quota response",
            experimental=True,
            category=META["category"],
            auth=META["auth"],
        )
    windows = []
    for item in limits:
        if not isinstance(item, dict):
            continue
        kind = item.get("type", "limit")
        pct = number(item.get("percentage"))
        if pct is None:
            total, used = number(item.get("usage")), number(item.get("currentValue"))
            if total and used is not None:
                pct = used / total * 100
        if pct is None:
            continue
        label = (
            "5-hour session"
            if kind == "TOKENS_LIMIT"
            else "Tool calls (monthly)"
            if kind == "TIME_LIMIT"
            else str(kind)
        )
        minutes = 300 if kind == "TOKENS_LIMIT" else None
        windows.append(
            {
                "id": "session" if minutes else str(kind).lower(),
                "label": label,
                "used_percent": max(0, min(100, pct)),
                "resets_at": timestamp(
                    item.get("nextResetTime") / 1000
                    if isinstance(item.get("nextResetTime"), (int, float))
                    and item.get("nextResetTime") > 100000000000
                    else item.get("nextResetTime")
                ),
                "window_minutes": minutes,
                "kind": kind_for(label, minutes),
            }
        )
    if not windows:
        return provider_record(
            "zai",
            META["label"],
            state="SCHEMA_CHANGED",
            error="No recognized quota windows",
            experimental=True,
            category=META["category"],
            auth=META["auth"],
        )
    return provider_record(
        "zai",
        META["label"],
        state="OK",
        source="api",
        captured_at=iso_now(),
        last_success_at=iso_now(),
        windows=windows,
        experimental=True,
        category=META["category"],
        auth=META["auth"],
    )
