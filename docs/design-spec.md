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
letter spacing no tighter than -0.02em and line height at least 1.0. Scale changes
the root rem size. Narrow windows select a separate fixed step rather than
continuously stretching type. Numeric font family and weight stay consistent
across responsive tiers. Retro LCD uses the bundled OFL JetBrains Mono for
numbers; DotGothic16 remains on decorative headings.

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
shrinks and scrolls within its paint boundary. Native height requests include the
list's natural scroll extent so the window can grow again after an empty snapshot.
