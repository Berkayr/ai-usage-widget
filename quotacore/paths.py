"""Platform-aware paths and configuration helpers."""
from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

IDS = ("claude", "codex", "gemini", "copilot", "openrouter", "deepseek", "jetbrains")
DEFAULT_ORDER = list(IDS)


def home_dir() -> Path:
    override = os.environ.get("QUOTACORE_HOME")
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "quotacore"
    return Path(os.environ.get("XDG_STATE_HOME") or (Path.home() / ".local" / "state")) / "quotacore"


def config_dir() -> Path:
    override = os.environ.get("QUOTACORE_HOME")
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "quotacore"
    return Path(os.environ.get("XDG_CONFIG_HOME") or (Path.home() / ".config")) / "quotacore"


def data_path(name: str) -> Path:
    return home_dir() / name


def load_config(detect: dict[str, bool] | None = None) -> dict[str, Any]:
    path = config_dir() / "config.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return normalize_config(data, detect)
    except (OSError, ValueError):
        pass
    result = {"providers": {key: {"enabled": False, "order": i} for i, key in enumerate(DEFAULT_ORDER)},
              "interval": 300, "initialized": False}
    try:
        atomic_json(path, result)
    except OSError:
        pass
    return result


def normalize_config(data: dict[str, Any], detect: dict[str, bool] | None = None) -> dict[str, Any]:
    source = data.get("providers") if isinstance(data.get("providers"), dict) else {}
    providers = {}
    for index, key in enumerate(DEFAULT_ORDER):
        item = source.get(key) if isinstance(source.get(key), dict) else {}
        # New providers always require explicit opt-in.
        default = False
        providers[key] = {"enabled": bool(item.get("enabled", default)), "order": int(item.get("order", index))}
    try:
        interval = max(30, int(data.get("interval", 300)))
    except (TypeError, ValueError):
        interval = 300
    for key, item in source.items():
        if key not in providers and isinstance(item, dict):
            providers[key] = {"enabled": bool(item.get("enabled", False)), "order": int(item.get("order", len(providers)))}
    return {"providers": providers, "interval": interval,
            "initialized": bool(data.get("initialized", bool(source)))}


def atomic_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        from .privacy import restrict_file
        try:
            restrict_file(Path(temporary))
        except Exception:
            os.close(fd)
            raise
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        for attempt in range(11):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if attempt == 10:
                    raise
                time.sleep(0.1)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
