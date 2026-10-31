#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { EventEmitter } = require("events");

const ROOT = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "alm-csv-cancel-"));
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

class FakeWorker extends EventEmitter {
  constructor() {
    super();
    this.done = 0;
    this.cancelled = false;
    this.timer = setInterval(() => {
      if (this.cancelled) return;
      this.done += 1;
      this.emit("message", { type: "progress", done: this.done, total: 20, current: `Anime ${this.done}` });
      if (this.done >= 20) {
        clearInterval(this.timer);
        this.emit("message", { type: "result", results: [] });
        this.emit("exit", 0);
      }
    }, 12);
  }
  postMessage(message) {
    if (message?.type !== "cancel" || this.cancelled) return;
    this.cancelled = true;
    clearInterval(this.timer);
    setTimeout(() => {
      this.emit("message", { type: "cancelled", results: [], done: this.done, total: 20 });
      this.emit("exit", 0);
    }, 5);
  }
}

process.env.ALM_SQLJS_ONLY = "1"; // Explicitly exercise the JSON rescue path, including runtimes with node:sqlite.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "express") return expressStub;
  if (request === "multer") return multerStub;
  if (request === "sql.js") throw new Error("sql.js intentionally unavailable");
  if (request === "worker_threads") return { Worker: FakeWorker };
  return originalLoad.call(this, request, parent, isMain);
};
global.fetch = async () => { throw new Error("network disabled"); };

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

(async () => {
  try {
    const server = require(path.join(ROOT, "server.js"));
    const find = (method, route) => server.app._routes.find(item => item.method === method && item.route === route);
    const previewRoute = find("post", "/api/import/csv/preview");
    const cancelRoute = find("post", "/api/import/csv/cancel/:id");
    const progressRoute = find("get", "/api/import/csv/progress/:id");
    assert(previewRoute && cancelRoute && progressRoute);

    const csv = ["id,title,archive,episode,remaining,status,tags"];
    for (let i = 1; i <= 20; i++) csv.push(`${i},Anime ${i},0,S01E01,11,8,`);
    const progressId = "cancel-test";
    const previewReq = { body: { source: "betaseries", progressId }, file: { buffer: Buffer.from(csv.join("\n"), "utf8") } };
    const previewRes = responseCapture();
    const previewPromise = previewRoute.handlers.at(-1)(previewReq, previewRes);

    await new Promise(resolve => setTimeout(resolve, 45));
    const cancelReq = { params: { id: progressId }, body: {} };
    const cancelRes = responseCapture();
    await cancelRoute.handlers.at(-1)(cancelReq, cancelRes);
    assert.strictEqual(cancelRes.statusCode, 200);
    assert.strictEqual(cancelRes.payload?.cancelRequested, true);

    await previewPromise;
    assert.strictEqual(previewRes.statusCode, 200, JSON.stringify(previewRes.payload));
    assert.strictEqual(previewRes.payload?.cancelled, true, JSON.stringify(previewRes.payload));
    assert.deepStrictEqual(previewRes.payload?.items, []);

    const progressReq = { params: { id: progressId } };
    const progressRes = responseCapture();
    progressRoute.handlers.at(-1)(progressReq, progressRes);
    assert.strictEqual(progressRes.payload?.status, "cancelled", JSON.stringify(progressRes.payload));
    assert(progressRes.payload?.done < progressRes.payload?.total, JSON.stringify(progressRes.payload));

    const mediaReviewPath = path.join(dataDir, "media-review.json");
    if (fs.existsSync(mediaReviewPath)) {
      const state = JSON.parse(fs.readFileSync(mediaReviewPath, "utf8"));
      assert.strictEqual((state.pendingImports || []).length, 0, "partial cancelled results leaked into quarantine");
    }
    console.log("CSV cancellation runtime: OK");
  } finally {
    Module._load = originalLoad;
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
