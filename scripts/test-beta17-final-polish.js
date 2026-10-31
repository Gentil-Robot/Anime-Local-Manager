#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const html = read("public/index.html");
const css = read("public/style.css");
const alm = read("public/alm-v2.js");
const karaokeJs = read("public/karaoke.js");
// Historical timeline regression. The supplied Beta37 timeline is tested separately.
const song = JSON.parse(read("scripts/fixtures/karaoke/song.beta36-backup.json"));
const packageJson = JSON.parse(read("package.json"));

assert.strictEqual(packageJson.version, "2.0.0");

// 1) Les réglages de synchro grand public ont disparu, le mode développeur reste.
for (const id of ["donationKaraokeSyncMinus", "donationKaraokeSyncPlus", "donationKaraokeSyncReset", "donationKaraokeSyncValue"]) {
  assert(!html.includes(`id="${id}"`), `${id} ne doit plus être visible`);
}
assert(html.includes('id="donationKaraokeDev"'));
assert(karaokeJs.includes('if (!devEnabled) localStorage.removeItem("alm.karaoke.offsetMs")'));

// 2) Audit audio-first : la ligne théorique explicitement incertaine est retirée.
const lines = (song.sections || []).flatMap(section => section.lines || []);
assert.strictEqual(lines.length, 42);
assert(!lines.some(line => line.ja === "ひとつの名前　ひとつの色"));
assert(!lines.some(line => line.romaji === "Souzou no chizu o egaite yuku"));
assert(!lines.some(line => line.ja === "エピソードが物語を紡ぎ"));
assert(!lines.some(line => line.ja === "恋と冒険　星々の彼方"));
assert(!lines.some(line => line.ja === "あの物語"));
assert(lines.some(line => line.ja === "僕の図書館"));
assert(lines.some(line => line.ja === "[心の世界に ?]"));
assert(!lines.some(line => line.ja === "数えきれない物語……"));
assert(!lines.some(line => line.ja === "まだ見ぬ世界へ……"));
assert(lines.some(line => line.ja === "ひとつとして……"));
const retained = lines.find(line => line.ja === "これはただの　コレクションじゃない");
assert(retained);
assert.strictEqual(retained.start, 152.72);
assert.strictEqual(retained.end, 156.78);
const mataAshita = lines.find(line => line.ja === "「また明日」と　続きを待ってる");
assert(mataAshita?.romaji.includes("tsuzuki"));
assert(!mataAshita?.romaji.includes("tsudzuki"));

// 3) Pagination complète du Contrôle anime présente en haut ET en bas.
for (const id of [
  "auditFirstPageBottomBtn", "auditPrevPageBottomBtn", "auditPageBottomSelect",
  "auditPageBottomTotal", "auditNextPageBottomBtn", "auditLastPageBottomBtn"
]) assert(html.includes(`id="${id}"`), `pagination basse absente: ${id}`);
assert(alm.includes('for (const selectId of ["auditPageSelect", "auditPageBottomSelect"])'));
assert(alm.includes('auditFirstPageBottomBtn'));
assert(css.includes('.audit-page-jump-bottom'));

// 4) Finitions visuelles demandées.
assert(css.includes('.snews-card {\n  overflow: hidden;'));
assert(css.includes('right: clamp(10px, 1.5vw, 24px)'));
assert(css.includes('scale(1.18)'));

// 5) Import BetaSeries : plus de scrollbar dédiée à gauche sur grand écran.
assert(css.includes('@media (min-width: 1051px)'));
assert(css.includes('.csv-import-controls {\n    overflow: visible;'));
assert(css.includes('#csvImportForm .csv-results {\n    overflow-y: auto;'));

// 6) Icônes de publication présentes dans toutes les tailles attendues.
for (const size of [16,24,32,48,64,128,256,512,1024]) {
  const file = path.join(ROOT, `build/icons/${size}x${size}.png`);
  assert(fs.existsSync(file) && fs.statSync(file).size > 100, `icône ${size} absente`);
}
assert(fs.statSync(path.join(ROOT, "public/assets/anime-local-manager.ico")).size > 1000);
assert(fs.existsSync(path.join(ROOT, "scripts/fixtures/karaoke/song.beta16-backup.json")));

console.log("OK Beta 17 final polish : saisons, Anime DNA, pagination audit, import BetaSeries, icône et structure karaoké vérifiés (sans validation audio).");
