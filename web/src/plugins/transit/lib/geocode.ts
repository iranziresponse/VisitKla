import type { Place } from "./planner";

/**
 * Plugin-local geocoder: Nominatim, biased to the Kampala metro area,
 * abortable, fail-soft (empty list on any error — the UI still has the
 * 1,242 bundled stage names to search).
 */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** west, north, east, south — greater Kampala */
const VIEWBOX = "32.2,0.55,32.95,-0.10";

export async function geocodePlace(
  query: string,
  signal?: AbortSignal
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${NOMINATIM}?format=jsonv2&limit=5&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      name?: string;
    }>;
    return rows.map((r) => ({
      name: r.name && r.name.length > 0 ? r.name : r.display_name.split(",")[0],
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
  } catch {
    return [];
  }
}
