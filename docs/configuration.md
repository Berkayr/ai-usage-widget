# Configuration

Display settings and quota collection settings are separate. Change display settings using the gear button; do not edit files while the widget is saving them. The browser's `?sample` mode uses synthetic data and never saves native settings.

Theme defaults to System when no choice is stored; an existing explicit theme is preserved. Theme and newer Look fields persist in the local webview store until the native settings schema supports them, so copying `settings.json` alone does not transfer them.

## Display settings

`settings.json` lives in the operating system's config directory under `ai-usage`: Linux `$XDG_CONFIG_HOME/ai-usage` (normally `~/.config/ai-usage`); Windows `%APPDATA%/ai-usage`. Window geometry is saved separately in `window.json`. `QUOTACORE_HOME` does **not** relocate display settings. First launch copies legacy settings and window geometry once, preserving the originals and any existing new settings.

| Field | Default | Meaning |
| --- | --- | --- |
| `theme` | `system` | System, Dot Matrix and seven other designs; selected in Settings → Theme. |
| `appearance` | `auto` | `auto`, `light`, `dark`; auto follows OS color preference live. |
| `colorMode` | `calm` | Neutral or system-accent usage below 50%, soft amber from 50%, muted red from 80%; `vivid` restores theme colors. |
| `accentEdge` | `off` | `off`, `auto`, `left`, `right`; Auto follows the selected corner, with no edge in Free placement. |
| `palette` | Theme dependent | System: `default` (Desktop). Dot Matrix: `slate` (neutral default), `signal-orange`, `sakura-pink`, `nord`, `mono-paper`. Existing palette choices remain available. |
| `accent`, `background` | `null` | Optional CSS color overrides; choosing a palette clears these overrides. |
| `widgetOpacity` | `100` | Opacity of the entire widget, including text; UI range 20–100. |
| `backgroundOpacity` | `100` | Background opacity, 0–100; this does not enable compositor blur. |
| `scale` | `100` | Rem-based text and layout scale, 50–300%; presets 75/100/150/200. Ctrl +/− changes by 10, Ctrl+0 restores 100. |
| `fitHeight` | `true` | Resize to content height. Width still controls the responsive layout. |
| `position` | `Top right` | Top/Bottom + left/right corners, or `Free` where supported. |
| `showExtraWindows` | `false` | Reveal secondary/model windows that the source marks hidden. |
| `linux` | See below | Linux layer-shell controls; hidden when unsupported. |
| `taskbar` | See below | Windows strip, independent from desktop widget layout. |

```json
{
  "linux": {"layer": "bottom", "margin": 12, "monitor": null},
  "taskbar": {
    "enabled": false,
    "providers": ["claude", "codex", "gemini"],
    "window": "session",
    "showBars": false,
    "offsetX": 0,
    "style": "transparent",
    "theme": "auto"
  }
}
```

Linux `layer` is `top` or `bottom`; margin is 0–64 logical pixels in the UI; monitor is null for Auto or a zero-based GDK index (not a permanent monitor identity). Layer-shell requires a corner. Windows `window` is `session`, `weekly` or `both`; `style` is `transparent` or `chip`; `theme` is `auto`, `light` or `dark`. Start at login uses the OS autostart registration, not a field in this file.

XS/S/M/L are descriptive responsive layouts, not selectable settings. Current CSS uses ≤219 px for XS and 220–320 px for S at 100% scale; larger widths use detailed cards, with more space at 520 px or 700 px height. Two cards can sit side by side at 640 px, three at 960 px. The theme metadata's nominal tier widths are not runtime breakpoint selectors.

## Collector configuration

Linux data: `$XDG_STATE_HOME/quotacore` or `~/.local/state/quotacore`. Linux config: `$XDG_CONFIG_HOME/quotacore` or `~/.config/quotacore`. On Windows both use `%LOCALAPPDATA%/quotacore`. `QUOTACORE_HOME` overrides both for the collector and the shared snapshot location for the widget.

`config.json` configures enabled providers, display ordering and daemon collection interval (minimum 30 seconds; default 300). The native widget currently refreshes on startup and every 300 seconds independently of that daemon setting. Initial creation disables every provider until the shared consent screen or `quotacore init` is completed. `quotacore configure claude codex` explicitly selects providers, while `quotacore configure` disables all. Newly introduced providers and entries without `enabled` default off. Existing explicit configurations are preserved.

```json
{
  "interval": 300,
  "initialized": true,
  "providers": {
    "claude": {"enabled": true, "order": 0},
    "codex": {"enabled": true, "order": 1},
    "gemini": {"enabled": false, "order": 2}
  }
}
```

The state directory contains `snapshot.json`, provider observations/caches, and optional [pace](pace.md) files. Local `secrets.json` may contain `openrouter` and `deepseek` keys; never include it in an issue or commit. Environment API keys take precedence.

| Environment variable | Purpose |
| --- | --- |
| `QUOTACORE_HOME` | Collector config/state root and widget snapshot root. |
| `QUOTACORE_PYTHONPATH` | Native widget override for the bundled Python module directory. |
| `QUOTACORE_CLAUDE_OBSERVATION` | Optional quota observation file; normal state-file fallback still applies. |
| `QUOTACORE_GEMINI_SNAPSHOT` | Override Gemini's cached quota file. |
| `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY` | Optional API balance credentials. |
| `XDG_STATE_HOME`, `XDG_CONFIG_HOME` | Linux storage roots. |
| `LOCALAPPDATA`, `APPDATA` | Windows storage/discovery roots. |
| `GDK_BACKEND` | Optional Linux backend selection, e.g. `x11` when XWayland exists. |

Provider CLIs must be discoverable in the desktop process environment, which can differ from a terminal. See [providers](providers.md) and [Linux integration](linux.md).

`doctor` uses cached data and reports resolved Python/module/CLI paths. Use `doctor --live` only when you want credential/network checks of enabled providers. `key set` stores plaintext keys with Unix 0600 or a current-user protected Windows DACL. See the [security model](security-model.md).

Hook chaining uses a JSON argv array: `quotacore hook claude --chain-cmd '["program", "argument"]'`. `--chain` is now an alias for the same JSON format; old shell strings must be migrated explicitly to `--chain-shell`. Both receive raw stdin, allow 5 seconds and at most 64 KiB stdout. Only trust commands you select.

System uses a system-ui font stack without bundled theme fonts, 8 px cards and continuous rounded bars. Auto appearance follows `prefers-color-scheme`; supported webviews use CSS `AccentColor` and `AccentColorText`, with a neutral blue-gray fallback. Mono retains continuous bars and adds a warning hatch / inverse danger label. System keeps one column at wide sizes.
