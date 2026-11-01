"""DeepSeek API balance reader."""
from ..schema import iso_now, meter_record, provider_record
from .common import api_key, get_json, number

META = {"id": "deepseek", "label": "DeepSeek API", "category": "api-balance", "auth": "api-key", "experimental": False, "docs_url": "https://api-docs.deepseek.com/api/get-user-balance/"}
URL = "https://api.deepseek.com/user/balance"

def detect() -> bool: return bool(api_key("deepseek", "DEEPSEEK_API_KEY"))

def read(prev=None):
    key = api_key("deepseek", "DEEPSEEK_API_KEY")
    if not key: return provider_record("deepseek", META["label"], state="AUTH_REQUIRED", error="API key not configured", category=META["category"], auth=META["auth"])
    data, state, error, retry = get_json(URL, key)
    if state == "RATE_LIMITED" and retry:
        error = error + "; Retry-After: " + str(retry)[:40]
    if state:
        if prev and prev.get("meters"):
            out = dict(prev); out.update(state=state, stale=True, error=error); return out
        return provider_record("deepseek", META["label"], state=state, error=error, category=META["category"], auth=META["auth"])
    entries = data.get("balance_infos") if isinstance(data, dict) else None
    if not isinstance(entries, list) or not entries:
        return provider_record("deepseek", META["label"], state="SCHEMA_CHANGED", error="Unexpected balance response", category=META["category"], auth=META["auth"])
    meters = []
    for index, item in enumerate(entries):
        if not isinstance(item, dict) or not isinstance(item.get("currency"), str) or not any(k in item for k in ("total_balance", "granted_balance", "topped_up_balance")):
            return provider_record("deepseek", META["label"], state="SCHEMA_CHANGED", error="Unexpected currency balance response", category=META["category"], auth=META["auth"])
        remaining = number(item.get("total_balance"))
        meters.append(meter_record("balance-" + item["currency"].lower() + "-" + str(index), item["currency"] + " balance", item["currency"], remaining=remaining))
    return provider_record("deepseek", META["label"], state="OK", source="api", captured_at=iso_now(), last_success_at=iso_now(), meters=meters, category=META["category"], auth=META["auth"])
