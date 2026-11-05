# Configuration

Display settings and quota collection settings are separate. Change display settings using the gear button; do not edit files while the widget is saving them. The browser's `?sample` mode uses synthetic data and never saves native settings.

Theme defaults to System when no choice is stored; an existing explicit theme is preserved. Theme and appearance fields persist in `settings.json`; optional webview cache values are also kept for startup.

## Display settings

`settings.json` lives in the operating system's config directory under `ai-usage`: Linux `$XDG_CONFIG_HOME/ai-usage` (normally `~/.config/ai-usage`); Windows `%APPDATA%/ai-usage`. Window geometry is saved separately in `window.json`. `QUOTACORE_HOME` does **not** relocate display settings. First launch copies legacy settings and window geometry once, preserving the originals and any existing new settings.

| Field | Default | Meaning |
| --- | --- | --- |
| `theme` | `system` | System, Dot Matrix and eight other designs; selected in Settings → Theme. |
| `appearance` | `auto` | `auto`, `light`, `dark`; auto follows OS color preference live. |
| `colorMode` | `calm` | Neutral or system-accent usage below 50%, soft amber from 50%, muted red from 80%; `vivid` restores theme colors. |
| `accentEdge` | `off` | `off`, `auto`, `left`, `right`; Auto follows the selected corner, with no edge in Free placement. |
| `palette` | Theme dependent | System: `default` (Desktop). Dot Matrix: `slate` (neutral default), `signal-orange`, `sakura-pink`, `nord`, `mono-paper`. Existing palette choices remain available. |
| `accent`, `background` | `null` | Optional CSS color overrides; choosing a palette clears these overrides. |
| `widgetOpacity` | `100` | Opacity of the entire widget, including text; UI range 20–100. |
| `backgroundOpacity` | `100` | Background opacity, 0–100; this does not enable compositor blur. |
| `scale` | `100` | Derived text and layout scale, 10–300%; presets 85/100/120/150/200 multiplied by fine-tune. Ctrl +/− changes the active fine-tune by 5; Ctrl+0 resets that fine-tune to 100. Work-area and coverage limits apply. |
| `sizeMode`, `sizePreset`, `fineTune` | `fixed`, `Medium`, `100` | Fixed preset and independent 50–150% fine-tuning, under Size & Shape. |
| `fitFraction`, `fitFineTune` | `1`, `100` | Screen share (1, .75, .5, 1/3) and separate 50–150% fine-tuning for Fit screen. Effective only for Portrait except Compact Strip; other shapes retain the choice but use their preset. Portrait Fit width is capped at 30% of available width. |
| `reservedTop`, `reservedBottom` | `null` | Auto detected insets; explicit logical pixel overrides under Position → Advanced. |
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

Linux `layer` is `top` or `bottom`; margin is 0–64 logical pixels in the UI; monitor is null for Auto, a monitor connector/name, or a legacy zero-based GDK index. Layer-shell requires a corner. Windows `window` is `session`, `weekly` or `both`; `style` is `transparent` or `chip`; `theme` is `auto`, `light` or `dark`. Start at login uses the OS autostart registration, not a field in this file.

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

### Settings pages and screen limits

Navigation is Providers, Theme, Size & Shape, Position, Quote, Taskbar strip
(Windows), Desktop (Linux), and General. Provider order and the featured provider
are under Providers. Theme includes Palette, Mode, Colors and Provider colors;
theme-specific details appear only when applicable. General contains Start at
login, Show extra windows and diagnostics.

Size & Shape starts with shape cards and six size choices. Each choice displays
the actual fitted pixel dimensions, including DPI and fine-tuning. Oversized fixed
presets are disabled. Fit screen uses Largest, 3/4, 1/2 or 1/3 with independent
fine-tuning; the strip uses width as its main axis. Every size, including Ctrl +/-
shortcuts, stays inside the work area and covers at most 50% of its available
area (35% for the portrait compact strip). Theme and shape changes preserve the
saved size mode, preset and fine-tune. Position starts with the monitor map and
corner presets; manual reserved edges are under Advanced. Existing files remain
compatible, including named corner positions and Free placement ratios.

Changes preview live. Save and Revert activate for unsaved changes. Save verifies
the persisted settings by loading them again before displaying a saved time;
errors remain visible and can be retried.
