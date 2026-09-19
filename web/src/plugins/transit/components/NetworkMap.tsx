import { useEffect, useRef } from "react";
import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { lineBounds, network, networkBounds, stopByIndex } from "../lib/network";
import "./NetworkMap.css";

const TAXI_COLOR = "#ff6b00";
const BUS_COLOR = "#38bdf8";
const BASEMAP = "https://tiles.openfreemap.org/styles/liberty";

/** Camera target; `seq` lets the same target retrigger a fly. */
export interface FocusTarget {
  seq: number;
  kind: "line" | "stop";
  idOrIdx: string | number;
}

interface NetworkMapProps {
  selectedLineId: string | null;
  focus: FocusTarget | null;
  onSelectLine: (id: string | null) => void;
  onSelectStop: (stopIdx: number | null) => void;
}

function buildLineFeatures(): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const line of network.lines) {
    for (const v of line.v) {
      features.push({
        type: "Feature",
        properties: { lid: line.id, agency: line.agency },
        geometry: {
          type: "LineString",
          coordinates: v.shape.map(([lat, lng]) => [lng, lat]),
        },
      });
    }
  }
  return features;
}

function buildStopFeatures(): GeoJSON.Feature[] {
  return network.stops.map((s, idx) => ({
    type: "Feature",
    properties: { idx, n: s.n, lines: s.ln.length },
    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
  }));
}

/**
 * The whole matatu + bus network on one map. Deliberately dumb: every
 * interaction lands in the two callbacks and the cards live outside —
 * this component only knows how to draw and highlight.
 */
export function NetworkMap({
  selectedLineId,
  focus,
  onSelectLine,
  onSelectStop,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const cbsRef = useRef({ onSelectLine, onSelectStop });
  cbsRef.current = { onSelectLine, onSelectStop };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP as unknown as StyleSpecification,
      attributionControl: false,
    });
    if (import.meta.env.DEV) {
      // Dev-only handle so tests can inspect the camera/layers.
      (window as unknown as Record<string, unknown>).__tkMap = map;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({
        customAttribution:
          'Transit data © <a href="https://gitlab.com/digitaltransport/data/africa/kampala">MapUganda &amp; Transport for Cairo</a>, CC BY 3.0',
      })
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    map.on("load", () => {
      map.addSource("tk-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: buildLineFeatures() },
      });
      map.addSource("tk-stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: buildStopFeatures() },
      });

      map.addLayer({
        id: "lines-dimmed",
        type: "line",
        source: "tk-lines",
        filter: ["!=", ["get", "lid"], selectedLineId ?? ""],
        paint: {
          "line-color": ["match", ["get", "agency"], "bus", BUS_COLOR, TAXI_COLOR],
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 13, 2.5],
          "line-opacity": 0.3,
        },
      });
      map.addLayer({
        id: "lines",
        type: "line",
        source: "tk-lines",
        filter: ["==", ["get", "lid"], selectedLineId ?? ""],
        paint: {
          "line-color": ["match", ["get", "agency"], "bus", BUS_COLOR, TAXI_COLOR],
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 13, 5],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "tk-stops",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 13, 4],
          "circle-color": "#f4efe8",
          "circle-stroke-color": "#14120f",
          "circle-stroke-width": 1,
          "circle-opacity": 0.9,
        },
      });

      map.fitBounds(networkBounds(), { padding: 40, duration: 0 });

      map.on("click", "lines", (e) => {
        const lid = e.features?.[0]?.properties?.lid;
        if (typeof lid === "string") cbsRef.current.onSelectLine(lid);
      });

      map.on("click", "stops", (e) => {
        const idx = e.features?.[0]?.properties?.idx;
        if (typeof idx === "number") cbsRef.current.onSelectStop(idx);
      });

      // Clicking bare map / a line with no stage under the cursor clears the
      // selection — but a stage click wins over the line beneath it.
      map.on("click", "lines-dimmed", (e) => {
        const under = map.queryRenderedFeatures(e.point, { layers: ["stops"] });
        if (under.length === 0) {
          cbsRef.current.onSelectLine(null);
          cbsRef.current.onSelectStop(null);
        }
      });

      const enter = () => (map.getCanvas().style.cursor = "pointer");
      const leave = () => (map.getCanvas().style.cursor = "");
      for (const layer of ["lines", "lines-dimmed", "stops"]) {
        map.on("mouseenter", layer, enter);
        map.on("mouseleave", layer, leave);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight swap without touching the base style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const selected = selectedLineId ?? "";
    map.setFilter("lines", ["==", ["get", "lid"], selected]);
    map.setFilter("lines-dimmed", ["!=", ["get", "lid"], selected]);
  }, [selectedLineId]);

  // Fly the camera to whatever the app asked to focus (search pick etc.).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.kind === "line") {
      map.fitBounds(lineBounds(String(focus.idOrIdx)), {
        padding: 70,
        duration: 900,
        maxZoom: 13,
      });
    } else {
      const stop = stopByIndex(Number(focus.idOrIdx));
      map.flyTo({ center: [stop.lng, stop.lat], zoom: 15, duration: 900 });
    }
  }, [focus]);

  return <div className="tk-network-map" ref={containerRef} />;
}
