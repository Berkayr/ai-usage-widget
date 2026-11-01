# GNOME Shell 45–49

Requires quotacore installed for GNOME's `python3` (see ../../packaging/README.md). From the repository root:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions/ai-quota@aiquota.dev
cp integrations/gnome-extension/{metadata.json,extension.js,stylesheet.css} ~/.local/share/gnome-shell/extensions/ai-quota@aiquota.dev/
gnome-extensions enable ai-quota@aiquota.dev
```

Log out and back in on Wayland if GNOME has not discovered the new extension yet, then enable it. Shows session usage in the top bar; click for every window and state. Polls the shared snapshot asynchronously every 30 seconds. Disabling cancels the timer/process. Shell theme supplies normal colors; bold/underline distinguish warning/critical without relying on a fixed palette.

To use a virtual environment, replace the `python3` argv in extension.js with its absolute interpreter path before installing. The ESM metadata targets 45–49; runtime compatibility on each version still needs testing.

Screenshot location: `docs/screenshots/gnome-panel.png` (pending Claude review; fictional data only).
