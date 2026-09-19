import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { lineBounds, network, stopByIndex } from "../lib/network";
// Read-only import of the classic app's photoreal basemap builder — the
// exact same satellite+3D-buildings style the world/navigation maps use.
import { buildRideStyle } from "../../../lib/rideStyle";
import "./NetworkMap.css";

const TAXI_COLOR = "#ff6b00";
const BUS_COLOR = "#38bdf8";

/** Same tilted "world view" camera as the classic app's landing map. */
const KAMPALA_CENTER: [number, number] = [32.5825, 0.3476];
const PITCH = 55;
const BEARING = -12;

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
 * The whole matatu + bus network on one map, on the same photoreal world
 * as the classic app. Deliberately dumb: every interaction lands in the
 * two callbacks and the cards live outside — this component only knows
 * how to draw and highlight.
 */
export function NetworkMap({
  selectedLineId,
  focus,
  onSelectLine,
  onSelectStop,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const cbsRef = useRef({ onSelectLine, onSelectStop });
  cbsRef.current = { onSelectLine, onSelectStop };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MlMap | null = null;
    let cancelled = false;
    let fallback: number | undefined;

    buildRideStyle({ buildings: true, satellite: true }).then((style) => {
      if (cancelled || !containerRef.current) return;

      const small = Math.min(
        containerRef.current.clientWidth || 400,
        containerRef.current.clientHeight || 700
      );
      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: KAMPALA_CENTER,
        zoom: small < 500 ? 11 : 11.6,
        pitch: PITCH,
        bearing: BEARING,
        attributionControl: false,
      });
      mapRef.current = map;
      if (import.meta.env.DEV) {
        // Dev-only handle so tests can inspect the camera/project points.
        (window as unknown as Record<string, unknown>).__tkMap = map;
      }
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
        const m = mapRef.current;
        if (!m || cancelled) return;
        m.addSource("tk-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: buildLineFeatures() },
        });
        m.addSource("tk-stops", {
          type: "geojson",
          data: { type: "FeatureCollection", features: buildStopFeatures() },
        });

        // Dark casings under both line weights keep the routes readable
        // against busy aerial imagery.
        m.addLayer({
          id: "lines-casing",
          type: "line",
          source: "tk-lines",
          filter: ["==", ["get", "lid"], selectedLineId ?? ""],
          paint: {
            "line-color": "#14120f",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4.5, 13, 8],
            "line-opacity": 0.9,
          },
        });
        m.addLayer({
          id: "lines-dimmed",
          type: "line",
          source: "tk-lines",
          filter: ["!=", ["get", "lid"], selectedLineId ?? ""],
          paint: {
            "line-color": ["match", ["get", "agency"], "bus", BUS_COLOR, TAXI_COLOR],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.8, 13, 3.5],
            "line-opacity": 0.55,
          },
        });
        m.addLayer({
          id: "lines",
          type: "line",
          source: "tk-lines",
          filter: ["==", ["get", "lid"], selectedLineId ?? ""],
          paint: {
            "line-color": ["match", ["get", "agency"], "bus", BUS_COLOR, TAXI_COLOR],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 13, 5],
            "line-opacity": 0.98,
          },
        });
        // Stages only earn their dots up close — at city zoom 1,242 of them
        // turn every route into a caterpillar.
        m.addLayer(
          {
            id: "stops",
            type: "circle",
            source: "tk-stops",
            minzoom: 12,
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 14, 4.5, 16, 6],
              "circle-color": "#ffffff",
              "circle-stroke-color": "#14120f",
              "circle-stroke-width": 1,
              "circle-opacity": 0.95,
            },
          },
          "lines-casing"
        );
        // Invisible, much larger twin of the dots purely for hit-testing —
        // a 4px tap target is hostile on a phone.
        m.addLayer({
          id: "stops-hit",
          type: "circle",
          source: "tk-stops",
          minzoom: 12,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 12, 14, 16],
            "circle-opacity": 0,
            "circle-stroke-width": 0,
          },
        });

        m.on("click", "lines", (e) => {
          const lid = e.features?.[0]?.properties?.lid;
          if (typeof lid === "string") cbsRef.current.onSelectLine(lid);
        });

        m.on("click", "stops-hit", (e) => {
          const idx = e.features?.[0]?.properties?.idx;
          if (typeof idx === "number") cbsRef.current.onSelectStop(idx);
        });

        // Clicking bare map / a line with no stage under the cursor clears
        // the selection — a stage click wins over the line beneath it.
        m.on("click", "lines-dimmed", (e) => {
          const under = m.queryRenderedFeatures(e.point, { layers: ["stops-hit"] });
          if (under.length === 0) {
            cbsRef.current.onSelectLine(null);
            cbsRef.current.onSelectStop(null);
          }
        });

        const enter = () => (m.getCanvas().style.cursor = "pointer");
        const leave = () => (m.getCanvas().style.cursor = "");
        for (const layer of ["lines", "lines-dimmed", "stops-hit"]) {
          m.on("mouseenter", layer, enter);
          m.on("mouseleave", layer, leave);
        }

        // Reveal only once tiles have actually painted — same treatment
        // as the classic world map — with a safety fallback so a stalled
        // tile server can never leave the veil up forever.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight swap without touching the base style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const selected = selectedLineId ?? "";
    map.setFilter("lines", ["==", ["get", "lid"], selected]);
    map.setFilter("lines-dimmed", ["!=", ["get", "lid"], selected]);
    map.setFilter("lines-casing", ["==", ["get", "lid"], selected]);
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

  return (
    <div className="tk-network-shell">
      <div className="tk-network-map" ref={containerRef} />
      {!ready && (
        <div className="tk-map-loading">
          <span className="tk-map-loading__spinner" />
        </div>
      )}
    </div>
  );
}
