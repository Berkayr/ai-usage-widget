"""Read JetBrains quota XML without modifying IDE state."""
import glob
import json
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from ..schema import iso_now, meter_record, provider_record
from .common import number, timestamp

META = {"id": "jetbrains", "label": "JetBrains AI", "category": "credits", "auth": "local-file", "experimental": False, "docs_url": "https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html"}

def quota_files():
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "JetBrains"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "JetBrains"
    return [Path(p) for p in glob.glob(str(base / "*" / "options" / "AIAssistantQuotaManager2.xml"))]

def detect(): return any(p.is_file() for p in quota_files())

def parse_file(path):
    try:
        root = ET.parse(path).getroot()
        info = refill = None
        for option in root.iter():
            if option.get("name") == "quotaInfo": info = option.get("value")
            if option.get("name") == "nextRefill": refill = option.get("value")
        if not info: return None
        quota = json.loads(info)
        if not isinstance(quota, dict) or quota.get("type") not in (None, "Available"): return None
        detail = quota.get("tariffQuota") if isinstance(quota.get("tariffQuota"), dict) else {}
        used, limit = number(detail.get("current")), number(detail.get("maximum"))
        if used is None or limit is None:
            used, limit = number(quota.get("current")), number(quota.get("maximum"))
        if used is None or limit is None or used < 0 or limit <= 0: return None
        reset = None
        if refill:
            ref = json.loads(refill)
            reset = timestamp(ref.get("next")) if isinstance(ref, dict) else None
        meters = [meter_record("monthly-credits", "Monthly AI credits", "credits", used=used / 100000, limit=limit / 100000, remaining=max(0, limit-used) / 100000, resets_at=reset)]
        top = quota.get("topUpQuota")
        if isinstance(top, dict) and number(top.get("available")) is not None and number(top.get("available")) >= 0:
            meters.append(meter_record("top-up-credits", "Top-up credits", "credits", remaining=number(top.get("available")) / 100000))
        return meters
    except (OSError, ValueError, ET.ParseError, TypeError): return None

def read(prev=None):
    files = [p for p in quota_files() if p.is_file()]
    if not files: return provider_record("jetbrains", META["label"], state="NOT_INSTALLED", error="JetBrains quota file not found", category=META["category"], auth=META["auth"])
    path = max(files, key=lambda p: p.stat().st_mtime)
    meters = parse_file(path)
    if not meters: return provider_record("jetbrains", META["label"], state="SCHEMA_CHANGED", error="JetBrains quota file has an unsupported format", category=META["category"], auth=META["auth"])
    stamp = timestamp(path.stat().st_mtime)
    return provider_record("jetbrains", META["label"], state="OK", source="local-file", captured_at=stamp, last_success_at=stamp, meters=meters, category=META["category"], auth=META["auth"])
