"""Moonshot / Kimi API balance reader."""

from ..schema import iso_now, meter_record, provider_record
from .common import api_key, get_json, number

META = {
    "id": "moonshot",
    "label": "Moonshot / Kimi",
    "category": "api-balance",
    "auth": "api-key",
    "experimental": True,
    "docs_url": "https://platform.moonshot.ai/docs/api/",
}
URL = "https://api.moonshot.ai/v1/users/me/balance"


def detect():
    return bool(api_key("moonshot", "MOONSHOT_API_KEY"))


def read(prev=None):
    key = api_key("moonshot", "MOONSHOT_API_KEY")
    if not key:
        return provider_record(
            "moonshot",
            META["label"],
            state="AUTH_REQUIRED",
            error="API key not configured",
            category=META["category"],
            auth=META["auth"],
            experimental=True,
        )
    d, s, e, _ = get_json(URL, key)
    if s:
        if prev and prev.get("meters"):
            o = dict(prev)
            o.update(state=s, stale=True, error=e)
            return o
        return provider_record(
            "moonshot",
            META["label"],
            state=s,
            error=e,
            category=META["category"],
            auth=META["auth"],
            experimental=True,
        )
    x = d.get("data") if isinstance(d, dict) else None
    n = number(x.get("available_balance")) if isinstance(x, dict) else None
    if n is None:
        return provider_record(
            "moonshot",
            META["label"],
            state="SCHEMA_CHANGED",
            error="Unexpected balance response",
            category=META["category"],
            auth=META["auth"],
            experimental=True,
        )
    return provider_record(
        "moonshot",
        META["label"],
        state="OK",
        source="api",
        captured_at=iso_now(),
        last_success_at=iso_now(),
        meters=[meter_record("balance", "Available balance", "USD", remaining=n)],
        category=META["category"],
        auth=META["auth"],
        experimental=True,
    )
