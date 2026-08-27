# Scholar's Sketchbook — Design System

## Colors

| Token | Hex | Usage |
|---|---|---|
| `surface` / `background` | `#fcf9f8` | Page background (aged paper) |
| `on-surface` / `ink-black` | `#1c1b1b` | All text, borders, linework |
| `on-surface-variant` | `#414751` | Secondary text, placeholders |
| `primary` / `ink-blue` | `#005da7` | Links, active states, marker blue accents |
| `primary-container` | `#2976c7` | Hover/filled primary |
| `secondary` | `#835500` | Secondary text labels |
| `secondary-container` / `marker-yellow` | `#feae2c` | Highlight, star/fav, mustard accents |
| `tertiary` | `#386800` | Success, green accents |
| `tertiary-container` / `marker-green` | `#498300` | Filled green states |
| `error` / `marker-red` | `#ba1a1a` | Errors, danger states |
| `error-container` | `#ffdad6` | Error backgrounds |
| `surface-container` | `#f0eded` | Card surfaces, sidebar fills |
| `surface-variant` | `#e5e2e1` | Dividers, disabled elements |
| `outline` | `#717783` | Subtle borders |

## Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| `display-lg` | Bricolage Grotesque | 48px | 800 |
| `headline-md` | Bricolage Grotesque | 32px | 700 |
| `headline-sm` | Bricolage Grotesque | 24px | 600 |
| `body-lg` | Karla | 18px | 400 |
| `body-md` | Karla | 16px | 400 |
| `source-code` | JetBrains Mono | 14px | 400 |
| `label-caps` | JetBrains Mono | 12px | 700 |
| `marker` | Permanent Marker | — | — |
| `handwriting` | Caveat | — | — |

**Rules:**
- **User-generated notes**: Karla (body-md/lg)
- **Source PDF text**: JetBrains Mono (source-code)
- **Headlines/section labels**: Bricolage Grotesque
- **Annotations/doodle labels**: Permanent Marker

## Hand-Drawn Border Techniques

CSS border-radius shorthand creates the wobbly ink-line effect:

```css
/* 3px heavy ink — primary panels */
.hand-drawn-border {
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 3px solid #1c1b1b;
}

/* 2px fine ink — secondary elements */
.hand-drawn-border-thin {
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 2px solid #1c1b1b;
}

/* Dashed — drop zones */
.hand-drawn-dashed {
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 3px dashed #1c1b1b;
}
```

## Shadows

No blur shadows. Only solid ink offset:
- `.shadow-sketch` → `4px 4px 0px #1c1b1b`
- `.shadow-sketch-sm` → `2px 2px 0px #1c1b1b`

## Background

- `.bg-checkered` — 20px grid paper pattern in `#e5e2e1` lines on `#fcf9f8`
- `.torn-edge-bottom` — clip-path polygon for torn paper edge

## Shared Components

| Component | Path | Purpose |
|---|---|---|
| `SketchCard` | `components/sketch/SketchCard.tsx` | Torn-paper panel |
| `SketchButton` | `components/sketch/SketchButton.tsx` | Hand-drawn button |
| `BookmarkTabs` | `components/sketch/BookmarkTabs.tsx` | Right-edge ribbon navigation |
| `SketchProgress` | `components/sketch/SketchProgress.tsx` | Scribble-fill progress bar |
| `HighlightMarker` | `components/sketch/HighlightMarker.tsx` | Marker scribble highlight |
| `Logo` | `components/sketch/Logo.tsx` | pradeepLLM logotype |
| `SketchHeader` | `components/sketch/SketchHeader.tsx` | Fixed top bar |
| `SketchLayout` | `components/sketch/SketchLayout.tsx` | Page wrapper |
