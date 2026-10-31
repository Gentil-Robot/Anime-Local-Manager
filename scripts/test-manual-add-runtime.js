#!/usr/bin/env node
"use strict";

/**
 * Test d'intégration de l'ajout manuel sans dépendances npm.
 * Vérifie le point utilisateur le plus important : un clic « + Ajouter »
 * ne doit jamais annoncer un succès si la fiche n'est pas réellement
 * présente dans Mes animés après relecture du stockage.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alm-manual-add-runtime-"));
const dataDir = path.join(temporaryRoot, "data");
const imagesDir = path.join(temporaryRoot, "images");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "animes.json"), "[]", "utf8");

process.env.ALM_DATA_DIR = dataDir;
process.env.ALM_IMAGES_DIR = imagesDir;
process.env.ALM_METADATA_REMOTE_URL = "";
process.env.ALM_METADATA_AUTONOMOUS_URL = "";

function expressStub() {
  const routes = [];
  const app = {
    _routes: routes,
    use() { return app; },
    listen() { throw new Error("Le serveur ne doit pas écouter pendant le test."); }
  };
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    app[method] = (route, ...handlers) => {
      routes.push({ method, route, handlers });
      return app;
    };
  }
  return app;
}
expressStub.json = () => function jsonMiddleware() {};
expressStub.static = () => function staticMiddleware() {};

function multerStub() {
  return {
    single() {
      return function uploadMiddleware(req, res, next) {
        if (typeof next === "function") next();
      };
    }
  };
}
multerStub.memoryStorage = () => ({});

process.env.ALM_SQLJS_ONLY = "1"; // Explicitly exercise the JSON rescue path, including runtimes with node:sqlite.
const originalLoad = Module._load;
Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === "express") return expressStub;
  if (request === "multer") return multerStub;
  if (request === "sql.js") throw new Error("sql.js volontairement indisponible pour tester le secours JSON");
  return originalLoad.call(this, request, parent, isMain);
};

// Simule une panne complète des API externes. Le comportement attendu reste
// strict : même avec « Infos auto » activé (valeur par défaut), la fiche saisie
// manuellement doit être persistée, puis enrichissable plus tard.
global.fetch = async function unavailableFetch(resource) {
  throw new Error(`Réseau simulé indisponible : ${resource}`);
};

function makeResponse() {
  let statusCode = 200;
  let payload = null;
  return {
    status(value) { statusCode = value; return this; },
    json(value) { payload = value; return this; },
    end() { return this; },
    setHeader() {},
    redirect() { throw new Error("redirection inattendue"); },
    snapshot() { return { statusCode, payload }; }
  };
}

async function invoke(route, body) {
  assert(route, "route POST /api/animes absente");
  const handler = route.handlers.at(-1);
  const req = { body };
  const res = makeResponse();
  await handler(req, res);
  return res.snapshot();
}

async function main() {
  try {
    const server = require(path.join(ROOT, "server.js"));
    const route = server.app._routes.find(item => item.method === "post" && item.route === "/api/animes");

    const titles = [
      "i became a legend after my 10 years",
      "yomi no tsugai"
    ];

    for (const title of titles) {
      const startedAt = Date.now();
      const result = await invoke(route, {
        title,
        status: "Plan to Watch",
        type: "TV"
      });
      const responseMs = Date.now() - startedAt;
      assert(responseMs < 500, `l'ajout manuel ne doit pas attendre les API externes (${responseMs} ms pour ${title})`);
      assert.strictEqual(result.statusCode, 200, JSON.stringify(result.payload));
      assert.strictEqual(result.payload?._addOutcome?.status, "added", `ajout non confirmé pour ${title}`);
      assert(result.payload?.id, `identifiant local absent pour ${title}`);

      const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "animes.json"), "utf8"));
      assert(persisted.some(item => Number(item.id) === Number(result.payload.id)), `fiche non persistée : ${title}`);
      assert(persisted.some(item => String(item.title || "").toLowerCase() === title.toLowerCase()), `titre absent après relecture : ${title}`);
    }

    const beforeDuplicate = JSON.parse(fs.readFileSync(path.join(dataDir, "animes.json"), "utf8"));
    const duplicate = await invoke(route, {
      title: "yomi no tsugai",
      status: "Plan to Watch",
      type: "TV"
    });
    assert.strictEqual(duplicate.statusCode, 200, JSON.stringify(duplicate.payload));
    assert.strictEqual(duplicate.payload?._addOutcome?.status, "existing", "un doublon doit être signalé comme déjà présent");

    const afterDuplicate = JSON.parse(fs.readFileSync(path.join(dataDir, "animes.json"), "utf8"));
    assert.strictEqual(afterDuplicate.length, beforeDuplicate.length, "un doublon ne doit pas créer une troisième fiche");
    assert.strictEqual(afterDuplicate.length, 2, "les deux titres utilisateur doivent être présents exactement une fois");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().then(() => {
  console.log("OK runtime + Ajouter : 2 fiches persistées malgré réseau indisponible, relecture vérifiée et doublon bloqué");
  process.exit(0);
}).catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
