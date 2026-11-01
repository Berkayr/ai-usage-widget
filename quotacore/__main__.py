"""Command line interface for quotacore."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

from . import __version__
from .paths import atomic_json, config_dir, data_path, load_config
from .providers import PROVIDERS
from .schema import provider_record, snapshot

claude, codex, gemini = (PROVIDERS[x] for x in ("claude", "codex", "gemini"))


def detect_all() -> dict[str, bool]:
    return {key: module.detect() for key, module in PROVIDERS.items()}


def _config():
    detected = detect_all()
    return detected, load_config(detected)


def collect() -> dict:
    detected, config = _config()
    previous = {}
    try:
        prior = json.loads(data_path("snapshot.json").read_text(encoding="utf-8"))
        previous = {item.get("id"): item for item in prior.get("providers", []) if isinstance(item, dict)}
    except (OSError, ValueError, AttributeError):
        pass
    settings = config["providers"]
    ordered = sorted(PROVIDERS, key=lambda key: settings.get(key, {}).get("order", 999))
    records = []
    for key in ordered:
        if not settings[key]["enabled"]:
            records.append(provider_record(key, PROVIDERS[key].META["label"], state="DISABLED"))
        elif not detected[key]:
            records.append(PROVIDERS[key].read(previous.get(key)))
        else:
            records.append(PROVIDERS[key].read(previous.get(key)))
        meta = PROVIDERS[key].META
        records[-1].update(category=meta["category"], experimental=meta["experimental"], auth=meta["auth"])
    return snapshot(records)


def write_snapshot() -> dict:
    result = collect()
    atomic_json(data_path("snapshot.json"), result)
    return result


def doctor() -> dict:
    detected, config = _config()
    states = {}
    try:
        current = json.loads(data_path("snapshot.json").read_text(encoding="utf-8"))
        states = {item.get("id"): item for item in current.get("providers", []) if isinstance(item, dict)}
    except (OSError, ValueError, AttributeError):
        pass
    now = datetime.now(timezone.utc)
    result = []
    for key, module in PROVIDERS.items():
        record = states.get(key) or module.read(None)
        captured = record.get("captured_at")
        age = None
        if captured:
            try:
                age = max(0, int((now - datetime.fromisoformat(captured.replace("Z", "+00:00"))).total_seconds()))
            except (ValueError, TypeError):
                pass
        result.append({"id": key, "detected": detected[key], "enabled": config["providers"].get(key, {}).get("enabled", False),
                       "state": record.get("state"), "source": record.get("source"), "age_seconds": age})
    return {"version": __version__, "providers": result}


def daemon(interval: int) -> int:
    backoff = {key: 0 for key in PROVIDERS}
    while True:
        try:
            result = collect()
            atomic_json(data_path("snapshot.json"), result)
            for record in result["providers"]:
                key = record["id"]
                if record["state"] in ("OK", "STALE"):
                    backoff[key] = 0
                elif key == "claude" and claude.RETRY_AFTER:
                    backoff[key] = min(1800, max(backoff[key], int(claude.RETRY_AFTER)))
                else:
                    backoff[key] = min(1800, max(30, backoff[key] * 2 if backoff[key] else 30))
            delay = max([interval, *backoff.values()])
            time.sleep(delay)
        except KeyboardInterrupt:
            return 0
        except Exception:
            time.sleep(min(1800, max(30, interval)))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="quotacore")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("snapshot")
    write_parser = sub.add_parser("write")
    write_parser.add_argument("--print", dest="print_snapshot", action="store_true",
                              help="also print the written snapshot as JSON")
    sub.add_parser("detect")
    sub.add_parser("doctor")
    sub.add_parser("refresh-gemini")
    key_parser = sub.add_parser("key")
    key_sub = key_parser.add_subparsers(dest="key_command", required=True)
    for name in ("set", "clear"):
        cmd = key_sub.add_parser(name); cmd.add_argument("provider", choices=("openrouter", "deepseek"))
    daemon_parser = sub.add_parser("daemon")
    daemon_parser.add_argument("--interval", type=int, default=None)
    hook_parser = sub.add_parser("hook")
    hook_parser.add_argument("provider", choices=("claude", "agy"))
    hook_parser.add_argument("--chain", default=None)
    args = parser.parse_args(argv)
    if args.command == "snapshot":
        print(json.dumps(collect(), ensure_ascii=False, indent=2))
    elif args.command == "write":
        result = write_snapshot()
        if args.print_snapshot:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "detect":
        print(json.dumps([{"id": key, "detected": module.detect(), "auth": module.META["auth"]} for key, module in PROVIDERS.items()], ensure_ascii=False, indent=2))
    elif args.command == "doctor":
        print(json.dumps(doctor(), ensure_ascii=False, indent=2))
    elif args.command == "refresh-gemini":
        return gemini.refresh_gemini()
    elif args.command == "key":
        from .paths import atomic_json
        path = config_dir() / "secrets.json"
        try:
            values = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(values, dict): values = {}
        except (OSError, ValueError): values = {}
        if args.key_command == "set":
            value = sys.stdin.read().strip()
            if not value: return 2
            values[args.provider] = value
        else:
            values.pop(args.provider, None)
        atomic_json(path, values)
        if os.name != "nt": path.chmod(0o600)
        return 0
    elif args.command == "daemon":
        config = load_config(detect_all())
        return daemon(max(30, args.interval if args.interval is not None else config["interval"]))
    elif args.command == "hook":
        from .hooks import run_hook
        return run_hook(args.provider, args.chain)
    return 0


if __name__ == "__main__":
    sys.exit(main())
