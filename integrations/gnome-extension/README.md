# GNOME Shell 45–49

Requires the `quotacore` package launcher on GNOME's PATH, or quotacore installed for GNOME's `python3` (see [packaging](../../packaging/README.md)). From the repository root:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions/ai-usage@aiusage.dev
cp integrations/gnome-extension/{metadata.json,extension.js,stylesheet.css} ~/.local/share/gnome-shell/extensions/ai-usage@aiusage.dev/
gnome-extensions enable ai-usage@aiusage.dev
```

Log out and back in on Wayland if GNOME has not discovered the new extension yet, then enable it. Shows session usage for every OK/STALE provider in the shared snapshot; click for provider labels, plans, states and visible quota windows. Hidden extra windows and windows without values are omitted. Menu windows have a thin drawn bar, percentage and reset countdown. Polls the shared snapshot asynchronously every 30 seconds. Disabling cancels the timer/process. Shell theme supplies normal colors. Warning (50–79%) and error (80%+) classes and the Shell symbolic warning/error palette color only usage values and bar fills; there are no fixed RGB colors. Theme changes repaint the bars and update percentage text.

The extension prefers `quotacore` on PATH and falls back to `python3 -m quotacore`; if unavailable it displays a single-line installation hint. To use a virtual environment, expose its `quotacore` launcher to the desktop PATH or replace the fallback `python3` argv in extension.js with its absolute interpreter path before installing. The ESM metadata targets 45–49; runtime compatibility on each version still needs testing.

Native desktop screenshots and compatibility acceptance are still pending.
