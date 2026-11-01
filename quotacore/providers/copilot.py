"""GitHub Copilot quota reader using the existing gh login."""
import json
import shutil
import subprocess
from ..schema import iso_now, meter_record, provider_record
from .common import get_json, number, make_window

META = {"id": "copilot", "label": "GitHub Copilot", "category": "credits", "auth": "cli-login", "experimental": True, "docs_url": "https://github.com/settings/copilot"}
URL = "https://api.github.com/copilot_internal/user"

def _gh(): return shutil.which("gh")
def detect(): return _gh() is not None

def read(prev=None):
    exe = _gh()
    if not exe: return provider_record("copilot", META["label"], state="NOT_INSTALLED", error="GitHub CLI not detected", category=META["category"], auth=META["auth"], experimental=True)
    try:
        token_result = subprocess.run([exe, "auth", "token"], capture_output=True, text=True, encoding="utf-8", timeout=10, check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        token = token_result.stdout.strip() if token_result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError): token = ""
    if not token: return provider_record("copilot", META["label"], state="AUTH_REQUIRED", error="GitHub CLI login required", category=META["category"], auth=META["auth"], experimental=True)
    data, state, error, retry = get_json(URL, token)
    if state == "RATE_LIMITED" and retry:
        error = error + "; Retry-After: " + str(retry)[:40]
    if state:
        if prev and (prev.get("windows") or prev.get("meters")):
            out = dict(prev); out.update(state=state, stale=True, error=error); return out
        return provider_record("copilot", META["label"], state=state, error=error, category=META["category"], auth=META["auth"], experimental=True)
    if not isinstance(data, dict):
        return provider_record("copilot", META["label"], state="SCHEMA_CHANGED", error="Unexpected Copilot quota response", category=META["category"], auth=META["auth"], experimental=True)
    # The live API uses snake_case; some clients document camelCase. Accept both.
    quota = data.get("quota_snapshots", data.get("quotaSnapshots"))
    if not isinstance(quota, dict):
        if "copilot_plan" in data or "copilotPlan" in data or "login" in data:
            # A valid account response without quota snapshots: no active Copilot plan.
            return provider_record("copilot", META["label"], state="NO_SUBSCRIPTION", source="copilot-usage", error="No Copilot quota on this account", category=META["category"], auth=META["auth"], experimental=True)
        return provider_record("copilot", META["label"], state="SCHEMA_CHANGED", error="Unexpected Copilot quota response", category=META["category"], auth=META["auth"], experimental=True)
    windows, meters = [], []
    for keys, label in ((("premium_interactions", "premiumInteractions"), "Premium interactions"), (("chat",), "Chat")):
        key = keys[0]
        item = next((quota[k] for k in keys if isinstance(quota.get(k), dict)), None)
        if not isinstance(item, dict): continue
        remaining = number(item.get("percent_remaining"))
        if remaining is None and isinstance(item.get("percentRemaining"), (int, float)): remaining = number(item["percentRemaining"])
        reset = item.get("quota_reset_date", item.get("quotaResetDate"))
        if remaining is not None:
            windows.append(make_window(key, label, 100 - remaining, reset, None, "other"))
        used = number(item.get("credits_used", item.get("creditsUsed")))
        limit = number(item.get("entitlement", item.get("limit")))
        if used is not None or limit is not None: meters.append(meter_record(key + "-credits", label + " credits", "credits", used=used, limit=limit, remaining=(limit-used if used is not None and limit is not None else None), resets_at=reset))
    if not windows and not meters:
        return provider_record("copilot", META["label"], state="SCHEMA_CHANGED", error="No recognized Copilot quota values", category=META["category"], auth=META["auth"], experimental=True)
    return provider_record("copilot", META["label"], plan=next((data[k] for k in ("copilot_plan", "copilotPlan") if isinstance(data.get(k), str)), None), state="OK", source="copilot-usage", captured_at=iso_now(), last_success_at=iso_now(), windows=windows, meters=meters, category="credits", auth=META["auth"], experimental=True)
