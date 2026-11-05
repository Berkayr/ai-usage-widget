# Waybar (Hyprland / Sway)

With quotacore installed for the desktop's `python3` (see [packaging](../../packaging/README.md)), run from the repository root:

```sh
mkdir -p ~/.config/waybar
cp integrations/waybar/config.jsonc ~/.config/waybar/ai-usage.jsonc
cp integrations/waybar/style.css ~/.config/waybar/ai-usage.css
```

Merge the custom module into your existing config and import the CSS. These files do not replace your bar. Polls every 30 seconds; thresholds are 50% and 80%. The tooltip includes all windows. GTK theme colors supply foreground/warning/error colors. Use `--window weekly` or `both` as needed.

[Panel layout illustration](../../docs/screenshots/waybar.png) uses fictional data and HTML; native desktop rendering requires separate acceptance.
