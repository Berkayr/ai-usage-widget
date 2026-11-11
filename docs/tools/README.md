# Reproducible documentation images

From the repository root:

## Acceptance suite

Run the bounded control and behavior checks with:

```sh
node docs/tools/acceptance/run.mjs
```

Run the exhaustive browser matrices once before a public release with:

```sh
node docs/tools/acceptance/run.mjs --full
```

Both modes use synthetic fixtures and never launch the native app or read real
settings. Native window geometry, Windows Explorer/taskbar behavior, autostart
integration and compositor hit-testing remain desktop acceptance items until
the WebDriver CI job is available.

```sh
node docs/tools/screenshots.mjs
```

Requires installed app dependencies (`app/node_modules`), Node with built-in `fetch` and `WebSocket` (Node 22.2+ required for built-in WebSocket and PNG CRC support), and `google-chrome-stable` on PATH. Override the executable using `CHROME_BIN`. No browser automation dependency is installed. The command builds the app, serves only documentation scenes/assets and the built frontend on an ephemeral loopback port, and drives headless Chrome through the DevTools Protocol.

Every run uses a fresh temporary browser profile; locale, timezone and clock are fixed. The process never starts Tauri, quotacore, provider CLIs, or a real desktop session. The only quota input is [fixtures/quotas.json](fixtures/quotas.json), a wholly fictional dataset with `DEMO` plan labels. The fixture hook in `app/src/main.js` is gated on explicit `?sample`; it cannot override native production data without that query flag. Sample mode does not save native settings. Do not pass personal data into fixtures.

Output is `docs/screenshots/*.png` and `docs/screenshots/themes/*.png`. Scenes normally use 2× device scale; README theme sheets and glass use 0.9×, individual themes, history, providers and settings use 1×, and Mono/size sheets use 1× to limit download size. The social card is exactly 1280×640 for GitHub upload. PNG pixel streams are recompressed losslessly at level 9. SVG logos remain vector assets. Change a fixture, palette or frame size in the script and rerun; launch it from any working directory. Generated screenshots are intentional versioned documentation assets, not runtime output.

Hero, size, palette, scale, state and settings scenes embed the **built application UI**. Taskbar, KDE Breeze and Waybar scenes are HTML illustrations, not native desktop captures. `NO_SUBSCRIPTION` is an explanatory card for enabled providers; the states image shows stale, authentication and rate-limit states in Terminal and Retro LCD. Settings screenshots show Appearance with the six-category sidebar in the Windows sample preview. The current layout contract is documented in [the design specification](../design-spec.md).

Chrome's sandbox stays enabled by default. Restricted development environments can explicitly opt out with `SCREENSHOT_NO_SANDBOX=1`; only use that override with these trusted local fixtures. It needs loopback socket access. In an environment that denies sockets, rerun with the appropriate local execution permission. It does not need internet access once dependencies are present. Browser profile and servers are cleaned up on completion. Inspect every PNG after changing UI or fixtures; native desktop acceptance and design review remain separate.

Theme captures include `themes.png`, `themes-light.png`, and `themes/<id>-dark.png` / `-light.png`. Hero captures pair the logo with Dot Matrix / Ember in the corresponding appearance; social preview uses Dark. System light/dark stays in `system.png`. The 17-theme galleries use two sheets per appearance (`themes.png` / `themes-new.png` and their `-light` variants), followed by the horizontal strip; size and scale scenes use a different theme for each frame. `checks/<id>-dark.png` / `-light.png` put the 340/200 px × 100/150% scale combinations side by side (80 cases total). Additional state scenes exercise stale/auth/rate-limit and extra/unknown windows. `checks/results.json` records provider counts, horizontal overflow, minimum visible text/number sizes, secondary text contrast and the one-active-theme-style invariant. The same browser then exercises every theme selector, appearance, 50/300% scale and the extra-window toggle, Color mode and all 12 Accent edge/position combinations. Fit frames are measured after font loading.

Marketing scenes use Vivid for palette variety; System and check scenes use Calm unless stated otherwise. The accent edge stays off. `checks/vivid.png` compares Calm and Vivid. Readability checks require quota window labels ≥13 CSS px, secondary chrome ≥11 CSS px and primary numbers ≥15 CSS px at 100% (scaled proportionally at 150%). Constrained viewports and compacted cards with extra windows retain the production fitter’s 11 px floor. Secondary text contrast ≥4.5:1. Contrast is calculated from computed text colors and composited background-color layers against the least favorable black/white desktop polarity; background images and compositor effects require visual review. `checks/` remains ignored.

`SCENE=checks/providers- node docs/tools/screenshots.mjs` captures first-run provider consent in all original ten themes in dark/light modes and checks default-off choices, wrapped disclosures and explicit Start behavior. These controls use synthetic detection only.

Mono adds `mono.png` (all original ten themes), `checks/mono-light.png`,
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
ten themes. `checks/typography.json` records each measurement; the capture fails
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

`node docs/tools/size-audit.mjs` measures all original ten themes × five shapes × five presets ×
0/1/3/6 providers × quote off/on (2,000 cases), writing `size-audit.json` and
`size-sheet.png`. Portrait ends at intrinsic content within its fit ceiling;
other shapes keep their fixed dimensions. Compact Strip retains its horizontal
width contract and scrolling in externally narrowed viewports.

`node docs/tools/theme-identity-check.mjs` checks all original ten themes × five shapes × five presets ×
1/2/3/4/5/6 providers × dark/light, including both square pages for five/six
providers (3,500 cases including endpoint boundary scenarios), and writes
`theme-identity-results.json`. Synthetic DEMO plans and countdowns exercise real
text widths. It checks card overflow, signature DOM and geometry: Brutalist's
2.4× display numbers and uppercase labels, two provider columns, concentric
rings at least 45% of card width with visible center text, paired Frosted Glass
capsules and LCD columns, and Terminal rules inside the shell without text
crossings. System bars, Dot Matrix marks, Minimal Pace labels and Compact Strip's
horizontal arrangement are also asserted. Every card's trailing blank space is
measured from actual text ranges and meter/ring bounds, rather than stretched
layout wrappers, and must stay within 25% of the card height (1 px rounding
tolerance) outside Square. Square instead verifies equal full-width rows and
vertically centered quota text/meters; its decorative rings are hidden. Pill
uses its space for both windows and hides plan badges. Space below the last card is checked against the same budget.
Ring text rectangles (including three-digit percentages) must fit inside the
innermost track, accounting for stroke width and letterboxing. Square rows
keep adjacent primary/secondary metrics; both pages are
checked explicitly. The JSON records the maximum ring text radius ratio, card
ratio, and last-card list gap for each case. Normal preset widths preserve these
layouts at every scale; externally narrowed viewports (below 18 root-font units) use a single column and
scroll access. Display type uses `--size-font-display` in rem, with no glyph scaling.

`node docs/tools/shape-preview.mjs` checks square pagination and transitions and
produces the ignored `docs/tools/shape-sheet.png` audit sheet from ten themes with fictional data. Published `shapes.png` and `shapes-light.png` come only from `screenshots.mjs`.
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
saturation for every theme. `circle-sheet.png` includes all original ten themes, with
Calm / Vivid / Mono rows and dark / light columns. Reactor motion defaults off;
`theme-identity-check.mjs` checks opt-in and reduced-motion behavior.

Daily quote readability checks (offline fictional data, no native settings):

```sh
npm --prefix app run build
node docs/tools/quote-fit-check.mjs
node docs/tools/quote-position-check.mjs
node docs/tools/settings-check.mjs
node docs/tools/size-audit.mjs
node docs/tools/theme-identity-check.mjs
node docs/tools/contrast-audit.mjs
node docs/tools/quote-readability-preview.mjs after
```

`quote-fit-check` covers ten themes, five shapes, every size, both appearances
and four quote lengths, including work and description metadata. Use
`AUDIT_THEMES=frosted-glass` for a focused run. `quote-position-check` covers
both quote positions at 82% fine tuning on a synthetic 1536×960 Linux output
with a 34px top panel and 12px inset. It uses the same work-area fit calculation
as the application. Native placement's unit test exercises the corresponding
GTK logical coordinates. These tests do not capture or validate a live KWin
layer surface. Run native desktop acceptance separately with isolated settings
and a current-day fictional quote cache; never use a real account for fixtures.
`quote-readability-preview` saves the current Medium/Large/Medium reproduction
and numeric measurements to the ignored task output directory. Its `before`
mode is for capturing the pre-change renderer before rebuilding the new code.
The contrast audit includes all five size presets as well as palettes, shapes,
appearance, color modes, narrowed portrait widths and settings surfaces.

For a native WebKitGTK check on an isolated virtual KWin output:

```sh
python3 docs/tools/native-quote-preview.py
```

This optional development tool needs preinstalled KWin, PyGObject, GTK3,
GtkLayerShell and WebKit2 4.1. It adds no application dependency. A temporary
HOME/config/runtime and private D-Bus session isolate the existing desktop.
A 34px exclusive panel and real layer-shell webview exercise the built
production renderer through Medium → Large → Medium at fine-tune 82, with
synthetic providers/quote only. The run is bounded to 45 seconds, saves native
WebKit snapshots plus layer/allocation measurements under the ignored task
output directory, and removes its temporary profile. It verifies native
rendering and compositor allocation; it does not launch the installed Tauri
application or exercise its IPC. Rust placement tests cover native inset math.

Usage scrollbars and card edges have a separate exhaustive offline matrix:

```sh
node docs/tools/usage-fit-check.mjs
```

It covers all themes, five shapes, five presets, featured none/auto/top/bottom,
quote off/top/bottom and one/two/three fictional providers (9,000 cases), plus
the reported Brutalist Medium 82% portrait. `top`/`bottom` mean auto selection
with explicit placement; `auto` uses default bottom placement. Every visible
list/card must have `scrollHeight <= clientHeight`, `scrollWidth <= clientWidth`,
zero scrollbar width, unclipped card edges and nonoverlapping quota blocks. Results and a fictional screenshot
are saved to `gorevler/ss-ayar/`; use `AUDIT_OUTPUT` for another output directory.
`AUDIT_THEMES`, `AUDIT_SHAPES`, `AUDIT_SIZES` filter a focused run;
`AUDIT_REPRO_ONLY=1` captures just the reported geometry and `AUDIT_CAPTURE`
selects its screenshot name. Native quote preview also explicitly enables
featured auto at the top with three providers and measures usage overflow,
scrollbar widths and card edges through Medium → Large → Medium.

Fit to screen has a separate synthetic screen matrix:

```sh
node --test tests/screen-fit.mjs
node docs/tools/screen-fit-check.mjs
```

The browser matrix covers seven Windows/KDE/GNOME work areas, including 4K
at 150% and 200%, four fractions, five shapes, quote on/off, one/two/three
providers and every theme (8,400 cases). It checks the requested viewport,
visible usage cards and header text. `AUDIT_DISPLAYS` filters display fixture
names and `AUDIT_OUTPUT` selects an ignored output directory. The unit matrix
also covers all five positions, physical size matching and fine-tune limits.
An optional local KDE diagnostic opens no application window:

```sh
cd app/src-tauri
cargo test --offline live_desktop_work_area -- --ignored --nocapture
```

This diagnostic requires access to the local session bus and GTK display and
prints real geometry; keep its output outside the repository.

Shape usability acceptance (headless, synthetic data only):

```sh
CHROME_BIN=/opt/brave-origin-bin/brave node docs/tools/shape-final-check.mjs
CHROME_BIN=/opt/brave-origin-bin/brave node docs/tools/onboarding-shape-check.mjs
CHROME_BIN=/opt/brave-origin-bin/brave node docs/tools/shape-final-sheets.mjs
python3 docs/tools/shape-final-sheets.py
```

The shape matrix covers 10 themes × 5 shapes × 3 presets × quote on/off ×
1/2/3 providers (900 cases), including the 11 CSS px text floor, clipped content,
Square/Pill values and bars, equal Square rows, Pill percentage sizes and hidden
plan chips, and Circle separators. Geometry and effective mode are additionally
covered by `tests/screen-fit.mjs`. `AUDIT_THEMES`, `AUDIT_SHAPES` and `AUDIT_OUTPUT`
allow focused reruns. Captures use 21/33, 8/13 and 30/18; the review sheets and
results go to `gorevler/ss-sekil-final/`. The optional sheet assembly uses the
already installed Pillow and preserves screenshot resolution.

### Portrait spacing

`node docs/tools/portrait-gap-check.mjs` measures all original ten themes, one to three
providers, featured on/off, quote on/off, all five presets and all four screen
fractions at synthetic 1536 × 960 (125% KDE scale) and 1920 × 1080 work areas.
Build first. The existing isolated headless harness is used; nothing reads or
writes native settings. `AUDIT_OUTPUT` selects the JSON output directory.
`AUDIT_BASELINE=1` records failures without returning a failing exit code.
`AUDIT_THEMES`, `AUDIT_COUNTS`, and `AUDIT_CHOICES` optionally narrow a debug run.

Text Range line rectangles and meter/graphic rectangles are projected onto the
vertical axis and merged. Each card and the whole surface record the longest
unoccupied run; each card also records the total unoccupied vertical share.
Card limits are max(2.5rem, 12% of card height), with a 1px rounding tolerance.
The check also rejects card text collisions, text outside cards, container
scroll overflow, and usage/quote content outside the surface. This measures
layout boxes, not raster ink density. Compact Strip follows the selected shape;
the independent Strip shape supplies the horizontal provider row.

`node docs/tools/portrait-preview.mjs` captures synthetic Small and Full Fit
scenes for all original ten themes, cropped to the measured surface. `shape-final-check.mjs` also
writes `geometry.json` for exact comparison of the four non-portrait shapes.
Screen Fit uses the same formula for every theme: Portrait scales by height
and Strip scales by width, within the shared screen coverage limits. Native WebKitGTK/WebView2 acceptance remains separate.

`node docs/tools/portrait-resize-check.mjs` emulates fitting the native viewport
to one provider, adds three providers without first growing the viewport, then
returns to one. It checks both quote states and verifies that Fit spends spare
height on number sizes within the existing display tier. It uses no native IPC.

Palette acceptance (headless, fictional data only):

```sh
node --test tests/user-palettes.mjs
node docs/tools/palette-check.mjs
SKIP_AUDIT_SCREENSHOTS=1 node docs/tools/settings-check.mjs
node docs/tools/contrast-audit.mjs
node docs/tools/theme-identity-check.mjs
```

The contrast audit enumerates every built-in palette in both appearances and all
three color modes. Theme identity includes all palettes across five shapes,
comparing structure within each appearance/mode. The palette UI check covers
editing, duplicate/delete, transfer, warnings, fallback, and all-theme rendering;
the settings check also verifies user palettes through synthetic IPC and honest
Save/Revert. `PALETTE_CAPTURE=/tmp/palette-editor.png` optionally captures the
editor outside the repository. `SKIP_AUDIT_SCREENSHOTS=1` suppresses screenshot
file writes in the settings acceptance tool.

Use `AUDIT_THEMES=dot-matrix AUDIT_PALETTES=slate` for a focused contrast recheck;
omit both filters for the complete built-in matrix.

Provider layout acceptance (headless, in-memory synthetic IPC only):

```sh
cd app && npm run build && cd ..
node docs/tools/provider-layout-check.mjs
```

This drives the actual Settings frontend and widget event listener together,
asserting rendered order and featured classes before Save and after Save/reopen.
It covers Up/Down, drag, visibility, First in list, Highest usage, explicit and
None selections, Top/Bottom, quotes off/on, and two through four visible providers
in all five shapes (Circle and Pill cap their widget selection at three).
It also reproduces the Codex-first stored order / Claude-first draft / Gemini
Auto hero distinction. Screenshots use fictional data under ignored `gorevler/`.

## Gallery and documentation checks

`node --test tests/documentation.mjs` checks local Markdown links, HTML image/link paths and heading anchors in README, CONTRIBUTING, docs and integration guides, plus regression cases for the gallery-space algorithm and lossless PNG compression. External URLs are not fetched.

Every published gallery (themes, sizes, scale, palettes, states, system, Mono and both shapes scenes) must have no empty axis-aligned rectangle exceeding 12% of the final canvas. The audit uses rendered iframe bounds and actual heading/caption text ranges, treating each widget as a content box; it does not classify pixels inside widgets or transparent dial corners. Checks run after fonts and intrinsic heights settle. Standard session/weekly labels also have a reading-size assertion, and every Dot Matrix mark is checked for equal width/height within 2%.

`GALLERY_ONLY=1 node docs/tools/screenshots.mjs` regenerates the published images without the supplemental check captures. The default command runs both. Hero dark/light use the actual corresponding Ember appearance; palette examples include a fictional user-created Studio palette. Settings captures navigate to Appearance / Theme and reveal the palette controls.

All six shapes, including Portrait and Strip, use `widgetHeight` as their exact outer height. Size audits check width and height equality across themes within ±2 px. `portrait-gap-check.mjs` independently checks content spacing, clipping and overlaps. Strip uses a single horizontal provider row and hides the daily quote; Compact Strip is a theme that can use any shape.

Circle endpoint collision checks compare actual center text ranges, rather than the larger `.dial-safe` layout wrapper. Square featured ordering is checked independently of the Portrait-only featured card class.


The acceptance runner exports `SKIP_AUDIT_SCREENSHOTS=1`, preserving tracked
settings screenshots, and prints elapsed seconds for each command. Full sweeps
use deterministic pairwise arrays **within each theme** for size, theme identity,
provider identity, contrast, usage fit, screen fit and portrait gaps. Every theme × shape ×
size triple remains covered where those axes exist; palette, provider count,
appearance, quote and placement values remain represented, including every pair
of factor values. Dedicated reported-case and boundary checks remain exhaustive.
`node --test tests/pairwise.mjs` verifies the covering-array contract. The full
runner has not been rerun to certify its total wall time; the target is about
25 minutes, not a measured guarantee.

`ci.yml` runs native acceptance on Ubuntu 24.04/Xvfb/X11, then Windows with a
matching Edge driver, using `tauri-driver` 2.1.0 and a debug build containing the
frontend. Each native job has a 15-minute timeout. The dependency-free W3C client
is `acceptance/native-webdriver.mjs`; it refuses to launch outside CI. It uses
fictional snapshots, a temporary HOME and an explicit debug-only config override
because Windows known-folder APIs ignore HOME/APPDATA environment overrides.
All shapes/sizes, Portrait Fit fractions, disabled Fit modes, actual native outer
bounds, disk Save, restart and autostart are asserted. Screenshots, geometry JSON
and driver logs are uploaded even on failure. Windows taskbar strip is a native
GDI HWND, so `taskbar-window.ps1` checks/captures it through Win32 rather than a
WebDriver DOM. Wayland layer-shell remains outside this X11 CI coverage. Native
jobs are prepared but have not been dispatched or verified locally.

Reference: [Tauri native WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/).

## README refresh captures

```sh
GALLERY_ONLY=1 SCENE=themes,history,glass,providers,settings-,hero-,social-preview node docs/tools/screenshots.mjs
python3 docs/tools/check-readme-links.py
```

`SCENE` accepts comma-separated filename prefixes. `GALLERY_ONLY=1` omits
the exhaustive `checks/` scenes and post-capture interaction matrix; readiness,
provider-count, active-style, overflow and gallery empty-space assertions still run.
Individual theme captures use 1× to keep downloads small. The seven new themes
use an 11 CSS px quota-label floor in this capture tool; the original designs
keep their 13 px floor. Gallery Portrait height is bounded at 900 CSS px to
accommodate the new designs' intrinsic geometry. This is a documentation check,
not a change to application typography.

History fixtures are generated deterministically in the script. The expanded
card is opened through its real click handler; the side-panel showcase expands
the browser widget height to expose its scrollable heatmap and computer totals; side-panel heatmap presence is
asserted before capture. Invented model names, machine types, token counts and
price estimates never come from local logs. The documentation server bootstraps fixtures inline so separate Chrome frame
processes receive them reliably; fixture strings escape script delimiters.
Encoded history fixture URLs have an explicit 128 KiB local server header limit.
`glass.png` places the real Clear Glass frontend over a CSS gradient wallpaper;
it previews browser transparency, not native Windows Acrylic. `providers.png`
shows logos and a synthetic Gemini `NO_SUBSCRIPTION` card. Hero/social labels
are refreshed to 17 themes. PNGs are losslessly compressed; the README refresh
assets are checked against a 600 KiB budget.

The existing exhaustive dot-count, Mono and interaction matrices remain scoped
to the original ten designs. The seven new designs are covered here by the
README capture assertions and visual inspection; this task does not claim a
full 17-theme desktop acceptance audit. Clear Glass uses the internal
`liquid-glass` id; captures assert the requested theme to reject silent fallback.

`node docs/tools/theme-size-strip-check.mjs` checks all 17 themes in Portrait and Strip with fixed/screen sizing, Fit height on/off, quote on/off and extra windows on/off. It checks exact outer dimensions, equal card heights, row/column direction and hidden Strip quotes.
