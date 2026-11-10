"""OpenRouter API key spend cap and balance reader."""
from __future__ import annotations
from ..schema import iso_now, meter_record, provider_record
from .common import api_key, get_json, number

META = {"id": "openrouter", "label": "OpenRouter", "category": "api-balance", "auth": "api-key", "experimental": False, "docs_url": "https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key"}
URL = "https://openrouter.ai/api/v1/key"
CREDITS_URL = "https://openrouter.ai/api/v1/credits"

def detect() -> bool: return bool(api_key("openrouter", "OPENROUTER_API_KEY"))

def read(prev=None):
    key = api_key("openrouter", "OPENROUTER_API_KEY")
    if not key: return provider_record("openrouter", META["label"], state="AUTH_REQUIRED", error="API key not configured", category=META["category"], auth=META["auth"])
    data, state, error, retry = get_json(URL, key)
    if state == "RATE_LIMITED" and retry:
        error = error + "; Retry-After: " + str(retry)[:40]
    if state:
        if prev and prev.get("meters"):
            out = dict(prev); out.update(state=state, stale=True, error=error); return out
        return provider_record("openrouter", META["label"], state=state, error=error, category=META["category"], auth=META["auth"])
    value = data.get("data") if isinstance(data, dict) else None
    if not isinstance(value, dict) or not any(k in value for k in ("usage", "limit", "limit_remaining")):
        return provider_record("openrouter", META["label"], state="SCHEMA_CHANGED", error="Unexpected key usage response", category=META["category"], auth=META["auth"])
    used, limit, remaining = (number(value.get(k)) for k in ("usage", "limit", "limit_remaining"))
    meters = [meter_record("key-usage", "API key usage", "USD", used=used, limit=limit, remaining=remaining)] if any(v is not None for v in (used, limit, remaining)) else []
    credits, credits_state, _, _ = get_json(CREDITS_URL, key)
    credit_data = credits.get("data") if isinstance(credits, dict) else None
    if not credits_state and isinstance(credit_data, dict):
        total, spent = number(credit_data.get("total_credits")), number(credit_data.get("total_usage"))
        if total is not None and spent is not None:
            meters.append(meter_record("account-credits", "Account credits", "USD", used=spent, limit=total, remaining=max(0.0, total-spent)))
    return provider_record("openrouter", META["label"], error="No numeric balance values returned by key usage or account credits endpoints" if not meters else None, state="OK", source="api", captured_at=iso_now(), last_success_at=iso_now(), meters=meters, category=META["category"], auth=META["auth"])
