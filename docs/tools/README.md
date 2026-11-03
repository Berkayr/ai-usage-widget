# Reproducible documentation images

From the repository root:

```sh
node docs/tools/screenshots.mjs
```

Requires installed app dependencies (`app/node_modules`), Node with built-in `fetch` and `WebSocket` (Node 22+ recommended), and `google-chrome-stable` on PATH. Override the executable using `CHROME_BIN`. No browser automation dependency is installed. The command builds the app, serves only documentation scenes/assets and the built frontend on an ephemeral loopback port, and drives headless Chrome through the DevTools Protocol.

Every run uses a fresh temporary browser profile; locale, timezone and clock are fixed. The process never starts Tauri, quotacore, provider CLIs, or a real desktop session. The only quota input is [fixtures/quotas.json](fixtures/quotas.json), a wholly fictional dataset with `DEMO` plan labels. The fixture hook in `app/src/main.js` is gated on explicit `?sample`; it cannot override native production data without that query flag. Sample mode does not save native settings. Do not pass personal data into fixtures.

Output is `docs/screenshots/*.png`. All scenes use 2× device scale except the social card, which is exactly 1280×640 for GitHub upload. SVG logos remain vector assets. Change a fixture, palette or frame size in the script and rerun; launch it from any working directory. Generated screenshots are intentional versioned documentation assets, not runtime output.

Hero, size, palette, scale, state and settings scenes embed the **built application UI**. Taskbar, KDE Breeze and Waybar scenes are HTML illustrations, not native desktop captures. `NO_SUBSCRIPTION` is hidden by the actual renderer; the states image shows stale, authentication and rate-limit states in Terminal and Retro LCD. Settings screenshots show the top of a scrollable panel. The current layout contract is documented in [the design specification](../design-spec.md).

Chrome's sandbox stays enabled by default. Restricted development environments can explicitly opt out with `SCREENSHOT_NO_SANDBOX=1`; only use that override with these trusted local fixtures. It needs loopback socket access. In an environment that denies sockets, rerun with the appropriate local execution permission. It does not need internet access once dependencies are present. Browser profile and servers are cleaned up on completion. Inspect every PNG after changing UI or fixtures; native desktop acceptance and design review remain separate.

Theme captures include `themes.png`, `themes-light.png`, and `themes/<id>-dark.png` / `-light.png`. Hero and social preview pair the logo with Dot Matrix / Ember on a dark surface. System light/dark stays in `system.png`. Theme galleries mix dark and light designs in two rows; size and scale scenes use a different theme for each frame. `checks/<id>-dark.png` / `-light.png` put the 340/200 px × 100/150% scale combinations side by side (72 cases total). Additional state scenes exercise stale/auth/rate-limit and extra/unknown windows. `checks/results.json` records provider counts, horizontal overflow, minimum visible text/number sizes, secondary text contrast and the one-active-theme-style invariant. The same browser then exercises every theme selector, appearance, 50/300% scale and the extra-window toggle, Color mode and all 12 Accent edge/position combinations. Fit frames are measured after font loading.

Marketing scenes use Vivid for palette variety; System and check scenes use Calm unless stated otherwise. The accent edge stays off. `checks/vivid.png` compares Calm and Vivid. Readability checks require labels ≥11 CSS px and primary numbers ≥15 CSS px at 100% (scaled proportionally at 150%), with secondary text contrast ≥4.5:1. Contrast is calculated from computed text colors and composited background-color layers against the least favorable black/white desktop polarity; background images and compositor effects require visual review. `checks/` remains ignored.

`SCENE=checks/providers- node docs/tools/screenshots.mjs` captures first-run provider consent in all ten themes in dark/light modes and checks default-off choices, wrapped disclosures and explicit Start behavior. These controls use synthetic detection only.

Mono adds `mono.png` (all ten themes), `checks/mono-light.png`,
`checks/mono-thresholds.png` (0/49/50/79/80/100/unknown), and
`checks/dots-{200,340,520,700}.png`. Mono uses a neutral gallery background.
Width checks assert visible per-window mark counts (10 in XS, otherwise 20)
and record mark widths alongside the other metrics. Interaction checks exercise
10/20/30 selection and resize the same frame into XS. Boundary checks assert
warning at exactly 50%, danger at exactly 80%, and the first hollow warning mark.
Filtered runs save their numeric results under `checks/<SCENE with slashes
replaced by hyphens>.json`; unfiltered runs continue to write `checks/results.json`.

System is the default theme. `checks/system-matrix-dark.png` and
`checks/system-matrix-light.png` cover 200/340/520 CSS px × Calm/Mono (12 cases).
These scenes emulate the OS color preference with Appearance set to Auto and
assert the resolved mode, system font stack, 8 px corners and continuous bars.
System is excluded from dot-count assertions because its meters are continuous;
its quota severity thresholds are still checked. Native accent support is recorded
in the results; actual WebView2/WebKitGTK desktop rendering needs platform checks.

Typography checks use a single “8” probe in every visible numeric style, with
computed font properties copied from the real number element. DOM rectangle
height/width ratios are measured at 200/340/520/700 CSS px × 75/100/150% for all
nine themes. `checks/typography.json` records each measurement; the capture fails
if the ratio range exceeds 3%. `SCENE=checks/typography` runs just this matrix.
This measures the glyph layout box, not the image pixel ink bounding box.

## Settings window and full contrast audit

The settings panel is now a separate document. Run these from the repository root:

```sh
npm --prefix app run build
node docs/tools/settings-check.mjs
node docs/tools/contrast-audit.mjs
```

`settings-check.mjs` verifies categories, palette selection/reset, Save/Revert,
placement/Center/Cancel and horizontal overflow at the 640 × 480 minimum size.
It also injects a wholly synthetic IPC bridge to verify live preview without
saving, latest-value ordering, dirty-close interception, Discard, Cancel, Esc,
Ctrl+S and clean close. No native provider or settings command runs. It writes
`settings-preview-light.png` and `settings-preview-dark.png` beside this file.
These are browser previews; actual native window decorations and Wayland dragging
need desktop review. `SCENE=settings- node docs/tools/screenshots.mjs` captures the
separate settings view in the documentation gallery.

The contrast tool uses Vite preview and a fresh headless Chrome profile. It checks
every visible direct text node against its computed/composited background, including
alpha and ancestor opacity. The large-text exception is 3:1; other text requires
4.5:1. Failures print a table and return status 1. All input is synthetic. The matrix
uses opaque widget surfaces; unknown desktop pixels below 70% surface opacity are
handled by the documented text shadow and require native visual inspection.
`CHROME_BIN` selects Chromium/Edge (default `/opt/google/chrome/chrome`);
`CHROME_NO_SANDBOX=1` is only for an already isolated environment without browser
user namespaces. The browser sandbox is enabled by default.

For native memory measurements, build a **debug** binary into a temporary target
and run the existing isolated soak with its new option:

```sh
CARGO_TARGET_DIR=/tmp/ai-usage-test-target npm --prefix app run tauri -- build --debug --no-bundle
AI_USAGE_SETTINGS_TEST_POSITION=1920,0 python3 scripts/memory_soak.py --binary /tmp/ai-usage-test-target/debug/ai-usage --monitor eDP-1 --settings-cycles 4 --output /tmp/ai-usage-settings-soak
```

The existing 120-second scope/timeout, 1500 MB memory limit, disabled swap and
synthetic temporary home/config/state remain mandatory. On Linux, pass an unused
screen with `--monitor eDP-1` (replace the name for your layout). This positions the
widget. For settings, set `AI_USAGE_SETTINGS_TEST_POSITION=x,y` to logical pixel
coordinates on that same unused screen; `1920,0` above is only an example, verify
your layout first. Wayland compositors may ignore requested positions for normal
windows: verify placement on the unused screen before accepting this run. The
variable is ignored by release builds. Never run native
soak on the main display.

One warm-up opens at 15s and hides at 19s, before the 30-second baseline. Four
measured cycles show and hide the same lazy settings webview; each injects 20 monitor notifications into the same debounce
path used by native monitor events. The output includes creation/reuse/open/close counts, coalesced monitor applications,
and scope-local `ps` PID/PPID/name/RSS plus WebKit WebProcess counts. No command
lines are collected. At 30/50/70/90/110s it compares settled memory with the warmed
30s baseline: each later cycle must retain at most **15 MiB total** over that
baseline (not 15 MiB per cycle). This allows allocator/compositor noise while
rejecting the observed ~70 MiB per-cycle leak and smaller cumulative leaks.
The separate <20 MiB range check still includes every sample after warm-up / 30s,
including open windows; snapshot read and render latency checks remain in force.
The instrumentation exists only in debug builds and creates no worker in normal
operation. Real cable disconnect/reconnect and unsaved close dialogs are separate
manual desktop checks.

Settings contrast is included in `node docs/tools/contrast-audit.mjs`: light and
dark schemes, all six categories (including a synthetic Linux layer-shell panel),
clean/dirty/hover states, native fields and disabled controls. Enabled text requires
4.5:1; disabled text requires 3:1. A second pass replaces CSS system color keywords
with deliberately incompatible GTK-like values (light ButtonFace and white
ButtonText on dark Canvas), including a fallback rule for unstyled controls.
This models keyword resolution, rather than relying on Chrome's system palette.
It is not a WebKitGTK execution test.

`node docs/tools/widget-layout-check.mjs` exercises the production renderer with
synthetic empty/long/short snapshots at 160/340 × 400/960 px, fit on/off. It checks
mutually exclusive empty/card DOM, header/list/footer bounds and scroll access to
the last card. A legacy CSS fixture must fail the viewport assertion. The capture
`widget-layout-preview.png` uses invented provider names and values. Settings
captures are `settings-preview-light.png` and `settings-preview-dark.png`.


## Fixed shell, theme identity

`node docs/tools/size-audit.mjs` measures all ten themes × three shapes × five presets ×
0/1/3/6 providers (540 cases, ±2 CSS px) and writes `size-audit.json` and
`size-sheet.png`. The outer size stays 340 × (116 + 210 × provider count) at
Medium. Compact Strip retains its separate horizontal size contract.
Brutalist and Circular Rings share the provider budget across two columns;
an odd last card fills the last row. Their cell heights follow the row budget,
rather than the 200 px height used by single-column cards.

`node docs/tools/theme-identity-check.mjs` checks all ten themes × three shapes × five presets ×
1/2/3/4/5/6 providers × dark/light, including both square pages for five/six
providers (1800 cases), and writes
`theme-identity-results.json`. Synthetic DEMO plans and countdowns exercise real
text widths. It checks card overflow, signature DOM and geometry: Brutalist's
2.4× display numbers and uppercase labels, two provider columns, concentric
rings at least 45% of card width with visible center text, paired Frosted Glass
capsules and LCD columns, and Terminal rules inside the shell without text
crossings. System bars, Dot Matrix marks, Minimal Pace labels and Compact Strip's
horizontal arrangement are also asserted. Every card's trailing blank space is
measured from actual text ranges and meter/ring bounds, rather than stretched
layout wrappers, and must stay within 25% of the card height (1 px rounding
tolerance). Space below the last card is checked against the same budget.
Ring text rectangles (including three-digit percentages) must fit inside the
innermost track, accounting for stroke width and letterboxing. Odd square cards
must fill the last row with adjacent primary/secondary metrics; both pages are
checked explicitly. The JSON records the maximum ring text radius ratio, card
ratio, and last-card list gap for each case. Normal preset widths preserve these
layouts at every scale; externally narrowed viewports (below 18 root-font units) use a single column and
scroll access. Display type uses `--size-font-display` in rem, with no glyph scaling.

`node docs/tools/shape-preview.mjs` checks square pagination and transitions and
produces `docs/screenshots/shapes.png` from nine themes with fictional data.
Landscape and square have fixed 680 × 340 / 340 × 340 Medium boxes. Their theme
identity checks include the 9 CSS px text floor and 25% trailing-space budget.
Contrast checks cover both shapes in addition to the portrait viewport matrix.

Round-shape checks extend the matrix to all five shapes (900 size cases,
2880 identity cases). Circle checks every painted text rectangle against the
circular boundary, plus the inner content area; pill checks text against the
capsule boundary. Both enforce the 9 CSS px floor, the three-provider cap,
and text/container overflow checks. For targeted iteration, use
`AUDIT_SHAPES=circle,pill node docs/tools/theme-identity-check.mjs`.
The shape preview includes all five geometries for every theme, using fictional
providers only. Settings checks exercise Circle/Pill dimensions and provider
selection as well as the existing Save/Revert/close/reopen flow.

`node docs/tools/circle-preview.mjs` produces `circle-sheet.png`: all ten
circle themes at Medium with three fictional providers, paired dark/light.
The sheet uses a transparent canvas and asserts all 72 iframe corner pixels
have zero alpha in the captured PNG. Round documents use a light browser canvas
scheme to prevent dark iframe canvases painting opaque rectangular corners;
the widget's resolved theme palette still controls its surface and text.

Circle identity metrics now record stroke width, cap, dot/segment pattern and
number weight for each theme. Legend keys must match the painted ring color,
and legend text must be at least body size (15 px at Medium). Minimal Pace
requires elapsed-time markers. Actual Medium dark circle captures are compared
pixel by pixel; a mean RGBA channel difference below 3/255 produces a similarity
warning in `theme-identity-results.json`. Geometry/signature failures remain
errors. Pill checks compare every visible text range against every other range
in its card, require a gap of at least 3.5 CSS px between label/value wrappers,
and enforce reset hiding before plan hiding: Large and above retain reset
rows, Medium/Small retain only plan metadata, and effective scale below 65% drops
plans and secondary quota rows. The visible text floor remains 9 CSS px.

Provider identity regression: `node docs/tools/provider-identity-check.mjs` uses
three fictional providers with identical OK/warning/danger usage in each scene.
It checks every palette, theme, dark/light appearance and Calm/Vivid/Mono in both
circle and pill: CIE76 ΔE ≥20 for identity colors, three distinct Mono patterns,
endpoint labels, warning/danger endpoint markers, and
stable identities when selecting/reordering known providers. Results are in
`provider-identity-results.json`. Brand-inspired default identities are shared in `app/src/themes/shared/identity.js`.
All seven defaults are checked for contrast and ΔE on every palette surface.
Settings stores optional per-provider `providerColors` overrides and warns about
low contrast or similar choices; threshold colors remain independent.
The circle uses collision-avoiding endpoint badges instead of a central list.
Theme checks include badge bounds and nearby 30/31/32%, 0%, and 99/100% cases.

`node docs/tools/circle-preview.mjs` refreshes the mixed-threshold circle sheet;
`CIRCLE_ALL_OK=1 node docs/tools/circle-preview.mjs` adds `circle-sheet-all-ok.png`.
`node docs/tools/provider-identity-preview.mjs` captures circle and pill side by
side across all three color modes and identical per-provider status. These
commands run only the browser frontend with invented quotas, never the native app.


`node docs/tools/quote-check.mjs` checks optional daily quotes across all ten
themes, five shapes, dark/light appearance and three sizes, with long fictional
text and an unsafe source URL. It generates `quote-sheet.png` (50 views). The
size audit includes quotes off/on; identity checks include the quote sweep;
contrast checks include quote pages and the pill full-text dialog. All fixtures
are synthetic and the browser cannot contact Wikiquote.


Provider layout checks also cover explicit / Auto / None featured selection,
Top / Bottom, hiding, ordering, drag and keyboard controls, and Save / Revert.
`provider-identity-check.mjs` samples PNG arc pixels to compare Calm and Vivid
saturation for every theme. `circle-sheet.png` includes all ten themes, with
Calm / Vivid / Mono rows and dark / light columns. Reactor motion defaults off;
`theme-identity-check.mjs` checks opt-in and reduced-motion behavior.
