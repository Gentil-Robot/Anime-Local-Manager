"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("public/index.html");
const app = read("public/alm-v2.js");
const css = read("public/style.css");
const i18n = read("public/i18n.js");
const server = read("server.js");
const karaokeJs = read("public/karaoke.js");
// Historical timeline regression. The supplied Beta37 timeline is tested separately.
const song = JSON.parse(read("scripts/fixtures/karaoke/song.beta36-backup.json"));

assert.strictEqual(pkg.version, "2.0.0");
assert.equal(pkg.scripts.verify, "node scripts/verify-project.js");
assert(JSON.parse(read("scripts/verification-plan.json")).steps.includes("scripts/test-beta25-final.js"));

const codes = ["en", "ja", "es", "de", "pt-BR"];
const critical = [
  "Ajouter à voir prochainement",
  "Ne pas ajouter",
  "Oublier définitivement",
  "Tout oublier",
  "🎯 Explore par genre",
  "Clique sur un genre pour voir les meilleurs animés absents de ta bibliothèque.",
  "❤️ Si tu as aimé...",
  "Sélectionne un animé, choisis dans la liste ou tape son nom pour trouver des recommandations proches.",
  "Rechercher un animé",
  "Résumé RSS affiché. Texte complet non récupéré :",
  "L'affichage intégré utilise les informations RSS disponibles. Le bouton source ouvre l'article complet chez l'éditeur.",
  "Agrandir",
  "Ouvrir la source ↗",
  "Répartition de tes notes personnelles de 1 à 10. Clique sur une note pour ouvrir les animés correspondants dans ta bibliothèque, ou sur une jaquette pour y accéder plus vite.",
  "Note moyenne",
  "Animés notés",
  "Coups de cœur 9+",
  "Meilleure note",
  "▶ Lecture",
  "⏸ Pause",
  "⛶ Mode karaoké"
];
let keyCount = null;
let referenceKeys = null;
for (const code of codes) {
  const locale = JSON.parse(read(`public/locales/${code}.json`));
  const map = locale.strings || {};
  const keys = Object.keys(map).sort();
  if (keyCount === null) { keyCount = keys.length; referenceKeys = keys; }
  assert.strictEqual(keys.length, keyCount, `${code}: catalogue désynchronisé`);
  assert.deepStrictEqual(keys, referenceKeys, `${code}: les clés du catalogue diffèrent des autres langues`);
  assert(Object.keys(map).length >= 875, `${code}: couverture i18n insuffisante`);
  for (const key of critical) {
    assert(Object.prototype.hasOwnProperty.call(map, key), `${code}: clé critique absente: ${key}`);
    assert(String(map[key] || "").trim(), `${code}: traduction vide: ${key}`);
    if (code !== "ja" || !/^Anime Local Manager$/.test(key)) {
      if (!(["en","de"].includes(code) && key === "⏸ Pause")) assert.notStrictEqual(map[key], key, `${code}: traduction identique à la source: ${key}`);
    }
  }
}
assert(i18n.includes("characterData: true"), "les textes mutés après rendu ne sont pas observés");
assert(i18n.includes("attributes: true"), "les attributs mutés après rendu ne sont pas observés");
assert(i18n.includes("lastAppliedTexts"), "le suivi des nœuds réutilisés est absent");
assert(i18n.includes("lastAppliedAttrs"), "le suivi des attributs réutilisés est absent");
assert(i18n.includes("dynamicPrefixes"), "les préfixes dynamiques ne sont pas traduits");
assert(i18n.includes("translateDynamicText"), "règles dynamiques i18n absentes");

// Actualités : plus d'agrégateurs Google pour les nouvelles langues et ancien cache filtré côté UI.
for (const oldName of ["Google News Anime JP", "Google Noticias Anime ES", "Google News Anime DE", "Google Notícias Anime BR"]) {
  assert(!server.includes(oldName), `ancienne source agrégateur encore active: ${oldName}`);
}
for (const source of ["Anime!Anime!", "Crunchyroll Noticias", "Anime2You", "Crunchyroll Notícias BR"]) {
  assert(server.includes(source), `source directe absente: ${source}`);
}
assert(app.includes("isDeprecatedNewsAggregatorV2"));
assert(app.includes("newsDisplayImageV2"));
assert(app.includes("newsLanguageMetaV2(n.lang).flag"));
assert(app.includes("!isDeprecatedNewsAggregatorV2(n)"));

// Notes : histogramme visuel, mais les jaquettes appréciées restent présentes et cliquables.
assert(html.includes('id="dnaScorePosters"'));
assert(app.includes('class="dna-score-poster"'));
assert(app.includes('class="dna-score-histogram"'));
assert(app.includes('class="dna-score-column'));
assert(css.includes("button.dna-score-column.is-clickable"));
assert(css.includes(".dna-score-column-fill"));
assert(css.includes(".dna-score-posters"));
assert(app.includes("data-dna-personal-score"));
assert(app.includes("window.showLibraryByPersonalScore"));

// Karaoké : 42 lignes audio-first, traduction liée à la langue de l'UI, timings chantés intacts.
const translationCodes = ["fr", "en", "ja", "es", "de", "pt-BR"];
for (const section of song.sections || []) {
  for (const code of translationCodes) assert(String(section.labels?.[code] || "").trim(), `${code}: libellé de section karaoké absent: ${section.id}`);
}
const lines = song.sections.flatMap(section => section.lines || []);
assert.strictEqual(lines.length, 42);
for (const line of lines) {
  assert(line.translations && line.translationUnits, `traductions karaoké absentes: ${line.ja}`);
  for (const code of translationCodes) {
    assert(String(line.translations[code] || "").trim(), `${code}: traduction karaoké absente: ${line.ja}`);
    const units = line.translationUnits[code];
    assert(Array.isArray(units) && units.length > 0, `${code}: unités karaoké absentes: ${line.ja}`);
    for (const unit of units) {
      assert(unit.start >= line.start - 1e-6 && unit.end <= line.end + 1e-6 && unit.end >= unit.start, `${code}: timing traduction hors ligne: ${line.ja}`);
    }
  }
  assert.strictEqual(line.translations.ja, line.ja, `japonais altéré: ${line.ja}`);
}
const notice = lines.find(line => line.ja === "ひとつの知らせが");
assert(notice, "ligne ひとつの知らせが absente");
assert(!/nuit/i.test(notice.translations.fr), "ancienne traduction française non conforme à la ligne audio restante");
assert(karaokeJs.includes('addEventListener("alm:language-changed"'));
assert(karaokeJs.includes("const translatedText = (line, lang = uiLanguage())"));
assert(karaokeJs.includes("translatedText(line)"));
assert(karaokeJs.includes("const translatedUnits = (line, lang = uiLanguage())"));
assert(karaokeJs.includes("cachedLowerUnits"));
assert(karaokeJs.includes("const translatedSection = (section, lang = uiLanguage())"));
assert(karaokeJs.includes("translatedSection(line.section)"));
assert(karaokeJs.includes("media.currentTime"));

console.log(`OK Beta 25 final : ${keyCount} chaînes/locales, news directes, histogramme de notes et karaoké 6 langues sur ${lines.length} lignes.`);
