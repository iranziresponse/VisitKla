import type { SimpleMode } from "./modes";

/**
 * Road-following line geometry for the map overlay, fetched at runtime from
 * free, keyless public routers — the same $0 posture as the geocoder:
 *
 *   car        → OSRM demo server (router.project-osrm.org)
 *   bicycle    → Valhalla at FOSSGIS (valhalla1.openstreetmap.de)
 *   pedestrian → Valhalla at FOSSGIS
 *
 * Both send CORS-open responses. Any non-car profile falls back to the car
 * router, and every failure resolves to null so the map keeps whatever it
 * drew before (the straight-line fallback). Results are cached for the
 * session; failed lookups are not cached, so a transient blip retries on
 * the next selection.
 */

export type RoadProfile = "car" | "bicycle" | "pedestrian";

export type LngLat = [number, number];

/** Which street network a simple mode should trace. */
export function profileForSimple(mode: SimpleMode): RoadProfile {
  if (mode === "cycle") return "bicycle";
  if (mode === "walk") return "pedestrian";
  return "car";
}

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const VALHALLA_URL = "https://valhalla1.openstreetmap.de/route";
const TIMEOUT_MS = 8000;

const cache = new Map<string, Promise<LngLat[] | null>>();

/**
 * Full-resolution [lng, lat] path along the street network through the
 * given waypoints, or null when every router failed. Identical requests
 * share one in-flight/cached promise.
 */
export function roadPath(profile: RoadProfile, waypoints: LngLat[]): Promise<LngLat[] | null> {
  const key = `${profile}|${waypoints.map((c) => c.map((n) => n.toFixed(5)).join(",")).join(";")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetchPath(profile, waypoints).then((res) => {
    if (res === null) cache.delete(key);
    return res;
  });
  cache.set(key, p);
  return p;
}

async function fetchPath(profile: RoadProfile, waypoints: LngLat[]): Promise<LngLat[] | null> {
  if (waypoints.length < 2) return null;
  const primary = profile === "car" ? osrmCar(waypoints) : valhalla(profile, waypoints);
  const first = await primary;
  if (first) return first;
  return profile === "car" ? null : osrmCar(waypoints);
}

async function osrmCar(waypoints: LngLat[]): Promise<LngLat[] | null> {
  const coords = waypoints.map((c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(";");
  const data = await fetchJson(`${OSRM_BASE}/${coords}?overview=full&geometries=geojson`);
  const out = data?.routes?.[0]?.geometry?.coordinates;
  return isValidPath(out) ? out : null;
}

async function valhalla(profile: RoadProfile, waypoints: LngLat[]): Promise<LngLat[] | null> {
  const data = await fetchJson(VALHALLA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: waypoints.map((c) => ({ lon: c[0], lat: c[1], type: "break" })),
      costing: profile,
      overview: "full",
      directions_options: { format: "osrm" },
    }),
  });
  // Valhalla's OSRM-compatible mode returns the overview as an encoded
  // polyline (precision 6, [lat, lng] pairs) rather than GeoJSON.
  const shape = data?.routes?.[0]?.geometry;
  if (typeof shape !== "string") return null;
  const pts = decodePolyline(shape, 6);
  return isValidPath(pts) ? pts.map(([lat, lng]) => [lng, lat] as LngLat) : null;
}

function isValidPath(coords: unknown): coords is LngLat[] {
  return Array.isArray(coords) && coords.length >= 2 && Array.isArray(coords[0]);
}

async function fetchJson(url: string, init?: RequestInit): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Google encoded-polyline decoder (long-lat pairs come out as [lat, lng]). */
function decodePolyline(str: string, precision: number): [number, number][] {
  const factor = Math.pow(10, precision);
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let result = 1;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 1;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / factor, lng / factor]);
  }
  return out;
}
