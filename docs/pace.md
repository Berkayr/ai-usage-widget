# Quota pacing

`py -3 -m quotacore pace` collects a fresh snapshot and prints each provider's pacing profile (`SAVE`, `NORMAL`, `SPARE`, `LAST_CALL`, or `UNKNOWN`) with window usage, schedule gap, reset time, and projected unused quota. Use `--line` for one compact line, `--json` for machine-readable output, `--from-file PATH` to evaluate a saved snapshot, or `--no-log` to skip the JSONL run log.

Optional pacing ceilings can be set in `pace.json` beside `snapshot.json` in the quotacore data directory:

```json
{"ceilings": {"codex": 90, "gemini": 100, "claude": 90}, "max_age_minutes": 30}
```

Recent stale snapshots remain usable up to `max_age_minutes`; older or undated stale data is reported as `UNKNOWN`. Expired windows are treated as reset, with zero usage for the new period.

Other providers default to a 90% ceiling. Pace runs append compact records to `pace-log.jsonl`; profile history is stored in `pace-state.json` to preserve SPARE hysteresis.
