/**
 * csv-worker.js — Worker thread pour l'analyse CSV BetaSeries
 * Tourne dans un thread séparé : l'UI ne freeze plus pendant l'analyse.
 * Communication via parentPort.postMessage()
 */

require('./lib/rescue-mode').bootstrap();
const { workerData, parentPort } = require("worker_threads");
const fs   = require("fs");
const path = require("path");
const mediaClassifier = require("./lib/media-classifier");
const candidateValidation=require('./lib/import-candidate-validation');
const titleIndexApi=require('./lib/catalogue-title-index');
const {sourceState}=require('./lib/betaseries-import-shape');
const {csvTvBudget}=require('./lib/csv-network-budget');

const {
  rows,
  matchingCache,
  betaFastCache,
  config,
  dataDir
} = workerData;

let cancelRequested = false;
const explicitDeadline=Number(workerData.deadlineAt)||0;
const initialNetworkBudget=explicitDeadline?Math.max(1,explicitDeadline-Date.now()):30000;
let deadlineAt=explicitDeadline||Date.now()+30000;
const nativeFetch=global.fetch;
const workerAniListFetch=require('./lib/anilist-fetch').createAniListFetch({fetchImpl:nativeFetch});
const workerMetadataProviders=require('./lib/metadata-providers').createMetadataProviders({
  getClientId:()=>config?.malClientId||process.env.ALM_MAL_CLIENT_ID||'',
  fetchText:(url,options)=>require('./lib/bounded-text-fetch').boundedTextFetch(url,{...options,fetchImpl:fetch})
});
const sourceSlots=new Map();
const networkExpired=()=>Date.now()>=deadlineAt || cancelRequested;
async function fetch(url, options={}) {
  if(networkExpired())throw Error("ALM_IMPORT_NETWORK_DEFERRED");
  const host=new URL(url).hostname, delay=host==="graphql.anilist.co"?2100:host==="api.jikan.moe"?360:0;
  if(delay){const slot=Math.max(Date.now(),sourceSlots.get(host)||0);sourceSlots.set(host,slot+delay);if(slot>=deadlineAt)throw Error("ALM_IMPORT_NETWORK_DEFERRED");if(slot>Date.now())await sleep(slot-Date.now());}
  if(networkExpired())throw Error("ALM_IMPORT_NETWORK_DEFERRED");
  const signal=AbortSignal.timeout(Math.max(1,Math.min(6500,deadlineAt-Date.now())));
  const combinedSignal=options.signal?AbortSignal.any([options.signal,signal]):signal;
  return (host==='graphql.anilist.co'?workerAniListFetch:nativeFetch)(url,{...options,signal:combinedSignal});
}
parentPort.on("message", message => {
  if (message?.type === "cancel") cancelRequested = true;
});

// ─────────────────────────────────────────────
// Utilitaires (dupliqués depuis server.js pour l'isolation du worker)
// ─────────────────────────────────────────────
async function sleep(ms) {
  const until=Date.now()+Math.max(0,Math.min(Number(ms)||0,deadlineAt-Date.now()));
  // Provider retry delays must also honour cancellation and the phase budget.
  while(Date.now()<until&&!networkExpired())await new Promise(resolve=>setTimeout(resolve,Math.min(100,until-Date.now())));
}

function normalizeTitle(title) { return String(title || "").trim().toLowerCase(); }

function normalizeCacheLookupKey(title) {
  return String(title || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeAliasKey(t) { return normalizeCacheLookupKey(t); }

function sqlJsDistCandidatesWorker() {
  const candidates = [];
  const add = (dir) => { if (dir && !candidates.includes(dir)) candidates.push(dir); };
  try { add(path.dirname(require.resolve("sql.js/dist/sql-wasm.wasm"))); } catch {}
  try { add(path.dirname(require.resolve("sql.js/dist/sql-wasm.js"))); } catch {}
  try { add(path.join(path.dirname(require.resolve("sql.js")), "dist")); } catch {}
  add(path.join(__dirname, "node_modules", "sql.js", "dist"));
  if (process.resourcesPath) {
    add(path.join(process.resourcesPath, "app", "node_modules", "sql.js", "dist"));
    add(path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sql.js", "dist"));
  }
  return candidates;
}

function locateSqlJsWorkerFile(file) {
  for (const dir of sqlJsDistCandidatesWorker()) {
    const candidate = path.join(dir, file);
    try { if (fs.existsSync(candidate)) return candidate; } catch {}
  }
  return file;
}

let _metadataDbPromise = null;
let _metadataDb = null;
let _metadataReady = false;
let _titleIndex=null;
function buildWorkerTitleIndex(){
 if(!_metadataReady||_titleIndex)return;
 let stmt;const values=[];try{stmt=_metadataDb.prepare('SELECT * FROM metadata');while(stmt.step())values.push(metadataRowWorker(stmt.getAsObject()));_titleIndex=titleIndexApi.build(values);}finally{stmt?.free();}
}

async function ensureMetadataDb() {
  if (_metadataDbPromise) return _metadataDbPromise;
  _metadataDbPromise = (async () => {
    try {
      const catalogue = path.join(dataDir, "catalogue.sqlite");
      const sqliteFile = fs.existsSync(catalogue) ? catalogue : path.join(dataDir, "animes.sqlite");
      if (!fs.existsSync(sqliteFile)) return false;
      if(fs.existsSync(catalogue)){
        try{
          const db=new (require("node:sqlite").DatabaseSync)(catalogue,{readOnly:true});
          db.exec("PRAGMA busy_timeout=2000");
          _metadataDb={close:()=>db.close(),prepare(sql){const stmt=db.prepare(sql);let args=[],list=null,index=-1;return {bind(value){args=value;},step(){if(!list)list=stmt.all(...args);return ++index<list.length;},getAsObject(){return list[index];},free(){list=null;}};}};
          const present=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'").get();
          _metadataReady=!!present;buildWorkerTitleIndex();return _metadataReady;
        }catch{}
      }
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs({
        locateFile: (file) => locateSqlJsWorkerFile(file)
      });
      _metadataDb = new SQL.Database(fs.readFileSync(sqliteFile));
      const stmt = _metadataDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'");
      const exists = stmt.step();
      stmt.free();
      _metadataReady = Boolean(exists);
      buildWorkerTitleIndex();
      return _metadataReady;
    } catch {
      _metadataReady = false;
      return false;
    }
  })();
  return _metadataDbPromise;
}

function metadataRowsWorker(q, limit = 8) {
  if (!_metadataReady || !_metadataDb) return [];
  const query = String(q || "").trim();
  if (!query) return [];
  if(_titleIndex)return titleIndexApi.search(_titleIndex,query,limit);
  const like = `%${query}%`;
  const prefix = `${query}%`;
  const rows = [];
  let stmt = null;
  try {
    stmt = _metadataDb.prepare(`
      SELECT *
      FROM metadata
      WHERE title LIKE ? COLLATE NOCASE
         OR titleEn LIKE ? COLLATE NOCASE
         OR titleRomaji LIKE ? COLLATE NOCASE
         OR synonyms LIKE ? COLLATE NOCASE
      ORDER BY
        CASE
          WHEN title = ? COLLATE NOCASE THEN 0
          WHEN titleEn = ? COLLATE NOCASE THEN 1
          WHEN titleRomaji = ? COLLATE NOCASE THEN 2
          WHEN title LIKE ? COLLATE NOCASE THEN 3
          ELSE 4
        END,
        score DESC,
        title COLLATE NOCASE
      LIMIT ?
    `);
    stmt.bind([like, like, like, like, query, query, query, prefix, Math.max(1, Math.min(Number(limit) || 8, 30))]);
    while (stmt.step()) rows.push(stmt.getAsObject());
  } catch {
    return [];
  } finally {
    if (stmt) stmt.free();
  }
  return rows.map(metadataRowWorker);
}
function metadataRowWorker(row) {
  return {
    malId: Number(row.malId) || null,
    title: row.title || "",
    titleEn: row.titleEn || "",
    titleRomaji: row.titleRomaji || "",
    synonyms: parseJsonArrayWorker(row.synonyms),
    genres: parseJsonArrayWorker(row.genres),
    episodes: row.episodes == null ? null : Number(row.episodes),
    score: row.score == null ? null : Number(row.score),
    type: row.type || "",
    studios: parseJsonArrayWorker(row.studios),
    imageUrl: row.imageUrl || "",
    startDate: row.startDate || "",
    endDate: row.endDate || "",
    synopsis: row.synopsis || ""
  };
}
function metadataByIdWorker(id) {
  if(!_metadataReady||!_metadataDb||!Number(id))return null;
  let statement;
  try {
    statement=_metadataDb.prepare('SELECT * FROM metadata WHERE malId = ?');
    statement.bind([Number(id)]);
    return statement.step()?metadataRowWorker(statement.getAsObject()):null;
  }catch{return null;}finally{statement?.free();}
}

function parseJsonArrayWorker(text) {
  try {
    const parsed = JSON.parse(text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function titleScoreWorker(a,b){return mediaClassifier.titleSimilarity(a,b);}


function minimumWorkerAcceptScore(title) {
  const n = normalizeCacheLookupKey(title);
  if (!n) return 100;
  const words = n.split(" ").filter(Boolean);
  if (n.length <= 3 || /^\d+%?$/.test(n)) return 98;
  if (words.length === 1 && n.length <= 6) return 90;
  if (/\b\d{4}\b/.test(String(title || ""))) return 78;
  if (words.length <= 2) return 72;
  return 62;
}

function foundScoreWorker(query,found){return mediaClassifier.candidateTitleScore(query,found);}

function normalizeFoundForWorker(query, found) {
  if (!found) return null;
  const score = foundScoreWorker(query, found);
  return { ...found, matchingScore: Math.max(score, found.source === "LocalMetadata" ? Number(found.matchingScore || 0) : 0) };
}

function metadataScoreWorker(query, item) {
  const candidates = [item.title, item.titleEn, item.titleRomaji, ...(Array.isArray(item.synonyms) ? item.synonyms : [])]
    .map(v => String(v || "").trim())
    .filter(Boolean);
  return candidates.reduce((best, candidate) => Math.max(best, titleScoreWorker(query, candidate)), 0);
}

async function searchMetadataWorker(title,sourceRow=null) {
  const query = String(title || "").trim();
  if (!query || normalizeCacheLookupKey(query).length < 2) return null;
  const ready = await ensureMetadataDb();
  if (!ready) return null;

  const variants = [query, query.replace(/\(TV\)/gi, "").trim()].filter(Boolean);
  let best = null;
  let bestScore = 0;
  const candidates=new Map();
  for (const variant of variants) {
    for (const row of metadataRowsWorker(variant, 8)) {
      candidates.set(row.malId,row);
      const score = metadataScoreWorker(query, row);
      if (score > bestScore) { best = row; bestScore = score; }
    }
    if (bestScore >= 100) break;
  }

  const minScore = normalizeCacheLookupKey(query).length < 5 ? 96 : 72;
  if (!best || bestScore < minScore) return null;
  const version=require('./lib/import-version').choose(sourceRow,best,[...candidates.values()]);if(version){best=version;bestScore=100;}
  return metadataFoundWorker(query,best,bestScore);
}
function metadataFoundWorker(query,best,bestScore) {
  return {
    title: query,
    officialTitle: best.title || best.titleEn || best.titleRomaji || query,
    englishTitle: best.titleEn || "",
    romajiTitle: best.titleRomaji || "",
    synonyms: Array.isArray(best.synonyms)?best.synonyms:[],
    synonyms: best.synonyms || [],
    type: best.type || "TV",
    episodesTotal: best.episodes ? String(best.episodes) : "",
    publicScore: best.score ? String(best.score) : "",
    genres: Array.isArray(best.genres) ? best.genres : [],
    synopsis: best.synopsis || "",
    endDate: best.endDate || "",
    startDate: best.startDate || "",
    malUrl: best.malId ? `https://myanimelist.net/anime/${best.malId}` : "",
    malId: best.malId ? String(best.malId) : "",
    imageUrl: best.imageUrl || "",
    matchingScore: bestScore,
    source: "LocalMetadata"
  };
}

// Cache Jikan disque partagé
const JIKAN_DISK_CACHE_FILE = path.join(dataDir, "cache", "jikan-disk-cache.json");
let _jikanDiskCache = {};
try { _jikanDiskCache = JSON.parse(fs.readFileSync(JIKAN_DISK_CACHE_FILE, "utf8")) || {}; } catch {}
let _memCache = new Map();

// Sémaphore Jikan dans le worker
let _active = 0;
const _MAX = 3;
const _DELAY = 380;
const _waiters = [];

async function jikanLimited(task) {
  while (_active >= _MAX) await new Promise(r => _waiters.push(r));
  _active++;
  try { await sleep(_DELAY); return await task(); }
  finally { _active--; if (_waiters.length) _waiters.shift()(); }
}

async function searchJikanWorker(title) {
  const key = normalizeTitle(title);
  if (_memCache.has(key)) return _memCache.get(key);
  if (_jikanDiskCache[key] !== undefined) { _memCache.set(key, _jikanDiskCache[key]); return _jikanDiskCache[key]; }

  const queries = [title, title.replace(/\(TV\)/gi, "").trim()].filter(Boolean);
  for (const q of queries) {
    try {
      // Same configured providers as the server; the retired transport is cache-only.
      const results = await workerMetadataProviders.search(q);
      if (!results.length) continue;
      const best = results.find(x => String(x.title || "").toLowerCase() === q.toLowerCase()) || results[0];
      const result = {
        title: title,
        officialTitle: best.title || "",
        englishTitle: best.title_english || "",
        romajiTitle: best.title || "",
        title_japanese: best.title_japanese || "",
        synonyms: Array.isArray(best.title_synonyms) ? best.title_synonyms : [],
        type: best.type || "",
        episodesTotal: best.episodes ? String(best.episodes) : "",
        startDate: best.aired?.from ? best.aired.from.slice(0, 10) : "",
        publicScore: best.score ? String(best.score) : "",
        genres: Array.isArray(best.genres) ? best.genres.map(g => g.name) : [],
        synopsis: best.synopsis || "",
        malUrl: best.url || "",
        malId: best.mal_id || "",
        imageUrl: best.images?.jpg?.large_image_url || best.images?.jpg?.image_url || "",
        matchingScore: foundScoreWorker(title, { officialTitle: best.title || "", englishTitle: best.title_english || "", title_japanese: best.title_japanese || "", synonyms: best.title_synonyms || [] }),
        source: best.source || "MyAnimeList"
      };
      _memCache.set(key, result);
      _jikanDiskCache[key] = result;
      return result;
    } catch {}
  }
  _memCache.set(key, null); _jikanDiskCache[key] = null;
  return null;
}

// AniList en parallèle
async function searchAniListWorker(title) {
  const query = `query($s:String){Media(search:$s,type:ANIME){id idMal type format countryOfOrigin title{romaji english native}synonyms coverImage{large}episodes averageScore genres description(asHtml:false)siteUrl}}`;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { s: title } })
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.errors?.length) return null;
    const m = json?.data?.Media;
    if (!m) return null;
    return {
      title,
      officialTitle: m.title?.english || m.title?.romaji || title,
      englishTitle: m.title?.english || "",
      romajiTitle: m.title?.romaji || "",
      title_japanese: m.title?.native || "",
      synonyms: Array.isArray(m.synonyms) ? m.synonyms : [],
      type: m.format || "",
      format: m.format || "",
      countryOfOrigin: m.countryOfOrigin || "",
      episodesTotal: m.episodes ? String(m.episodes) : "",
      publicScore: m.averageScore ? String(m.averageScore / 10) : "",
      genres: m.genres || [],
      synopsis: m.description || "",
      malUrl: m.idMal ? `https://myanimelist.net/anime/${m.idMal}` : (m.siteUrl || ""),
      malId: m.idMal || "",
      anilistId: m.id || "",
      imageUrl: m.coverImage?.large || "",
      matchingScore: foundScoreWorker(title, { officialTitle: m.title?.english || m.title?.romaji || title, englishTitle: m.title?.english || "", romajiTitle: m.title?.romaji || "", title_japanese: m.title?.native || "", synonyms: m.synonyms || [] }),
      source: "AniList"
    };
  } catch { return null; }
}

// TVMaze sert uniquement de contre-vérification pour les titres que les bases
// anime n'ont pas confirmés. Une réponse TVMaze ne déclenche jamais à elle seule
// un import anime automatique.
const TVMAZE_IMPORT_CACHE_FILE = path.join(dataDir, "cache", "tvmaze-import-cache.json");
let _tvmazeImportCache = {};
const tvLookupStates=new Map();
const tvLookups=new Map();
try { _tvmazeImportCache = JSON.parse(fs.readFileSync(TVMAZE_IMPORT_CACHE_FILE, "utf8")) || {}; } catch {}
const TVMAZE_POSITIVE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TVMAZE_NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TVMAZE_START_DELAY_MS = 560;
let _tvmazeStartQueue = Promise.resolve();
let _tvmazeNextStartAt = 0;

async function waitForTvmazeStartSlot() {
  let release = null;
  const previous = _tvmazeStartQueue;
  _tvmazeStartQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    const waitMs = Math.max(0, _tvmazeNextStartAt - Date.now());
    if (networkExpired() || Date.now()+waitMs>=deadlineAt) throw Error("ALM_IMPORT_NETWORK_DEFERRED");
    if (waitMs) await sleep(waitMs);
    _tvmazeNextStartAt = Date.now() + TVMAZE_START_DELAY_MS;
  } finally {
    release?.();
  }
}

function cachedTvmazeImportValue(key) {
  if (!Object.prototype.hasOwnProperty.call(_tvmazeImportCache, key)) return { hit: false, value: null };
  const entry = _tvmazeImportCache[key];
  // Les anciens caches positifs restent utilisables. Un ancien null est
  // considéré expiré afin qu'une nouvelle fiche TVMaze puisse être découverte.
  if (entry === null) {
    delete _tvmazeImportCache[key];
    return { hit: false, value: null };
  }
  if (!entry || typeof entry !== "object" || !("value" in entry) || !entry.cachedAt) {
    return { hit: true, value: entry };
  }
  const ttl = entry.value ? TVMAZE_POSITIVE_CACHE_TTL_MS : TVMAZE_NEGATIVE_CACHE_TTL_MS;
  const age = Date.now() - (Date.parse(entry.cachedAt) || 0);
  if (age >= 0 && age < ttl) return { hit: true, value: entry.value || null };
  delete _tvmazeImportCache[key];
  return { hit: false, value: null };
}

async function searchTvMazeWorker(title) {
  const key=normalizeCacheLookupKey(title);
  if(tvLookups.has(key))return tvLookups.get(key);
  const pending=lookupTvMazeWorker(title);tvLookups.set(key,pending);
  return pending;
}

async function lookupTvMazeWorker(title) {
  const key = normalizeCacheLookupKey(title);
  if (!key) return null;
  const cached = cachedTvmazeImportValue(key);
  if (cached.hit) {tvLookupStates.set(key,"cached");return cached.value;}
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await waitForTvmazeStartSlot();
      const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`, {
        headers: { "Accept": "application/json", "User-Agent": "AnimeLocalManager/2.0.0-beta.21 ImportClassifier" }
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        await sleep(Math.max(1200, retryAfter > 0 ? retryAfter * 1000 : 0));
        continue;
      }
      if (response.status >= 500 && attempt + 1 < 3) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`TVMaze HTTP ${response.status}`);
      const rows = await response.json();
      let best = null;
      let bestScore = 0;
      for (const row of Array.isArray(rows) ? rows : []) {
        const show = row?.show || row;
        const score = mediaClassifier.titleSimilarity(title, show?.name || "");
        if (score > bestScore) { best = show; bestScore = score; }
      }
      const result = best && bestScore >= 78 ? {
        id: best.id || "",
        name: best.name || "",
        type: best.type || "",
        language: best.language || "",
        genres: Array.isArray(best.genres) ? best.genres : [],
        status: best.status || "",
        premiered: best.premiered || "",
        ended: best.ended || "",
        network: best.network || null,
        webChannel: best.webChannel || null,
        image: best.image || null,
        imageUrl: best.image?.original || best.image?.medium || "",
        url: best.url || "",
        matchingScore: bestScore,
        source: "TVMaze"
      } : null;
      tvLookupStates.set(key,"resolved");
      _tvmazeImportCache[key] = { value: result, cachedAt: new Date().toISOString() };
      return result;
    } catch {
      if(networkExpired())break;
      if (attempt + 1 < 3) await sleep(500 * (attempt + 1));
    }
  }
  tvLookupStates.set(key,networkExpired()?"deferred":"unavailable");
  // Une panne réseau ne doit pas devenir un faux cache négatif permanent.
  return null;
}

// Recherche locale SQL puis parallèle Jikan + AniList
async function searchParallel(title) {
  const metadata = await searchMetadataWorker(title);
  if (metadata && Number(metadata.matchingScore || 0) >= 96) return metadata;

  const [jikanResult, anilistResult] = await Promise.allSettled([
    searchJikanWorker(title),
    searchAniListWorker(title)
  ]);
  const candidates = [
    metadata,
    jikanResult.status === "fulfilled" ? jikanResult.value : null,
    anilistResult.status === "fulfilled" ? anilistResult.value : null
  ].map(found => normalizeFoundForWorker(title, found)).filter(Boolean);

  candidates.sort((a, b) => Number(b.matchingScore || 0) - Number(a.matchingScore || 0));
  return candidates[0] || null;
}

function cacheHit(title) {
  const keys = [title, normalizeTitle(title), normalizeCacheLookupKey(title)].filter(Boolean);
  for (const k of keys) {
    if (matchingCache[k]) return matchingCache[k];
    if (betaFastCache[k]) return betaFastCache[k];
  }
  return null;
}

function classifyResult(title, found, tvmaze,row=null) {
  return candidateValidation.validate({...row,title},found,tvmaze);
}

function needsTvCounterCheck(title, found) {
  const anime = mediaClassifier.animeEvidence(title, found);
  if (!anime.strong) return true;
  const normalized = mediaClassifier.normalizeMediaTitle(title);
  const words = normalized.split(" ").filter(Boolean);
  if (/^\d{1,4}$/.test(normalized)) return true;
  if (words.length <= 2) return true;
  if (mediaClassifier.extractYear(title)) return true;
  return anime.score < 96;
}


function buildAnimeFromBetaSeries(row, found, classification = "review", tvmaze = null) {
  const title = row.title || found?.title || "";
  const epMatch = String(row.episode || "").match(/S(\d+)E(\d+)/i);
  const ep = epMatch ? Number(epMatch[2]) : 0;
  const status = Number(String(row.status || "").replace(",", "."));
  const hasRemaining=String(row.remaining??'').trim()!=='';
  const completed = status >= 100 || (hasRemaining&&Number(row.remaining)===0);
  const seasonNo = epMatch ? Number(epMatch[1]) || 0 : 0;
  let seen = ep;
  const total = Number(found?.episodesTotal || 0) || 0;
  if(completed&&total&&seen<=total)seen=total;
  let computedStatus = completed ? "Completed" : "Watching";
  const tagsExtra = [];
  let progressWarning = "";
  if (seasonNo > 1 && total) {
    seen = total;
    computedStatus = "Completed";
    tagsExtra.push("suite probable", "multi-saison");
    progressWarning = `BetaSeries indique S${String(seasonNo).padStart(2,"0")}E${String(ep).padStart(2,"0")} : la première fiche est plafonnée à ${total}/${total}; la suite reste à rattacher.`;
  } else if (total && seen > total) {
    seen = total;
    computedStatus = "Completed";
    tagsExtra.push("suite probable");
    progressWarning = `Progression plafonnée à ${total}/${total}; les épisodes supplémentaires appartiennent probablement à une suite.`;
  }
  return {
    title,
    status: computedStatus,
    type: classification === "non_anime" ? (tvmaze?.type || "TV") : (found?.type || ""),
    score: "",
    episodesSeen: seen ? String(seen) : "",
    episodesTotal: found?.episodesTotal || "",
    startDate: found?.startDate || tvmaze?.premiered || "",
    endDate: found?.endDate || "",
    genres: classification === "non_anime" ? (tvmaze?.genres || []) : (found?.genres || []),
    tags: Array.from(new Set([
      "BetaSeries",
      ...(classification === "anime" ? [] : ["à vérifier"]),
      ...(classification === "non_anime" ? ["TVMaze", "hors anime probable"] : []),
      ...tagsExtra,
      ...(tvmaze?.name ? [`TVMaze : ${tvmaze.name}`] : [])
    ])),
    notes: classification === "non_anime"
      ? "Import BetaSeries placé en quarantaine : série non-anime probable."
      : "Importé depuis BetaSeries CSV.",
    poster: classification === "non_anime"
      ? (tvmaze?.imageUrl || tvmaze?.image?.original || tvmaze?.image?.medium || "")
      : (found?.imageUrl || ""),
    imageUrl: classification === "non_anime"
      ? (tvmaze?.imageUrl || tvmaze?.image?.original || tvmaze?.image?.medium || found?.imageUrl || "")
      : (found?.imageUrl || tvmaze?.imageUrl || tvmaze?.image?.original || tvmaze?.image?.medium || ""),
    publicScore: found?.publicScore || "",
    malUrl: found?.malUrl || "",
    synopsis: found?.synopsis || "",
    malId: found?.malId || "",
    betaseriesId: row.id || "",
    betaseriesEpisode: row.episode || "",
    mediaKind: classification === "anime" ? "anime" : "",
    verifiedAnime: classification === "anime",
    progressWarning,
    betaseriesSeason: seasonNo || "",
    betaseriesEpisodeInSeason: ep || ""
  };
}

// ─────────────────────────────────────────────
// ANALYSE PRINCIPALE (6 workers, Jikan + AniList en parallèle)
// ─────────────────────────────────────────────
async function analyse() {
  const items = Array.isArray(rows) ? rows : [];
  const results = new Array(items.length);
  let done = 0;
  let networkCalls = 0;
  const newBetaFastCache = { ...betaFastCache };

  async function processItem({ row, index, localFound, tvmaze=null, tvLookupState="not_required", usedTvNetwork=false }) {
    if (cancelRequested) return;
    const title = String(row.title || "").trim();
    if (!title) { done++; parentPort.postMessage({ type: "progress", done, total: items.length, current: "" }); return; }

    parentPort.postMessage({ type: "progress", done, total: items.length, current: title });

    let found = localFound;
    let usedNetwork = usedTvNetwork;
    const tv=mediaClassifier.tvEvidence(title,tvmaze);
    const liveAction=tv.strong&&!tv.animated&&!mediaClassifier.animeEvidence(title,found).strong;

    if (!found && !liveAction && !networkExpired()) {
      usedNetwork = true;
      networkCalls++;
      // Jikan + AniList en PARALLÈLE — le vrai gain de temps
      found = await searchParallel(title);
      if (found) {
        newBetaFastCache[normalizeCacheLookupKey(title)] = found;
        newBetaFastCache[normalizeTitle(title)] = found;
        // Flush périodique du cache
        if (networkCalls % 15 === 0) {
          const cacheFile = path.join(dataDir, "cache", "betaseries-fast-cache.json");
          fs.writeFile(cacheFile, JSON.stringify(newBetaFastCache, null, 2), () => {});
        }
      }
    }

    if (cancelRequested) return;
    const { classification, reason, score, confidence, evidence } = classifyResult(title, found, tvmaze,row);
    results[index] = {
      source: "BetaSeries", sourceTitle: title,
      classification, reason, score, confidence, evidence,
      importExcluded:classification!=="anime", tvLookupState,
      row, found, tvmaze,
      anime: sourceState(buildAnimeFromBetaSeries(row, found, classification, tvmaze),row,found)
    };

    done++;
    parentPort.postMessage({ type: "progress", done, total: items.length, current: title, cached: !usedNetwork, preview:{index,item:results[index]} });

  }

  // 6 workers parallèles
  const queue=[];
  // Finish local matches first, then spend the bounded network time on the
  // genuinely uncertain entries. Preserve CSV order in the result array.
  for(let index=0;index<items.length&&!cancelRequested;index++){
    const row=items[index],title=String(row.title||'').trim();
    const cached=normalizeFoundForWorker(title,cacheHit(title));
    const invalid=cached&&(candidateValidation.validate(row,cached).classification!=='anime'||require('./lib/import-version').mismatch(row,cached)||/\s[—–-]\s*Saison\s+\d+\s*$/i.test(cached.officialTitle||''));
    let localFound=(!cached||invalid)?await searchMetadataWorker(title,row):cached;
    if(cached&&!invalid&&await ensureMetadataDb()){
      const exact=metadataByIdWorker(cached.malId);
      if(exact){
        const canonical=metadataFoundWorker(title,exact,metadataScoreWorker(title,exact));
        // Reuse the cached identity, fill missing fields by primary key and keep
        // richer fetched metadata. No repeated catalogue scans for cached rows.
        localFound={...canonical,...cached,officialTitle:canonical.officialTitle,romajiTitle:canonical.romajiTitle};
        for(const field of ['synopsis','startDate','endDate','episodesTotal','genres','imageUrl'])if(!cached[field]||(Array.isArray(cached[field])&&!cached[field].length))localFound[field]=canonical[field];
      }
    }
    queue.push({row,index,localFound});
    if(index%30===0)parentPort.postMessage({type:'progress',done:0,total:items.length,current:title,stage:'local'});
  }
  deadlineAt=Date.now()+initialNetworkBudget;
  async function runQueue(work, action) {
    let cursor=0;
    async function runner(){while(!cancelRequested&&cursor<work.length)await action(work[cursor++]);}
    await Promise.all(Array.from({length:Math.min(6,work.length||1)},runner));
  }
  const tvQueue=[],metadataQueue=[],ready=[];
  for(const job of queue){
    const cached=cachedTvmazeImportValue(normalizeCacheLookupKey(job.row.title));
    if(cached.hit){job.tvmaze=cached.value;job.tvLookupState="cached";}
    else if(needsTvCounterCheck(job.row.title,job.localFound)){tvQueue.push(job);continue;}
    const tv=mediaClassifier.tvEvidence(job.row.title,job.tvmaze);
    if(job.localFound||(tv.strong&&!tv.animated))ready.push(job);
    else metadataQueue.push(job);
  }
  // Publish local/cached decisions immediately, without spending the TV reserve.
  await runQueue(ready,processItem);
  if(!explicitDeadline)deadlineAt=Date.now()+csvTvBudget(new Set(tvQueue.map(j=>normalizeCacheLookupKey(j.row.title))).size,workerData.networkBudgetMs);
  await runQueue(tvQueue,async job=>{
    if(networkExpired())job.tvLookupState="deferred";
    else {
      job.usedTvNetwork=true;job.tvmaze=await searchTvMazeWorker(job.row.title);
      job.tvLookupState=tvLookupStates.get(normalizeCacheLookupKey(job.row.title))||"unavailable";
    }
    const tv=mediaClassifier.tvEvidence(job.row.title,job.tvmaze);
    if(job.localFound||(tv.strong&&!tv.animated))await processItem(job);
    else metadataQueue.push(job);
  });
  // Run slower anime searches only once every TV counter-check has had its slot.
  if(!explicitDeadline)deadlineAt=Date.now()+Math.min(30000,csvTvBudget(0,workerData.networkBudgetMs));
  await runQueue(metadataQueue,processItem);

  // Flush final cache Jikan disque
  try {
    fs.writeFileSync(JIKAN_DISK_CACHE_FILE, JSON.stringify(_jikanDiskCache), "utf8");
  } catch {}

  // Flush final betaFastCache
  try {
    const cacheFile = path.join(dataDir, "cache", "betaseries-fast-cache.json");
    fs.writeFileSync(cacheFile, JSON.stringify(newBetaFastCache, null, 2), "utf8");
  } catch {}
  try {
    fs.mkdirSync(path.dirname(TVMAZE_IMPORT_CACHE_FILE), { recursive: true });
    fs.writeFileSync(TVMAZE_IMPORT_CACHE_FILE, JSON.stringify(_tvmazeImportCache, null, 2), "utf8");
  } catch {}

  try{_metadataDb?.close();}catch{}
  if (cancelRequested) {
    parentPort.postMessage({ type: "cancelled", results: results.filter(Boolean), done, total: items.length });
    parentPort.close();return;
  }
  parentPort.postMessage({ type: "result", results: results.filter(Boolean), deferred:networkExpired() });
  parentPort.close();
}

analyse().catch(err => {try{_metadataDb?.close();}catch{}parentPort.postMessage({ type:"error",message:err.message });parentPort.close();});
