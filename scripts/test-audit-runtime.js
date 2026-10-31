#!/usr/bin/env node
"use strict";

/**
 * Test d'intégration sans dépendances npm : Express, Multer et sql.js sont
 * simulés afin d'exécuter le vrai handler de résolution des jaquettes.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alm-audit-runtime-"));
const dataDir = path.join(temporaryRoot, "data");
const imagesDir = path.join(temporaryRoot, "images");
const reviewKey = "betaseries:26";
const animeChoiceKey = "betaseries:anime-choice";
const sourceChoiceKey = "betaseries:source-choice";

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "animes.json"), "[]", "utf8");
fs.writeFileSync(path.join(dataDir, "media-review.json"), JSON.stringify({
  version: 2,
  pendingImports: [{
    key: reviewKey,
    source: "BetaSeries",
    sourceTitle: "Dexter",
    classification: "non_anime",
    reason: "Test d'une ancienne quarantaine sans jaquette.",
    confidence: 98,
    evidence: [{ kind: "tv", score: 100, source: "TVMaze" }],
    row: { id: "26", title: "Dexter" },
    anime: { title: "Dexter", type: "TV", tags: ["BetaSeries", "TVMaze", "hors anime probable"] },
    state: "pending"
  }, {
    key: animeChoiceKey,
    source: "BetaSeries",
    sourceTitle: "A Returner's Magic School Be Special",
    classification: "review",
    reason: "Deux candidats à comparer.",
    confidence: 100,
    evidence: [
      { kind: "anime", score: 100, source: "LocalMetadata" },
      { kind: "tv", score: 100, source: "TVMaze" }
    ],
    row: { id: "anime-choice", title: "A Returner's Magic School Be Special", episode: "S01E12", remaining: 0, status: 100 },
    anime: {
      title: "A Returner's Magic School Be Special",
      status: "Completed",
      episodesSeen: "12",
      episodesTotal: "12",
      betaseriesId: "anime-choice",
      betaseriesEpisode: "S01E12",
      tags: ["BetaSeries", "à vérifier"]
    },
    found: {
      officialTitle: "Kikansha no Mahou wa Tokubetsu desu",
      englishTitle: "A Returner's Magic School Be Special",
      type: "TV",
      malId: "54852",
      imageUrl: "/images/anime-choice.jpg",
      episodesTotal: "12",
      startDate: "2023-10-08",
      genres: ["Action", "Fantasy"],
      matchingScore: 100,
      source: "LocalMetadata"
    },
    tvmaze: {
      id: 9001,
      name: "A Returner's Magic School Be Special",
      type: "Animation",
      premiered: "2023-10-08",
      imageUrl: "/images/source-choice.jpg",
      matchingScore: 100,
      source: "TVMaze"
    },
    state: "pending"
  }, {
    key: sourceChoiceKey,
    source: "BetaSeries",
    sourceTitle: "Shangri-La",
    classification: "review",
    reason: "Deux candidats à comparer.",
    confidence: 100,
    evidence: [
      { kind: "anime", score: 100, source: "LocalMetadata" },
      { kind: "tv", score: 100, source: "TVMaze" }
    ],
    row: { id: "source-choice", title: "Shangri-La", episode: "S01E08", remaining: 0, status: 100 },
    anime: {
      title: "Shangri-La",
      status: "Completed",
      episodesSeen: "8",
      episodesTotal: "24",
      malId: "52299",
      betaseriesId: "source-choice",
      betaseriesEpisode: "S01E08",
      tags: ["BetaSeries", "TVMaze", "hors anime probable", "à vérifier"]
    },
    found: {
      officialTitle: "Shangri-La",
      type: "TV",
      malId: "52299",
      imageUrl: "/images/shangrila-anime.jpg",
      episodesTotal: "24",
      matchingScore: 100,
      source: "LocalMetadata"
    },
    tvmaze: {
      id: 9002,
      name: "Shangri-La",
      type: "Documentary",
      premiered: "2019-01-01",
      imageUrl: "/images/shangrila-documentary.jpg",
      genres: ["Travel"],
      matchingScore: 100,
      source: "TVMaze"
    },
    state: "pending"
  }],
  quarantined: [],
  analysis: { libraryFingerprint: "", updatedAt: "", items: [] }
}, null, 2), "utf8");

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

let capturedImageHeaders = null;
global.fetch = async function fakeFetch(resource, options = {}) {
  const url = String(resource || "");
  const show = {
    id: 26,
    name: "Dexter",
    type: "Scripted",
    language: "English",
    genres: ["Crime", "Drama"],
    premiered: "2006-10-01",
    status: "Ended",
    network: { name: "Showtime", country: { code: "US" } },
    image: {
      original: "https://static.tvmaze.com/uploads/images/original_untouched/test.jpg",
      medium: "https://static.tvmaze.com/uploads/images/medium_portrait/test.jpg"
    },
    url: "https://www.tvmaze.com/shows/26/dexter"
  };

  if (url.includes("api.tvmaze.com/search/shows")) {
    return new Response(JSON.stringify([{ score: 0.99, show }]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  if (url.includes("api.tvmaze.com/shows/26")) {
    return new Response(JSON.stringify(show), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  if (url.includes("static.tvmaze.com")) {
    capturedImageHeaders = options.headers || null;
    return new Response(Buffer.alloc(1300, 7), {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    });
  }
  return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
};

async function main() {
  try {
    const server = require(path.join(ROOT, "server.js"));
    await new Promise(resolve => setTimeout(resolve, 50));

    const findRoute = (method, routePath) => server.app._routes.find(item =>
      item.method === method && item.route === routePath
    );
    const invoke = async (route, body) => {
      assert(route, "route de test absente");
      const handler = route.handlers.at(-1);
      let statusCode = 200;
      let payload = null;
      const req = { body };
      const res = {
        status(value) { statusCode = value; return this; },
        json(value) { payload = value; return this; },
        end() { return this; },
        setHeader() {},
        redirect() { throw new Error("redirection inattendue"); }
      };
      await handler(req, res);
      return { statusCode, payload };
    };

    const auditRoute = findRoute("get", "/api/v2/content-audit");
    const progressRoute = findRoute("get", "/api/v2/content-audit/progress");
    const initialAudit = await invoke(auditRoute, {});
    assert.strictEqual(initialAudit.statusCode, 200, JSON.stringify(initialAudit.payload));
    assert(Number(initialAudit.payload?.quarantine?.autoExcluded || 0) >= 1, "Dexter devrait être écarté automatiquement comme série TV certaine");
    assert(!initialAudit.payload?.quarantine?.items?.some(item => item.sourceTitle === "Dexter"), "une série TV certaine ne doit plus encombrer la liste de contrôle");
    const progress = await invoke(progressRoute, {});
    assert.strictEqual(progress.statusCode, 200, JSON.stringify(progress.payload));
    assert.strictEqual(progress.payload?.status, "done", "la progression du Contrôle anime doit finir à done");
    assert.strictEqual(Number(progress.payload?.percent || 0), 100, "la barre de progression doit finir à 100 %");

    const resolveRoute = findRoute("post", "/api/v2/content-audit/images/resolve");
    const resolved = await invoke(resolveRoute, { refs: [`pending:${reviewKey}`] });
    const { statusCode, payload } = resolved;
    assert.strictEqual(statusCode, 200, JSON.stringify(payload));
    assert.strictEqual(payload?.updated, 1);
    assert.strictEqual(payload?.items?.[0]?.item?.tvmaze?.name, "Dexter");
    assert(/^https:\/\/static\.tvmaze\.com\//.test(payload.items[0].item.tvmaze.imageUrl), "la jaquette TV connue doit être utilisée directement sans téléchargement serveur");
    assert.strictEqual(payload.items[0].item.evidence.find(item => item.kind === "tv")?.score, 100);

    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "media-review.json"), "utf8"));
    assert.strictEqual(stored.version, 3, "ancienne quarantaine non migrée");
    assert(/^https:\/\/static\.tvmaze\.com\//.test(stored.pendingImports[0].tvmaze.imageUrl), "l'URL distante de la jaquette doit être persistée");
    assert.strictEqual(fs.readdirSync(imagesDir).filter(name => name.endsWith(".jpg")).length, 0, "le Contrôle anime ne doit plus télécharger une jaquette au simple affichage");
    assert.strictEqual(capturedImageHeaders, null, "aucun téléchargement serveur de jaquette ne doit se produire dans ce chemin rapide");

    const actionRoute = findRoute("post", "/api/v2/content-audit/quarantine/action");
    const animeSelection = await invoke(actionRoute, {
      action: "select",
      key: animeChoiceKey,
      candidate: "anime"
    });
    assert.strictEqual(animeSelection.statusCode, 200, JSON.stringify(animeSelection.payload));
    assert.strictEqual(animeSelection.payload?.candidate, "anime");
    assert.strictEqual(animeSelection.payload?.selectedTitle, "Kikansha no Mahou wa Tokubetsu desu");

    const sourceSelection = await invoke(actionRoute, {
      action: "select",
      key: sourceChoiceKey,
      candidate: "source"
    });
    assert.strictEqual(sourceSelection.statusCode, 200, JSON.stringify(sourceSelection.payload));
    assert.strictEqual(sourceSelection.payload?.candidate, "source");
    assert.strictEqual(sourceSelection.payload?.selectedTitle, "Shangri-La");

    const library = JSON.parse(fs.readFileSync(path.join(dataDir, "animes.json"), "utf8"));
    const chosenAnime = library.find(item => item.malId === "54852");
    assert(chosenAnime, "candidat anime de droite non ajouté");
    assert.strictEqual(chosenAnime.title, "Kikansha no Mahou wa Tokubetsu desu");
    assert.strictEqual(chosenAnime.mediaKind, "anime");
    assert.strictEqual(chosenAnime.verifiedAnime, true);
    assert.strictEqual(chosenAnime.status, "Completed");
    assert.strictEqual(chosenAnime.episodesSeen, "12");

    const chosenSource = library.find(item => item.tvmazeId === 9002);
    assert(chosenSource, "candidat de gauche non ajouté");
    assert.strictEqual(chosenSource.title, "Shangri-La");
    assert.strictEqual(chosenSource.type, "Documentary");
    assert.strictEqual(chosenSource.mediaKind, "manual");
    assert.strictEqual(chosenSource.manualLibraryChoice, true);
    assert.strictEqual(chosenSource.malId, "");
    assert.strictEqual(chosenSource.episodesTotal, "");
    assert.strictEqual(chosenSource.status, "Completed");
    assert.strictEqual(chosenSource.episodesSeen, "8");

    const finalReviewState = JSON.parse(fs.readFileSync(path.join(dataDir, "media-review.json"), "utf8"));
    const animeDecision = finalReviewState.pendingImports.find(item => item.key === animeChoiceKey);
    const sourceDecision = finalReviewState.pendingImports.find(item => item.key === sourceChoiceKey);
    assert.strictEqual(animeDecision?.decision, "selected_anime");
    assert.strictEqual(sourceDecision?.decision, "selected_source");

    const aliasesPath = path.join(dataDir, "aliases.json");
    const aliases = fs.existsSync(aliasesPath) ? JSON.parse(fs.readFileSync(aliasesPath, "utf8")) : { items: {} };
    assert(aliases.items?.["a returner s magic school be special"], "le choix anime doit mémoriser l'alias du titre importé");
    assert(!aliases.items?.["shangri la"], "le choix d'une fiche généraliste ne doit pas devenir une preuve anime");

    // Beta 18 : écarter plusieurs résultats d'analyse en une seule écriture.
    const beforeBulk = JSON.parse(fs.readFileSync(path.join(dataDir, "media-review.json"), "utf8"));
    beforeBulk.pendingImports.push({
      key: "betaseries:bulk-dismiss-test",
      source: "BetaSeries",
      sourceTitle: "Bulk dismiss test",
      classification: "review",
      reason: "test",
      row: { id: "bulk-dismiss-test", title: "Bulk dismiss test" },
      anime: { title: "Bulk dismiss test" },
      state: "pending",
      decision: ""
    });
    fs.writeFileSync(path.join(dataDir, "media-review.json"), JSON.stringify(beforeBulk, null, 2), "utf8");
    const bulkDismissRoute = findRoute("post", "/api/v2/content-audit/quarantine/bulk-dismiss");
    const bulkDismiss = await invoke(bulkDismissRoute, { keys: ["betaseries:bulk-dismiss-test"] });
    assert.strictEqual(bulkDismiss.statusCode, 200, JSON.stringify(bulkDismiss.payload));
    assert.strictEqual(bulkDismiss.payload?.dismissed, 1);
    const afterBulk = JSON.parse(fs.readFileSync(path.join(dataDir, "media-review.json"), "utf8"));
    assert.strictEqual(afterBulk.pendingImports.find(item => item.key === "betaseries:bulk-dismiss-test")?.state, "dismissed");
    assert.strictEqual(afterBulk.pendingImports.find(item => item.key === "betaseries:bulk-dismiss-test")?.decision, "dismissed-from-import-preview");

    // Beta 19 : l'écart groupé peut être annulé immédiatement sans relancer le CSV.
    const bulkRestoreRoute = findRoute("post", "/api/v2/content-audit/quarantine/bulk-restore-preview");
    const bulkRestore = await invoke(bulkRestoreRoute, { keys: ["betaseries:bulk-dismiss-test"] });
    assert.strictEqual(bulkRestore.statusCode, 200, JSON.stringify(bulkRestore.payload));
    assert.strictEqual(bulkRestore.payload?.restored, 1);
    const afterRestore = JSON.parse(fs.readFileSync(path.join(dataDir, "media-review.json"), "utf8"));
    assert.strictEqual(afterRestore.pendingImports.find(item => item.key === "betaseries:bulk-dismiss-test")?.state, "pending");
    assert.strictEqual(afterRestore.pendingImports.find(item => item.key === "betaseries:bulk-dismiss-test")?.decision, "restored-to-import-preview");

    const clearRoute = findRoute("post", "/api/v2/content-audit/quarantine/clear");
    const cleared = await invoke(clearRoute, {});
    assert.strictEqual(cleared.statusCode, 200, JSON.stringify(cleared.payload));
    assert(Number(cleared.payload?.removed || 0) >= 1, "le vidage doit retirer l'entrée encore en attente");
    const clearedState = JSON.parse(fs.readFileSync(path.join(dataDir, "media-review.json"), "utf8"));
    assert.strictEqual(clearedState.pendingImports.filter(item => item.state === "pending").length, 0);
    assert.strictEqual(clearedState.quarantined.length, 0);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().then(() => {
  console.log("OK runtime Contrôle anime : auto-exclusion sûre, progression, images directes, choix gauche/droite, écart groupé et vidage");
  process.exit(0);
}).catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
