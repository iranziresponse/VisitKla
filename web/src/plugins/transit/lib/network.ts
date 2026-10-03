import rawData from "../data/transit-data.json";

/**
 * Types for the generated network bundle (see pipeline/scripts/build-network.js
 * for how it's produced). Coordinates in `shape` are [lat, lng]; maplibre
 * wants [lng, lat] — the map component does that flip once at feature build.
 */
export interface Stop {
  /** GTFS stop_id (what3words-style token — internal, not shown to users) */
  i: string;
  n: string;
  lat: number;
  lng: number;
  /** ids of lines serving this stop — the planner/browse index */
  ln: string[];
}

export interface LineVariant {
  dir: string;
  shape: [number, number][];
  lenM: number;
  fare: number;
  /** time-of-day band → best headway in seconds */
  head: Record<string, number>;
  /** indices into NetworkData.stops, in travel order */
  stops: number[];
  /** seconds from variant start at each stop (same length as stops) */
  cum: number[];
}

export interface TransitLine {
  id: string;
  code: string;
  name: string;
  agency: string;
  v: LineVariant[];
}

export interface NetworkData {
  generatedAt: string;
  source: {
    url: string;
    publisher: string;
    license: string;
    feedVersion: string;
    vintage: string;
  };
  serviceAssumption: string;
  faresNote: string;
  stops: Stop[];
  lines: TransitLine[];
}

export const network = rawData as unknown as NetworkData;

const lineById = new Map(network.lines.map((l) => [l.id, l]));
export function getLine(id: string): TransitLine | undefined {
  return lineById.get(id);
}

export function stopByIndex(idx: number): Stop {
  return network.stops[idx];
}

/** First/last stage names of a variant — how matatus announce the run. */
export function variantEndpoints(v: LineVariant): [string, string] {
  const a = network.stops[v.stops[0]];
  const b = network.stops[v.stops[v.stops.length - 1]];
  return [a.n, b.n];
}

/** Bounding box of every stage as [[w, s], [e, n]] for maplibre fitBounds. */
export function networkBounds(): [[number, number], [number, number]] {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const st of network.stops) {
    if (st.lng < w) w = st.lng;
    if (st.lat < s) s = st.lat;
    if (st.lng > e) e = st.lng;
    if (st.lat > n) n = st.lat;
  }
  return [
    [w, s],
    [e, n],
  ];
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function nearestVertex(
  shape: [number, number][],
  lat: number,
  lng: number,
  from: number,
  to: number
): number {
  let best = from;
  let bestD = Infinity;
  for (let i = from; i <= to; i++) {
    const d = dist2(shape[i][0], shape[i][1], lat, lng);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * The portion of a variant's shape one ride leg actually covers. Every
 * stop the leg rides is projected onto the polyline and the covered span
 * is the min-to-max vertex range — the stops travel the stretch in order,
 * so their projections bracket it. Returns [lat, lng] points (data space
 * — the map flips them), or null when the projection fails and the caller
 * should fall back to straight stop-to-stop segments.
 */
export function shapeBetween(v: LineVariant, stopIdxs: number[]): [number, number][] | null {
  if (v.shape.length < 2 || stopIdxs.length < 2) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const idx of stopIdxs) {
    const s = stopByIndex(idx);
    const i = nearestVertex(v.shape, s.lat, s.lng, 0, v.shape.length - 1);
    if (i < lo) lo = i;
    if (i > hi) hi = i;
  }
  if (!Number.isFinite(lo) || hi <= lo) return null;
  return v.shape.slice(lo, hi + 1);
}

/** Bounding box of one line (union of its variants' shapes). */
export function lineBounds(id: string): [[number, number], [number, number]] {
  const line = getLine(id);
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const v of line?.v ?? []) {
    for (const [lat, lng] of v.shape) {
      if (lng < w) w = lng;
      if (lat < s) s = lat;
      if (lng > e) e = lng;
      if (lat > n) n = lat;
    }
  }
  return [
    [w, s],
    [e, n],
  ];
}

const BAND_LABELS: Record<string, string> = {
  night: "late night",
  am: "morning",
  mid: "midday",
  pm: "afternoon",
  eve: "evening",
};

export function bandLabel(band: string): string {
  return BAND_LABELS[band] ?? band;
}

/** Time-of-day band a given moment falls into (matches the pipeline's buckets). */
export function bandFor(when: Date): string {
  const h = when.getHours();
  return h < 6 ? "night" : h < 10 ? "am" : h < 16 ? "mid" : h < 20 ? "pm" : "eve";
}

/** Best headway (seconds) a variant runs with at a given moment. */
export function headwayNow(variant: { head: Record<string, number> }, when: Date): number {
  const band = bandFor(when);
  return (
    variant.head[band] ??
    variant.head.am ??
    variant.head.mid ??
    variant.head.pm ??
    variant.head.eve ??
    variant.head.night ??
    900
  );
}

/** 466 → "~8 min" */
export function formatHeadway(secs: number): string {
  const mins = Math.max(1, Math.round(secs / 60));
  return `~${mins} min`;
}

/** 7713 → "7.7 km" */
export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

/** 2500 → "UGX 2,500" */
export function formatUgx(amount: number): string {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

export const AGENCY_LABEL: Record<string, string> = {
  taxi: "Matatu (14-seater)",
  bus: "Bus",
};

/**
 * Case-insensitive search over line codes and names. Starts-with matches
 * rank ahead of contains, so "ka02" surfaces KA021-style codes first.
 */
export function searchLines(query: string, limit = 8): TransitLine[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ line: TransitLine; score: number }> = [];
  for (const line of network.lines) {
    const code = line.code.toLowerCase();
    const name = line.name.toLowerCase();
    let score = Infinity;
    if (code.startsWith(q)) score = 0;
    else if (code.includes(q)) score = 1;
    else if (name.toLowerCase().startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    if (score < Infinity) scored.push({ line, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.line);
}

/** Search stage names; returns indices into network.stops. */
export function searchStopIndices(query: string, limit = 8): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ idx: number; score: number }> = [];
  for (let idx = 0; idx < network.stops.length; idx++) {
    const n = network.stops[idx].n.toLowerCase();
    let score = Infinity;
    if (n.startsWith(q)) score = 0;
    else if (n.includes(q)) score = 1;
    if (score < Infinity) scored.push({ idx, score });
  }
  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return scored.slice(0, limit).map((s) => s.idx);
}
