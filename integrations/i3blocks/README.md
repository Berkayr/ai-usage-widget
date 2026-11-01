# i3blocks (X11 / i3)

With quotacore installed for the desktop's `python3` (see ../../packaging/README.md):

```sh
mkdir -p ~/.config/i3blocks
cp integrations/i3blocks/config ~/.config/i3blocks/ai-quota.conf
```

Merge this block into your existing config. The reader emits full and short text lines and polls every 30 seconds. `--providers` and `--window weekly|both` customize the view. Uses existing panel colors.

Screenshot location: `docs/screenshots/i3blocks.png` (pending Claude review; fictional data only).
