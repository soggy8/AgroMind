# AgroMind — Frontend Design System

> The visual reference for everyone building `frontend/`. Product facts live in `PRODUCT.md`.
> **Reference screen:** `docs/design/command-center.png` (source: `docs/design/command-center-sketch.html`).
> It's a starting point: match its feel, not its pixels. Its map is a placeholder; the real one is satellite imagery.

---

## 1. The look in one paragraph

A **dark, premium field console**. Real satellite imagery fills the whole screen, and every UI
surface floats above it as **frosted glass**, so the farm is always visible behind the data. Colour does
real work: one **greenness scale** (red → amber → yellow → green) paints fields on the map, in the list
and in the weekly bars, and each indicator has its **own hue** (rain is sky blue, heat is coral, water
use is violet, soil is amber). Lime is reserved for "you / now / act": the primary button, the
selected thing, and this season's line.

**Why dark:** the map imagery reads best on dark, and the demo is projected. On phones outdoors, keep
text contrast high (§8).

---

## 2. Tokens

Paste into `frontend/src/index.css` (Tailwind v4). Everyone uses these names; **no raw hex in components**.

```css
@import "tailwindcss";

@theme {
  /* Ground & glass */
  --color-ground: #0E110F;               /* page behind the map */
  --color-glass: rgb(16 20 18 / .58);    /* panel fill, always with backdrop blur */
  --color-glass-hi: rgb(255 255 255 / .06);  /* inputs, chips inside glass */
  --color-glass-sel: rgb(255 255 255 / .10); /* selected row / active tab */
  --color-line: rgb(255 255 255 / .10);  /* hairlines, panel borders */

  /* Text */
  --color-tx: #F2F5F0;                   /* primary text */
  --color-mut: #B9C2BB;                  /* secondary text: never dimmer than this */

  /* Brand */
  --color-lime: #C6F24E;                 /* primary action, selection, current season */
  --color-lime-ink: #15210A;             /* text on lime */

  /* Indicator hues (one per data type, use everywhere that type appears) */
  --color-rain: #5CC8FF;
  --color-heat: #FF7A59;
  --color-water: #B79BFF;                /* evapotranspiration / water use */
  --color-soil: #F2C46D;

  /* Greenness / NDVI scale (low → high) */
  --color-ndvi-0: #FF5A4E;
  --color-ndvi-1: #FFA23A;
  --color-ndvi-2: #F4E64C;
  --color-ndvi-3: #86D24A;
  --color-ndvi-4: #2FB15A;

  /* Status (text-safe tints on glass) */
  --color-ok: #9BE05E;
  --color-watch: #FFB25E;                /* severity "watch" */
  --color-alert: #FF8E73;                /* severity "alert" and "hotter than normal" */
  --color-watch-fill: #FFA23A;           /* badges/dots only, not body text */

  /* Comparison series (season chart) */
  --color-yr-1: #5CC8FF;                 /* last year */
  --color-yr-2: #B79BFF;                 /* two years ago */
  --color-normal: #8E978F;               /* 10-yr normal, band + dashed line */

  /* Type */
  --font-sans: "Figtree", system-ui, sans-serif;

  /* Radii */
  --radius-panel: 20px;
  --radius-bar: 16px;                    /* top bar */
  --radius-ctl: 10px;                    /* buttons, inputs, tabs */
  --radius-chip: 8px;
}

:root { color-scheme: dark; }
body  { background: var(--color-ground); color: var(--color-tx);
        font-family: var(--font-sans); font-variant-numeric: tabular-nums; }
::selection { background: rgb(198 242 78 / .35); }
:focus-visible { outline: 2px solid var(--color-lime); outline-offset: 2px; border-radius: 6px; }
```

Font: load **Figtree** 400/500/600/700/800 (self-host via `@fontsource/figtree`, so the deploy has no
external font call).

---

## 3. Glass: the one surface recipe

Every floating panel, bar and map control uses exactly this. Don't invent variants.

```css
.glass {
  background: var(--color-glass);
  backdrop-filter: blur(26px) saturate(170%);
  -webkit-backdrop-filter: blur(26px) saturate(170%);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-panel);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .12),     /* top highlight */
              0 24px 60px -12px rgb(0 0 0 / .55);         /* lift */
}
```

Rules:
- **Glass sits on the map, never on glass.** Inside a panel, separate sections with hairlines
  (`border-color: var(--color-line)`) and spacing, not boxes within boxes.
- Selected list row = `--color-glass-sel` fill + hairline border. **No coloured left stripe.**
- Shadows are neutral black with offset. **No coloured glows.**
- Fallback: if `backdrop-filter` is unsupported, use `rgb(16 20 18 / .92)`.

---

## 4. Type scale

| Use | Size / weight | Notes |
|---|---|---|
| Panel title (finding headline) | 21px / 700, tracking −0.01em | One per panel |
| Section heading | 15–16px / 700 | "Fields", "Greenness this season" |
| Body / explanations | 14px / 400, line-height 1.5 | Max ~65 characters per line |
| Row label | 14–15px / 600–700 | Field names, indicator names |
| Meta / source | 12–13px / 500, `--color-mut` | "Observed · NASA POWER" |
| Headline value | 18px / 800 | Numbers in lists |
| Delta | 12px / 700, status colour | "−18% vs normal" |

Minimum text size is **12px**. All numbers are tabular. Always show units ("38 mm", "33.4 °C", "4.9 mm/d").

---

## 5. Layout

### Desktop (≥ 1024px): map with floating panels
```
┌──────────────────────── top bar (glass, 60px, inset 18–20px) ────────────────────────┐
│ logo · farm switcher      [ Command Center | Simulator | Farm profile ]   finding · Ask │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ left panel 350px ┐  [layer switch]                 [zoom]  ┌ right panel 410px ┐
│ Fields list       │                                         │ Finding (if any)  │
│  selected field → │           full-bleed satellite map      │ Season chart      │
│  indicator rows   │      fields outlined white, NDVI fill   │ …                 │
│  weekly strip     │                                         │ data note         │
│ other fields      │  [NDVI colour key]          [source]    │                   │
└───────────────────┘                                         └───────────────────┘
```
- Panels inset **20px** from the window edges and **16px** apart. The map runs underneath everything.
- Map controls (layer switch, zoom, key, source) are small glass pills placed in the gap between panels.
- Simulator and Farm profile reuse the same shell: top bar plus floating panels over the map.

### Tablet (640–1023px)
Left panel collapses to a 64px rail of field thumbnails; right panel becomes a slide-over.

### Phone (< 640px)
Map takes the top ~45% of the screen; a **glass bottom sheet** with tabs `Fields · Status · Advisor`
(drag to expand). Top bar shrinks to logo + farm switcher + one menu button. Tap targets ≥ 44px.

---

## 6. Components

All interactive pieces are standard controls (buttons, tabs, selects, inputs) styled with the tokens.
Use **lucide-react** for icons (1.75 stroke), never emoji or text symbols.

| Component | Spec |
|---|---|
| **Primary button** | Flat `--color-lime` with a faint top highlight, `--color-lime-ink` text, 600 weight, `--radius-ctl`, neutral shadow. One per screen ("Ask the advisor", "Run simulation", "Save farm"). |
| **Secondary button** | `--color-glass-hi` fill, hairline border, `--color-tx` text. |
| **Segmented tabs** | Track `rgb(0 0 0 / .25)`, 4px padding; active segment `--color-glass-sel` + inset top highlight. Used for main nav and map layers. |
| **Farm switcher** | Select styled as secondary button: name in 600, county in `--color-mut`, chevron icon. |
| **Field row** | 40px field-shape thumbnail filled with its NDVI colour · name + "Crop · ha" · value + delta right-aligned. |
| **Indicator row** | Coloured 8px dot (indicator hue) · name · `Kind · Source` meta · value + delta · **vs-normal bar**: track `rgb(255 255 255/.08)`, fill in indicator hue, white 2px tick at the normal. |
| **Weekly strip** | One rounded segment per week, coloured by greenness vs normal on the NDVI scale; month axis below. |
| **Finding block** | Top section of the right panel with a warm wash `linear-gradient(170deg, rgb(255 162 58/.26), rgb(255 90 78/.10) 55%, transparent)`. Headline, severity badge (Watch / Alert, pill), "Field · since date", cautious explanation, then a hairline and the **recommended check** with a check-circle icon. |
| **Kind tag** | Every value's label: `Observed` (rain hue), `Modelled` (soil hue), `Scenario` (water hue). 12px/600 sentence case, tinted fill + 1px border in the same hue. |
| **Map field** | White 2px outline (selected 2.5px), NDVI fill at ~75% opacity, dark glass name chip with value coloured by status. Fields outside the farm: dashed white outline at 35%. |
| **Status pill (top bar)** | "1 finding": watch-tinted fill and border, coloured dot. Hidden when there are no findings. |

---

## 7. Data visualisation (Recharts)

- **Season chart** (the comparison everyone understands):
  - This season: lime, 3px, with a soft lime area fill fading to transparent.
  - Last year: `--color-yr-1`, and two years ago: `--color-yr-2`, both 1.6px.
  - 10-yr normal: `--color-normal` band (range) + dashed line.
  - Mark when a change started with a dashed amber vertical line and a small label ("Decline from Jul 18"). End this season's line with a dot.
- Gridlines `rgb(255 255 255/.08)`, axis text 12px `--color-mut`, no chart borders or backgrounds.
- **Indicator colours are fixed:** rain is always sky blue, heat always coral, and so on, on every page, chart and legend.
- **NDVI scale** is the only continuous colour scale. Always show the key ("0.0 bare soil → 0.9 dense crop").
- Simulator rotations: compare with bars and tables, each rotation keeping one colour from
  `[lime, rain, water, soil]` across all its charts.

---

## 8. Honesty and accessibility rules (non-negotiable)

1. **Every number carries its kind** (Observed / Modelled / Scenario) and source. See the `Labelled` type in the build plan.
2. **Findings are cautious:** "may be one explanation", always paired with a recommended field check.
   Never "diagnosis", "disease detected", or a certain-sounding claim.
3. **Show the data date and source on the map** ("MODIS · Aug 29 · Imagery © Esri").
4. Demo data says so in the UI ("Demo farm with sample data").
5. Contrast ≥ 4.5:1 for text. Don't put `--color-mut` on top of the map; text over imagery always sits on glass.
6. Colour is never the only signal: deltas also have a sign (+/−) and severity also has a word (Watch/Alert).
7. Keyboard: every control focusable with the lime focus ring; map fields selectable from the list.
8. `prefers-reduced-motion`: no panel or chart animations.

---

## 9. States every screen must handle

| State | Treatment |
|---|---|
| Loading | Skeleton rows (glass-hi bars) in panels; map shows last data with "Updating…" in the source pill |
| No findings | Right panel leads with "All fields within normal range" (ok colour) and the season chart |
| Cloudy / missing satellite data | "No clear image since Aug 12": shows the last clear date, never a blank map |
| API down → cached sample | Source pill reads "Sample data (offline)" |
| One field | List still shows; weekly strip and chart unchanged |
| No fields yet | Map centred on the farm point, panel says "Draw your first field" → Farm profile |
| Error | Name the problem and the next step: "Couldn't reach NASA POWER. Showing saved data from Aug 28." |

---

## 10. Motion

One motion language, kept quiet: panels and sheets ease in with `cubic-bezier(.16,1,.3,1)` over
240ms; selecting a field pans the map and the panel updates together. No bouncing, no looping
effects, no animated gradients.

---

## 11. Stack & files

- React + TypeScript + Vite + **Tailwind v4** (tokens above), `react-leaflet` + Esri World Imagery tiles,
  `recharts`, `lucide-react`, `@fontsource/figtree`.
- Shared UI lives in `frontend/src/shared/components/` (Glass, Button, Tabs, KindTag, IndicatorRow,
  FieldRow, Badge) and `frontend/src/shared/charts/` (SeasonChart, WeeklyStrip, NdviKey).
  **Build these once and reuse them; module pages compose them.**
- Module pages: `frontend/src/modules/{croptwin,cropdoctor,simulator}/pages/`.
