import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { stopByIndex, type Stop } from "../lib/network";
// Same photoreal basemap as the classic app's maps (read-only import).
import { buildRideStyle } from "../../../lib/rideStyle";
import type { Journey } from "../lib/planner";
import "./JourneyMap.css";

const TAXI_COLOR = "#ff6b00";
const BUS_COLOR = "#38bdf8";
const WALK_COLOR = "#f6efe4";
const CASING_COLOR = "#14120f";

/** Same tilted camera language as the classic app's maps. */
const PITCH = 55;
const BEARING = -12;

interface JourneyMapProps {
  journey: Journey;
}

function stopByIdx(idx: number): Stop {
  return stopByIndex(idx);
}

/**
 * Draws one selected journey: walk legs dashed, ride legs colored by
 * agency over dark casings (readable on aerial imagery), boarding and
 * alighting stages marked. Only the journey is drawn so the trip reads
 * clearly against the photoreal ground.
 */
export function JourneyMap({ journey }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MlMap | null = null;
    let cancelled = false;

    buildRideStyle({ buildings: true, satellite: true }).then((style) => {
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style,
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

      const w: number[] = [];
      const s: number[] = [];
      const walkFeatures: GeoJSON.Feature[] = [];
      const rideFeatures: GeoJSON.Feature[] = [];
      const stageFeatures: GeoJSON.Feature[] = [];

      for (const leg of journey.legs) {
        if (leg.kind === "walk") {
          walkFeatures.push({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [leg.from.lng, leg.from.lat],
                [leg.to.lng, leg.to.lat],
              ],
            },
          });
          w.push(leg.from.lng, leg.to.lng);
          s.push(leg.from.lat, leg.to.lat);
        } else {
          const coords = leg.stopIdxs.map((i) => {
            const st = stopByIdx(i);
            return [st.lng, st.lat] as [number, number];
          });
          rideFeatures.push({
            type: "Feature",
            properties: { agency: leg.line.agency },
            geometry: { type: "LineString", coordinates: coords },
          });
          for (const c of coords) {
            w.push(c[0]);
            s.push(c[1]);
          }
          const board = stopByIdx(leg.stopIdxs[0]);
          const alight = stopByIdx(leg.stopIdxs[leg.stopIdxs.length - 1]);
          stageFeatures.push(
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

      map.on("load", () => {
        const m = mapRef.current;
        if (!m || cancelled) return;
        m.addSource("tk-walk", {
          type: "geojson",
          data: { type: "FeatureCollection", features: walkFeatures },
        });
        m.addSource("tk-ride", {
          type: "geojson",
          data: { type: "FeatureCollection", features: rideFeatures },
        });
        m.addSource("tk-stages", {
          type: "geojson",
          data: { type: "FeatureCollection", features: stageFeatures },
        });

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

        if (w.length >= 2) {
          m.fitBounds(
            [
              [Math.min(...w), Math.min(...s)],
              [Math.max(...w), Math.max(...s)],
            ],
            { padding: 70, duration: 0, maxZoom: 15.5 }
          );
        }
        if (!cancelled) setReady(true);
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [journey]);

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
