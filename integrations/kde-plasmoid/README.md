# Plasma 6 panel widget

Requires Plasma 6, Kirigami, Plasma5Support's executable data engine, and quotacore installed for the desktop's `python3` (see ../../packaging/README.md). From the repository root:

```sh
kpackagetool6 --type Plasma/Applet --install integrations/kde-plasmoid
```

Add **AI Quota** to your panel using Add Widgets. For updates use `--upgrade` instead of `--install`. Click compact provider rows to expand all quota windows and provider states. Theme text, neutral (50%), negative (80%) and disabled colors follow Kirigami's light/dark palette. Every 30 seconds the executable engine reads the shared snapshot; it never requests credentials or refreshes providers.

Screenshot location: `docs/screenshots/kde-panel.png` (pending Claude review; fictional data only).
