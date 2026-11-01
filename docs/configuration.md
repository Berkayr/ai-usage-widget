# Configuration

Display settings and quota collection settings are separate. Change display settings using the gear button; do not edit files while the widget is saving them. The browser's `?sample` mode uses synthetic data and never saves native settings.

New Look fields default to Calm/Off when missing. Until the native settings schema supports them, these two fields also persist in the local webview store; they are not portable by copying `settings.json` alone.

## Display settings

`settings.json` lives in the operating system's config directory under `ai-quota-widget`: Linux `$XDG_CONFIG_HOME/ai-quota-widget` (normally `~/.config/ai-quota-widget`); Windows `%APPDATA%/ai-quota-widget`. Window geometry is saved separately in `window.json`. `QUOTACORE_HOME` does **not** relocate display settings.

| Field | Default | Meaning |
| --- | --- | --- |
| `appearance` | `auto` | `auto`, `light`, `dark`; auto follows OS color preference live. |
| `colorMode` | `calm` | Neutral usage through 50%, soft amber above 50%, muted red from 80%; `vivid` restores theme colors. |
| `accentEdge` | `off` | `off`, `auto`, `left`, `right`; Auto follows the selected corner, with no edge in Free placement. |
| `palette` | `signal-orange` | `signal-orange`, `sakura-pink`, `nord`, `mono-paper`. |
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

`config.json` configures enabled providers, display ordering and daemon collection interval (minimum 30 seconds; default 300). The native widget currently refreshes on startup and every 300 seconds independently of that daemon setting. Initial creation uses provider detection. Explicit provider entries default disabled when `enabled` is omitted.

```json
{
  "interval": 300,
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
