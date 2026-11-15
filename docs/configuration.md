# Configuration

Display settings and quota collection settings are separate. Change display settings using the gear button; do not edit files while the widget is saving them. The browser's `?sample` mode uses synthetic data and never saves native settings.

Theme defaults to System when no choice is stored; an existing explicit theme is preserved. Theme and appearance fields persist in `settings.json`; optional webview cache values are also kept for startup.

## Additional widget records

The root display settings remain the `main` widget. An optional `widgets` array
creates additional `widget-<id>` windows at startup and after settings are saved;
an empty array is omitted on save. Removing a record closes its window. The
settings sidebar selects Main or an additional widget by name and monitor.
Choose Add widget… to select any connected display (including Main's display)
and name a new widget. New widgets inherit Main until a field is changed.
Additional widgets can be renamed or removed with an inline confirmation.
Disconnected widgets remain editable and are marked as hidden until their
monitor returns.

```json
{
  "widgets": [{
    "id": "side-2",
    "name": "Secondary display",
    "placement": {"monitor": "Synthetic display", "disconnected": "hide"},
    "overrides": {"theme": "terminal", "historyMode": "panel", "linux": {"margin": 16}}
  }]
}
```

IDs must match `[a-z0-9-]{1,24}`, be unique, and cannot be `main`. Additional
widgets require a nonblank `placement.monitor`; invalid entries are skipped
with a diagnostic. Their `placement.disconnected` is always normalized to
`hide`, so the stored policy never moves them to another display. A missing
monitor hides the window; reconnecting it restores the saved placement. On
Wayland, an unmapped or compositor-closed layer surface is recreated when its
monitor is available again. Main retains its existing disconnection policy.
Only Main owns the Windows taskbar strip.

Overrides accept only `theme`, `shape`, `scale`, `sizePreset`, `fineTune`,
`sizeMode`, `fitFraction`, `fitFineTune`, `fitHeight`, `matchPhysicalSize`,
`appearance`, `palette`, `accent`, `background`, `widgetOpacity`,
`backgroundOpacity`, `colorMode`, `dotCount`, `accentEdge`, `historyEnabled`,
`historyMode`, `historyCost`, `historyModels`, `historyHeatmap`, `historyMachines`,
`historyPanelOpen`, `showExtraWindows`, `widgetProviders`, `featuredProvider`,
`featuredPosition`, `quoteEnabled`, `quoteMode`, `quotePosition`, `quoteNavigation`,
`position`, `lockPosition`, `placementEditing`, `reservedTop`, `reservedBottom`,
and nested `linux.layer` / `linux.margin`. Other override keys are discarded;
invalid values reject the entry. `userPalettes`, `providerOrder`, `providerColors`,
`hiddenProviders`, `taskbar`, `linux.monitor`
and all remaining fields are shared at the root.

The native `load_settings` and `save_settings` commands accept optional
`widgetId` (default `main`); unknown IDs return an error. Loading an additional
widget merges its overrides into the root settings and uses its own placement.
Saving it stores differences from the root as overrides, removes overrides
reset to the root value, and writes changed shared fields to the root. Main
calls retain the existing behavior. Additional-widget saves preview the root
main settings and update each additional window with its effective settings.
Settings previews addressed with `widgetId` reach only that widget; optional
`rootSettings` supplies the unsaved root, including newly added widget records.
A new window is created on Save. Shared rows are marked Shared by all widgets;
Reset to Main removes the selected category's overrides. The unsaved count,
Save and Revert cover Main and all additional widgets together, and Save writes
the settings file once before synchronizing windows.

Older application versions discard `widgets` when saving the settings file.

## Display settings

`settings.json` lives in the operating system's config directory under `ai-usage`: Linux `$XDG_CONFIG_HOME/ai-usage` (normally `~/.config/ai-usage`); Windows `%APPDATA%/ai-usage`. Window geometry is saved separately in `window.json`. `QUOTACORE_HOME` does **not** relocate display settings. First launch copies legacy settings and window geometry once, preserving the originals and any existing new settings.

| Field | Default | Meaning |
| --- | --- | --- |
| `theme` | `system` | System, Dot Matrix and fifteen other designs; selected in Settings → Theme. |
| `appearance` | `auto` | `auto`, `light`, `dark`; auto follows OS color preference live. |
| `colorMode` | `calm` | Neutral or system-accent usage below 50%, soft amber from 50%, muted red from 80%; `vivid` restores theme colors. |
| `accentEdge` | `off` | `off`, `auto`, `left`, `right`; Auto follows the selected corner, with no edge in Free placement. |
| `palette` | Theme dependent | Twelve built-in choices per theme, including theme-specific defaults. Dot Matrix includes `slate`, `ember`, `sakura-pink`, `nord` and `mono-paper`; custom palettes are shared across themes. |
| `userPalettes` | absent | Up to 50 custom palettes, available on every theme; format below. |
| `accent`, `background` | `null` | Optional CSS color overrides; choosing a palette clears these overrides. |
| `widgetOpacity` | `100` | Surface opacity; text remains opaque. UI range 20–100. |
| `backgroundOpacity` | `100` | Background opacity, 0–100; this does not enable compositor blur. |
| `scale` | `100` | Derived text and layout scale, 10–300%; presets 85/100/120/150/200 multiplied by fine-tune. Ctrl +/− changes the active fine-tune by 5; Ctrl+0 resets that fine-tune to 100. Work-area and coverage limits apply. |
| `sizeMode`, `sizePreset`, `fineTune` | `fixed`, `Medium`, `100` | Fixed preset and independent 50–150% fine-tuning, under Settings → Shape & Size. |
| `fitFraction`, `fitFineTune` | `1`, `100` | Screen share (1, .75, .5, 1/3) and separate 50–150% fine-tuning for Fit screen. Effective only for Portrait except Compact Strip; other shapes retain the choice but use their preset. Portrait Fit width is capped at 30% of available width. |
| `reservedTop`, `reservedBottom` | `null` | Auto detected insets; explicit logical pixel overrides under Settings → Display → Advanced. |
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

XS/S/M/L are descriptive responsive layouts, not selectable settings. Current CSS uses ≤219 px for XS and 220–320 px for S at 100% scale; larger widths use detailed cards, with more space at 520 px or 700 px height. Portrait provider grids follow the theme and featured-provider settings; Landscape and Square use shape-specific columns. The theme metadata's nominal tier widths are not runtime breakpoint selectors.

## Collector configuration

Linux data: `$XDG_STATE_HOME/quotacore` or `~/.local/state/quotacore`. Linux config: `$XDG_CONFIG_HOME/quotacore` or `~/.config/quotacore`. On Windows both use `%LOCALAPPDATA%/quotacore`. `QUOTACORE_HOME` overrides both for the collector and the shared snapshot location for the widget.

`config.json` configures enabled providers, display ordering and daemon collection interval (minimum 30 seconds; default 300). The native widget currently refreshes on startup and every 300 seconds independently of that daemon setting. Initial creation disables every provider until the shared consent screen or `quotacore init` is completed. `quotacore configure claude codex` explicitly selects providers, while `quotacore configure` disables all. Newly introduced providers and entries without `enabled` default off. Existing explicit configurations are preserved.

```json
{
  "interval": 300,
  "initialized": true,
  "providers": {
    "claude": {"enabled": true, "order": 0, "local_history": false},
    "codex": {"enabled": true, "order": 1},
    "gemini": {"enabled": false, "order": 2}
  }
}
```

Set `providers.claude.local_history` to `true` to add a 30-day usage summary from local Claude Code logs to the Claude snapshot. It defaults to off. The summary contains token counts, model names, local day/hour and machine-type aggregates, plus estimated Anthropic API price equivalents; it is not a subscription bill. If project logs sync between computers, their sessions are grouped by machine type; two computers of the same type cannot be distinguished. `python3 -m quotacore history [--json]` computes the summary once independently of this setting.

The state directory contains `snapshot.json`, provider observations/caches, and optional [pace](pace.md) files. Local `secrets.json` may contain API keys under `openrouter`, `deepseek`, `zai`, `moonshot`, `siliconflow`, `openai_admin` and `anthropic_admin`; never include it in an issue or commit. Environment API keys take precedence.

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

Navigation is General, Quote, Theme, Colors, Shape & Size, Display, Providers,
History, Taskbar (Windows only), and About. The last selected category is remembered locally. Up / Down moves
between categories; below 560 px the menu becomes horizontal tabs, with Left /
Right also supported. Tab moves from the selected category to its controls.
History displays daily token totals when a provider supplies them; Claude's local history is optional and reads local Claude Code logs.

Provider order and the featured provider are under Providers, alongside the
unchanged provider detection, consent and logo rows. Drag or use the ↑ / ↓ buttons to reorder
the list with live preview; Save keeps it. `featuredProvider: "first"` (First in list) is the
new-install default. `"auto"` (Highest usage) selects the largest quota percentage
across windows; the hint names the selection and explains that reordering cannot
change it. A provider ID pins that provider; `"none"` disables the selection.
Unknown or unavailable IDs safely select no provider. Missing settings preserve
legacy behavior (last Portrait cell, highest-usage Circle center).

Portrait features one card only with an odd visible count, whether quotes are on
or off; `featuredPosition: "top" | "bottom"` places that card. Even counts use
equal cards. Square uses equal rows and moves the selected provider within each
page. Landscape and Pill use list order and ignore featured choice and position.
Circle uses the featured choice for its center and ignores position. Circle and
Pill first apply Providers on this widget (up to three) and visibility, then order
and featured selection.

Theme selects a design. Colors contains palettes, mode, colors and provider colors.
Shape & Size contains shape and size controls; Display contains position and Linux
desktop layer controls. Theme-specific details appear only when applicable. General
contains Start at login and Show extra windows. Quote contains daily quote controls,
including the existing privacy disclosure. About contains the
app version, runtime diagnostics and the platform data folder convention
(including the `QUOTACORE_HOME` override). No new refresh or notification setting
is introduced.

Shape cards and six size choices are grouped under Shape & Size. Each choice displays
the actual fitted pixel dimensions, including DPI and fine-tuning. Oversized fixed
presets are disabled. Fit screen uses Largest, 3/4, 1/2 or 1/3 with independent
fine-tuning; the strip uses width as its main axis. Every size, including Ctrl +/-
shortcuts, stays inside the work area and covers at most 50% of its available
area (35% for the portrait compact strip). Theme and shape changes preserve the
saved size mode, preset and fine-tune. Position starts with the monitor map and
corner presets; manual reserved edges are under Advanced. Existing files remain
compatible, including named corner positions and Free placement ratios.

Changes preview live on the widget without writing settings. Provider selection
also previews live; provider consent and autostart persist only on Save. The footer
counts changed top-level settings, provider selection and autostart; Save and Revert activate only while changes exist. Map placement is
also a draft: Place widget enables the map, Use position accepts it, and the
footer Save keeps it. Save verifies the persisted settings by loading them
again before displaying a saved time; errors remain visible and can be retried.
Revert restores the saved settings on the widget as well as in the form.
Closing with changes offers Save, Discard or Cancel. Settings use system fonts and shared chrome colors for legibility in
light and dark mode, independently of the selected widget theme.

## User palettes

Settings → Colors shows six palette swatches initially; **Show all** expands the list.
**New palette** and **Duplicate** copy the current colors. **Edit palette** edits
its name and both appearances with palette swatch previews in settings. Low contrast produces a warning
without blocking edits or Save. Revert restores saved palettes and selection.
Delete requires an in-page confirmation; deleting the selected palette restores
the theme's first built-in palette. Export writes all user palettes to the panel's
JSON textarea. Import merges by id (matching ids are replaced) and selects the
first imported palette. Save persists the result; export text alone is not saved.

`userPalettes` is an optional array. Each entry has `id`, `name`, `dark`, and
`light`. Its id must match `user-[a-z0-9-]{1,64}` and be unique. A name is plain
text, 1–40 Unicode characters, with no angle brackets or control characters.
Both color objects require every token shown here:

```json
{
  "id": "user-example",
  "name": "Quiet evening",
  "dark": {
    "bgWidget": "#111820", "bgCard": "#18212b", "bgTrackOff": "#354352",
    "textPrimary": "#f4f6fa", "textSecondary": "#c2ccd6", "textMuted": "#a2afbc",
    "border": "#526070", "accent": "#a3c6ed", "severityNormal": "#a3c6ed",
    "severityWarning": "#f0c479", "severityDanger": "#f4a5ad"
  },
  "light": {
    "bgWidget": "#f0f4f8", "bgCard": "#ffffff", "bgTrackOff": "#cad4df",
    "textPrimary": "#111820", "textSecondary": "#354352", "textMuted": "#526070",
    "border": "#8897a7", "accent": "#27588d", "severityNormal": "#27588d",
    "severityWarning": "#805000", "severityDanger": "#a32838"
  }
}
```

Import an array containing entries like this one. Colors accept only `#rgb`,
`#rrggbb`, or `#rrggbbaa`. Surface colors retain alpha; contrast calculations composite colors against the
palette's surfaces. Rust validates settings load/save and preview; the
frontend also validates imports and colors before applying them. Unknown keys are
dropped. Invalid imports reject the entire operation and display an error.
Invalid palettes on disk are discarded with a Settings warning while other valid
settings recover. Missing or deleted selected ids fall back to the theme's first
palette. Built-in ids and their ordering are preserved.

### Widget usage history

The History settings category controls whether supplied token history is shown.
Choose **Under each card** (14 days), **Click a card** (the default, 30 days),
or **Side panel** (7 or 30 days, in the same window). Enter or Space expands
one card at a time. The side arrow opens toward the inside of the screen and
remembers its open state. Providers without history have no history controls.

**Read Claude Code logs** defaults to off and is saved separately in the
collector configuration as `providers.claude.local_history`. Turning it off
stops future reads; refresh replaces the previous snapshot. Previewing or
reverting settings does not change this permission. The CLI equivalent is
`python3 -m quotacore local-history on` (or `off`).

API price equivalent, model breakdown, activity heatmap and computer splitting
are optional. Prices are estimates, not bills. Model and activity aggregates
cover all available local history, while chart and price totals follow the
selected range. Computer splitting is available only with two distinct machine
types. Codex supplies account daily totals without these breakdowns; Gemini
does not supply history. Settings and permission changes take effect on Save.
