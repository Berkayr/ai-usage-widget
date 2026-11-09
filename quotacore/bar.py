"""Read-only panel output from the shared snapshot; never contacts providers."""
from __future__ import annotations

import html
import json
import math
from datetime import datetime, timezone
from .paths import data_path

SHORT = {"claude": "CL", "codex": "CX", "gemini": "GM", "copilot": "CP"}
LABELS = {"claude": "Claude", "codex": "Codex", "gemini": "Gemini", "copilot": "Copilot"}


def remaining(value, now):
    try:
        seconds = max(0, int((datetime.fromisoformat(value.replace("Z", "+00:00")) - now).total_seconds()))
        minutes = seconds // 60
        if minutes >= 1440:
            return f"{minutes // 1440}d{minutes % 1440 // 60:02}h"
        return f"{minutes // 60}h{minutes % 60:02}"
    except (TypeError, ValueError, AttributeError):
        return "?"


def report(snapshot, providers=None, window="session", now=None):
    now = now or datetime.now(timezone.utc)
    generated_at = snapshot.get("generated_at")
    try:
        generated = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
        age = (now - generated).total_seconds()
        old_snapshot = age > 10 * 60
    except (TypeError, ValueError, AttributeError):
        old_snapshot = False
    records = {p.get("id"): p for p in snapshot.get("providers", []) if isinstance(p, dict)}
    if providers is None:
        providers = [key for key, p in records.items() if key and p.get("state") in ("OK", "STALE")]
    rows, details, percentages = [], [], []
    for key in providers:
        p = records.get(key, {})
        state = p.get("state", "SOURCE_UNAVAILABLE")
        if old_snapshot and state in ("OK", "STALE"):
            state = "STALE"
        stale = bool(p.get("stale")) or state == "STALE"
        all_windows = []
        raw_windows = p.get("windows")
        for w in raw_windows if isinstance(raw_windows, list) else []:
            if not isinstance(w, dict):
                continue
            used = w.get("used_percent")
            if isinstance(used, bool) or not isinstance(used, (int, float)) or not math.isfinite(used):
                used = None
            if state not in ("OK", "STALE", "RATE_LIMITED"):
                used = None
            if w.get("hidden_by_default") or used is None:
                continue
            used = max(0, min(100, used))
            text = ("~" if w.get("estimated") else "") + f"{used:.0f}%" if used is not None else "?"
            reset = remaining(w.get("resets_at"), now)
            label = str(w.get("label") or w.get("id") or "Quota").replace("\n", " ")
            line = f"{label}: {text} · {reset}"
            all_windows.append({"label": label, "used_percent": used, "remaining": reset, "text": line, "kind": w.get("kind"), "hidden": bool(w.get("hidden_by_default")), "estimated": bool(w.get("estimated"))})
        selected = [w for w in all_windows if not w["hidden"] and (window == "both" and w["kind"] in ("session", "weekly") or w["kind"] == window)]
        bits = []
        for w in selected:
            pct = w["used_percent"]
            if pct is not None:
                percentages.append(pct)
            prefix = ("S " if w["kind"] == "session" else "W ") if window == "both" else ""
            bits.append(prefix + (("~" if w.get("estimated") else "") + f"{pct:.0f}%" if pct is not None else "?") + " · " + w["remaining"])
        compact = SHORT.get(key, key.upper()) + " " + (" / ".join(bits) or "?") + (" [stale]" if stale else "")
        label = LABELS.get(key) or str(p.get("label") or key).replace("\n", " ")
        rows.append({"id": key, "label": label, "short": SHORT.get(key, key.upper()), "plan": p.get("plan"), "percentage": max((w["used_percent"] for w in selected if w["used_percent"] is not None), default=None), "text": compact, "state": state, "stale": stale, "windows": all_windows})
        details.append(f"{label}: {state}" + (" [stale]" if stale else "") + "\n" + "\n".join(w["text"] for w in all_windows))
    percentage = max(percentages) if percentages else None
    severity = "crit" if percentage is not None and percentage >= 80 else "warn" if percentage is not None and percentage >= 50 else "ok"
    return {"text": " | ".join(r["text"] for r in rows) or "Quota ?", "tooltip": "\n\n".join(details), "class": severity, "percentage": percentage, "providers": rows, "generated_at": snapshot.get("generated_at")}


def render(format="plain", providers=None, window="session"):
    try:
        value = json.loads(data_path("snapshot.json").read_text(encoding="utf-8"))
        if not isinstance(value, dict) or not isinstance(value.get("providers"), list):
            value = {}
    except (OSError, ValueError):
        value = {}
    result = report(value, providers, window)
    if format == "json":
        return json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    if format == "waybar":
        output = {key: result[key] for key in ("text", "tooltip", "class", "percentage")}
        output["text"] = html.escape(output["text"])
        output["tooltip"] = html.escape(output["tooltip"])
        return json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    text = result["text"].replace("\n", " ")
    if format == "polybar":
        return text.replace("%{", "%%{")
    if format == "i3blocks":
        return text + "\n" + text
    return text
