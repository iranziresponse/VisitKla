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

/** Legs longer than this read as "too far to walk" → suggest a boda. */
export const BODA_SUGGEST_M = 1500;
