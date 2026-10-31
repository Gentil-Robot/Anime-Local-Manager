#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "alm-csv-import-progress-"));
const dataDir = path.join(root, "data");
const imagesDir = path.join(root, "images");
fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "animes.json"), "[]", "utf8");
fs.writeFileSync(path.join(dataDir, "media-review.json"), JSON.stringify({ version: 3, pendingImports: [], quarantined: [], analysis: {} }), "utf8");

process.env.ALM_DATA_DIR = dataDir;
process.env.ALM_IMAGES_DIR = imagesDir;
process.env.ALM_METADATA_REMOTE_URL = "";
process.env.ALM_METADATA_AUTONOMOUS_URL = "";
// Le test reproduit un AniList qui ne répond jamais. En production les valeurs
// par défaut sont 24 s de budget global et 6,5 s par lot ; ici on raccourcit
// volontairement pour valider le garde-fou sans ralentir la suite de tests.
process.env.ALM_BETASERIES_IMPORT_NETWORK_BUDGET_MS = "350";
process.env.ALM_BETASERIES_IMPORT_ANILIST_TIMEOUT_MS = "250";

function expressStub() {
  const routes = [];
  const app = { _routes: routes, use() { return app; }, listen() { throw new Error("no listen"); } };
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    app[method] = (route, ...handlers) => { routes.push({ method, route, handlers }); return app; };
  }
  return app;
}
expressStub.json = () => function jsonMiddleware() {};
expressStub.static = () => function staticMiddleware() {};
function multerStub() { return { single() { return function uploadMiddleware(req, res, next) { if (next) next(); }; } }; }
multerStub.memoryStorage = () => ({});

process.env.ALM_SQLJS_ONLY = "1"; // Explicitly exercise the JSON rescue path, including runtimes with node:sqlite.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "express") return expressStub;
  if (request === "multer") return multerStub;
  if (request === "sql.js") throw new Error("sql.js intentionally unavailable");
  return originalLoad.call(this, request, parent, isMain);
};

const fetchUrls = [];
const abortedRequests = [];
global.fetch = (url, options = {}) => {
  fetchUrls.push(String(url));
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const abort = () => {
      abortedRequests.push({url:String(url), elapsed:performance.now()-startedAt});
      const error = new Error("aborted by test timeout");
      error.name = "AbortError";
      reject(error);
    };
    if (options.signal?.aborted) return abort();
    options.signal?.addEventListener?.("abort", abort, { once: true });
    // Sans AbortSignal, on simule volontairement une requête qui ne répond pas.
  });
};

function responseCapture() {
  return {
    statusCode: 200,
    payload: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
    end() { return this; },
    setHeader() {}
  };
}

function buildSelected(count, prefix) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const title = `${prefix} ${n}`;
    const malId = String(10000 + n + (prefix === "Cancel Anime" ? 1000 : 0));
    return {
      source: "BetaSeries",
      sourceTitle: title,
      classification: "anime",
      reason: "Test anime confirmé",
      row: { id: `${prefix}-${n}`, title, episode: "S02E02", remaining: "10", status: "20" },
      found: { title, officialTitle: title, malId, type: "TV", episodesTotal: "12", startDate: "2024-01-01", genres: ["Fantasy"], source: "LocalMetadata" },
      anime: { title, malId, type: "TV", episodesTotal: "12", status: "Watching", episodesSeen: "2", tags: ["BetaSeries"], mediaKind: "anime", verifiedAnime: true }
    };
  });
}

(async () => {
  try {
    const server = require(path.join(ROOT, "server.js"));
    const find = (method, route) => server.app._routes.find(item => item.method === method && item.route === route);
    const importRoute = find("post", "/api/import/csv");
    const cancelRoute = find("post", "/api/import/csv/cancel/:id");
    const progressRoute = find("get", "/api/import/csv/progress/:id");
    assert(importRoute && cancelRoute && progressRoute, "routes CSV manquantes");

    const progressId = "bounded-import-test";
    const selected = buildSelected(296, "Slow Anime");
    const req = { body: { progressId, overwrite: false, items: selected } };
    const res = responseCapture();
    const startedAt = Date.now();
    await importRoute.handlers.at(-1)(req, res);
    const elapsed = Date.now() - startedAt;

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.payload));
    assert.strictEqual(res.payload?.ok, true, JSON.stringify(res.payload));
    assert.strictEqual(res.payload?.cancelled, undefined, JSON.stringify(res.payload));
    assert.strictEqual(res.payload?.added, 592, JSON.stringify(res.payload));
    assert.strictEqual(res.payload?.progressionToReview, 296, JSON.stringify(res.payload));
    // Le budget réseau doit tenir indépendamment du coût d'écriture de 592
    // fiches JSON, qui varie avec le disque et la charge du runner.
    assert(abortedRequests.length > 0, "aucune requête suspendue n'a été annulée");
    assert(abortedRequests.every(request => request.elapsed < 1500), `attente réseau non bornée: ${JSON.stringify(abortedRequests)}`);
    assert(elapsed < 15000, `import local borné trop lent: ${elapsed} ms`);
    assert(fetchUrls.some(url => url.includes("graphql.anilist.co")), "AniList groupé non sollicité");
    assert(!fetchUrls.some(url => url.includes("api.jikan.moe")), "repli Jikan individuel déclenché pendant l'import borné");

    const progressRes = responseCapture();
    progressRoute.handlers.at(-1)({ params: { id: progressId } }, progressRes);
    assert.strictEqual(progressRes.payload?.status, "done", JSON.stringify(progressRes.payload));
    assert.strictEqual(Number(progressRes.payload?.percent), 100, JSON.stringify(progressRes.payload));
    assert(/Import terminé/i.test(progressRes.payload?.current || ""), JSON.stringify(progressRes.payload));

    // Le même job doit être annulable avant la phase d'écriture. On vérifie que
    // l'annulation n'ajoute aucune fiche partielle à la bibliothèque.
    const cancelId = "cancel-import-test";
    const cancelSelected = buildSelected(60, "Cancel Anime");
    const cancelReq = { body: { progressId: cancelId, overwrite: false, items: cancelSelected } };
    const cancelRes = responseCapture();
    const importPromise = importRoute.handlers.at(-1)(cancelReq, cancelRes);
    await new Promise(resolve => setTimeout(resolve, 80));
    const cancelApiRes = responseCapture();
    const cancelStartedAt = Date.now();
    await cancelRoute.handlers.at(-1)({ params: { id: cancelId }, body: {} }, cancelApiRes);
    assert.strictEqual(cancelApiRes.payload?.cancelRequested, true, JSON.stringify(cancelApiRes.payload));
    await importPromise;
    const cancelElapsed = Date.now() - cancelStartedAt;
    assert(cancelElapsed < 1200, `annulation réseau trop lente: ${cancelElapsed} ms`);
    assert.strictEqual(cancelRes.payload?.cancelled, true, JSON.stringify(cancelRes.payload));

    const library = JSON.parse(fs.readFileSync(path.join(dataDir, "animes.json"), "utf8"));
    assert.strictEqual(library.length, 592, `annulation a écrit des fiches partielles: ${library.length}`);
    assert(!library.some(item => String(item.title || "").startsWith("Cancel Anime")), "une fiche annulée a été écrite");

    const cancelledProgress = responseCapture();
    progressRoute.handlers.at(-1)({ params: { id: cancelId } }, cancelledProgress);
    assert.strictEqual(cancelledProgress.payload?.status, "cancelled", JSON.stringify(cancelledProgress.payload));

    console.log(`CSV import progress runtime: OK (${elapsed} ms, ${fetchUrls.length} requête(s) simulée(s))`);
  } finally {
    Module._load = originalLoad;
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
