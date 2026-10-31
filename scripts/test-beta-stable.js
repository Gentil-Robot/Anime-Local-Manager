#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
// Permet de tester le comportement Windows depuis Linux sans modifier process.platform.
// En usage normal, la valeur reste celle de Node (win32, linux ou darwin).
const VERIFY_PLATFORM = String(process.env.ALM_VERIFY_PLATFORM || process.platform).trim().toLowerCase();
const results = [];
let failures = 0;

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function check(name, fn) {
  try {
    fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`KO  ${name} — ${error.message || error}`);
  }
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function runNodeTestScript(file, extraEnv = {}) {
  const target = path.join(ROOT, file);
  assert(fs.existsSync(target), `script de test absent: ${file}`);
  const run = spawnSync(process.execPath, [target], {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 8 * 1024 * 1024
  });
  assert(!run.error, `${file}: ${run.error?.message || "erreur d'exécution"}`);
  assert.strictEqual(run.status, 0, `${file}: ${(run.stderr || run.stdout || "").trim()}`);
  return `${run.stdout || ""}${run.stderr || ""}`;
}

function walk(dir, predicate = () => true) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // La publication prépare une copie du projet ici avant de lancer les contrôles.
    if ([".git", "node_modules", "dist", ".metadata-build-cache", ".release-work"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full, predicate));
    else if (predicate(full)) output.push(full);
  }
  return output;
}

function cssBraceBalance(css) {
  let depth = 0;
  let quote = "";
  let inComment = false;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    const next = css[i + 1];
    if (inComment) {
      if (char === "*" && next === "/") { inComment = false; i += 1; }
      continue;
    }
    if (!quote && char === "/" && next === "*") { inComment = true; i += 1; continue; }
    if (quote) {
      if (char === "\\") { i += 1; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return depth;
  }
  return depth;
}

function lexiconEntries() {
  const code = read("public/lexicon.js");
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "public/lexicon.js" });
  return sandbox.window.__ALM_LEXICON_ENTRIES;
}

function lexiconExamples() {
  const code = read("public/lexicon.js");
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "public/lexicon.js" });
  return sandbox.window.__ALM_LEXICON_EXAMPLES;
}

function splitSqlTuple(rawTuple) {
  const raw = String(rawTuple || "").trim().replace(/^\(/, "").replace(/\);?$/, "");
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quoted) {
      if (char === "'") {
        if (raw[index + 1] === "'") {
          current += "'";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

const packageJson = JSON.parse(read("package.json"));
const indexHtml = read("public/index.html");
const serverJs = read("server.js");
const appJs = read("public/app.js");
const almV2Js = read("public/alm-v2.js");

check("Version npm 2.0.0", () => assert.strictEqual(packageJson.version, "2.0.0"));
check("Version visible V2.0.0 Bêta stable", () => {
  assert(indexHtml.includes("V2.0.0 Bêta stable"));
  assert(!indexHtml.includes("V2.0.4 RC8"));
  assert(serverJs.includes('const BACKUP_VERSION = "2.0.0-beta.82"'));
});
check("User-Agent actifs harmonisés", () => {
  assert(!/Anime(?:LocalManager| Local Manager)\/2\.0\.4/.test(serverJs));
  assert(serverJs.includes("2.0.0-beta.82"));
  assert(!/2\.0\.0-beta\.1(?!\d)/.test(serverJs));
});

check("Syntaxe de tous les fichiers JavaScript", () => {
  const files = walk(ROOT, file => file.endsWith(".js"));
  const errors = [];
  for (const file of files) {
    const run = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (run.status !== 0) errors.push(`${rel(file)}: ${(run.stderr || run.stdout).trim()}`);
  }
  assert.strictEqual(errors.length, 0, errors.join("\n"));
});

check("Identifiants HTML uniques", () => {
  const ids = [...indexHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.strictEqual(new Set(duplicates).size, 0, `doublons: ${[...new Set(duplicates)].join(", ")}`);
  assert(ids.length >= 190, `seulement ${ids.length} IDs`);
});

check("Références label et ARIA valides", () => {
  const ids = new Set([...indexHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]));
  const refs = [];
  for (const match of indexHtml.matchAll(/\b(?:for|aria-labelledby|aria-describedby|aria-controls)\s*=\s*["']([^"']+)["']/gi)) {
    refs.push(...match[1].split(/\s+/).filter(Boolean));
  }
  const missing = refs.filter(value => !ids.has(value));
  assert.strictEqual(missing.length, 0, `références absentes: ${[...new Set(missing)].join(", ")}`);
});

check("Scripts et ressources HTML présents", () => {
  for (const match of indexHtml.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']\/([^"'?#]+)["']/gi)) {
    const target = path.join(ROOT, "public", match[1]);
    assert(fs.existsSync(target), `ressource absente: ${match[1]}`);
  }
});

check("Structure CSS équilibrée", () => assert.strictEqual(cssBraceBalance(read("public/style.css")), 0));

check("Routes HTTP exactes sans doublon", () => {
  const routes = [...serverJs.matchAll(/\bapp\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g)]
    .map(match => `${match[1].toUpperCase()} ${match[2]}`);
  const duplicates = routes.filter((route, index) => routes.indexOf(route) !== index);
  assert.strictEqual(new Set(duplicates).size, 0, `doublons: ${[...new Set(duplicates)].join(", ")}`);
  assert(routes.length >= 80, `seulement ${routes.length} routes`);
});

check("Extracteur d’images : Open Graph", () => {
  const { extractBestArticleImage } = require(path.join(ROOT, "lib/news-image-utils"));
  const html = '<meta property="og:image" content="/media/hero.webp"><img src="/logo.png">';
  assert.strictEqual(extractBestArticleImage(html, "https://example.test/article"), "https://example.test/media/hero.webp");
});

check("Extracteur d’images : lazy loading et contenu principal", () => {
  const { extractBestArticleImage } = require(path.join(ROOT, "lib/news-image-utils"));
  const html = '<header><img src="/assets/site-logo.png" width="400"></header><article><figure><img class="wp-post-image" data-lazy-src="/uploads/news-cover.jpg" width="1200" height="675" src="/placeholder.gif"></figure></article>';
  assert.strictEqual(extractBestArticleImage(html, "https://news.example/post"), "https://news.example/uploads/news-cover.jpg");
});

check("Extracteur d’images : srcset choisit la grande image", () => {
  const { extractBestArticleImage } = require(path.join(ROOT, "lib/news-image-utils"));
  const html = '<main><picture><source data-srcset="/small.jpg 320w, /large.jpg 1280w"><img src="/small.jpg"></picture></main>';
  assert.strictEqual(extractBestArticleImage(html, "https://news.example/post"), "https://news.example/large.jpg");
});

check("Extracteur d’images : JSON-LD", () => {
  const { extractBestArticleImage } = require(path.join(ROOT, "lib/news-image-utils"));
  const html = '<script type="application/ld+json">{"@type":"NewsArticle","image":{"url":"https://cdn.example/cover.avif"}}</script>';
  assert.strictEqual(extractBestArticleImage(html, "https://news.example/post"), "https://cdn.example/cover.avif");
});

check("Extracteur d’images : arrière-plan lazy-load", () => {
  const { extractBestArticleImage } = require(path.join(ROOT, "lib/news-image-utils"));
  const html = '<article><div class="featured hero" data-bg="/uploads/cover-lazy.webp" data-width="1280" data-height="720"></div></article>';
  assert.strictEqual(extractBestArticleImage(html, "https://news.example/post"), "https://news.example/uploads/cover-lazy.webp");
});

check("Extracteur d’images : rejette logos et pixels", () => {
  const { extractBestArticleImage } = require(path.join(ROOT, "lib/news-image-utils"));
  const html = '<article><img src="/logo.svg"><img src="/tracking-pixel.gif" width="1" height="1"><img src="/uploads/real-cover.jpg" width="900" height="500"></article>';
  assert.strictEqual(extractBestArticleImage(html, "https://news.example/post"), "https://news.example/uploads/real-cover.jpg");
});

check("Actualités : résolution et persistance des vignettes câblées", () => {
  const dbJs = read("db.js");
  assert(serverJs.includes('/api/v2/news/images/resolve'));
  assert(serverJs.includes("persistResolvedNewsImages"));
  assert(serverJs.includes("extractBestArticleImage, largestSrcsetCandidate"));
  assert(serverJs.includes("rssImage(decodeHtmlEntities(block), rssTag(block, \"content:encoded\")"));
  assert(serverJs.includes("originalArticleUrl"));
  assert(serverJs.includes("updateNewsImagesByArticleUrl"));
  assert(dbJs.includes("function updateNewsImagesByArticleUrl"));
  assert(dbJs.includes("SELECT imageUrl FROM news_history WHERE articleUrl = ? LIMIT 1"));
  assert(dbJs.includes('if (!existing || !Object.prototype.hasOwnProperty.call(existing, "imageUrl")) continue;'));
  assert(dbJs.includes("matchedKeys.add(entry.key)"));
  assert(dbJs.includes("unmatchedKeys"));
  assert(serverJs.includes("rssResourceLooksLikeImage"));
  assert(serverJs.includes("<enclosure\\b[^>]*>"));
  assert(almV2Js.includes("hydrateVisibleNewsImagesV2"));
  assert(almV2Js.includes("const maxBatches = 9"));
  assert(almV2Js.includes("processedKeys"));
  assert(almV2Js.includes("imageDiscovered"));
});

check("Actualités : mise à jour réelle du stockage JSON sans doublon", () => {
  const code = `
    const assert = require("assert");
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const db = require(${JSON.stringify(path.join(ROOT, "db.js"))});
    (async () => {
      process.env.ALM_SQLJS_ONLY="1";
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alm-news-db-"));
      try {
        await db.initDb(dir);
        const inserted = db.upsertNewsItems([{
          newsKey: "news-1", title: "Article test", articleUrl: "https://news.example/article",
          imageUrl: "", discoveredAt: new Date().toISOString(), source: "Test", category: "divers"
        }]);
        assert.strictEqual(inserted.processed, 1);
        const updated = db.updateNewsImagesByArticleUrl([{
          key: "news-1", articleUrls: ["https://news.example/article"], imageUrl: "https://cdn.example/cover.webp"
        }]);
        assert.strictEqual(updated.updated, 1);
        assert.deepStrictEqual(updated.unmatchedKeys, []);
        const queried = db.queryNewsHistory({ limit: 10 });
        assert.strictEqual(queried.items.length, 1);
        assert.strictEqual(queried.items[0].imageUrl, "https://cdn.example/cover.webp");
        const missing = db.updateNewsImagesByArticleUrl([{
          key: "news-2", articleUrls: ["https://news.example/absent"], imageUrl: "https://cdn.example/other.webp"
        }]);
        assert.deepStrictEqual(missing.unmatchedKeys, ["news-2"]);
        assert.strictEqual(db.queryNewsHistory({ limit: 10 }).items.length, 1);
      } finally {
        db.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    })().catch(error => { console.error(error.stack || error); process.exit(1); });
  `;
  // This real SQL.js fixture imports the full bundled catalogue before testing
  // news writes. Allow the same bounded budget as the other runtime fixtures,
  // including on slower CI/VM hosts; keep every persistence assertion intact.
  const run = spawnSync(process.execPath, ["-e", code], { cwd: ROOT, encoding: "utf8", timeout: 90000 });
  assert(!run.error, `Stockage actualités : ${run.error?.message || "erreur d'exécution"}`);
  assert.strictEqual(run.status, 0, (run.stderr || run.stdout).trim());
});

check("Parseurs créateur Jikan et AniList", () => {
  const helpers = require(path.join(ROOT, "lib/recommendation-people"));
  const jikan = helpers.parseJikanAnimeStaff({ data: [
    { person: { mal_id: 1, name: "Miyazaki, Hayao" }, positions: "Original Creator" },
    { person: { mal_id: 2, name: "Someone Else" }, positions: ["Sound Director"] }
  ] });
  const anilist = helpers.parseAniListCreators({ data: { Media: { staff: { edges: [
    { role: "Original Creator", node: { id: 10, name: { full: "Hayao Miyazaki" } } }
  ] } } } });
  assert.strictEqual(jikan.length, 1);
  assert.strictEqual(anilist.length, 1);
  const merged = helpers.mergePeople([jikan, anilist]);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(String(merged[0].malId), "1");
  assert.strictEqual(String(merged[0].anilistId), "10");
});

check("Carrières créateur : rôles techniques exclus", () => {
  const helpers = require(path.join(ROOT, "lib/recommendation-people"));
  const jikan = helpers.parseJikanPersonAnime({ data: [
    { position: "Original Creator", anime: { mal_id: 301, title: "Valid Work" } },
    { position: "Sound Director", anime: { mal_id: 302, title: "Wrong Sound Work" } },
    { position: "Theme Song Composition", anime: { mal_id: 303, title: "Wrong Music Work" } }
  ] }, { creatorName: "Auteur" });
  const anilist = helpers.parseAniListStaffMedia({ data: { Staff: { staffMedia: { edges: [
    { staffRole: "Series Composition", node: { idMal: 304, title: { english: "Valid Script Work" } } },
    { staffRole: "Background Art", node: { idMal: 305, title: { english: "Wrong Art Work" } } }
  ] } } } }, { creatorName: "Auteur" });
  assert.deepStrictEqual(Array.from(jikan, item => String(item.malId)), ["301"]);
  assert.deepStrictEqual(Array.from(anilist, item => String(item.malId)), ["304"]);
});

check("Parseurs seiyuu japonais Jikan et AniList", () => {
  const helpers = require(path.join(ROOT, "lib/recommendation-people"));
  const jikan = helpers.parseJikanVoiceActors({ data: [{
    role: "Main", character: { name: "Hero" }, voice_actors: [
      { language: "Japanese", person: { mal_id: 11, name: "Voice, Actor" } },
      { language: "English", person: { mal_id: 12, name: "English Voice" } }
    ]
  }] });
  const anilist = helpers.parseAniListVoiceActors({ data: { Media: { characters: { edges: [{
    role: "MAIN", node: { name: { full: "Hero" } }, voiceActors: [{ id: 22, name: { full: "Actor Voice" } }]
  }] } } } });
  assert.strictEqual(jikan.length, 1);
  assert.strictEqual(anilist.length, 1);
  assert.strictEqual(helpers.mergePeople([jikan, anilist]).length, 1);
});

check("Œuvres créateur/seiyuu fusionnées et bibliothèque exclue", () => {
  const helpers = require(path.join(ROOT, "lib/recommendation-people"));
  const jikan = helpers.parseJikanPersonAnime({ data: [{ anime: { mal_id: 100, title: "Owned" } }, { anime: { mal_id: 101, title: "New Work" } }] }, { creatorName: "Auteur" });
  const anilist = helpers.parseAniListStaffMedia({ data: { Staff: { staffMedia: { edges: [
    { staffRole: "Original Creator", node: { idMal: 101, type: "ANIME", title: { english: "New Work" }, averageScore: 80 } },
    { staffRole: "Original Creator", node: { idMal: 102, type: "ANIME", title: { romaji: "Another Work" }, averageScore: 75 } },
    { staffRole: "Original Creator", node: { idMal: 103, type: "MANGA", title: { romaji: "Wrong Manga" }, averageScore: 90 } }
  ] } } } }, { creatorName: "Auteur" });
  const voices = helpers.parseAniListCharacterMedia({ data: { Staff: { characterMedia: { edges: [
    { characterRole: "MAIN", node: { idMal: 104, type: "ANIME", title: { english: "Voice Anime" } } },
    { characterRole: "MAIN", node: { idMal: 105, type: "MANGA", title: { english: "Wrong Voice Manga" } } }
  ] } } } }, { seiyuuName: "Voix" });
  const fallbackVoices = helpers.parseAniListStaffCharacters({ data: { Staff: { characters: { edges: [
    { role: "MAIN", node: { name: { full: "Hero" } }, media: [
      { idMal: 106, type: "ANIME", title: { english: "Fallback Voice Anime" } },
      { idMal: 107, type: "MANGA", title: { english: "Fallback Wrong Manga" } }
    ] }
  ] } } } }, { seiyuuName: "Voix" });
  const merged = helpers.mergeWorks([jikan, anilist], { excludeMalIds: new Set(["100"]), limit: 20 });
  assert.deepStrictEqual(Array.from(merged, item => String(item.malId)), ["101", "102"]);
  assert.deepStrictEqual(Array.from(voices, item => String(item.malId)), ["104"]);
  assert.deepStrictEqual(Array.from(fallbackVoices, item => String(item.malId)), ["106"]);
});

check("Recommandations multi-source et endpoints de secours présents", () => {
  const filmography = require(path.join(ROOT, "lib/anilist-staff-filmography"));
  assert(serverJs.includes('require("./lib/anilist-staff-filmography")'));
  assert(serverJs.includes("aniListStaffFilmography.fetchStaffFilmography"));
  assert(filmography.STAFF_MEDIA_QUERY.includes("staffMedia(type: ANIME"));
  assert(filmography.CHARACTER_MEDIA_QUERY.includes("characterMedia(page: $page, perPage: 25"));
  assert(filmography.STAFF_CHARACTERS_QUERY.includes("characters(page: $page, perPage: 25"));
  assert(filmography.STAFF_CHARACTERS_QUERY.includes("media {"));
  assert(!filmography.CHARACTER_MEDIA_QUERY.includes("type: ANIME"));
  assert(serverJs.includes('people/${personId}/${kind === "creator" ? "anime" : "voices"}'));
  assert(serverJs.includes('people/${personId}/full'));
  assert(serverJs.indexOf('people/${personId}/${kind === "creator" ? "anime" : "voices"}') < serverJs.indexOf('people/${personId}/full'));
  assert(serverJs.includes("RECO_PEOPLE_SCHEMA_VERSION = 10"));
  assert(serverJs.includes("fetchAniListAnimePeople"));
  assert(serverJs.includes("fetchJikanJson(endpoint"));
  assert(!serverJs.includes('`${endpoint}${separator}page=${page}`'));
  assert(serverJs.includes("jikanRecoPersonId(person)"));
  assert(serverJs.includes("aniListRecoPersonId(person)"));
  assert(serverJs.includes("Aucun identifiant Jikan/AniList exploitable"));
  assert(serverJs.includes("ALM_JIKAN_RETIRED"));
  assert(serverJs.includes("metadataProviders.byId"));
  assert(serverJs.includes("recoPeopleLibraryFingerprint"));
  assert(serverJs.includes("staleRecoRouteResult"));
  assert(serverJs.includes("workSourceSucceeded"));
  assert(serverJs.includes("resolveMissingRecoPersonIds"));
  assert(serverJs.includes("lookupJikanPersonIdByName"));
  assert(serverJs.includes("lookupAniListPersonIdByName"));
  assert(serverJs.includes("seiyuu-works-v10-"));
  assert(almV2Js.includes("Réessayer sans cache"));
});

check("Recommandations rapides : AniList prioritaire et images immédiates", () => {
  const resolveStart = serverJs.indexOf("async function resolveAnimePeople");
  const resolveEnd = serverJs.indexOf("function enrichRecoWorkFromMetadata", resolveStart);
  const resolveCode = serverJs.slice(resolveStart, resolveEnd);
  assert(resolveCode.indexOf("fetchAniListAnimePeople") < resolveCode.indexOf("fetchJikanJson"));
  assert(!resolveCode.includes("Promise.allSettled([jikanPromise, aniListPromise])"));
  assert(serverJs.includes('slice(0, kind === "creator" ? 2 : 3)'));
  assert(serverJs.includes("Jikan uniquement si le chemin rapide"));
  assert(almV2Js.includes("Recherche AniList rapide… Jikan uniquement si nécessaire…"));
  assert(almV2Js.includes('img.src = safeUrlV2(data.imageUrl || "")'));
  assert(almV2Js.includes('const imageSrc = directImage !== "#" ? directImage : cachedImage'));
});

check("Seiyuu AniList : pagination characterMedia puis secours Staff.characters", () => {
  const code = `
    const assert = require("assert");
    const filmography = require(${JSON.stringify(path.join(ROOT, "lib/anilist-staff-filmography.js"))});

    async function primaryPagination() {
      const calls = [];
      const request = async (query, variables) => {
        if (!query.includes("query VoiceAnime")) throw new Error("Requête inattendue");
        calls.push(variables.page);
        if (variables.page === 1) {
          return { data: { Staff: { characterMedia: { pageInfo: { hasNextPage: true, currentPage: 1 }, edges: [
            { characterRole: "MAIN", node: { idMal: 701, type: "ANIME", format: "TV", averageScore: 82, title: { english: "Premier rôle" } } }
          ] } } } };
        }
        return { data: { Staff: { characterMedia: { pageInfo: { hasNextPage: false, currentPage: 2 }, edges: [
          { characterRole: "SUPPORTING", node: { idMal: 702, type: "ANIME", format: "TV", averageScore: 80, title: { english: "Deuxième rôle" } } },
          { characterRole: "MAIN", node: { idMal: 701, type: "ANIME", format: "TV", averageScore: 82, title: { english: "Premier rôle" } } }
        ] } } } };
      };
      const items = await filmography.fetchStaffFilmography({ request, personId: 77, kind: "seiyuu", defaults: { seiyuuName: "Voix Test" } });
      assert.deepStrictEqual(calls, [1, 2]);
      assert.deepStrictEqual(Array.from(items, item => String(item.malId)), ["701", "702"]);
      assert(items.every(item => item.seiyuuName === "Voix Test"));
    }

    async function independentFallback() {
      const calls = [];
      const request = async query => {
        if (query.includes("query VoiceAnime")) {
          calls.push("characterMedia");
          throw new Error("connexion temporairement indisponible");
        }
        if (query.includes("query VoiceCharacters")) {
          calls.push("characters");
          return { data: { Staff: { characters: { pageInfo: { hasNextPage: false, currentPage: 1 }, edges: [{
            role: "MAIN",
            node: { name: { full: "Hero" } },
            media: [
              { idMal: 801, type: "ANIME", format: "TV", averageScore: 82, genres: ["Fantasy"], title: { english: "Fallback Anime" }, coverImage: { large: "https://img.test/a.jpg" }, startDate: { year: 2024, month: 1, day: 1 } },
              { idMal: 802, type: "MANGA", format: "MANGA", title: { english: "Wrong Manga" } }
            ]
          }] } } } };
        }
        throw new Error("Requête inattendue");
      };
      const items = await filmography.fetchStaffFilmography({ request, personId: 88, kind: "seiyuu", defaults: { seiyuuName: "Voix Secours" } });
      assert.deepStrictEqual(calls, ["characterMedia", "characters"]);
      assert.deepStrictEqual(Array.from(items, item => String(item.malId)), ["801"]);
      assert.strictEqual(items[0].seiyuuName, "Voix Secours");
    }

    (async () => {
      await primaryPagination();
      await independentFallback();
    })().catch(error => { console.error(error.stack || error); process.exit(1); });
  `;
  const run = spawnSync(process.execPath, ["-e", code], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
  assert.strictEqual(run.status, 0, (run.stderr || run.stdout).trim());
});

check("Anime DNA : radar absolu, sans double comptage", () => {
  const radar = require(path.join(ROOT, "public/dna-radar.js"));
  const animes = Array.from({ length: 290 }, () => ({ genres: [] }));
  for (let index = 0; index < 226; index += 1) animes[index].genres.push("Fantasy");
  for (let index = 0; index < 169; index += 1) animes[index].genres.push("Action");
  for (let index = 0; index < 116; index += 1) animes[index].genres.push("Adventure");
  // Ces tags ne doivent plus gonfler les axes Fantasy et Aventure.
  animes[226].genres.push("Isekai", "Survival");
  animes[0].genres.push("Isekai", "Magic", "Adventure", "Adventure");

  const axes = radar.buildAxes(animes);
  const byKey = Object.fromEntries(axes.map(axis => [axis.key, axis]));
  assert.strictEqual(byKey.fantasy.count, 226);
  assert.strictEqual(byKey.action.count, 169);
  assert.strictEqual(byKey.adventure.count, 116);
  assert.strictEqual(byKey.adventure.percent, 40);
  assert.strictEqual(byKey.adventure.total, 290);
  assert(indexHtml.includes('src="/dna-radar.js"'));
  assert(indexHtml.includes('id="dnaRadarLegend"'));
  assert(indexHtml.includes('id="dnaRadarHelp"'));
  assert(indexHtml.includes("Chaque anime compte une seule fois par axe"));
  assert(almV2Js.includes("Échelle absolue"));
  assert(!almV2Js.includes("function dnaCountGenre"));
});

check("Classification d'import : anime, série TV et ambiguïtés séparés", () => {
  const classifier = require(path.join(ROOT, "lib/media-classifier"));
  const exactAnime = title => ({
    title,
    officialTitle: title,
    type: "TV",
    malId: 21,
    source: "Jikan",
    matchingScore: 100
  });
  const exactTv = (name, extra = {}) => ({
    name,
    type: "Scripted",
    language: "English",
    genres: ["Drama"],
    source: "TVMaze",
    matchingScore: 100,
    ...extra
  });

  for (const title of ["Dexter", "Stargate SG-1", "True Detective", "NCIS", "La casa de papel"]) {
    assert.strictEqual(
      classifier.classifyImportCandidate({ title, tvFound: exactTv(title) }).classification,
      "non_anime",
      `${title} ne doit jamais être importé automatiquement comme anime`
    );
  }
  assert.strictEqual(classifier.classifyImportCandidate({
    title: "24",
    animeFound: { ...exactAnime("Tokyo 24th Ward"), matchingScore: 52 },
    tvFound: exactTv("24")
  }).classification, "non_anime");
  assert.strictEqual(classifier.classifyImportCandidate({
    title: "Monster",
    animeFound: exactAnime("Monster"),
    tvFound: exactTv("Monster")
  }).classification, "review");
  assert.strictEqual(classifier.classifyImportCandidate({
    title: "One Piece",
    animeFound: exactAnime("One Piece"),
    tvFound: exactTv("One Piece", { type: "Animation", genres: ["Anime", "Adventure"] })
  }).classification, "anime");
  assert.strictEqual(classifier.classifyImportCandidate({ title: "Titre inconnu" }).classification, "review");
  assert.strictEqual(classifier.classifyLibraryEntry({
    title: "Dexter",
    malId: "26",
    tags: ["BetaSeries"]
  }, null).classification, "review", "un ancien identifiant numérique non confirmé ne doit pas protéger une série TV");
  assert.strictEqual(classifier.classifyLibraryEntry({
    title: "Dexter",
    malId: "26",
    tags: ["BetaSeries", "TVMaze", "hors anime probable"]
  }, null).classification, "non_anime", "les marqueurs TV explicites restent prioritaires sans metadata anime confirmée");

  const confirmed = classifier.markAsConfirmedAnime({
    title: "Cas validé manuellement",
    tags: ["BetaSeries", "TVMaze", "TVMaze : Cas validé", "hors anime probable", "à vérifier"]
  });
  assert.strictEqual(confirmed.mediaKind, "anime");
  assert.strictEqual(confirmed.verifiedAnime, true);
  assert(confirmed.tags.includes("anime confirmé manuellement"));
  assert(!confirmed.tags.some(tag => classifier.normalizeMediaTitle(tag).startsWith("tvmaze")));
  assert(!confirmed.tags.some(tag => classifier.normalizeMediaTitle(tag) === "hors anime probable"));

  const manual = classifier.markAsManualLibraryChoice({
    title: "Shangri-La",
    tags: ["BetaSeries", "TVMaze", "hors anime probable", "à vérifier"],
    verifiedAnime: true
  });
  assert.strictEqual(manual.mediaKind, "manual");
  assert.strictEqual(manual.manualLibraryChoice, true);
  assert.strictEqual(manual.verifiedAnime, undefined);
  assert(manual.tags.includes("conservé manuellement"));
  assert.strictEqual(classifier.classifyLibraryEntry(manual).classification, "anime");
});

check("Contrôle anime : bibliothèque existante, quarantaine et sauvegarde", () => {
  const classifier = require(path.join(ROOT, "lib/media-classifier"));
  assert.strictEqual(classifier.classifyLibraryEntry({
    title: "True Detective",
    tags: ["BetaSeries", "TVMaze", "hors anime probable"]
  }).classification, "non_anime");
  assert.strictEqual(classifier.classifyLibraryEntry({
    title: "Anime confirmé par moi",
    tags: ["anime confirmé manuellement"],
    mediaKind: "anime"
  }).classification, "anime");

  assert(fs.existsSync(path.join(ROOT, "lib/media-classifier.js")));
  assert(serverJs.includes('const MEDIA_REVIEW_FILE = path.join(DATA_DIR, "media-review.json")'));
  assert(serverJs.includes('app.get("/api/v2/content-audit"'));
  assert(serverJs.includes('app.post("/api/v2/content-audit/scan"'));
  assert(serverJs.includes('app.post("/api/v2/content-audit/library/:id/action"'));
  assert(serverJs.includes('app.post("/api/v2/content-audit/library/batch"'));
  assert(serverJs.includes('action !== "quarantine_non_anime"'));
  assert(serverJs.includes('minConfidence = Math.max(90'));
  assert(serverJs.includes('app.post("/api/v2/content-audit/quarantine/action"'));
  assert(serverJs.includes("mediaReviewBuildSelectedCandidate"));
  assert(serverJs.includes("saveManualAliasMatch"));
  assert(serverJs.includes('requestedCandidate = String(req.body?.candidate || "")'));
  assert(serverJs.includes('decision: selectedCandidate ? `selected_${selectedCandidate}` : "imported"'));
  assert(serverJs.includes("markAsManualLibraryChoice"));
  assert(serverJs.includes("mediaReview: readBackupJsonFile(MEDIA_REVIEW_FILE"));
  assert(serverJs.includes("normalizeRestoredMediaReviewState"));
  assert(serverJs.includes("refreshAliasCacheFromLibrary"));
  assert(serverJs.includes("Une fiche retirée doit être restaurée ou supprimée définitivement."));
  assert(indexHtml.includes('id="navAudit"'));
  assert(indexHtml.includes('id="auditPage"'));
  assert(indexHtml.includes('id="auditBulkBtn"'));
  assert(almV2Js.includes("quarantineSafeNonAnimeV2"));
  assert(almV2Js.includes("loadContentAuditV2"));
  assert(almV2Js.includes("Restaurer dans la bibliothèque"));
  assert(almV2Js.includes("Ne pas importer"));
  assert(almV2Js.includes("Oublier cette décision"));
  assert(almV2Js.includes("Supprimer définitivement"));
  assert(almV2Js.includes("Choisir le candidat de gauche"));
  assert(almV2Js.includes("Choisir la fiche anime de droite"));
  assert(almV2Js.includes('data-audit-action="select"'));
  assert(almV2Js.includes('data-audit-candidate="'));
});

check("Contrôle anime : jaquettes et scores contextualisés", () => {
  const workerJs = read("csv-worker.js");
  const css = read("public/style.css");
  assert(serverJs.includes("version: 3"));
  assert(serverJs.includes('const TVMAZE_IMPORT_CACHE_FILE = path.join(DATA_DIR, "cache", "tvmaze-import-cache.json")'));
  assert(serverJs.includes("function sanitizeMediaReviewTv"));
  assert(serverJs.includes("found.coverImage?.large"));
  assert(serverJs.includes("found.image?.original"));
  assert(serverJs.includes("enrichMediaReviewStateLocal"));
  assert(serverJs.includes('app.post("/api/v2/content-audit/images/resolve"'));
  assert(!serverJs.includes('app.post("/api/v2/content-audit/posters/resolve"'));
  assert(serverJs.includes("cacheMediaReviewVisual"));
  assert(serverJs.includes("resolvePendingMediaReviewVisual"));
  assert(serverJs.includes("resolveQuarantinedMediaReviewVisual"));
  assert(serverJs.includes("resolveLibraryMediaReviewVisual"));
  assert(serverJs.includes("localEnrichment.changed"));
  assert(workerJs.includes("imageUrl: row.imageUrl"));
  assert(workerJs.includes("synopsis: row.synopsis"));
  assert(workerJs.includes('imageUrl: best.imageUrl || ""'));
  assert(workerJs.includes('imageUrl: best.image?.original || best.image?.medium || ""'));
  assert(almV2Js.includes("Deux correspondances fortes"));
  assert(almV2Js.includes("Hors-anime probable"));
  assert(almV2Js.includes("Proximité titre anime"));
  assert(almV2Js.includes("Proximité titre série / film"));
  assert(almV2Js.includes("Aucune correspondance fiable"));
  assert(almV2Js.includes("auditCandidatePanelMarkupV2"));
  assert(almV2Js.includes("auditObserveVisualsV2"));
  assert(almV2Js.includes("auditIsRemotePosterV2"));
  assert(almV2Js.includes("/api/v2/content-audit/images/resolve"));
  assert(!almV2Js.includes("textContent:'🗃️'"));
  assert(indexHtml.includes("Comment décider ?"));
  assert(indexHtml.includes("Les pourcentages mesurent uniquement la proximité des titres"));
  assert(css.includes(".audit-comparison"));
  assert(css.includes(".audit-candidate-poster"));
  assert(css.includes(".audit-evidence-summary"));
  assert(css.includes(".audit-score-note"));
  assert(!css.includes(".audit-confidence"));
});

check("Contrôle anime : migration, cache et choix gauche/droite", () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, "scripts/test-audit-runtime.js")], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30000
  });
  assert.strictEqual(run.status, 0, (run.stderr || run.stdout).trim());
  assert((run.stdout || "").includes("OK runtime Contrôle anime : auto-exclusion sûre, progression, images directes, choix gauche/droite, écart groupé et vidage"));
});

check("Contrôle anime : rendu comparatif fonctionnel", () => {
  const code = `
    const fs = require("fs");
    const vm = require("vm");
    const document = {
      addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
      createElement(tag) { return { tagName: String(tag).toUpperCase(), content: { firstElementChild: null }, set innerHTML(value) { this._html = value; }, get innerHTML() { return this._html || ""; } }; }
    };
    const window = { document, addEventListener() {}, notifyApp() {} };
    const context = {
      window, document, console, setTimeout, clearTimeout, devicePixelRatio: 1, URL,
      fetch: async () => ({ ok: true, json: async () => ({}) }), Event: function Event() {},
      requestAnimationFrame() {}, cancelAnimationFrame() {},
      IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync("public/alm-v2.js", "utf8"), context, { filename: "alm-v2.js" });
    const item = {
      key: "betaseries:1", ref: "pending:betaseries:1", source: "BetaSeries", sourceTitle: "Bastard!!",
      classification: "review", reason: "Titre ambigu", confidence: 100,
      evidence: [
        { kind: "anime", score: 100, source: "LocalMetadata" },
        { kind: "tv", score: 98, source: "TVMaze" }
      ],
      found: { officialTitle: "BASTARD!!", type: "ONA", startDate: "2022-06-30", imageUrl: "/images/anime.jpg", matchingScore: 100, source: "LocalMetadata" },
      tvmaze: { name: "Bastard!!", type: "Scripted", premiered: "2022-01-01", imageUrl: "/images/tv.jpg", matchingScore: 98, source: "TVMaze" },
      anime: { title: "Bastard!!" }
    };
    const html = context.auditQuarantineCardMarkupV2(item);
    for (const expected of [
      "Deux correspondances fortes", "Proximité titre anime", "Proximité titre série / film",
      "/images/anime.jpg", "/images/tv.jpg", "Choisir le candidat de gauche",
      "Choisir la fiche anime de droite", 'data-audit-candidate="source"', 'data-audit-candidate="anime"'
    ]) {
      if (!html.includes(expected)) throw new Error("élément manquant : " + expected);
    }
  `;
  const run = spawnSync(process.execPath, ["-e", code], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
  assert.strictEqual(run.status, 0, (run.stderr || run.stdout).trim());
});

check("Import BetaSeries protégé : sélection sûre et validation manuelle", () => {
  const workerJs = read("csv-worker.js");
  assert(workerJs.includes('require("./lib/media-classifier")'));
  assert(workerJs.includes("searchTvMazeWorker"));
  assert(workerJs.includes("TVMAZE_START_DELAY_MS = 560"));
  assert(workerJs.includes("waitForTvmazeStartSlot"));
  assert(workerJs.includes("response.status === 429"));
  assert(workerJs.includes('require("./lib/import-candidate-validation")') || workerJs.includes("require('./lib/import-candidate-validation')"));
  assert(workerJs.includes("candidateValidation.validate"));
  assert(read("lib/import-candidate-validation.js").includes("classifier.classifyImportCandidate"));
  assert(serverJs.includes("upsertPendingMediaReviews(analysed)"));
  assert(serverJs.includes("classification !== \"anime\" && !forced"));
  assert(serverJs.includes("rawItem?.forceImport === true"));
  assert(serverJs.includes("item.anime = mediaClassifier.markAsConfirmedAnime(item.anime)"));
  assert(appJs.includes('classification === "anime"'));
  assert(appJs.includes("Seuls les anime confirmés sont sélectionnés automatiquement"));
  assert(appJs.includes("Forcer l’import"));
});

check("Contrôle anime : rendu progressif, actions rapides et vidage total", () => {
  const style = read("public/style.css");
  assert(indexHtml.includes('id="auditClearBtn"'));
  assert(serverJs.includes('app.post("/api/v2/content-audit/quarantine/clear"'));
  assert(serverJs.includes('app.get("/api/v2/content-audit/progress"'));
  assert(serverJs.includes("await yieldToEventLoop()"));
  assert(almV2Js.includes("const AUDIT_PAGE_SIZE = 8"));
  assert(almV2Js.includes("quarantineItems.slice(_auditRenderOffset, _auditRenderOffset + AUDIT_PAGE_SIZE)"));
  assert(indexHtml.includes('id="auditNextPageBottomBtn"'));
  assert(almV2Js.includes('auditNextPageBottomBtn'));
  assert(indexHtml.includes('id="auditPrevPageBottomBtn"'));
  assert(almV2Js.includes('auditPrevPageBottomBtn'));
  assert(almV2Js.includes("clearAuditQuarantineV2"));
  assert(almV2Js.includes("startAuditProgressPollingV2"));
  assert(almV2Js.includes("requestIdleCallback"));
  assert(almV2Js.includes('loading="lazy" decoding="async" fetchpriority="low"'));
  assert(!style.includes(".audit-candidate:has("));
  assert(!style.includes(".audit-candidate-poster:not(:has("));
  assert(style.includes(".audit-pagination"));
});

check("Anime DNA : empreinte animée personnalisée", () => {
  assert(indexHtml.includes('id="dnaSignatureCanvas"'));
  assert(indexHtml.includes('id="dnaSignatureGenres"'));
  assert(indexHtml.includes('id="dnaSignatureMemories"'));
  assert(almV2Js.includes("function renderDnaSignatureV2"));
  assert(almV2Js.includes("dna-signature-memory"));
  assert(almV2Js.includes("Une empreinte animée unique"));
  assert(almV2Js.includes("requestAnimationFrame(draw)"));
  assert(read("public/style.css").includes(".dna-signature-stage"));
});

check("BetaSeries API reste optionnelle", () => {
  assert(indexHtml.includes('BetaSeries API'));
  assert(indexHtml.includes('settings-optional-badge">Optionnelle'));
  assert(indexHtml.includes("developers.betaseries.com/docs/getting-started/making-requests/"));
  assert(indexHtml.includes("optionnel") || indexHtml.includes("optionnelle"));
});

check("Dictionnaire : 161 termes uniques et huit catégories", () => {
  const entries = lexiconEntries();
  assert(Array.isArray(entries));
  assert.strictEqual(entries.length, 161);
  assert.strictEqual(new Set(entries.map(item => item.term.toLocaleLowerCase("fr"))).size, entries.length);
  assert.strictEqual(new Set(entries.map(item => item.category)).size, 8);
  for (const entry of entries) {
    assert(entry.term && entry.definition, `entree incomplete: ${JSON.stringify(entry)}`);
    assert.strictEqual(typeof entry.details, "string", `details invalides: ${entry.term}`);
    assert(Array.isArray(entry.aliases), `aliases invalides: ${entry.term}`);
    assert.strictEqual(typeof entry.confusion, "string", `confusion invalide: ${entry.term}`);
    assert.strictEqual(typeof entry.libraryGenre, "string", `libraryGenre invalide: ${entry.term}`);
  }
  const romcom = entries.find(entry => entry.term === "Com\u00e9die romantique");
  assert(romcom);
  assert(romcom.aliases.includes("romcom"));
  assert(romcom.confusion.includes("relation amoureuse"));
  assert.strictEqual(romcom.libraryGenre, "Romance");
});

check("Dictionnaire intégré à la navigation et à la bibliothèque", () => {
  assert(indexHtml.includes('id="navLexicon">📚 Dictionnaire'));
  assert(indexHtml.includes('id="lexiconPage"'));
  assert(indexHtml.includes("Dictionnaire / glossaire anime &amp; manga"));
  assert(indexHtml.includes('src="/lexicon.js"'));
  assert(almV2Js.includes('showV2Page("lexiconPage","navLexicon")'));
  assert(appJs.includes('"lexiconPage"'));
  assert(almV2Js.includes("window.openLibraryWithGenreV2"));
});

check("Dictionnaire adouci : galerie illustrée et navigation haut/bas", () => {
  const lexiconJs = read("public/lexicon.js");
  const css = read("public/style.css");
  assert(indexHtml.includes('id="lexiconCategoryGallery"'));
  assert(lexiconJs.includes("CATEGORY_VISUALS"));
  assert(lexiconJs.includes("lexicon-category-illustration"));
  assert(lexiconJs.includes("nocturne-term-art"), "les termes conservent un repère typographique dans la refonte Beta 32");
  assert(lexiconJs.includes("CATEGORY_ILLUSTRATIONS"));
  assert(lexiconJs.includes("lexicon-illustration-svg"));
  assert(css.includes(".lexicon-category-gallery"));
  assert(css.includes(".lexicon-illustration-svg.tile"));
  assert(css.includes("body.alm-view-lexiconPage .scroll-jump-controls"));
  const scrollJs = read("public/scroll-progress.js");
  assert(indexHtml.includes('src="/scroll-progress.js"'));
  assert(appJs.includes("window.ALM_SCROLL_PROGRESS?.mount()"));
  for(const id of ['scrollJumpControls','scrollJumpTop','scrollJumpBottom'])assert(scrollJs.includes("'"+id+"'"),id);
  assert(appJs.includes("options.okText || options.confirmText"), "les confirmations V2 doivent conserver leurs libellés d’action");
  assert(appJs.includes('ok.classList.toggle("danger"'), "les confirmations destructives doivent être distinguées visuellement");
});

check("Dictionnaire : exemples visuels issus de la metadata locale", () => {
  const entries = lexiconEntries();
  const examples = lexiconExamples();
  const terms = new Set(entries.map(item => item.term));
  assert(examples && typeof examples === "object");
  assert(Object.keys(examples).length >= 60, `seulement ${Object.keys(examples).length} termes illustrés`);
  for (const [term, ids] of Object.entries(examples)) {
    assert(terms.has(term), `terme d'exemple absent du dictionnaire: ${term}`);
    assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 2, `exemples invalides: ${term}`);
    assert(ids.every(id => Number.isInteger(Number(id)) && Number(id) > 0), `identifiant MAL invalide: ${term}`);
  }
  const sql = zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "data/database/metadata-full.sql.gz"))).toString("utf8");
  const requestedIds = new Set(Object.values(examples).flat().map(Number));
  const metadataExamples = new Map();
  for (const line of sql.split(/\r?\n/)) {
    const match = line.match(/VALUES \((\d+),/);
    if (!match || !requestedIds.has(Number(match[1]))) continue;
    const tuple = line.slice(line.indexOf("VALUES ") + 7);
    const values = splitSqlTuple(tuple);
    metadataExamples.set(Number(match[1]), values);
  }
  for (const id of requestedIds) {
    const values = metadataExamples.get(id);
    assert(values, `MAL ${id} absent de la metadata`);
    assert(/^https?:\/\//i.test(values[10] || ""), `MAL ${id} sans imageUrl exploitable`);
  }
  const lexiconJs = read("public/lexicon.js");
  assert(lexiconJs.includes("miniatures chargées à la demande"));
  assert(lexiconJs.includes('loading="lazy"'));
  assert(lexiconJs.includes("hydrateLexiconExamples"));
  assert(serverJs.includes('app.get("/api/v2/lexicon/examples"'));
  assert(serverJs.includes('app.get("/api/v2/lexicon/example-image/:malId"'));
  assert(serverJs.includes('cacheExternalImageStable(meta.imageUrl'));
});

check("Package Node 22 et fichiers de release", () => {
  assert.strictEqual(packageJson.engines?.node, ">=22.12.0");
  const files = packageJson.build?.files || [];
  for (const name of ["README.md", "LICENSE"]) {
    assert(files.includes(name), `fichier de release absent: ${name}`);
  }
});

check("Configuration Linux AppImage + DEB", () => {
  const build = packageJson.build || {};
  assert(build.linux);
  const targets = Array.isArray(build.linux.target) ? build.linux.target : [];
  assert(targets.includes("AppImage") && targets.includes("deb"));
  assert.strictEqual(build.linux.executableName, "anime-local-manager");
  // electron-builder 26.x attend directement les clés du fichier .desktop.
  assert.strictEqual(build.linux.desktop?.entry?.Name, "Anime Local Manager");
  assert(String(build.linux.desktop?.entry?.Categories || "").includes("Utility"));
  assert(String(build.linux.desktop?.entry?.Keywords || "").includes("anime"));
  assert(String(build.artifactName).includes("${version}"));
  assert((build.files || []).includes("lib/**/*"));
  assert((build.files || []).includes("README.md"));
  const hook = require(path.join(ROOT, "scripts/prepare-metadata-release.js"));
  assert.strictEqual(typeof hook, "function");
  assert.strictEqual(hook.default, hook);
  assert.strictEqual(typeof hook.prepareMetadataRelease, "function");
});

check("Jeu d’icônes Linux multi-résolution", () => {
  assert.strictEqual(packageJson.build?.linux?.icon, "build/icons");
  assert((packageJson.build?.files || []).includes("build/icons/**/*"));
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    const buffer = fs.readFileSync(path.join(ROOT, `build/icons/${size}x${size}.png`));
    assert(buffer.subarray(1, 4).toString("ascii") === "PNG", `${size}px: format invalide`);
    assert.strictEqual(buffer.readUInt32BE(16), size, `${size}px: largeur invalide`);
    assert.strictEqual(buffer.readUInt32BE(20), size, `${size}px: hauteur invalide`);
  }
});

check("Scripts Linux valides et portables entre Windows et Linux", () => {
  const isWindowsValidation = VERIFY_PLATFORM === "win32";

  for (const name of ["Creer App Linux.sh", "start_mac_linux.sh"]) {
    const file = path.join(ROOT, name);
    assert(fs.existsSync(file), `${name} absent`);

    const content = fs.readFileSync(file, "utf8");
    assert(content.startsWith("#!/usr/bin/env bash\n"), `${name}: shebang bash absent ou fins de ligne invalides`);
    assert(!content.includes("\r"), `${name}: fins de ligne CRLF détectées, utiliser LF`);
    assert(content.includes("set -Eeuo pipefail"), `${name}: mode bash strict absent`);

    // Le bit exécutable POSIX n'existe pas sous Windows et peut être perdu lors
    // de l'extraction d'un ZIP. Il ne doit donc jamais bloquer un build Windows.
    // Sous Linux/macOS, on le répare automatiquement avant de le contrôler.
    if (!isWindowsValidation) {
      if ((fs.statSync(file).mode & 0o111) === 0) fs.chmodSync(file, 0o755);
      assert(fs.statSync(file).mode & 0o111, `${name} non exécutable après correction`);

      const run = spawnSync("bash", ["-n", file], { encoding: "utf8" });
      assert(!run.error, `${name}: impossible de lancer bash (${run.error?.message || "erreur inconnue"})`);
      assert.strictEqual(run.status, 0, `${name}: ${(run.stderr || "").trim()}`);
    }
  }

  assert(read("README.md").includes("## Linux"));
  const builder = read("Creer App Linux.sh");
  assert(builder.includes('artifact_name="$(basename -- "$artifact")"'));
  assert(builder.includes("SHA256SUMS-V2.0.0-Beta-Stable.txt"));
});

check("Scripts Windows V2.0.0 Bêta stable", () => {
  for (const name of ["Publier Installateur Windows.bat", "REPRENDRE_BUILD_WINDOWS.bat"]) {
    const content = read(name);
    assert(content.includes("V2.0.0 Bêta stable"), `${name}: version absente`);
    assert(content.includes("Node.js 22"), `${name}: controle Node absent`);
    assert(content.includes("release-windows.js"), `${name}: publication centralisée absente`);
  }
  // Vérifie le constructeur local, les cibles et la propagation des erreurs,
  // plutôt qu'une ancienne forme littérale de commande npx.
  runNodeTestScript("scripts/test-build-windows-retry.js");
});

check("Release nettoyée des anciens rapports RC", () => {
  for (const name of [
    "CHECKUP_RC5.md", "CHECKUP_RC6.md", "CHECKUP_RC7.md", "CHECKUP_RC8.md",
    "TESTS_RC6.txt", "TESTS_RC7.txt", "TESTS_RC8.txt"
  ]) {
    assert(!fs.existsSync(path.join(ROOT, name)), `ancien fichier encore present: ${name}`);
  }
  // Les anciens rapports Beta 1 peuvent rester dans un dossier mis à jour par
  // extraction d'un patch. Ils ne font pas partie de la liste `build.files`
  // et ne doivent donc pas bloquer la publication de l'application.
  const releaseFiles = packageJson.build?.files || [];
  for (const name of [
    "CHECKUP_V2.0.0_BETA_STABLE.md", "TESTS_V2.0.0_BETA_STABLE.txt",
    "BUILD_LINUX_V2.0.0_BETA_STABLE.txt"
  ]) assert(!releaseFiles.includes(name), `ancien rapport inclus dans le paquet: ${name}`);
});

check("Electron : mono-instance, Wayland/X11 et données persistantes", () => {
  const main = read("main.js");
  assert(main.includes("requestSingleInstanceLock"));
  assert(main.includes('ozone-platform-hint", "auto"'));
  assert(main.includes("WaylandWindowDecorations"));
  assert(main.includes('app.getPath("userData")'));
  assert(main.includes("sandbox: true"));
  assert(main.includes("closeLocalServer"));
});

check("Snapshot metadata : gzip, schema, row count and manifest SHA-256", () => {
  const {inspectSnapshot} = require(path.join(ROOT, "lib/metadata-snapshot"));
  const manifest = JSON.parse(read("data/database/metadata-manifest.json"));
  const report = inspectSnapshot(path.join(ROOT, "data/database/metadata-full.sql.gz"), manifest);
  assert(report.rows >= 10000, "Snapshot too small for a public release");
});


check("Correctifs vidéo : saisons filtrées et ajout réversible", () => {
  const server = read("server.js");
  const ui = read("public/alm-v2.js");
  assert(server.includes("function classifySeasonCandidate"));
  assert(server.includes('key: "direct_sequel"') && server.includes('defaultSelected: true'));
  assert(server.includes('key: "special"') && server.includes('defaultSelected: false'));
  assert(server.includes('/api/news/undo-last-add'));
  assert(ui.includes("Inclure ce contenu lié"));
  assert(ui.includes("undoLastSeasonBulkAddV2"));
});

check("BetaSeries : répartition multi-saisons comportementale", () => {
  const { buildSeasonProgressPlan } = require(path.join(ROOT, "lib/betaseries-progress"));
  const entries = [12, 12, 13].map((episodesTotal, index) => ({ title: `Saison ${index + 1}`, episodesTotal }));

  let plan = buildSeasonProgressPlan("S02E02", entries.slice(0, 2));
  assert.deepStrictEqual(plan.records.map(row => [row.episodesSeen, row.status]), [[12, "Completed"], [2, "Watching"]]);

  plan = buildSeasonProgressPlan("S03E05", entries);
  assert.deepStrictEqual(plan.records.map(row => [row.episodesSeen, row.status]), [[12, "Completed"], [12, "Completed"], [5, "Watching"]]);

  plan = buildSeasonProgressPlan("S01E24", entries.slice(0, 2));
  assert.deepStrictEqual(plan.records.map(row => row.episodesSeen), [12, 12]);
  assert(plan.records.every(row => row.episodesSeen <= row.episodesTotal));

  plan = buildSeasonProgressPlan("S01E13", entries.slice(0, 2));
  assert.deepStrictEqual(plan.records.map(row => row.episodesSeen), [12, 1]);
});

check("BetaSeries : intégration réelle sans suite inventée", () => {
  const output = runNodeTestScript("scripts/test-betaseries-progress-runtime.js");
  assert(output.includes("BetaSeries progress runtime: OK"));
});

check("Complétion, exclusions et candidats : régressions comportementales", () => {
  const output = runNodeTestScript("scripts/test-core-regressions-runtime.js");
  assert(output.includes("Core regressions runtime: OK"));
});

check("Complétion : règles strictes câblées dans les jobs", () => {
  const server = read("server.js");
  assert(server.includes("function animeInfoCompleteness"));
  assert(server.includes("function animeFullCompleteness"));
  assert(server.includes("hasCompletionIssue(anime, kind)"));
  assert(server.includes("job.incomplete"));
});

check("Correctifs vidéo : actualités rapides et lecture nettoyée", () => {
  const server = read("server.js");
  const ui = read("public/alm-v2.js");
  assert(server.includes('req.query.quick === "1"'));
  assert(server.includes("refreshDue"));
  assert(ui.includes("newsArticleTextMarkupV2"));
  assert(read("public/beta45.js").includes("newsImageFailed"));
});

check("Exceptions hors anime exclues de toutes les fonctions anime", () => {
  const server = read("server.js");
  const ui = read("public/alm-v2.js");
  assert(server.includes("function isAnimeFeatureEligible"));
  assert((server.match(/filter\(isAnimeFeatureEligible\)/g) || []).length >= 8, "filtre serveur insuffisamment centralisé");
  assert(ui.includes("function getAnimeFeatureAnimesV2"));
  assert((ui.match(/getAnimeFeatureAnimesV2\(\)/g) || []).length >= 3, "DNA/recommandations n'utilisent pas tous la bibliothèque anime filtrée");
  assert(read("lib/media-classifier.js").includes('mediaKind: "manual"'));
});

check("Correctifs vidéo : import et recommandations simplifiés", () => {
  const app = read("public/app.js");
  const reco = read("public/alm-v2.js");
  assert(!app.includes('showProgress("Import CSV en cours...")'));
  assert(reco.includes("reco-select-state"));
  assert(reco.includes('autocomplete="off"'));
  assert(!reco.includes('list="reco-${kind}-list"'));
  assert(reco.includes('Terminé') && reco.includes('À voir'));
});

check("Import CSV : annulation réelle et aucun résultat partiel", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  const server = read("server.js");
  assert(html.includes('id="cancelCsvAnalysis"'));
  assert(app.includes("activeCsvAnalysis"));
  assert(app.includes("async function cancelCsvAnalysis"));
  assert(server.includes('/api/import/csv/cancel/:id'));
  const output = runNodeTestScript("scripts/test-csv-cancel-runtime.js");
  assert(output.includes("CSV cancellation runtime: OK"));
});

check("Import BetaSeries : progression visible et attente réseau bornée", () => {
  const app = read("public/app.js");
  const server = read("server.js");
  assert(app.includes("activeCsvImport"));
  assert(app.includes("async function pollCsvImportProgress"));
  assert(app.includes("progressId: progressId") || app.includes("items: selected, progressId"));
  assert(app.includes("Annuler l’import"));
  assert(server.includes("boundedNetwork: true"));
  assert(server.includes("ALM_BETASERIES_IMPORT_NETWORK_BUDGET_MS"));
  assert(server.includes("jikanFallbackLimit: 0"));
  const output = runNodeTestScript("scripts/test-csv-import-progress-runtime.js");
  assert(output.includes("CSV import progress runtime: OK"));
});

check("Nouvelles saisons : pourcentage de phase fondé sur les lots", () => {
  const server = read("server.js");
  assert(server.includes("relationBatchesDone"));
  assert(server.includes("relationBatchesTotal"));
  assert(server.includes("phasePercent = relationTotal > 0"));
});

check("Actualités : nouvelle tentative d’image par clé stable", () => {
  const ui = read("public/alm-v2.js");
  assert(ui.includes("_newsLastRenderedItems"));
  assert(ui.includes("newsKeyV2(renderedItem, renderedIndex)"));
  assert(ui.includes("_newsCache.find(item => newsKeyV2(item) === renderedKey)"));
});

check("Contrôle anime : anciens faux candidats invalidés", () => {
  const { candidateTitleScore } = require(path.join(ROOT, "lib/media-classifier"));
  assert.strictEqual(candidateTitleScore("Avatar: The Last Airbender", { title: "Quanzhi Gaoshou Specials" }), 0);
  const output = runNodeTestScript("scripts/test-audit-runtime.js");
  assert(output.includes("OK runtime Contrôle anime"));
});

check("Navigation : chaque page principale revient en haut", () => {
  const ui = read("public/alm-v2.js");
  const app = read("public/app.js");
  assert(ui.includes("function resetTopLevelScrollV2"));
  assert(ui.includes("requestAnimationFrame(reset)"));
  const showPage = ui.match(/function showV2Page\([\s\S]*?\n}/)?.[0] || "";
  assert(showPage.includes("resetTopLevelScrollV2(pageId)"));
  assert((app.match(/window\.resetTopLevelScrollV2/g) || []).length >= 4, "Accueil/À propos/Mes animés/Dons ne réinitialisent pas tous le scroll");
  for (const id of ["dnaPage", "newsV2Page", "recoPage", "seasonNewsPage", "lexiconPage", "auditPage"]) {
    assert(ui.includes(`showV2Page("${id}"`), `navigation absente: ${id}`);
  }
});

check("Correctifs vidéo : finitions interface française", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert(html.includes('id="navSeasonNews"'), 'La page Nouvelles saisons reste disponible dans le menu');
  assert(!html.includes('id="seasonNewsBtn"'), 'Le raccourci redondant est retiré des outils de bibliothèque');
  assert(html.includes('<p><strong>Site web dédié :</strong> <a href="https://animelocalmanager.com/"'));
  assert(app.includes('"Award Winning": "Primé"'));
  assert(app.includes('"Slice of Life": "Tranche de vie"'));
});

check("Beta 9 : bannière anti-répétition liée à la bibliothèque", () => {
  assert(appJs.includes("COMPLETION_BANNER_SNOOZE_KEY"));
  assert(appJs.includes("completionLibraryFingerprint"));
  assert(appJs.includes("rememberCompletionBannerSnooze(168)"));
  assert(appJs.includes("completionBannerIsSnoozed()"));
});

check("Beta 9 : Actualités sans faux état vide au premier rafraîchissement", () => {
  assert(almV2Js.includes('params.set("background", "1")'));
  assert(almV2Js.includes("!_newsCache.length && data.refresh?.pending"));
  assert(almV2Js.includes("Actualiser les sources"));
});

check("Beta 9 : Contrôle anime filtre les TV certaines sans rechargement bloquant", () => {
  assert(serverJs.includes("function mediaReviewIsCertainGeneralTv"));
  assert(serverJs.includes('state: "auto_excluded"') || serverJs.includes('next.state = "auto_excluded"'));
  assert(almV2Js.includes("window.markAnimeLibraryStale?.()"));
  const actionStart = almV2Js.indexOf("async function handleAuditActionV2");
  const actionEnd = almV2Js.indexOf("async function clearAuditQuarantineV2", actionStart);
  const actionBody = almV2Js.slice(actionStart, actionEnd);
  assert(!actionBody.includes("await window.reloadAnimeLibrary()"));
});

check("Beta 10 : périodes Actualités filtrées localement et CTA héros cohérent", () => {
  const queryFn = almV2Js.match(/function buildNewsQueryParamsV2\([\s\S]*?\n}/)?.[0] || "";
  assert(queryFn.includes('params.set("limit"'));
  for (const serverFilter of ['params.set("lang"', 'params.set("category"', 'params.set("from"', 'params.set("to"']) {
    assert(!queryFn.includes(serverFilter), `filtre serveur encore présent: ${serverFilter}`);
  }
  assert(almV2Js.includes("function setNewsQuickRangeV2"));
  assert(almV2Js.includes("filteredNewsV2().length"));
  assert(almV2Js.includes("✓ Article affiché à droite"));
  assert(almV2Js.includes("Lire dans le panneau"));
});

check("Beta 10 : Dictionnaire retrouve Shounen et les genres bibliothèque", () => {
  const lexicon = read("public/lexicon.js");
  assert(lexicon.includes('["shonen", "shounen", "少年"]'));
  assert(lexicon.includes("entryData.libraryGenre"));
  const shonen = lexiconEntries().find(item => item.term === "Shōnen");
  assert(shonen, "entrée Shōnen absente");
  assert((shonen.aliases || []).includes("shounen"));
  assert.strictEqual(shonen.libraryGenre, "Shounen");
});

check("Beta 13 : progression réelle du Contrôle anime", () => {
  assert(indexHtml.includes('id="auditProgressBar"'));
  assert(indexHtml.includes('id="auditProgressPercent"'));
  assert(indexHtml.includes('id="auditProgressCurrent"'));
  assert(serverJs.includes("setContentAuditProgress"));
  assert(serverJs.includes('phase: "library"'));
  assert(serverJs.includes('phase: "quarantine"'));
  assert(almV2Js.includes("updateAuditProgressUiV2"));
  assert(almV2Js.includes("startAuditProgressPollingV2"));
});

check("Beta 13 : Contrôle anime évite les gels de scroll et de décision", () => {
  const style = read("public/style.css");
  const dbJs = read("db.js");
  assert(almV2Js.includes("const AUDIT_PAGE_SIZE = 8"));
  assert(!almV2Js.includes("current.replaceWith(next)"));
  assert(almV2Js.includes("auditSetResolvedPosterV2"));
  assert(almV2Js.includes("requestIdleCallback"));
  assert(serverJs.includes('save: "memory"'));
  assert(dbJs.includes('options.save === "memory"'));
  assert(dbJs.includes("function _syncAnimesFromJsonIfNewer"));
  const refreshStart = serverJs.indexOf("async function refreshAfterMediaReviewMutation");
  const refreshEnd = serverJs.indexOf('app.get("/api/v2/content-audit/progress"', refreshStart);
  const refreshBody = serverJs.slice(refreshStart, refreshEnd);
  assert(!refreshBody.includes("scheduleMediaReviewAliasRefresh"));
  const resolveStart = serverJs.indexOf('app.post("/api/v2/content-audit/images/resolve"');
  const resolveEnd = serverJs.indexOf('app.post("/api/v2/content-audit/quarantine/action"', resolveStart);
  const resolveBody = serverJs.slice(resolveStart, resolveEnd);
  assert(!resolveBody.includes("enrichMediaReviewStateLocal(state"));
  assert(style.includes("content-visibility: auto"));
  assert(style.includes("contain: layout paint style"));
});

check("Beta 13 : logo, À propos, installateur et karaoké finalisés", () => {
  const style = read("public/style.css");
  const karaoke = read("public/karaoke.js");
  assert(style.includes('.side-brand img'));
  assert(style.includes('object-fit: contain'));
  assert(indexHtml.includes("bêta stable — phase de validation utilisateur"));
  assert(indexHtml.includes("API BetaSeries est optionnelle"));
  assert(indexHtml.includes("historique des actualités"));
  assert(indexHtml.includes('id="donationKaraokeClip"'));
  assert(indexHtml.includes('id="donationKaraokeBall"'));
  assert(indexHtml.includes('id="donationKaraokeJaLine"'));
  assert(indexHtml.includes('id="donationKaraokeFrLine"'));
  assert(indexHtml.includes('id="donationKaraokeMode"'));
  assert(indexHtml.includes('src="/karaoke.js"'));
  assert(indexHtml.includes("物語が息づく場所"));
  assert(karaoke.includes("requestAnimationFrame"));
  assert(karaoke.includes("media.currentTime"));
  assert(karaoke.includes("translate3d"));
  assert(karaoke.includes("prefers-reduced-motion"));
  assert(fs.existsSync(path.join(ROOT, "public/assets/alm-clip-complet-1080p.mp4")));
  assert(fs.existsSync(path.join(ROOT, "public/karaoke/song.json")));
  assert(packageJson.build?.nsis?.runAfterFinish === false, "l'installateur NSIS ne doit pas lancer l'application à la fin");
});

check("Beta 14 : timeline karaoké ancrée sur l’enregistrement réel", () => {
  const song = JSON.parse(read("scripts/fixtures/karaoke/song.beta36-backup.json"));
  const lines = (song.sections || []).flatMap(section => section.lines || []);
  assert.strictEqual(song.title, "物語が息づく場所");
  assert.strictEqual(song.duration, 210);
  assert.strictEqual(lines.length, 42, "la timeline audio-first beta.23 doit contenir uniquement les 42 lignes confirmées par la nouvelle référence");
  assert.strictEqual(lines[0].ja, "幾千の世界が　画面の中に");
  assert.strictEqual(lines.at(-1).ja, "消えないように……");
  assert(lines.every(line => line.fr && line.fr.length > 2), "traduction française manquante");
  assert(lines.every(line => Array.isArray(line.jaUnits) && line.jaUnits.length && line.jaUnits.map(x => x.text).join("") === line.ja), "découpage japonais invalide");
  assert(lines.every(line => Array.isArray(line.romajiUnits) && line.romajiUnits.length === line.jaUnits.length), "découpage romaji invalide");
  assert(lines.every(line => String(line.romaji || "").trim()), "romaji complet manquant");
  assert(lines.every(line => Array.isArray(line.frUnits) && line.frUnits.length), "découpage français invalide");
  assert(lines.every(line => line.start >= 0 && line.end > line.start && line.end <= song.duration), "fenêtre temporelle invalide");
  for (const line of lines) {
    for (const units of [line.jaUnits, line.frUnits]) {
      let previous = line.start - 0.001;
      for (const unit of units) {
        assert(unit.start >= line.start - 0.001 && unit.end <= line.end + 0.001 && unit.end > unit.start, "timing mot hors ligne");
        assert(unit.start >= previous - 0.001, "timings non monotones");
        previous = unit.start;
      }
    }
  }
  assert(song.reviewStatus === "needs-human-audio-review", "la source audio des timings doit être documentée");
  assert.strictEqual(song.schemaVersion, 5);
  assert(fs.existsSync(path.join(ROOT, "scripts/fixtures/karaoke/song.beta13-backup.json")), "backup de la timeline Beta 13 absent");
  const alm = lines.filter(line => line.ja === "Anime Local Manager");
  assert.strictEqual(alm.length, 4, "les quatre Anime Local Manager réellement chantés doivent être présents");
  assert(Math.abs(alm[0].start - 60.81) < 0.001);
  assert(Math.abs(alm[2].start - 163.30) < 0.001);
  assert(Math.abs(alm[3].start - 181.08) < 0.001);
  assert(!song.sections.some(section => section.id === "chorus2"), "le refrain écrit mais non chanté ne doit plus être forcé");
  assert(!lines.some(line => ["ひとつの名前　ひとつの色","想像の地図を　描いてゆく","エピソードが物語を紡ぎ","夜を駆ける","恋と冒険　星々の彼方","数えきれない物語……","まだ見ぬ世界へ……","あの物語"].includes(line.ja)), "les lignes non retenues par la référence Eleven/audio ne doivent pas être forcées");
  assert.strictEqual(song.pendingInsertions.length, 2, "untimed missing phrases must remain explicitly pending");
  assert.strictEqual(lines.filter(line => line.review).length, 5, "Five readings remain uncertain after user confirmations of 2026-09-12");
  assert(!lines.some(line => line.romaji === "Boku no toshokan kokoro no ibasho"));
  assert(lines.some(line => line.ja === "ひとつの知らせが"), "la ligne courte Hitotsu no shirase ga doit être conservée");
  assert(!lines.some(line => line.ja === "ひとつの知らせが　夜を駆ける"), "yoru o kakeru ne doit plus être forcé");
  assert(fs.existsSync(path.join(ROOT, "scripts/fixtures/karaoke/song.beta20-backup.json")), "backup de la timeline Beta 20 absent");
});


check("Beta 13 : ajout manuel vérifiable et non silencieux", () => {
  const appJs = read("public/app.js");
  assert(serverJs.includes("searchAnimeForManualAddV2"));
  assert(serverJs.includes("manualAddFindExistingV2"));
  assert(serverJs.includes("_addOutcome"));
  assert(serverJs.includes("La fiche n'a pas pu être retrouvée après son enregistrement"));
  assert(serverJs.includes("scheduleManualAddEnrichmentV2"));
  assert(serverJs.includes('{ save: "deferred", delayMs: 12000 }'));
  assert(serverJs.includes('path.join(__dirname, "data", "aliases-anime.json")'));
  assert(appJs.includes("Ajouté à Mes animés"));
  assert(appJs.includes("Déjà présent dans Mes animés"));
  assert(appJs.includes("n'apparaît pas dans la bibliothèque après rechargement"));
  const sql = zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "data/database/metadata-full.sql.gz"))).toString("utf8");
  assert(sql.includes("'Yomi no Tsugai'"), "Yomi no Tsugai doit être présent dans la metadata locale");
});

check("Beta 13 : ajout manuel couvert par un test runtime", () => {
  const runtime = read("scripts/test-manual-add-runtime.js");
  const aliases = JSON.parse(read("data/aliases-anime.json"));
  assert(runtime.includes("i became a legend after my 10 years"));
  assert(runtime.includes("yomi no tsugai"));
  assert(runtime.includes("Réseau simulé indisponible"));
  assert(runtime.includes("_addOutcome"));
  const verificationPlan = JSON.parse(read("scripts/verification-plan.json"));
  assert.strictEqual(packageJson.scripts?.verify, "node scripts/verify-project.js");
  assert(verificationPlan.steps?.includes("scripts/test-manual-add-runtime.js"), "le test runtime + Ajouter doit faire partie de npm run verify");
  assert(aliases?.aliases?.["i became a legend after my 10 years"] || aliases?.items?.["i became a legend after my 10 years"] || aliases?.["i became a legend after my 10 years"], "alias du titre court 10 years absent");
  assert(aliases?.aliases?.["yomi no tsugai"] || aliases?.items?.["yomi no tsugai"] || aliases?.["yomi no tsugai"], "alias Yomi no Tsugai absent");
});

check("Beta 13 : Contrôle anime recherche et accès direct aux pages", () => {
  assert(indexHtml.includes('id="auditSearchInput"'));
  assert(indexHtml.includes('id="auditFirstPageBtn"'));
  assert(indexHtml.includes('id="auditLastPageBtn"'));
  assert(indexHtml.includes('id="auditPageSelect"'));
  assert(almV2Js.includes("auditNormalizeSearchV2"));
  assert(almV2Js.includes("auditGoToPageV2"));
  assert(almV2Js.includes("auditRenderQuarantinePageV2"));
  assert(almV2Js.includes("cards.slice(0, 2)"), "la résolution automatique des jaquettes doit rester volontairement limitée");
  assert(serverJs.includes("Répondre au renderer avant les écritures d'alias"));
});

check("Beta 37 : clip complet et une seule horloge, sans réglage de synchro grand public", () => {
 const karaoke=read('public/karaoke.js'),song=JSON.parse(read('public/karaoke/song.json'));
 assert.equal(song.media,'/assets/alm-clip-complet-1080p.mp4');
 assert(!indexHtml.includes('id="donationKaraokeAudio"'));
 for(const key of ['Minus','Plus','Reset'])assert(!indexHtml.includes('id="donationKaraokeSync'+key+'"'));
 assert(karaoke.includes('if (!devEnabled) localStorage.removeItem("alm.karaoke.offsetMs")'));
 assert(karaoke.includes('media.playbackRate = 1'));
 const head=Buffer.alloc(16),fd=fs.openSync(path.join(ROOT,'public/assets/alm-clip-complet-1080p.mp4'),'r');fs.readSync(fd,head,0,16,0);fs.closeSync(fd);assert.equal(head.toString('ascii',4,8),'ftyp');
});

check("Beta 14 : Recommandations revient réellement en haut après reconstruction", () => {
  assert(almV2Js.includes('await initRecommendations();'));
  assert(almV2Js.includes('resetTopLevelScrollV2("recoPage")'));
  assert(almV2Js.includes('setTimeout(()=>resetTopLevelScrollV2("recoPage"),80)'));
});

check("Beta 15 : bannière de complétion ne boucle plus sur une fiche inchangée", () => {
  assert(serverJs.includes("animeCompletionSignature"));
  assert(serverJs.includes("autoCompletionAttemptIsCurrent"));
  assert(serverJs.includes("autoCompletionSignature = animeCompletionSignature(currentAnime)"));
  assert(serverJs.includes("alreadyTriedSameState"));
  const testApi = require(path.join(ROOT, "lib", "completion-state.js"));
  const anime = {
    title: "Test incomplet",
    type: "TV",
    malId: 123,
    genres: ["Fantasy"],
    synopsis: "Synopsis suffisamment long pour être utile mais sans date ni total d'épisodes.",
    imageUrl: "https://example.invalid/poster.jpg",
    status: "Watching"
  };
  anime.autoCompletionSignature = testApi.animeCompletionSignature(anime);
  assert.strictEqual(testApi.autoCompletionAttemptIsCurrent(anime), true);
  anime.startDate = "2025-01-01";
  assert.strictEqual(testApi.autoCompletionAttemptIsCurrent(anime), false, "une modification réelle doit réactiver le diagnostic");
});

check("Beta 15 : karaoké japonais + romaji + français à fort contraste", () => {
  const karaoke = read("public/karaoke.js");
  const style = read("public/style.css");
  const song = JSON.parse(read("public/karaoke/song.json"));
  const lines = (song.sections || []).flatMap(section => section.lines || []);
  assert(indexHtml.includes('id="donationKaraokeOriginalLine"'));
  assert(indexHtml.includes('aria-label="Paroles en romaji à chanter"'));
  assert(karaoke.includes("line.romajiUnits"));
  assert(karaoke.includes("karaoke-romaji-unit"));
  assert(style.includes(".donation-karaoke-original"));
  assert(style.includes(".karaoke-romaji-unit.romaji-active"));
  assert(style.includes("#facc15"), "accent or du karaoké absent");
  assert(lines.length === 48 && lines.every(line => line.romaji && line.romajiUnits?.length > 0 && line.jaUnits?.length > 0));
});

check("Beta 15 : articles agrandis remis en paragraphes lisibles", () => {
  const style = read("public/style.css");
  assert(almV2Js.includes("cleanNewsArticleBodyV2"));
  assert(almV2Js.includes("news-reader-lead"));
  assert(almV2Js.includes("news-reader-bullets"));
  assert(almV2Js.includes("Une ou deux phrases, ~340 caractères maximum par bloc"));
  assert(style.includes("max-width: 78ch"));
  assert(style.includes(".news-reader-bullets"));
});

check("Beta 15 : suggestions de recherche dans les Recommandations", () => {
  const style = read("public/style.css");
  assert(almV2Js.includes("recoSearchCandidatesV2"));
  assert(almV2Js.includes("renderRecoSuggestionsV2"));
  assert(almV2Js.includes("reco-search-suggestions"));
  assert(almV2Js.includes('event.key === "ArrowDown"'));
  assert(almV2Js.includes('event.key === "ArrowUp"'));
  assert(style.includes(".reco-search-suggestion"));
});


check("Beta 17 : bannière de complétion respecte réellement le snooze/navigation", () => {
  const appJs = read("public/app.js");
  assert(appJs.includes("rememberCompletionBannerSnooze(hours = 168)"));
  assert(appJs.includes("setTimeout(checkCompletionBanner, 80)"));
  assert(serverJs.includes("const retryCooldownMs = 7 * 24 * 60 * 60 * 1000"));
  assert(serverJs.includes("isMinorCompletionGapForBanner"));
  assert(almV2Js.includes('document.getElementById("completionBanner")?.classList.add("hidden")'));
  assert(!almV2Js.includes('completionBanner")?.classList.toggle("hidden", Boolean(window.__almBulkJobRunning))'));
});

check("Beta 17 : Distribution Anime DNA ouvre les animés par note", () => {
  const appJs = read("public/app.js");
  const style = read("public/style.css");
  assert(almV2Js.includes("data-dna-personal-score"));
  assert(almV2Js.includes("window.showLibraryByPersonalScore"));
  assert(appJs.includes("activePersonalScoreFilter"));
  assert(appJs.includes("showLibraryByPersonalScore"));
  assert(appJs.includes("activeScoreFilterChip"));
  assert(indexHtml.includes("Clique sur une note pour ouvrir les animés correspondants"));
  assert(style.includes("button.dna-score-column.is-clickable"));
});

check("Beta 17 : Réglages regroupés en menus repliables", () => {
  const style = read("public/style.css");
  const topLevel = (indexHtml.match(/<details class="settings-section settings-disclosure">/g) || []).length;
  assert.strictEqual(topLevel, 4);
  for (const id of ["exportBackup", "restoreBackup", "betaseriesApiKey", "metadataSettingsStatus", "clearNewsCache"]) {
    assert(indexHtml.includes(`id="${id}"`), `réglage perdu: ${id}`);
  }
  assert(style.includes(".settings-disclosure > summary"));
  assert(style.includes(".settings-summary-chevron"));
});

check("Beta 17 : import BetaSeries en deux colonnes et résultats filtrables", () => {
  const appJs = read("public/app.js");
  const style = read("public/style.css");
  assert(indexHtml.includes('class="csv-import-workspace"'));
  assert(indexHtml.includes('id="csvResultsPanel"'));
  assert(indexHtml.includes('id="csvResultsSearch"'));
  assert(appJs.includes("data-csv-summary-filter"));
  assert(appJs.includes("setCsvPreviewFilter"));
  assert(appJs.includes("csvPreviewItems.filter(item => item?.__selected === true)"));
  assert(style.includes("grid-template-columns: minmax(300px, .66fr) minmax(720px, 1.78fr)"));
});

check("Beta 17 : articles longs encore plus aérés", () => {
  const style = read("public/style.css");
  assert(almV2Js.includes("~340 caractères maximum par bloc"));
  assert(almV2Js.includes("news-reader-credit"));
  assert(style.includes("max-width: 74ch"));
  assert(style.includes(".news-reader-text .news-reader-credit"));
});

check("Copie de publication exclue des contrôles des sources", () => {
  const directory = fs.mkdtempSync(path.join(require("os").tmpdir(), "alm-source-scan-"));
  const stage = path.join(directory, ".release-work", "0dbcc3ff3a0c3f99e4a8", "project");
  try {
    fs.mkdirSync(stage, { recursive: true });
    fs.mkdirSync(path.join(directory, "docs"));
    fs.writeFileSync(path.join(directory, "README.md"), "Documentation du projet\n");
    fs.writeFileSync(path.join(directory, "docs", "NOTICE.md"), "Autre documentation source\n");
    fs.writeFileSync(path.join(directory, "app.js"), '"use strict";\n');
    fs.writeFileSync(path.join(stage, "README.md"), "Copie temporaire\n");
    fs.writeFileSync(path.join(stage, "incomplete.js"), "const =;\n");
    const relativeFiles = extension => walk(directory, file => file.endsWith(extension))
      .map(file => path.relative(directory, file).split(path.sep).join("/")).sort();
    assert.deepStrictEqual(relativeFiles(".md"), ["README.md", "docs/NOTICE.md"]);
    assert.deepStrictEqual(relativeFiles(".js"), ["app.js"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

check("Documentation V2, archives techniques et maintenance accessibles", () => {
  const readme = read("README.md");
  // Garder la liste *exacte* des documents de livraison et de contribution.
  // Toute documentation ajoutée pour l'open source doit être revue ici.
  const docs = walk(ROOT, file => file.endsWith(".md")).map(rel).sort();
  assert.deepStrictEqual(docs, [
    "CONTRIBUTING.md",
    "README.md",
    "SECURITY.md",
    "docs/BETA82-PROFILAGE-SECURITE-2026-10-24.md",
    "docs/BETA82-RECETTE-PREPUBLICATION.md",
    "docs/CORRECTIF-UX-2026-10-24.md",
    "docs/ELECTRON-45.2.1-RECETTE-ET-PUBLICATION.md",
    "docs/HARMONISATION-AFFICHAGE-PUBLICATION-V200-2026-10-25.md",
    "docs/PUBLICATION-OPEN-SOURCE-V2.md",
    "docs/RECETTE-V200-BETA-STABLE-2026-10-25.md",
    "docs/RELEASE-CHECKUP-2026-10-25.md",
    "docs/RELEASE-NOTES-V2.0.0-BETA.md",
    "docs/SIGNPATH-OPEN-SOURCE.md",
  ]);
  // La release V2 doit inclure des notes de version utilisables par les lecteurs GitHub.
  const releaseNotes = read("docs/RELEASE-NOTES-V2.0.0-BETA.md");
  assert(releaseNotes.includes("Bêta stable") && releaseNotes.includes("Windows NSIS x64"));
  assert(readme.includes("docs/"), "Le README doit rendre les archives techniques accessibles");
  const profilage = read("docs/BETA82-PROFILAGE-SECURITE-2026-10-24.md");
  assert(profilage.includes("safeStorage") && profilage.includes("test-beta82-safe-storage.cjs"));
  // Les archives historiques restent testées sans imposer leurs titres dans le README public.
  const recette = read("docs/BETA82-RECETTE-PREPUBLICATION.md");
  assert(recette.includes("Beta 82") && recette.includes("Verifier Beta82 Windows.bat"));
  assert(readme.includes("docs/RELEASE-NOTES-V2.0.0-BETA.md"), "Notes V2 absentes du README");
  const correctif = read("docs/CORRECTIF-UX-2026-10-24.md");
  assert(correctif.includes("Mes souvenirs") && correctif.includes("Windows"));
  assert(readme.includes("docs/PUBLICATION-OPEN-SOURCE-V2.md"), "Documentation des sources V2 absente du README");
  const finalCheckup = read("docs/RELEASE-CHECKUP-2026-10-25.md");
  assert(finalCheckup.includes("Windows") && finalCheckup.includes("Supabase"));
  assert(readme.includes("[`docs/`](docs/)"), "Lien vers les archives historiques absent du README");
  assert(readme.includes(packageJson.version));
  for (const command of ["npm ci", "npm run app", "npm run verify", "npm run build:community"]) assert(readme.includes(command));
  for (const file of ["Publier Installateur Windows.bat", "REPRENDRE_BUILD_WINDOWS.bat"]) assert(readme.includes(file));
  assert(readme.includes("AppImage") && readme.includes("DEB"));
  assert(readme.includes("Sauvegardes") && readme.includes("Confidentialité"));
});

console.log("Anime Local Manager V2.0.0 Bêta stable — validation technique\n");
for (const line of results) console.log(line);
console.log(`\n${results.length - failures}/${results.length} contrôles réussis.`);
if (failures) process.exitCode = 1;
