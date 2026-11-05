# Polybar (X11)

With quotacore installed for the desktop's `python3` (see [packaging](../../packaging/README.md)):

```sh
mkdir -p ~/.config/polybar
cp integrations/polybar/config.ini ~/.config/polybar/ai-usage.ini
```

Include the file in your current config and add `ai-usage` to `modules-right`. The script polls the shared snapshot every 30 seconds. Use `--providers` and `--window` to choose the compact view. Uses your existing bar font and colors.

Native desktop screenshots and compatibility acceptance are still pending.
