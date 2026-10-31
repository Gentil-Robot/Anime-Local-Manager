#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alm-beta26-overflow-"));
const dataDir = path.join(temporaryRoot, "data");
const imagesDir = path.join(temporaryRoot, "images");
fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "animes.json"), "[]", "utf8");
fs.writeFileSync(path.join(dataDir, "media-review.json"), JSON.stringify({ version: 3, pendingImports: [], quarantined: [], analysis: {} }), "utf8");

process.env.ALM_DATA_DIR = dataDir;
process.env.ALM_IMAGES_DIR = imagesDir;
process.env.ALM_METADATA_REMOTE_URL = "";
process.env.ALM_METADATA_AUTONOMOUS_URL = "";

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

global.fetch = async () => { throw new Error("network disabled in overflow test"); };

(async () => {
  try {
    const server = require(path.join(ROOT, "server.js"));
    const { __test } = server;

    // Un compteur cumulatif ne prouve pas l'existence ni l'identité de S2.
    const expanded = await __test.expandBetaSeriesProgressItems([{
      source: "BetaSeries", sourceTitle: "HELL MODE", classification: "anime",
      row: { id: "hell-mode", title: "HELL MODE", episode: "S01E19", remaining: "5", status: "58" },
      found: { title: "HELL MODE", officialTitle: "HELL MODE", type: "TV", episodesTotal: "12", genres: ["Fantasy"] },
      anime: { title: "HELL MODE", type: "TV", episodesTotal: "12", episodesSeen: "19", status: "Watching", tags: ["BetaSeries"], mediaKind: "anime", verifiedAnime: true }
    }], { boundedNetwork: true, networkBudgetMs: 1, jikanFallbackLimit: 0 });
    assert.strictEqual(expanded.length, 1, JSON.stringify(expanded));
    const s1 = expanded[0];
    assert.strictEqual(s1.anime.episodesSeen, "12");
    assert.strictEqual(s1.anime.episodesTotal, "12");
    assert.strictEqual(s1.anime.status, "Completed");
    assert.strictEqual(s1.anime.unallocatedEpisodes, 7);
    assert.strictEqual(s1.anime.betaseriesEpisode, "S01E19");
    assert(s1.anime.needsSequelCheck);

    // Migration d'une bibliothèque déjà touchée par la Beta 25.
    const oldWarning = "Progression corrigée automatiquement : BetaSeries indiquait 19/12. La fiche est passée en 12/12. 7 épisode(s) sont probablement une suite.";
    const repaired = __test.repairAnimeLibrary([{
      id: 1,
      title: "HELL MODE",
      status: "Completed",
      episodesSeen: "12",
      episodesTotal: "12",
      type: "TV",
      genres: ["Fantasy"],
      tags: ["BetaSeries", "suite probable"],
      notes: `${oldWarning}\n${oldWarning}`,
      betaseriesOverflowEpisodes: 7,
      betaseriesOriginalProgress: "19/12",
      needsSequelCheck: true,
      progressWarning: "Progression corrigée : suite probable."
    }]);

    assert.strictEqual(repaired.items.length, 1, JSON.stringify(repaired.items));
    const repairedS1 = repaired.items[0];
    assert.strictEqual(repairedS1.episodesSeen, "12");
    assert.strictEqual(repairedS1.status, "Completed");
    assert.strictEqual(repairedS1.betaseriesOverflowEpisodes, 0);
    assert.strictEqual(repairedS1.unallocatedEpisodes, 7);
    assert(!String(repairedS1.notes || "").includes(oldWarning), repairedS1.notes);
    assert.strictEqual(__test.repairAnimeLibrary(repaired.items).changed, false);

    // Vérifie aussi le vrai chemin de migration au chargement de la bibliothèque :
    // GET /api/animes doit persister les épisodes non rattachés sans saison inventée.
    fs.writeFileSync(path.join(dataDir, "animes.json"), JSON.stringify([{
      id: 1, title: "HELL MODE", status: "Completed", episodesSeen: "12", episodesTotal: "12", type: "TV",
      genres: ["Fantasy"], tags: ["BetaSeries", "suite probable"], notes: `${oldWarning}\n${oldWarning}`,
      betaseriesOverflowEpisodes: 7, betaseriesOriginalProgress: "19/12", needsSequelCheck: true,
      progressWarning: "Progression corrigée : suite probable."
    }], null, 2), "utf8");
    const getRoute = server.app._routes.find(item => item.method === "get" && item.route === "/api/animes");
    assert(getRoute, "GET /api/animes absent");
    let payload = null;
    const res = { json(value) { payload = value; return this; }, status() { return this; }, send(value) { payload = value; return this; } };
    await getRoute.handlers.at(-1)({ body: {}, params: {}, query: {}, headers: {} }, res);
    assert(Array.isArray(payload) && payload.length === 1, JSON.stringify(payload));
    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "animes.json"), "utf8"));
    assert.strictEqual(persisted.length, 1, JSON.stringify(persisted));
    assert.strictEqual(persisted[0].unallocatedEpisodes, 7);
    assert.strictEqual(persisted[0].episodesSeen, "12");
    assert.strictEqual(persisted[0].episodesTotal, "12");
    assert.strictEqual(persisted[0].status, "Completed");

    console.log("OK Beta 26 overflow : HELL MODE 19/12 => S1 12/12 terminée + 7 épisodes non répartis, aucune saison inventée, migration persistée et avertissement dédupliqué.");
  } finally {
    Module._load = originalLoad;
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
  }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
