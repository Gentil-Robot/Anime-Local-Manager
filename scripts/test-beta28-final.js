#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("public/index.html");
const main = read("main.js");

assert.strictEqual(pkg.version, "2.1.1");
assert(!html.includes("anime-local-manager-recherche-b%C3%A9ta-testeur"), "ancien lien beta test encore present");
for (const name of ["Ashlol", "Taé", "Aleistouille", "Roudoudoux", "Yuma", "Nochka"]) {
  assert(html.includes(name), `remerciement absent: ${name}`);
}
for (const asset of ["aleistouille.jpg", "roudoudoux.jpg", "yuma.jpg", "nochka.jpg", "aster.png"]) {
  assert(fs.existsSync(path.join(ROOT, "public", "assets", "thanks", asset)), `asset absent: ${asset}`);
}
assert(main.includes('"zh-CN"'), "zh-CN absent du processus Electron");
assert(pkg.build?.nsis?.installerLanguages?.includes("zh_CN"), "zh_CN absent de NSIS");

assert(html.indexOf("Données locales et sauvegardes") < html.indexOf("<section class=\"about-thanks\""), "les remerciements doivent être placés après Données locales et sauvegardes");
assert(!html.includes("Chat noir") && !html.includes("Chat roux") && !html.includes(">Chien<"), "anciens libellés d'espèce encore visibles");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alm-beta28-"));
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
global.fetch = async () => { throw new Error("network disabled in beta28 test"); };

try {
  const server = require(path.join(ROOT, "server.js"));
  const provisional = {
    id: 2,
    title: "Hell Mode — Saison 2",
    status: "Watching",
    episodesSeen: "7",
    episodesTotal: "12",
    betaseriesSeason: 2,
    needsSequelCheck: true,
    tags: ["BetaSeries", "progression répartie", "saison à identifier", "progression à vérifier"]
  };
  assert.strictEqual(server.__test.isBetaSeriesProvisionalSeasonForBanner(provisional), true, "S2 provisoire doit etre differee de la banniere");

  const dirty = server.__test.repairAnimeLibrary([{
    id: 1,
    title: "Hell Mode",
    status: "Completed",
    episodesSeen: "12",
    episodesTotal: "12",
    notes: [
      "Progression BetaSeries répartie automatiquement : saison 1 12/12, 7 épisode(s) transféré(s) vers la/les saison(s) suivante(s).",
      "Progression BetaSeries récupérée automatiquement : saison 2 à 7/12.",
      "Doublon fusionné automatiquement : Hell Mode — Saison 2.",
      "Ma note perso reste ici."
    ].join("\n")
  }]);
  assert.strictEqual(dirty.items.length, 1);
  assert.strictEqual(dirty.items[0].notes, "Ma note perso reste ici.", dirty.items[0].notes);
  assert.strictEqual(dirty.changed, true, "nettoyage des notes doit etre persiste");

  console.log("OK Beta 28 : banniere Hell Mode silencieuse, notes BetaSeries nettoyees, remerciements et zh-CN Electron/NSIS.");
} finally {
  Module._load = originalLoad;
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
}

process.exit(0);
