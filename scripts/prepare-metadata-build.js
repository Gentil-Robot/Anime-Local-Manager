#!/usr/bin/env node
"use strict";

/**
 * Vérifie et prépare le snapshot metadata embarqué dans l’application Electron.
 *
 * Ce script ne contacte jamais Jikan/MyAnimeList. Son rôle est de garantir que
 * le build distribué contient réellement une base metadata locale prête à être
 * importée au premier lancement.
 *
 * Par défaut, l'absence de snapshot bloque le build afin d'éviter de publier un
 * installateur vide. Pour un build de développement sans metadata, lancer avec :
 *   ALM_METADATA_ALLOW_EMPTY_BUILD=1 npm run build
 * ou :
 *   node scripts/prepare-metadata-build.js --allow-empty
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { atomicJson } = require("../lib/atomic-file");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATABASE_DIR = path.join(PROJECT_ROOT, "data", "database");
const OUTPUT_MANIFEST = path.join(DATABASE_DIR, "metadata-manifest.json");
const OUTPUT_STATUS = path.join(DATABASE_DIR, "metadata-bundled-status.json");

const argv = new Set(process.argv.slice(2));
const ALLOW_EMPTY = argv.has("--allow-empty") || process.env.ALM_METADATA_ALLOW_EMPTY_BUILD === "1";
const REQUIRE_SNAPSHOT = !ALLOW_EMPTY && process.env.ALM_METADATA_REQUIRE_SNAPSHOT !== "0";
const REQUIRE_FULL = argv.has("--require-full") || process.env.ALM_METADATA_REQUIRE_FULL === "1";
const MIN_ROWS = Math.max(1, Number(process.env.ALM_METADATA_MIN_BUNDLED_ROWS || process.env.ALM_METADATA_MIN_ROWS || 1) || 1);

const FULL_SNAPSHOT_CANDIDATES = [
  "metadata-full.sql.gz",
  "metadata-full.sql",
  "metadata-snapshot.sql.gz",
  "metadata-snapshot.sql"
].map(name => path.join(DATABASE_DIR, name));

const FALLBACK_SNAPSHOT_CANDIDATES = [
  "metadata-seed.sql.gz",
  "metadata-seed.sql",
  "metadata.json.gz",
  "metadata.json"
].map(name => path.join(DATABASE_DIR, name));

const SNAPSHOT_CANDIDATES = [...FULL_SNAPSHOT_CANDIDATES, ...FALLBACK_SNAPSHOT_CANDIDATES];

function log(message) {
  console.log(`[metadata-build] ${message}`);
}

function warn(message) {
  console.warn(`[metadata-build] ${message}`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readMaybeGzip(filePath) {
  const buffer = fs.readFileSync(filePath);
  const isGzip = filePath.toLowerCase().endsWith(".gz") || (buffer[0] === 0x1f && buffer[1] === 0x8b);
  return (isGzip ? zlib.gunzipSync(buffer) : buffer).toString("utf8").replace(/^\uFEFF/, "");
}

function jsonRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.items && typeof payload.items === "object") return Object.values(payload.items);
  return [];
}

function isCompatibleSqlSnapshot(text) {
  // Snapshot SQL v2 uniquement : évite de réutiliser les anciens fichiers qui
  // pouvaient être incomplets ou incompatibles avec le schéma enrichi.
  return /ALM-METADATA-SCHEMA:\s*v2/i.test(String(text || ""));
}

function countRowsInSnapshot(filePath) {
  try {
    const text = readMaybeGzip(filePath).trim();
    if (!text) return 0;

    if (/\.json(\.gz)?$/i.test(filePath)) {
      return jsonRowsFromPayload(JSON.parse(text)).length;
    }

    if (!isCompatibleSqlSnapshot(text)) return 0;

    const oneInsertPerRow = text.match(/\bINSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+metadata\b/gi);
    if (oneInsertPerRow?.length) return oneInsertPerRow.length;

    const valuesBlocks = text.match(/\)\s*,\s*\(/g);
    if (valuesBlocks?.length) return valuesBlocks.length + 1;
  } catch (error) {
    warn(`Impossible de compter ${path.basename(filePath)} : ${error.message}`);
  }
  return 0;
}

function findSnapshot(options = {}) {
  const candidates = options.requireFull === true ? FULL_SNAPSHOT_CANDIDATES : SNAPSHOT_CANDIDATES;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 0) continue;
    return { file, stat, rows: countRowsInSnapshot(file), sha256: sha256File(file) };
  }
  return null;
}

function writeLocalManifest(snapshot) {
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(OUTPUT_MANIFEST, "utf8")); } catch {}
  const unchanged = previous?.full?.sha256 === snapshot.sha256;
  const relative = path.relative(DATABASE_DIR, snapshot.file).replace(/\\/g, "/");
  const isGzip = snapshot.file.toLowerCase().endsWith(".gz");
  const manifest = {
    schemaVersion: 1,
    mode: "bundled-snapshot",
    version: `bundled-${path.basename(snapshot.file)}-${snapshot.rows || 0}-${snapshot.sha256.slice(0, 12)}`,
    generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(),
    packagedAt: new Date().toISOString(),
    source: "metadata snapshot bundled inside Anime Local Manager application package",
    distribution: {
      embedded: true,
      offlineFirst: true,
      requiresBetaSeriesToken: false,
      requiresRemoteDownload: false
    },
    full: {
      url: relative,
      rows: snapshot.rows || 0,
      sizeBytes: snapshot.stat.size,
      sha256: snapshot.sha256,
      compression: isGzip ? "gzip" : "none"
    },
    deltas: []
  };
  atomicJson(OUTPUT_MANIFEST, manifest);
  return manifest;
}

function writeBundledStatus(snapshot, manifest) {
  const status = {
    ok: true,
    embedded: true,
    offlineFirst: true,
    generatedAt: new Date().toISOString(),
    snapshot: path.basename(snapshot.file),
    rows: snapshot.rows || 0,
    sizeBytes: snapshot.stat.size,
    sha256: snapshot.sha256,
    manifest: path.basename(OUTPUT_MANIFEST),
    manifestVersion: manifest.version,
    note: "Ce snapshot est inclus dans le paquet Electron Windows/Linux. Les utilisateurs finaux n’ont rien à télécharger ni configurer."
  };
  atomicJson(OUTPUT_STATUS, status);
  return status;
}

function missingSnapshotMessage(options = {}) {
  const expected = options.requireFull === true
    ? "metadata-full.sql.gz, metadata-full.sql, metadata-snapshot.sql.gz ou metadata-snapshot.sql"
    : "metadata-full.sql.gz, metadata-full.sql, metadata-seed.sql.gz ou metadata.json.gz";
  return [
    "Aucun snapshot metadata local n'a été trouvé dans data/database/.",
    "Le build a été arrêté pour éviter de publier un paquet sans base metadata embarquée.",
    "Action recommandée : lance d’abord « npm run metadata:full » ou le script de génération metadata fourni pour ton système.",
    `Fichiers attendus : ${expected}.`,
    "Pour un build de développement vide seulement : ALM_METADATA_ALLOW_EMPTY_BUILD=1 npm run build."
  ].join("\n");
}

async function prepareMetadataBuild(options = {}) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
  const requireSnapshot = Object.prototype.hasOwnProperty.call(options, "requireSnapshot") ? options.requireSnapshot === true : REQUIRE_SNAPSHOT;
  const requireFull = Object.prototype.hasOwnProperty.call(options, "requireFull") ? options.requireFull === true : REQUIRE_FULL;
  const minRows = Math.max(1, Number(options.minRows || MIN_ROWS) || 1);
  const snapshot = findSnapshot({ requireFull });

  if (!snapshot) {
    if (requireSnapshot) throw new Error(missingSnapshotMessage({ requireFull }));
    warn("Aucun snapshot metadata local trouvé. Build autorisé car ALM_METADATA_ALLOW_EMPTY_BUILD=1.");
    return { ok: true, skipped: true, embedded: false, reason: "no-local-snapshot" };
  }

  if ((snapshot.rows || 0) < minRows) {
    throw new Error(`Snapshot metadata insuffisant : ${path.basename(snapshot.file)} contient ${snapshot.rows || 0}/${minRows} fiche(s).`);
  }

  const manifest = writeLocalManifest(snapshot);
  const status = writeBundledStatus(snapshot, manifest);
  log(`Snapshot EMBARQUÉ prêt : data/database/${path.basename(snapshot.file)} (${snapshot.rows || "?"} fiches, ${(snapshot.stat.size / 1024 / 1024).toFixed(2)} Mo).`);
  log("Aucune requête Jikan/MAL pendant ce build : l’application utilisera le snapshot inclus au premier lancement.");
  return {
    ok: true,
    embedded: true,
    snapshot: path.basename(snapshot.file),
    rows: snapshot.rows,
    sizeBytes: snapshot.stat.size,
    sha256: snapshot.sha256,
    manifestVersion: manifest.version,
    status
  };
}

module.exports = async function beforePackHook() {
  await prepareMetadataBuild();
};
module.exports.prepareMetadataBuild = prepareMetadataBuild;
module.exports.countRowsInSnapshot = countRowsInSnapshot;
module.exports.findSnapshot = findSnapshot;

if (require.main === module) {
  prepareMetadataBuild().catch(error => {
    console.error(`[metadata-build] ERREUR: ${error.message}`);
    process.exitCode = 1;
  });
}
