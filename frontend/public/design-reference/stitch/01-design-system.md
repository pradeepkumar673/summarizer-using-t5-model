---
name: Scholar’s Sketchbook
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#414751'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#717783'
  outline-variant: '#c1c7d3'
  surface-tint: '#0060ac'
  primary: '#005da7'
  on-primary: '#ffffff'
  primary-container: '#2976c7'
  on-primary-container: '#fdfcff'
  inverse-primary: '#a4c9ff'
  secondary: '#835500'
  on-secondary: '#ffffff'
  secondary-container: '#feae2c'
  on-secondary-container: '#6b4500'
  tertiary: '#386800'
  on-tertiary: '#ffffff'
  tertiary-container: '#498300'
  on-tertiary-container: '#f9ffeb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d4e3ff'
  primary-fixed-dim: '#a4c9ff'
  on-primary-fixed: '#001c39'
  on-primary-fixed-variant: '#004883'
  secondary-fixed: '#ffddb4'
  secondary-fixed-dim: '#ffb955'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#633f00'
  tertiary-fixed: '#a1fa49'
  tertiary-fixed-dim: '#87dc2c'
  on-tertiary-fixed: '#0e2000'
  on-tertiary-fixed-variant: '#2a5000'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Bricolage Grotesque
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Bricolage Grotesque
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: Bricolage Grotesque
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Karla
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Karla
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  source-code:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.0'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  margin-mobile: 16px
  margin-desktop: 32px
  gutter: 16px
---

## Brand & Style

This design system is built on the philosophy of the "active margin"—the space where formal academic content meets the informal, creative process of learning. It moves away from the cold, sterile precision of standard SaaS interfaces in favor of a **Tactile / Sketchbook** aesthetic. The goal is to lower the cognitive barrier to study by making the digital environment feel like a personal journal.

The visual language is defined by intentional imperfection. Every stroke, border, and container should feel as though it were rendered by a human hand using a physical felt-tip pen. There are no perfect 90-degree angles or mathematically perfect curves. This "low-fidelity" approach creates a low-pressure environment that encourages students to experiment, annotate, and engage with their PDFs without the fear of making mistakes in a "perfect" digital space.

## Colors

The palette is anchored by a warm, aged-paper background that reduces eye strain during long study sessions. The primary ink is a deep, slightly charcoal black, providing high legibility while feeling softer than a pure hex black.

- **Background (Aged Paper):** A warm cream base (#FCF9F8). To enhance the tactile feel, a subtle noise/grain texture should be applied as a fixed overlay across the entire viewport.
- **Ink (Neutral):** Used for all linework, borders, and main body text (#1C1B1B).
- **Marker Blue (Primary):** Reserved for links, doodle-style decorations, and primary action highlights (#005DA7 / #4A90E2). It mimics a fresh permanent marker.
- **Mustard Yellow (Secondary):** Used for "favoriting" or starring content, and for high-level emphasis (#835500 / #FEAE2C).
- **Success & Alert:** Green (#386800 / #498300) and Red (#BA1A1A) markers are used sparingly for status indicators.

## Typography

Typography in this design system creates a clear distinction between "User Thoughts" and "Source Material."

1. **Headlines:** Use **Bricolage Grotesque**. Hand-lettered, marker-drawn feel that remains highly legible.
2. **Body Notes:** **Karla** for user-generated notes. Eccentricity in character shapes that mimics casual, clean handwriting.
3. **Source Text:** **JetBrains Mono** for content extracted directly from PDFs.

## Layout & Spacing

- **The Margin:** On desktop, a persistent wide left or right margin (80px - 120px) is used for "marginalia".
- **The Stack:** Components appear slightly "tossed" onto the page with subtle 1-2 degree rotation.
- **Gutters:** 16px gutters.
- **Elevation & Depth:** Physical layering and line weight instead of blur shadows.
