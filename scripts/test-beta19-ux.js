#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const html = read("public/index.html");
const css = read("public/style.css");
const app = read("public/app.js");
const lexicon = read("public/lexicon.js");
const server = read("server.js");
const pkg = JSON.parse(read("package.json"));

assert.strictEqual(pkg.version, "2.0.0");

// Import BetaSeries : actions groupées complètes + recherche assistée.
for (const id of [
  "csvBulkSelectionCount",
  "csvSelectVisibleReview",
  "csvClearReviewSelection",
  "csvForceSelectedReview",
  "csvDismissSafeNonAnime",
  "csvDismissSelectedReview",
  "csvUndoDismissReview",
  "csvResultsSuggestions"
]) {
  assert(html.includes(`id="${id}"`), `contrôle import absent: ${id}`);
}
assert(app.includes("forceSelectedCsvReviewItems"));
assert(app.includes("dismissSafeNonAnimeCsvItems"));
assert(app.includes("undoLastCsvDismiss"));
assert(app.includes("renderCsvSearchSuggestions"));
assert(server.includes('/api/v2/content-audit/quarantine/bulk-restore-preview'));
assert(css.includes("grid-template-rows: auto auto auto minmax(0, 1fr)"), "la barre bulk doit avoir sa propre ligne dans le panneau résultats");

// Dictionnaire : suggestions avec alias/catégorie et clavier.
assert(html.includes('id="lexiconSuggestions"'));
assert(lexicon.includes("lexiconSuggestionCandidates"));
assert(lexicon.includes("renderLexiconSuggestions"));
assert(lexicon.includes('event.key === "ArrowDown"'));
assert(lexicon.includes("alsoCalled"));
assert(css.includes(".lexicon-search-suggestions"));

// Bibliothèque : filtres indépendants par vue.
for (const token of [
  "libraryFilterStates",
  "currentLibraryViewKey",
  "captureLibraryFilterState",
  "applyLibraryFilterState",
  "saveCurrentLibraryFilterState",
  "normalizeLibraryViewKey"
]) assert(app.includes(token), `gestion de vue manquante: ${token}`);
assert(app.includes('status.disabled = key !== "all"'));
assert(app.includes('showAnimesV1("Plan to Watch")'));
assert(app.includes('filterByStatusCard("Watching")'));
assert(!app.includes('// V1.1 side navigation\ndocument.querySelectorAll(".nav-item[data-filter]")'), "ancien gestionnaire global de filtre encore présent");

// Libellés français sans changer les valeurs internes.
assert(html.includes('<option value="Watching">En cours</option>'));
assert(html.includes('<option value="Completed">Terminé</option>'));
assert(html.includes('<option value="Plan to Watch">À voir</option>'));

console.log("OK Beta 19 : tri d’import, autocomplétion et filtres indépendants validés.");
