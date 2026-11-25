# Meter and size standard

System uses continuous rounded progress bars, system fonts and 8 px card corners.
Legacy themes other than System have 20 marks per quota window by default. Settings → Look → Dot count selects
10, 20 or 30. XS (below 220 design pixels) always uses 10. Marks represent used
quota, rounded to the nearest mark; the percentage remains the precise label.
Unknown quota has an explicitly unknown appearance and label. Widening a window
never increases mark count or maximum mark diameter. Segmented rows center
within their available space; Dot Matrix distributes round marks across the full row
on a visible track, shrinking their diameter only when necessary to fit.

Dot Matrix uses circles. The other themes use rectangular segments while retaining
their typography, borders and layouts. Circular Rings retains its additional
continuous rings; Minimal Pace retains the elapsed-time marker.

Desktop segments are 0.25rem wide with a 0.125rem gap and 0.5rem height.
Dot Matrix circles are up to 0.5rem (8 CSS px at Medium), with equal width and
height in every shape. Quota window labels have a 0.8125rem (13 CSS px at
Medium) minimum across all ten themes; Dot Matrix uses weight 600, 1rem provider
names and 0.75rem reset countdowns. Small retains the 11 CSS px reading floor. The root font is 16 × Scale / 100 CSS pixels. Thus at 100%
a segment is 4 CSS pixels wide on every monitor, regardless of window width. Scale
changes fonts, spacing and marks together through rem units, without CSS zoom.
XS breakpoints scale with these same design units.

## Widget size contract

Size owns geometry; a theme owns fonts, colors, borders and meter style.
Five presets multiply all logical dimensions uniformly: Small 85%, Medium 100%,
Large 120%, X-Large 150%, 2X-Large 200%. Portrait base widths are 289, 340, 408, 510,
and 680 CSS pixels. Small removes secondary chrome and keeps text at least 11 CSS pixels. Fine-tune is a multiplier (50–150%, default 100%);
the wider range preserves legacy 50–300% scales without changing their size.
Legacy Normal maps to Medium, Huge to X-Large. Other old scales choose the nearest
preset plus an exact multiplier: 90 becomes Small × (90 / 85 × 100)%.

Effective scale is a floating-point percentage, bounded to 10–300% at the IPC
boundary. Preset × fine-tune is capped at 300%; non-finite scale falls back to
100%. Large × 82% is 102.5% and Small × 82% is 61.5%. Settings files and preview,
save and resize commands preserve these fractions; only final native pixel
dimensions are rounded. Settings IPC failures appear in the status line.
Monitor-fit estimates use snapshot provider states, enabled/hidden filters and
the same round-widget selection as the widget, excluding unavailable providers.

At Medium, with n = max(1, visible provider count), Portrait has a fit ceiling
of **width = 340, height = 116 + 210 × n** (plus the optional quote budget).
Its actual height ends at measured content. Provider cards share the theme's
column layout and compact only when they exceed their budget; see the intrinsic
height and work-area rules below. Empty and error states retain readable content.

Compact Strip is an independent horizontal orientation. At Medium it requests
**width = 30 + 310 × n, height = 326**: 300px cards, 10px gaps, the same chrome.
For each provider count, all five presets preserve its aspect ratio as well.
Every dimension is multiplied by preset × fineTune / 10000, then divided by the
monitor scale only when Match physical size is enabled. Shared rem tokens drive
fonts, rows, padding, gaps and meters; no theme defines separate size metrics.

Portrait caps its content at the viewport/monitor work area and reports the
measured surface height to the native window. Other shapes retain fixed geometry.
`size-audit.mjs` checks all ten themes × five shapes × five sizes × 0/1/3/6
providers × quote off/on (2,000 cases). It checks exact width, the Portrait height
ceiling and fixed-shape heights within 2 CSS pixels, plus title font matching and
unstretched type. It writes `size-audit.json` and `size-sheet.png` as synthetic
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

See [the ten-theme Mono gallery](screenshots/mono.png). All data in documentation
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

The window is created lazily. Once Save or Discard succeeds, or when there are no
pending changes, the widget returns to its saved settings. Cancel keeps the
window open. Linux destroys the Settings webview on close and creates a fresh
one on the next open. Windows and macOS hide and reuse it, loading a fresh saved
baseline on reopen with the existing listeners.

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
(default for missing or unsupported settings), `landscape`, `square`, `circle`
and `pill`.

All dimensions are logical CSS pixels before DPI scaling. Multiply both axes by
`sizePresets[sizePreset] / 100 * fineTune / 100`. Small, Medium, Large, X-Large,
and 2X-Large use 0.85, 1, 1.2, 1.5, and 2 respectively. Physical-size matching
also divides by monitor scale. Portrait retains its previous sizing, including
the Compact Strip exception. Landscape is 680 × 340 and square is 340 × 340 at
Medium, independent of provider count and theme. Native monitor bounds may cap
these dimensions; placement ratios always refer to the remaining work area.
Only portrait uses optional fit-to-content height; the other shapes always
request their fixed height, even when the saved fit-height option is disabled.

Landscape uses one to three equal columns, then two rows of three for four to
six providers. Square uses equal full-width rows for up to four providers per
page, with name and session reset above two side by side quota meters. Five or
six providers use numbered pages. Paging never changes window size or provider
configuration and has no background timer. Featured selection only changes the
order of Square rows. Every row keeps both session and Weekly percentages and bars.

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
shapes at Small and 100% fine tuning has an 11 CSS px floor; secondary chrome
is removed before reducing usage data. Smaller fine-tune values and screen
fractions retain the existing compact layout.


### Round shape contract

All five shapes share the size presets (85%, 100%, 120%, 150%, 200%) and fine tuning. Medium circle is 340 × 340 CSS pixels; Medium pill is 480 × 120. Geometry is independent of theme and provider count. Circle uses a circular mask; pill uses a radius of half its height.

Circle and pill show up to three providers selected per widget in Settings → Layout & Position → Providers on this widget. An absent selection defaults to the first three enabled providers; an empty selection intentionally shows none. Other enabled providers remain visible in settings and in rectangular layouts. Selection does not change collector consent.

A single-provider circle shows session outside and weekly inside. Multiple providers have concentric session tracks and a highest-usage center. Labels, percentages and reset countdown occupy the inner safe square; settings sits inside the top safe zone. Dot Matrix uses dotted tracks, Retro LCD segmented arcs, Terminal dashed radar tracks, Brutalist heavy rings and oversized numerals, Minimal Pace thin tracks, and Frosted Glass a blurred lens. Compact Strip supports the circle as a slim-track dial using its own palette and typography.

Pill shows frameless provider columns with colored identity marks, dual quota
meters and stacked settings/quote controls. Session reset appears from Large.
Percentages are at least 15 CSS pixels at Medium and 13 at Small; other text
stays at least 11 CSS pixels at Small with 100% fine tuning. Right-click opens the context menu inside either silhouette; Ctrl+, opens Settings. Dragging an unlocked widget works across its surface.

Native input regions match the silhouette: Win32 applies physical-pixel ellipse/capsule regions and transfers region ownership to Windows; GTK applies logical-pixel cairo scanlines to its input region on both X11 and layer-shell Wayland. Resize, DPI and shape changes are coalesced for 40 ms; identical regions are skipped. Rectangular shapes restore the entire input region. Native click-through still requires manual compositor testing.


### Daily quote reading and work-area fit

Quote is opt-in. Portrait retains the 320px reading budget and the existing
scaled typography and meter tokens. Fit promotes quota numbers up to the existing display tier and headings up to
the title tier, and increases row spacing only while measured content fits.
Ring graphics reserve their labels before using remaining height. Provider rows
and cards use intrinsic content height; the previous 200px (160px with a quote) per-provider budget is
an overflow ceiling, rather than an instruction to pad every card to that size.
Grid rows no longer multiply unused height when providers share a row. The quote
reading budget can yield height to essential card labels. Small
reclaims the height of hidden secondary chrome. The native portrait window
requests the measured surface height, including after content grows again.

Usage overflow is measured after rendering and on list resize/font readiness.
Only cards that exceed their ceiling compact internal spacing and then reduce
text, stopping at 11px (existing smaller labels keep their authored size).
Dense Minimal Pace cards show the signed percentage-point delta with its
comparison context in a tooltip. Ring graphics use the remaining cell height.
Below 65% effective scale, Portrait hides secondary chrome and shows a compact
quote excerpt with a readable source control. The full quote, author and reason
remain available in its dialog. Tiny quota rows can borrow height from the quote
instead of clipping. Other shapes retain their fixed geometry and fitting behavior.

The quote uses normal case and readable body weight; theme signatures remain on
its label. Attribution is a small, borderless source line near the lower right;
the source and text open the full quote, work, author description and license.
Quote text still shrinks to 11px (9px for circle), then truncates at a word
boundary with an explicit ellipsis. Work appears next to the author, with a
full tooltip; author description is available in the dialog.

`quotePosition` is `bottom` by default, including persisted settings that omit
it; `top` places the reading block before providers in portrait and landscape.
Circle and square keep their quote page; pill keeps its quote dialog.
Preset changes preserve `fineTune`. Large is 120%; X-Large is 150% and 2X-Large is 200%.
The monitor preview reports requested dimensions and the largest effective
percentage that fits its work area after margins. Oversize selections retain
the saved preset and fine tuning while the actual display scale is capped to
that maximum; native placement keeps the surface within the work area. No
settings are rewritten by the cap. The cap is recomputed after provider,
monitor, quote, shape and settings changes. Linux uses logical GTK work-area
units including panel offsets; Windows uses physical work-area units and DPI.

QOTD prefers a verified death/birth anniversary for its reason, then the dated
Wikiquote selection. `work` comes from the author's `in …` suffix, then the
source/context fields. `author_description` comes from `descriptions.en` on the
existing Wikidata entity request. Old caches require no retry: existing
anniversaries apply immediately; missing work/description remain optional until
the next scheduled round. Disabled quotes perform no network or cache access.

## Fit to screen

Layout & Position offers Fixed size (the existing presets and fine tuning) and
Fit to screen. It applies only to Portrait, excluding Compact Strip; other
combinations use their fixed preset while retaining the stored screen mode.
Full, 3/4, 1/2 and 1/3 target the available height with independent 50–150% fine
tuning. Width cannot exceed 30% of the available work area. The coverage and
height limits remain safety nets for scaling content. These fractions are
maximum height budgets: Portrait enlarges existing text and meters first, then
ends at its content, so its final height can be shorter. Fit is disabled in
Settings with “Portrait only” when unavailable, and returns on switching back.

All geometry, the monitor map and fit warnings use only rendered providers
(after visibility, availability, selection and pagination). Windows supplies its
native work area, in physical pixels. Linux uses logical pixels: a transient
KWin script queries MaximizeArea over the local session bus, then is unloaded
and deleted even on timeout. If unavailable, GDK's nontrivial work area is used,
then Plasma panel position/visibility/thickness configuration, then a 44px KDE
or 32px GNOME top reservation (other desktops: zero). Layer surfaces use zone -1
and absolute work-area offsets, avoiding a second compositor reservation.

Reserved top/bottom are optional logical-pixel overrides (blank means Auto;
zero explicitly removes that reservation). Diagnostics show the automatic area,
source and edge reservations alongside the effective area. Display geometry,
DPI and work-area notifications and Plasma configuration events refresh the
existing placement path; there is no periodic desktop polling or new runtime
dependency. The one-shot KWin query has bounded D-Bus timeouts and runs off the
UI thread. A fallback rectangle is available while the query completes.

Settings persist `sizeMode` (`fixed` / `screen`), `fitFraction` (1, 0.75, 0.5,
1/3), `fitFineTune` (50–150), and nullable integer `reservedTop` /
`reservedBottom` (logical px). Screen mode preserves `sizePreset`, `fineTune`
and `scale` for switching back to Fixed size. Physical size matching is inactive
in Screen mode because the available desktop area determines the size; Ctrl +/-
and Ctrl 0 adjust/reset the active mode's fine tuning.

### Shape usability

Fit screen is effective only for Portrait, excluding Compact Strip. Changing shape
preserves the stored mode and restores Fit on return. Portrait Fit width is capped
at 30% of the available work area; the existing coverage cap still applies.
Oversize presets are disabled in Settings with their actual fitted dimensions.
Square uses equal full-width provider rows, with two side by side quota meters
and a reset time in the heading from Medium. Featured selection only changes order.
Pill uses identity-colored names, 5h and W values and slim bars without card boxes
or plan chips; session reset time appears from Large. Circle includes featured
Weekly usage and removes card separators and elapsed markers.
Expired reset times read “Awaiting refresh”. Onboarding uses a plain portrait shell.


## Desktop-inspired themes

Seven additional themes use the shared renderer, size tiers, scale and shape geometry.
Clear Glass, Layer, Aurora, Crisp, Pebble and Pastel draw continuous rounded tracks
from the renderer's precise `--used` value; their accessible labels and unknown
states remain intact. Glyph keeps the selected mark count as spaced dots, focuses
on large DotGothic16 percentages in Portrait and uses white paper in light mode.
Its signal palettes are neutral with a single muted red hue for threshold warnings.
All fonts are bundled or native system fonts; no remote assets are requested.

Clear Glass has Silver Current, Blue Tide and Evening Glow palettes, each with
explicit light/dark tokens. A single 22 px rounded sheet combines directional edge
highlights, a top specular band, subtle inner shading and a broad soft shadow.
Sections use hairline dividers without nested glass cards. The default surface
uses blur(22px) saturate(190%) with a 30% tint in both modes; unsupported CSS backdrop filters
use a denser 94% tint. Engines that expose backdrop-filter without compositor
support cannot be detected reliably. Contrast over arbitrary external wallpaper
cannot be inferred from CSS; the colorful preview is a visual check, not a guarantee.
Reduced transparency, increased contrast and forced colors replace the glass
with an opaque surface. Text uses tabular numbers and the shared contrast repair.

Layer is one borderless Mica-tinted surface with 8 px corners, a separate title
strip, original four-pane app marks, row separators and 4 px accent tracks.
Aurora has a 7 px translucent cyan frame, 6 px corners, a glossy title strip and
12 px green tracks with a white upper highlight and fine slanted glints. At the
shared 80% danger threshold the fill turns orange. Percentages use regular weight.
Crisp is a dense list with 3 px corners, shaded provider headings and a Portrait
row grid (label, framed 6 px blue track, percentage, reset). Pebble has a large
bold app title and 12 px boxed groups with row dividers, percentage pills and
8 px capsule tracks. Pastel uses borderless 16 px cards with an inner glow,
provider-name chips and provider-specific orchid/pink/mint gradients. It has no
beacon decoration. Its base palette tokens and preview favor dark; explicit
light palettes remain available. The application still resolves automatic
appearance globally from the OS; a theme-specific dark default would require
changing the shared appearance/activation contract outside this task's scope.

Clear Glass, Layer, Crisp, Pebble and Pastel omit the shared footer. Aurora
keeps only a centered italic theme signature; Glyph is unchanged. Each theme
supplies at least two named palettes with explicit modes. Fixed shapes retain
shared layout compression, including compact quota rows in Square and Pill.
Meter fills do not shrink away at the 50% scale, and monochrome tracks use
neutral ink instead of the decorative color gradients. Theme-picker previews
reflect the frame, title-strip, dense-list, boxed-group and pastel treatments.

Clear Glass and Layer declare `windowEffect: "acrylic"` in their bundled
manifests. Native startup, preview, save and discard apply the declaration to the
main widget: Windows 11 (build 22000+) uses Acrylic; Windows 10 and unknown builds
use Blur. KDE Plasma requests whole-surface blur through KWin's Wayland protocol
on the existing GDK surface, or the advertised X11 blur property. Other themes
clear the native effect. Linux remapping recreates the current request without
changing layer-shell placement or input masks. GNOME and unsupported compositors
retain the theme tint. KWin's Blur desktop effect must be enabled. macOS does not
compile or invoke the bridge. Adding another native-effect theme requires adding
its bundled manifest to the small Rust allowlist. Native desktop blur still needs
Windows and KDE visual verification; CSS blur alone cannot sample the wallpaper.
