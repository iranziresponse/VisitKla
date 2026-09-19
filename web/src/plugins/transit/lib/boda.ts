/**
 * Boda first/last-mile price estimates for journey legs that are too long
 * to walk. Same formula shape the classic app uses (base + per-km, rounded
 * to 500) re-implemented here so the plugin stays self-contained.
 */
export function estimateBoda(meters: number): { min: number; max: number } {
  const min = Math.max(1000, Math.round((1200 + meters * 2.1) / 500) * 500);
  const max = Math.round((min * 1.45) / 500) * 500;
  return { min, max };
}

/** Legs longer than this read as "too far to walk" → suggest a boda. */
export const BODA_SUGGEST_M = 1500;
