"""Local usage history (Claude Code and Antigravity CLI logs), reduced to token counts and model names."""
from __future__ import annotations

import json
import os
import re
import sqlite3
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


def _this_machine() -> str:
    return "windows" if sys.platform == "win32" else "macos" if sys.platform == "darwin" else "linux"


def _window(now: datetime | None) -> tuple[datetime, datetime]:
    """Return (now, start of the oldest of the last 30 local calendar days)."""
    local_tz = datetime.now().astimezone().tzinfo
    now = now or datetime.now()
    now = now.replace(tzinfo=local_tz) if now.tzinfo is None else now.astimezone()
    cutoff_date = now.date() - timedelta(days=29)
    cutoff = datetime.combine(cutoff_date, datetime.min.time()).astimezone()
    return now, cutoff


def _summarize(messages, now: datetime, source: str, priced: bool) -> dict:
    """Aggregate (stamp, model, machine, input, output, read, write, 5m, 1h, fast) rows into the history dict."""
    daily, models = defaultdict(lambda: [0, 0, 0, 0, 0, 0, False, defaultdict(int)]), defaultdict(lambda: [0, 0, False])
    machines = defaultdict(lambda: [0, 0.0, False])
    heatmap = [[0] * 24 for _ in range(7)]
    today_hourly = [0] * 24
    total_cost = 0.0
    unpriced = 0
    for stamp, model, machine, inp, out, read, write, five, hour, fast in messages:
        tokens = inp + out + read + write
        key = stamp.date().isoformat()
        if stamp.date() == now.date():
            today_hourly[stamp.hour] += tokens
        cost = None
        prices = _price(model) if priced else None
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
        "scope": "local", "source": source, "unit": "tokens",
        "this_machine": _this_machine(),
        "machines": [{"id": name, "tokens": value[0], "cost": round(value[1], 2) if value[2] else None}
                     for name, value in sorted(machines.items(), key=lambda item: (-item[1][0], item[0]))],
        "computed_at": now.isoformat(), "prices_as_of": "2026-10-06" if priced else None, "currency": "USD",
        "daily": [{"date": day, "tokens": v[0], "input": v[1], "output": v[2], "cache_read": v[3],
                   "cache_write": v[4], "cost": round(v[5], 2) if v[6] else None,
                   "by_machine": dict(sorted(v[7].items()))}
                  for day, v in sorted(daily.items())],
        "models": [{"model": name, "tokens": v[0], "cost": round(v[1], 2) if v[2] else None}
                   for name, v in sorted(models.items(), key=lambda pair: (-pair[1][0], pair[0]))],
        "heatmap": heatmap, "today_hourly": today_hourly,
        "totals": {"tokens": sum(v[0] for v in daily.values()),
                   "cost": round(total_cost, 2) if priced else None, "unpriced_tokens": unpriced},
    }


def claude_history(now: datetime | None = None, root: Path | str | None = None) -> dict | None:
    now, cutoff = _window(now)
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
                            parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                            if parsed.tzinfo is None:
                                parsed = parsed.replace(tzinfo=timezone.utc)
                            parsed = parsed.astimezone()
                            if parsed.timestamp() < cutoff.timestamp() or parsed > now:
                                continue
                            input_tokens = max(0, int(usage.get("input_tokens", 0)))
                            output = max(0, int(usage.get("output_tokens", 0)))
                            # Streaming repeats share the key; only the final row has the full output count.
                            if key in messages and messages[key][4] >= output:
                                continue
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
    return _summarize(messages.values(), now, "claude-code-logs", True)


# Antigravity CLI conversation databases. The format is unofficial and may change without notice.
_MAX_BLOB = 1 << 24      # larger protobuf blobs are treated as malformed
_MAX_FIELDS = 100_000    # fields per message, and step ids per generation
_MAX_TOKENS = 10 ** 12   # larger counters are corrupt data, not usage


def _varint(buf: bytes, pos: int) -> tuple[int, int]:
    value = shift = 0
    while True:
        if pos >= len(buf) or shift > 63:
            raise ValueError("bad varint")
        byte = buf[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, pos
        shift += 7


def _fields(buf) -> list[tuple[int, int, int | bytes]]:
    """Parse one protobuf message into (field, wire type, value); ValueError when malformed."""
    if not isinstance(buf, (bytes, bytearray)) or len(buf) > _MAX_BLOB:
        raise ValueError("unusable blob")
    result, pos = [], 0
    while pos < len(buf):
        if len(result) >= _MAX_FIELDS:
            raise ValueError("too many fields")
        key, pos = _varint(buf, pos)
        field, wire = key >> 3, key & 7
        if field == 0:
            raise ValueError("bad field number")
        if wire == 0:
            value, pos = _varint(buf, pos)
        else:
            if wire == 2:
                size, pos = _varint(buf, pos)
            elif wire in (1, 5):
                size = 8 if wire == 1 else 4
            else:
                raise ValueError("unsupported wire type")
            if size > len(buf) - pos:
                raise ValueError("truncated field")
            value = bytes(buf[pos:pos + size])
            pos += size
        result.append((field, wire, value))
    return result


def _packed(buf: bytes) -> list[int]:
    values, pos = [], 0
    while pos < len(buf):
        if len(values) >= _MAX_FIELDS:
            raise ValueError("too many ids")
        value, pos = _varint(buf, pos)
        values.append(value)
    return values


def _last(fields, number: int, wire: int):
    return next((value for field, kind, value in reversed(fields) if field == number and kind == wire), None)


def _model_name(meta) -> str:
    for number in (21, 19):
        raw = _last(meta, number, 2)
        try:
            text = raw.decode("utf-8") if raw is not None else ""
        except UnicodeDecodeError:
            continue
        if 0 < len(text) <= 80 and text.isascii() and text.isprintable():
            return text
    return "unknown"


def _generation(blob) -> tuple[list[int], str, tuple[int, int, int, int]]:
    """Return (step ids, model, (input, output, cache_read, cache_write)) for one gen_metadata row."""
    steps, meta = [], []
    for field, wire, value in _fields(blob):
        if field == 2 and wire == 2:
            steps.extend(_packed(value))
        elif field == 2 and wire == 0:
            steps.append(value)
        elif field == 1 and wire == 2:
            meta = _fields(value)
        if len(steps) > _MAX_FIELDS:
            raise ValueError("too many ids")
    stats = _last(meta, 4, 2)
    counts = {2: 0, 3: 0, 4: 0, 5: 0}
    for field, wire, value in (_fields(stats) if stats is not None else []):
        # Field 3 already includes thinking tokens; fields 9 and 10 are deliberately ignored.
        if field in counts and wire == 0:
            counts[field] = value
    if any(value > _MAX_TOKENS for value in counts.values()):
        raise ValueError("implausible token count")
    return steps, _model_name(meta), (counts[2], counts[3], counts[5], counts[4])


def _step_seconds(blob) -> int | None:
    for field, wire, value in _fields(blob):
        if field == 1 and wire == 2:
            for inner, kind, seconds in _fields(value):
                if inner == 1 and kind == 0:
                    return seconds
    return None


def _newest_mtime(path: Path) -> float:
    newest = 0.0
    for candidate in (path, path.with_name(path.name + "-wal")):
        try:
            newest = max(newest, candidate.stat().st_mtime)
        except OSError:
            pass
    return newest


def _read_conversation(path: Path, stats: dict) -> list[tuple[datetime, str, int, int, int, int]]:
    """Read one conversation database read-only; sqlite3.Error means the file is unusable."""
    wal, shm = (path.with_name(path.name + suffix) for suffix in ("-wal", "-shm"))
    # Plain read-only access leaves empty -wal and -shm files behind; only a live writer needs the WAL.
    live = shm.exists() and wal.exists() and wal.stat().st_size > 0
    con = sqlite3.connect(path.absolute().as_uri() + ("?mode=ro" if live else "?immutable=1"), uri=True, timeout=1)
    try:
        con.execute("PRAGMA query_only = ON")
        rows = con.execute("SELECT idx, data FROM gen_metadata ORDER BY idx").fetchall()
        parsed = []
        for _, blob in rows:
            stats["gen_rows"] += 1
            try:
                parsed.append(_generation(blob))
                stats["parsed"] += 1
            except (ValueError, TypeError):
                stats["malformed"] += 1
        wanted = {step for steps, _, _ in parsed for step in steps}
        seconds = {}
        for idx, blob in con.execute("SELECT idx, metadata FROM steps"):
            if idx not in wanted:
                continue
            try:
                value = _step_seconds(blob)
            except (ValueError, TypeError):
                stats["malformed"] += 1
                continue
            if value is not None:
                seconds[idx] = value
    finally:
        con.close()
    result, last = [], None
    for steps, model, usage in parsed:
        # The first step with a timestamp dates the generation; otherwise reuse the previous generation's time.
        sec = next((seconds[step] for step in steps if step in seconds), last)
        if sec is None:
            stats["undated"] += 1
            continue
        try:
            stamp = datetime.fromtimestamp(sec, timezone.utc).astimezone()
        except (OverflowError, OSError, ValueError):
            stats["malformed"] += 1
            continue
        last = sec
        result.append((stamp, model, *usage))
    return result


def _gemini_messages(now: datetime, cutoff: datetime, root: Path) -> tuple[list, dict]:
    stats = {"files": 0, "files_skipped": 0, "gen_rows": 0, "parsed": 0, "malformed": 0, "undated": 0}
    messages = []
    machine = _this_machine()
    for path in sorted(root.glob("*.db")):
        if _newest_mtime(path) < cutoff.timestamp():
            continue
        stats["files"] += 1
        try:
            rows = _read_conversation(path, stats)
        except (sqlite3.Error, OSError):
            stats["files_skipped"] += 1
            continue
        for stamp, model, inp, out, read, write in rows:
            if stamp < cutoff or stamp > now or inp + out + read + write == 0:
                continue
            messages.append((stamp, model, machine, inp, out, read, write, 0, 0, False))
    return messages, stats


def gemini_history(now: datetime | None = None, root: Path | str | None = None) -> dict | None:
    now, cutoff = _window(now)
    root = Path(root) if root is not None else Path.home() / ".gemini" / "antigravity-cli" / "conversations"
    try:
        messages, _ = _gemini_messages(now, cutoff, root)
    except OSError:
        return None
    return _summarize(messages, now, "antigravity-cli-logs", False) if messages else None
