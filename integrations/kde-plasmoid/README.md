# Plasma 6 panel widget

Requires Plasma 6, Kirigami, Plasma5Support's executable data engine, and quotacore (see ../../packaging/README.md). The widget first uses the `quotacore` package launcher on PATH, then falls back to `python3 -m quotacore`. If neither is available, it shows an installation hint. From the repository root:

```sh
kpackagetool6 --type Plasma/Applet --install integrations/kde-plasmoid
```

Add **AI Quota** to your panel using Add Widgets. For updates use `--upgrade` instead of `--install`. Click the compact display to open provider cards with plan/state badges, 20 circular dots per quota window, reset countdowns and snapshot age. Hidden extra windows and windows without a numeric value are omitted. Normal text stays in the theme foreground; only usage text and bars use neutral (50–79%) or negative (80%+) Kirigami roles. Light/dark theme changes are automatic.

The compact display adapts to horizontal/vertical panels and available height. Open **Configure AI Quota → General** to choose Claude/Codex/Gemini, session/weekly/both, bar/dots/none, and a snapshot read interval (10–3600 seconds, default 30). Both uses the highest selected percentage in the mini display; expand for individual windows. A `*` marks stale usage.

Periodic reads are passive. The **Refresh** button explicitly runs `quotacore write`, which can contact configured providers using existing local credentials, then rereads the snapshot. It does not initiate login. Refresh errors keep the previous cards visible with an error message. No providers selected shows an empty state.

Screenshot location: `docs/screenshots/kde-panel.png` (pending Claude review; fictional data only).

Severity colors default to **Classic**: amber at 50–80% and red above 80%, with darker tones on light panels. Choose **Color scheme** in configuration to use Kirigami neutral/negative text colors instead.
