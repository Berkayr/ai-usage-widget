# Meter and size standard

System uses continuous rounded progress bars, system fonts and 8 px card corners.
All other themes have 20 marks per quota window by default. Settings → Look → Dot count selects
10, 20 or 30. XS (below 220 design pixels) always uses 10. Marks represent used
quota, rounded to the nearest mark; the percentage remains the precise label.
Unknown quota has an explicitly unknown appearance and label. Widening a window
never increases mark count or mark diameter. Rows center within their available
space and may wrap at extreme sizes instead of shrinking the marks.

Dot Matrix uses circles. The other themes use rectangular segments while retaining
their typography, borders and layouts. Circular Rings retains its additional
continuous rings; Minimal Pace retains the elapsed-time marker.

Desktop marks are 0.25rem wide with a 0.125rem gap. Circles are 0.25rem high,
segments 0.5rem high. The root font is 16 × Scale / 100 CSS pixels. Thus at 100%
a mark is 4 CSS pixels wide on every monitor, regardless of window width. Scale
changes fonts, spacing and marks together through rem units, without CSS zoom.
XS breakpoints scale with these same design units.

## Widget size contract

Size owns geometry; a theme owns fonts, colors, borders and meter style.
Five presets multiply all logical dimensions uniformly: Small 75%, Medium 100%,
Large 150%, X-Large 200%, 2X-Large 250%. Base widths are 255, 340, 510, 680,
and 850 CSS pixels. Fine-tune is a multiplier (50–150%, default 100%);
the wider range preserves legacy 50–300% scales without changing their size.
Legacy Normal maps to Medium, Huge to X-Large. Other old scales choose the nearest
preset plus an exact multiplier: 90 becomes Medium × 90%.

At Medium, with n = max(1, visible provider count), vertical widgets request
**width = 340, height = 116 + 210 × n**. The 116px chrome consists of 28px outer
padding, 2px border, 60px header and 26px footer. Each provider contributes a
200px card and 10px gap (including the final gap). Empty and error cards keep
the same block height. All themes currently use one column in this orientation;
Circular Rings keeps an additional ring inside its card. Extra windows and long
content scroll inside the card instead of changing the outer box.

Compact Strip is an independent horizontal orientation. At Medium it requests
**width = 30 + 310 × n, height = 326**: 300px cards, 10px gaps, the same chrome.
For each provider count, all five presets preserve its aspect ratio as well.
Every dimension is multiplied by preset × fineTune / 10000, then divided by the
monitor scale only when Match physical size is enabled. Shared rem tokens drive
fonts, rows, padding, gaps and meters; no theme defines separate size metrics.

Fit height caps the box at the viewport/monitor work area; the provider list
scrolls when capped, keeping header and footer reachable. Disabling fit height
keeps the user's window height, while retaining the same card metrics.
`size-audit.mjs` checks all nine themes × five sizes × 0/1/3/6 providers against
these formulas with at most 2 CSS pixels of rounding tolerance, including error
cards, title font matching and type stretch. It writes `size-audit.json` and
`size-sheet.png`, with an enlarged header for every theme. These are synthetic
review artifacts. README screenshots are generated with `screenshots.mjs`.

Titles read AI USAGE with one literal word space, nonnegative letter spacing,
a modest extra word gap and the same family as the body. Title size is a shared
token. JetBrains Mono is used by Dot Matrix and Retro LCD as well as other mono
themes; System uses the OS family, Brutalist uses Inter throughout. No title uses
transforms or font stretching. The footer uses AI USAGE.

## Color modes and thresholds

Calm, Vivid and Mono use the same boundaries: below 50% normal, 50% through
less than 80% warning, 80% and above danger. Mono replaces every palette with
pure black surfaces and white ink (reversed in Light); secondary ink and tracks
are gray. Theme identity comes from geometry and typography, rather than hue.

From 50%, the last portion of active marks, beginning at the midpoint, becomes
hollow; System uses a warning hatch on its continuous bar. From 80%, percentage labels use an inverse capsule as well. Stale and
other status badges have monochrome outlines. Unknown marks stay distinct.
No pulse animation is used, including with reduced motion enabled.

See [the nine-theme Mono gallery](screenshots/mono.png). All data in documentation
captures is fictional. `node docs/tools/screenshots.mjs` captures the gallery and
`checks/dots-{200,340,520,700}.png`; checks and numeric results are ignored by Git.
Each visible row is measured in the browser, with counts recorded per theme.

## Monitor scale

CSS pixels are logical pixels, not physical display pixels. On Windows,
`resize_widget` multiplies logical width by `window.scale_factor()` before using
Tauri's physical-size API; fitted height does the same. On Linux layer-shell,
`linux::resize_layer` uses GTK size requests in logical units, leaving buffer
scaling to GTK and the compositor. Thus Scale 100% has the same logical geometry
on monitors configured at 1, 1.25 and 1.5 scale. The compositor may rasterize those
units differently. These statements are verified against the sizing code;
actual multi-monitor movement still needs native desktop validation.

“Match physical size across monitors” is off by default. When enabled, the
frontend divides Scale by the native scale factor. Rust exposes the initial
factor and emits `monitor-scale` on scale-factor and move events; changing the
factor recomputes text, marks and requested width together. This compensates
OS scaling in physical pixels, not millimeters: matching millimeters also
requires reliable monitor PPI, which this option does not infer. On Wayland,
fractional scaling may be applied by the compositor after GTK's integer buffer
scale; the reported native factor cannot promise exact fractional compensation.

## Panel integrations

KDE provides a Mono option under Severity colors and a 10/20/30 dot-count
setting (default 20), shared by compact and expanded views. Its mark dimensions
follow the desktop font. Mono converts the bar choice to segmented dots;
None still hides the mini meter. Warning marks become hollow; danger labels
invert. Scheme colors remain available for users who prefer Kirigami colors.

GNOME provides Mono and a cycling 10/20/30 count in the popup menu (default 20).
These popup preferences last for the enabled extension session. Its meter
geometry follows the Shell font, and uses hollow warning dots and inverted
danger labels. The popup's Mono surface is black with white ink; the panel
surface belongs to Shell.

The Windows taskbar strip receives Color mode and Dot count from widget settings.
Mini meters use fixed DPI-scaled circles and the same thresholds. Warning dots
become hollow; danger percentage tokens invert. Panel surfaces and taskbar
transparency remain controlled by the host desktop. Panel integrations have no
XS tier: their count is explicit rather than derived from monitor width.

QML lint, JavaScript syntax checks and Windows cross compilation validate these
integrations statically. Native KDE/GNOME/Windows visual validation is separate
from the Chromium desktop-gallery checks.

## Numeric typography

Text must not use transform scale, font-stretch or viewport/container width
units (vw/cqw) for font size. Large numbers use fixed rem steps, tabular numerals,
nonnegative letter spacing and line height at least 1.0. Scale changes
the root rem size. Narrow windows select a separate fixed step rather than
continuously stretching type. Numeric font family and weight stay consistent
across responsive tiers. Retro LCD uses the bundled OFL JetBrains Mono for
numbers; JetBrains Mono also supplies its title and headings.

The documentation capture measures a single “8” in each visible numeric style
using getBoundingClientRect at 200/340/520/700 CSS px and 75/100/150% scale.
The height/width ratio must stay within ±3% for each theme. Raw measurements
are written to ignored screenshots/checks/typography.json.

## Separate settings window

The window is created lazily, then hidden on accepted close and reused. Reopening
loads a fresh saved baseline without remounting the document or registering more
listeners. Save / Discard / Cancel runs before hiding; hidden settings do not keep
the widget in placement preview mode. This bounds WebKit webview creation to one
per application session, with no second webview before settings are first opened.

The gear and context menu open one decorated `settings` window (900 × 680,
minimum 640 × 480). It follows the system light/dark appearance independently
of the widget theme. The six categories use a persistent navigation column,
14 px body type and controls at least 32 px high. Provider onboarding remains
in the widget; subsequent provider selection belongs to settings.

Changes preview in the widget through `settings-preview`, with a bounded queue
that retains the latest value. Save commits settings and staged provider/login
choices; Revert restores the saved baseline. Closing with pending changes shows
an in-window Save / Discard / Cancel strip. Ctrl+S saves; Esc dismisses the strip.
Provider previews filter existing snapshot data; newly enabled providers are
collected only after Save grants consent. Palette buttons show five actual colors
for the active appearance; accent/background overrides can reset to the palette.

Text colors resolve against the composited ancestor surface after theme layout,
including transparent cards, badges and the cardless Minimal Pace/XS layouts.
Text opacity is never reduced with widget opacity. The latter controls the painted
surface. At effective surface opacity below 70%, a light/dark text shadow provides
an outline against unpredictable desktop content. Decorative background images
under text are removed; meter geometry and theme typography are retained.
`node docs/tools/contrast-audit.mjs` audits visible text at 200 / 340 / 600 px in
all theme × palette × light/dark × calm/vivid/mono combinations.

Placement defaults to locked. Place widget temporarily unlocks the header and
shows Save position / Cancel in both windows. The work-area map provides the same
placement workflow on Wayland, using layer-shell top/left anchors with logical
pixel margins. Saved positions use a monitor name and `x_ratio` / `y_ratio` within
the available travel area (work area minus widget dimensions). Off, 12 px edges /
center and 8 px grid snapping are supported. Disconnect handling keeps the home
monitor identity, falls back at the same ratios or hides, then restores on return.
Monitor events coalesce over 400 ms; unchanged native positions are not reapplied.

The separate settings window uses explicit light/dark surface, text, control,
selection and disabled tokens selected by `prefers-color-scheme`; system color
keywords are not used for its controls. Disabled text remains opaque and meets
3:1, enabled text meets 4.5:1. Revert is disabled until the draft changes. Theme
preview glyphs preserve their palette hue with a contrast correction when needed.

For themes using shared layout (including System), fit-height stops at the
viewport height. Header and footer remain in normal flex flow; the provider list
shrinks and scrolls within its paint boundary. Native height requests use the size contract and visible provider count so
the window can grow again after an empty snapshot without depending on content.


### Theme identity inside the size contract

The size contract fixes the outer shell, not every provider cell. Brutalist and
Circular Rings use two columns within the unchanged total provider height budget;
an odd last provider spans both columns. Brutalist has square, heavy grid lines,
uppercase labels and `--size-font-display` (2.25 rem, 2.4× body) percentages.
Circular Rings shows concentric rings with a centered percentage and session label,
then quota rows; a full-width last card puts its ring beside the rows.
Frosted Glass uses paired rounded quota capsules, and Retro LCD uses two columns
of large monospaced figures. Terminal draws only a bottom header rule and a top
footer rule, keeping both away from text. Display sizes derive from rem tokens,
without stretching glyphs. Below a viewport width of 18 root-font units, these
layouts switch to one column and preserve scroll access. Compact Strip retains
its independent horizontal contract. See `docs/tools/theme-identity-check.mjs`.

## Theme implementation boundary

Built-in desktop themes live in `app/src/themes/<id>/`. Each theme provides
`theme.json` metadata and palettes, `theme.css` styles, and a `render.js` module.
The registry loads one renderer and replaces the active theme stylesheet;
shared layout and readability rules retain the size and contrast contracts.
Themes bind to the same provider snapshot and consent state.

Theme renderers are bundled application code, not user-supplied plugins.
There is no supported external declarative theme-file format. The panel
integrations have their own host-specific renderers and settings; they do not
load the desktop theme modules. Theme changes must preserve unknown, stale,
authentication and rate-limit states as well as usage percentages and resets.

## Shapes

`shape` is independent of theme and size. The selectable values are `portrait`
(default for missing or unsupported settings), `landscape`, and `square`.
`circle` and `pill` are reserved native schema values for a future phase; the
frontend currently normalizes them to portrait and does not expose them.

All dimensions are logical CSS pixels before DPI scaling. Multiply both axes by
`sizePresets[sizePreset] / 100 * fineTune / 100`. Small, Medium, Large, X-Large,
and 2X-Large use 0.75, 1, 1.5, 2, and 2.5 respectively. Physical-size matching
also divides by monitor scale. Portrait retains its previous sizing, including
the Compact Strip exception. Landscape is 680 × 340 and square is 340 × 340 at
Medium, independent of provider count and theme. Native monitor bounds may cap
these dimensions; placement ratios always refer to the remaining work area.
Only portrait uses optional fit-to-content height; the other shapes always
request their fixed height, even when the saved fit-height option is disabled.

Landscape uses one to three equal columns, then two rows of three for four to
six providers. Square uses one hero cell or a two-column grid for two to four
providers. Five or six providers use explicit numbered pages (four providers on
the first page, the remainder on the next). Paging never changes window size,
never changes provider configuration, and does not use a background timer.
The current page is clamped when provider availability changes. An odd final
card fills both columns on every square page, with the two quota metrics side
by side. Circular Rings puts its primary ring beside the secondary quota row.

Dense cells first remove sync, plan, and footer metadata, abbreviate stale
status to a warning dot, then remove reset details. Dense linear themes show
the primary quota label, percentage, and meter. Frosted Glass and Retro LCD
retain two adjacent quota capsules. Circular Rings retains both concentric
tracks; only the primary percentage and tier occupy the inner circle. Secondary
center text is omitted before shrinking core labels below 9 px. Text rectangles
must fit inside the innermost track after subtracting half its stroke width.
Brutalist keeps display-size
bold numbers, Terminal its dashed frame, and Dot Matrix its round dot tracks.
Extra quota details remain available in portrait. Visible text in the new
shapes has a 9 CSS px floor; the floor is absolute, independent of rem scaling.


### Round shape contract

All five shapes share the size presets (75%, 100%, 150%, 200%, 250%) and fine tuning. Medium circle is 340 × 340 CSS pixels; Medium pill is 480 × 120. Geometry is independent of theme and provider count. Circle uses a circular mask; pill uses a radius of half its height.

Circle and pill show up to three providers selected per widget in Settings → Layout & Position → Providers on this widget. An absent selection defaults to the first three enabled providers; an empty selection intentionally shows none. Other enabled providers remain visible in settings and in rectangular layouts. Selection does not change collector consent.

A single-provider circle shows session outside and weekly inside. Multiple providers have concentric session tracks and a highest-usage center. Labels, percentages and reset countdown occupy the inner safe square; settings sits inside the top safe zone. Dot Matrix uses dotted tracks, Retro LCD segmented arcs, Terminal dashed radar tracks, Brutalist heavy rings and oversized numerals, Minimal Pace thin tracks, and Frosted Glass a blurred lens. Compact Strip supports the circle as a slim-track dial using its own palette and typography.

Pill shows inline provider cells, primary reset time, dual quota meters, and an internal settings button; header and footer are omitted. Text is at least 9 CSS pixels. Right-click opens the context menu inside either silhouette; Ctrl+, opens Settings. Dragging an unlocked widget works across its surface.

Native input regions match the silhouette: Win32 applies physical-pixel ellipse/capsule regions and transfers region ownership to Windows; GTK applies logical-pixel cairo scanlines to its input region on both X11 and layer-shell Wayland. Resize, DPI and shape changes are coalesced for 40 ms; identical regions are skipped. Rectangular shapes restore the entire input region. Native click-through still requires manual compositor testing.
