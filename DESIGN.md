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
    backgroundColor: "rgba(26, 23, 19, 0.75) + backdrop blur(18px) saturate(1.35)"
    borderColor: "rgba(255, 240, 220, 0.13)"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px"
    shadow: "0 12px 36px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 240, 220, 0.09)"
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
    backgroundColor: "rgba(255, 240, 220, 0.07)"
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

- Ground: `night-bg` behind the map; floating surfaces use the shared
  warm glass fill (see Elevation) instead of solid cards; translucent
  raised fills `rgba(255,240,220,.05-.08)` for nested elements (icon
  chips, badges, step rows).
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

The satellite map is the interface; there is no header, sidebar or footer.
Everything floats over the full-bleed map as individual glass cards in a
left column (392px): the search card top, route results one card each
below it, the step detail as one tall card. The column container is
click-transparent so the map stays draggable in the gaps. At or below
720px: the search card stays top, the route stack hugs the bottom of the
screen like a sheet (max-height 55vh, bottom-anchored, each card still
floating). Spacing moves on an 8px rhythm (4/8/12/16).

## Elevation & Depth

One glass material for everything that floats over imagery: warm dark
fill `rgba(26,23,19,.75)` with `backdrop-filter: blur(18px) saturate(1.35)`,
a 1px light-warm border `rgba(255,240,220,.13)`, an inset top highlight,
and the ambient shadow `0 12px 36px rgba(0,0,0,.45)`. Dropdowns thicken to
`.88` for small text. Under `prefers-reduced-transparency` the fill goes
near-solid and the blur switches off. Content inside a card separates with
borders and hairlines, never nested cards. The basemap's vector roads are
faded to 0.38 opacity so the imagery leads and the selected route
(solid orange, 4.5px over a dark casing) reads instantly.

## Shapes

One radius system: interactive pills 999px; cards and controls 12px;
nested callouts 8px; tiny chips 6px. Borders are 1px `hairline`; the walk
step uses a dashed border to feel provisional.

## Components

- Mode pill (fixed top-right): text-only glass, orange text/border in
  story mode, ink text in transit mode.
- Search card (floating, glass): the two place inputs and the orange
  search button; the swap button sits between the fields when both are
  set. Suggestions dropdown is thicker glass with type badges (`stage`,
  `mall`, `area`) and a muted context line.
- Route card (one per route, floating glass): icon chip (38px, raised
  translucent surface, inline SVG), time in 800, mode name muted,
  gap-separated meta spans (no separator dots), badges right-aligned on
  the top row. `Fastest` is the only accent badge.
- Step detail (one floating glass card): back link, orange summary line,
  step rows as translucent raised callouts (8px radius, dashed outline for
  walk), honesty footnote in muted text at the bottom.
- Honest-notes callout: hairline-separated muted text inside the detail
  card; carries estimate caveats and data-vintage notes.

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
