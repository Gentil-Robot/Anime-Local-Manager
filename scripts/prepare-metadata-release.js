#!/usr/bin/env node
"use strict";

/**
 * Prépare une release vraiment autonome.
 *
 * Objectif : ne jamais créer un paquet Electron public sans snapshot metadata embarqué.
 * - Si data/database/metadata-full.sql.gz existe déjà, le build l'utilise.
 * - Sinon, le script restaure une copie locale vérifiée, sans API publique.
 * - Ensuite il écrit/actualise metadata-manifest.json pour que le snapshot soit packagé.
 *
 * Ce script est appelé par les .bat, par npm run build, npm run build-installer,
 * et par le hook electron-builder beforePack. Les utilisateurs finaux de l’application
 * n'exécutent jamais ce script : ils reçoivent seulement le snapshot déjà inclus.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATABASE_DIR = path.join(PROJECT_ROOT, "data", "database");
const PREPARE_BUILD = require("./prepare-metadata-build.js");

const MIN_RELEASE_ROWS = Math.max(1, Number(process.env.ALM_METADATA_RELEASE_MIN_ROWS || 10000) || 10000);
const ALLOW_SEED_RELEASE = process.env.ALM_METADATA_ALLOW_SEED_RELEASE === "1";
const SKIP_GENERATION = process.env.ALM_METADATA_SKIP_GENERATION === "1" || process.env.ALM_METADATA_RELEASE_SKIP_GENERATION === "1";

const FULL_SNAPSHOT_CANDIDATES = [
  "metadata-full.sql.gz",
  "metadata-full.sql",
  "metadata-snapshot.sql.gz",
  "metadata-snapshot.sql"
].map(name => path.join(DATABASE_DIR, name));

const SEED_FALLBACK_CANDIDATES = [
  "metadata-seed.sql.gz",
  "metadata-seed.sql",
  "metadata.json.gz",
  "metadata.json"
].map(name => path.join(DATABASE_DIR, name));

function log(message) {
  console.log(`[metadata-release] ${message}`);
}

function warn(message) {
  console.warn(`[metadata-release] ${message}`);
}

function countRows(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const build = require("./prepare-metadata-build.js");
    if (typeof build.countRowsInSnapshot === "function") return build.countRowsInSnapshot(filePath);
  } catch {}
  return 0;
}

function snapshotInfo(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) return null;
  return {
    file: filePath,
    rows: countRows(filePath),
    size: stat.size
  };
}

function findUsableSnapshot(candidates, minRows) {
  for (const file of candidates) {
    const info = snapshotInfo(file);
    if (!info) continue;
    if (info.rows >= minRows) return info;
    warn(`${path.relative(PROJECT_ROOT, file)} existe mais semble incomplet (${info.rows || "?"}/${minRows} lignes).`);
  }
  return null;
}

function runFullGeneration() {
  const script = path.join("scripts", "metadata-maintenance.js");
  const env = {
    ...process.env,
    ALM_METADATA_FULL: "1",
    ALM_METADATA_MIN_COUNT: String(Math.max(1, MIN_RELEASE_ROWS)),
    ALM_METADATA_REQUEST_DELAY_MS: process.env.ALM_METADATA_REQUEST_DELAY_MS || "2500",
    ALM_METADATA_REQUEST_JITTER_MS: process.env.ALM_METADATA_REQUEST_JITTER_MS || "350",
    ALM_METADATA_MAX_RETRIES: process.env.ALM_METADATA_MAX_RETRIES || "8",
    ALM_METADATA_RATE_LIMIT_BACKOFF_MS: process.env.ALM_METADATA_RATE_LIMIT_BACKOFF_MS || "45000"
  };

  log("Snapshot absent : recherche d’une copie locale vérifiée, sans accès réseau.");
  log("Le cache de reprise et la collection ne sont pas modifiés.");

  const result = spawnSync(process.execPath, [script, "--full"], {
    cwd: PROJECT_ROOT,
    env,
    stdio: "inherit",
    shell: false
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`génération du snapshot complet échouée, code ${result.status}`);
}

async function prepareMetadataRelease() {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });

  let snapshot = findUsableSnapshot(FULL_SNAPSHOT_CANDIDATES, MIN_RELEASE_ROWS);
  if (snapshot) {
    log(`Snapshot complet embarquable trouvé : ${path.relative(PROJECT_ROOT, snapshot.file)} (${snapshot.rows} fiches).`);
  } else if (ALLOW_SEED_RELEASE) {
    snapshot = findUsableSnapshot(SEED_FALLBACK_CANDIDATES, MIN_RELEASE_ROWS);
    if (snapshot) {
      warn(`Mode ALM_METADATA_ALLOW_SEED_RELEASE=1 : release avec seed non-complet ${path.relative(PROJECT_ROOT, snapshot.file)} (${snapshot.rows} fiches).`);
    }
  }

  if (!snapshot) {
    if (SKIP_GENERATION) {
      throw new Error("snapshot metadata complet absent et génération désactivée. Impossible de produire une release autonome.");
    }
    runFullGeneration();
    snapshot = findUsableSnapshot(FULL_SNAPSHOT_CANDIDATES, MIN_RELEASE_ROWS);
  }

  if (!snapshot) {
    throw new Error(`aucun snapshot metadata embarquable trouvé après génération. Attendu dans data/database/metadata-full.sql.gz avec au moins ${MIN_RELEASE_ROWS} fiches.`);
  }

  const buildResult = await PREPARE_BUILD.prepareMetadataBuild({
    requireSnapshot: true,
    requireFull: !ALLOW_SEED_RELEASE,
    minRows: MIN_RELEASE_ROWS
  });
  log("Release autonome prête : le snapshot metadata sera inclus dans le paquet Windows ou Linux.");
  return { ok: true, snapshot: path.basename(snapshot.file), rows: snapshot.rows, buildResult };
}

async function beforePackHook() {
  require("./ensure-asar-finished.js").ensureAsarFinished();
  await prepareMetadataRelease();
}

// CommonJS pour electron-builder 24, plus export default explicite pour les
// versions récentes : le même hook reste utilisable sans modifier la config.
module.exports = beforePackHook;
module.exports.default = beforePackHook;
module.exports.prepareMetadataRelease = prepareMetadataRelease;

if (require.main === module) {
  prepareMetadataRelease().catch(error => {
    console.error(`[metadata-release] ERREUR: ${error.message}`);
    process.exitCode = 1;
  });
}
