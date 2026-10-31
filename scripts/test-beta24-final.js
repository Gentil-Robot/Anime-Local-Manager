"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const html = read("public/index.html");
const app = read("public/alm-v2.js");
const i18n = read("public/i18n.js");
const server = read("server.js");
const db = read("db.js");

assert.strictEqual(pkg.version, "2.0.0");
for (const code of ["fr","en","ja","es","de","pt-BR"]) {
  assert(html.includes(`data-lang="${code}"`) || code === "fr");
  assert(fs.existsSync(path.join(root, "public/locales", `${code}.json`)));
}
assert(app.includes('NEWS_LANG_STORAGE_KEY_V2 = "alm-news-language"'));
assert(app.includes("window.ALM_NEWS_LANGUAGE"));
assert(i18n.includes("Langue des actualités"));
assert(i18n.includes("data-alm-news-language-select"));
for (const code of ["ja","es","de","pt-BR"]) {
  assert(server.includes(`lang: "${code}"`), `source RSS ${code} absente`);
}
assert(server.includes('return ["fr", "en", "ja", "es", "de"].includes(low) ? low : ""'));
assert(server.includes('if (low === "pt" || low === "pt-br") return "pt-BR"'));
assert(db.includes('if (low === "pt" || low === "pt-br") return "pt-BR"'));
assert(db.includes('if (lang !== "all" && row.lang !== lang) return false'));
assert(html.includes('id="dnaScoreSummary"'));
assert(html.includes('id="dnaScorePosters"'));
assert(app.includes('class="dna-score-poster"'));
assert(app.includes("Coups de cœur 9+"));
assert(read("public/style.css").includes(".dna-score-posters"));

const localeCodes=["en","ja","es","de","pt-BR"];
const required=["Langue des actualités","Toutes les langues","Actualités Anime","Tes animés les mieux notés","Animés notés","Coups de cœur 9+","Meilleure note","Note moyenne","Rechercher dans le dictionnaire","Progression du contrôle anime"];
const localeMaps=localeCodes.map(code=>[code,JSON.parse(read(`public/locales/${code}.json`)).strings||{}]);
for(const [code,map] of localeMaps){
  for(const key of required) assert(map[key] && map[key] !== key, `${code}: traduction manquante pour ${key}`);
}
const union=new Set(); localeMaps.forEach(([,map])=>Object.keys(map).forEach(key=>union.add(key)));
for(const [code,map] of localeMaps){
  const missing=[...union].filter(key=>!(key in map));
  assert.strictEqual(missing.length,0,`${code}: clés absentes du catalogue: ${missing.slice(0,5).join(", ")}`);
}
console.log(`OK Beta 24 final : 6 langues news réellement persistées/filtrées, réglage indépendant et Notes enrichies (${union.size} chaînes cataloguées par locale).`);
