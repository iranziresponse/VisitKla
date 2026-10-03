#!/usr/bin/env node
/**
 * fetch-gtfs.js — download (or reuse) the Kampala GTFS feed and unpack it.
 *
 * Zero-dependency by design: Node built-ins only, including a minimal ZIP
 * reader, so `npm run fetch` works the same on Linux, macOS and Windows
 * without shelling out to an `unzip` binary or adding any package.
 *
 * Output: .cache/kampala-gtfs.zip + .cache/gtfs/*.txt
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const ZIP_PATH = path.join(CACHE, "kampala-gtfs.zip");
const GTFS_DIR = path.join(CACHE, "gtfs");
const source = require(path.join(ROOT, "config", "source.json"));

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function download(url) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Minimal ZIP extractor: central directory → inflateRaw per entry. */
function extractZip(buf, outDir) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no end-of-central-directory record)");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const files = [];

  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error(`Bad central directory entry at ${ptr}`);
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory entry
    // Local header: sizes there can differ from the CD's, so derive the
    // data start from the local header's own name/extra lengths.
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    files.push({ name, data });
  }

  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    const dest = path.join(outDir, f.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.data);
  }
  return files.map((f) => f.name);
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });

  let zipBuf;
  if (fs.existsSync(ZIP_PATH)) {
    zipBuf = fs.readFileSync(ZIP_PATH);
    const existing = sha256(zipBuf);
    if (source.sha256 !== "TO_BE_FILLED_BY_FIRST_RUN" && existing !== source.sha256) {
      console.log("Cached zip does not match the pinned sha256 — re-downloading.");
      zipBuf = await download(source.url);
    }
  } else {
    zipBuf = await download(source.url);
  }

  if (zipBuf.length < source.minBytes) {
    throw new Error(`Downloaded zip is suspiciously small (${zipBuf.length} bytes)`);
  }
  if (zipBuf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("Downloaded file is not a ZIP archive");
  }

  const hash = sha256(zipBuf);
  const isFreshDownload = !fs.existsSync(ZIP_PATH);
  fs.writeFileSync(ZIP_PATH, zipBuf);
  console.log(`zip: ${(zipBuf.length / 1024 / 1024).toFixed(2)} MB, sha256 ${hash}`);
  if (source.sha256 === "TO_BE_FILLED_BY_FIRST_RUN") {
    source.sha256 = hash;
    fs.writeFileSync(path.join(ROOT, "config", "source.json"), JSON.stringify(source, null, 2) + "\n");
    console.log("Pinned this first-run hash into config/source.json.");
  } else if (hash !== source.sha256) {
    console.warn(`WARNING: sha256 differs from the pinned hash (${source.sha256}).`);
    console.warn("Upstream data changed — review it, then update config/source.json.");
  }

  if (isFreshDownload || !fs.existsSync(GTFS_DIR)) {
    const names = extractZip(zipBuf, GTFS_DIR);
    console.log(`Extracted ${names.length} files to .cache/gtfs: ${names.join(", ")}`);
  } else {
    console.log("Reusing existing .cache/gtfs extraction.");
  }
  console.log("OK");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
