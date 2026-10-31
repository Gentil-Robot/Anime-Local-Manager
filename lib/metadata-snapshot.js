"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
function inspectSnapshot(file, manifest = null) {
  const buffer=fs.readFileSync(file);
  if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) throw new Error("Snapshot is not gzip");
  const text=zlib.gunzipSync(buffer,{maxOutputLength:256*1024*1024}).toString("utf8");
  if (!/ALM-METADATA-SCHEMA:\s*v2/i.test(text)) throw new Error("Unsupported metadata schema");
  const ids=[...text.matchAll(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+metadata\b[^\n]*?VALUES\s*\((\d+),/gi)].map(m=>m[1]);
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Empty snapshot or duplicate MAL ids");
  const sha256=crypto.createHash("sha256").update(buffer).digest("hex");
  const full=manifest?.full;
  if (full) {
    if (Number(full.rows)!==ids.length) throw new Error("Snapshot row count differs from manifest");
    if (Number(full.sizeBytes)!==buffer.length) throw new Error("Snapshot size differs from manifest");
    if (String(full.sha256)!==sha256) throw new Error("Snapshot checksum differs from manifest");
    if (path.basename(file)!==full.url) throw new Error("Snapshot filename differs from manifest");
  }
  return {rows:ids.length,sizeBytes:buffer.length,sha256};
}
function validateJikanPage(payload, page) {
  if (!payload || !Array.isArray(payload.data) || typeof payload.pagination?.has_next_page !== "boolean") {
    throw new Error(`Invalid Jikan page ${page}: missing data/pagination`);
  }
  if (!payload.data.length) throw new Error(`Empty Jikan page ${page}: refusing a truncated snapshot`);
  const current=Number(payload.pagination.current_page || page);
  if (current!==page) throw new Error(`Wrong Jikan page: ${current}, expected ${page}`);
  for (const row of payload.data) {
    if (!Number.isInteger(row?.mal_id) || row.mal_id<1 || typeof row.title!=="string" || !row.title.trim()) {
      throw new Error(`Invalid anime row on Jikan page ${page}`);
    }
  }
  return payload;
}
function checkSnapshotShrink(before, after, allow=false) {
  if (!allow && before > 0 && after < before*.9) throw new Error(`Suspicious snapshot shrink: ${before} -> ${after}. Existing snapshot retained. Review source data before ALM_METADATA_ALLOW_SHRINK=1.`);
}
module.exports={inspectSnapshot,validateJikanPage,checkSnapshotShrink};
