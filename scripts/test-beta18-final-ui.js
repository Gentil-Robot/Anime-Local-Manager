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
const server = read("server.js");
const song = JSON.parse(read("public/karaoke/song.json"));
const pkg = JSON.parse(read("package.json"));

assert.strictEqual(pkg.version, "2.0.0-beta.18");

// Import BetaSeries : panneau de résultat prioritaire et actions groupées.
for (const id of ["csvReviewBulkActions", "csvSelectVisibleReview", "csvClearReviewSelection", "csvDismissSelectedReview"]) {
  assert(html.includes(`id="${id}"`), `contrôle import absent: ${id}`);
}
assert(css.includes("width: min(1740px, calc(100% - 18px))"));
assert(css.includes("grid-template-columns: minmax(300px, .66fr) minmax(720px, 1.78fr)"));
assert(app.includes("csv-review-select"));
assert(app.includes("dismissSelectedCsvReviewItems"));
assert(server.includes('/api/v2/content-audit/quarantine/bulk-dismiss'));
assert(server.includes("reviewKey: mediaReviewImportKey(item)"));

// Vocabulaire : ne plus afficher « Complétion après import BetaSeries ».
assert(!app.includes("Complétion après import BetaSeries"));
assert(app.includes("Enrichissement après import BetaSeries"));

// Icône Windows : master dédié plus serré + tailles taskbar courantes.
assert(fs.existsSync(path.join(ROOT, "public/assets/anime-local-manager-taskbar.png")));
assert(fs.statSync(path.join(ROOT, "public/assets/anime-local-manager.ico")).size > 10000);

// Karaoké : nettoyage conservateur demandé et recalibrages signalés.
const lines = (song.sections || []).flatMap(section => section.lines || []);
assert.strictEqual(lines.length, 43);
assert(!lines.some(line => line.romaji === "Souzou no chizu o egaite yuku"));
const sen = lines.find(line => line.romaji === "Sen no omokage boku no korekushon");
assert(sen && sen.romajiUnits[0].end === 71 && sen.romajiUnits[2].start === 71.9);
const chorus2 = lines.find(line => line.romaji === "Anime Local Manager" && Math.abs(line.start - 73.38) < 0.01);
assert(chorus2 && chorus2.romajiUnits[0].end === 74.12);
const finalAlm = lines.find(line => line.romaji === "Anime Local Manager" && Math.abs(line.start - 163.3) < 0.01);
assert(finalAlm && finalAlm.romajiUnits[2].end === 166.8);
assert(fs.existsSync(path.join(ROOT, "scripts/fixtures/karaoke/song.beta17-backup.json")));

console.log("OK Beta 18 : icône taskbar, import BetaSeries, vocabulaire et nettoyage karaoké validés.");
