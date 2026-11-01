# Meter and size standard

Every quota window has 20 marks by default. Settings → Look → Dot count selects
10, 20 or 30. XS (below 220 design pixels) always uses 10. Marks represent used
quota, rounded to the nearest mark; the percentage remains the precise label.
Unknown quota has an explicitly unknown appearance and label. Widening a window
never increases mark count or mark diameter. Rows center within their available
space and may wrap at extreme sizes instead of shrinking the marks.

Dot Matrix uses circles. Other themes use rectangular segments while retaining
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
hollow. From 80%, percentage labels use an inverse capsule as well. Stale and
other status badges have monochrome outlines. Unknown marks stay distinct.
No pulse animation is used, including with reduced motion enabled.

See [the eight-theme Mono gallery](screenshots/mono.png). All data in documentation
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
