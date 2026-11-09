"""Command line interface for quotacore."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone

from . import __version__
from .paths import atomic_json, config_dir, data_path, load_config
from .providers import METADATA, PROVIDERS
from .schema import provider_record, snapshot
from .pace import calculate_pace, reset_events
from .consent import DISCLOSURES



def detect_all() -> dict[str, bool]:
    # Detection must not open secrets.json or provider credential contents.
    return {key: (bool(os.environ.get(key.upper() + "_API_KEY")) or
                   (config_dir() / "secrets.json").is_file())
            if key in ("openrouter", "deepseek") else module.detect()
            for key, module in PROVIDERS.items()}


def _config():
    detected = detect_all()
    return detected, load_config(detected)


def collect() -> dict:
    config = load_config()
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
        meta = METADATA[key]
        if not config["initialized"] or not settings[key]["enabled"]:
            records.append(provider_record(key, meta["label"], state="DISABLED"))
        else:
            record = PROVIDERS[key].read(previous.get(key))
            if record.get("stale") or record.get("state") == "STALE":
                from .providers.common import estimate_expired_windows  # lazy: disabled runs load no adapter code
                record = estimate_expired_windows(record)
            records.append(record)
        records[-1].update(category=meta["category"], experimental=meta["experimental"], auth=meta["auth"])
    return snapshot(records)


def write_snapshot() -> dict:
    result = collect()
    return store_snapshot(result)


def store_snapshot(result: dict) -> dict:
    """Keep the file/inotify quiet when only the collection timestamp changed.

    Provider timestamps remain significant: a successful fresh observation must
    still advance freshness even when its quota percentage has not changed.
    """
    path = data_path("snapshot.json")
    try:
        prior = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(prior, dict) and isinstance(prior.get("generated_at"), str) and {k: v for k, v in prior.items() if k != "generated_at"} == {
                k: v for k, v in result.items() if k != "generated_at"}:
            return prior
    except (OSError, ValueError):
        pass
    atomic_json(path, result)
    return result


def doctor(live: bool = False) -> dict:
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
        enabled = config["initialized"] and config["providers"].get(key, {}).get("enabled", False)
        record = (module.read(states.get(key)) if live and enabled else
                  states.get(key, {}) if enabled else {"state": "DISABLED"})
        captured = record.get("captured_at")
        age = None
        if captured:
            try:
                age = max(0, int((now - datetime.fromisoformat(captured.replace("Z", "+00:00"))).total_seconds()))
            except (ValueError, TypeError):
                pass
        result.append({"id": key, "detected": detected[key], "enabled": enabled,
                       "state": record.get("state"), "source": record.get("source"), "age_seconds": age})
    return {"version": __version__, "providers": result, "live": live,
            "paths": {"python": sys.executable, "module": str(__file__),
                      "codex": PROVIDERS["codex"]._executable(), "agy": PROVIDERS["gemini"]._agy(),
                      "gh": shutil.which("gh"),
                      "python_override": os.environ.get("QUOTACORE_PYTHON"),
                      "runtime_source": os.environ.get("QUOTACORE_RUNTIME_SOURCE", "direct"),
                      "python_version": sys.version.split()[0]}}


def daemon(interval: int) -> int:
    backoff = {key: 0 for key in PROVIDERS}
    while True:
        try:
            result = write_snapshot()
            for record in result["providers"]:
                key = record["id"]
                if record["state"] in ("OK", "STALE", "DISABLED"):
                    backoff[key] = 0
                elif key == "claude" and record["state"] != "DISABLED" and PROVIDERS["claude"].RETRY_AFTER:
                    backoff[key] = min(1800, max(backoff[key], int(PROVIDERS["claude"].RETRY_AFTER)))
                else:
                    backoff[key] = min(1800, max(30, backoff[key] * 2 if backoff[key] else 30))
            delay = max([interval, *backoff.values()])
            time.sleep(delay)
        except KeyboardInterrupt:
            return 0
        except Exception:
            time.sleep(min(1800, max(30, interval)))


def _pace(snapshot_value: dict, *, no_log: bool, mode: str) -> int:
    config_path = data_path("pace.json")
    state_path = data_path("pace-state.json")
    try:
        options = json.loads(config_path.read_text(encoding="utf-8"))
        if not isinstance(options, dict): options = {}
    except (OSError, ValueError): options = {}
    ceilings = options.get("ceilings", {}) if isinstance(options.get("ceilings", {}), dict) else {}
    try:
        max_age_minutes = max(0.0, float(options.get("max_age_minutes", 30)))
    except (TypeError, ValueError):
        max_age_minutes = 30
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        previous_profiles = state.get("profiles", {}) if isinstance(state, dict) else {}
        previous_record = state.get("last", {}) if isinstance(state, dict) else {}
    except (OSError, ValueError):
        previous_profiles, previous_record = {}, {}
    report = calculate_pace(snapshot_value, ceilings=ceilings, previous_profiles=previous_profiles,
                            max_age_minutes=max_age_minutes)
    if not no_log:
        log_path = data_path("pace-log.jsonl")
        events = reset_events(report, previous_record)
        from .history import append_history
        append_history(log_path, [{"event": "run", **report}, *events])
        atomic_json(state_path, {"profiles": {p["id"]: p["profile"] for p in report["providers"]}, "last": report})
    else:
        atomic_json(state_path, {"profiles": {p["id"]: p["profile"] for p in report["providers"]}, "last": previous_record})
    if mode == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    elif mode == "line":
        pieces = []
        for p in report["providers"]:
            windows = [w for w in p["windows"] if w["status"] == "known"]
            details = []
            for w in windows:
                short = w["window_minutes"] <= 300
                if short:
                    details.append(f"5h{w['used']:.0f}%")
                else:
                    days = w["hours_left"] / 24
                    left = f"{w['hours_left']:.0f}h" if w["hours_left"] < 48 else f"{days:.0f}d"
                    details.append(f"w{w['gap']:+.0f} {left}")
            pieces.append(" ".join([p["id"], p["profile"], *details]))
        print("QUOTA " + " | ".join(pieces))
    else:
        print(f"{'PROVIDER':12} {'PROFILE':10} {'WINDOW':24} {'USED':>7} {'GAP':>7} {'LEFT':>7} {'UNUSED':>8}")
        for p in report["providers"]:
            for w in p["windows"]:
                if w["status"] == "unknown":
                    label = str(w.get('label') or w.get('id')).replace("·", "-")
                    print(f"{p['id']:12} {p['profile']:10} {label:24} unknown")
                else:
                    label = str(w.get('label') or w.get('id')).replace("·", "-")
                    print(f"{p['id']:12} {p['profile']:10} {label:24} {w['used']:6.1f}% {w['gap']:+6.1f} {w['hours_left']:6.1f}h {w['projected_unused']:7.1f}%")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="quotacore")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)
    bar_parser = sub.add_parser("bar", help="read the shared snapshot for a desktop panel")
    bar_parser.add_argument("--format", choices=("plain", "waybar", "polybar", "i3blocks", "json"), default="plain")
    bar_parser.add_argument("--providers", help="comma-separated IDs; defaults to all OK/STALE providers")
    bar_parser.add_argument("--window", choices=("session", "weekly", "both"), default="session")
    quote_parser = sub.add_parser("quote", help="explicitly request daily Wikiquote cards")
    quote_parser.add_argument("--mode", choices=("qotd", "born", "died", "on-this-day", "mixed"), default="qotd")
    quote_parser.add_argument("--json", action="store_true")
    sub.add_parser("snapshot")
    write_parser = sub.add_parser("write")
    write_parser.add_argument("--print", dest="print_snapshot", action="store_true",
                              help="also print the written snapshot as JSON")
    sub.add_parser("detect")
    sub.add_parser("doctor").add_argument("--live", action="store_true")
    sub.add_parser("init", help="choose providers before first collection")
    sub.add_parser("provider-config", help="show consent status without reading credentials")
    consent_parser = sub.add_parser("configure", help="explicitly enable the selected providers")
    consent_parser.add_argument("providers", nargs="*", choices=list(PROVIDERS))
    sub.add_parser("refresh-gemini")
    key_parser = sub.add_parser("key")
    key_sub = key_parser.add_subparsers(dest="key_command", required=True)
    for name in ("set", "clear"):
        cmd = key_sub.add_parser(name); cmd.add_argument("provider", choices=("openrouter", "deepseek", "zai", "moonshot", "siliconflow", "openai_admin", "anthropic_admin"))
    daemon_parser = sub.add_parser("daemon")
    daemon_parser.add_argument("--interval", type=int, default=None)
    hook_parser = sub.add_parser("hook")
    hook_parser.add_argument("provider", choices=("claude", "agy"))
    chain_options = hook_parser.add_mutually_exclusive_group()
    chain_options.add_argument("--chain-cmd", "--chain", dest="chain_cmd", help="JSON array of executable and arguments (no shell)")
    chain_options.add_argument("--chain-shell", help="explicit trusted shell command; receives raw hook input")
    pace_parser = sub.add_parser("pace")
    pace_mode = pace_parser.add_mutually_exclusive_group()
    pace_mode.add_argument("--json", action="store_true")
    pace_mode.add_argument("--line", action="store_true")
    pace_parser.add_argument("--from-file")
    pace_parser.add_argument("--no-log", action="store_true", help="skip history appends; still update pace state")
    pace_parser.add_argument("--purge", action="store_true", help="delete pace history and state without collecting")
    args = parser.parse_args(argv)
    if args.command == "quote":
        from .quote import daily_quote
        result = daily_quote(enabled=True, mode=args.mode)
        print(json.dumps(result) if args.json else "\n\n".join(c["quote"] + " — " + c["author"] + "\n" + c["reason"] + "\n" + c["source_url"] + " · " + c["license"] for c in result["cards"]) or result["status"])
    elif args.command == "bar":
        from .bar import render
        providers = None if args.providers is None else list(dict.fromkeys(x.strip() for x in args.providers.split(",") if x.strip()))
        if providers is not None and (not providers or any(x not in PROVIDERS for x in providers)):
            parser.error("--providers must be a comma-separated list of known provider IDs")
        print(render(args.format, providers, args.window))
    elif args.command == "snapshot":
        print(json.dumps(collect(), ensure_ascii=False, indent=2))
    elif args.command == "write":
        result = write_snapshot()
        if args.print_snapshot:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "detect":
        detected = detect_all()
        print(json.dumps([{"id": key, "detected": detected[key], "auth": module.META["auth"]} for key, module in PROVIDERS.items()], ensure_ascii=False, indent=2))
    elif args.command == "doctor":
        print(json.dumps(doctor(args.live), ensure_ascii=False, indent=2))
    elif args.command == "provider-config":
        detected, config = _config()
        disclosures = {key: DISCLOSURES[key] for key in PROVIDERS}
        print(json.dumps({"detected": detected, "disclosures": disclosures, **config}))
    elif args.command in ("init", "configure"):
        detected, config = _config()
        selected = args.providers if args.command == "configure" else []
        if args.command == "init":
            print("Choose what to track. No provider is enabled until you finish.")
            for key in PROVIDERS:
                disclosure = DISCLOSURES[key]
                answer = input(f"{key} ({'detected' if detected[key] else 'not detected'}): {disclosure} Enable? [y/N] ")
                if answer.strip().lower() in ("y", "yes"): selected.append(key)
        for key, item in config["providers"].items(): item["enabled"] = key in selected
        config["initialized"] = True
        atomic_json(config_dir() / "config.json", config)
    elif args.command == "refresh-gemini":
        return PROVIDERS["gemini"].refresh_gemini()
    elif args.command == "key":
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
        chain = None
        if args.chain_cmd:
            try:
                chain = json.loads(args.chain_cmd)
                if not isinstance(chain, list) or not chain or not all(isinstance(v, str) and v for v in chain):
                    raise ValueError()
            except ValueError:
                parser.error("--chain-cmd requires a nonempty JSON array of strings")
        return run_hook(args.provider, chain, chain_shell=args.chain_shell)
    elif args.command == "pace":
        if args.purge:
            for name in ("pace-log.jsonl", "pace-state.json"):
                data_path(name).unlink(missing_ok=True)
            return 0
        if args.from_file:
            try:
                value = json.loads(open(args.from_file, encoding="utf-8").read())
            except (OSError, ValueError) as exc:
                print(f"Unable to read snapshot: {exc}", file=sys.stderr)
                return 2
        else:
            value = collect()
        return _pace(value, no_log=args.no_log, mode="json" if args.json else "line" if args.line else "table")
    return 0


if __name__ == "__main__":
    sys.exit(main())
