import { formatHeadway, formatUgx, stopByIndex, variantEndpoints } from "./network";
import { haversine, type Journey, type Place } from "./planner";
import type { SimpleMode, SimpleRoute } from "./modes";

/**
 * The live-guidance checklist. Legs become checkpoints the GPS can tick
 * off: walks and boda links end at their destination, and each matatu leg
 * splits into board (find the stage) and ride (ride to the alight point)
 * — the two moments a rider actually needs a cue. Guidance walks this
 * list forward only, never snapping back.
 */

export type NavKind = "walk" | "boda" | "board" | "ride" | "direct";

export interface NavStep {
  kind: NavKind;
  /** the point the GPS marks as "reached" */
  target: Place;
  /** primary instruction, names the action */
  title: string;
  /** supporting line: vehicle direction, distance context */
  detail?: string;
  /** small facts: duration, fare, headway */
  meta: string[];
  /** the point-to-point mode behind a "direct" step */
  mode?: SimpleMode;
}

/** GPS says the trip has begun once you're this close to the first stop. */
export const NAV_START_M = 120;
/** Arrived: within this of the final target, the checklist is done. */
export const NAV_ARRIVE_M = 60;

function stopPlace(idx: number): Place {
  const s = stopByIndex(idx);
  return { name: s.n, lat: s.lat, lng: s.lng };
}

function ugxRange(min: number, max: number): string {
  return `≈ UGX ${min.toLocaleString("en-UG")}-${max.toLocaleString("en-UG")}`;
}

const MODE_LABEL: Record<string, string> = { taxi: "matatu", bus: "bus" };

export function navStepsForJourney(journey: Journey): NavStep[] {
  const steps: NavStep[] = [];
  for (const leg of journey.legs) {
    if (leg.kind === "walk") {
      if (leg.meters < 30) continue; // the stage sits on the spot
      steps.push({
        kind: "walk",
        target: leg.to,
        title: `Walk to ${leg.to.name}`,
        detail: `${Math.round(leg.meters)} m, about ${Math.max(1, Math.round(leg.minutes))} min`,
        meta: [],
      });
    } else if (leg.kind === "boda") {
      steps.push({
        kind: "boda",
        target: leg.to,
        title: `Ride a boda to ${leg.to.name}`,
        detail: `${Math.round(leg.meters)} m, about ${leg.minutes} min`,
        meta: [ugxRange(leg.fareMin, leg.fareMax), "agree the price first"],
      });
    } else {
      const board = stopByIndex(leg.stopIdxs[0]);
      const alight = stopByIndex(leg.stopIdxs[leg.stopIdxs.length - 1]);
      const mode = MODE_LABEL[leg.line.agency] ?? "matatu";
      steps.push({
        kind: "board",
        target: stopPlace(leg.stopIdxs[0]),
        title: `Board at ${board.n}`,
        detail: `a ${mode} heading to ${variantEndpoints(leg.variant)[1]}`,
        meta: [`every ${formatHeadway(leg.headwaySec)}`, `typical wait ~${Math.round(leg.waitMinutes)} min`],
      });
      steps.push({
        kind: "ride",
        target: stopPlace(leg.stopIdxs[leg.stopIdxs.length - 1]),
        title: `Ride to ${alight.n}`,
        detail: `${leg.stopIdxs.length} stages from ${board.n}`,
        meta: [`~${Math.round(leg.minutes)} min`, formatUgx(leg.fare)],
      });
    }
  }
  return steps;
}

export function navStepsForSimple(route: SimpleRoute, from: Place, to: Place): NavStep[] {
  return [
    {
      kind: "direct",
      mode: route.mode,
      target: to,
      title: `Head toward ${to.name}`,
      detail: `${route.label} from ${from.name}, about ${route.minutes} min`,
      meta: route.fareMin === 0 ? [] : [ugxRange(route.fareMin, route.fareMax)],
    },
  ];
}

/** Straight-line distance from the current fix to a step's target. */
export function metersTo(
  a: { lat: number; lng: number } | null,
  b: Place
): number | null {
  return a ? Math.round(haversine(a, b)) : null;
}

export function formatDistance(m: number): string {
  return m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`;
}
