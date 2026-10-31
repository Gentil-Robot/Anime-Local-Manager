#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "alm-core-regressions-"));
const dataDir = path.join(root, "data");
const imagesDir = path.join(root, "images");
fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "animes.json"), "[]", "utf8");
process.env.ALM_DATA_DIR = dataDir;
process.env.ALM_IMAGES_DIR = imagesDir;
process.env.ALM_METADATA_REMOTE_URL = "";
process.env.ALM_METADATA_AUTONOMOUS_URL = "";

function expressStub() {
  const routes = [];
  const app = { _routes: routes, use() { return app; }, listen() { throw new Error("no listen"); } };
  for (const method of ["get", "post", "put", "patch", "delete"]) app[method] = (route, ...handlers) => { routes.push({ method, route, handlers }); return app; };
  return app;
}
expressStub.json = () => function jsonMiddleware() {};
expressStub.static = () => function staticMiddleware() {};
function multerStub() { return { single() { return function middleware(req, res, next) { if (next) next(); }; } }; }
multerStub.memoryStorage = () => ({});
process.env.ALM_SQLJS_ONLY = "1"; // Explicitly exercise the JSON rescue path, including runtimes with node:sqlite.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "express") return expressStub;
  if (request === "multer") return multerStub;
  if (request === "sql.js") throw new Error("sql.js intentionally unavailable");
  return originalLoad.call(this, request, parent, isMain);
};
global.fetch = async () => { throw new Error("network disabled"); };

(async () => {
  try {
    const { __test } = require(path.join(ROOT, "server.js"));

    const base = {
      title: "Complete Test", malId: "123", type: "TV", status: "Completed",
      synopsis: "Un synopsis suffisamment long pour être considéré comme une vraie description complète de la série.",
      genres: ["Fantasy"], startDate: "2020-01-01", imageUrl: "/images/test.jpg",
      mediaKind: "anime", verifiedAnime: true
    };
    const missingEpisodes = __test.animeInfoCompleteness({ ...base, episodesTotal: "" });
    assert.strictEqual(missingEpisodes.complete, false);
    assert(missingEpisodes.missing.includes("nombre d'épisodes"));
    const complete = __test.animeFullCompleteness({ ...base, episodesTotal: "12" });
    assert.strictEqual(complete.complete, true, JSON.stringify(complete));

    const future = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const futureInfo = __test.animeInfoCompleteness({ ...base, status: "Plan to Watch", startDate: future, episodesTotal: "" });
    assert.strictEqual(futureInfo.complete, true, JSON.stringify(futureInfo));

    const manual = { title: "Dexter", mediaKind: "manual", manualLibraryChoice: true, type: "Scripted", tags: ["conservé manuellement"] };
    assert.strictEqual(__test.isAnimeFeatureEligible(manual), false);
    assert.strictEqual(__test.animeInfoCompleteness(manual).excluded, true);

    const stale = __test.mediaReviewFoundReliability("Avatar: The Last Airbender", {
      officialTitle: "Quanzhi Gaoshou Specials", malId: "12345", matchingScore: 100, source: "LocalMetadata"
    });
    assert.strictEqual(stale.reliable, false, JSON.stringify(stale));
    const translated = __test.mediaReviewFoundReliability("A Returner's Magic Should Be Special", {
      officialTitle: "Kikansha no Mahou wa Tokubetsu desu", englishTitle: "A Returner's Magic Should Be Special",
      malId: "54852", matchingScore: 100, source: "LocalMetadata", startDate: "2023-10-08"
    });
    assert.strictEqual(translated.reliable, true, JSON.stringify(translated));

    const progress = __test.seasonScanProgressPayload({
      status: "running", phase: "relations", startedAt: Date.now() - 5000, phaseStartedAt: Date.now() - 3000,
      total: 290, prepared: 145, relationBatchesDone: 2, relationBatchesTotal: 4, done: 0
    });
    assert.strictEqual(progress.phasePercent, 50);

    const merged = __test.mergeImportedAnime(
      { id: 1, title: "Season 2", status: "Plan to Watch", episodesSeen: "0", episodesTotal: "12", tags: [] },
      { title: "Season 2", status: "Watching", episodesSeen: "2", episodesTotal: "12", betaseriesSeriesId: "bs1", betaseriesEpisode: "S02E02", tags: ["BetaSeries"] },
      false
    );
    assert.strictEqual(merged.episodesSeen, "2");
    assert.strictEqual(merged.status, "Watching");
    assert(merged.tags.includes("BetaSeries"));

    console.log("Core regressions runtime: OK");
  } finally {
    Module._load = originalLoad;
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
