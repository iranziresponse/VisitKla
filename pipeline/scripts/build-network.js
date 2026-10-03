#!/usr/bin/env node
/**
 * build-network.js — turn the cached GTFS feed into the transit plugin's
 * bundled transit-data.json.
 *
 * Input : .cache/gtfs/*.txt   (run `npm run fetch` first)
 *         config/fares.json   (distance tiers + line overrides)
 * Output: ../web/src/plugins/transit/data/transit-data.json
 *
 * The feed is fully frequency-based (frequencies.txt), so service dates in
 * calendar.txt (expired: 2019–2020) are irrelevant to headways — the output
 * carries a `serviceAssumption` note instead of a calendar. All headway
 * bands are treated as always-valid; the data vintage is embedded and
 * surfaced in the UI.
 *
 * Output shape (compact by design — every byte ships to the browser):
 *   stops:  [{ i, n, lat, lng, ln: [lineId…] }]   — the stage index
 *   lines:  [{ id, code, name, agency, v: [variant…] }]
 *   variant:{ dir, shape: [[lat,lng]…], lenM, fare, head: {band: secs},
 *             stops: [stopIdx…], cum: [secFromStart…] }
 */

const fs = require("node:fs");
const path = require("node:path");
const { parseCsv, toSeconds, pathLength, simplify, median } = require("./lib/gtfs");

const ROOT = path.join(__dirname, "..");
const GTFS = path.join(ROOT, ".cache", "gtfs");
const OUT_DIR = path.join(ROOT, "..", "web", "src", "plugins", "transit", "data");
const OUT_PATH = path.join(OUT_DIR, "transit-data.json");
const fares = require(path.join(ROOT, "config", "fares.json"));

const SHAPE_TOL_M = 8;

function fareFor(lengthM, lineId) {
  const override = fares.lineOverrides[lineId];
  if (override) return override;
  for (const tier of fares.tiers) {
    if (lengthM <= tier.maxMeters) return tier.fare;
  }
  return fares.tiers[fares.tiers.length - 1].fare;
}

function headwayBand(startSec) {
  const h = startSec / 3600;
  if (h < 6) return "night";
  if (h < 10) return "am";
  if (h < 16) return "mid";
  if (h < 20) return "pm";
  return "eve";
}

function main() {
  for (const f of [
    "agency.txt",
    "calendar.txt",
    "feed_info.txt",
    "frequencies.txt",
    "routes.txt",
    "shapes.txt",
    "stop_times.txt",
    "stops.txt",
    "trips.txt",
  ]) {
    if (!fs.existsSync(path.join(GTFS, f))) {
      throw new Error(`${f} missing — run \`npm run fetch\` first`);
    }
  }
  const read = (name) => parseCsv(fs.readFileSync(path.join(GTFS, name), "utf8"));

  console.log("Parsing GTFS…");
  const routes = read("routes.txt");
  const stops = read("stops.txt");
  const trips = read("trips.txt");
  const frequencies = read("frequencies.txt");
  const stopTimes = read("stop_times.txt");
  const feedInfo = read("feed_info.txt")[0] || {};

  // ---- shapes
  console.log("Reading shapes…");
  const shapes = new Map(); // shape_id -> [{lat,lng}] ordered
  {
    const raw = fs.readFileSync(path.join(GTFS, "shapes.txt"), "utf8");
    const lines = raw.split("\n");
    const header = lines[0].split(",");
    const iId = header.indexOf("shape_id");
    const iLat = header.indexOf("shape_pt_lat");
    const iLon = header.indexOf("shape_pt_lon");
    const iSeq = header.indexOf("shape_pt_sequence");
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (!l) continue;
      const f = l.split(",");
      const id = f[iId];
      if (!shapes.has(id)) shapes.set(id, []);
      shapes.get(id).push({ seq: +f[iSeq], lat: +f[iLat], lng: +f[iLon] });
    }
    for (const [id, pts] of shapes) {
      pts.sort((a, b) => a.seq - b.seq);
      shapes.set(id, pts.map((p) => ({ lat: p.lat, lng: p.lng })));
    }
  }

  // ---- stop_times grouped by trip, ordered
  console.log("Grouping stop_times…");
  const timesByTrip = new Map();
  for (const st of stopTimes) {
    if (!timesByTrip.has(st.trip_id)) timesByTrip.set(st.trip_id, []);
    timesByTrip.get(st.trip_id).push(st);
  }
  for (const [, sts] of timesByTrip) {
    sts.sort((a, b) => +a.stop_sequence - +b.stop_sequence);
  }

  // ---- trips grouped by route+direction
  console.log("Grouping trips by route+direction…");
  const tripsByRD = new Map(); // "routeId|dir" -> trips[]
  for (const t of trips) {
    const key = `${t.route_id}|${t.direction_id}`;
    if (!tripsByRD.has(key)) tripsByRD.set(key, []);
    tripsByRD.get(key).push(t);
  }

  // ---- global stop index (only stops actually served)
  console.log("Building stop index…");
  const stopIdxById = new Map(); // stop_id -> index into stops[]
  const stopsOut = [];
  for (const s of stops) {
    stopIdxById.set(s.stop_id, stopsOut.length);
    stopsOut.push({ i: s.stop_id, n: s.stop_name, lat: +s.stop_lat, lng: +s.stop_lon, ln: [] });
  }

  // ---- per route
  const linesOut = [];
  const warnings = [];
  let variantCount = 0;
  let rawPts = 0;
  let keptPts = 0;

  for (const r of routes) {
    const rTrips = trips.filter((t) => t.route_id === r.route_id);
    const dirs = [...new Set(rTrips.map((t) => t.direction_id))];
    const variants = [];

    for (const dir of dirs) {
      const dTrips = rTrips.filter((t) => t.direction_id === dir);
      const key = `${r.route_id}|${dir}`;

      // shape (all trips of a variant share one shape_id)
      const shapeId = dTrips[0].shape_id;
      const rawShape = shapes.get(shapeId);
      if (!rawShape) {
        warnings.push(`${key}: shape ${shapeId} missing — skipping variant`);
        continue;
      }
      const shape = simplify(rawShape, SHAPE_TOL_M);
      rawPts += rawShape.length;
      keptPts += shape.length;
      const lenM = Math.round(pathLength(shape));

      // stop sequence: use the most common stop count among the variant's
      // trips (guards against the odd trip with a truncated pattern)
      const counts = new Map();
      for (const t of dTrips) {
        const n = (timesByTrip.get(t.trip_id) || []).length;
        counts.set(n, (counts.get(n) || 0) + 1);
      }
      const modalCount = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const patternTrips = dTrips.filter(
        (t) => (timesByTrip.get(t.trip_id) || []).length === modalCount
      );
      const pattern = timesByTrip.get(patternTrips[0].trip_id);

      const stopIdxs = [];
      for (const st of pattern) {
        const idx = stopIdxById.get(st.stop_id);
        if (idx === undefined) {
          warnings.push(`${key}: unknown stop ${st.stop_id}`);
          continue;
        }
        stopIdxs.push(idx);
        if (!stopsOut[idx].ln.includes(r.route_id)) stopsOut[idx].ln.push(r.route_id);
      }
      if (stopIdxs.length < 2) {
        warnings.push(`${key}: fewer than 2 stops — skipping variant`);
        continue;
      }

      // cumulative travel time from the first stop, median across pattern trips
      const hopSecs = [];
      for (let hop = 0; hop < modalCount - 1; hop++) {
        const samples = [];
        for (const t of patternTrips) {
          const sts = timesByTrip.get(t.trip_id);
          try {
            const a = toSeconds(sts[hop].departure_time || sts[hop].arrival_time);
            const b = toSeconds(sts[hop + 1].arrival_time || sts[hop + 1].departure_time);
            if (b >= a) samples.push(b - a);
          } catch {
            /* missing times on this trip — skip sample */
          }
        }
        hopSecs.push(median(samples) ?? 0);
      }
      const cum = [0];
      for (const hop of hopSecs) cum.push(cum[cum.length - 1] + hop);

      // headway bands from frequencies.txt (best/lowest per band)
      const head = {};
      for (const f of frequencies) {
        if (!dTrips.some((t) => t.trip_id === f.trip_id)) continue;
        const band = headwayBand(toSeconds(f.start_time));
        const secs = +f.headway_secs;
        if (!head[band] || secs < head[band]) head[band] = secs;
      }

      variants.push({
        dir,
        shape: shape.map((p) => [
          Math.round(p.lat * 1e5) / 1e5,
          Math.round(p.lng * 1e5) / 1e5,
        ]),
        lenM,
        fare: fareFor(lenM, r.route_id),
        head,
        stops: stopIdxs,
        cum,
      });
      variantCount++;
    }

    if (variants.length === 0) {
      warnings.push(`${r.route_id}: no usable variants — skipping line`);
      continue;
    }
    linesOut.push({
      id: r.route_id,
      code: r.route_short_name,
      name: r.route_long_name,
      agency: r.agency_id,
      v: variants,
    });
  }

  // ---- prune stops that ended up unserved
  const servedStops = stopsOut.filter((s) => s.ln.length > 0);
  const remap = new Map();
  servedStops.forEach((s, i) => remap.set(s.i, i));
  for (const line of linesOut) {
    for (const v of line.v) {
      v.stops = v.stops.map((old) => remap.get(stopsOut[old].i));
      // `stops` references the global index — remap to the pruned one
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      url: "https://gitlab.com/digitaltransport/data/africa/kampala",
      publisher: "MapUganda & Transport for Cairo",
      license: "CC-BY-3.0",
      feedVersion: feedInfo.feed_version || "unknown",
      vintage: "Fieldwork 2019/2020 — verify critical trips on the ground",
    },
    serviceAssumption:
      "Fully frequency-based feed; headway bands treated as always-valid regardless of calendar dates.",
    faresNote: "Distance-tiered estimates from public knowledge — validate before trusting.",
    stops: servedStops,
    lines: linesOut,
  };

  // ---- validation gates
  const errors = [];
  for (const line of linesOut) {
    for (const v of line.v) {
      if (v.stops.length !== v.cum.length) errors.push(`${line.id}|${v.dir}: stops/cum length mismatch`);
      if (v.stops.length < 2) errors.push(`${line.id}|${v.dir}: <2 stops`);
      if (v.shape.length < 2) errors.push(`${line.id}|${v.dir}: degenerate shape`);
      if (v.stops.some((s) => s === undefined)) errors.push(`${line.id}|${v.dir}: unmapped stop`);
    }
  }
  if (errors.length) {
    console.error("VALIDATION FAILED:\n" + errors.join("\n"));
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(out);
  fs.writeFileSync(OUT_PATH, json);

  const kb = (n) => (n / 1024).toFixed(0);
  console.log(`\nlines: ${linesOut.length} (${linesOut.filter((l) => l.agency === "taxi").length} taxi / ${linesOut.filter((l) => l.agency === "bus").length} bus)`);
  console.log(`variants: ${variantCount}, stops served: ${servedStops.length}`);
  console.log(`shape points: ${rawPts} raw → ${keptPts} kept @${SHAPE_TOL_M}m`);
  console.log(`wrote ${OUT_PATH}`);
  console.log(`size: ${kb(json.length)} KB raw`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warnings:`);
    warnings.slice(0, 10).forEach((w) => console.log("  - " + w));
    if (warnings.length > 10) console.log(`  … and ${warnings.length - 10} more`);
  }
}

main();
