import { haversine, type Place } from "./planner";

/**
 * Plugin-local geocoder: resolves ANY named place in greater Kampala —
 * POIs, neighbourhoods, streets — not just the surveyed stages. Photon
 * (Komoot's autocomplete over OSM) goes first because it's fuzzy and
 * built for search-as-you-type; Nominatim is the fallback. Both are free
 * and keyless. Results are hard-boxed to the Kampala metro so a generic
 * query never surfaces a same-named place elsewhere in the world.
 * Fail-soft: an empty list on any error — the UI still has the bundled
 * stage names to search.
 */

/** greater Kampala, [minLng, minLat, maxLng, maxLat] */
const KAMPALA_BBOX = "32.2,-0.10,32.95,0.55";
const KAMPALA_CENTER = { lat: 0.3476, lng: 32.5825 };
/** a hit farther than this from the center is geocoder noise */
const MAX_RADIUS_M = 40000;

export interface GeocodeHit {
  place: Place;
  /** short type label for the dropdown, e.g. "mall" / "area" */
  meta?: string;
  /** disambiguating context, e.g. "Kisementi, Kampala" */
  context?: string;
}

export async function geocodePlace(
  query: string,
  signal?: AbortSignal,
  near: { lat: number; lng: number } = KAMPALA_CENTER
): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const hits = await photonSearch(q, near, signal).catch(() => [] as GeocodeHit[]);
  if (hits.length > 0) return hits;
  return nominatimSearch(q, signal).catch(() => [] as GeocodeHit[]);
}

// --- Photon ---------------------------------------------------------------

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

async function photonSearch(
  q: string,
  near: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<GeocodeHit[]> {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}` +
    `&lat=${near.lat}&lon=${near.lng}&limit=8&lang=en&bbox=${KAMPALA_BBOX}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const hits: GeocodeHit[] = [];
  const seen = new Set<string>();
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    const name = p.name ?? p.street;
    const coords = f.geometry?.coordinates;
    if (!name || !coords) continue;
    const [lng, lat] = coords;
    if (haversine(KAMPALA_CENTER, { lat, lng }) > MAX_RADIUS_M) continue;
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      place: { name, lat, lng },
      meta: typeLabel(p.osm_key, p.osm_value),
      context: contextOf(name, p.locality, p.district, p.city, p.county),
    });
  }
  return hits;
}

// --- Nominatim (fallback) ---------------------------------------------------

async function nominatimSearch(q: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  // Nominatim viewbox order is left,top,right,bottom (lon,lat,lon,lat)
  const [minLng, minLat, maxLng, maxLat] = KAMPALA_BBOX.split(",");
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8` +
    `&countrycodes=ug&viewbox=${minLng},${maxLat},${maxLng},${minLat}` +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    name?: string;
    type?: string;
    addresstype?: string;
  }>;
  const hits: GeocodeHit[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (haversine(KAMPALA_CENTER, { lat, lng }) > MAX_RADIUS_M) continue;
    const name = r.name && r.name.length > 0 ? r.name : r.display_name.split(",")[0];
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parts = r.display_name.split(",").map((s) => s.trim()).filter((s) => s !== "Uganda");
    hits.push({
      place: { name, lat, lng },
      meta: typeLabel(undefined, r.addresstype ?? r.type),
      context: parts.slice(-2).join(", "),
    });
  }
  return hits;
}

// --- labels ----------------------------------------------------------------

/** osm_value → dropdown badge; empty set = too generic to be worth showing */
const POI_LABELS = new Set([
  "mall", "market", "marketplace", "supermarket", "hospital", "clinic",
  "pharmacy", "university", "college", "school", "stadium", "airport",
  "museum", "theatre", "cinema", "nightclub", "bar", "restaurant", "cafe",
  "bank", "police", "library", "bus station", "place of worship", "zoo",
  "garden", "pitch", "hotel",
]);
const LABEL_REMAP: Record<string, string> = {
  fuel: "fuel station",
  place_of_worship: "place of worship",
  post_office: "post office",
  bus_station: "bus station",
  marketplace: "market",
};

function typeLabel(osmKey?: string, osmValue?: string): string | undefined {
  if (!osmValue) return undefined;
  if (osmKey === "place") return "area";
  const label = LABEL_REMAP[osmValue] ?? osmValue.replace(/_/g, " ");
  return POI_LABELS.has(label) ? label : undefined;
}

function contextOf(name: string, ...parts: Array<string | undefined>): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!p || seen.has(p) || p.toLowerCase() === name.toLowerCase()) continue;
    seen.add(p);
    out.push(p);
  }
  return out.length > 0 ? out.slice(0, 2).join(", ") : undefined;
}
