---
name: VisitKla
description: Kampala story-based boda and matatu navigation; dark warm night theme with a single burnt-orange accent.
colors:
  night-bg: "#14120f"
  stage-card: "#1e1b17"
  stage-card-raised: "#262220"
  ink: "#f4efe8"
  ink-muted: "#a89e92"
  ink-faint: "#7d7468"
  hairline: "#332f29"
  signal-orange: "#ff6b00"
  signal-orange-tint: "rgba(255, 107, 0, 0.14)"
  signal-orange-edge: "rgba(255, 107, 0, 0.4)"
  semantic-green: "#16a34a"
  semantic-green-deep: "#166534"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  route-time:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 800
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11.5px"
  badge:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.02em"
rounded:
  pill: "999px"
  card: "12px"
  callout: "8px"
  chip: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  route-card:
    backgroundColor: "{colors.stage-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px"
  route-card-hover:
    borderColor: "{colors.signal-orange-edge}"
  primary-button:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.night-bg}"
    rounded: "{rounded.card}"
    padding: "11px"
  badge-accent:
    backgroundColor: "{colors.signal-orange-tint}"
    textColor: "{colors.signal-orange}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  badge-neutral:
    backgroundColor: "{colors.stage-card-raised}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
---

# VisitKla Design System

## Overview

The Night Stage: a dark, warm ground (a Kampala street after dark) with one
warm light (the burnt-orange stage sign). One accent does all the pointing;
green exists only to mark meaning (where you board, where you are). The
system is intentionally restrained so that satellite map imagery, which is
loud by nature, stays the visual center.

## Colors

Tokens live in `web/src/styles/global.css` (`:root`) and are shared by both
app modes; the transit plugin consumes them and never redefines them.

- Ground: `night-bg` for the app, `stage-card` for surfaces,
  `stage-card-raised` for nested elements (icon chips, badges, callouts).
- Text: `ink` primary, `ink-muted` secondary, `ink-faint` tertiary/meta.
- Accent: `signal-orange` for the primary action, fastest badge, selected
  route geometry, and alight markers. Never used as large fills.
- Semantic: `semantic-green` marks boarding points and the user's start;
  it is never decoration.
- Hairline `#332f29` is the only border color on dark surfaces.

## Typography

System sans stack (`--font-sans`); no webfont. Weights carry hierarchy:
800 for times and prices, 700 for titles and badges, 400 for body.
`font-variant-numeric: tabular-nums` is set app-wide so times, fares and
stage counts align. Sizes cluster at 10.5 / 11.5 / 12.5-13 / 16 / 18px.

## Layout

Desktop (over 720px): split view, form-and-results panel on the left
(~460px), the map fills the rest. At or below 720px: the panel becomes a
bottom sheet (max-height 62%) over the map. Spacing moves on an 8px rhythm
(4/8/12/16); more space above a group than inside it.

## Elevation & Depth

Shadows are ambient and dark-tinted (`0 4px 16px rgba(0,0,0,.45)` for the
floating pill, `0 12px 36px rgba(0,0,0,.45)` for floating cards over the
map), paired with a subtle `backdrop-filter: blur(10px)` on cards that
float over imagery. In-panel content uses borders, not shadows.

## Shapes

One radius system: interactive pills 999px; cards and controls 12px;
nested callouts 8px; tiny chips 6px. Borders are 1px `hairline`; the walk
step uses a dashed border to feel provisional.

## Components

- Mode pill (fixed top-right): text-only, `stage-card` background,
  orange text/border in story mode, muted in transit mode.
- Place input: 12px radius, hairline border; the suggestions dropdown
  carries type badges (`stage`, `mall`, `area`) and a muted context line.
- Route card: icon chip (38px, raised surface, inline SVG), time in 800,
  mode name muted, gap-separated meta spans (no separator dots), badges
  right-aligned on the top row. `Fastest` is the only accent badge.
- Step row: leading badge (orange chip for vehicles, dashed outline for
  walk, raised for point-to-point modes) + body; alight line separated by
  a hairline.
- Honest-notes callout: raised surface, 8px radius, muted text; carries
  estimate caveats and data-vintage notes.

## Do's and Don'ts

- Do speak in vehicles, stages, directions and prices; never show line
  codes or GTFS jargon in user-facing UI.
- Do keep every estimate labelled (`≈`, "~", the honest-notes callout).
- Don't introduce a second accent or mode-specific color coding; the icon
  glyph carries mode identity.
- Don't use em-dashes in UI copy; use periods, commas or parentheses.
- Don't chain middle-dot separators in metadata; use gap-separated spans.
- Don't hand-draw new icon geometry; extend the vendored Tabler set
  (`components/icons.tsx`, MIT) so stroke and grid stay consistent.
