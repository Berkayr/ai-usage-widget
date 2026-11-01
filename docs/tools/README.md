# Reproducible documentation images

From the repository root:

```sh
node docs/tools/screenshots.mjs
```

Requires installed app dependencies (`app/node_modules`), Node with built-in `fetch` and `WebSocket` (Node 22+ recommended), and `google-chrome-stable` on PATH. Override the executable using `CHROME_BIN`. No browser automation dependency is installed. The command builds the app, serves only documentation scenes/assets and the built frontend on an ephemeral loopback port, and drives headless Chrome through the DevTools Protocol.

Every run uses a fresh temporary browser profile; locale, timezone and clock are fixed. The process never starts Tauri, quotacore, provider CLIs, or a real desktop session. The only quota input is [fixtures/quotas.json](fixtures/quotas.json), a wholly fictional dataset with `DEMO` plan labels. The fixture hook in `app/src/main.js` is gated on explicit `?sample`; it cannot override native production data without that query flag. Sample mode does not save native settings. Do not pass personal data into fixtures.

Output is `docs/screenshots/*.png`. All scenes use 2× device scale except the social card, which is exactly 1280×640 for GitHub upload. SVG logos remain vector assets. Change a fixture, palette or frame size in the script and rerun; launch it from any working directory. Generated screenshots are intentional versioned documentation assets, not runtime output.

Hero, size, palette, scale, state and settings scenes embed the **built application UI**. Taskbar, KDE Breeze and Waybar scenes are HTML illustrations, not native desktop captures. `NO_SUBSCRIPTION` is hidden by the actual renderer; the states image explains it with an external badge instead of fabricating a provider card. Settings screenshots show the top of a scrollable panel. The original design references live under `tasarim/v3/panel/`.

Chrome's sandbox stays enabled by default. Restricted development environments can explicitly opt out with `SCREENSHOT_NO_SANDBOX=1`; only use that override with these trusted local fixtures. It needs loopback socket access. In an environment that denies sockets, rerun with the appropriate local execution permission. It does not need internet access once dependencies are present. Browser profile and servers are cleaned up on completion. Inspect every PNG after changing UI or fixtures; native desktop acceptance and design review remain separate.

Theme captures include `themes.png`, `themes-light.png`, and `themes/<id>-dark.png` / `-light.png`. Hero and social preview compose multiple real themes. `checks/<id>-dark.png` / `-light.png` put the 340/200 px × 100/150% scale combinations side by side (64 cases total). Additional state scenes exercise stale/auth/rate-limit and extra/unknown windows. `checks/results.json` records provider counts, horizontal overflow, minimum visible text/number sizes, secondary text contrast and the one-active-theme-style invariant. The same browser then exercises every theme selector, appearance, 50/300% scale and the extra-window toggle, Color mode and all 12 Accent edge/position combinations. Fit frames are measured after font loading.

All widget scenes use Calm with the accent edge off. `checks/vivid.png` compares Calm and Vivid. Readability checks require labels ≥11 CSS px and primary numbers ≥15 CSS px at 100% (scaled proportionally at 150%), with secondary text contrast ≥4.5:1. Contrast is calculated from computed text colors and composited background-color layers against the least favorable black/white desktop polarity; background images and compositor effects require visual review. `checks/` remains ignored.

`SCENE=checks/providers- node docs/tools/screenshots.mjs` captures first-run provider consent in all eight themes in dark/light modes and checks default-off choices, wrapped disclosures and explicit Start behavior. These controls use synthetic detection only.
