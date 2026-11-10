# Changelog

Notable changes will be recorded here. No release has been published yet.

## [Unreleased]

### Added

- Optional per-widget settings records with validated monitor placement, inherited display overrides and widget-aware load/save commands.
- Additional widget windows synchronized at startup and on settings saves; each hides when its monitor disconnects and returns to its saved position on reconnection, recreating closed Wayland layer surfaces.

- Usage history below cards, on card activation or in an attached side panel, with optional API price estimates, model shares, activity heatmap and computer splitting.
- History settings with explicit, saved permission to read local Claude Code logs (off by default).

- Clear Glass, Layer, Aurora, Crisp, Pebble, Glyph and Pastel themes with light/dark palettes and picker previews.
- Theme-selected KDE Plasma background blur on Wayland and X11, with a tint fallback on unsupported desktops.
- Theme-selected Windows desktop Acrylic on Windows 11 and Blur on Windows 10, cleared when switching to an opaque theme.

- Windows and Linux desktop widget with seventeen themes, five shapes and shared local quota snapshots.
- Provider opt-in, palette editing/import/export, layout and placement settings.
- Panel integration sources for Plasma, GNOME Shell, Waybar, Polybar and i3blocks.

### Fixed

- Match KDE blur corners to the theme radius for Portrait, Landscape and Square without changing the input mask.

- Prefer the ext background-effect protocol on newer KWin sessions and restrict Wayland/X11 blur to the shared window shape mask.

### Changed

- Route widget commands, native shape/blur/placement state, window geometry files and frontend preferences by widget identity while retaining legacy main files and Main taskbar behavior.

- Older versions discard the optional `widgets` records when saving a newer settings file.

- Group settings into six sidebar categories with remembered selection, keyboard navigation and horizontal tabs below 560 px.
- Preview settings live, with S1 row cards, accessible switches, a counted changes footer and verified persistence on Save; Revert and Discard restore saved settings.

- Inline provider logos, setup guidance for enabled providers without data, and equal Portrait card heights across themes.
- OpenRouter reports missing balance values explicitly without inventing a zero balance.

- Bolder Dot Matrix quota labels, round marks and full-width tracks.
- Refresh the README with all seventeen themes, glass, provider status, sidebar settings and three usage-history layouts, using fictional fixtures. Document optional local-log access and account-wide Codex history.
- Documentation galleries generated from fictional fixtures, with local-link and empty-space checks.

Installers, distribution packages and signing remain part of the v0.1 release plan; see the [roadmap](README.md#roadmap) and [release process](docs/releases.md).
