import {
  getLine,
  network,
  stopByIndex,
  type LineVariant,
  type TransitLine,
} from "./network";

/**
 * Frequency-based journey planning over the precomputed network — no
 * schedules exist in the feed, so waits come from headway bands ("matatus
 * leave when full, roughly every N minutes") and rides from median
 * inter-stage times. Direct + one-transfer only: the overwhelming majority
 * of GKMA trips ride via the two main taxi parks, so deeper transfers add
 * complexity the data can't honestly support.
 *
 * Walk legs are straight-line × 1.3 detour factor at 4.5 km/h — the $0
 * approximation; the UI labels them as estimates.
 */

export const WALK_SPEED_M_PER_MIN = 75; // 4.5 km/h
export const DETOUR_FACTOR = 1.3;
export const MAX_WALK_M = 1500;
export const MAX_WALK_M_STRETCH = 3000; // "stretch" pass when nothing useful is close
/**
 * The feed models adjacent bays as separate stop records (Old vs New Taxi
 * Park are different entries ~300m apart), so a strict same-record
 * transfer finds almost nothing. Real passengers walk between them —
 * this is the transfer walk we allow.
 */
export const TRANSFER_WALK_M = 300;

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

export interface WalkLeg {
  kind: "walk";
  from: Place;
  to: Place;
  meters: number;
  minutes: number;
}

export interface RideLeg {
  kind: "ride";
  line: TransitLine;
  variant: LineVariant;
  /** global stop indices, travel order */
  stopIdxs: number[];
  minutes: number;
  /** typical wait at boarding, from the time-of-day headway band */
  waitMinutes: number;
  headwaySec: number;
  fare: number;
}

/**
 * A walk leg the rider chose to ride by boda instead (the swap lives in
 * boda.ts — this is just the shape). The fare is a draft range, never a
 * quote; minutes use the same effective door-to-door speed as the boda
 * mode elsewhere in the plugin.
 */
export interface BodaLeg {
  kind: "boda";
  from: Place;
  to: Place;
  meters: number;
  minutes: number;
  fareMin: number;
  fareMax: number;
}

export type Leg = WalkLeg | RideLeg | BodaLeg;

export interface Journey {
  legs: Leg[];
  totalMinutes: number;
  fare: number;
  walkMeters: number;
  transfers: number;
}

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lng - a.lng) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function walkMinutes(meters: number): number {
  return (meters * DETOUR_FACTOR) / WALK_SPEED_M_PER_MIN;
}

function stopToPlace(s: { n: string; lat: number; lng: number }): Place {
  return { name: s.n, lat: s.lat, lng: s.lng };
}

function walkLeg(from: Place, to: Place): WalkLeg {
  const meters = Math.round(haversine(from, to) * DETOUR_FACTOR);
  return {
    kind: "walk",
    from: { name: from.name, lat: from.lat, lng: from.lng },
    to: { name: to.name, lat: to.lat, lng: to.lng },
    meters,
    minutes: walkMinutes(meters),
  };
}

/** Headway of a variant at a given time of day (fallback: any band). */
function headwayFor(v: LineVariant, when: Date): number {
  const h = when.getHours() + when.getMinutes() / 60;
  const band =
    h < 6 ? "night" : h < 10 ? "am" : h < 16 ? "mid" : h < 20 ? "pm" : "eve";
  return v.head[band] ?? v.head.am ?? v.head.mid ?? v.head.pm ?? v.head.eve ?? v.head.night ?? 900;
}

function waitMinutesFor(headwaySec: number): number {
  // average wait ≈ half the headway, floored at 2 min, capped at 15 —
  // matatu stages rarely leave you waiting more than two full headways.
  return Math.min(15, Math.max(2, headwaySec / 120));
}

/** Stops within walkRadius of a point, nearest first, capped. */
function stopsWithinDetailed(
  p: Place,
  radiusM: number,
  cap: number
): Array<{ idx: number; meters: number }> {
  const out: Array<{ idx: number; meters: number }> = [];
  for (let idx = 0; idx < network.stops.length; idx++) {
    const s = network.stops[idx];
    const d = haversine(p, s);
    if (d <= radiusM) out.push({ idx, meters: d });
  }
  out.sort((a, b) => a.meters - b.meters);
  return out.slice(0, cap);
}

/**
 * Boarding/alighting stage picker: nearest-first, but greedy about line
 * diversity — dense clusters of minor stops on one dead-end local line
 * would otherwise crowd out the stop two streets over that actually
 * connects to the trunk corridors. Stops that introduce a new line win;
 * once every nearby line is covered, remaining slots go to nearest stops.
 */
function diverseStops(p: Place, radiusM: number, cap: number): number[] {
  const pool = stopsWithinDetailed(p, radiusM, 10000);
  const picked: typeof pool = [];
  const coveredLines = new Set<string>();
  const rest: typeof pool = [];
  for (const s of pool) {
    const lines = network.stops[s.idx].ln;
    if (lines.some((l) => !coveredLines.has(l))) {
      picked.push(s);
      lines.forEach((l) => coveredLines.add(l));
      if (picked.length >= cap) return picked.map((s) => s.idx);
    } else {
      rest.push(s);
    }
  }
  for (const s of rest) {
    if (picked.length >= cap) break;
    picked.push(s);
  }
  return picked.map((s) => s.idx);
}

/** positions where stopIdx sits in a variant's stop sequence (memoized —
 * the enumeration calls this thousands of times over the same variants) */
const posCache = new WeakMap<LineVariant, Map<number, number[]>>();
function positionsIn(v: LineVariant, stopIdx: number): number[] {
  let byStop = posCache.get(v);
  if (!byStop) {
    byStop = new Map();
    posCache.set(v, byStop);
  }
  const hit = byStop.get(stopIdx);
  if (hit) return hit;
  const out: number[] = [];
  v.stops.forEach((s, i) => {
    if (s === stopIdx) out.push(i);
  });
  byStop.set(stopIdx, out);
  return out;
}

interface Candidate {
  legs: Leg[];
  total: number;
  transfers: number;
  walkM: number;
  key: string;
}

function finalize(legs: Leg[]): Candidate {
  const rides = legs.filter((l): l is RideLeg => l.kind === "ride");
  const walkM = legs.reduce((sum, l) => sum + (l.kind === "walk" ? l.meters : 0), 0);
  const total =
    legs.reduce((sum, l) => sum + l.minutes, 0) +
    rides.reduce((sum, l) => sum + l.waitMinutes, 0);
  return {
    legs,
    total,
    transfers: Math.max(0, rides.length - 1),
    walkM,
    key: rides.map((r) => r.line.id).join(">"),
  };
}

export interface PlanOptions {
  maxWalkMeters?: number;
  when?: Date;
  limit?: number;
}

export interface PlanResult {
  journeys: Journey[];
  /** true when nothing was found even after stretching the walk radius */
  empty: boolean;
  /** the walk radius had to be stretched on that side to find any journey */
  stretchedOrigin: boolean;
  stretchedDestination: boolean;
}

/**
 * Direct + one-transfer enumeration over a fixed set of boarding/alighting
 * stages. Raw candidates only — dedupe and ranking happen in planJourney.
 */
function enumerate(
  origin: Place,
  destination: Place,
  oIdxs: number[],
  dIdxs: number[],
  when: Date
): Candidate[] {
  const candidates: Candidate[] = [];

  // --- direct: one line from an origin stage to a destination stage
  for (const o of oIdxs) {
    const oStop = stopToPlace(stopByIndex(o));
    for (const d of dIdxs) {
      if (o === d) continue;
      const dStop = stopToPlace(stopByIndex(d));
      for (const lineId of network.stops[o].ln) {
        const line = getLine(lineId);
        if (!line) continue;
        for (const v of line.v) {
          for (const fPos of positionsIn(v, o)) {
            const tPos = positionsIn(v, d).find((tp) => tp > fPos);
            if (tPos === undefined) continue;
            const minutes = (v.cum[tPos] - v.cum[fPos]) / 60;
            if (minutes <= 0 || minutes > 120) continue;
            const headwaySec = headwayFor(v, when);
            const ride: RideLeg = {
              kind: "ride",
              line,
              variant: v,
              stopIdxs: v.stops.slice(fPos, tPos + 1),
              minutes,
              waitMinutes: waitMinutesFor(headwaySec),
              headwaySec,
              fare: v.fare,
            };
            candidates.push(
              finalize([walkLeg(origin, oStop), ride, walkLeg(dStop, destination)])
            );
          }
        }
      }
    }
  }

  // --- one transfer: ride A to a shared stage, (short walk), ride B onward
  const linesAtStopCache = new Map<number, TransitLine[]>();
  const linesAt = (idx: number): TransitLine[] => {
    let arr = linesAtStopCache.get(idx);
    if (!arr) {
      arr = network.stops[idx].ln.map(getLine).filter((l): l is TransitLine => !!l);
      linesAtStopCache.set(idx, arr);
    }
    return arr;
  };

  // Transfer stages expand to nearby stages (adjacent bays of the same
  // interchange), each with the walk meters it costs to switch there.
  const nearStopsCache = new Map<number, Array<{ idx: number; meters: number }>>();
  const transferBoards = (
    tIdx: number
  ): Array<{ boardIdx: number; walkMeters: number }> => {
    const cached = nearStopsCache.get(tIdx);
    if (!cached) {
      const near = stopsWithinDetailed(stopToPlace(stopByIndex(tIdx)), TRANSFER_WALK_M, 8).filter(
        (s) => s.idx !== tIdx
      );
      nearStopsCache.set(tIdx, near);
    }
    const near = nearStopsCache.get(tIdx) as Array<{ idx: number; meters: number }>;
    return [
      { boardIdx: tIdx, walkMeters: 0 },
      ...near.map((s) => ({ boardIdx: s.idx, walkMeters: s.meters })),
    ];
  };

  // A transfer is only worth exploring if some line at the transfer stage
  // actually serves one of the destination stages — the cheapest prune
  // there is, and it kills the vast majority of (stage, lineA, tPos) combos.
  const dLineIds = new Set<string>();
  for (const d of dIdxs) {
    for (const lid of network.stops[d].ln) dLineIds.add(lid);
  }

  for (const o of oIdxs) {
    const oStop = stopToPlace(stopByIndex(o));
    for (const lineAId of network.stops[o].ln) {
      const lineA = getLine(lineAId);
      if (!lineA) continue;
      for (const va of lineA.v) {
        for (const oPos of positionsIn(va, o)) {
          const headwayA = headwayFor(va, when);
          for (let tPos = oPos + 1; tPos < va.stops.length; tPos++) {
            const transferIdx = va.stops[tPos];
            if (transferIdx === o) continue;
            const rideAmins = (va.cum[tPos] - va.cum[oPos]) / 60;
            if (rideAmins <= 0 || rideAmins > 90) continue;

            for (const { boardIdx, walkMeters } of transferBoards(transferIdx)) {
              // Only boards whose lines can actually reach a destination
              // stage — the filter that makes the 1-transfer sweep affordable.
              const bLines = linesAt(boardIdx).filter(
                (l) => l.id !== lineA.id && dLineIds.has(l.id)
              );
              if (bLines.length === 0) continue;
              const transferWalk =
                walkMeters > 0
                  ? walkLeg(
                      stopToPlace(stopByIndex(transferIdx)),
                      stopToPlace(stopByIndex(boardIdx))
                    )
                  : null;
              for (const lineB of bLines) {
                for (const vb of lineB.v) {
                  for (const tPosB of positionsIn(vb, boardIdx)) {
                    for (const d of dIdxs) {
                      if (d === boardIdx) continue;
                      const dPos = positionsIn(vb, d).find((p) => p > tPosB);
                      if (dPos === undefined) continue;
                      const rideBmins = (vb.cum[dPos] - vb.cum[tPosB]) / 60;
                      if (rideBmins <= 0 || rideBmins > 90) continue;
                      const headwayB = headwayFor(vb, when);
                      const rideA: RideLeg = {
                        kind: "ride",
                        line: lineA,
                        variant: va,
                        stopIdxs: va.stops.slice(oPos, tPos + 1),
                        minutes: rideAmins,
                        waitMinutes: waitMinutesFor(headwayA),
                        headwaySec: headwayA,
                        fare: va.fare,
                      };
                      const rideB: RideLeg = {
                        kind: "ride",
                        line: lineB,
                        variant: vb,
                        stopIdxs: vb.stops.slice(tPosB, dPos + 1),
                        minutes: rideBmins,
                        waitMinutes: waitMinutesFor(headwayB),
                        headwaySec: headwayB,
                        fare: vb.fare,
                      };
                      const legs: Leg[] = [walkLeg(origin, oStop), rideA];
                      if (transferWalk) legs.push(transferWalk);
                      legs.push(rideB, walkLeg(stopToPlace(stopByIndex(d)), destination));
                      candidates.push(finalize(legs));
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return candidates;
}

export function planJourney(
  origin: Place,
  destination: Place,
  opts: PlanOptions = {}
): PlanResult {
  const maxWalk = opts.maxWalkMeters ?? MAX_WALK_M;
  const when = opts.when ?? new Date();
  const limit = opts.limit ?? 6;

  const straight = haversine(origin, destination);
  const journeys: Journey[] = [];
  let stretchedOrigin = false;
  let stretchedDestination = false;

  // Short trips: walking beats any matatu dance.
  if (straight <= 2000) {
    const w = walkLeg(origin, destination);
    journeys.push({
      legs: [w],
      totalMinutes: Math.round(w.minutes),
      fare: 0,
      walkMeters: w.meters,
      transfers: 0,
    });
  }

  if (straight > 400) {
    // Fallback ladder: the 2019/20 survey didn't put a *useful* stage within
    // easy walk of every point — the nearest stages can all sit on dead-end
    // local lines. If the default radius yields nothing, retry with a
    // stretched radius on whichever side needed it; a longer (flagged) walk
    // beats "no journey".
    let candidates: Candidate[] = [];
    const tried = new Set<string>();
    const radii: Array<[number, number]> = [
      [maxWalk, maxWalk],
      [MAX_WALK_M_STRETCH, maxWalk],
      [maxWalk, MAX_WALK_M_STRETCH],
      [MAX_WALK_M_STRETCH, MAX_WALK_M_STRETCH],
    ];
    for (const [oR, dR] of radii) {
      if (candidates.length > 0) break;
      const k = `${oR}|${dR}`;
      if (tried.has(k)) continue;
      tried.add(k);
      const oIdxs = diverseStops(origin, oR, 10);
      const dIdxs = diverseStops(destination, dR, 10);
      if (oIdxs.length === 0 || dIdxs.length === 0) continue;
      candidates = enumerate(origin, destination, oIdxs, dIdxs, when);
      if (candidates.length > 0) {
        stretchedOrigin = oR > maxWalk;
        stretchedDestination = dR > maxWalk;
      }
    }

    // dedupe: best candidate per line sequence, then rank
    const best = new Map<string, Candidate>();
    for (const c of candidates) {
      const prev = best.get(c.key);
      if (!prev || c.total < prev.total) best.set(c.key, c);
    }
    const ranked = [...best.values()].sort(
      (a, b) => a.total - b.total || a.transfers - b.transfers || a.walkM - b.walkM
    );
    for (const c of ranked.slice(0, limit)) {
      journeys.push({
        legs: c.legs,
        totalMinutes: Math.round(c.total),
        fare: c.legs.reduce((s, l) => s + (l.kind === "ride" ? l.fare : 0), 0),
        walkMeters: c.walkM,
        transfers: c.transfers,
      });
    }
  }

  journeys.sort((a, b) => a.totalMinutes - b.totalMinutes);

  return {
    journeys,
    empty: journeys.length === 0,
    stretchedOrigin,
    stretchedDestination,
  };
}
