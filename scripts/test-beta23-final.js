#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const i18n = read("public/i18n.js");
const main = read("main.js");
const preload = read("preload.js");
const html = read("public/index.html");
const server = read("server.js");
// Historical timeline regression. The supplied Beta37 timeline is tested separately.
const song = JSON.parse(read("scripts/fixtures/karaoke/song.beta36-backup.json"));
const lines = (song.sections || []).flatMap(section => section.lines || []);

assert.strictEqual(pkg.version, "2.1.2");
assert.strictEqual(pkg.build?.nsis?.runAfterFinish, false);
assert.strictEqual(pkg.build?.nsis?.multiLanguageInstaller, true);
assert.deepStrictEqual(pkg.build?.nsis?.installerLanguages, ["fr_FR", "en_US", "ja_JP", "es_ES", "de_DE", "pt_BR", "zh_CN"]);

const languages = ["fr", "en", "ja", "es", "de", "pt-BR"];
for (const code of languages) assert(i18n.includes(`"${code}"`), `langue ${code} absente du moteur i18n`);
for (const code of languages) {
  const file = path.join(ROOT, "public", "locales", `${code}.json`);
  assert(fs.existsSync(file), `locale ${code} absente`);
  const locale = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(locale._meta?.code, code);
  assert(locale.strings && typeof locale.strings === "object");
  if (code !== "fr") {
    assert(Object.keys(locale.strings).length >= 220, `${code}: couverture UI trop faible`);
    for (const source of ["▦ Animés", "📺 Saisons", "⚙ Réglages", "Langue et interface", "Terminé", "En cours", "+ Ajouter"]) {
      assert(locale.strings[source], `${code}: traduction clé absente: ${source}`);
    }
  }
}
assert(html.indexOf('/i18n.js') >= 0 && html.indexOf('/i18n.js') < html.indexOf('/app.js'), "i18n doit être chargé avant app.js");
assert(i18n.includes('MutationObserver'), "les contenus dynamiques doivent être retraduits");
assert(i18n.includes('alm:language-changed'));
assert(i18n.includes('localStorage.setItem(STORAGE_KEY'));
assert(i18n.includes('getSystemLocale'));
assert(main.includes('SUPPORTED_APP_LANGUAGES'));
assert(main.includes('app-language.txt'));
assert(main.includes('ipcMain.handle("get-language"'));
assert(main.includes('ipcMain.handle("set-language"'));
assert(main.includes('ipcMain.handle("get-system-locale"'));
assert(preload.includes('getLanguage:'));
assert(preload.includes('setLanguage:'));
assert(preload.includes('getSystemLocale:'));

// HELL MODE / cas générique : S1 terminée ne doit plus absorber une S2 en cours.
assert(server.includes('manualAddLooksLikeSeasonContinuation'));
assert(server.includes('status: "added-season"'));
assert(server.includes('betaSeriesUnresolvedTargetAnime'));
assert(server.includes('saison à identifier'));
assert(server.includes('Progression BetaSeries conservée pour la saison'));

// Karaoké : sauvegarde avant Eleven, lignes théoriques incertaines supprimées.
assert.strictEqual(song.schemaVersion, 5);
assert.strictEqual(lines.length, 42);
assert(fs.existsSync(path.join(ROOT, "scripts", "fixtures", "karaoke", "song.before-eleven-captions.json")));
for (const absent of [
  "エピソードが物語を紡ぎ", "夜を駆ける", "恋と冒険　星々の彼方",
  "想像の地図を　描いてゆく", "ひとつの名前　ひとつの色",
  "数えきれない物語……", "まだ見ぬ世界へ……"
]) assert(!lines.some(line => line.ja === absent), `ligne non confirmée encore active: ${absent}`);
for (const present of ["ひとつの知らせが", "僕の図書館", "[Bokoru ?] とともに", "[心の世界に ?]", "ひとつとして……", "消えないように……"]) {
  assert(lines.some(line => line.ja === present), `ligne confirmée absente: ${present}`);
}
assert.strictEqual(lines.filter(line => line.ja === "Anime Local Manager").length, 4);
assert.strictEqual(song.reviewStatus, "needs-human-audio-review");

console.log("OK Beta 23 final : 6 langues, HELL MODE/multi-saisons et structure karaoké vérifiée (sans validation audio).");
