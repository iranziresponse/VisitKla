/** Shared GTFS parsing + geo helpers for the pipeline. Node built-ins only. */

/** Minimal GTFS CSV parser (handles quoted fields, CRLF, BOM). */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length && r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** "HH:MM:SS" (hours may exceed 23) → seconds since midnight. */
function toSeconds(t) {
  const parts = t.split(":");
  if (parts.length !== 3) throw new Error(`Bad GTFS time: "${t}"`);
  const [h, m, s] = parts.map(Number);
  if ([h, m, s].some((n) => Number.isNaN(n))) throw new Error(`Bad GTFS time: "${t}"`);
  return h * 3600 + m * 60 + s;
}

/** Haversine distance in meters. */
function haversine(a, b) {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lng - a.lng) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Polyline length in meters over {lat,lng} points. */
function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += haversine(pts[i - 1], pts[i]);
  return len;
}

/** Douglas-Peucker simplification with a tolerance in meters. */
function simplify(pts, tolM) {
  if (pts.length <= 2) return pts.slice();
  const mid = pts[Math.floor(pts.length / 2)];
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((mid.lat * Math.PI) / 180);
  const toPlane = (p) => ({ x: p.lng * mPerDegLon, y: p.lat * mPerDegLat });

  function dp(lo, hi, keep) {
    const A = toPlane(pts[lo]);
    const B = toPlane(pts[hi]);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const P = toPlane(pts[i]);
      let d;
      if (len2 === 0) {
        d = Math.hypot(P.x - A.x, P.y - A.y);
      } else {
        let t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolM) {
      keep.add(lo);
      keep.add(hi);
      dp(lo, idx, keep);
      dp(idx, hi, keep);
    } else {
      keep.add(lo);
      keep.add(hi);
    }
  }
  const keep = new Set();
  dp(0, pts.length - 1, keep);
  return pts.filter((_, i) => keep.has(i));
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

module.exports = { parseCsv, toSeconds, haversine, pathLength, simplify, median };
