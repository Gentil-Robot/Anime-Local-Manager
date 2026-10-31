#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alm-beta23-season-"));
const dataDir = path.join(temporaryRoot, "data");
const imagesDir = path.join(temporaryRoot, "images");
fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "animes.json"), JSON.stringify([{
  id: 1,
  title: "HELL MODE",
  status: "Completed",
  score: "",
  episodesSeen: "12",
  episodesTotal: "12",
  type: "TV",
  tags: [],
  genres: ["Fantasy"],
  notes: ""
}], null, 2), "utf8");
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

global.fetch = async () => { throw new Error("network disabled in runtime test"); };

function makeResponse() {
  let statusCode = 200;
  let payload;
  return {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    send(value) { payload = value; return this; },
    snapshot() { return { statusCode, payload }; }
  };
}

async function invoke(route, body) {
  const handler = route.handlers[route.handlers.length - 1];
  const req = { body, params: {}, query: {}, headers: {} };
  const res = makeResponse();
  await handler(req, res);
  return res.snapshot();
}

(async () => {
  try {
    const server = require(path.join(ROOT, "server.js"));
    const route = server.app._routes.find(item => item.method === "post" && item.route === "/api/animes");
    assert(route, "POST /api/animes absent");

    const result = await invoke(route, {
      title: "HELL MODE",
      status: "Watching",
      type: "TV",
      episodesSeen: "7",
      episodesTotal: "12",
      autoInfo: false
    });
    assert.strictEqual(result.statusCode, 200, JSON.stringify(result.payload));
    assert.strictEqual(result.payload?._addOutcome?.status, "added-season", JSON.stringify(result.payload));
    assert.strictEqual(result.payload?.status, "Watching");
    assert.strictEqual(result.payload?.episodesSeen, "7");
    assert.strictEqual(result.payload?.episodesTotal, "12");
    assert.strictEqual(result.payload?.manualSeasonNumber, 2);

    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "animes.json"), "utf8"));
    assert.strictEqual(stored.length, 2, JSON.stringify(stored));
    const s1 = stored.find(item => Number(item.id) === 1);
    const s2 = stored.find(item => Number(item.id) !== 1);
    assert.strictEqual(s1.status, "Completed");
    assert.strictEqual(s1.episodesSeen, "12");
    assert.strictEqual(s1.episodesTotal, "12");
    assert.strictEqual(s2.status, "Watching");
    assert.strictEqual(s2.episodesSeen, "7");
    assert.strictEqual(s2.episodesTotal, "12");
    assert.strictEqual(s2.manualSeasonNumber, 2);
    assert(/Saison 2/.test(s2.title), s2.title);

    console.log("OK Beta 23 multi-saisons : HELL MODE S1 12/12 reste terminé et S2 7/12 reste en cours.");
  } finally {
    Module._load = originalLoad;
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
  }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
