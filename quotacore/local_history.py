"""Local Claude Code usage history, reduced to token counts and model names."""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

PRICES = {
    "claude-fable-5-1": (10, 50, .25), "claude-fable-5": (10, 50, 1),
    "claude-opus-5-5": (4, 20, .2), "claude-opus-5": (5, 25, .5),
    "claude-opus-4-8": (5, 25, .5), "claude-opus-4-7": (5, 25, .5),
    "claude-opus-4-6": (5, 25, .5), "claude-sonnet-5-5": (2, 10, .2),
    "claude-sonnet-5": (2, 10, .2), "claude-sonnet-4-6": (3, 15, .3),
    "claude-haiku-5-5": (.1, .5, .01), "claude-haiku-4-5": (1, 5, .1),
}


def _price(model: str):
    return next((PRICES[name] for name in sorted(PRICES, key=len, reverse=True) if model.startswith(name)), None)


def _machine(cwd) -> str:
    if not isinstance(cwd, str):
        return "unknown"
    if re.match(r"^[A-Za-z]:[\\/]", cwd):
        return "windows"
    if cwd.startswith("/Users/"):
        return "macos"
    if cwd.startswith("/"):
        return "linux"
    return "unknown"


def claude_history(now: datetime | None = None, root: Path | str | None = None) -> dict | None:
    local_tz = datetime.now().astimezone().tzinfo
    now = now or datetime.now()
    now = now.replace(tzinfo=local_tz) if now.tzinfo is None else now.astimezone()
    cutoff_date = now.date() - timedelta(days=29)
    cutoff = datetime.combine(cutoff_date, datetime.min.time()).astimezone()
    if root is None:
        root = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")) / "projects"
    root = Path(root)
    messages = {}
    try:
        paths = root.rglob("*.jsonl")
        for path in paths:
            try:
                if any(part.startswith(".") for part in path.relative_to(root).parts[:-1]):
                    continue
                if path.stat().st_mtime < cutoff.timestamp():
                    continue
                with path.open(encoding="utf-8") as handle:
                    for line in handle:
                        if '"usage"' not in line:
                            continue
                        try:
                            entry = json.loads(line)
                            msg = entry.get("message", {})
                            usage = msg.get("usage")
                            if entry.get("type") != "assistant" or not isinstance(usage, dict):
                                continue
                            model = msg.get("model")
                            mid, rid = msg.get("id"), entry.get("requestId")
                            stamp = entry.get("timestamp")
                            if not isinstance(model, str) or model == "<synthetic>" or not mid or not rid or not stamp:
                                continue
                            machine = _machine(entry.get("cwd"))
                            key = (machine, mid, rid)
                            if key in messages:
                                continue
                            parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                            if parsed.tzinfo is None:
                                parsed = parsed.replace(tzinfo=timezone.utc)
                            parsed = parsed.astimezone()
                            if parsed.timestamp() < cutoff.timestamp() or parsed > now:
                                continue
                            input_tokens = max(0, int(usage.get("input_tokens", 0)))
                            output = max(0, int(usage.get("output_tokens", 0)))
                            cache_read = max(0, int(usage.get("cache_read_input_tokens", 0)))
                            cache_write = max(0, int(usage.get("cache_creation_input_tokens", 0)))
                            creation = usage.get("cache_creation")
                            if isinstance(creation, dict):
                                five = max(0, int(creation.get("ephemeral_5m_input_tokens", 0)))
                                hour = max(0, int(creation.get("ephemeral_1h_input_tokens", 0)))
                            else:
                                five, hour = cache_write, 0
                            messages[key] = (parsed, model, machine, input_tokens, output, cache_read, cache_write,
                                             five, hour, usage.get("speed") == "fast")
                        except (ValueError, TypeError, AttributeError, OverflowError):
                            continue
            except (OSError, UnicodeDecodeError):
                continue
    except OSError:
        return None
    if not messages:
        return None

    daily, models = defaultdict(lambda: [0, 0, 0, 0, 0, 0, False, defaultdict(int)]), defaultdict(lambda: [0, 0, False])
    machines = defaultdict(lambda: [0, 0.0, False])
    heatmap = [[0] * 24 for _ in range(7)]
    today_hourly = [0] * 24
    total_cost = 0.0
    unpriced = 0
    for stamp, model, machine, inp, out, read, write, five, hour, fast in messages.values():
        tokens = inp + out + read + write
        key = stamp.date().isoformat()
        if stamp.date() == now.date():
            today_hourly[stamp.hour] += tokens
        cost = None
        prices = _price(model)
        if prices:
            cost = (inp * prices[0] + out * prices[1] + read * prices[2] +
                    five * prices[0] * 1.25 + hour * prices[0] * 2 +
                    max(0, write - five - hour) * prices[0] * 1.25) / 1_000_000
            if fast:
                cost *= 2
            total_cost += cost
        else:
            unpriced += tokens
        d = daily[key]
        d[0] += tokens; d[1] += inp; d[2] += out; d[3] += read; d[4] += write
        d[7][machine] += tokens
        machines[machine][0] += tokens
        if cost is not None:
            machines[machine][1] += cost; machines[machine][2] = True
        if cost is not None: d[5] += cost; d[6] = True
        m = models[model]; m[0] += tokens
        if cost is not None: m[1] += cost; m[2] = True
        heatmap[stamp.weekday()][stamp.hour] += tokens

    return {
        "scope": "local", "source": "claude-code-logs", "unit": "tokens",
        "this_machine": "windows" if sys.platform == "win32" else "macos" if sys.platform == "darwin" else "linux",
        "machines": [{"id": name, "tokens": value[0], "cost": round(value[1], 2) if value[2] else None}
                     for name, value in sorted(machines.items(), key=lambda item: (-item[1][0], item[0]))],
        "computed_at": now.isoformat(), "prices_as_of": "2026-10-06", "currency": "USD",
        "daily": [{"date": day, "tokens": v[0], "input": v[1], "output": v[2], "cache_read": v[3],
                   "cache_write": v[4], "cost": round(v[5], 2) if v[6] else None,
                   "by_machine": dict(sorted(v[7].items()))}
                  for day, v in sorted(daily.items())],
        "models": [{"model": name, "tokens": v[0], "cost": round(v[1], 2) if v[2] else None}
                   for name, v in sorted(models.items(), key=lambda pair: (-pair[1][0], pair[0]))],
        "heatmap": heatmap, "today_hourly": today_hourly,
        "totals": {"tokens": sum(v[0] for v in daily.values()), "cost": round(total_cost, 2), "unpriced_tokens": unpriced},
    }
