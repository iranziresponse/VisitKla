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
    backgroundColor: "sheen gradient over rgba(243, 242, 238, 0.62) + backdrop blur(30px) saturate(1.8) brightness(1.08)"
    borderColor: "rgba(255, 255, 255, 0.55)"
    textColor: "#171310"
    rounded: "{rounded.card}"
    padding: "12px"
    shadow: "0 12px 36px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.85)"
  route-card-hover:
    borderColor: "rgba(122, 37, 9, 0.5)"
  primary-button:
    backgroundColor: "#ff6b00"
    textColor: "#14120f"
    rounded: "{rounded.card}"
    padding: "11px"
  badge-accent:
    backgroundColor: "rgba(255, 107, 0, 0.15)"
    textColor: "#7a2509"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  badge-neutral:
    backgroundColor: "rgba(20, 18, 16, 0.06)"
    textColor: "#38322a"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  buildings-pill:
    text: "3D blocks"
    position: "left of the mode pill (stacked under it on mobile)"
    offState: "muted ink text, glass edge"
    onState: "orange tint fill under the sheen, burnt-orange border and text, aria-pressed=true"
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
  light frost fill (see Elevation) instead of solid cards; translucent
  raised fills for nested elements (icon chips, badges, step rows).
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
720px: the search card folds into a single pill by default (it expands
on tap and folds back on any interaction outside it), the route stack
hugs the bottom of the screen like a sheet (max-height 55vh,
bottom-anchored, each card still floating). Spacing moves on an 8px
rhythm (4/8/12/16).

## Elevation & Depth

One glass material for everything that floats over imagery, and it must
behave like glass: base `rgba(243,242,238, α)` under a diagonal white
sheen gradient, `backdrop-filter: blur(30px) saturate(1.8)
brightness(1.08)`, a white refractive edge `rgba(255,255,255,.55)`, an
inset top highlight, and the ambient shadow `0 12px 36px rgba(0,0,0,.28)`.
Alpha follows the surface: content surfaces are thinnest (route cards,
detail, note chips .5), the form card .55, controls that carry text keep
body (pills .62, suggestions dropdown .88). The map must read through the
content surfaces — never raise their alpha until it looks like paint.
Glass scopes re-declare the theme tokens, so everything inside flips to
a dark text ramp (ink `#171310`, muted `#2e2921`, faint `#302b24`) and
the accent text darkens to burnt `#7a2509` — derived against the
murkiest backdrop (minimum ~0.56 white coverage over shadowed ground),
every token ≥4.5:1. Raised elements inside a card are light white chips
(they add body under text); the summary line sits in one. Pure `#ff6b00`
is a fill only (search button, vehicle badges, route lines), always
under dark text. Under `prefers-reduced-transparency` the fill goes
near-solid and the blur switches off. Content inside a card separates
with borders and hairlines, never nested cards. The basemap's vector
roads are faded to 0.38 opacity and the 3D rooftop blocks default to off
(the "3D blocks" pill flips them).

## States

Hover and focus are the same gesture at different intensities, always
authored, never browser-default:

- Route cards: hover and `:focus-visible` both lift 1px, deepen the
  shadow, pick up the burnt-orange edge and brighten their own glass
  (backdrop saturate 2 / brightness 1.16).
- Search button: hover lifts with a warm glow; active presses back down.
- Inputs: hover darkens the border; focus shows the burnt-orange border
  plus a soft orange ring (the global focus outline deliberately skips
  inputs to avoid double framing).
- Suggestion rows mirror their hover tint under `:focus-visible`.
- Text links rest as underlined ink and tint orange on hover.
- Buttons and links keep the global 2px `:focus-visible` outline;
  `prefers-reduced-motion` freezes all transitions.

## Shapes

One radius system: interactive pills 999px; cards and controls 12px;
nested callouts 8px; tiny chips 6px. Borders are 1px `hairline`; the walk
step uses a dashed border to feel provisional.

## Components

- Mode pill (fixed top-right): text-only frost, burnt-orange text/border
  in story mode, ink text in transit mode. The "3D blocks" pill sits to
  its left (stacked under it on mobile) and tints orange while pressed.
- Search card (floating, glass): the two place inputs and the orange
  search button; the swap button sits between the fields when both are
  set. Suggestions dropdown is thicker frost with type badges (`stage`,
  `mall`, `area`) and a muted context line.
- Folded search pill (mobile): the resting form on phones — one 44px
  glass pill, search icon + label ("Search routes", or the picked pair
  once set). Tapping it expands the form; any interaction outside it, or
  Escape, folds it straight back. Shares the pill hover/focus treatment.
- Route card (one per route, floating glass): icon chip (38px, raised
  translucent surface, inline SVG), time in 800, mode name muted,
  gap-separated meta spans (no separator dots), badges right-aligned on
  the top row. `Fastest` is the only accent badge.
- Step detail (one floating glass card): back chip, orange summary line,
  step rows as translucent raised callouts (8px radius, dashed outline for
  walk), honesty footnote in muted text at the bottom.
- Back chip (in the step detail): Tabler arrow-left + "All routes" in a
  32px-min-height pill with the raised glass surface; hovers to the
  orange tint.
- Collapsed pills (mobile map-focus): with a route open, a map tap
  swaps the cards for two 44px full-width glass pills — the trip at the
  top, the selected route's summary plus a chevron at the bottom.
  Tapping either restores the cards; desktop ignores map taps. Pills
  share the route-card hover/focus treatment.
- Honest-notes callout: hairline-separated muted text inside the detail
  card; carries estimate caveats and data-vintage notes.
- Favicon (site mark): orange rounded tile with a white map pin, shipped
  as an inline SVG injected at runtime — the site's index.html is never
  touched, and deleting the plugin removes the mark with it.

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
