#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alm-beta-progress-"));
const dataDir = path.join(temporaryRoot, "data");
const imagesDir = path.join(temporaryRoot, "images");
fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "animes.json"), "[]", "utf8");
fs.writeFileSync(path.join(dataDir, "media-review.json"), JSON.stringify({ version: 3, pendingImports: [], quarantined: [], analysis: {} }), "utf8");

const now = new Date().toISOString();
fs.writeFileSync(path.join(dataDir, "cache", "betaseries-season-relations-v2.json"), JSON.stringify({
  "100": {
    updatedAt: now,
    source: "test",
    relations: [{ relation: "Sequel", entry: [{
      mal_id: 200, malId: 200, type: "anime", name: "Example Anime Season 2", title: "Example Anime Season 2",
      mediaType: "TV", episodesTotal: 12, startDate: "2025-01-01"
    }]}]
  },
  "200": {
    updatedAt: now,
    source: "test",
    relations: [{ relation: "Sequel", entry: [{
      mal_id: 300, malId: 300, type: "anime", name: "Example Anime Season 3", title: "Example Anime Season 3",
      mediaType: "TV", episodesTotal: 13, startDate: "2026-01-01"
    }]}]
  },
  "400": {
    updatedAt: now,
    source: "test",
    relations: [{ relation: "Sequel", entry: [{
      mal_id: 401, malId: 401, type: "anime", name: "Split Anime Part 2", title: "Split Anime Part 2",
      mediaType: "TV", episodesTotal: 12, startDate: "2025-07-01"
    }]}]
  }
}, null, 2));

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

global.fetch = async () => { throw new Error("network must not be used in cached runtime test"); };

(async () => {
  try {
    const { __test } = require(path.join(ROOT, "server.js"));
    const multi = await __test.expandBetaSeriesProgressItems([{
      source: "BetaSeries", sourceTitle: "Example Anime", classification: "anime",
      row: { id: "bs-1", title: "Example Anime", episode: "S02E02", remaining: "10", status: "20" },
      found: { title: "Example Anime", officialTitle: "Example Anime", malId: "100", type: "TV", episodesTotal: "12", startDate: "2024-01-01", genres: ["Fantasy"] },
      anime: { title: "Example Anime", malId: "100", type: "TV", episodesTotal: "12", status: "Watching", episodesSeen: "2", tags: ["BetaSeries"], mediaKind: "anime", verifiedAnime: true }
    }]);
    assert.strictEqual(multi.length, 2, JSON.stringify(multi));
    assert.strictEqual(multi[0].anime.episodesSeen, "12");
    assert.strictEqual(multi[0].anime.status, "Completed");
    assert.strictEqual(multi[1].anime.malId, "200");
    assert.strictEqual(multi[1].anime.episodesSeen, "2");
    assert.strictEqual(multi[1].anime.episodesTotal, "12");
    assert.strictEqual(multi[1].anime.status, "Watching");
    assert(!multi.some(item => /suite probable/i.test(item.anime?.title || "")), "fake sequel record created");

    const split = await __test.expandBetaSeriesProgressItems([{
      source: "BetaSeries", sourceTitle: "Split Anime", classification: "anime",
      row: { id: "bs-2", title: "Split Anime", episode: "S01E24", remaining: "1", status: "96" },
      found: { title: "Split Anime", officialTitle: "Split Anime", malId: "400", type: "TV", episodesTotal: "12", startDate: "2025-01-01" },
      anime: { title: "Split Anime", malId: "400", type: "TV", episodesTotal: "12", status: "Watching", episodesSeen: "24", tags: ["BetaSeries"], mediaKind: "anime", verifiedAnime: true }
    }]);
    assert.strictEqual(split.length, 2, JSON.stringify(split));
    assert.strictEqual(split[0].anime.episodesSeen, "12");
    assert.strictEqual(split[1].anime.episodesSeen, "12");
    assert.strictEqual(split[1].anime.malId, "401");
    assert(split.every(item => Number(item.anime.episodesSeen || 0) <= Number(item.anime.episodesTotal || Infinity)), "overflow remains");

    const missing = await __test.expandBetaSeriesProgressItems([{
      source: "BetaSeries", sourceTitle: "Unknown Chain", classification: "anime",
      row: { id: "bs-3", title: "Unknown Chain", episode: "S02E03", remaining: "9", status: "25" },
      found: { title: "Unknown Chain", officialTitle: "Unknown Chain", malId: "999", type: "TV", episodesTotal: "12" },
      anime: { title: "Unknown Chain", malId: "999", type: "TV", episodesTotal: "12", status: "Watching", episodesSeen: "3", tags: ["BetaSeries"], mediaKind: "anime", verifiedAnime: true }
    }]);
    assert.strictEqual(missing.length, 2, JSON.stringify(missing));
    assert.strictEqual(missing[0].anime.episodesSeen, "12");
    assert.strictEqual(missing[0].anime.status, "Completed");
    assert.strictEqual(missing[0].anime.needsSequelCheck, false);
    assert.strictEqual(missing[0].anime.progressWarning || "", "");
    assert.strictEqual(missing[1].anime.title, "Unknown Chain — Saison 2");
    assert.strictEqual(missing[1].anime.episodesSeen, "3");
    // BetaSeries remaining covers the show, not necessarily the active season.
    assert.strictEqual(missing[1].anime.episodesTotal, "");
    assert.strictEqual(missing[1].anime.betaseriesEpisode, "S02E03");
    assert.strictEqual(missing[1].anime.status, "Watching");
    assert.strictEqual(missing[1].anime.betaseriesSeason, 2);
    assert.strictEqual(missing[1].anime.needsSequelCheck, true);

    console.log("BetaSeries progress runtime: OK");
  } finally {
    Module._load = originalLoad;
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
  }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
