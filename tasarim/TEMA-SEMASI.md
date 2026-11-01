# QUOTA — Declarative Layout & Visual Theme Schema (`TEMA-SEMASI.md`)

## 1. Overview & Design Goals

Traditional widget theme formats only swap color palettes. To allow a single JSON file (`*.quota-theme.json`) to switch between all **8 structurally distinct widget designs**—from a `1040×48` horizontal top-bar strip to a `340×640` dot-matrix vertical dock or a `540×440` concentric SVG ring bento grid—the schema separates **Data Binding & Visibility**, **Structural Layout Geometry**, **Meter Component Primitives**, and **Visual Tokens (Dark & Light variants)**.

Furthermore, the schema is deliberately constrained to a finite set of layout containers and meter primitives so it can be rendered **without arbitrary code execution** in either:
1. **Tauri / Webview (HTML + CSS Grid/Flexbox + SVG)**
2. **Qt 6 / QML (`GridLayout`, `RowLayout`, `ColumnLayout`, `Repeater`, `Loader`, `Canvas`/`Shape`)**

---

## 2. Theme Schema Architecture

A `.quota-theme.json` document contains 7 top-level sections:

| Section | Responsibility | HTML/CSS (Tauri) Mapping | Qt QML Mapping |
| :--- | :--- | :--- | :--- |
| `meta` | Theme ID, name, version, author, target screen anchor | Window config & metadata | `ApplicationWindow` flags & anchors |
| `window` | Fixed dimensions (`width`, `height`), resizable behavior, corner radius, backdrop blur, surface texture | `tauri.conf.json` window size + root `.widget-frame` CSS | `Window { width; height; color: "transparent" }` + `MultiEffect` |
| `layout` | Root flow (`vertical-stack`, `bento-grid`, `horizontal-strip`), provider reflow rules for 1/2/3 active providers, card internal arrangement | CSS Grid `grid-template-columns: repeat(auto-fit, ...)` / Flexbox `flex: 1` | `GridLayout` / `RowLayout` / `ColumnLayout` with `Layout.fillWidth` & `Layout.fillHeight` |
| `components` | Meter primitive (`dot-matrix-bar`, `concentric-rings`, `ascii-bar`, `liquid-capsule`, `giant-numeral`, `inline-micro-bar`, `lcd-segment-bar`, `pace-hairline`), header/footer style | Template component selector | `Loader { sourceComponent: ... }` |
| `fields` | Toggle visibility and placement of `appName`, `lastRefresh`, `planBadge`, `resetTimer`, `extraWindows`, `staleBadge`, `updatedAgoTag`, `paceDelta` | Conditional DOM rendering / `[hidden]` | `visible: theme.fields.showResetTimer` |
| `typography` | Font families (`display`, `sans`, `mono`), sizes, weights, letter spacing | `@import` Google Fonts + CSS variables | `FontLoader` + `font.family`, `font.pixelSize` |
| `severity` & `palettes` | Thresholds (`warningAt: 50`, `dangerAt: 80`) and semantic color tokens for both `dark` and `light` modes | `:root` and `[data-theme="light"]` CSS custom properties | `QtObject` theme singleton bound to QML properties |

---

## 3. Formal Field Reference

### 3.1 `layout` Object
- `mode`: `"vertical-stack"` | `"bento-grid"` | `"columns-grid"` | `"horizontal-strip"`
- `providerReflow`:
  - `strategy`: `"flex-grow"` | `"auto-fit-columns"`
  - `minProviders`: `1`
  - `maxProviders`: `3`
  - `gapPx`: integer spacing between provider cards/segments
- `providerInternalLayout`:
  - `windowsArrangement`: `"stacked-rows"` | `"two-column-grid"` | `"concentric-radial"` | `"inline-horizontal"`
  - `extraWindowPlacement`: `"footer-row"` | `"header-chip"` | `"inner-ring"` | `"stacked-row"`
  - `staleIndicatorStyle`: `"dashed-border-badge"` | `"hazard-footer-bar"` | `"inline-pill"` | `"cli-flag"`

### 3.2 `components.meter` Object
- `type`:
  1. `"dot-matrix-bar"` — `segments: 20`, circular LED dots (`01-dot-matrix.html`)
  2. `"concentric-rings"` — nested SVG/Canvas radial arcs for 5h, weekly, and extra windows (`02-circular-rings.html`)
  3. `"ascii-bar"` — character-based `[████░░]` bar with configurable `charWidth`, `fillChar`, `emptyChar` (`03-terminal-tui.html`)
  4. `"liquid-capsule"` — rounded continuous progress track with gradient fill (`04-frosted-glass.html`)
  5. `"giant-numeral"` — oversized typographic readout with secondary underline bar (`05-brutalist-numbers.html`)
  6. `"inline-micro-bar"` — compact dual-deck label + 6px bar for 48px horizontal strips (`06-compact-strip.html`)
  7. `"lcd-segment-bar"` — `segments: 12` rectangular LCD bricks + `888%` 7-segment ghost backdrop (`07-retro-lcd.html`)
  8. `"pace-hairline"` — 4px hairline bar with an overlay tick at `elapsedWindowPct` and `+/-` pace delta (`08-minimal-pace.html`)

### 3.3 How All 8 Mockups Map to the Schema

| Design File | `window.width` × `height` | `layout.mode` | `layout.providerInternalLayout.windowsArrangement` | `components.meter.type` |
| :--- | :--- | :--- | :--- | :--- |
| `01-dot-matrix.html` | `340 × 640` | `vertical-stack` | `stacked-rows` | `dot-matrix-bar` |
| `02-circular-rings.html` | `540 × 440` | `bento-grid` | `concentric-radial` | `concentric-rings` |
| `03-terminal-tui.html` | `540 × 410` | `vertical-stack` | `stacked-rows` | `ascii-bar` |
| `04-frosted-glass.html` | `440 × 520` | `vertical-stack` | `two-column-grid` | `liquid-capsule` |
| `05-brutalist-numbers.html` | `560 × 440` | `columns-grid` | `stacked-rows` | `giant-numeral` |
| `06-compact-strip.html` | `1040 × 48` | `horizontal-strip` | `inline-horizontal` | `inline-micro-bar` |
| `07-retro-lcd.html` | `480 × 460` | `vertical-stack` | `two-column-grid` | `lcd-segment-bar` |
| `08-minimal-pace.html` | `460 × 520` | `vertical-stack` | `stacked-rows` | `pace-hairline` |

---

## 4. Full Example Theme 1: Design 01 — Dot-Matrix Monochrome (`01-dot-matrix.theme.json`)

```json
{
  "$schema": "https://quota.example.local/schemas/quota-theme-v1.json",
  "meta": {
    "id": "01-dot-matrix",
    "name": "Dot-Matrix Monochrome Card",
    "version": "1.0.0",
    "screenAnchor": "right-center",
    "supportsLightDarkToggle": true
  },
  "window": {
    "width": 340,
    "height": 640,
    "paddingPx": { "top": 16, "right": 14, "bottom": 16, "left": 14 },
    "cornerRadiusPx": { "topLeft": 18, "topRight": 0, "bottomRight": 0, "bottomLeft": 18 },
    "borderWidthPx": { "top": 2, "right": 5, "bottom": 2, "left": 2 },
    "rightEdgeAccentBorder": true,
    "backdropBlurPx": 0,
    "surfacePattern": {
      "type": "radial-dot-matrix",
      "gridSizePx": 6,
      "dotRadiusPx": 1
    }
  },
  "layout": {
    "mode": "vertical-stack",
    "headerPosition": "top",
    "footerPosition": "bottom",
    "providerReflow": {
      "strategy": "flex-grow",
      "minProviders": 1,
      "maxProviders": 3,
      "gapPx": 10
    },
    "providerCard": {
      "paddingPx": 12,
      "cornerRadiusPx": 10,
      "borderWidthPx": 1,
      "windowsArrangement": "stacked-rows",
      "windowRowGapPx": 8,
      "extraWindowPlacement": "footer-row",
      "staleIndicatorStyle": "dashed-border-badge"
    }
  },
  "components": {
    "header": {
      "showBeaconDot": true,
      "refreshPrefix": "SYNC",
      "borderStyle": "dashed"
    },
    "meter": {
      "type": "dot-matrix-bar",
      "segments": 20,
      "extraWindowSegments": 10,
      "segmentShape": "circle",
      "segmentHeightPx": 8,
      "segmentGapPx": 3,
      "glowOnWarningAndDanger": true,
      "showPaceMarker": false
    },
    "footer": {
      "showSeverityLegend": true,
      "rightSignatureText": "MATRIX//01"
    }
  },
  "fields": {
    "showAppName": true,
    "showLastRefresh": true,
    "showProviderPlan": true,
    "show5HourWindow": true,
    "showWeeklyWindow": true,
    "showExtraWindows": true,
    "showResetCountdown": true,
    "resetPrefix": "RST",
    "showStaleTag": true,
    "showUpdatedAgoTag": true,
    "showPaceDelta": false
  },
  "typography": {
    "googleFontsUrl": "https://fonts.googleapis.com/css2?family=DotGothic16&family=JetBrains+Mono:wght@400;600;700&display=swap",
    "fontDisplay": "'DotGothic16', monospace",
    "fontBody": "'JetBrains Mono', monospace",
    "fontMono": "'JetBrains Mono', monospace",
    "sizesPx": {
      "appTitle": 22,
      "providerName": 20,
      "planBadge": 10,
      "windowLabel": 11,
      "percentagePrimary": 20,
      "percentageExtra": 14,
      "resetTimer": 10,
      "staleTag": 11
    }
  },
  "severity": {
    "normalMaxPct": 49.99,
    "warningMinPct": 50.0,
    "warningMaxPct": 80.0,
    "dangerMinPct": 80.01
  },
  "palettes": {
    "dark": {
      "bgWidget": "#0e0e11",
      "bgCard": "#141419",
      "bgTrackOff": "#25252e",
      "textPrimary": "#f2f2f5",
      "textSecondary": "#8a8a98",
      "textMuted": "#565664",
      "border": "#282832",
      "accent": "#ff3b1d",
      "severityNormal": "#f2f2f5",
      "severityWarning": "#ff9e1b",
      "severityDanger": "#ff2a2a"
    },
    "light": {
      "bgWidget": "#ececef",
      "bgCard": "#e2e2e7",
      "bgTrackOff": "#c8c8d2",
      "textPrimary": "#121216",
      "textSecondary": "#52525e",
      "textMuted": "#7a7a88",
      "border": "#c2c2cc",
      "accent": "#e02b0e",
      "severityNormal": "#18181f",
      "severityWarning": "#d96b00",
      "severityDanger": "#d91414"
    }
  }
}
```

---

## 5. Full Example Theme 2: Design 02 — Circular Ring Gauges Grid (`02-circular-rings.theme.json`)

```json
{
  "$schema": "https://quota.example.local/schemas/quota-theme-v1.json",
  "meta": {
    "id": "02-circular-rings",
    "name": "Circular Ring Gauges Grid",
    "version": "1.0.0",
    "screenAnchor": "floating-center",
    "supportsLightDarkToggle": true
  },
  "window": {
    "width": 540,
    "height": 440,
    "paddingPx": { "top": 16, "right": 16, "bottom": 16, "left": 16 },
    "cornerRadiusPx": { "topLeft": 22, "topRight": 22, "bottomRight": 22, "bottomLeft": 22 },
    "borderWidthPx": { "top": 1, "right": 1, "bottom": 1, "left": 1 },
    "rightEdgeAccentBorder": false,
    "backdropBlurPx": 0,
    "surfacePattern": {
      "type": "solid"
    }
  },
  "layout": {
    "mode": "bento-grid",
    "headerPosition": "top",
    "footerPosition": "none",
    "providerReflow": {
      "strategy": "auto-fit-columns",
      "minColumnWidthPx": 150,
      "minProviders": 1,
      "maxProviders": 3,
      "gapPx": 12
    },
    "providerCard": {
      "paddingPx": 12,
      "cornerRadiusPx": 16,
      "borderWidthPx": 1,
      "windowsArrangement": "concentric-radial",
      "windowRowGapPx": 6,
      "extraWindowPlacement": "inner-ring",
      "staleIndicatorStyle": "dashed-border-badge"
    }
  },
  "components": {
    "header": {
      "showBeaconDot": false,
      "showRingLegend": true,
      "ringLegendLabels": ["Outer: 5h", "Mid: Weekly", "Inner: Extra"],
      "refreshPrefix": "Last refresh",
      "borderStyle": "none"
    },
    "meter": {
      "type": "concentric-rings",
      "svgViewBoxSize": 140,
      "gaugeDiameterPx": 148,
      "strokeLineCap": "round",
      "rings": [
        { "windowKey": "5h", "radius": 58, "strokeWidth": 10 },
        { "windowKey": "weekly", "radius": 44, "strokeWidth": 10 },
        { "windowKey": "extra", "radius": 30, "strokeWidth": 8 }
      ],
      "centerReadout": {
        "primaryField": "5h",
        "secondaryField": "weekly",
        "caption": "5H / WK"
      },
      "showBottomBreakdownRows": true
    },
    "footer": {
      "showSeverityLegend": false
    }
  },
  "fields": {
    "showAppName": true,
    "showLastRefresh": true,
    "showProviderPlan": true,
    "show5HourWindow": true,
    "showWeeklyWindow": true,
    "showExtraWindows": true,
    "showResetCountdown": true,
    "resetPrefix": "",
    "showStaleTag": true,
    "showUpdatedAgoTag": true,
    "showPaceDelta": false
  },
  "typography": {
    "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Space+Mono:wght@400;700&display=swap",
    "fontDisplay": "'Plus Jakarta Sans', sans-serif",
    "fontBody": "'Plus Jakarta Sans', sans-serif",
    "fontMono": "'Space Mono', monospace",
    "sizesPx": {
      "appTitle": 18,
      "providerName": 16,
      "planBadge": 10,
      "windowLabel": 11,
      "percentagePrimary": 22,
      "percentageSecondary": 12,
      "resetTimer": 10,
      "staleTag": 10
    }
  },
  "severity": {
    "normalMaxPct": 49.99,
    "warningMinPct": 50.0,
    "warningMaxPct": 80.0,
    "dangerMinPct": 80.01
  },
  "palettes": {
    "dark": {
      "bgWidget": "#0f141f",
      "bgCard": "#161d2b",
      "bgTrackOff": "#253047",
      "textPrimary": "#f3f6fc",
      "textSecondary": "#94a3b8",
      "textMuted": "#64748b",
      "border": "#243046",
      "accent": "#38bdf8",
      "severityNormal": "#2dd4bf",
      "severityWarning": "#fbbf24",
      "severityDanger": "#f43f5e"
    },
    "light": {
      "bgWidget": "#f1f5f9",
      "bgCard": "#ffffff",
      "bgTrackOff": "#e2e8f0",
      "textPrimary": "#0f172a",
      "textSecondary": "#475569",
      "textMuted": "#64748b",
      "border": "#cbd5e1",
      "accent": "#0284c7",
      "severityNormal": "#0d9488",
      "severityWarning": "#d97706",
      "severityDanger": "#e11d48"
    }
  }
}
```

---

## 6. Implementation Notes for Tauri (HTML/CSS) vs. Qt QML

### 6.1 Tauri Webview (HTML/CSS/JS)
1. **CSS Custom Properties Injection**: On theme load, iterate over `theme.palettes[activeMode]`, `theme.window`, and `theme.typography` to set `--bg-widget`, `--severity-normal`, `--widget-width`, etc. on `document.documentElement`.
2. **Layout Switching**: Set `data-layout-mode={theme.layout.mode}` on the provider container:
   - `vertical-stack` -> `display: flex; flex-direction: column;` with `.provider-card { flex: 1; }`
   - `bento-grid` / `columns-grid` -> `display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));`
   - `horizontal-strip` -> `display: flex; flex-direction: row; align-items: stretch;`
3. **Component Registry**: Render each window row using a small switch over `theme.components.meter.type` (`DotMatrixBar`, `ConcentricRings`, `AsciiBar`, `LiquidCapsule`, `GiantNumeral`, `InlineMicroBar`, `LcdSegmentBar`, `PaceHairline`).

### 6.2 Qt 6 / QML
1. **Window & Theme Singleton**: Load the JSON via `JSON.parse()` into a `QtObject { id: theme }` singleton and bind `Window.width: theme.window.width` and `Window.height: theme.window.height`.
2. **Dynamic Container (`GridLayout`)**:
   - Bind `columns: theme.layout.mode === "vertical-stack" ? 1 : visibleProviders.count` and `rows: theme.layout.mode === "vertical-stack" ? visibleProviders.count : 1`.
   - Each provider item inside a `Repeater` sets `Layout.fillWidth: true; Layout.fillHeight: true` so hiding 1 or 2 providers automatically expands the remaining provider(s) to fill the widget.
3. **Meter Delegate (`Loader`)**:
   - Inside each provider card, a `Loader` selects `DotMatrixMeter.qml`, `ConcentricRingsMeter.qml` (using `Shape` / `ShapePath` `PathAngleArc`), `AsciiBarMeter.qml`, `LcdSegmentMeter.qml`, or `PaceHairlineMeter.qml` based on `theme.components.meter.type`.
