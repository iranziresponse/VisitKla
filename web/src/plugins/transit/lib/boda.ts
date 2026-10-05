import type { BodaLeg, Journey, WalkLeg } from "./planner";

/**
 * Boda price estimates. Draft public-knowledge model: ~UGX 1,000 base and
 * ~800/km, which matches 2024-ish Kampala stage rates (a 2-3 km hop runs
 * UGX 2,000-3,500). Re-implemented here so the plugin stays self-contained.
 */
export function estimateBoda(meters: number): { min: number; max: number } {
  const min = Math.max(1000, Math.round((1000 + meters * 0.8) / 500) * 500);
  const max = Math.round((min * 1.45) / 500) * 500;
  return { min, max };
}

/**
 * Walks at least this long (detour-adjusted meters, so ~12 minutes on
 * foot) earn the swap option: a boda cuts a 20-minute walk to about five.
 * Below it, walking is the better call and the UI stays quiet.
 */
export const BODA_SWAP_M = 900;

/**
 * Effective door-to-door speed including traffic and haggling — the same
 * model as the boda mode in modes.ts, shared so the step hint and the
 * swap agree on the numbers.
 */
export const BODA_SPEED_M_PER_MIN = 260;

export function bodaMinutes(meters: number): number {
  return Math.max(2, Math.round(meters / BODA_SPEED_M_PER_MIN));
}

/** The boda ride that replaces a too-long walk. */
export function bodaLegForWalk(leg: WalkLeg): BodaLeg {
  const fare = estimateBoda(leg.meters);
  return {
    kind: "boda",
    from: leg.from,
    to: leg.to,
    meters: leg.meters,
    minutes: bodaMinutes(leg.meters),
    fareMin: fare.min,
    fareMax: fare.max,
  };
}

/**
 * Derived journey with the given leg indices ridden by boda instead of
 * walked. Totals recompute; the matatu fare total is unchanged — the boda
 * is a separate cash negotiation, so the UI shows it as its own range
 * rather than folding a guess into the surveyed fares.
 */
export function journeyWithBodaSwaps(
  journey: Journey,
  swapped: ReadonlySet<number>
): Journey {
  if (swapped.size === 0) return journey;
  const legs = journey.legs.map((leg, i) =>
    swapped.has(i) && leg.kind === "walk" ? bodaLegForWalk(leg) : leg
  );
  const total = legs.reduce((sum, l) => sum + l.minutes, 0);
  const walkMeters = legs.reduce(
    (sum, l) => sum + (l.kind === "walk" ? l.meters : 0),
    0
  );
  return {
    legs,
    totalMinutes: Math.round(total),
    fare: journey.fare,
    walkMeters,
    transfers: journey.transfers,
  };
}
