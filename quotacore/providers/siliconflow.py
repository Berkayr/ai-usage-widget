"""SiliconFlow API balance reader."""

from ..schema import iso_now, meter_record, provider_record
from .common import api_key, get_json, number

META = {
    "id": "siliconflow",
    "label": "SiliconFlow",
    "category": "api-balance",
    "auth": "api-key",
    "experimental": True,
    "docs_url": "https://docs.siliconflow.cn/",
}
URL = "https://api.siliconflow.cn/v1/user/info"


def detect():
    return bool(api_key("siliconflow", "SILICONFLOW_API_KEY"))


def read(prev=None):
    key = api_key("siliconflow", "SILICONFLOW_API_KEY")
    if not key:
        return provider_record(
            "siliconflow",
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
            "siliconflow",
            META["label"],
            state=s,
            error=e,
            category=META["category"],
            auth=META["auth"],
            experimental=True,
        )
    x = d.get("data") if isinstance(d, dict) else None
    n = number(x.get("totalBalance", x.get("balance"))) if isinstance(x, dict) else None
    if isinstance(d, dict) and d.get("code") not in (None, 0, 20000):
        n = None
    if n is None:
        return provider_record(
            "siliconflow",
            META["label"],
            state="SCHEMA_CHANGED",
            error="Unexpected balance response",
            category=META["category"],
            auth=META["auth"],
            experimental=True,
        )
    return provider_record(
        "siliconflow",
        META["label"],
        state="OK",
        source="api",
        captured_at=iso_now(),
        last_success_at=iso_now(),
        meters=[meter_record("balance", "Total balance", "CNY", remaining=n)],
        category=META["category"],
        auth=META["auth"],
        experimental=True,
    )
