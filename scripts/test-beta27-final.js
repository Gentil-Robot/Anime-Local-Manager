#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const ROOT = path.resolve(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));
assert.strictEqual(pkg.version, "2.0.0");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const ui = fs.readFileSync(path.join(ROOT, "public", "alm-v2.js"), "utf8");
const i18n = fs.readFileSync(path.join(ROOT, "public", "i18n.js"), "utf8");
const zh = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "locales", "zh-CN.json"), "utf8"));
assert(html.includes('id="recoHeroBlock"'));
assert(html.includes('id="dnaBubbleLeftRail"'));
assert(html.includes('id="dnaBubbleRightRail"'));
assert(html.includes('id="dnaSignatureMemoriesLabel"'));
assert(ui.includes("renderRecoHeroV2"));
assert(ui.includes("renderDnaCanvasRailsV2"));
assert(i18n.includes('"zh-CN"'));
assert.strictEqual(zh._meta.code, "zh-CN");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alm-beta27-"));
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
  const app = { _routes: routes, use(){ return app; }, listen(){ throw new Error("no listen"); } };
  for (const method of ["get","post","put","patch","delete"]) app[method] = (route, ...handlers) => { routes.push({method,route,handlers}); return app; };
  return app;
}
expressStub.json = () => function jsonMiddleware(){};
expressStub.static = () => function staticMiddleware(){};
function multerStub(){ return { single(){ return function uploadMiddleware(req,res,next){ if(next) next(); }; } }; }
multerStub.memoryStorage = () => ({});
process.env.ALM_SQLJS_ONLY = "1"; // Explicitly exercise the JSON rescue path, including runtimes with node:sqlite.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "express") return expressStub;
  if (request === "multer") return multerStub;
  if (request === "sql.js") throw new Error("sql.js intentionally unavailable");
  return originalLoad.call(this, request, parent, isMain);
};
global.fetch = async () => { throw new Error("network disabled in beta27 test"); };
try {
  const server = require(path.join(ROOT, "server.js"));
  const repaired = server.__test.repairAnimeLibrary([
    { id: 1, title: "Example Anime", betaseriesSeriesId: "series-42", betaseriesSeason: 1, status: "Completed", episodesSeen: "12", episodesTotal: "12" },
    { id: 2, title: "Example Anime II", betaseriesSeriesId: "series-42", betaseriesSeason: 2, status: "Watching", episodesSeen: "7", episodesTotal: "12" },
    { id: 3, title: "Example Anime — Saison 2", betaseriesSeriesId: "series-42", betaseriesSeason: 2, status: "Watching", episodesSeen: "7", episodesTotal: "12" }
  ]);
  assert.strictEqual(repaired.items.length, 2, JSON.stringify(repaired));
  assert(repaired.groups.some(group => String(group.reason || "").startsWith("saison:bs:series-42::2")), JSON.stringify(repaired.groups));
  console.log("OK Beta 27 : recommandations, Anime DNA, zh-CN et fusion multi-saisons.");
} finally {
  Module._load = originalLoad;
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
}

process.exit(0);
