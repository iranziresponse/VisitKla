import { DETOUR_FACTOR, haversine, WALK_SPEED_M_PER_MIN, type Place } from "./planner";
import { estimateBoda } from "./boda";

/**
 * Straightforward point-to-point estimates for the non-taxi modes. There
 * is no street routing engine behind these (the $0 constraint), so every
 * figure is a straight-line distance with a detour factor and a
 * Kampala-realistic effective speed, and the UI says so.
 *
 * Fares are draft estimates in the same spirit as boda.ts: base + per-km,
 * rounded, shown as a range, never presented as a quote.
 */

export type SimpleMode = "boda" | "drive" | "cycle" | "walk";

export const SIMPLE_MODES: SimpleMode[] = ["boda", "drive", "cycle", "walk"];

export interface SimpleRoute {
  mode: SimpleMode;
  label: string;
  /** estimated path length including detour factor */
  meters: number;
  minutes: number;
  /** draft fare range; 0/0 means free */
  fareMin: number;
  fareMax: number;
  /** one honest line about what kind of estimate this is */
  note: string;
  /** practical advice shown in the detail view */
  advice?: string;
}

interface ModeModel {
  label: string;
  detour: number;
  /** effective door-to-door speed, m/min */
  speed: number;
  note: string;
  advice?: string;
}

const MODELS: Record<SimpleMode, ModeModel> = {
  boda: {
    label: "Boda boda",
    detour: 1.2, // bodas cut through where cars cannot
    speed: 260, // ~15.6 km/h effective with traffic and haggling
    note: "Straight-line estimate from the map, not a surveyed route.",
    advice: "Agree the price before you set off, and wear the helmet.",
  },
  drive: {
    label: "Car (Uber / Bolt)",
    detour: DETOUR_FACTOR,
    speed: 320, // ~19 km/h effective in Kampala traffic
    note: "Straight-line estimate; ride-hail prices swing with demand.",
    advice: "Pin your destination in the app before boarding to keep the trip honest.",
  },
  cycle: {
    label: "Bicycle",
    detour: DETOUR_FACTOR,
    speed: 220, // ~13 km/h unhurried
    note: "Straight-line estimate; hills and traffic change this a lot.",
    advice: "Lights and a helmet if you'll ride past dark.",
  },
  walk: {
    label: "Walking",
    detour: DETOUR_FACTOR,
    speed: WALK_SPEED_M_PER_MIN,
    note: "Straight-line estimate with a typical city detour.",
  },
};

function roundTo500(n: number): number {
  return Math.round(n / 500) * 500;
}

/** Draft ride-hail range: base + per-km, in the same spirit as boda.ts. */
function estimateRideHail(meters: number): { min: number; max: number } {
  const min = Math.max(3000, roundTo500(2500 + meters * 0.55));
  return { min, max: roundTo500(min * 1.4) };
}

export function estimateSimple(mode: SimpleMode, from: Place, to: Place): SimpleRoute {
  const model = MODELS[mode];
  const meters = Math.round(haversine(from, to) * model.detour);
  const minutes = Math.max(1, Math.round(meters / model.speed));
  const fare =
    mode === "boda"
      ? estimateBoda(meters)
      : mode === "drive"
        ? estimateRideHail(meters)
        : { min: 0, max: 0 };
  return {
    mode,
    label: model.label,
    meters,
    minutes,
    fareMin: fare.min,
    fareMax: fare.max,
    note: model.note,
    advice: model.advice,
  };
}

export function estimateAllSimple(from: Place, to: Place): SimpleRoute[] {
  return SIMPLE_MODES.map((m) => estimateSimple(m, from, to));
}
