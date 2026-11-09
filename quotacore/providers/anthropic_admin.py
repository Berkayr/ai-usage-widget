"""Anthropic organization monthly spend; requires an administrator API key."""

from datetime import datetime, timezone
from urllib.parse import urlencode

from ..schema import iso_now, meter_record, provider_record
from .common import api_key, get_json, number

META = {
    "id": "anthropic_admin",
    "label": "Anthropic API spend",
    "category": "api-balance",
    "auth": "api-key",
    "experimental": True,
    "docs_url": "https://docs.anthropic.com/en/api/admin/cost_report",
}
BASE = "https://api.anthropic.com/v1/organizations/cost_report"


def detect():
    return bool(api_key("anthropic_admin", "ANTHROPIC_ADMIN_KEY"))


def read(prev=None):
    key = api_key("anthropic_admin", "ANTHROPIC_ADMIN_KEY")
    if not key:
        return provider_record(
            "anthropic_admin",
            META["label"],
            state="AUTH_REQUIRED",
            error="API key not configured",
            category=META["category"],
            auth=META["auth"],
            experimental=True,
        )
    start = (
        datetime.now(timezone.utc)
        .replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    total = 0.0
    page = None
    for _ in range(5):
        q = {"starting_at": start, "bucket_width": "1d", "limit": 31}
        if page:
            q["page"] = page
        d, s, e, _ = get_json(
            BASE + "?" + urlencode(q),
            key,
            headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
        )
        if s:
            if prev and prev.get("meters"):
                o = dict(prev)
                o.update(state=s, stale=True, error=e)
                return o
            return provider_record(
                "anthropic_admin",
                META["label"],
                state=s,
                error=e,
                category=META["category"],
                auth=META["auth"],
                experimental=True,
            )
        buckets = d.get("data") if isinstance(d, dict) else None
        if not isinstance(buckets, list):
            return provider_record(
                "anthropic_admin",
                META["label"],
                state="SCHEMA_CHANGED",
                error="Unexpected cost report response",
                category=META["category"],
                auth=META["auth"],
                experimental=True,
            )
        try:
            total += (
                sum(
                    (number(row.get("amount")) or 0)
                    for b in buckets
                    if isinstance(b, dict)
                    for row in b.get("results", [])
                    if isinstance(row, dict)
                )
                / 100
            )
        except (AttributeError, TypeError):
            return provider_record(
                "anthropic_admin",
                META["label"],
                state="SCHEMA_CHANGED",
                error="Unexpected cost report response",
                category=META["category"],
                auth=META["auth"],
                experimental=True,
            )
        page = d.get("next_page")
        if d.get("has_more") is not True or not page:
            break
    return provider_record(
        "anthropic_admin",
        META["label"],
        state="OK",
        source="api",
        captured_at=iso_now(),
        last_success_at=iso_now(),
        meters=[meter_record("month-spend", "This month", "USD", used=total)],
        category=META["category"],
        auth=META["auth"],
        experimental=True,
    )
