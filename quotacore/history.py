"""Bounded private pace history: at most 1 MiB and 30 days, no backup copies."""
import json
import os
import time
from datetime import datetime
from .privacy import restrict_file

MAX_BYTES = 1024 * 1024
MAX_AGE = 30 * 86400


def append_history(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    retained = []
    try:
        # Oversize old files are discarded rather than read into memory.
        if path.stat().st_size <= MAX_BYTES:
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    value = json.loads(line)
                    stamp = value.get("generated_at") or value.get("at") or value.get("timestamp")
                    if stamp and datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp() >= time.time() - MAX_AGE:
                        retained.append(line)
                except (ValueError, TypeError, AttributeError):
                    pass
    except FileNotFoundError:
        pass
    retained.extend(json.dumps({"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **r}, ensure_ascii=False, separators=(",", ":")) for r in records)
    output, size = [], 0
    for line in reversed(retained):
        item = (line + "\n").encode("utf-8")
        if size + len(item) > MAX_BYTES: break
        output.append(item)
        size += len(item)
    # Restrict an existing file before opening it, and create new files as 0600.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT, 0o600)
    try:
        restrict_file(path)
        with os.fdopen(fd, "wb") as handle:
            fd = -1
            handle.truncate(0)
            handle.write(b"".join(reversed(output)))
    finally:
        if fd >= 0: os.close(fd)
