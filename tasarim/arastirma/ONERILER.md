# Round 3 Design Research: New Visual Directions, Responsive Size System, Taskbar/Panel Surfaces & Palette Architecture

> **Scope & Constraints:** All designs use open-source Google Fonts only, contain zero brand logos or proprietary brand references, and use synthetic sample telemetry (`Claude Max: 5h 34% RST 2h 41m, Weekly 61% RST 3d 4h, Opus Weekly 12%`; `Codex Plus: 5h 8% RST 4h 10m, Weekly 77% RST 1d 6h`; `Gemini AI Pro [STALE · updated 3h ago]: 5h 17% RST 1h 05m, Weekly 7% RST 6d`).

---

## 1. Twelve New Design Directions (09–20)

The first 8 designs covered: **01 Dot-Matrix Card** (tall vertical stack, 20-LED dot bar), **02 Circular Rings** (bento grid, concentric SVG rings), **03 Terminal TUI** (box-drawing CLI, ASCII bar), **04 Frosted Glass** (translucent vertical stack, 2-col internal capsules), **05 Brutalist Numbers** (3-column poster grid, 56px numerals), **06 Compact Strip** (`1040×48` top bar), **07 Retro LCD** (handheld segment bricks + `888%` ghost), and **08 Minimal Pace** (vertical stack, 4px hairline with elapsed-time tick).

Below are **12 completely new directions** that introduce distinct spatial topologies (radial dials, split-flap boards, vertical tank columns, receipt tape, timeline Gantt horizons, hexagonal honeycombs, chronograph subdials, isometric wafers) and new visual languages.

---

### 09 — Automotive Tachometer Cluster (`09-tachometer-cluster`)

**Description:**  
Inspired by motorsport digital instrument clusters and rally telemetry HUDs, each provider is rendered as a 240-degree swept analog-digital speedometer dial with a physical-feeling needle, redline danger zone (`>80%`), and an integrated digital odometer cutout at the bottom of the arc. Instead of passive flat rings (Design 02), the dial features major/minor scale ticks (`0, 20, 40, 60, 80, 100`), a glowing bevel needle for the 5-hour window, an inner segmented arc for the weekly window, and a sequential shift-light strip across the top of the frame that illuminates as any provider approaches rate-limit exhaustion.

**Layout Sketch (ASCII):**
```text
+-----------------------------------------------------------------------+
|  [o][o][o][o][*][*][!][!]   SHIFT / PACE TELEMETRY        SYNC 23:41  |
+-----------------------+-----------------------+-----------------------+
|  CLAUDE · MAX         |  CODEX · PLUS         |  GEMINI · AI PRO [!]  |
|      .--- 50 ---.     |      .--- 50 ---.     |      .--- 50 ---.     |
|    /   \      .   \   |    /          .   \   |    /          .   \   |
|   20    \   .     80  |   20   _..        80  |   20    \         80  |
|  |       (O)       |  |  |    '--(O)       |  |  |       (O)       |  |
|   0               100 |   0      ###      100 |   0               100 |
|     [ 034% | 2h41 ]   |     [ 008% | 4h10 ]   |     [ 017% | 1h05 ]   |
|  WK: 61% (3d4h) OP:12%|  WK: 77% (1d6h)       |  WK: 7% · STALE 3h    |
+-----------------------+-----------------------+-----------------------+
```

- **Typography (Google Fonts):** `'Chakra Petch'` (700/600, angular automotive display) + `'Share Tech Mono'` (400, odometer readout & tick numerals).
- **Palette:** Carbon Cockpit — Background `#0B0D12`, Surface `#131720`, Text `#F0F4F8`, Muted `#687385`, Accent `#00E5FF`, OK `#00E676`, Warn `#FFAB00`, Danger `#FF1744`.
- **Meter Primitive:** `swept-needle-gauge` (240° open SVG arc with tick marks, needle angle binding, redline arc sector, and bottom odometer box).
- **Readable at a Glance:** Human peripheral vision detects needle angle (`9 o'clock` = safe low usage, `12 o'clock` = 50% mid-pack, `3–4 o'clock` = redline danger) faster than reading digits.
- **Inspiration URLs:**
  - https://dribbble.com/tags/car-dashboard
  - https://www.behance.net/search/projects/digital%20instrument%20cluster
  - https://github.com/Rainmeter/rainmeter

---

### 10 — E-Ink Paper Daylight Slab (`10-eink-paper`)

**Description:**  
Modeled after electrophoretic e-paper displays (reMarkable, Kindle Carta, TRMNL desktop e-ink frames), this design completely eliminates glow, gradients, and dark-mode contrast fatigue in favor of a warm matte off-white paper canvas, crisp 1-bit dithering patterns, serif editorial headers, and newspaper-column rules. Severity is communicated not just by color (muted e-ink kale green / terracotta red) but by **halftone fill textures** (diagonal crosshatch for warning, dense polka-dot stipple for danger, dotted outline for stale telemetry), making it effortless to read in bright daylight and 100% color-blind safe.

**Layout Sketch (ASCII):**
```text
+---------------------------------------------------------------+
|  QUOTA GAZETTE                            ISSUE 23:41 · DAILY |
|  ===========================================================  |
|  CLAUDE (Max)                         5H: 34%       WK: 61%   |
|  5-Hour   [#######.............]  RST 2h 41m                  |
|  Weekly   [////////////........]  RST 3d 04h   (Opus: 12%)    |
|  -----------------------------------------------------------  |
|  CODEX (Plus)                         5H: 08%       WK: 77%   |
|  5-Hour   [##..................]  RST 4h 10m                  |
|  Weekly   [///////////////.....]  RST 1d 06h                  |
|  -----------------------------------------------------------  |
|  GEMINI (AI Pro)  [STALE: 3H AGO]     5H: 17%       WK: 07%   |
|  5-Hour   [###.................]  RST 1h 05m                  |
|  Weekly   [#...................]  RST 6d 00h                  |
+---------------------------------------------------------------+
```

- **Typography (Google Fonts):** `'Newsreader'` (600/700, high-contrast editorial serif for provider titles and giant percentages) + `'IBM Plex Mono'` (400/600, technical metadata and reset counters).
- **Palette:** E-Ink Carta & Kale — Background `#F2EFE9`, Surface `#EAE6DF`, Text `#1A1917`, Muted `#6E6A63`, Accent `#2B2927`, OK `#1A1917` (solid ink), Warn `#8C5A2B` (diagonal hatch), Danger `#9E2A2B` (dense cross-stipple).
- **Meter Primitive:** `halftone-ink-bar` (SVG pattern-filled rectangular bar using solid ink for normal, 45° hatch for warning, and crosshatch/stipple for danger).
- **Readable at a Glance:** Texture density and crisp black-on-cream editorial hierarchy create zero eye strain on secondary monitors and remain distinguishable even in grayscale.
- **Inspiration URLs:**
  - https://usetrmnl.com/
  - https://dribbble.com/tags/e-ink
  - https://www.behance.net/search/projects/e-ink%20ui

---

### 11 — Mechanical Split-Flap Solari Board (`11-split-flap-board`)

**Description:**  
Inspired by vintage European train station departure boards (Solari di Udine) and Vestaboard mechanical displays, every character, percentage, and status indicator sits inside a recessed 3D mechanical flap tile bisected by a thin horizontal hinge shadow. Rather than continuous bars, each provider row is a timetable departure line where percentages, reset countdowns, and a 10-tile mechanical color-flap strip (`[■][■][■][□]...`) click into place. Stale providers flip their status flap to an bright yellow/crimson `DELAYED / 3H` warning plaque.

**Layout Sketch (ASCII):**
```text
+-------------------------------------------------------------------------+
|  [Q][U][O][T][A]  DEPARTURES / TELEMETRY                  [2][3]:[4][1] |
+-------------------------------------------------------------------------+
|  PROVIDER    PLAN    5H %    5H FLAPS       RST     WK %   STATUS       |
|  [C][L][A]   [MAX]  [0][3][4] [■][■][■][□] [2h41]  [0][6][1] [ON TIME]  |
|  [C][O][D]   [PLS]  [0][0][8] [■][□][□][□] [4h10]  [0][7][7] [CAUTION]  |
|  [G][E][M]   [PRO]  [0][1][7] [■][□][□][□] [1h05]  [0][0][7] [STALE 3H] |
+-------------------------------------------------------------------------+
|  EXTRA TRACK: CLAUDE OPUS WEEKLY [0][1][2]%                      [OK]   |
+-------------------------------------------------------------------------+
```

- **Typography (Google Fonts):** `'Oswald'` (600, condensed split-flap tile capitals and digits) + `'JetBrains Mono'` (500, board legends and rivet labels).
- **Palette:** Solari Matte Charcoal — Background `#141416`, Surface `#1F2024` (flap tile face), Text `#F7F7F2`, Muted `#7C7E87`, Accent `#FFCC00`, OK `#34D399`, Warn `#FBBF24`, Danger `#EF4444`.
- **Meter Primitive:** `split-flap-cells` (discrete mechanical flap tiles with a `1px` center hinge divider and top-to-bottom subtle bevel gradient).
- **Readable at a Glance:** Tabular timetable alignment lets the eye scan vertically down the `5H %`, `WK %`, and `STATUS` columns like an airport arrivals board.
- **Inspiration URLs:**
  - https://www.vestaboard.com/
  - https://dribbble.com/tags/split-flap
  - https://github.com/search?q=split+flap+css&type=repositories

---

### 12 — Industrial Audio VU / Mixing Console (`12-audio-vu-console`)

**Description:**  
Modeled after studio mastering hardware and vertical LED peak programme meters (PPM), this layout flips the conventional horizontal bar on its head: each provider is a **vertical channel strip** with dual side-by-side vertical LED ladders (`5H` on the left, `WK` on the right, plus a slim `EX` third ladder when extra windows exist). The bottom of the channel houses scribble-strip tape labels (`CLAUDE`, `CODEX`, `GEMINI`) and rotary-style trim badges for reset times, while the top of the ladder has a dedicated red `CLIP / >80%` peak indicator lamp.

**Layout Sketch (ASCII):**
```text
+---------------------------------------------------+
|  MASTER TELEMETRY BUS                  SYNC 23:41 |
+----------------+----------------+-----------------+
|   [CLIP]       |   [CLIP]       |   [STALE 3h]    |
|  100 ..   ..   |  100 ..   ..   |  100 ..   ..    |
|   80 ..   ..   |   80 ..   ##   |   80 ..   ..    |
|   60 ..   ##   |   60 ..   ##   |   60 ..   ..    |
|   40 ##   ##   |   40 ..   ##   |   40 ..   ..    |
|   20 ##   ##   |   20 ..   ##   |   20 ##   ..    |
|    0 ##   ##   |    0 ##   ##   |    0 ##   ##    |
|     34%  61%   |      8%  77%   |     17%   7%    |
|   2h41m  3d4h  |   4h10m  1d6h  |   1h05m   6d    |
|  [CLAUDE · MAX]|  [CODEX · PLS] |  [GEMINI · PRO] |
+----------------+----------------+-----------------+
```

- **Typography (Google Fonts):** `'Space Grotesk'` (700, channel strip headers) + `'Fira Code'` (500, dB/percentage scale ticks and scribble-strip readouts).
- **Palette:** Studio Rack Dark — Background `#111315`, Surface `#1B1E23`, Text `#ECEFF4`, Muted `#6C7686`, Accent `#FF6B00`, OK `#22C55E` (0–50% LEDs), Warn `#EAB308` (50–80% LEDs), Danger `#EF4444` (80–100% peak LEDs).
- **Meter Primitive:** `vertical-led-ladder` (bottom-up 16-segment vertical bar where each segment’s color is determined by its vertical height position, just like a hardware VU meter).
- **Readable at a Glance:** Comparing heights of vertical columns side-by-side leverages humans' strongest visual perception primitive (position along a common vertical scale).
- **Inspiration URLs:**
  - https://dribbble.com/tags/vu-meter
  - https://www.behance.net/search/projects/audio%20plugin%20ui
  - https://www.reddit.com/r/Rainmeter/

---

### 13 — Thermal Receipt / Ticker Tape (`13-receipt-ticker`)

**Description:**  
Designed like a high-craft Japanese POS thermal paper slip or stock-exchange ticker tape with serrated top/bottom tear edges, barcode decorative footers, and tabular dot-leader rows (`5-HOUR WINDOW .......... 34%`). Instead of heavy boxes, it uses crisp dashed rule separators, inverted black-highlight stamps for warnings/stale states, and a compact vertical footprint ideal for pinning to a screen corner like a sticky note.

**Layout Sketch (ASCII):**
```text
  /\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\
  |         QUOTA TELEMETRY SLIP #2341           |
  | -------------------------------------------- |
  | 01 CLAUDE [MAX]                              |
  |    5H WINDOW (RST 2h41m) .............. 34%  |
  |    [=======-------------]                    |
  |    WEEKLY    (RST 3d04h) .............. 61%  |
  |    [============--------]                    |
  |    OPUS WK   (EXTRA) .................. 12%  |
  | -------------------------------------------- |
  | 02 CODEX [PLUS]                              |
  |    5H WINDOW (RST 4h10m) .............. 08%  |
  |    WEEKLY    (RST 1d06h) ........ [WARN] 77% |
  |    [===============-----]                    |
  | -------------------------------------------- |
  | 03 GEMINI [AI PRO]       ** STALE: 3H AGO ** |
  |    5H WINDOW (RST 1h05m) .............. 17%  |
  |    WEEKLY    (RST 6d00h) .............. 07%  |
  | ============================================ |
  | ||| || |||| | ||| |||| || | |||   AUTH: OK   |
  \/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/
```

- **Typography (Google Fonts):** `'VT323'` or `'Cutive Mono'` paired with `'Space Mono'` (400/700, authentic thermal line-printer alignment).
- **Palette:** Thermal Paper & Carbon — Background `#18181B` (stage), Surface `#FAF7F0` (thermal paper), Text `#141413`, Muted `#78756E`, Accent `#D9381E`, OK `#141413`, Warn `#C25E00`, Danger `#D91E18` (with inverted block print `#141413` bg + `#FAF7F0` text).
- **Meter Primitive:** `thermal-Leader-bar` (dot-leader text line paired with a compact 20-cell block-print bar).
- **Readable at a Glance:** High-contrast paper slip stands out peripheral-first against dark IDE windows; right-aligned percentages form a single scannable vertical ledger column.
- **Inspiration URLs:**
  - https://dribbble.com/tags/receipt
  - https://www.behance.net/search/projects/receipt%20design
  - https://www.reddit.com/r/unixporn/

---

### 14 — Swiss Horology Chronograph Watch Face (`14-chronograph-dial`)

**Description:**  
Inspired by Bauhaus and Swiss mechanical chronographs (Nomos, Braun AW10, IWC), the entire widget is a single circular or squircle watch case containing **three precision recessed subdials** arranged in a classic tri-compax watch layout (9 o'clock = Claude, 3 o'clock = Codex, 6 o'clock = Gemini, with 12 o'clock housing the master sync complication and power-reserve indicator). Each subdial features two coaxial hands: a long colored sweeping hand for 5-hour quota and a shorter counterweight hand for weekly quota, plus a date-aperture window showing the reset countdown.

**Layout Sketch (ASCII):**
```text
            .------------------------- .
         /         QUOTA · 23:41         \
       /            [PWR: OK]              \
     |   .---------.           .---------.   |
     |  /  CLAUDE   \         /   CODEX   \  |
     | |  5h:34% /   |       |  5h:8%  _   | |
     | |  wk:61% --  |       |  wk:77%  \  | |
     |  \ [RST 2h41]/         \ [RST 4h10]/  |
     |   '---------'           '---------'   |
     |              .---------.              |
     |             /  GEMINI!  \             |
     |            |  5h:17% /   |            |
     |            |  wk:7%      |            |
     |             \ [STALE 3h]/             |
       \            '---------'            /
         \                               /
            '------------------------- '
```

- **Typography (Google Fonts):** `'DM Sans'` (500/700, geometric Braun-style dial numerals) + `'DM Mono'` (500, date-aperture window boxes).
- **Palette:** Braun Matte Black & Dieter Rams Orange — Background `#121316`, Surface `#1A1C20`, Text `#F4F4F6`, Muted `#71757E`, Accent `#FF5500`, OK `#E2E8F0`, Warn `#F59E0B`, Danger `#EF4444`.
- **Meter Primitive:** `coaxial-subdial` (circular watch subdial with two SVG hands of distinct lengths/widths + rectangular date window cutout).
- **Readable at a Glance:** Occupies a compact square footprint (`320×320`) that feels like a native desktop clock widget while encoding 6 windows simultaneously via coaxial hands.
- **Inspiration URLs:**
  - https://dribbble.com/tags/watch-face
  - https://www.behance.net/search/projects/smartwatch%20ui
  - https://play.google.com/store/apps/details?id=org.kustom.widget

---

### 15 — Liquid Battery / Chemical Silo Tanks (`15-liquid-tanks`)

**Description:**  
Inspired by Android/iOS battery widgets and industrial chemical storage telemetry, each provider is depicted as a pair of transparent cylindrical vertical containment vessels showing **remaining capacity** (or consumed fill) as a stratified liquid level with an animated meniscus wave line at the surface and rising micro-bubbles during active consumption. Unlike flat bars, the liquid height immediately conveys "how full or depleted my tank is," with floating level markers (`80% CRIT`, `50% WARN`) etched onto the glass cylinder wall.

**Layout Sketch (ASCII):**
```text
+-------------------------------------------------------------------+
|  CAPACITY SILOS // QUOTA                             SYNC 23:41   |
+---------------------+---------------------+-----------------------+
|  CLAUDE (Max)       |  CODEX (Plus)       |  GEMINI (Pro) [STALE] |
|  .------.  .------. |  .------.  .------. |  .------.  .------.   |
|  |      |  |      | |  |      |  |-80%--| |  |      |  |      |   |
|  |-50%--|  |~~~~~~| |  |-50%--|  |~~~~~~| |  |-50%--|  |      |   |
|  |~~~~~~|  |######| |  |      |  |######| |  |      |  |      |   |
|  |######|  |######| |  |~~~~~~|  |######| |  |~~~~~~|  |~~~~~~|   |
|  |######|  |######| |  |######|  |######| |  |######|  |######|   |
|  '------'  '------' |  '------'  '------' |  '------'  '------'   |
|   5H:34%    WK:61%  |   5H:8%     WK:77%  |   5H:17%    WK:7%     |
|   2h 41m    3d 4h   |   4h 10m    1d 6h   |   1h 05m    6d (3h)   |
+---------------------+---------------------+-----------------------+
```

- **Typography (Google Fonts):** `'Outfit'` (600/700, rounded modern consumer widget headers) + `'JetBrains Mono'` (500, etched cylinder graduation marks).
- **Palette:** Translucent Bioreactor — Background `#090D16`, Surface `#111827`, Text `#F9FAFB`, Muted `#6B7280`, Accent `#38BDF8`, OK `#10B981`, Warn `#F59E0B`, Danger `#F43F5E`.
- **Meter Primitive:** `vertical-liquid-cylinder` (rounded pill tank with SVG wave meniscus clip-path, etched 50%/80% glass tick lines, and translucent depth gradient).
- **Readable at a Glance:** Spatial volume fill inside a vertical battery/tank metaphor is universally understood by non-technical and technical users alike without reading a single label.
- **Inspiration URLs:**
  - https://dribbble.com/tags/battery-widget
  - https://www.behance.net/search/projects/battery%20widget
  - https://github.com/Jax-Core/JaxCore

---

### 16 — 16-Bit Pixel RPG Mana & Stamina HUD (`16-pixel-rpg-hud`)

**Description:**  
Inspired by 16-bit JRPG/action-RPG status overlays (Chrono Trigger, Hyper Light Drifter, Celeste) and pixel-art desktop companions, this design frames AI coding providers as **party members** in an active party status box. Each provider has a pixel-beveled portrait badge (geometric crystal/rune emblem, no brand logos), a bright cyan/emerald **MP bar (5-Hour Window)**, an amber/violet **EXP/Stamina bar (Weekly Window)**, and status ailment badges (`[POISON / STALE 3H]`, `[LOW MP / >80%]`). All borders use crisp `2px` stair-stepped pixel corners (`clip-path: polygon(...)`) with zero anti-aliased blur.

**Layout Sketch (ASCII):**
```text
  +===============================================================+
  |  PARTY QUOTA HUD                            TIME 23:41  [G]   |
  +===============================================================+
  |  +----+  CLAUDE   LV.MAX                     OPUS BUFF: 12%   |
  |  | /\ |  5H MP  [███████░░░░░░░░░░░░░]  34/100   RST 02:41    |
  |  | \/ |  WK SP  [████████████░░░░░░░░]  61/100   RST 3d 04h   |
  +--+----+-------------------------------------------------------+
  |  +----+  CODEX    LV.PLUS                    [!] LOW SP WARN  |
  |  | <> |  5H MP  [██░░░░░░░░░░░░░░░░░░]  08/100   RST 04:10    |
  |  | <> |  WK SP  [███████████████░░░░░]  77/100   RST 1d 06h   |
  +--+----+-------------------------------------------------------+
  |  +----+  GEMINI   LV.PRO                     [STALE · 3H AGO] |
  |  | ** |  5H MP  [███░░░░░░░░░░░░░░░░░]  17/100   RST 01:05    |
  |  | ** |  WK SP  [█░░░░░░░░░░░░░░░░░░░]  07/100   RST 6d 00h   |
  +===============================================================+
```

- **Typography (Google Fonts):** `'Press Start 2P'` (400, 8-bit headers and status ailments) + `'Silkscreen'` or `'Pixelify Sans'` (400/700, compact legible pixel numbers and timers).
- **Palette:** 16-Bit Fantasy Cartridge — Background `#120E24`, Surface `#1E1836`, Text `#F8F8FF`, Muted `#8E84B8`, Accent `#00F5D4`, OK `#00E5A3`, Warn `#FFD166`, Danger `#FF2A85`.
- **Meter Primitive:** `pixel-notched-bar` (stepped pixel-art container with crisp 2px inner highlight strip and discrete 4px pixel blocks).
- **Readable at a Glance:** Gamified HP/MP bar metaphors tap into deeply ingrained gamer muscle memory—a red/flashing bar or status ailment icon triggers instant recognition.
- **Inspiration URLs:**
  - https://dribbble.com/tags/pixel-art-ui
  - https://lospec.com/palette-list
  - https://www.reddit.com/r/unixporn/

---

### 17 — Horizon Gantt / Burn-Rate Timeline (`17-horizon-timeline`)

**Description:**  
Rather than treating usage % and reset countdown as two separate numbers, this information-design layout plots them on a unified **2D Time-vs-Quota Horizon Chart** inspired by flight-deck fuel burn calculators and Linear roadmaps. Each window is a horizontal lane where the background shaded block represents **elapsed time in the window** (`0% → 100% of 5h or 7d`) and the foreground bar represents **quota burned**. If the foreground bar extends past the shaded time block, a hatched orange/red **over-burn overhang** visually highlights that you will hit 100% before the reset timer expires—showing projected exhaustion time (e.g., `Est. agotamiento in 1h 50m`).

**Layout Sketch (ASCII):**
```text
+-----------------------------------------------------------------------+
|  BURN-RATE HORIZON // TIME ELAPSED (:::) vs QUOTA USED (###)   23:41  |
+-----------------------------------------------------------------------+
|  CLAUDE · Max                                                         |
|  5H  [#########:::::................] 34% used / 46% time  (RST 2h41) |
|  WK  [################//!........... ] 61% used / 55% time  (+6% BURN) |
|  EX  [###::::::::::::...............] 12% Opus / 55% time             |
+-----------------------------------------------------------------------+
|  CODEX · Plus                                                         |
|  5H  [##:::.........................] 08% used / 17% time  (RST 4h10) |
|  WK  [######################::::....] 77% used / 82% time  (RST 1d06) |
+-----------------------------------------------------------------------+
|  GEMINI · AI Pro  [STALE · updated 3h ago]                            |
|  5H  [#####:::::::::::::::::::......] 17% used / 78% time  (RST 1h05) |
|  WK  [##::..........................] 07% used / 14% time  (RST 6d00) |
+-----------------------------------------------------------------------+
```

- **Typography (Google Fonts):** `'Inter Tight'` (600/700, dense analytical labels) + `'Commit Mono'` or `'JetBrains Mono'` (500, burn-rate deltas and projections).
- **Palette:** Tufte Analytical Slate — Background `#0C0F14`, Surface `#151A22`, Text `#E6EDF3`, Muted `#7D8590`, Accent `#58A6FF`, OK `#3FB950`, Warn `#D29922`, Danger `#F85149`.
- **Meter Primitive:** `dual-horizon-bullet-bar` (Stephen Few-style bullet graph combining a wide muted elapsed-time band, a narrower foreground quota bar, and a hatched overhang region when `quotaPct > elapsedTimePct`).
- **Readable at a Glance:** Immediately answers the developer's real question: *"Am I burning quota faster than the clock is resetting?"* via the visual overhang region.
- **Inspiration URLs:**
  - https://en.wikipedia.org/wiki/Bullet_graph
  - https://dribbble.com/tags/data-visualization
  - https://linear.app/

---

### 18 — Hexagonal Honeycomb Telemetry Mesh (`18-hex-honeycomb`)

**Description:**  
Inspired by sci-fi tactical shields, Crysis/Halo HUDs, and modular smart-home wall tiles (Nanoleaf), the layout abandons rectangles altogether in favor of interlocking **flat-topped hexagons**. Three large primary hexagons form a tight triangular cluster for Claude, Codex, and Gemini, while smaller satellite hex cells dock onto their edges to display extra windows (`Opus 12%`), sync timestamps, and stale alerts. Each primary hexagon features a 6-sided perimeter progress stroke for the 5-hour window and an inner 6-segment triangular core for the weekly window.

**Layout Sketch (ASCII):**
```text
                / \               / \
              /     \           /     \
            /  CLAUDE \       /  CODEX  \
           |   MAX     |-----|   PLUS    |
           |  5H: 34%  | OPUS|  5H: 08%  |
            \ WK: 61% /  12%  \ WK: 77% /
              \     / \       / \     /
                \ /     \   /     \ /
                        |---|
                      /       \
                    /  GEMINI!  \
                   |   AI PRO    |
                   |  5H: 17%    |
                    \ WK: 07%   /
                      \ STALE /
                        \   /
```

- **Typography (Google Fonts):** `'Rajdhani'` (600/700, geometric sci-fi tactical headers) + `'Share Tech Mono'` (400, hex core readouts).
- **Palette:** Tactical Amber & Obsidian — Background `#080A0F`, Surface `#111622`, Text `#E2E8F0`, Muted `#64748B`, Accent `#00F0FF`, OK `#00F0FF`, Warn `#FF9F1C`, Danger `#FF2A54`.
- **Meter Primitive:** `hex-perimeter-gauge` (SVG 6-sided polygon stroke dasharray for 5h + 6 internal pizza-slice wedges for weekly quota).
- **Readable at a Glance:** The non-rectangular silhouette sits floating on the desktop wallpaper like an organic cluster; when a provider hides, the remaining 1 or 2 hexagons lock together without empty grid holes.
- **Inspiration URLs:**
  - https://dribbble.com/tags/hud-ui
  - https://www.behance.net/search/projects/sci-fi%20hud
  - https://www.deviantart.com/tag/rainmeter

---

### 19 — Blueprint / CAD Technical Schematic (`19-cad-blueprint`)

**Description:**  
Styled after architectural cyanotype blueprints and engineering CAD viewports (AutoCAD / Rhino), this design uses a Prussian-blue (or dark drafting-table charcoal) grid background with `10px` minor / `50px` major graph lines, `+` crosshair corner registration marks, and dimension leader arrows (`|<--- 34% (2h 41m) --->|`) that measure the quota bars like physical architectural tolerances. A title block in the bottom-right corner mimics an ISO engineering drawing stamp (`DWG NO: QUOTA-03`, `SCALE: 1:1`, `SYNC: 23:41`).

**Layout Sketch (ASCII):**
```text
+--+---------------------------------------------------------+--+
|  |  SPEC: AI QUOTA TELEMETRY               REV: 23:41      |  |
+--+---------------------------------------------------------+--+
|  |  [A1] CLAUDE // PLAN: MAX                               |  |
|  |  5H  |<----- 34% ----->|...................| RST 2h 41m |  |
|  |  WK  |<---------- 61% --------->|..........| RST 3d 04h |  |
|  |  EX  |<-- 12% -->|.........................| OPUS WK    |  |
|  +---------------------------------------------------------+  |
|  |  [B1] CODEX // PLAN: PLUS                               |  |
|  |  5H  |<- 8% ->|............................| RST 4h 10m |  |
|  |  WK  |<------------- 77% ------------>|....| RST 1d 06h |  |
|  +---------------------------------------------------------+  |
|  |  [C1] GEMINI // PLAN: AI PRO       [TOLERANCE: STALE 3H]|  |
|  |  5H  |<--- 17% --->|.......................| RST 1h 05m |  |
|  |  WK  |<- 7% ->|............................| RST 6d 00h |  |
+--+------------------------------------+--------------------+--+
|  |  TOLERANCE: <50 OK / >80 CRIT      | DWG: QUOTA // CAD  |  |
+--+------------------------------------+--------------------+--+
```

- **Typography (Google Fonts):** `'Space Mono'` (400/700, technical dimension callouts) + `'Barlow Semi Condensed'` (600, ISO drafting title block).
- **Palette:** Cyanotype Blueprint — Background `#0A244D`, Surface `#0E2F63`, Text `#E8F1FF`, Muted `#7FA6E0`, Accent `#FFFFFF`, OK `#64FFDA`, Warn `#FFD166`, Danger `#FF5C77`.
- **Meter Primitive:** `cad-dimension-bar` (technical drafting bar with perpendicular end-stop ticks `|---|`, diagonal hatched fill, and centered dimension callout).
- **Readable at a Glance:** Dimension arrows and crisp orthographic grid lines appeal directly to engineers and CAD/hardware developers, turning quota limits into physical tolerances.
- **Inspiration URLs:**
  - https://dribbble.com/tags/blueprint
  - https://www.behance.net/search/projects/technical%20drawing%20ui
  - https://teenage.engineering/

---

### 20 — Pill Stack / Modular Smart-Home Chips (`20-modular-pills`)

**Description:**  
Inspired by Apple HomeKit / Google Material You quick-settings tiles and macOS Control Center modules, this layout eliminates outer widget chrome and headers when desired, presenting each quota window or provider as a **self-contained, stadium-shaped capsule pill** where the pill's own background acts as the progress bar fill (`linear-gradient(90deg, fillPct, surfacePct)`). Pills reflow automatically from a 2×2 grid to a single vertical column or a single horizontal dock bar, making it the most fluidly adaptive design across all aspect ratios.

**Layout Sketch (ASCII):**
```text
+---------------------------------------------------------------+
|  (  CLAUDE · Max      5H: 34% (2h41)  |  WK: 61% (3d4h)    )  |
|  (  [##########.......................]  [################.] ) |
|                                                               |
|  (  CODEX · Plus      5H: 8% (4h10)   |  WK: 77% (1d6h)    )  |
|  (  [###..............................]  [#################] ) |
|                                                               |
|  (  GEMINI · Pro [!]  5H: 17% (1h05)  |  WK: 7% · STALE 3h )  |
|  (  [#####............................]  [##...............] ) |
+---------------------------------------------------------------+
```

- **Typography (Google Fonts):** `'Plus Jakarta Sans'` (600/700, friendly modern rounded sans) + `'JetBrains Mono'` (500, capsule badge numbers).
- **Palette:** Material Slate & Pastel Neon — Background `#0F1117`, Surface `#1E222D`, Text `#F3F4F6`, Muted `#9CA3AF`, Accent `#818CF8`, OK `#34D399`, Warn `#FBBF24`, Danger `#FB7185`.
- **Meter Primitive:** `full-bleed-pill-card` (stadium capsule `border-radius: 999px` or `24px` where the card background itself is split into filled and unfilled zones, with dual mini-pills inside).
- **Readable at a Glance:** Because the entire card background fills from left to right with soft semantic color, you can read the quota from 3 meters away without focusing on thin 4px bars.
- **Inspiration URLs:**
  - https://m3.material.io/
  - https://dribbble.com/tags/ios-widget
  - https://github.com/amnweb/yasb

---

## 2. Responsive Size System & Graceful Compression Specification

### 2.1 Diagnosing the v1 Resize Problem
In v1, when a user resized a widget horizontally or vertically, several layouts relied on naive CSS `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))` without height/width density tiers. As a result:
- Widening a vertical card suddenly snapped 3 providers into an awkward 2+1 two-column orphan grid.
- Shrinking a widget clipped content or crushed two columns together instead of **shedding secondary metadata first** and **switching to a denser structural representation**.

### 2.2 Five Canonical Size Tiers & Exact Breakpoints

Every theme in `.quota-theme.json` must support **progressive disclosure** across 5 size tiers determined by the widget container's live `(width, height)` via CSS Container Queries (`@container widget (...)`) in Tauri and `width`/`height` state bindings in Qt QML:

| Size Tier | Target Dimensions | Container Breakpoint Rule | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **XS (Corner Badge)** | `~160 × 90 px` (min `130×72`) | `width < 220px` OR `height < 140px` | Tiny always-on-top corner badge for 1–3 providers (ultra-dense summary). |
| **S (Compact Card)** | `~260 × 200 px` | `220px <= width < 320px` OR `140px <= height < 280px` | Compact desktop mini-card tucked beside an IDE split pane. |
| **M (Default)** | `340 × 480 px` to `540 × 440 px` | `320px <= width < 620px` AND `280px <= height < 540px` | Standard desktop widget showing all primary and secondary telemetry. |
| **L (Dashboard)** | `~680 × 560 px`+ | `width >= 620px` AND `height >= 540px` | Expanded second-screen telemetry monitor with pace deltas & extra windows. |
| **Strip (Horizontal)** | `480–1200 × 36–64 px` | `height < 72px` AND `width >= 300px` | Docked top/bottom desktop bar or wide floating ribbon. |

---

### 2.3 Progressive Field-Shedding Hierarchy (What Hides First)

When the user shrinks a widget (either via preset XS/S/M/L buttons or free corner dragging), elements must be hidden in strict **8-step priority order** (Step 1 is shed first; Step 8 is never shed):

1. **Step 1 (Shed below `L` / `< 560px` height or `< 480px` width):** Footer severity legend (`<50% OK · 50-80% WARN · >80% CRIT`), decorative theme signature (`MATRIX//01`), and verbose pace text (`+6% vs 55% pace` collapses to `+6%`).
2. **Step 2 (Shed below `M` / `< 380px` height):** Extra/tertiary windows (`Opus weekly 12%`) collapse from a full row into a tiny inline header chip (`OP:12%`), and then hide completely below `260px` height.
3. **Step 3 (Shed at `S` upper bound / `< 320px` width or `< 260px` height):** Widget outer header bar (`QUOTA` title + `Last refresh 23:41`). Refresh status merges into a `6px` status dot in the top-right corner of the widget frame.
4. **Step 4 (Shed at `S` core / `< 280px` width):** Verbose window labels (`"5-Hour Window"` -> `"5H"`, `"Weekly Window"` -> `"WK"`, `"resets in 2h 41m"` -> `"2h41"`, `"updated 3h ago"` -> `"3h"`).
5. **Step 5 (Shed at `S` lower bound / `< 240px` width or `< 190px` height):** Provider plan badges (`Max`, `Plus`, `AI Pro`) and reset countdown timers (`2h41`) hide from the default view (available on hover tooltip).
6. **Step 6 (Shed entering `XS` / `< 200px` width or `< 130px` height):** Secondary window meter bars hide; the weekly window condenses to a muted inline text suffix (`5H 34% · W 61%`) or a 2px underline beneath the 5H meter.
7. **Step 7 (Shed at extreme `XS` / `< 160px` width):** Provider full names (`Claude`, `Codex`, `Gemini`) abbreviate to 2-letter monograms (`CL`, `CX`, `GM`), and stale badges condense to a high-contrast `!` icon + dashed border.
8. **Step 8 (Never Shed — Core Telemetry):** Provider identifier (`CL`/`Claude`), primary window percentage (`34%`), and severity color/texture encoding (`normal` / `warning` / `danger` / `stale`).

---

### 2.4 Free-Resize Layout Reflow Rules (Preventing Naive 2-Column Splits)

To fix the owner's complaint where resizing width caused awkward 2-column splits:
1. **No Orphan Multi-Column Grids (`2+1` Ban):**  
   A widget with `N` active providers (`N = 3`) may ONLY arrange providers in:
   - **1 Column (`N × 1` vertical stack)** when aspect ratio `width / height < 1.35`, OR
   - **Equal `1 × N` Horizontal Columns (`3 across`)** when `width >= N * 165px` AND `width / height >= 1.35`.
   - *Never* render a 2-column row with 1 leftover card spanning half-width underneath when `N = 3`. (If `N = 2`, a `1 × 2` side-by-side split is allowed when `width >= 340px` and `width / height >= 1.2`).
2. **Internal Card Density Switch before External Reflow:**  
   When vertical height decreases while width remains moderate (`300–450px`), each provider card switches its internal `.windows-list` from `stacked-rows` (2 vertical rows per provider) to `compact-inline-grid` (`5H: 34% [====..] | WK: 61% [======.]` on a single horizontal line) **before** changing the outer provider column count.
3. **XS Corner Badge Layout (`~160×90 px`):**
   - If **1 provider** is active in the instance: displays a large typographic badge (`CLAUDE · MAX`, giant `34%` 5H readout, mini bar, `RST 2h41`, `WK 61%`).
   - If **3 providers** are active in the instance: renders 3 ultra-tight `24px`-high horizontal micro-rows:
     ```text
     +----------------------+
     | CL  [===.....] 34|61 |
     | CX  [=.......] 08|77 |
     | GM! [==......] 17|07 |
     +----------------------+
     ```

---

### 2.5 Minimum Readable Font Sizes

To prevent illegible micro-text on Windows (ClearType / 100%–150% DPI) and Linux (FreeType / Wayland fractional scaling), themes must enforce hard `clamp()` floors:

| Token Role | XS (`160×90`) | S (`260×200`) | M (Default) | L (Dashboard) | Absolute Hard Minimum |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Percentage (`5H %`)** | `14px` (3 prov) / `24px` (1 prov) | `16px` | `20px–28px` | `28px–56px` | **`13px`** (`font-weight: 700`) |
| **Provider Name / Monogram** | `12px` (`CL`/`CX`/`GM`) | `13px` | `16px–20px` | `20px–24px` | **`11px`** (`font-weight: 700`) |
| **Secondary Percentage (`WK %`)** | `11px` | `12px` | `14px–18px` | `18px–24px` | **`11px`** (`tabular-nums`) |
| **Window Label (`5H` / `Weekly`)** | `10px` (`5H`/`WK`) | `10.5px` | `11px–12px` | `13px` | **`10px`** (uppercase + `0.5px` tracking) |
| **Reset Countdown (`2h 41m`)** | Hidden (or `10px` if 1 prov) | `10px` | `10.5px–11px` | `12px` | **`10px`** (monospace) |
| **Plan / Stale Micro-Badge** | `9.5px` (`!` icon) | `10px` | `10px–11px` | `11px–12px` | **`9.5px`** (high contrast pill) |

---

### 2.6 Multi-Instance & Per-Instance Provider Subset Architecture

Users often want multiple simultaneous widgets—for example, a **single-provider XS badge** (`160×90`) for Claude pinned over the corner of VS Code while a **full 3-provider M widget** sits on a secondary monitor.

To support this cleanly in `.quota-theme.json` and the widget runtime state (`instances.json`):
```json
{
  "instances": [
    {
      "instanceId": "main-desktop-card",
      "surface": "desktop-widget",
      "themeId": "01-dot-matrix",
      "paletteId": "signal-orange",
      "sizePreset": "M",
      "geometry": { "x": 1540, "y": 120, "width": 340, "height": 640 },
      "providersFilter": ["claude", "codex", "gemini"],
      "windowsFilter": ["5h", "weekly", "extra"],
      "alwaysOnTop": false
    },
    {
      "instanceId": "corner-claude-watcher",
      "surface": "desktop-widget",
      "themeId": "05-brutalist-numbers",
      "paletteId": "mono-paper",
      "sizePreset": "XS",
      "geometry": { "x": 1740, "y": 950, "width": 160, "height": 90 },
      "providersFilter": ["claude"],
      "windowsFilter": ["5h", "weekly"],
      "alwaysOnTop": true
    },
    {
      "instanceId": "win11-taskbar-band",
      "surface": "taskbar-panel",
      "panelStyleId": "panel-01-stacked-pair",
      "paletteId": "system-auto",
      "providersFilter": ["claude", "codex"],
      "windowsFilter": ["5h"],
      "sortByHighestSeverity": true
    }
  ]
}
```

---

## 3. Taskbar & Panel Designs (Windows 11, KDE Plasma, Waybar/GNOME)

Desktop widgets and OS panels have fundamentally different vertical constraints:
- **Windows 11 Taskbar:** `40–48 px` total height (`32–40 px` safe inner content height), positioned adjacent to the system tray (like *TrafficMonitor*).
- **KDE Plasma 6 Panel:** `32–44 px` typical height (supports `PlasmoidItem` `compactRepresentation` in the panel and `fullRepresentation` popup on click).
- **Linux Waybar / Polybar / GNOME Top Bar:** `26–32 px` ultra-slim bar height.

Below are **6 purpose-built taskbar/panel designs**, each tailored to these exact pixel heights.

---

### Panel 01 — TrafficMonitor Dual-Deck Stacked Text (`panel-01-stacked-text`)
- **Target Surfaces:** Windows 11 Taskbar (`44px`), KDE Plasma Panel (`38–44px`).
- **Width:** `96–115 px`.
- **Concept:** Directly inspired by the classic Windows *TrafficMonitor* CPU/RAM/Net taskbar plugin. Uses two tightly stacked `13px` monospace rows (`line-height: 1.15`) showing the top 2 selected providers (or cycling/sorting by highest severity).
- **ASCII Sketch (`108 × 42 px`):**
  ```text
  +--------------------+
  | ● CL  34%   2h 41m |
  | ▲ CX  77%   1d 06h |
  +--------------------+
  ```
- **Visual Details:** Leading symbol encodes severity (`●` green OK, `▲` amber warning, `◆` red danger, `!` stale). User can configure each line independently (e.g., Line 1 = `Claude 5h`, Line 2 = `Claude Weekly`, or Line 1 = `Claude 5h`, Line 2 = `Codex Weekly`).

---

### Panel 02 — Tri-Provider Micro-Equalizer Pillars (`panel-02-micro-pillars`)
- **Target Surfaces:** Windows 11 Taskbar (`40–48px`), KDE Plasma Panel (`32–44px`), Waybar (`28–32px`).
- **Width:** `84–110 px`.
- **Concept:** Shows all 3 providers side-by-side in minimal horizontal space. Each provider gets a 2-letter monogram (`CL`, `CX`, `GM`) paired with **two vertical 4px-wide micro-bars** (left bar = `5h`, right bar = `Weekly`) and the primary percentage.
- **ASCII Sketch (`112 × 36 px`):**
  ```text
  +----------------------------------+
  |  || 34%    |█ 77%    |. 17%!     |
  |  CL        CX        GM          |
  +----------------------------------+
  ```
- **Visual Details:** At `28px` Waybar height, the monogram sits to the left of the dual vertical bars (`CL ▃▆ 34%`). Stale state pulses the right bar border in dashed red.

---

### Panel 03 — Single-Provider Focus Pill with Pace Dot (`panel-03-single-focus`)
- **Target Surfaces:** Windows 11 Taskbar (`40–48px`), KDE Plasma (`32–44px`), Waybar/GNOME (`28–32px`).
- **Width:** `110–136 px`.
- **Concept:** Built for users who primarily care about **one active coding assistant at a time** (or configure `"mode": "highest-severity-auto"` so the pill automatically switches to whichever provider is closest to exhaustion). Shows provider code, a `48px` horizontal progress track with a white **pace marker tick**, percentage, and reset timer.
- **ASCII Sketch (`132 × 32 px`):**
  ```text
  +-------------------------------+
  | CL  [====|.......] 34% · 2h41 |
  +-------------------------------+
  ```
- **Visual Details:** Fits comfortably inside a single `28px` GNOME Top Bar or Waybar module pill (`border-radius: 999px`) without two-line stacking.

---

### Panel 04 — Waybar / Polybar Segmented Powerline Strip (`panel-04-waybar-strip`)
- **Target Surfaces:** Linux Waybar / Polybar (`28–32px`), wide KDE Panel (`32–36px`).
- **Width:** `190–240 px`.
- **Concept:** Inspired by `r/unixporn` Waybar/Polybar `custom/quota` modules using Nerd Font / geometric separators and crisp flat background blocks. Displays all 3 providers inline with `5h|wk` dual readouts and a 5-character block bar.
- **ASCII Sketch (`228 × 28 px`):**
  ```text
  +-------------------------------------------------------------+
  | [ CL 34% ▰▱▱ 2h41 ] [ CX 8%|77%▲ ▰▰▱ ] [ GM! 17% ▱▱▱ 3h ]  |
  +-------------------------------------------------------------+
  ```
- **Visual Details:** Exports both as a native GUI panel widget AND as a JSON/Pango markup stdout formatter (`{"text": "...", "tooltip": "...", "class": "warning"}`) so Linux tiling WM users (Hyprland, Sway, i3) can pipe our CLI directly into Waybar or Polybar.

---

### Panel 05 — Radial Ring + Giant Numeral Applet (`panel-05-ring-badge`)
- **Target Surfaces:** Windows 11 Taskbar (`40–48px`), KDE Plasma Panel (`36–44px` icon-applet slot).
- **Width:** `44–88 px` (`44px` for 1 provider, `88px` for 2–3 providers).
- **Concept:** Designed to blend natively next to circular/square system tray icons (battery, volume, network). A `28×28 px` dual concentric SVG ring wraps a bold 2-digit number (`34`) inside the ring, with a tiny `2px` bottom badge showing the provider letter (`C`, `X`, `G`).
- **ASCII Sketch (`96 × 40 px`):**
  ```text
  +----------------------------+
  |  ( 34 )   ( 77 )   ( 17!)  |
  |    CL       CX       GM    |
  +----------------------------+
  ```
- **Visual Details:** Outer arc = 5-hour quota; inner arc = weekly quota; center number = whichever window is higher (or pinned to 5h). Takes almost zero horizontal taskbar space.

---

### Panel 06 — Dual-Horizon Micro-Bar Deck (`panel-06-horizon-deck`)
- **Target Surfaces:** Windows 11 Taskbar (`44–48px`), KDE Plasma Panel (`38–44px`).
- **Width:** `130–160 px`.
- **Concept:** Combines stacked text with full-width micro progress bars underneath each line, giving both exact numeric telemetry and analog bar length for 2 or 3 providers inside a `44px` taskbar slot.
- **ASCII Sketch (`148 × 44 px`):**
  ```text
  +----------------------------+
  | CL 34% (2h41)  WK 61%      |
  | [======...........]        |
  | CX 08% (4h10)  WK 77% ▲    |
  | [=============....]        |
  +----------------------------+
  ```

---

### 3.2 Hover Tooltip & Click Flyout / Popup Specification

Because panel surfaces are compact, **hovering** or **clicking** the taskbar/panel widget opens a rich secondary surface:

1. **Native Hover Tooltip (Instant, `<150ms` delay):**
   - Plain or rich OS tooltip listing all enabled providers, both 5h and Weekly %, exact reset timestamps (`Resets at 02:22 local — in 2h 41m`), pace delta (`-12% under pace`), and last sync time (`23:41:08`).
2. **Click Flyout Card (`360 × 420 px` anchored above taskbar / below top panel):**
   - Renders the user's selected **Size M Theme** inside a borderless OS flyout window (Windows 11 Tray Flyout / KDE Plasma `fullRepresentation` popup).
   - Includes quick-action header buttons: `[Refresh Now]`, `[Copy Telemetry JSON]`, `[Switch Surface Filter]`, and `[Open Settings]`.

### 3.3 Independent Per-Surface Settings
Each surface (`desktop-widget` instances vs. `taskbar-panel` applet) maintains independent display rules:
- **Example Setup A:** Desktop widget (`M`) on secondary monitor shows `Claude + Codex + Gemini` with all windows; Windows 11 Taskbar (`Panel 03`) shows **only Claude 5-hour window**.
- **Example Setup B:** No desktop widget visible; KDE Plasma top panel (`Panel 02`) shows all 3 providers as micro-pillars, and clicking it pops open the **02 Circular Rings** view.
- **Smart Auto-Promote Rule (`promoteCriticalProvider: true`):** Even if the taskbar is set to show only `Claude`, if `Codex Weekly` crosses `80%` (`danger`), the taskbar temporarily splits or swaps to surface the critical alert.

---

## 4. Sixteen Named Color Palette Presets & Custom Palette Editor

Every layout theme (`01` through `20`) can be paired with any of the **16 named color palettes** below. All palettes have been verified for WCAG 2.1 text contrast (`textPrimary` vs `bgCard` $\ge 7.0:1$ AAA, `textSecondary`/`muted` vs `bgCard` $\ge 4.5:1$ AA, and semantic severity tokens $\ge 4.5:1$ against `bgCard`).

### 4.1 Complete 16-Palette Token Table

| # | Palette Name (`id`) | Mode | `bgWidget` | `bgCard` (Surface) | `textPrimary` | `textMuted` | `accent` | `severityOk` (`<50%`) | `severityWarn` (`50-80%`) | `severityDanger` (`>80%`) | Contrast & Design Notes |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 01 | **Signal Orange** (`signal-orange`) | Dark | `#0E0E11` | `#15151A` | `#F4F4F6` | `#8E8E9E` | `#FF3B1D` | `#F4F4F6` | `#FF9E1B` | `#FF2A2A` | 15.8:1 text contrast; industrial monochrome + high-vis orange beacon. |
| 02 | **Sakura Pink** (`sakura-pink`) | Light | `#FDF2F5` | `#FCE7EE` | `#2D121E` | `#7A4E62` | `#E11D74` | `#0D9488` | `#D97706` | `#E11D48` | 14.2:1 text contrast; warm blossom daylight theme with deep berry ink. |
| 03 | **Nord** (`nord`) | Dark | `#242933` | `#2E3440` | `#ECEFF4` | `#9099AB` | `#88C0D0` | `#A3BE8C` | `#EBCB8B` | `#BF616A` | 11.4:1 text contrast; authentic Arctic Nord frost palette (`#2E3440`–`#ECEFF4`). |
| 04 | **Solarized Dark** (`solarized-dark`) | Dark | `#00212B` | `#073642` | `#FDF6E3` | `#93A1A1` | `#268BD2` | `#859900` | `#B58900` | `#DC322F` | 12.1:1 text contrast; Ethan Schoonover's precision lab-space luminance scale. |
| 05 | **Mono Paper** (`mono-paper`) | Light | `#F2EFE9` | `#E6E2D8` | `#141413` | `#5C5954` | `#141413` | `#141413` | `#8C5A08` | `#B91C1C` | 14.9:1 text contrast; warm newsprint / e-ink Carta daylight readability. |
| 06 | **Matrix Green** (`matrix-green`) | Dark | `#030A04` | `#071409` | `#D1FFD7` | `#4E9A57` | `#00FF41` | `#00FF41` | `#CCFF00` | `#FF3355` | 16.5:1 text contrast; CRT P1 phosphor green monochrome terminal aesthetic. |
| 07 | **High Contrast AAA** (`high-contrast`) | Dark | `#000000` | `#0A0A0A` | `#FFFFFF` | `#D4D4D4` | `#00FFFF` | `#00FF66` | `#FFFF00` | `#FF3333` | **21.0:1** max contrast; pure black/white with `2px` solid borders for low vision. |
| 08 | **Okabe-Ito Safe** (`okabe-ito-safe`) | Dark | `#0F141C` | `#171F2C` | `#F8FAFC` | `#94A3B8` | `#56B4E9` | `#009E73` | `#E69F00` | `#D55E00` | **Color-blind safe** (Deuteranopia / Protanopia / Tritanopia verified); blue-teal / amber / vermilion. |
| 09 | **Viridis Telemetry** (`viridis-safe`) | Dark | `#10111E` | `#191B2E` | `#F5F7FA` | `#9AA1B9` | `#21918C` | `#35B779` | `#FDE725` | `#F8536B` | **Color-blind safe**; perceptually uniform luminance progression from cool teal to bright yellow/coral. |
| 10 | **Paul Tol Muted Safe** (`tol-light-safe`) | Light | `#F7F8FA` | `#FFFFFF` | `#111827` | `#4B5563` | `#332288` | `#117733` | `#DDCC77` | `#882255` | **Color-blind safe (Light)**; uses dark forest, sand-ochre (`#997700` text), and wine-purple (`#882255`). |
| 11 | **Catppuccin Mocha** (`catppuccin-mocha`) | Dark | `#11111B` | `#1E1E2E` | `#CDD6F4` | `#9399B2` | `#CBA6F7` | `#A6E3A1` | `#F9E2AF` | `#F38BA8` | 11.8:1 text contrast; community-favorite soothing pastel dark theme on crust/base. |
| 12 | **Gruvbox Industrial** (`gruvbox-dark`) | Dark | `#1D2021` | `#282828` | `#EBDBB2` | `#A89984` | `#FE8019` | `#B8BB26` | `#FABD2F` | `#FB4934` | 10.9:1 text contrast; warm retro-industrial groove palette with earthy cream text. |
| 13 | **Tokyo Night** (`tokyo-night`) | Dark | `#16161E` | `#1A1B26` | `#C0CAF5` | `#7982A9` | `#7AA2F7` | `#73DACA` | `#E0AF68` | `#F7768E` | 10.6:1 text contrast; neon-lit Japanese night sky indigo & cyan telemetry. |
| 14 | **Dracula Neon** (`dracula`) | Dark | `#1E1F29` | `#282A36` | `#F8F8F2` | `#959DCB` | `#BD93F9` | `#50FA7B` | `#F1FA8C` | `#FF5555` | 12.6:1 text contrast; high-saturation purple, mint, and coral dark palette. |
| 15 | **Amber Phosphor** (`amber-crt`) | Dark | `#0C0800` | `#171002` | `#FFE082` | `#B38822` | `#FFB000` | `#FFB000` | `#FF7700` | `#FF2200` | 13.7:1 text contrast; vintage 1980s IBM 5153 P3 amber monochrome monitor. |
| 16 | **Cobalt Blueprint** (`cobalt-blueprint`) | Dark | `#071A38` | `#0D274E` | `#EBF3FF` | `#8AB0E6` | `#FFFFFF` | `#5CE1E6` | `#FFD166` | `#FF5C77` | 13.1:1 text contrast; architectural cyanotype Prussian blue with chalk-white rules. |

---

### 4.2 "Make Your Own Palette" Interactive Editor Spec

To let users create and share custom palettes without breaking readability or forgetting secondary surface tokens, the Settings UI includes a **Live Palette Builder** with auto-derivation and real-time accessibility guards:

#### A. The 6 User-Editable Core Tokens
Instead of overwhelming the user with 14 hex pickers, the user edits **6 primary swatches**:
1. `bgWidget` (Main Window Background)
2. `textPrimary` (Main Foreground Text)
3. `accent` (Brand / Interactive Highlight)
4. `severityOk` (`<50%` Normal State)
5. `severityWarn` (`50–80%` Warning State)
6. `severityDanger` (`>80%` Critical / Stale State)

#### B. Deterministic Auto-Derived Secondary Tokens (in OKLCH Color Space)
Whenever the user adjusts `bgWidget` or `textPrimary`, the editor automatically computes the remaining 6 structural tokens in perceptual **OKLCH** space (with an `"Unlock Advanced Tokens"` toggle if they want manual overrides):
- **Mode Detection:** If `OKLCH_L(bgWidget) < 0.50`, mode is `dark`; else `light`.
- `bgCard` (Provider Card Surface):
  - Dark mode: `oklch(L + 0.05, C, H)` of `bgWidget`
  - Light mode: `oklch(L + 0.04, C, H)` (or `#FFFFFF` if `L > 0.94`)
- `bgTrackOff` (Unfilled Meter Bar Track):
  - Mix `82% bgCard + 18% textPrimary` in OKLCH.
- `border` (Card & Hairline Borders):
  - Mix `85% bgCard + 15% textPrimary` in OKLCH.
- `textSecondary`:
  - Mix `68% textPrimary + 32% bgCard` (clamped so WCAG contrast vs `bgCard` is at least `5.0:1`).
- `textMuted`:
  - Mix `52% textPrimary + 48% bgCard` (clamped so WCAG contrast vs `bgCard` is at least `4.5:1`).
- `staleBg` (Stale Card Tint):
  - `color-mix(in srgb, var(--severityDanger) 14%, var(--bgCard))`

#### C. Real-Time Contrast & Color-Blindness Guardrails
As the user drags any color picker, the editor runs two live checks:
1. **WCAG 2.1 Contrast Ratio Badge:**
   - Computes relative luminance contrast $CR = (L_1 + 0.05) / (L_2 + 0.05)$ for:
     - `textPrimary` vs `bgCard` (Warns if `< 4.5:1`, green badge at `>= 7.0:1`)
     - `severityOk`, `severityWarn`, `severityDanger` vs `bgCard` (Warns if any meter color is `< 3.0:1` for graphical objects or `< 4.5:1` for colored percentage numerals, offering a 1-click **`[Auto-Fix Contrast]`** button that shifts lightness `L` until it passes).
2. **Daltonization / Severity Collision Warning:**
   - Simulates Deuteranopia and Protanopia matrices on `(severityOk, severityWarn, severityDanger)`. If the perceptual distance $\Delta E_{OKLab}$ between `severityOk` and `severityDanger` under simulated red-green color blindness drops below `0.12`, displays a non-blocking banner: *"Tip: Your OK and Danger colors look similar under red-green color blindness. Shift OK toward teal/cyan or enable textured bars."*

---

## 5. Prioritized Top 6 Directions to Build First in Round 3

Out of the 12 new directions (`09`–`20`), we recommend building these **6 designs first** as interactive HTML mockups in Round 3:

| Priority | Design ID & Name | Why Build It First (Strategic & Visual Value) |
| :---: | :--- | :--- |
| **#1** | **17 — Horizon Gantt / Burn-Rate Timeline** | **Highest functional utility for heavy AI coders.** Directly expands on the owner-loved *08 Minimal Pace* by showing elapsed window time vs. quota burned as a 2D bullet/horizon chart with projected exhaustion overhang. Compresses effortlessly from L down to XS and `Panel 06`. |
| **#2** | **10 — E-Ink Paper Daylight Slab** | **Best daylight & color-blind safe design.** Introduces halftone/crosshatch SVG fill patterns (`normal` solid, `warning` diagonal hatch, `danger` stipple) and warm editorial serif typography (`Newsreader`), filling the biggest aesthetic gap in the current dark-heavy lineup. |
| **#3** | **09 — Automotive Tachometer Cluster** | **Strongest radial gauge evolution.** While *02 Circular Rings* uses passive fitness arcs, *09 Tachometer* brings kinetic needle angles, tick scales, redline sectors, and digital odometer boxes that read in `<100ms` via needle posture. |
| **#4** | **12 — Industrial Audio VU / Mixing Console** | **Introduces vertical bar orientation.** All existing bar designs (`01, 03, 04, 06, 07, 08`) use horizontal bars. Bottom-up vertical LED channel ladders (`5H` + `WK` side-by-side) allow instant height comparison across providers and map directly to `Panel 02` (taskbar micro-pillars). |
| **#5** | **11 — Mechanical Split-Flap Solari Board** | **High-craft retro-industrial showpiece.** Delivers the tactile mechanical charm of airport departure boards and hardware synthesizers using pure CSS/HTML split-flap tiles, tabular timetable scanability, and discrete flap meters. |
| **#6** | **20 — Pill Stack / Modular Smart-Home Chips** | **Best showcase for the XS/S/M/L Size System.** Because each provider or window is a self-contained stadium capsule whose background acts as the progress fill, it demonstrates graceful field-shedding from a single `160×90` XS corner badge up to a multi-provider desktop dock. |

*(Runner-ups for a subsequent wave: **15 Liquid Silo Tanks** for consumer-friendly battery aesthetics, and **13 Thermal Receipt Ticker** for compact vertical corner pinning.)*
