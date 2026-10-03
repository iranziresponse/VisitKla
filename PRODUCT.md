# VisitKla — Product Truth

Captured from the project's own docs and direction so far (design reference,
not marketing copy). Correct anything that reads wrong.

## What this is

VisitKla helps people get around Kampala without knowing the city. You say
where you are and where you're going; it answers with concrete, honest
instructions a rider can act on at the roadside: which stage to walk to,
which matatu to board and in which direction, where to alight, what it
should cost, and when it makes more sense to walk or take a boda.

## Who it's for

Everyday riders in Kampala: residents who know their corner but not every
corridor, and newcomers who know no stage names at all. Mobile-first, often
on modest data plans, often in a hurry.

## What makes it different

- Real scheduled structure from the DT4A GTFS feed (MapUganda & Transport
  for Cairo, CC BY 3.0, 2019/20 fieldwork), not invented routes.
- Human instructions ("board a matatu heading to Kawala, alight at City
  Oil"), never line codes or jargon.
- Honest uncertainty: frequency-based waits, draft fares flagged for
  on-the-ground verification, straight-line walk estimates labelled as
  estimates.
- $0 to run: free geocoders, free map tiles, static bundled data, no
  backend.

## The two modes

- Classic (default, untouched): the story/boda game experience.
- Transit (`/transit`): the journey planner. Line identifiers exist only
  inside the planning engine; the UI speaks in places, stages, vehicles
  and prices. `/transit/network` is an internal inspector, not linked
  from the UI.

## Constraints that don't move

- The transit plugin stays additive to the classic app: one marked seam in
  `web/src/App.tsx`, everything else inside `web/src/plugins/transit/` and
  `pipeline/`. No new npm dependencies. `UNINSTALL.md` is canonical.
- Route comparison should let a rider choose between taxi, boda, driving,
  bicycle and walking, with the fastest, fewest-transfer and cheapest
  options recognisable at a glance.
