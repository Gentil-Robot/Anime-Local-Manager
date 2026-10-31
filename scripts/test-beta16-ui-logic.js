#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
const alm = fs.readFileSync(path.join(ROOT, "public", "alm-v2.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public", "style.css"), "utf8");
const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");

// 1. Le filtre de note Anime DNA doit réellement filtrer la bibliothèque.
const filteredStart = app.indexOf("function filteredAnimes()");
const filteredEnd = app.indexOf("\nfunction renderStats", filteredStart);
assert(filteredStart >= 0 && filteredEnd > filteredStart, "filteredAnimes introuvable");
const filterSandbox = {
  animes: [
    { title: "Chef d'œuvre", score: 10, status: "Completed", type: "TV", genres: ["Fantasy"] },
    { title: "Très bon", score: 8, status: "Completed", type: "TV", genres: ["Fantasy"] }
  ],
  activePersonalScoreFilter: 10,
  animeYear: () => "2024",
  $: id => ({ value: id === "sort" ? "title" : "" })
};
vm.createContext(filterSandbox);
vm.runInContext(app.slice(filteredStart, filteredEnd), filterSandbox);
const score10 = filterSandbox.filteredAnimes();
assert.strictEqual(score10.length, 1);
assert.strictEqual(score10[0].title, "Chef d'œuvre");

// 2. Les filtres de résultats CSV doivent isoler les catégories et la recherche.
const csvStart = app.indexOf("function csvPreviewItemMatchesView");
const csvEnd = app.indexOf("\nfunction renderCsvPreviewRows", csvStart);
assert(csvStart >= 0 && csvEnd > csvStart, "filtre CSV Beta 16 introuvable");
const csvSandbox = { csvPreviewFilter: "review", csvPreviewSearch: "" };
vm.createContext(csvSandbox);
vm.runInContext(app.slice(csvStart, csvEnd), csvSandbox);
assert.strictEqual(csvSandbox.csvPreviewItemMatchesView({ classification: "review", sourceTitle: "Shangri-La" }), true);
assert.strictEqual(csvSandbox.csvPreviewItemMatchesView({ classification: "anime", sourceTitle: "Shangri-La" }), false);
csvSandbox.csvPreviewFilter = "all";
csvSandbox.csvPreviewSearch = "dexter";
assert.strictEqual(csvSandbox.csvPreviewItemMatchesView({ classification: "non_anime", sourceTitle: "Dexter" }), true);
assert.strictEqual(csvSandbox.csvPreviewItemMatchesView({ classification: "review", sourceTitle: "Bastard!!" }), false);

// 3. La bannière ne doit plus être réouverte par la navigation seule.
assert(alm.includes('completionBanner")?.classList.add("hidden")'));
assert(!alm.includes('completionBanner")?.classList.toggle("hidden", Boolean(window.__almBulkJobRunning))'));
assert(app.includes("rememberCompletionBannerSnooze(hours = 168)"));
assert(server.includes("const retryCooldownMs = 7 * 24 * 60 * 60 * 1000"));
assert(server.includes("isMinorCompletionGapForBanner"));

// 4. Réglages et import : structure réellement simplifiée.
assert.strictEqual((html.match(/<details class="settings-section settings-disclosure">/g) || []).length, 4);
assert(html.includes('id="csvResultsSearch"'));
assert(html.includes('id="csvResultsVisibleCount"'));
assert(css.includes(".csv-import-workspace"));
assert(css.includes(".settings-disclosure > summary"));

// 5. Les lignes de note sont des boutons accessibles et navigables.
assert(alm.includes('data-dna-personal-score'));
assert(alm.includes('window.showLibraryByPersonalScore'));
assert(css.includes('button.dna-score-column.is-clickable'));

console.log("OK Beta 16 UI : note Anime DNA, bannière, Réglages et import BetaSeries validés.");
