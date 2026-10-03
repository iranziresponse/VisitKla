import maplibregl, { type Map as MlMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { shapeBetween, stopByIndex } from "../lib/network";
import { profileForSimple, roadPath, type LngLat } from "../lib/roadRoute";
import type { SimpleMode } from "../lib/modes";
// Same photoreal basemap as the classic app's maps (read-only import).
import { buildRideStyle } from "../../../lib/rideStyle";
import type { Journey, Place } from "../lib/planner";
import "./JourneyMap.css";

const TAXI_COLOR = "#ff6b00";
const BUS_COLOR = "#38bdf8";
const WALK_COLOR = "#f6efe4";
const CASING_COLOR = "#14120f";

/** Same tilted camera language as the classic app's maps. */
const PITCH = 55;
const BEARING = -12;
const KAMPALA_CENTER: [number, number] = [32.5825, 0.3476];
const CITY_ZOOM = 12;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export interface DirectRoute {
  from: Place;
  to: Place;
  mode: SimpleMode;
}

function journeyFeatures(journey: Journey, walkPaths: Map<number, LngLat[]>) {
  const walk: GeoJSON.Feature[] = [];
  const ride: GeoJSON.Feature[] = [];
  const stages: GeoJSON.Feature[] = [];

  let walkIdx = 0;
  for (const leg of journey.legs) {
    if (leg.kind === "walk") {
      const id = walkIdx++;
      // Straight pair until (unless) the street path arrives — the async
      // upgrade writes into walkPaths and redraws.
      const coords: LngLat[] =
        walkPaths.get(id) ??
        [
          [leg.from.lng, leg.from.lat],
          [leg.to.lng, leg.to.lat],
        ];
      walk.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      });
    } else {
      // Ride legs follow the feed's surveyed shape — the actual corridor a
      // matatu takes — cut between the board and alight stages. Straight
      // stop-to-stop segments are only the fallback when projection fails.
      const shape = shapeBetween(leg.variant, leg.stopIdxs);
      const coords = shape
        ? shape.map(([lat, lng]) => [lng, lat] as [number, number])
        : leg.stopIdxs.map((i) => {
            const st = stopByIndex(i);
            return [st.lng, st.lat] as [number, number];
          });
      ride.push({
        type: "Feature",
        properties: { agency: leg.line.agency },
        geometry: { type: "LineString", coordinates: coords },
      });
      const board = stopByIndex(leg.stopIdxs[0]);
      const alight = stopByIndex(leg.stopIdxs[leg.stopIdxs.length - 1]);
      stages.push(
        {
          type: "Feature",
          properties: { kind: "board", n: board.n },
          geometry: { type: "Point", coordinates: [board.lng, board.lat] },
        },
        {
          type: "Feature",
          properties: { kind: "alight", n: alight.n },
          geometry: { type: "Point", coordinates: [alight.lng, alight.lat] },
        }
      );
    }
  }
  return { walk, ride, stages };
}

function directFeatures(direct: DirectRoute) {
  const line: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [
        [direct.from.lng, direct.from.lat],
        [direct.to.lng, direct.to.lat],
      ],
    },
  };
  const ends: GeoJSON.Feature[] = [
    {
      type: "Feature",
      properties: { kind: "start" },
      geometry: { type: "Point", coordinates: [direct.from.lng, direct.from.lat] },
    },
    {
      type: "Feature",
      properties: { kind: "end" },
      geometry: { type: "Point", coordinates: [direct.to.lng, direct.to.lat] },
    },
  ];
  return { line, ends };
}

/**
 * The planner's persistent map. With nothing selected it's simply the
 * photoreal city view (same style + tilted camera as the classic app).
 * A matatu journey draws as walk legs (dashed) plus agency-colored ride
 * legs that follow the feed's surveyed shape; a simple route (boda / car
 * / bike / walk) draws as a dashed line along the street network with
 * endpoint dots. Clears back to the city view when the selection does.
 */
export function JourneyMap({
  journey,
  direct,
}: {
  journey: Journey | null;
  direct?: DirectRoute | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  // Selection epoch — async street-path upgrades check it before drawing,
  // so an answer that lands after the user picked something else is dropped.
  const routeToken = useRef(0);
  // Street paths for the current journey's walk legs, by walk-leg order.
  const walkPaths = useRef<Map<number, LngLat[]>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MlMap | null = null;
    let cancelled = false;
    let fallback: number | undefined;

    buildRideStyle({ buildings: true, satellite: true }).then((style) => {
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: KAMPALA_CENTER,
        zoom: CITY_ZOOM,
        pitch: PITCH,
        bearing: BEARING,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(
        new maplibregl.AttributionControl({
          customAttribution:
            'Transit data © <a href="https://gitlab.com/digitaltransport/data/africa/kampala">MapUganda &amp; Transport for Cairo</a>, CC BY 3.0',
        })
      );

      map.on("load", () => {
        const m = mapRef.current;
        if (!m || cancelled) return;
        m.addSource("tk-walk", { type: "geojson", data: EMPTY });
        m.addSource("tk-ride", { type: "geojson", data: EMPTY });
        m.addSource("tk-stages", { type: "geojson", data: EMPTY });
        m.addSource("tk-direct", { type: "geojson", data: EMPTY });
        m.addSource("tk-direct-ends", { type: "geojson", data: EMPTY });

        m.addLayer({
          id: "walk-casing",
          type: "line",
          source: "tk-walk",
          paint: {
            "line-color": CASING_COLOR,
            "line-width": 6.5,
            "line-opacity": 0.65,
          },
        });
        m.addLayer({
          id: "walk",
          type: "line",
          source: "tk-walk",
          paint: {
            "line-color": WALK_COLOR,
            "line-width": 3,
            "line-dasharray": [1.4, 1.6],
          },
        });
        m.addLayer({
          id: "ride-casing",
          type: "line",
          source: "tk-ride",
          paint: {
            "line-color": CASING_COLOR,
            "line-width": 9,
            "line-opacity": 0.85,
          },
        });
        m.addLayer({
          id: "ride",
          type: "line",
          source: "tk-ride",
          paint: {
            "line-color": ["match", ["get", "agency"], "bus", BUS_COLOR, TAXI_COLOR],
            "line-width": 5,
          },
        });
        m.addLayer({
          id: "stages",
          type: "circle",
          source: "tk-stages",
          paint: {
            "circle-radius": 6.5,
            "circle-color": ["match", ["get", "kind"], "board", "#16a34a", "#ff6b00"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        m.addLayer({
          id: "direct-casing",
          type: "line",
          source: "tk-direct",
          paint: {
            "line-color": CASING_COLOR,
            "line-width": 6,
            "line-opacity": 0.7,
          },
        });
        m.addLayer({
          id: "direct",
          type: "line",
          source: "tk-direct",
          paint: {
            "line-color": TAXI_COLOR,
            "line-width": 3.5,
            "line-dasharray": [0.6, 1.4],
          },
        });
        m.addLayer({
          id: "direct-ends",
          type: "circle",
          source: "tk-direct-ends",
          paint: {
            "circle-radius": 5.5,
            "circle-color": ["match", ["get", "kind"], "start", "#16a34a", TAXI_COLOR],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        // Reveal once tiles have painted — same treatment as the classic
        // world map — with a safety fallback for a stalled tile server.
        m.once("idle", () => {
          if (cancelled) return;
          if (fallback !== undefined) window.clearTimeout(fallback);
          setReady(true);
        });
        fallback = window.setTimeout(() => !cancelled && setReady(true), 14000);
      });
    });

    return () => {
      cancelled = true;
      if (fallback !== undefined) window.clearTimeout(fallback);
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw / clear the selection. Sources exist from "load" onward; the
  // ready flag gates this until then. A journey wins over a direct line.
  // Straight-line geometry is drawn immediately; street-following paths
  // for walk legs and the direct line replace it once the routers answer.
  // A token counter keeps stale async upgrades from touching the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const token = ++routeToken.current;
    const src = (id: string) => {
      const s = map.getSource(id);
      return s ? (s as GeoJSONSource) : null;
    };

    const clearJourney = () => {
      src("tk-walk")?.setData(EMPTY);
      src("tk-ride")?.setData(EMPTY);
      src("tk-stages")?.setData(EMPTY);
    };
    const clearDirect = () => {
      src("tk-direct")?.setData(EMPTY);
      src("tk-direct-ends")?.setData(EMPTY);
    };

    if (!journey && !direct) {
      clearJourney();
      clearDirect();
      map.easeTo({ center: KAMPALA_CENTER, zoom: CITY_ZOOM, duration: 700 });
      return;
    }

    if (journey) {
      clearDirect();
      walkPaths.current = new Map();
      const redraw = () => {
        if (token !== routeToken.current) return;
        const f = journeyFeatures(journey, walkPaths.current);
        src("tk-walk")?.setData({ type: "FeatureCollection", features: f.walk });
        src("tk-ride")?.setData({ type: "FeatureCollection", features: f.ride });
        src("tk-stages")?.setData({ type: "FeatureCollection", features: f.stages });
      };
      redraw();
      {
        const lons: number[] = [];
        const lats: number[] = [];
        for (const leg of journey.legs) {
          const a = leg.kind === "walk" ? leg.from : stopByIndex(leg.stopIdxs[0]);
          const b =
            leg.kind === "walk"
              ? leg.to
              : stopByIndex(leg.stopIdxs[leg.stopIdxs.length - 1]);
          lons.push(a.lng, b.lng);
          lats.push(a.lat, b.lat);
        }
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 80, duration: 900, maxZoom: 15.5 }
        );
      }

      // Upgrade each walk leg's dashed line from straight to the actual
      // street path. Camera stays put — short walks can at most poke a
      // little past the stop-based bounds.
      let walkIdx = 0;
      for (const leg of journey.legs) {
        if (leg.kind !== "walk") continue;
        const id = walkIdx++;
        roadPath("pedestrian", [
          [leg.from.lng, leg.from.lat],
          [leg.to.lng, leg.to.lat],
        ]).then((path) => {
          if (!path || token !== routeToken.current) return;
          walkPaths.current.set(id, path);
          redraw();
        });
      }
      return;
    }

    clearJourney();
    const d = directFeatures(direct as DirectRoute);
    src("tk-direct")?.setData({ type: "FeatureCollection", features: [d.line] });
    src("tk-direct-ends")?.setData({ type: "FeatureCollection", features: d.ends });
    map.fitBounds(
      [
        [Math.min(direct!.from.lng, direct!.to.lng), Math.min(direct!.from.lat, direct!.to.lat)],
        [Math.max(direct!.from.lng, direct!.to.lng), Math.max(direct!.from.lat, direct!.to.lat)],
      ],
      { padding: 90, duration: 900, maxZoom: 15.5 }
    );

    // Replace the straight dashed chord with the street path once known,
    // and re-frame so the whole road route stays visible.
    roadPath(profileForSimple((direct as DirectRoute).mode), [
      [direct!.from.lng, direct!.from.lat],
      [direct!.to.lng, direct!.to.lat],
    ]).then((path) => {
      if (!path || token !== routeToken.current) return;
      src("tk-direct")?.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path } },
        ],
      });
      const lons = path.map((c) => c[0]);
      const lats = path.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 90, duration: 700, maxZoom: 15.5 }
      );
    });
  }, [journey, direct, ready]);

  return (
    <div className="tk-journey-map-wrap">
      <div className="tk-journey-map" ref={containerRef} />
      {!ready && (
        <div className="tk-map-loading">
          <span className="tk-map-loading__spinner" />
        </div>
      )}
    </div>
  );
}
