"""Schema v1 for normalized quota snapshots.

Snapshots contain a generation timestamp and ordered provider records. A
provider describes where and when its quota was measured, its freshness and
availability state, and every quota window returned by that provider. Unknown
usage percentages stay null; they are never represented as zero.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

SCHEMA_VERSION = 1
STATES = {"OK", "STALE", "AUTH_REQUIRED", "RATE_LIMITED", "SOURCE_UNAVAILABLE", "NOT_INSTALLED", "SCHEMA_CHANGED", "DISABLED", "NO_SUBSCRIPTION"}
PROVIDER_IDS = {"claude", "codex", "gemini"}


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def provider_record(provider_id: str, label: str, *, plan: str | None = None,
                    state: str = "SOURCE_UNAVAILABLE", source: str | None = None,
                    captured_at: str | None = None, last_success_at: str | None = None,
                    stale: bool = False, error: str | None = None,
                    windows: list[dict[str, Any]] | None = None,
                    category: str | None = None, meters: list[dict[str, Any]] | None = None,
                    experimental: bool = False, auth: str | None = None) -> dict[str, Any]:
    defaults = {"claude": ("subscription", "local-file"), "codex": ("subscription", "cli-login"),
                "gemini": ("subscription", "cli-login"), "copilot": ("credits", "cli-login"),
                "openrouter": ("api-balance", "api-key"), "deepseek": ("api-balance", "api-key"),
                "jetbrains": ("credits", "local-file")}
    default_category, default_auth = defaults.get(provider_id, ("subscription", "none"))
    return {"id": provider_id, "label": label, "plan": plan, "state": state,
            "source": source, "captured_at": captured_at, "last_success_at": last_success_at,
            "stale": stale, "error": error, "windows": windows or [], "category": category or default_category,
            "meters": meters or [], "experimental": experimental, "auth": auth or default_auth}


def meter_record(meter_id: str, label: str, unit: str, *, used: float | None = None,
                 limit: float | None = None, remaining: float | None = None,
                 resets_at: str | None = None) -> dict[str, Any]:
    return {"id": str(meter_id), "label": label, "unit": unit, "used": used,
            "limit": limit, "remaining": remaining, "resets_at": resets_at}


def window_record(window_id: str, label: str, used_percent: float | None,
                  resets_at: str | None = None, window_minutes: int | None = None,
                  kind: str = "other") -> dict[str, Any]:
    if used_percent is not None:
        used_percent = max(0.0, min(100.0, float(used_percent)))
    return {"id": str(window_id), "label": label, "used_percent": used_percent,
            "resets_at": resets_at, "window_minutes": window_minutes, "kind": kind}


def snapshot(providers: list[dict[str, Any]]) -> dict[str, Any]:
    return {"schema": SCHEMA_VERSION, "generated_at": iso_now(), "providers": providers}
