import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { stopByIndex, type Stop } from "../lib/network";
import type { Journey } from "../lib/planner";
import "./JourneyMap.css";

const TAXI_COLOR = "#ff6b00";
const BUS_COLOR = "#38bdf8";
const WALK_COLOR = "#8a8075";
const BASEMAP = "https://tiles.openfreemap.org/styles/liberty";

interface JourneyMapProps {
  journey: Journey;
}

function stopByIdx(idx: number): Stop {
  return stopByIndex(idx);
}

/**
 * Draws one selected journey: walk legs dashed, ride legs colored by
 * agency, boarding/alighting stages marked. Only the journey itself is
 * drawn — the surrounding network stays off so the trip reads clearly.
 */
export function JourneyMap({ journey }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP as unknown as StyleSpecification,
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
      map.addSource("tk-walk", {
        type: "geojson",
        data: { type: "FeatureCollection", features: walkFeatures },
      });
      map.addSource("tk-ride", {
        type: "geojson",
        data: { type: "FeatureCollection", features: rideFeatures },
      });
      map.addSource("tk-stages", {
        type: "geojson",
        data: { type: "FeatureCollection", features: stageFeatures },
      });

      map.addLayer({
        id: "walk",
        type: "line",
        source: "tk-walk",
        paint: {
          "line-color": WALK_COLOR,
          "line-width": 2.5,
          "line-dasharray": [1.5, 1.5],
        },
      });
      map.addLayer({
        id: "ride",
        type: "line",
        source: "tk-ride",
        paint: {
          "line-color": ["match", ["get", "agency"], "bus", BUS_COLOR, TAXI_COLOR],
          "line-width": 4.5,
        },
      });
      map.addLayer({
        id: "stages",
        type: "circle",
        source: "tk-stages",
        paint: {
          "circle-radius": 6,
          "circle-color": ["match", ["get", "kind"], "board", "#16a34a", "#ff6b00"],
          "circle-stroke-color": "#14120f",
          "circle-stroke-width": 2,
        },
      });

      if (w.length >= 2) {
        map.fitBounds(
          [
            [Math.min(...w), Math.min(...s)],
            [Math.max(...w), Math.max(...s)],
          ],
          { padding: 60, duration: 0, maxZoom: 15 }
        );
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [journey]);

  return <div className="tk-journey-map" ref={containerRef} />;
}
