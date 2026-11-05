const rescueMode = require('./lib/rescue-mode');
rescueMode.bootstrap();
const collectionIdentity = require('./public/collection-state');
const { boundedTextFetch, singleFlight } = require("./lib/bounded-text-fetch");
const { aniListFetch } = require("./lib/anilist-fetch");
const DEFAULT_BETASERIES_API_KEY = process.env.BETASERIES_DEFAULT_API_KEY || "";
const express  = require("express");
const fs       = require("fs");
const fsp      = require("fs/promises");
const path     = require("path");
const zlib     = require("zlib");
const crypto   = require("crypto");
const dns      = require("dns/promises");
const net      = require("net");
const multer   = require("multer");
const { Worker } = require("worker_threads");
const { localRequestGuard } = require("./lib/local-security");
const seasonResolver = require("./lib/season-identity");
const { extractBestArticleImage, largestSrcsetCandidate } = require("./lib/news-image-utils");
const recoPeople = require("./lib/recommendation-people");
const aniListStaffFilmography = require("./lib/anilist-staff-filmography");
const mediaClassifier = require("./lib/media-classifier");
const {csvPreviewDecision}=require("./lib/csv-network-budget");
const betaSeriesProgress = require("./lib/betaseries-progress");
const importIntegrity = require("./lib/import-integrity");
const { animeCompletionSignature, autoCompletionAttemptIsCurrent } = require("./lib/completion-state");
const viewing = require('./lib/viewing');
const catalogueIntegrity = require('./lib/catalogue-integrity');
const localSeasonLinks = require('./lib/local-season-links');
const seasonReference = require('./public/season-reference');
const metadataPreferences = require('./lib/metadata-preferences');
const progressReconciliation = require('./lib/progress-reconciliation');
const importCandidateValidation=require('./lib/import-candidate-validation');
const encryptedBackup = require('./lib/encrypted-backup');
const {createReleaseWatch,providerBatchWithFallback}=require('./lib/release-watch');
const {createCalendar}=require('./lib/calendar');
const {createVersionCheck}=require('./lib/version-check');

// Couche données : SQLite avec fallback JSON
const db = require("./db");

const app    = express();
const PORT   = 3143; // Separate from the stable application.
const BACKUP_VERSION = "2.0.0-beta.82"; // Format historique : préserver les sauvegardes existantes.
const PRODUCT_RELEASE = require("./release-version.json");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024, files: 1 } });

if(process.env.ALM_RELEASE_SMOKE==='1'){
  const liveFetch=global.fetch;
  global.fetch=(input,options)=>{let url;try{url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);}catch{return Promise.reject(Error('ALM_SMOKE_OFFLINE'));}return url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)?liveFetch(input,options):Promise.reject(Error('ALM_SMOKE_OFFLINE'));};
}
const DATA_DIR = process.env.ALM_DATA_DIR || path.join(__dirname, "data");
const DATABASE_DIR = path.join(DATA_DIR, "database");
const APP_BUNDLED_DATA_DIR = path.join(__dirname, "data");
const APP_BUNDLED_DATABASE_DIR = path.join(APP_BUNDLED_DATA_DIR, "database");
const PUBLIC_DIR = path.join(__dirname, "public");
const IMAGES_DIR = process.env.ALM_IMAGES_DIR || path.join(PUBLIC_DIR, "images");
const DATA_FILE = path.join(DATA_DIR, "animes.json");
const IGNORED_NEWS_FILE = path.join(DATA_DIR, "ignored-news.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const ALIASES_FILE = path.join(DATA_DIR, "aliases.json");
const MATCHING_CACHE_FILE = path.join(DATA_DIR, "cache", "matching-cache.json");
const BETASERIES_FAST_CACHE_FILE = path.join(DATA_DIR, "cache", "betaseries-fast-cache.json");
const BETASERIES_SEASON_RELATIONS_CACHE_FILE = path.join(DATA_DIR, "cache", "betaseries-season-relations-v2.json");
const LAST_ALIAS_SYNC_FILE = path.join(DATA_DIR, "cache", "last-sync.json");
const NEWS_CACHE_FILE = path.join(DATA_DIR, "news-cache.json");
const NEWS_RESULTS_FILE = path.join(DATA_DIR, "news-results.json");
const NEWS_SCAN_STATE_FILE = path.join(DATA_DIR, "news-scan-state.json");
const MEDIA_REVIEW_FILE = path.join(DATA_DIR, "media-review.json");
const TVMAZE_IMPORT_CACHE_FILE = path.join(DATA_DIR, "cache", "tvmaze-import-cache.json");
const SEASON_SCAN_CACHE_TTL_MS = Number(process.env.ALM_SEASON_SCAN_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const METADATA_PRELOAD_STATUS_FILE = path.join(DATA_DIR, "cache", "metadata-preload-status.json");
const METADATA_AUTONOMOUS_STATUS_FILE = path.join(DATA_DIR, "cache", "metadata-autonomous-status.json");
const METADATA_BUNDLED_STATUS_FILE = path.join(APP_BUNDLED_DATABASE_DIR, "metadata-bundled-status.json");
const METADATA_DOWNLOAD_TIMEOUT_MS = 25000;
const METADATA_REMOTE_CHECK_INTERVAL_MS = Number(process.env.ALM_METADATA_REMOTE_CHECK_INTERVAL_MS || 24 * 60 * 60 * 1000);
const METADATA_AUTONOMOUS_CHECK_INTERVAL_MS = Number(process.env.ALM_METADATA_AUTONOMOUS_CHECK_INTERVAL_MS || 7 * 24 * 60 * 60 * 1000);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });
const albumCovers=require('./lib/cover-cache').createCoverCache({directory:IMAGES_DIR});
const automation=require('./lib/library-automation').createAutomation(DATA_DIR);
// One FIFO for review mutations and crossed startup/restore writers. Progress stays available.
const mediaReviewQueue={tail:Promise.resolve(),run(task){const work=this.tail.then(task);this.tail=work.catch(()=>{});return work;}};
function serializeMediaReview(handler){return (req,res,next)=>mediaReviewQueue.run(()=>handler(req,res,next)).catch(next);}

const community=require('./lib/community').createCommunity({directory:DATA_DIR,getAnimes:()=>readAnimes(false).map(a=>{const metadata=db.getMetadataByMalId(a.malId);return {...a,imageUrl:metadata?.imageUrl||a.imageUrl||'',rating:metadata?.rating||a.rating||'',genres:[...new Set([...(Array.isArray(a.genres)?a.genres:[]),...(Array.isArray(metadata?.genres)?metadata.genres:[])])]};}),getCatalogByMalId:id=>db.getMetadataByMalId(id),config:require('./community-config.json'),ready:()=>dbReady});
let maintenanceUpdate=async()=>({ok:true,skipped:true,reason:'desktop-required'});
const localSeasonMemo=new Map();let localSeasonRevision=-1;
function nextVerifiedLocalSeason(base){
 const revision=db.getMetadataRevision();if(localSeasonRevision!==revision){localSeasonMemo.clear();localSeasonRevision=revision;}
 const key=require('./lib/library-automation').metadataFingerprint(base);
 if(localSeasonMemo.has(key))return localSeasonMemo.get(key);
 const signature=db.getMetadataTitleSignature();
 const next=automation.next(base,id=>db.getMetadataByMalId(id),signature)||localSeasonLinks.findNext(base,localSeasonSearch);
 if(next)automation.remember(base,next.row,next.proof,signature);
 localSeasonMemo.set(key,next);return next;
}

// Initialise SQLite portable sql.js (migration automatique depuis animes.json)
const dbReady = db.initDb(DATA_DIR);

app.disable?.("x-powered-by");
app.use(localRequestGuard);
app.use((req,res,next)=>{
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  const token=process.env.ALM_SESSION_TOKEN;
  if(token){
    if(req.method==='GET'&&(req.path==='/'||req.path==='/index.html'))res.cookie('alm_session',token,{httpOnly:true,sameSite:'strict',path:'/'});
    if(req.path.startsWith('/api/')){const value=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('alm_session='))?.slice(12)||'';const supplied=Buffer.from(value),expected=Buffer.from(token);if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return res.status(403).json({code:'ALM_SESSION_REQUIRED'});}
  }
  next();
});
app.use(express.json({limit:'20mb'}));
app.use('/api', (req,res,next)=>{const size=Buffer.byteLength(JSON.stringify(req.body||{}));const bulk=/^\/api\/(?:animes|import|backup|restore|library\/\d+\/notebook)/.test(req.originalUrl);if(!bulk&&size>256*1024)return res.status(413).json({code:'ALM_REQUEST_SIZE'});next();});
app.use("/images", express.static(IMAGES_DIR));
// The complete 1080p clip is a separately packaged resource on desktop builds.
// This avoids placing a large, random-access video inside ASAR and makes its
// presence in the installed application independently verifiable.
const externalClip = (process.versions?.electron && typeof process.resourcesPath === 'string')
  ? path.join(process.resourcesPath, 'alm-media', 'alm-clip-complet-1080p.mp4') : null;
if (externalClip && fs.existsSync(externalClip)) {
  app.get('/assets/alm-clip-complet-1080p.mp4', (req, res, next) => {
    res.sendFile(externalClip, error => { if (error && !res.headersSent) next(error); });
  });
}
app.use(express.static(PUBLIC_DIR));
require('./lib/community').mountCommunity(app,community);

// ── Couche données : SQLite via db.js (fallback JSON automatique) ──
// Toutes les lectures/écritures passent par un garde-fou anti-doublons.
// Il fusionne uniquement les doublons très sûrs : même malId non vide ou même
// titre normalisé après suppression d'un suffixe année, sans supprimer de saison
// MAL différente. Exemple réel : "Release That Witch" + "Release That Witch (2026)"
// avaient le même malId et représentaient la même fiche.
const completionBaselines=new WeakMap();
const COMPLETION_PERSONAL_FIELDS=["id","title","customTitle","score","episodesSeen","status","notes","personalJournal","watchEvents","completedOn","completionPending","seriesGroupTitle","seriesSeparate","manualSeasonNumber","seriesSeasonStatuses","seasonStatusExplicit","episodesSeenExplicit","manualMetadata","associationResolution","progressResolution","betaseriesEpisode","betaseriesSourceRow","unallocatedEpisodes","needsSequelCheck","progressWarning","automationDecision","followReleases"];
let onLibraryIdentityChange=()=>{};
function readAnimes(captureBaseline=true) {
  const arr=db.getAllAnimes(),items=ensureLibraryIntegrity(arr).items;
  if(captureBaseline)completionBaselines.set(items,new Map(items.map(a=>[Number(a.id),{...JSON.parse(JSON.stringify(a)),poster:a.poster||'',imageUrl:a.imageUrl||'',malId:a.malId||''}])));
  return items;
}
function writeCompletionAnimes(snapshot) {
  const baseline=completionBaselines.get(snapshot)||new Map(),latest=readAnimes(), updates=new Map(snapshot.map(a=>[Number(a.id),a]));
  const personal=COMPLETION_PERSONAL_FIELDS;
  const merged=latest.map(current=>{
    const changed=updates.get(Number(current.id));
    if(!changed || (current.malId&&changed.malId&&String(current.malId)!==String(changed.malId)))return current;
    const result={...current,...changed};const before=baseline.get(Number(current.id));if(before)for(const key of ['poster','imageUrl'])if((current[key]||'')!==before[key])result[key]=current[key];
    for(const key of ['resolutionAssessment','autoCompletionReason'])if(before&&Object.hasOwn(before,key)&&!Object.hasOwn(changed,key)&&JSON.stringify(current[key])===JSON.stringify(before[key]))delete result[key];
    for(const key of personal)if(!before||JSON.stringify(current[key])!==JSON.stringify(before[key])){if(Object.hasOwn(current,key))result[key]=current[key];else delete result[key];}
    const removed=new Set((before?.tags||[]).filter(tag=>['non trouvé auto','image introuvable auto'].includes(String(tag).toLowerCase())&&!(changed.tags||[]).includes(tag)));
    if(current.tags||changed.tags)result.tags=[...new Set([...(current.tags||[]).filter(tag=>!removed.has(tag)),...(changed.tags||[])])];
    return metadataPreferences.preserve(current,result);
  });
  writeAnimes(merged);
}
function writeAnimes(animes) {
  const previous=new Map(db.getAllAnimes().map(a=>[Number(a.id),seasonReference.identity(a)]));
  const repaired = repairAnimeLibrary(animes);
  preserveImportRecovery(animes, repaired);
  db.writeAllAnimes(repaired.items);
  const changed=repaired.items.filter(a=>previous.has(Number(a.id))&&previous.get(Number(a.id))!==seasonReference.identity(a)).map(a=>Number(a.id));
  const retained=new Set(repaired.items.map(a=>Number(a.id)));for(const id of previous.keys())if(!retained.has(id))changed.push(id);
  if(changed.length)onLibraryIdentityChange(changed);
}
function commitImportedLibrary(before,proposed){
 const old=new Map(before.map(a=>[Number(a.id),a])),latest=readAnimes(),current=new Map(latest.map(a=>[Number(a.id),a]));
 const personal=['title','customTitle','score','status','episodesSeen','notes','personalJournal','watchEvents','completedOn','seriesSeasonStatuses','seasonStatusExplicit','episodesSeenExplicit','manualMetadata','associationResolution','progressResolution','betaseriesEpisode','betaseriesSourceRow','unallocatedEpisodes','automationDecision','followReleases','completionPending','seriesGroupTitle','seriesSeparate','manualSeasonNumber','needsSequelCheck','progressWarning'];
 const merged=[];
 for(const row of proposed){
  const baseline=old.get(Number(row.id)),now=current.get(Number(row.id));
  if(baseline&&!now)continue; // A deletion during a network wait must win.
  if(baseline&&now){
   const next={...now,...row};for(const key of personal)if(JSON.stringify(now[key])!==JSON.stringify(baseline[key])){if(Object.hasOwn(now,key))next[key]=now[key];else delete next[key];}
   if(String(now.malId||'')!==String(baseline.malId||'')){merged.push(now);continue;}
   merged.push(metadataPreferences.preserve(now,next));current.delete(Number(row.id));
  }else{const next={...row};if(current.has(Number(next.id)))next.id=nextId([...latest,...merged]);merged.push(next);}
 }
 for(const [id,row]of current)if(!old.has(id))merged.push(row);
 writeAnimes(merged);
}
async function readAnimesAsync(captureBaseline=true) {
  await db.whenReady();
  return readAnimes(captureBaseline);
}
async function writeAnimesAsync(a) {
  await db.whenReady();
  const repaired = repairAnimeLibrary(a);
  preserveImportRecovery(a, repaired);
  db.writeAllAnimes(repaired.items);
}

function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}


let _libraryIntegrityWriteInProgress = false;
let _lastLibraryIntegrityReport = { changed: false, removed: 0, groups: [] };

function libraryNormalizeTitle(value) {
  return seasonResolver.norm(String(value || "").replace(/\s*\((?:19|20)\d{2}\)\s*$/g, ""));
}

function extractFranchiseBaseTitle(value) {
  let title = String(value || "").trim();
  if (!title) return "";
  title = title
    .replace(/\s*\((?:19|20)\d{2}\)\s*$/g, "")
    .replace(/\s*[—–-]\s*(?:saison|season|staffel|temporada|part|cour|arc)\s*\d+.*$/i, "")
    .replace(/\s+(?:saison|season|staffel|temporada|part|cour|arc)\s*\d+\s*$/i, "")
    .replace(/\s+[ivxlcdm]{1,8}\s*$/i, "")
    .trim();
  return libraryNormalizeTitle(title);
}

function libraryFranchiseKey(anime) {
  const seriesId = String(anime?.betaseriesSeriesId || anime?.betaseriesId || "").trim();
  if (seriesId) return `bs:${seriesId}`;
  for (const candidate of [anime?.seriesRootTitle, anime?.importSourceTitle, anime?.sourceTitle, anime?.title]) {
    const key = extractFranchiseBaseTitle(candidate);
    if (key) return key;
  }
  return "";
}

function libraryScalarScore(anime) {
  if (!anime) return 0;
  let score = 0;
  for (const field of ["poster", "imageUrl", "synopsis", "malId", "malUrl", "publicScore", "rank", "startDate", "endDate", "betaseriesEpisode"]) {
    if (String(anime[field] || "").trim()) score += 1;
  }
  if (Array.isArray(anime.genres) && anime.genres.length) score += 1;
  if (Array.isArray(anime.relations) && anime.relations.length) score += 2;
  score += Math.min(3, Number(anime.episodesSeen || 0) || 0);
  score += Math.min(3, Number(anime.episodesTotal || 0) || 0);
  if (anime.status === "Completed") score += 2;
  return score;
}

function libraryPreferTitle(a, b) {
  const ta = String(a?.title || "").trim();
  const tb = String(b?.title || "").trim();
  if (!ta) return tb;
  if (!tb) return ta;
  const na = libraryNormalizeTitle(ta);
  const nb = libraryNormalizeTitle(tb);
  if (na && na === nb) {
    const ay = /\((?:19|20)\d{2}\)\s*$/.test(ta);
    const by = /\((?:19|20)\d{2}\)\s*$/.test(tb);
    if (ay !== by) return ay ? tb : ta;
    return ta.length <= tb.length ? ta : tb;
  }
  return libraryScalarScore(a) >= libraryScalarScore(b) ? ta : tb;
}

function libraryUnionArrays(...arrays) {
  const out = [];
  const seen = new Set();
  for (const arr of arrays) {
    for (const value of (Array.isArray(arr) ? arr : [])) {
      const text = typeof value === "string" ? value.trim() : value;
      const key = typeof text === "string" ? text.toLowerCase() : JSON.stringify(text);
      if (!text || seen.has(key)) continue;
      seen.add(key); out.push(text);
    }
  }
  return out;
}

function libraryChooseScalar(current, incoming, field) {
  const a = current?.[field];
  const b = incoming?.[field];
  if ((a === "" || a == null) && b) return b;
  if ((b === "" || b == null)) return a;
  if (["episodesSeen", "episodesTotal", "rank", "popularity", "members"].includes(field)) {
    const na = Number(a || 0), nb = Number(b || 0);
    if (field === "rank") return (!na || (nb && nb < na)) ? b : a;
    return nb > na ? b : a;
  }
  if (field === "publicScore") {
    return Number(b || 0) > Number(a || 0) ? b : a;
  }
  return a || b;
}

function mergeDuplicateAnimeRecords(base, extra) {
  const winner = libraryScalarScore(extra) > libraryScalarScore(base) ? { ...extra } : { ...base };
  const other  = winner.id === extra.id ? base : extra;
  const merged = { ...winner };
  merged.id = Number(base?.id || extra?.id || winner.id || 0) || winner.id;
  merged.title = libraryPreferTitle(base, extra);

  const scalarFields = [
    "status", "score", "episodesSeen", "episodesTotal", "type", "poster", "imageUrl", "malUrl", "synopsis", "publicScore",
    "rank", "popularity", "members", "startDate", "endDate", "englishTitle", "studio", "rating", "malId",
    "betaseriesId", "betaseriesEpisode", "betaseriesStatus",
    "betaseriesSeriesId", "betaseriesSeason", "manualSeasonNumber", "seriesRootTitle", "partNumber", "courNumber"
  ];
  for (const field of scalarFields) merged[field] = libraryChooseScalar(merged, other, field);

  // Si une des deux fiches est terminée et que la progression couvre le total, on garde Completed.
  const seen = Number(merged.episodesSeen || 0) || 0;
  const total = Number(merged.episodesTotal || 0) || 0;
  if (base?.status === "Completed" || extra?.status === "Completed" || (total && seen >= total)) merged.status = "Completed";
  else if (base?.status === "Watching" || extra?.status === "Watching") merged.status = "Watching";

  for (const field of ["genres", "tags", "themes", "demographics", "studios", "producers"]) {
    merged[field] = libraryUnionArrays(base?.[field], extra?.[field]);
  }

  if (Array.isArray(base?.relations) || Array.isArray(extra?.relations)) {
    const relSeen = new Set();
    merged.relations = [];
    for (const rel of [...(base?.relations || []), ...(extra?.relations || [])]) {
      const key = JSON.stringify(rel || {});
      if (!rel || relSeen.has(key)) continue;
      relSeen.add(key); merged.relations.push(rel);
    }
  }

  // Les opérations techniques de dédoublonnage restent consignées dans le
  // rapport d'intégrité, mais ne polluent plus les notes personnelles.
  merged.notes = require('./lib/notebook-model').mergeNotes(base?.notes,extra?.notes);
  if(base?.personalJournal||extra?.personalJournal)merged.personalJournal=require('./lib/notebook-model').mergeJournal(base?.personalJournal,extra?.personalJournal);
  const events=new Map();
  for(const event of [...(base?.watchEvents||[]),...(extra?.watchEvents||[])])if(event?.id&&!events.has(event.id))events.set(event.id,event);
  if(events.size)merged.watchEvents=[...events.values()];
  if(!merged.completedOn)merged.completedOn=base?.completedOn||extra?.completedOn||'';
  return merged;
}

function librarySeasonIdentity(anime) {
  const parsed = seasonResolver.slot(anime);
  return { root: libraryFranchiseKey(anime), season: parsed.season, part: parsed.part };
}

function removeObsoleteBetaSeriesOverflowNotes(notes) {
  return require('./lib/notebook-model').notes(notes)
    .split(/\r?\n/)
    .filter(line => {
      const text = String(line || "").trim();
      if (!text) return true;
      if (/^Progression corrigée automatiquement\s*:\s*BetaSeries indiquait .* probablement une suite\.?$/i.test(text)) return false;
      if (/^BetaSeries indique .* Suite probable\s*:/i.test(text)) return false;
      if (/^Import BetaSeries\s*:\s*progression .* indiquent probablement une suite/i.test(text)) return false;
      return true;
    })
    .join("\n");
}

function removeInternalBetaSeriesNotes(notes) {
  return require('./lib/notebook-model').notes(notes)
    .split(/\r?\n/)
    .filter(line => {
      const text = String(line || "").trim();
      if (!text) return true;
      if (/^Progression BetaSeries répartie automatiquement\s*:/i.test(text)) return false;
      if (/^Progression BetaSeries récupérée automatiquement\s*:/i.test(text)) return false;
      if (/^Progression BetaSeries cumulée répartie automatiquement\s*:/i.test(text)) return false;
      if (/^Doublon fusionné automatiquement\s*:/i.test(text)) return false;
      if (/^Progression BetaSeries S\d+E\d+ conservée même si/i.test(text)) return false;
      if (/^Utilise « Infos auto » ou la détection des nouvelles saisons/i.test(text)) return false;
      return true;
    })
    .join("\n");
}

function isBetaSeriesProvisionalSeasonForBanner(anime) {
  const season = Math.max(0, Number(anime?.betaseriesSeason || anime?.manualSeasonNumber || 0));
  if (season < 2 || anime?.needsSequelCheck !== true) return false;
  const tags = animeAutoTags(anime);
  const provisional = tags.includes("saison à identifier") || tags.includes("progression à vérifier");
  return provisional && Math.max(0, Number(anime?.episodesSeen || 0)) > 0;
}

function repairStoredBetaSeriesOverflow(animes) {
  const input = Array.isArray(animes) ? animes.filter(Boolean).map(item => ({ ...item })) : [];
  const existing = new Map();
  const ambiguous = new Set();
  for (const anime of input) {
    const id = librarySeasonIdentity(anime);
    if (!id.root || id.season <= 1) continue;
    const key = `${id.root}::${id.season}`;
    if (id.part || existing.has(key)) ambiguous.add(key);
    existing.set(key, anime);
  }

  let changed = false;
  for (const anime of input) {
    anime.notes = require('./lib/notebook-model').notes(anime.notes);
    const overflow = Math.max(0, numberOrZero(anime.betaseriesOverflowEpisodes));
    const total = Math.max(0, numberOrZero(anime.episodesTotal));
    if (!overflow || !total) continue;

    const rootKey = libraryFranchiseKey(anime);
    if (!rootKey) continue;

    let left = overflow;
    let seasonNumber = Math.max(2, Number(anime.betaseriesOverflowNextSeason) || Number(anime.betaseriesSeason || anime.manualSeasonNumber || 1) + 1);
    while(left>0&&seasonNumber<=100){
      const key=rootKey+'::'+seasonNumber;if(ambiguous.has(key))break;
      const current=existing.get(key),capacity=numberOrZero(current?.episodesTotal);
      if(!current||!capacity){
        if(current){current.progressUnallocated=true;current.unallocatedEpisodes=Math.max(numberOrZero(current.unallocatedEpisodes),left);current.needsSequelCheck=true;}
        else{
          anime.unallocatedEpisodes=Math.max(numberOrZero(anime.unallocatedEpisodes),left);
          anime.progressUnallocated=true;
        }
        left=0;changed=true;break;
      }
      const seen=Math.min(left,capacity);if(seen>numberOrZero(current.episodesSeen)){current.episodesSeen=String(seen);current.status=seen>=capacity?'Completed':'Watching';changed=true;}
      left-=seen;seasonNumber++;
    }

    anime.betaseriesOverflowEpisodes = left;
    anime.betaseriesOverflowNextSeason = left > 0 ? seasonNumber : 0;
    anime.needsSequelCheck = left > 0 || numberOrZero(anime.unallocatedEpisodes)>0;
    anime.progressWarning = anime.unallocatedEpisodes ? anime.unallocatedEpisodes+' épisode(s) importés restent à rattacher.' : "";
    anime.tags = (anime.tags || []).filter(tag => !/suite probable/i.test(String(tag)));
    anime.notes = removeInternalBetaSeriesNotes(removeObsoleteBetaSeriesOverflowNotes(anime.notes));
    changed = true;
  }
  return { items: input, changed };
}

function repairAnimeLibrary(animes) {
  const legacyRepair = importIntegrity.repairLegacyImports(Array.isArray(animes) ? animes.filter(Boolean) : []);
  const shapeRepair = require('./lib/betaseries-upgrade').repair(legacyRepair.items);
  const progressRepair = progressReconciliation.repair(shapeRepair.items);
  const overflowRepair = repairStoredBetaSeriesOverflow(progressRepair.items);
  const input = overflowRepair.items;
  const out = [];
  const byMal = new Map();
  const byLooseTitle = new Map();
  const bySeriesSeason = new Map();
  const groups = [];

  let normalizedProgress = overflowRepair.changed || legacyRepair.changed || shapeRepair.changed || progressRepair.changed;
  for (const raw of input) {
    const originalNotes = require('./lib/notebook-model').notes(raw?.notes);
    const cleanedNotes = removeInternalBetaSeriesNotes(originalNotes);
    const beforeAnime = { ...raw, notes: cleanedNotes };
    const anime = clampEpisodesSeenToTotal(beforeAnime);
    if (cleanedNotes !== originalNotes || String(anime.episodesSeen || "") !== String(beforeAnime.episodesSeen || "") || String(anime.status || "") !== String(beforeAnime.status || "")) normalizedProgress = true;
    const malKey = String(anime.malId || "").trim();
    const titleKey = libraryNormalizeTitle(anime.title);
    const seasonIdentity = librarySeasonIdentity(anime);
    const seasonKey = seasonIdentity.root && seasonIdentity.season > 0 ? `${seasonIdentity.root}::${seasonIdentity.season}::${seasonIdentity.part || 0}` : "";
    let existingIndex = -1;
    let reason = "";

    if (malKey && byMal.has(malKey)) {
      existingIndex = byMal.get(malKey);
      reason = `malId:${malKey}`;
    } else if (seasonKey && bySeriesSeason.has(seasonKey)) {
      existingIndex = bySeriesSeason.get(seasonKey);
      reason = `saison:${seasonKey}`;
    } else if (!malKey && titleKey && byLooseTitle.has(titleKey)) {
      existingIndex = byLooseTitle.get(titleKey);
      reason = `titre:${titleKey}`;
    }

    if (existingIndex >= 0 && !seasonResolver.sameSeason(out[existingIndex], anime)) existingIndex = -1;

    if (existingIndex >= 0) {
      const before = out[existingIndex];
      out[existingIndex] = mergeDuplicateAnimeRecords(before, anime);
      groups.push({ reason, keptId: out[existingIndex].id, removedId: anime.id, titles: [before.title, anime.title].filter(Boolean) });
      const newMalKey = String(out[existingIndex].malId || "").trim();
      const newTitleKey = libraryNormalizeTitle(out[existingIndex].title);
      const mergedSeason = librarySeasonIdentity(out[existingIndex]);
      const mergedSeasonKey = mergedSeason.root && mergedSeason.season > 0 ? `${mergedSeason.root}::${mergedSeason.season}::${mergedSeason.part || 0}` : "";
      if (newMalKey) byMal.set(newMalKey, existingIndex);
      if (mergedSeasonKey) bySeriesSeason.set(mergedSeasonKey, existingIndex);
      if (!newMalKey && newTitleKey) byLooseTitle.set(newTitleKey, existingIndex);
      continue;
    }

    const index = out.length;
    out.push(anime);
    if (malKey) byMal.set(malKey, index);
    if (seasonKey) bySeriesSeason.set(seasonKey, index);
    else if (titleKey) byLooseTitle.set(titleKey, index);
  }

  const changed = out.length !== input.length || normalizedProgress;
  return { items: out, changed, removed: input.length - out.length + legacyRepair.removed.length + shapeRepair.removed.length + progressRepair.removed.length, groups, legacyRepair, shapeRepair, progressRepair };
}

function preserveImportRecovery(original, repaired) {
  if(repaired.progressRepair?.changed){
    const file=path.join(DATA_DIR,'backups','before-beta55-progress.json');
    if(!fs.existsSync(file))require('./lib/atomic-file').atomicJson(file,original);
    require('./lib/atomic-file').atomicJson(path.join(DATA_DIR,'backups','beta55-progress-report.json'),{version:55,corrected:repaired.progressRepair.corrected,removed:repaired.progressRepair.removed});
  }
  if(repaired.shapeRepair?.changed){
    const file=path.join(DATA_DIR,'backups','before-beta50-import-shape.json');
    if(!fs.existsSync(file))require('./lib/atomic-file').atomicJson(file,original);
    require('./lib/atomic-file').atomicJson(path.join(DATA_DIR,'backups','beta50-import-shape-report.json'),{version:50,at:new Date().toISOString(),corrected:repaired.shapeRepair.corrected,removed:repaired.shapeRepair.removed});
  }
  if (!repaired.legacyRepair?.changed) return;
  const file = path.join(DATA_DIR, "backups", "before-beta48-import-integrity.json");
  if (!fs.existsSync(file)) require("./lib/atomic-file").atomicJson(file, original);
  require("./lib/atomic-file").atomicJson(path.join(DATA_DIR,"backups","beta48-import-integrity-report.json"), {version:48, at:new Date().toISOString(), removed:repaired.legacyRepair.removed, correctedRoots:repaired.legacyRepair.correctedRoots});
}

function ensureLibraryIntegrity(animes) {
  ensureCatalogueIntegrity();
  const repaired = repairAnimeLibrary(animes);
  _lastLibraryIntegrityReport = { changed: repaired.changed, removed: repaired.removed, groups: repaired.groups.slice(0, 12), checkedAt: new Date().toISOString() };
  if (repaired.changed && !_libraryIntegrityWriteInProgress) {
    try {
      _libraryIntegrityWriteInProgress = true;
      preserveImportRecovery(animes, repaired);
      const migrationBackup = path.join(DATA_DIR, "backups", "before-beta29-integrity.json");
      if (!fs.existsSync(migrationBackup)) require("./lib/atomic-file").atomicJson(migrationBackup, animes);
      db.writeAllAnimes(repaired.items);
      console.log(`[library] ${repaired.removed} doublon(s) fusionné(s).`);
    } catch (error) {
      console.warn("[library] Fusion des doublons ignorée :", error.message);
    } finally {
      _libraryIntegrityWriteInProgress = false;
    }
  }
  return repaired;
}

let catalogueIntegrityChecked=false;
function ensureCatalogueIntegrity(){
 if(catalogueIntegrityChecked||!db.isReady())return;
 const aliases=readAliases(),repair=catalogueIntegrity.restore(db.getMetadataIntegrityCandidates(),aliases,id=>db.getMetadataByMalId(id));
 if(repair.corrected.length||repair.removed.length){
  const backup=path.join(DATA_DIR,'backups','before-beta55-catalogue.json');
  if(!fs.existsSync(backup))require('./lib/atomic-file').atomicJson(backup,{rows:repair.corrected.map(r=>db.getMetadataByMalId(r.malId)),aliases});
  if(repair.corrected.length){const result=db.importMetadataRows(repair.corrected);if(!result.ok)throw Error('ALM_CATALOGUE_REPAIR_FAILED');}
  if(repair.removed.length){
   writeAliases(repair.aliases);
   for(const name of ['matching-cache.json','betaseries-fast-cache.json','anime-lookup-cache.json','image-lookup-cache.json']){
    const file=path.join(DATA_DIR,'cache',name);let cache;try{cache=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
    for(const {key}of repair.removed)delete cache[key];require('./lib/atomic-file').atomicJson(file,cache);
   }
  }
  require('./lib/atomic-file').atomicJson(path.join(DATA_DIR,'backups','beta55-catalogue-report.json'),{version:55,corrected:repair.corrected.map(r=>r.malId),removedAliases:repair.removed.map(r=>r.key)});
 }
 catalogueIntegrityChecked=true;
}

function readIgnoredNews() {
  if (!fs.existsSync(IGNORED_NEWS_FILE)) return [];
  return JSON.parse(fs.readFileSync(IGNORED_NEWS_FILE, "utf8"));
}

function writeIgnoredNews(items) {
  writeJsonAtomicSync(IGNORED_NEWS_FILE, items);
  
}

const DEFAULT_CONFIG = Object.freeze({
  cloudBackupPath: "",
  storageMode: "local-project",
  useAliasCache: true,
  updateAliasesOnStart: false,
  viewMode: "cards",
  workerMode: "database",
  betaseriesApiKey: "",
  betaseriesLastTest: null,
  preloadCacheOnStart: false,
  databaseEdition: true,
  metadataUrl: "",
  metadataManifestUrl: "",
  preloadMetadataOnStart: false,
  metadataUpdateOnStart: false,
  metadataUpdateIntervalHours: 168,
  metadataAutonomousUpdateOnStart: false,
  metadataAutonomousIntervalHours: 168,
  metadataAutonomousSeasonalPages: 2,
  metadataAutonomousUpcomingPages: 2,
  metadataAutonomousTopPages: 0,
  metadataAutonomousAniListPages: 0,
  metadataAutonomousLearnFromSearch: false,
  newsHistoryRetentionDays: 365
});

function readConfig() {
  try {
    const parsed = fs.existsSync(CONFIG_FILE)
      ? require("./lib/config-secrets").unseal(JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")),process.env.ALM_CONFIG_KEY)
      : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('ALM_CONFIG_READ_FAILED');
    return {
      ...DEFAULT_CONFIG,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      cloudBackupPath: parsed?.cloudBackupPath || DEFAULT_CONFIG.cloudBackupPath,
      storageMode: parsed?.storageMode || DEFAULT_CONFIG.storageMode
    };
  } catch (error) {
    if(String(error.message).startsWith('ALM_CONFIG_'))throw error;
    throw Error('ALM_CONFIG_READ_FAILED');
  }
}



function readNewsResults() {
  try {
    if (!fs.existsSync(NEWS_RESULTS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(NEWS_RESULTS_FILE, "utf8"));
    return filterIgnoredSeasonNews(parsed);
  } catch (error) {
    return [];
  }
}

function writeNewsResults(items) {
  const filtered = filterIgnoredSeasonNews(items);
  writeJsonAtomicSync(NEWS_RESULTS_FILE, filtered);
  return filtered;
}

function filterIgnoredSeasonNews(items) {
  const ignored = readIgnoredNews();
  const ids = new Set(ignored.map(item => String(item?.malId || '')).filter(Boolean));
  const titles = new Set(ignored.map(item => normalizeTitle(item?.title || '')).filter(Boolean));
  return (Array.isArray(items) ? items : []).filter(item => item && !ids.has(String(item.malId || '')) && !titles.has(normalizeTitle(item.title || item.sequelTitle || '')));
}

function readSeasonScanState() {
  try {
    if (!fs.existsSync(NEWS_SCAN_STATE_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(NEWS_SCAN_STATE_FILE, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeasonScanState(state) {
  writeJsonAtomicSync(NEWS_SCAN_STATE_FILE, state && typeof state === "object" ? state : {});
}

function seasonScanLibraryFingerprint(animes) {
  const stable = (Array.isArray(animes) ? animes : [])
    .filter(anime => anime?.title && ["Watching", "Completed", "On-Hold", "On Hold"].includes(String(anime.status || "")))
    .map(anime => [String(anime.malId || ""), normalizeTitle(decodeHtmlEntitiesPlain(anime.title || "")), String(anime.status || "")].join(":"))
    .sort()
    .join("|");
  return crypto.createHash("sha1").update(stable).digest("hex").slice(0, 20);
}

function isSeasonScanStateFresh(state, animes, maxAgeMs = SEASON_SCAN_CACHE_TTL_MS) {
  const completedAt = Date.parse(String(state?.completedAt || ""));
  if (state?.status !== "done" || !Number.isFinite(completedAt)) return false;
  if (Date.now() - completedAt > maxAgeMs) return false;
  return String(state?.libraryKey || "") === seasonScanLibraryFingerprint(animes);
}

function readNewsCache() {
  if (!fs.existsSync(NEWS_CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(NEWS_CACHE_FILE, "utf8"));
}

function writeNewsCache(cache) {
  writeJsonAtomicSync(NEWS_CACHE_FILE, cache);
}

function newsCacheKey(item) {
  return normalizeTitle(item?.title || "") || String(item?.malId || "");
}

function writeConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeJsonAtomicSync(CONFIG_FILE, require("./lib/config-secrets").seal(config||{},process.env.ALM_CONFIG_KEY));
}


if(process.env.ALM_CONFIG_KEY&&fs.existsSync(CONFIG_FILE)){const old=JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8'));if(!old.__protected)writeConfig(readConfig());}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileIfExists(src, dest) {
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function copyDirSafe(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDirSafe(s, d);
    else fs.copyFileSync(s, d);
  }
}


function slugify(text) {
  return String(text)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 90) || "anime";
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeHtmlEntitiesPlain(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : _;
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function writeJsonAtomicSync(file, value) {
  const target = String(file || "");
  if (!target) return;
  require('./lib/atomic-file').atomicJson(target,value);
}

async function runWithConcurrency(items, limit, task, shouldStop = null) {
  const queue = [...(Array.isArray(items) ? items : [])];
  const stopRequested = typeof shouldStop === "function" ? shouldStop : () => false;
  let failure, failed = false;
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length && !failed) {
      try {
        if (stopRequested()) break;
        const item = queue.shift();
        if (item === undefined) break;
        await task(item);
      } catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  });
  // Keep the job active until every already-started worker has stopped writing.
  await Promise.all(workers);
  if (failed) throw failure;
}

function normalizeCacheLookupKey(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonSafe(file, fallback) {
  try {
    const parsed = JSON.parse(await fsp.readFile(file, "utf8"));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

async function writeJsonSafe(file, data) {
  require('./lib/atomic-file').atomicJson(file, data);
}


function mediaReviewDefaultState() {
  return {
    version: 3,
    updatedAt: "",
    pendingImports: [],
    quarantined: [],
    analysis: { libraryFingerprint: "", updatedAt: "", items: [] }
  };
}

function mediaReviewImportKey(item) {
  const source = normalizeCacheLookupKey(item?.source || "betaseries") || "source";
  const sourceId = String(item?.row?.id || item?.sourceId || item?.anime?.betaseriesId || "").trim();
  const title = normalizeCacheLookupKey(item?.sourceTitle || item?.anime?.title || item?.title || "");
  return sourceId ? `${source}:${sourceId}` : `${source}:${title}`;
}

function mediaReviewTextArray(value) {
  return Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean) : [];
}

function mediaReviewImageUrl(...values) {
  for (const value of values.flat(Infinity)) {
    const url = String(value || "").trim();
    if (/^(?:https?:\/\/|\/images\/|\/assets\/|data:|blob:|file:)/i.test(url)) return url;
  }
  return "";
}

function sanitizeMediaReviewFound(found) {
  if (!found || typeof found !== "object") return null;
  return {
    title: found.title || "",
    officialTitle: found.officialTitle || found.name || "",
    englishTitle: found.englishTitle || found.titleEn || "",
    romajiTitle: found.romajiTitle || found.titleRomaji || "",
    type: found.type || found.format || "",
    malId: found.malId || found.mal_id || "",
    anilistId: found.anilistId || found.aniListId || "",
    imageUrl: mediaReviewImageUrl(
      found.imageUrl,
      found.poster,
      found.coverImage?.extraLarge,
      found.coverImage?.large,
      found.image?.original,
      found.image?.medium,
      found.images?.jpg?.large_image_url,
      found.images?.jpg?.image_url,
      found.images?.webp?.large_image_url,
      found.images?.webp?.image_url
    ),
    startDate: found.startDate || found.aired?.from || "",
    endDate: found.endDate || found.aired?.to || "",
    episodesTotal: found.episodesTotal || found.episodes || "",
    genres: mediaReviewTextArray(found.genres),
    studios: mediaReviewTextArray(found.studios),
    publicScore: found.publicScore || found.score || "",
    synopsis: found.synopsis || "",
    malUrl: found.malUrl || found.url || "",
    source: found.source || "",
    matchingScore: Number(found.matchingScore || 0)
  };
}

function sanitizeMediaReviewTv(found) {
  if (!found || typeof found !== "object") return null;
  const network = found.network?.name || found.network || found.webChannel?.name || found.webChannel || "";
  return {
    id: found.id || found.tvmazeId || "",
    name: found.name || found.title || found.officialTitle || "",
    type: found.tvmazeType || found.type || "",
    language: found.tvmazeLanguage || found.language || "",
    genres: mediaReviewTextArray(found.genres),
    premiered: found.premiered || found.startDate || "",
    ended: found.ended || found.endDate || "",
    status: found.status || "",
    country: found.tvmazeCountry || found.network?.country?.code || found.webChannel?.country?.code || found.country?.code || found.country || "",
    network: typeof network === "string" ? network : "",
    imageUrl: mediaReviewImageUrl(found.imageUrl, found.image?.original, found.image?.medium, found.poster),
    summary: tvmazeStripHtml(found.summary || found.synopsis || ""),
    rating: found.rating?.average ?? found.rating ?? found.publicScore ?? "",
    url: found.url || found.malUrl || "",
    matchingScore: Number(found.matchingScore || 0),
    source: found.source || "TVMaze"
  };
}

function mediaReviewEvidenceScore(item, kind) {
  const explicit = (Array.isArray(item?.evidence) ? item.evidence : [])
    .filter(entry => String(entry?.kind || "") === kind)
    .reduce((best, entry) => Math.max(best, Number(entry?.score || 0)), 0);
  if (explicit > 0) return explicit;
  if (kind === "anime") return Number(item?.found?.matchingScore || 0);
  if (kind === "tv") return Number(item?.tvmaze?.matchingScore || 0);
  return 0;
}

function mediaReviewIsCertainGeneralTv(item) {
  if (!["non_anime", "review"].includes(String(item?.classification || ""))) return false;
  const confidence = Number(item?.confidence ?? item?.score ?? 0);
  const tvScore = mediaReviewEvidenceScore(item, "tv");
  const animeScore = mediaReviewEvidenceScore(item, "anime");
  const tvEvidence = (Array.isArray(item?.evidence) ? item.evidence : []).find(entry => String(entry?.kind || "") === "tv") || null;
  const tvType = String(item?.tvmaze?.type || "").toLowerCase();
  const tvGenres = (Array.isArray(item?.tvmaze?.genres) ? item.tvmaze.genres : []).join(" ").toLowerCase();
  const looksAnimated = tvEvidence?.animated === true || /animation|anime|animated/.test(`${tvType} ${tvGenres}`);
  // Cas comme Dexter, The Mentalist, NCIS, Stargate... : une fiche TV très
  // forte, pas de candidat anime crédible et aucune indication d'animation.
  // Les anciennes quarantaines pouvaient être classées « review » malgré un
  // candidat TV exact : on les écarte aussi si la preuve TV est quasi certaine.
  const classification = String(item?.classification || "");
  const explicitNonAnime = classification === "non_anime" && confidence >= 94 && tvScore >= 92 && animeScore < 72;
  const obviousLegacyTv = classification === "review" && tvScore >= 98 && animeScore < 55;
  return !looksAnimated && (explicitNonAnime || obviousLegacyTv);
}


function mediaReviewPreferredImage(item) {
  const classification = String(item?.classification || "review");
  const anime = item?.anime || {};
  const found = item?.found || null;
  const tv = item?.tvmaze || null;
  const mixedImport = /betaseries/i.test(String(item?.source || ""));
  if (classification === "non_anime" || (classification === "review" && mixedImport && tv?.imageUrl)) {
    return mediaReviewImageUrl(tv?.imageUrl, item?.sourceImageUrl, anime?.poster, anime?.imageUrl, found?.imageUrl);
  }
  return mediaReviewImageUrl(found?.imageUrl, item?.sourceImageUrl, anime?.poster, anime?.imageUrl, tv?.imageUrl);
}

function sanitizePendingMediaReviewItem(item, previous = null, options = {}) {
  const now = new Date().toISOString();
  const previousAnime = previous?.anime && typeof previous.anime === "object" ? previous.anime : {};
  const incomingAnime = item?.anime && typeof item.anime === "object" ? item.anime : {};
  const found = sanitizeMediaReviewFound(item?.found) || sanitizeMediaReviewFound(previous?.found) || null;
  const tvmaze = sanitizeMediaReviewTv(item?.tvmaze || item?.tvFound) || sanitizeMediaReviewTv(previous?.tvmaze) || null;
  const classification = String(item?.classification || previous?.classification || "review");
  const anime = { ...previousAnime, ...incomingAnime };
  delete anime.id;
  const sourceImageUrl = mediaReviewImageUrl(
    item?.sourceImageUrl,
    previous?.sourceImageUrl,
    classification === "non_anime" ? tvmaze?.imageUrl : found?.imageUrl,
    anime.poster,
    anime.imageUrl,
    classification === "non_anime" ? found?.imageUrl : tvmaze?.imageUrl
  );
  if (!mediaReviewImageUrl(anime.poster) && sourceImageUrl) anime.poster = sourceImageUrl;
  if (!mediaReviewImageUrl(anime.imageUrl) && sourceImageUrl) anime.imageUrl = sourceImageUrl;

  return {
    key: mediaReviewImportKey({ ...item, anime }),
    source: String(item?.source || previous?.source || "BetaSeries"),
    sourceTitle: String(item?.sourceTitle || anime.title || previous?.sourceTitle || ""),
    sourceImageUrl,
    classification,
    reason: String(item?.reason || previous?.reason || "À vérifier."),
    score: Number(item?.score ?? previous?.score ?? 0),
    confidence: Number(item?.confidence ?? item?.score ?? previous?.confidence ?? previous?.score ?? 0),
    evidence: Array.isArray(item?.evidence) ? item.evidence : (Array.isArray(previous?.evidence) ? previous.evidence : []),
    row: {
      id: item?.row?.id ?? previous?.row?.id ?? anime.betaseriesId ?? "",
      title: item?.row?.title || item?.sourceTitle || anime.title || previous?.row?.title || "",
      archive: item?.row?.archive ?? previous?.row?.archive ?? "",
      episode: item?.row?.episode || previous?.row?.episode || anime.betaseriesEpisode || "",
      remaining: item?.row?.remaining ?? previous?.row?.remaining ?? "",
      status: item?.row?.status ?? previous?.row?.status ?? "",
      tags: item?.row?.tags ?? previous?.row?.tags ?? ""
    },
    anime,
    found,
    tvmaze,
    state: String(item?.state || previous?.state || "pending"),
    decision: String(item?.decision || previous?.decision || ""),
    createdAt: previous?.createdAt || item?.createdAt || now,
    updatedAt: options.touch === false ? (previous?.updatedAt || item?.updatedAt || now) : now
  };
}

function sanitizeQuarantinedMediaReviewItem(item) {
  if (!item || typeof item !== "object" || !item.anime) return null;
  const anime = { ...(item.anime || {}) };
  const found = sanitizeMediaReviewFound(item.found);
  const tvmaze = sanitizeMediaReviewTv(item.tvmaze || item.tvFound);
  const classification = ["review", "non_anime"].includes(item.classification) ? item.classification : "review";
  const sourceImageUrl = mediaReviewImageUrl(
    item.sourceImageUrl,
    classification === "non_anime" ? tvmaze?.imageUrl : found?.imageUrl,
    anime.poster,
    anime.imageUrl,
    classification === "non_anime" ? found?.imageUrl : tvmaze?.imageUrl
  );
  if (!mediaReviewImageUrl(anime.poster) && sourceImageUrl) anime.poster = sourceImageUrl;
  if (!mediaReviewImageUrl(anime.imageUrl) && sourceImageUrl) anime.imageUrl = sourceImageUrl;
  return {
    ...item,
    quarantineId: String(item.quarantineId || item.key || ""),
    originalId: Number(item.originalId || anime.id || 0),
    sourceTitle: String(item.sourceTitle || anime.title || ""),
    sourceImageUrl,
    anime,
    found,
    tvmaze,
    classification,
    confidence: Number(item.confidence || 0),
    reason: String(item.reason || "Fiche conservée dans la quarantaine."),
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

async function readMediaReviewState() {
  let raw;
  try { raw = JSON.parse(await fsp.readFile(MEDIA_REVIEW_FILE, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw Error('ALM_MEDIA_REVIEW_READ_FAILED'); raw = mediaReviewDefaultState(); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('ALM_MEDIA_REVIEW_READ_FAILED');
  // A malformed recovery entry must never be silently discarded on the next write.
  for (const name of ['pendingImports','quarantined']) if (raw[name] !== undefined && !Array.isArray(raw[name])) throw Error('ALM_MEDIA_REVIEW_READ_FAILED');
  if ((raw.quarantined || []).some(item => !item || typeof item !== 'object' || !item.anime || typeof item.anime !== 'object' || Array.isArray(item.anime) || !(item.quarantineId || item.key))) throw Error('ALM_MEDIA_REVIEW_READ_FAILED');
  const fallback = mediaReviewDefaultState();
  return {
    version: 3,
    updatedAt: String(raw?.updatedAt || ""),
    pendingImports: (Array.isArray(raw?.pendingImports) ? raw.pendingImports : [])
      .filter(item => item && (item.key || mediaReviewImportKey(item)) && item.state !== "deleted")
      .map(item => sanitizePendingMediaReviewItem(item, item, { touch: false })),
    quarantined: (Array.isArray(raw?.quarantined) ? raw.quarantined : [])
      .map(sanitizeQuarantinedMediaReviewItem)
      .filter(item => item && item.quarantineId && item.anime),
    analysis: raw?.analysis && typeof raw.analysis === "object"
      ? {
          libraryFingerprint: String(raw.analysis.libraryFingerprint || ""),
          updatedAt: String(raw.analysis.updatedAt || ""),
          items: Array.isArray(raw.analysis.items) ? raw.analysis.items : []
        }
      : fallback.analysis
  };
}

async function writeMediaReviewState(state) { return writeMediaReviewStateSync(state); }
function writeMediaReviewStateSync(state) {
  const payload = {
    version: 3,
    updatedAt: new Date().toISOString(),
    pendingImports: Array.isArray(state?.pendingImports) ? state.pendingImports : [],
    quarantined: Array.isArray(state?.quarantined) ? state.quarantined : [],
    analysis: state?.analysis && typeof state.analysis === "object" ? state.analysis : mediaReviewDefaultState().analysis
  };
  writeJsonAtomicSync(MEDIA_REVIEW_FILE, payload);
  return payload;
}

function mediaReviewTitleCandidates(item) {
  const tags = Array.isArray(item?.anime?.tags) ? item.anime.tags : [];
  const taggedTitles = tags
    .map(tag => String(tag || "").match(/^TVMaze\s*:\s*(.+)$/i)?.[1] || "")
    .filter(Boolean);
  return Array.from(new Set([
    item?.sourceTitle,
    item?.row?.title,
    item?.anime?.title,
    item?.title,
    item?.tvmaze?.name,
    ...taggedTitles
  ].map(value => String(value || "").trim()).filter(Boolean)));
}

function mediaReviewTvCacheValue(cache, title) {
  const key = normalizeCacheLookupKey(title);
  if (!key || !cache || typeof cache !== "object") return null;
  const entry = cache[key];
  const value = entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : entry;
  return sanitizeMediaReviewTv(value);
}

function mediaReviewTvCacheForItem(cache, item) {
  for (const title of mediaReviewTitleCandidates(item)) {
    const candidate = mediaReviewTvCacheValue(cache, title);
    if (candidate) return candidate;
  }
  return null;
}

async function readMediaReviewTvCache() {
  return readJsonSafe(TVMAZE_IMPORT_CACHE_FILE, {});
}

function mediaReviewFoundReliability(title, found) {
  const query = String(title || "").trim();
  const candidate = sanitizeMediaReviewFound(found);
  if (!query || !candidate) return { reliable: false, score: 0, threshold: mediaClassifier.minimumAnimeScore(query) };
  const score = Number(mediaClassifier.candidateTitleScore(query, candidate) || 0);
  const threshold = Number(mediaClassifier.minimumAnimeScore(query) || 70);
  const sourceYear = Number(mediaClassifier.extractYear(query) || 0);
  const candidateYear = Number(mediaClassifier.mediaYear(candidate) || 0);
  const yearConflict = sourceYear > 0 && candidateYear > 0 && Math.abs(sourceYear - candidateYear) > 1;
  const stableId = mediaClassifier.hasStableAnimeId(candidate);
  return {
    reliable: stableId && score >= threshold && !yearConflict,
    score,
    threshold,
    yearConflict,
    stableId
  };
}

function mediaReviewMetadataForItem(item) {
  try {
    const sourceTitle = String(item?.sourceTitle || item?.row?.title || item?.anime?.title || "").trim();
    const existing = sanitizeMediaReviewFound(item?.found);
    const existingReliability = mediaReviewFoundReliability(sourceTitle, existing);

    // Un ancien cache ne peut plus imposer son MAL ID si son titre n'est pas
    // réellement compatible avec le titre importé. C'est ce qui pouvait conserver
    // Avatar -> Quanzhi Gaoshou après correction du score de rapprochement.
    if (existing && existingReliability.reliable) {
      const malId = existing.malId || item?.anime?.malId || "";
      if (malId && db?.getMetadataByMalId) {
        const row = db.getMetadataByMalId(malId);
        if (row) {
          const metadata = metadataToFound(row, sourceTitle || row.title || "", 100);
          if (mediaReviewFoundReliability(sourceTitle, metadata).reliable) return metadata;
        }
      }
    }

    if (sourceTitle && typeof searchMetadataLocal === "function") {
      const strictMin = Math.max(70, Number(mediaClassifier.minimumAnimeScore(sourceTitle) || 70));
      const fresh = searchMetadataLocal(sourceTitle, { minScore: strictMin, limit: 12, tokenLimit: 120 });
      if (fresh && mediaReviewFoundReliability(sourceTitle, fresh).reliable) return fresh;
    }
  } catch {}
  return null;
}

async function enrichMediaReviewStateLocal(state, options = {}) {
  await db.whenReady();
  await db.prepareMetadataTitleIndex();
  const tvCache = await readMediaReviewTvCache();
  let changed = false;

  const enrich = item => {
    const before = JSON.stringify({
      sourceImageUrl: item.sourceImageUrl || "",
      classification: item.classification || "",
      reason: item.reason || "",
      found: item.found || null,
      tvmaze: item.tvmaze || null,
      poster: item.anime?.poster || "",
      imageUrl: item.anime?.imageUrl || ""
    });
    const sourceTitle = String(item?.sourceTitle || item?.row?.title || item?.anime?.title || "").trim();
    const oldFound = sanitizeMediaReviewFound(item?.found);
    const oldReliability = mediaReviewFoundReliability(sourceTitle, oldFound);
    if (oldFound && !oldReliability.reliable) {
      item.found = null;
      if (item.anime && item.anime.malId && String(item.anime.malId) === String(oldFound.malId || "")) {
        item.anime.malId = "";
        item.anime.malUrl = "";
      }
    }

    const metadata = mediaReviewMetadataForItem(item);
    if (metadata) {
      item.found = sanitizeMediaReviewFound({
        ...(metadata || {}),
        imageUrl: mediaReviewImageUrl(metadata.imageUrl, item?.found?.imageUrl)
      });
    }

    const cachedTv = mediaReviewTvCacheForItem(tvCache, item);
    if (cachedTv) item.tvmaze = sanitizeMediaReviewTv({ ...(cachedTv || {}), ...(item.tvmaze || {}), imageUrl: mediaReviewImageUrl(item?.tvmaze?.imageUrl, cachedTv.imageUrl) });

    // Une réanalyse locale recalcule réellement le verdict avec les candidats
    // actuels, au lieu de conserver une ancienne classification devenue incohérente.
    if (sourceTitle && item.state === "pending") {
      // Une ancienne quarantaine peut n'avoir conservé que la preuve TV forte
      // sans l'objet TVMaze complet. Ne pas rétrograder Dexter/NCIS/etc. en
      // « à vérifier » uniquement parce que la jaquette n'a pas encore été résolue.
      if (!mediaReviewIsCertainGeneralTv(item) || item.tvmaze) {
        const verdict = importCandidateValidation.validate({...item.row,title:sourceTitle},item.found,item.tvmaze);
        item.classification = verdict.classification;
        item.reason = verdict.reason;
        item.score = verdict.score;
        item.confidence = verdict.confidence;
        item.evidence = verdict.evidence;
      }
    }

    item.sourceImageUrl = mediaReviewPreferredImage(item);
    if (item.sourceImageUrl && item.anime) {
      if (!mediaReviewImageUrl(item.anime.poster)) item.anime.poster = item.sourceImageUrl;
      if (!mediaReviewImageUrl(item.anime.imageUrl)) item.anime.imageUrl = item.sourceImageUrl;
    }
    const after = JSON.stringify({
      sourceImageUrl: item.sourceImageUrl || "",
      classification: item.classification || "",
      reason: item.reason || "",
      found: item.found || null,
      tvmaze: item.tvmaze || null,
      poster: item.anime?.poster || "",
      imageUrl: item.anime?.imageUrl || ""
    });
    if (before !== after) changed = true;
  };

  const rows = [...(state.pendingImports || []), ...(state.quarantined || [])];
  for (let index = 0; index < rows.length; index++) {
    enrich(rows[index]);
    if (typeof options.onProgress === "function") {
      options.onProgress({ done: index + 1, total: rows.length, current: rows[index]?.sourceTitle || rows[index]?.anime?.title || "Entrée importée" });
    }
    // sql.js et le fuzzy matching sont synchrones. Rendre la main régulièrement
    // évite qu'une grosse quarantaine bloque la boucle Electron pendant le scan.
    if ((index + 1) % 8 === 0) await yieldToEventLoop();
  }
  return { changed, tvCache };
}

async function upsertPendingMediaReviews(...args){return mediaReviewQueue.run(()=>upsertPendingMediaReviewsUnlocked(...args));}
async function upsertPendingMediaReviewsUnlocked(items) {
  const state = await readMediaReviewState();
  const map = new Map(state.pendingImports.map(item => [item.key, item]));
  let added = 0;
  let updated = 0;
  let resolved = 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const key = mediaReviewImportKey(item);
    if (!key || key.endsWith(":")) continue;
    const previous = map.get(key) || null;

    // Une analyse ultérieure peut enfin confirmer l'anime (metadata mise à
    // jour, titre mieux reconnu, etc.). Dans ce cas l'ancienne alerte ne doit
    // plus rester visible dans la quarantaine.
    if (!["review", "non_anime"].includes(item.classification)) {
      if (["pending", "auto_excluded"].includes(previous?.state)) {
        map.set(key, {
          ...previous,
          classification: String(item.classification || "anime"),
          reason: String(item.reason || "Correspondance anime confirmée lors d'une nouvelle analyse."),
          state: "resolved",
          decision: "resolved-automatically",
          updatedAt: new Date().toISOString()
        });
        resolved += 1;
      }
      continue;
    }

    const next = sanitizePendingMediaReviewItem(item, previous);
    // Une série/film généraliste pratiquement certain (Dexter, The Mentalist,
    // NCIS...) n'a pas besoin d'encombrer le Contrôle anime. Elle reste mémorisée
    // comme exclusion automatique et pourra réapparaître uniquement si une
    // analyse future apporte un vrai candidat anime crédible.
    if (mediaReviewIsCertainGeneralTv(next) && !["kept", "imported"].includes(previous?.state)) {
      next.state = "auto_excluded";
      next.decision = "auto_excluded_non_anime";
    }
    // Une décision manuelle ne doit pas être annulée par une nouvelle analyse
    // du même CSV. Les éléments importés ou classés restent silencieux ; ils
    // peuvent toujours être revus via une nouvelle décision explicite.
    if (["kept", "imported", "dismissed", "auto_excluded"].includes(previous?.state)) {
      next.state = previous.state;
      next.decision = previous.decision || previous.state;
      next.importedAt = previous.importedAt || "";
    }
    map.set(key, next);
    previous ? updated++ : added++;
  }
  state.pendingImports = [...map.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 1000);
  const saved = await writeMediaReviewState(state);
  return {
    added,
    updated,
    resolved,
    pending: saved.pendingImports.filter(item => item.state === "pending").length
  };
}

async function markPendingMediaReviewDecision(...args){return mediaReviewQueue.run(()=>markPendingMediaReviewDecisionUnlocked(...args));}
async function markPendingMediaReviewDecisionUnlocked(key, decision, patch = {}) {
  const state = await readMediaReviewState();
  const index = state.pendingImports.findIndex(item => item.key === key);
  if (index < 0) return null;
  state.pendingImports[index] = {
    ...state.pendingImports[index],
    ...patch,
    state: decision === "delete" ? "deleted" : (patch.state || decision),
    decision,
    updatedAt: new Date().toISOString()
  };
  await writeMediaReviewState(state);
  return state.pendingImports[index];
}

function mediaReviewLibraryFingerprint(animes) {
  const stable = (Array.isArray(animes) ? animes : [])
    .map(anime => `${anime?.id || ""}|${anime?.malId || ""}|${normalizeCacheLookupKey(anime?.title || "")}|${(anime?.tags || []).join(",")}|${anime?.mediaKind || ""}`)
    .sort()
    .join("\n");
  return crypto.createHash("sha1").update(stable).digest("hex").slice(0, 24);
}

function mediaReviewCandidateFromAnime(anime, result) {
  return {
    animeId: Number(anime?.id || 0),
    title: String(anime?.title || ""),
    poster: anime?.poster || anime?.imageUrl || "",
    status: anime?.status || "",
    type: anime?.type || "",
    tags: Array.isArray(anime?.tags) ? anime.tags : [],
    classification: result.classification,
    confidence: Number(result.confidence || 0),
    reason: result.reason || "À vérifier.",
    evidence: Array.isArray(result.evidence) ? result.evidence : []
  };
}

function metadataMatchForMediaReview(anime) {
  try {
    if (anime?.malId && db?.getMetadataByMalId) {
      const byId = db.getMetadataByMalId(anime.malId);
      if (byId) return { ...byId, source: "LocalMetadata", matchingScore: 100 };
    }
    if (typeof searchMetadataLocal === "function") return searchMetadataLocal(anime?.title || "");
  } catch {}
  return null;
}

async function analyseLibraryMediaKinds(options = {}) {
  await db.whenReady();
  const animes = readAnimes();
  const fingerprint = mediaReviewLibraryFingerprint(animes);
  const state = await readMediaReviewState();
  if (!options.force && state.analysis.libraryFingerprint === fingerprint && Array.isArray(state.analysis.items)) {
    return { fingerprint, cached: true, items: state.analysis.items, total: animes.length };
  }

  const candidates = [];
  for (let index = 0; index < animes.length; index++) {
    const anime = animes[index];
    const result = mediaClassifier.classifyLibraryEntry(anime, metadataMatchForMediaReview(anime));
    if (result.classification === "non_anime" || result.classification === "review") {
      candidates.push(mediaReviewCandidateFromAnime(anime, result));
    }
    if (typeof options.onProgress === "function") {
      options.onProgress({ done: index + 1, total: animes.length, current: anime?.title || "Anime" });
    }
    if ((index + 1) % 8 === 0) await yieldToEventLoop();
  }
  candidates.sort((a, b) => {
    const rank = value => value === "non_anime" ? 0 : 1;
    return rank(a.classification) - rank(b.classification) || Number(b.confidence || 0) - Number(a.confidence || 0) || a.title.localeCompare(b.title, "fr");
  });
  state.analysis = { libraryFingerprint: fingerprint, updatedAt: new Date().toISOString(), items: candidates };
  await writeMediaReviewState(state);
  return { fingerprint, cached: false, items: candidates, total: animes.length };
}

function invalidateMediaReviewAnalysis(state) {
  state.analysis = { libraryFingerprint: "", updatedAt: "", items: [] };
}

function normalizeRestoredMediaReviewState(raw) {
  const base = mediaReviewDefaultState();
  const source = raw && typeof raw === "object" ? raw : {};
  const legacyRows = Array.isArray(source)
    ? source
    : (Array.isArray(source.items) ? source.items : []);
  const pendingRows = Array.isArray(source.pendingImports) ? source.pendingImports : legacyRows;
  const pendingImports = pendingRows
    .map(item => sanitizePendingMediaReviewItem(item, null, { touch: false }))
    .filter(item => item.key && !item.key.endsWith(":"));
  const quarantined = (Array.isArray(source.quarantined) ? source.quarantined : [])
    .map(sanitizeQuarantinedMediaReviewItem)
    .filter(item => item && item.quarantineId && item.anime);
  return {
    ...base,
    pendingImports,
    quarantined,
    // Une restauration de bibliothèque invalide toujours l'ancien diagnostic.
    analysis: base.analysis
  };
}


async function fetchJsonWithRetry(url, attempts = 3) {
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Anime Local Manager"
        }
      });

      if (response.status === 429) {
        await sleep(1600 + i * 1200);
        continue;
      }

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(900 + i * 800);
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(900 + i * 800);
    }
  }

  throw lastError || new Error("Fetch failed");
}

function mergeDetailsIntoNewsItem(item, details) {
  if (!details) return item;

  return {
    ...item,
    imageUrl: details.imageUrl || item.imageUrl || "",
    synopsis: details.synopsis || item.synopsis || "",
    type: details.type || item.type || "",
    episodesTotal: details.episodesTotal || item.episodesTotal || "",
    startDate: details.startDate || item.startDate || "",
    endDate: details.endDate || item.endDate || "",
    publicScore: details.publicScore || item.publicScore || "",
    rank: details.rank || item.rank || "",
    genres: details.genres || item.genres || [],
    url: details.malUrl || item.url || "",
    malId: details.malId || item.malId || ""
  };
}

const aliases = {
  "Red Eyes Sword - Akame ga Kill!": ["Akame ga Kill"],
  "DanMachi: Familia Myth": ["Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka", "Is It Wrong to Try to Pick Up Girls in a Dungeon"],
  "The Rising of the Shield Hero": ["Tate no Yuusha no Nariagari"],
  "Demon Slayer": ["Kimetsu no Yaiba"],
  "Tower of God": ["Kami no Tou"],
  "Solo Leveling": ["Ore dake Level Up na Ken", "Solo Leveling"],
  "The Heroic Legend of Arslân": ["Arslan Senki"],
  "Bofuri": ["Itai no wa Iya nanode Bougyoryoku ni Kyokufuri Shitai to Omoimasu"],
  "Black Summoner": ["Kuro no Shoukanshi"],
  "Frieren": ["Sousou no Frieren"],
  "Chainsaw Man Movie: Reze-hen": ["Chainsaw Man Reze Arc"]
};

// ─── Dictionnaire FR→EN étendu ──────────────────────────────
const FR_TO_EN = {
  "attaque des titans":"attack on titan","l attaque des titans":"attack on titan",
  "mon hero academia":"my hero academia","mon heros academia":"my hero academia",
  "academie des super heros":"my hero academia",
  "une piece":"one piece","chevaliers du zodiaque":"saint seiya",
  "fullmetal alchemist frere d acier":"fullmetal alchemist brotherhood",
  "demon slayer pourfendeur de demons":"demon slayer kimetsu no yaiba",
  "demon slayer":"demon slayer kimetsu no yaiba","brigade des feles":"soul eater",
  "chasseur x chasseur":"hunter x hunter",
  "les 7 peches capitaux":"seven deadly sins","les sept peches capitaux":"seven deadly sins",
  "tensura":"tensei shitara slime datta ken",
  "re zero":"re zero starting life in another world",
  "danmachi":"dungeon ni deai wo motomeru no wa machigatteiru darou ka",
  "konosuba":"kono subarashii sekai ni shukufuku wo",
  "mushoku tensei":"mushoku tensei isekai ittara honki dasu",
  "frieren au dela du voyage":"sousou no frieren","frieren":"sousou no frieren",
  "shield hero":"tate no yuusha no nariagari",
  "the rising of the shield hero":"tate no yuusha no nariagari",
};

function stripJapanese(title) {
  // Supprimer les caractères CJK, hiragana, katakana et les parenthèses fullwidth
  return title
    .replace(/[　-鿿豈-﫿︰-﹏＀-￯]/g, '')
    .replace(/[（）【】『』「」《》〈〉〔〕｛｝]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function stripCJK(s) {
  // Supprimer caractères japonais/chinois/coréens + parenthèses fullwidth
  return s.replace(/[\u3000-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3040-\u30FF]/g, '')
    .replace(/[（）【】『』「」《》〈〉〔〕｛｝]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function queriesForTitle(title) {
  const base = String(title || "").trim();
  const clean = stripCJK(base); // titre sans japonais
  const norm = (clean || base).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  const variants = new Set([base]);
  if (clean && clean !== base) variants.add(clean);
  const workBase = clean || base;
  const noArt = workBase.replace(/^(Le |La |Les |L'|Un |Une |Des |Du |De |D')/i,"").trim();
  if (noArt && noArt !== workBase) variants.add(noArt);
  const noSeason = workBase.replace(/\b(Saison|Season|Partie|Part|Cour)\s*\d+.*$/i,"").trim();
  if (noSeason && noSeason !== workBase) variants.add(noSeason);
  const noParens = workBase.replace(/\s*\(.*?\)\s*/g," ").replace(/\s*:.*$/,"").trim();
  if (noParens && noParens !== workBase) variants.add(noParens);
  const noAcc = workBase.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if (noAcc !== workBase) variants.add(noAcc);
  const trans = FR_TO_EN[norm];
  if (trans) variants.add(trans);
  if (Array.isArray(aliases?.[base])) aliases[base].forEach(a => variants.add(a));

  // Variantes de titres anglaises observées dans certains exports/catalogues.
  // Elles ne sont pas de simples fautes : plusieurs distributeurs utilisent des
  // traductions très différentes de celles de MAL. Ces règles restent ciblées
  // et renvoient vers le titre canonique présent dans le snapshot local.
  if (/failure\s+skill.*berry\s+master/i.test(workBase)) {
    variants.add('Hazure Skill "Kinomi Master": Skill no Mi (Tabetara Shinu) wo Mugen ni Taberareru You ni Natta Ken ni Tsuite');
    variants.add('Failure Skill "Nut Master"');
  }
  if (/jack.?of.?all.?trades.*kicked.*hero.*party/i.test(workBase)) {
    variants.add('Yuusha Party wo Oidasareta Kiyoubinbou');
    variants.add('Jack-of-All-Trades, Party of None');
  }
  if (/(newbie|rookie).*middle.?aged.*adventurer.*trained.*death/i.test(workBase)) {
    variants.add('Shinmai Ossan Boukensha, Saikyou Party ni Shinu hodo Kitaerarete Muteki ni Naru.');
    variants.add('The Rookie Middle-Aged Adventurer Was Trained to Death by the Most Powerful Party to Become Invincible');
  }
  return [...variants].filter(v => v && v.length > 1).slice(0, 12);
}

function mapJikanAnime(best, currentTitle) {
  const studios   = Array.isArray(best.studios)      ? best.studios.map(s=>s.name).filter(Boolean)      : [];
  const producers = Array.isArray(best.producers)    ? best.producers.map(p=>p.name).filter(Boolean)    : [];
  const themes    = Array.isArray(best.themes)       ? best.themes.map(t=>t.name).filter(Boolean)       : [];
  const demog     = Array.isArray(best.demographics) ? best.demographics.map(d=>d.name).filter(Boolean) : [];
  return {
    title:        currentTitle || best.title || "",
    officialTitle:best.title || "",
    englishTitle: best.title_english || "",
    type:         best.type || "",
    episodesTotal:best.episodes ? String(best.episodes) : "",
    startDate:    best.aired?.from ? best.aired.from.slice(0,10) : "",
    endDate:      best.aired?.to ? best.aired.to.slice(0,10) : "",
    publicScore:  best.score ? String(best.score) : "",
    rank:         best.rank ? String(best.rank) : "",
    popularity:   best.popularity ? String(best.popularity) : "",
    members:      best.members ? String(best.members) : "",
    genres:       Array.isArray(best.genres) ? best.genres.map(g=>g.name).filter(Boolean) : [],
    themes, demographics: demog, studios, producers,
    synopsis:     best.synopsis || "",
    malUrl:       best.url || "",
    malId:        best.mal_id || "",
    imageUrl:     best.images?.jpg?.large_image_url || best.images?.jpg?.image_url || "",
    rating:       best.rating || "",
    source:       best.source || "Jikan",
    scoreSource: best.source === "Kitsu" ? "" : "MyAnimeList"
  };
}

const jikanMemoryCache = new Map();

// Legacy Jikan transport is disabled; cached schemas and parsers remain compatible.
async function jikanLimited(task) {
  // Public Jikan is retired. Legacy parsers remain for cached records only.
  throw Object.assign(new Error("ALM_JIKAN_RETIRED"), {code:"ALM_JIKAN_RETIRED"});

}


const metadataProviders = require("./lib/metadata-providers").createMetadataProviders({
  getClientId: () => readConfig().malClientId || process.env.ALM_MAL_CLIENT_ID || ""
});

require("./lib/calendar-sources").setProviders(metadataProviders);

async function fetchJikanJson(url, options = {}) {
  const route = new URL(url).pathname.replace(/^\/v4\//, "");
  const match = /^anime\/(\d+)(?:\/(full|relations|recommendations))?$/.exec(route);
  if (match) {
    const raw = await metadataProviders.byId(Number(match[1]));
    if (raw) return {data: match[2] === "relations" ? raw.relations || [] : match[2] === "recommendations" ? raw.recommendations || [] : raw};
  }
  if(options.throwOnError) throw Object.assign(new Error("ALM_SOURCE_UNAVAILABLE"),{code:"ALM_SOURCE_UNAVAILABLE"});
  return null;

}

// ── Cache Jikan disque (survit aux redémarrages) ──
const JIKAN_DISK_CACHE_FILE = path.join(DATA_DIR, "cache", "jikan-disk-cache.json");
let _jikanDiskCache = {};
try {
  fs.mkdirSync(path.join(DATA_DIR, "cache"), { recursive: true });
  _jikanDiskCache = JSON.parse(fs.readFileSync(JIKAN_DISK_CACHE_FILE, "utf8")) || {};
} catch {}
let _jikanDiskCacheWrites = 0;

function _saveJikanDiskCache() {
  _jikanDiskCacheWrites++;
  if (_jikanDiskCacheWrites % 8 === 0) {
    fsp.writeFile(JIKAN_DISK_CACHE_FILE, JSON.stringify(_jikanDiskCache), "utf8").catch(() => {});
  }
}

async function searchJikan(title) {
  const candidates = await metadataProviders.search(String(title || "").trim());
  let best = null, bestScore = 0;
  for (const raw of candidates) {
    const score = Math.max(...[raw.title, raw.title_english, raw.title_japanese, ...(raw.title_synonyms || [])].map(name => fuzzyScore(title, name || "")));
    if (score < minimumAcceptableMatchScoreForTitle(title) || score <= bestScore) continue;
    bestScore = score; best = {...mapJikanAnime(raw, title), matchingScore: score};
  }
  if (best) return best;
  // Historical cache is a local fallback, never a claim of a fresh response.
  const cached = _jikanDiskCache[normalizeTitle(title)];
  return cached ? {...cached, source:"LocalMetadata"} : null;
}




function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {timer=setTimeout(() => reject(new Error("Timeout")), ms);})
  ]).finally(()=>clearTimeout(timer));
}

async function getAnimeById(malId, options = {}) {
  if (!malId) return null;
  if (!options.forceRemote && !metadataProviders.configured()) {
    const local = db?.getMetadataByMalId?.(malId);
    if (local?.synopsis && local.imageUrl && local.episodes) return metadataToFound(local, local.title, 100);
  }

  try {
    const full = await fetchJikanJson(`https://api.jikan.moe/v4/anime/${malId}/full`, { attempts: 4, timeoutMs: 12000 });
    if (full?.data) {
      metadataLearnFromRows([jikanAnimeToMetadataRow(full.data)], "jikan-by-id");
      return mapJikanAnime(full.data, full.data.title);
    }
  } catch (e) {}

  try {
    const basic = await fetchJikanJson(`https://api.jikan.moe/v4/anime/${malId}`, { attempts: 4, timeoutMs: 12000 });
    if (basic?.data) {
      metadataLearnFromRows([jikanAnimeToMetadataRow(basic.data)], "jikan-by-id-basic");
      return mapJikanAnime(basic.data, basic.data.title);
    }
  } catch (e) {}

  // Fallback local embarqué : indispensable pour une release autonome si Jikan
  // est lent, indisponible, ou rate-limité.
  try {
    const local = db?.getMetadataByMalId ? db.getMetadataByMalId(malId) : null;
    if (local) return metadataToFound(local, local.title || String(malId), 100);
  } catch {}

  return null;
}


async function searchAniListImage(title) {
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          title { romaji english native }
          coverImage { extraLarge large medium }
        }
      }
    `;

    const response = await aniListFetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ query, variables: { search: title } })
    });

    if (!response.ok) return "";
    const json = await response.json();
    const cover = json?.data?.Media?.coverImage;
    return cover?.extraLarge || cover?.large || cover?.medium || "";
  } catch (e) {
    return "";
  }
}

async function searchKitsuImage(title) {
  try {
    const url = `https://kitsu.app/api/edge/anime?filter[text]=${encodeURIComponent(title)}&fields[anime]=posterImage&page[limit]=1`;
    const result = await boundedTextFetch(url, {timeoutMs:10000, maxBytes:512*1024, validate:assertPublicNewsUrl,fetchImpl:require("./lib/public-fetch").publicFetch, headers:{Accept:"application/vnd.api+json"}});
    if (!result.response.ok) return "";
    const json = JSON.parse(result.text);
    const img = json.data?.[0]?.attributes?.posterImage;
    return img?.large || img?.medium || img?.original || "";
  } catch { return ""; }
}


function tvmazeStripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const TVMAZE_TITLE_ALIASES = new Map([
  ["лучше чем люди", "Better Than Us"],
  ["luchshe chem lyudi", "Better Than Us"],
  ["лучше, чем люди", "Better Than Us"],
  ["treadstone", "Treadstone"]
]);

function tvmazeQueryVariants(title) {
  const raw = String(title || "").trim();
  const norm = normalizeForCompare(raw);
  const compact = raw.toLowerCase().replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return [...new Set([
    raw,
    TVMAZE_TITLE_ALIASES.get(raw.toLowerCase()),
    TVMAZE_TITLE_ALIASES.get(compact),
    TVMAZE_TITLE_ALIASES.get(norm)
  ].filter(Boolean))];
}

// L'API publique TVMaze autorise 20 appels par tranche de 10 secondes. Tous
// les usages du serveur passent par ce créneau global (environ 18 appels/10 s)
// afin que l'import de gros CSV reste poli et ne déclenche pas de 429 en rafale.
const TVMAZE_START_DELAY_MS = Math.max(0, Number(process.env.ALM_TVMAZE_START_DELAY_MS ?? 560));
let _tvmazeStartQueue = Promise.resolve();
let _tvmazeNextStartAt = 0;

async function waitForTvmazeStartSlot() {
  let release = null;
  const previous = _tvmazeStartQueue;
  _tvmazeStartQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    const waitMs = Math.max(0, _tvmazeNextStartAt - Date.now());
    if (waitMs) await sleep(waitMs);
    _tvmazeNextStartAt = Date.now() + TVMAZE_START_DELAY_MS;
  } finally {
    release?.();
  }
}

async function fetchTvmazeJson(url, timeoutMs = 9000) {
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await waitForTvmazeStartSlot();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "application/json", "User-Agent": `Anime Local Manager/${PRODUCT_RELEASE.technicalVersion} TV metadata fallback` }
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        await sleep(Math.max(1200, retryAfter > 0 ? retryAfter * 1000 : 0));
        continue;
      }
      if (response.status >= 500 && attempt + 1 < attempts) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch {
      if (attempt + 1 < attempts) await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function searchTvmazeShow(title) {
  const originalQuery = String(title || "").trim();
  if (!originalQuery || originalQuery.length < 2) return null;

  let best = null;
  let bestScore = 0;
  let bestQuery = originalQuery;

  for (const query of tvmazeQueryVariants(originalQuery)) {
    const results = await fetchTvmazeJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`, 9000);
    if (!Array.isArray(results) || !results.length) continue;

    for (const row of results.slice(0, 8)) {
    const show = row?.show;
    if (!show?.name) continue;
    const titleScore = Math.max(
      fuzzyScore(query, show.name || ""),
      similarityScore(query, show.name || ""),
      ...(Array.isArray(show.aliases) ? show.aliases.map(a => Math.max(fuzzyScore(query, a || ""), similarityScore(query, a || ""))) : [0])
    );
    const apiScore = Math.round(Number(row.score || 0) * 100);
    const score = Math.max(titleScore, apiScore);
      if (score > bestScore) { best = show; bestScore = score; bestQuery = query; }
    }
  }
  if (!best || bestScore < 60) return null;

  let episodesTotal = "";
  try {
    const eps = await fetchTvmazeJson(`https://api.tvmaze.com/shows/${best.id}/episodes`, 10000);
    if (Array.isArray(eps) && eps.length) episodesTotal = String(eps.length);
  } catch {}

  return {
    title: originalQuery,
    officialTitle: best.name || bestQuery || originalQuery,
    englishTitle: best.name || "",
    type: "TV",
    episodesTotal,
    startDate: best.premiered || "",
    endDate: best.ended || "",
    publicScore: best.rating?.average ? String(best.rating.average) : "",
    rank: "",
    popularity: "",
    members: "",
    genres: Array.isArray(best.genres) ? best.genres : [],
    themes: [],
    demographics: [],
    studios: best.network?.name ? [best.network.name] : best.webChannel?.name ? [best.webChannel.name] : [],
    producers: [],
    synopsis: tvmazeStripHtml(best.summary || ""),
    malUrl: best.url || "",
    malId: "",
    imageUrl: best.image?.original || best.image?.medium || "",
    rating: best.rating?.average ? `TVmaze ${best.rating.average}/10` : "",
    source: "TVMaze",
    matchingScore: bestScore,
    nonAnimeFallback: true,
    tvmazeId: best.id || "",
    tvmazeType: best.type || "",
    tvmazeLanguage: best.language || "",
    tvmazeCountry: best.network?.country?.code || best.webChannel?.country?.code || ""
  };
}


function mapTvmazeAuditCandidate(show, query, score = 0) {
  if (!show?.name) return null;
  return sanitizeMediaReviewTv({
    id: show.id || "",
    name: show.name || query || "",
    type: show.type || "Série TV",
    language: show.language || "",
    genres: Array.isArray(show.genres) ? show.genres : [],
    premiered: show.premiered || "",
    ended: show.ended || "",
    status: show.status || "",
    country: show.network?.country?.code || show.webChannel?.country?.code || show.network?.country?.name || show.webChannel?.country?.name || "",
    network: show.network?.name || show.webChannel?.name || "",
    imageUrl: show.image?.original || show.image?.medium || "",
    url: show.url || "",
    matchingScore: Number(score || 0),
    source: "TVMaze"
  });
}

// Variante légère réservée au Contrôle anime : elle récupère la fiche et sa
// jaquette sans télécharger toute la liste des épisodes.
async function searchTvmazeAuditCandidate(title, tvmazeId = null) {
  const originalQuery = String(title || "").trim();
  const stableId = Number(tvmazeId || 0);
  if (stableId > 0) {
    const show = await fetchTvmazeJson(`https://api.tvmaze.com/shows/${stableId}`, 9000).catch(() => null);
    if (show?.name) {
      return rememberTvmazeAuditCandidate(originalQuery, mapTvmazeAuditCandidate(show, originalQuery, Math.max(70, mediaClassifier.titleSimilarity(originalQuery, show.name))));
    }
  }
  if (!originalQuery || originalQuery.length < 2) return null;

  let bestShow = null;
  let bestScore = 0;
  for (const query of tvmazeQueryVariants(originalQuery)) {
    const results = await fetchTvmazeJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`, 9000).catch(() => null);
    if (!Array.isArray(results)) continue;
    for (const row of results.slice(0, 10)) {
      const show = row?.show;
      if (!show?.name) continue;
      const titleScore = Math.max(
        mediaClassifier.titleSimilarity(originalQuery, show.name),
        mediaClassifier.titleSimilarity(query, show.name),
        ...(Array.isArray(show.aliases) ? show.aliases.map(alias => mediaClassifier.titleSimilarity(originalQuery, alias || "")) : [0])
      );
      const apiScore = Math.round(Number(row?.score || 0) * 100);
      const score = titleScore >= 55 ? Math.max(titleScore, Math.min(100, apiScore)) : titleScore;
      if (score > bestScore) {
        bestShow = show;
        bestScore = score;
      }
    }
    if (bestScore >= 100) break;
  }
  return bestShow && bestScore >= 60 ? rememberTvmazeAuditCandidate(originalQuery, mapTvmazeAuditCandidate(bestShow, originalQuery, bestScore)) : null;
}
function rememberTvmazeAuditCandidate(title, candidate) {
  if (!candidate) return null;
  try {
    const cache=safeReadJsonFile(TVMAZE_IMPORT_CACHE_FILE,{});
    cache[normalizeCacheLookupKey(title)]={value:candidate,cachedAt:new Date().toISOString()};
    writeJsonAtomicSync(TVMAZE_IMPORT_CACHE_FILE,cache);
  } catch {}
  return candidate;
}

async function searchBestImageUrl(title, malId = null) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle && !malId) return "";

  // Priorité 0 : snapshot metadata embarqué. Il donne souvent l'URL image MAL
  // sans devoir refaire une recherche.
  if (malId && db?.getMetadataByMalId) {
    try {
      const local = db.getMetadataByMalId(malId);
      if (local?.imageUrl) return local.imageUrl;
    } catch {}
  }
  if (cleanTitle) {
    try {
      const local = searchMetadataLocal(cleanTitle, { minScore: 55, limit: 6 });
      if (local?.imageUrl) return local.imageUrl;
      if (!malId && local?.malId) malId = local.malId;
    } catch {}
  }

  // Priorité 1 : malId direct Jikan = le plus fiable quand le réseau répond.
  if (malId) {
    try {
      const j = await fetchJikanJson(`https://api.jikan.moe/v4/anime/${malId}`, { attempts: 4, timeoutMs: 12000 });
      if (j?.data) metadataLearnFromRows([jikanAnimeToMetadataRow(j.data)], "jikan-image-by-id");
      const url = j?.data?.images?.jpg?.large_image_url || j?.data?.images?.jpg?.image_url || j?.data?.images?.webp?.large_image_url || j?.data?.images?.webp?.image_url;
      if (url) return url;
    } catch {}
  }

  if (!cleanTitle) return "";

  // Priorité 2 : 3 sources en parallèle.
  const [jikanRes, aniListRes, kitsuRes, tvmazeRes] = await Promise.allSettled([
    searchJikan(cleanTitle).then(f => f?.imageUrl || "").catch(() => ""),
    searchAniListImage(cleanTitle).catch(() => ""),
    searchKitsuImage(cleanTitle),
    searchTvmazeShow(cleanTitle).then(f => f?.imageUrl || "").catch(() => "")
  ]);

  return (jikanRes.value || "") || (aniListRes.value || "") || (kitsuRes.value || "") || (tvmazeRes.value || "");
}

const imageDownloadMemory=new Map();
const imageDownloadFlight=singleFlight(downloadImageOnce);
async function downloadImage(imageUrl,title){
 const cached=imageDownloadMemory.get(String(imageUrl));if(cached&&fs.existsSync(path.join(IMAGES_DIR,path.basename(cached))))return cached;
 const result=await imageDownloadFlight(imageUrl,title);if(result){if(imageDownloadMemory.size>5000)imageDownloadMemory.delete(imageDownloadMemory.keys().next().value);imageDownloadMemory.set(String(imageUrl),result);}return result;
}
async function downloadImageOnce(imageUrl,title){
 if(!imageUrl)return '';try{const {bytes}=await require('./lib/public-network').fetchBinary(imageUrl);const ext=require('./lib/public-network').imageExtension(bytes);if(bytes.length<800)return '';const filename='cover-'+crypto.createHash('sha256').update(bytes).digest('hex')+'.'+ext;const file=path.join(IMAGES_DIR,filename);if(!fs.existsSync(file))require('./lib/atomic-file').atomicWrite(file,bytes);return '/images/'+filename;}catch{return '';}
}

const _stableImageDownloadPromises = new Map();

async function cacheExternalImageStable(imageUrl, title, namespace = "shared") {
  const url = String(imageUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  const safeNamespace = slugify(namespace || "shared") || "shared";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 18);
  const base = `${safeNamespace}-${slugify(title || "image").slice(0, 48) || "image"}-${hash}`;

  for (const ext of ["webp", "jpg", "jpeg", "png", "avif"]) {
    const candidate = path.join(IMAGES_DIR, `${base}.${ext}`);
    try {
      const stat = await fsp.stat(candidate);
      if (stat.isFile() && stat.size >= 800) return `/images/${path.basename(candidate)}`;
    } catch {}
  }

  if (_stableImageDownloadPromises.has(base)) return _stableImageDownloadPromises.get(base);
  if(_stableImageDownloadPromises.size>=32)return '';
  const promise=(async()=>{try{const {bytes}=await require('./lib/public-network').fetchBinary(url);const ext=require('./lib/public-network').imageExtension(bytes);if(bytes.length<800)return '';const file=path.join(IMAGES_DIR,base+'.'+ext);require('./lib/atomic-file').atomicWrite(file,bytes);return '/images/'+path.basename(file);}catch{return '';}})().finally(()=>_stableImageDownloadPromises.delete(base));
  _stableImageDownloadPromises.set(base, promise);
  return promise;
}

function mergeAutoInfo(anime, found, overwrite = false) {
  if (!importIntegrity.acceptsInfo(anime, found)) return anime;
  if(Number(anime.malId)>0&&Number(found.malId)>0&&Number(anime.malId)!==Number(found.malId))return anime;
  const personalBefore={...anime};
  const official=decodeHtmlEntitiesPlain(String(found.officialTitle||found.romajiTitle||found.title||""));
  const sameId=Number(anime.malId)>0&&Number(anime.malId)===Number(found.malId);
  const replacingPlaceholder=!anime.malId&&importIntegrity.provisional(anime)&&found.malId;
  if(replacingPlaceholder){if(!metadataPreferences.locked(anime,'poster'))anime.poster='';if(!metadataPreferences.locked(anime,'imageUrl'))anime.imageUrl='';anime.partNumber=localSeasonLinks.descriptor({...found,title:found.officialTitle||found.title}).part||0;}
  const sameName=normalizeTitle(official).normalize("NFKC")===normalizeTitle(anime.title).normalize("NFKC");
  const keepsLocalized=sameId&&Object.values(anime.localizedTitles||{}).includes(anime.title);
  if(official&&((!anime.malId&&(sameName||Number(found.matchingScore)>=92))||sameId)&&!keepsLocalized&&!metadataPreferences.locked(anime,'title')&&!require('./public/title-preference').custom(anime))anime.title=official;
  if(sameId&&official)anime.canonicalTitle=official;

  const scalarFields = [
    "type","episodesTotal","startDate","endDate","publicScore","rank",
    "popularity","members","malUrl","synopsis","malId","englishTitle",
    "rating","duration","trailer","imageUrl"
  ];
  for (const f of scalarFields) {
    if (found[f] && !metadataPreferences.locked(anime,f) && (overwrite || !anime[f])) anime[f] = found[f];
  }

  const arrayFields = ["genres","themes","demographics","studios","producers"];
  for (const f of arrayFields) {
    if (!metadataPreferences.locked(anime,f) && Array.isArray(found[f]) && found[f].length > 0 && (overwrite || !anime[f]?.length))
      anime[f] = found[f];
  }

  // Studio principal
  if (!metadataPreferences.locked(anime,'studio') && !anime.studio && Array.isArray(found.studios) && found.studios.length > 0)
    anime.studio = found.studios[0];

  // FIX overflow: si le nouveau episodesTotal est inférieur à episodesSeen, clamp
  const seen  = Number(anime.episodesSeen || 0);
  const total = Number(anime.episodesTotal || 0);
  if (!anime.episodesSeenExplicit && seen > 0 && total > 0 && seen > total) {
    // Ne pas réduire episodesSeen si l'anime est terminé et qu'on regarde une suite
    // → on marque juste comme probable suite
    if (anime.status !== "Completed") {
      anime.status = "Completed";
    }
    // Clamp à total (évite affichage 12/3, 23/11)
    anime.episodesSeen = String(total);
    if(anime.betaseriesEpisode){
      anime.unallocatedEpisodes=Math.max(Number(anime.unallocatedEpisodes)||0,seen-total);
      anime.needsSequelCheck=true;anime.progressWarning=anime.unallocatedEpisodes+' épisode(s) importés restent à rattacher.';
    }
    if (!anime.tags) anime.tags = [];
    if (!anime.tags.includes("suite probable")) anime.tags.push("suite probable");
  }

  if(official&&Number(anime.malId)===Number(found.malId))anime.canonicalTitle=official;
  if(found.verifiedSeriesSeason){
    anime.verifiedSeriesSeason=found.verifiedSeriesSeason;
    anime.seriesReference={status:'verified',rootMalId:Number(found.verifiedSeriesSeason.rootMalId),sourceSeason:Number(found.verifiedSeriesSeason.season),part:Number(anime.partNumber)||1};
    if(anime.associationResolution?.source!=='manual')anime.associationResolution={source:found.verifiedSeriesSeason.source||'verified-chain',rootMalId:Number(found.verifiedSeriesSeason.rootMalId),sourceSeason:Number(found.verifiedSeriesSeason.season),malId:Number(found.malId),at:new Date().toISOString()};
    anime.needsSequelCheck=Number(anime.unallocatedEpisodes)>0;if(!anime.needsSequelCheck)anime.progressWarning='';anime.tags=(anime.tags||[]).filter(t=>!/saison à identifier|progression à vérifier|suite probable/.test(t));
  }
  if (anime.status === 'Completed'&&!anime.seasonStatusExplicit&&!anime.episodesSeenExplicit) Object.assign(anime, viewing.completeEpisodes(anime, found));
  metadataPreferences.preserve(personalBefore,anime);
  return anime;
}





function nextId(animes) {
  return (Array.isArray(animes) ? animes : []).reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;
}

function normalizeTitle(title) {
  return String(title || "").trim().toLowerCase();
}

function metadataTitleCandidates(item) {
  return [
    item?.title,
    item?.titleEn,
    item?.titleRomaji,
    ...(Array.isArray(item?.synonyms) ? item.synonyms : [])
  ].map(v => decodeHtmlEntitiesPlain(v)).filter(Boolean);
}

function metadataMeaningfulTokens(value) {
  const stop = new Set([
    "the","a","an","of","to","and","or","in","on","for","from","with","by","at","as","is","was","were","be","been","being",
    "that","this","these","those","it","its","my","your","his","her","their","our","i","you","he","she","they","we",
    "le","la","les","un","une","des","de","du","d","l","et","ou","dans","sur","pour","par","avec","est","sont","ete","etre",
    "anime","tv","movie","film","season","saison","part","partie","cour","episode","episodes"
  ]);
  return new Set(normalizeAdvancedTitle(value)
    .split(/\s+/)
    .filter(token => token.length >= 3 && !stop.has(token)));
}

function metadataTokenOverlapScore(a, b) {
  const aa = metadataMeaningfulTokens(a);
  const bb = metadataMeaningfulTokens(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const token of aa) if (bb.has(token)) common++;
  if (common < 2) return 0;
  const shortCoverage = common / Math.min(aa.size, bb.size);
  const longCoverage = common / Math.max(aa.size, bb.size);
  let score = Math.round((shortCoverage * 0.68 + longCoverage * 0.32) * 100);
  if (common >= 4) score = Math.min(100, score + 6);
  if (common >= 6) score = Math.min(100, score + 4);
  return score;
}

function metadataMatchScore(query, item) {
  const candidates = metadataTitleCandidates(item);
  let best = 0;
  for (const candidate of candidates) {
    best = Math.max(
      best,
      fuzzyScore(query, candidate),
      similarityScore(query, candidate),
      metadataTokenOverlapScore(query, candidate)
    );
  }
  return best;
}

function metadataToFound(item, query, score) {
  if (!item) return null;
  const officialTitle = item.title || item.titleEn || item.titleRomaji || query;
  return {
    title: query || officialTitle,
    officialTitle,
    englishTitle: item.titleEn || "",
    romajiTitle: item.titleRomaji || "",
    synonyms: Array.isArray(item.synonyms)?item.synonyms:[],
    type: item.type || "TV",
    episodesTotal: item.episodes ? String(item.episodes) : "",
    episodes: item.episodes ? String(item.episodes) : "",
    publicScore: item.score ? String(item.score) : "",
    genres: Array.isArray(item.genres) ? item.genres : [],
    studios: Array.isArray(item.studios) ? item.studios : [],
    synopsis: item.synopsis || "",
    imageUrl: item.imageUrl || "",
    startDate: item.startDate || "",
    endDate: item.endDate || "",
    rank: item.rank ? String(item.rank) : "",
    popularity: item.popularity ? String(item.popularity) : "",
    members: item.members ? String(item.members) : "",
    rating: item.rating || "",
    duration: item.duration || "",
    malUrl: item.malId ? `https://myanimelist.net/anime/${item.malId}` : "",
    malId: item.malId ? String(item.malId) : "",
    matchingScore: Number(score) || metadataMatchScore(query || officialTitle, item),
    source: "LocalMetadata"
  };
}

function searchMetadataLocal(title, options = {}) {
  const query = String(title || "").trim();
  if (!query || !db?.searchMetadataByTitle) return null;

  const normalized = normalizeAdvancedTitle(query);
  if (normalized.length < 2) return null;

  const variants = typeof queriesForTitle === "function" ? queriesForTitle(query) : [query];
  let best = null;
  let bestScore = 0;

  for (const variant of variants) {
    const rows = db.searchMetadataByTitle(variant, options.limit || 8);
    for (const row of rows) {
      const score = Math.max(metadataMatchScore(query, row), metadataMatchScore(variant, row));
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    if (bestScore >= 100) break;
  }

  const minScore = normalized.length < 5 ? 96 : Number(options.minScore ?? 72);

  // Certains catalogues/imports utilisent une traduction anglaise très libre.
  // Une recherche SQL par sous-chaîne exacte peut alors ne rien trouver malgré
  // un titre clairement équivalent (ex. "Berry Master" vs "Nut Master").
  // On élargit uniquement en dernier recours avec quelques mots significatifs,
  // puis on réapplique le score de similarité avant d'accepter la fiche.
  if (bestScore < minScore && db?.searchMetadataByTitleTokens) {
    const tokenRows = db.searchMetadataByTitleTokens(query, Math.max(40, Number(options.tokenLimit) || 80));
    for (const row of tokenRows) {
      const score = metadataMatchScore(query, row);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
  }

  if (!best || bestScore < minScore) return null;
  return metadataToFound(best, query, bestScore);
}



function foundToMetadataRow(found) {
  if (!found || !found.malId) return null;
  return {
    malId: Number(found.malId),
    title: String(found.officialTitle || found.title || found.englishTitle || "").trim(),
    titleEn: String(found.englishTitle || "").trim(),
    titleRomaji: String(found.romajiTitle || found.officialTitle || "").trim(),
    synonyms: metadataUniqueStrings([found.title, found.officialTitle, found.englishTitle, found.romajiTitle]),
    genres: metadataUniqueStrings(found.genres || []),
    episodes: found.episodesTotal || found.episodes || null,
    score: /^(AniList|Kitsu)$/i.test(found.source || "") ? null : found.publicScore || found.score || null,
    type: found.type || "",
    studios: metadataUniqueStrings(found.studios || []),
    imageUrl: found.imageUrl || "",
    synopsis: found.synopsis || "",
    startDate: found.startDate || "",
    endDate: found.endDate || "",
    rank: /^(AniList|Kitsu)$/i.test(found.source || "") ? null : found.rank || null,
    popularity: /^(AniList|Kitsu)$/i.test(found.source || "") ? null : found.popularity || null,
    members: /^(AniList|Kitsu)$/i.test(found.source || "") ? null : found.members || null,
    rating: found.rating || "",
    duration: found.duration || ""
  };
}

function metadataLearnFromFound(found, reason = "lookup") {
  try {
    if (!catalogueIntegrity.trustedFound(found)) return {ok:true,skipped:true,reason:"canonical-provider-only"};
    const row = foundToMetadataRow(found);
    if (!row) return { ok: true, skipped: true, reason: "no-mal-id" };
    return metadataLearnFromRows([row], reason, { save: false });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function readMetadataPreloadStatus() {
  try {
    if (!fs.existsSync(METADATA_PRELOAD_STATUS_FILE)) return { ok: false, status: "never-run" };
    return JSON.parse(fs.readFileSync(METADATA_PRELOAD_STATUS_FILE, "utf8"));
  } catch (error) {
    return { ok: false, status: "unreadable", error: error.message };
  }
}

function readMetadataBundledStatus() {
  const candidates = [
    METADATA_BUNDLED_STATUS_FILE,
    path.join(DATABASE_DIR, "metadata-bundled-status.json")
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      return { ok: false, embedded: false, status: "unreadable", error: error.message };
    }
  }
  return { ok: false, embedded: false, status: "not-found" };
}

function writeMetadataPreloadStatus(status) {
  const payload = { updatedAt: new Date().toISOString(), ...(status || {}) };
  try {
    fs.mkdirSync(path.dirname(METADATA_PRELOAD_STATUS_FILE), { recursive: true });
    fs.writeFileSync(METADATA_PRELOAD_STATUS_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {}
  return payload;
}


function readMetadataAutonomousStatus() {
  try {
    if (!fs.existsSync(METADATA_AUTONOMOUS_STATUS_FILE)) return { ok: false, status: "never-run" };
    return JSON.parse(fs.readFileSync(METADATA_AUTONOMOUS_STATUS_FILE, "utf8"));
  } catch (error) {
    return { ok: false, status: "unreadable", error: error.message };
  }
}

function writeMetadataAutonomousStatus(status) {
  const payload = { updatedAt: new Date().toISOString(), ...(status || {}) };
  try {
    fs.mkdirSync(path.dirname(METADATA_AUTONOMOUS_STATUS_FILE), { recursive: true });
    fs.writeFileSync(METADATA_AUTONOMOUS_STATUS_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {}
  return payload;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function metadataAutonomousConfig() {
  const config = readConfig();
  const hours = Number(config.metadataAutonomousIntervalHours);
  return {
    enabled: config.metadataAutonomousUpdateOnStart !== false,
    intervalMs: Number.isFinite(hours) && hours > 0
      ? Math.max(6 * 60 * 60 * 1000, hours * 60 * 60 * 1000)
      : METADATA_AUTONOMOUS_CHECK_INTERVAL_MS,
    seasonalPages: clampNumber(process.env.ALM_METADATA_AUTONOMOUS_SEASONAL_PAGES || config.metadataAutonomousSeasonalPages, 2, 1, 12),
    upcomingPages: clampNumber(process.env.ALM_METADATA_AUTONOMOUS_UPCOMING_PAGES || config.metadataAutonomousUpcomingPages, 2, 0, 12),
    topPages: 0,
    aniListPages: 0
  };
}

function shouldCheckMetadataAutonomous(force = false) {
  if (force) return true;
  const last = Date.parse(metadataGetSyncValue("lastAutonomousCheckAt", ""));
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= metadataAutonomousConfig().intervalMs;
}

function metadataUniqueStrings(values) {
  const out = [];
  const push = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) push(item);
      return;
    }
    if (typeof value === "object") {
      push(value.name || value.title || value.english || value.romaji || value.node?.name || value.node?.title || "");
      return;
    }
    const text = String(value || "").trim();
    if (text) out.push(text);
  };
  push(values);
  return Array.from(new Set(out));
}

function metadataIsoDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function jikanAnimeToMetadataRow(raw) {
  if (!raw || !raw.mal_id) return null;
  const titles = Array.isArray(raw.titles) ? raw.titles : [];
  const allTitles = metadataUniqueStrings([
    raw.title,
    raw.title_english,
    raw.title_japanese,
    ...(Array.isArray(raw.title_synonyms) ? raw.title_synonyms : []),
    ...titles.map(t => t?.title).filter(Boolean)
  ]);
  const titleByType = (needle) => {
    const found = titles.find(t => String(t?.type || "").toLowerCase() === needle);
    return found?.title || "";
  };
  return {
    malId: Number(raw.mal_id),
    title: String(raw.title || raw.title_english || allTitles[0] || "").trim(),
    titleEn: String(raw.title_english || titleByType("english") || "").trim(),
    titleRomaji: String(raw.title || titleByType("default") || "").trim(),
    synonyms: allTitles,
    genres: metadataUniqueStrings([raw.genres, raw.explicit_genres, raw.themes, raw.demographics]),
    episodes: raw.episodes == null ? null : Number(raw.episodes) || null,
    score: raw.score == null ? null : Number(raw.score) || null,
    type: String(raw.type || "").trim(),
    studios: metadataUniqueStrings(raw.studios),
    imageUrl: String(raw.images?.jpg?.large_image_url || raw.images?.webp?.large_image_url || raw.images?.jpg?.image_url || raw.images?.webp?.image_url || "").trim(),
    synopsis: String(raw.synopsis || raw.background || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    startDate: metadataIsoDate(raw.aired?.from),
    endDate: metadataIsoDate(raw.aired?.to),
    rank: raw.rank == null ? null : Number(raw.rank) || null,
    popularity: raw.popularity == null ? null : Number(raw.popularity) || null,
    members: raw.members == null ? null : Number(raw.members) || null,
    rating: String(raw.rating || "").trim(),
    duration: String(raw.duration || "").trim()
  };
}

function anilistDateToIso(date) {
  if (!date || !date.year || !date.month || !date.day) return "";
  return `${date.year}-${String(date.month || 1).padStart(2, "0")}-${String(date.day || 1).padStart(2, "0")}`;
}

function anilistMediaToMetadataRow(media) {
  if (!media || !media.idMal) return null;
  const title = media.title || {};
  const studios = metadataUniqueStrings((media.studios?.nodes || []).filter(s => s?.isAnimationStudio !== false).map(s => s.name));
  return {
    malId: Number(media.idMal),
    title: String(title.romaji || title.english || title.native || "").trim(),
    titleEn: String(title.english || "").trim(),
    titleRomaji: String(title.romaji || "").trim(),
    synonyms: metadataUniqueStrings([title.romaji, title.english, title.native, ...(Array.isArray(media.synonyms) ? media.synonyms : [])]),
    genres: metadataUniqueStrings(media.genres || []),
    episodes: media.episodes == null ? null : Number(media.episodes) || null,
    score: null, // AniList score is not a MyAnimeList score.
    type: String(media.format || "").replace(/_/g, " ").trim(),
    studios,
    imageUrl: String(media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "").trim(),
    synopsis: String(media.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    startDate: anilistDateToIso(media.startDate),
    endDate: anilistDateToIso(media.endDate),
    rank: null,
    popularity: null,
    members: null,
    rating: media.isAdult ? "R+ / adult" : "",
    duration: media.duration ? `${media.duration} min` : ""
  };
}

function mergeMetadataRefreshRows(existing, incoming) {
  if (!existing) return incoming;
  const keep = (newValue, oldValue) => {
    if (newValue == null || newValue === "") return oldValue;
    if (Array.isArray(newValue) && newValue.length === 0) return oldValue;
    return newValue;
  };
  return {
    malId: Number(incoming.malId || existing.malId),
    title: keep(incoming.title, existing.title),
    titleEn: keep(incoming.titleEn, existing.titleEn),
    titleRomaji: keep(incoming.titleRomaji, existing.titleRomaji),
    synonyms: metadataUniqueStrings([existing.synonyms, incoming.synonyms, existing.title, existing.titleEn, existing.titleRomaji, incoming.title, incoming.titleEn, incoming.titleRomaji]),
    genres: metadataUniqueStrings([existing.genres, incoming.genres]),
    episodes: keep(incoming.episodes, existing.episodes),
    score: keep(incoming.score, existing.score),
    type: keep(incoming.type, existing.type),
    studios: metadataUniqueStrings([existing.studios, incoming.studios]),
    imageUrl: keep(incoming.imageUrl, existing.imageUrl),
    synopsis: keep(incoming.synopsis, existing.synopsis),
    startDate: keep(incoming.startDate, existing.startDate),
    endDate: keep(incoming.endDate, existing.endDate),
    rank: keep(incoming.rank, existing.rank),
    popularity: keep(incoming.popularity, existing.popularity),
    members: keep(incoming.members, existing.members),
    rating: keep(incoming.rating, existing.rating),
    duration: keep(incoming.duration, existing.duration)
  };
}

function prepareMetadataRefreshRows(rows) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.malId) continue;
    const id = String(Number(row.malId));
    if (!id || id === "NaN") continue;
    byId.set(id, byId.has(id) ? mergeMetadataRefreshRows(byId.get(id), row) : row);
  }
  return Array.from(byId.values()).map(row => {
    try {
      const existing = db.getMetadataByMalId ? db.getMetadataByMalId(row.malId) : null;
      return existing ? mergeMetadataRefreshRows(existing, row) : row;
    } catch {
      return row;
    }
  });
}

function metadataLearnFromRows(rows, reason = "search", options = {}) {
  try {
    const config = readConfig();
    if (config.metadataAutonomousLearnFromSearch === false) return { ok: true, skipped: true, reason: "disabled" };
    if (!db?.importMetadataRows) return { ok: false, skipped: true, reason: "metadata-sql-unavailable" };
    const prepared = prepareMetadataRefreshRows(rows);
    if (!prepared.length) return { ok: true, skipped: true, reason: "empty" };
    const result = db.importMetadataRows(prepared, { clear: false, save: options.save !== false });
    if (result?.ok) {
      metadataSetSyncValues({
        lastAutonomousLearnAt: new Date().toISOString(),
        lastAutonomousLearnReason: reason,
        lastAutonomousLearnRows: String(prepared.length)
      }, { save: options.save !== false });
    }
    return result;
  } catch (error) {
    console.warn("[metadata-autonome] apprentissage ignoré :", error.message);
    return { ok: false, error: error.message };
  }
}

async function collectJikanAutonomousRows(config, progress = () => {}) {
  if (!metadataProviders.configured()) {
    progress({skipped:config.seasonalPages+config.upcomingPages+config.topPages});
    return {rows:[],stats:[{source:"local",rows:0}],errors:[{source:"MyAnimeList",error:"ALM_MAL_CLIENT_REQUIRED"}]};
  }
  const date=new Date(),names=["winter","spring","summer","fall"],quarter=Math.floor(date.getUTCMonth()/3);
  const batches=[{year:date.getUTCFullYear(),season:names[quarter],pages:config.seasonalPages},{year:date.getUTCFullYear()+(quarter===3?1:0),season:names[(quarter+1)%4],pages:config.upcomingPages}];
  const rows=[],errors=[],stats=[];
  for(const batch of batches)for(let page=1;page<=batch.pages;page++){
    progress({source:"MyAnimeList",page,phase:"fetch"});
    try{const result=await metadataProviders.season(batch.year,batch.season,page);const mapped=result.data.map(jikanAnimeToMetadataRow).filter(Boolean);rows.push(...mapped);stats.push({source:"MyAnimeList",page,rows:mapped.length});progress({completed:1,rows:mapped.length});if(!result.pagination.has_next_page){progress({skipped:batch.pages-page});break;}}
    catch{errors.push({source:"MyAnimeList",error:"ALM_SOURCE_UNAVAILABLE"});progress({skipped:batch.pages-page+1});break;}
    if(page<batch.pages)await sleep(1100);
  }
  progress({skipped:config.topPages});return {rows,stats,errors};
}

async function fetchAniListGraphQL(query, variables) {
  const result=await boundedTextFetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query,variables}),timeoutMs:12000,maxBytes:4*1024*1024,maxRedirects:0,fetchImpl:aniListFetch});
  if(!result.response.ok)throw Object.assign(Error(`AniList HTTP ${result.response.status}`),{status:result.response.status});
  const json=JSON.parse(result.text);if(json?.errors?.length)throw Object.assign(Error(json.errors.map(e=>e.message).join('; ')),{status:Number(json.errors[0]?.status)||0});return json;
}

async function collectAniListAutonomousRows(config, progress = () => {}) {
  return { rows: [], stats: [], errors: [] }; // No mass collection from AniList.

}

let metadataAutonomousJob = null;
let metadataAutonomousProgress = null;
function updateMetadataProgress(patch){
 if(!metadataAutonomousProgress)return;
 const p=metadataAutonomousProgress;
 p.completedPages+=patch.completed||0;p.skippedPages+=patch.skipped||0;p.rows+=patch.rows||0;
 for(const key of ['phase','source','page','status','merged','newRows','error'])if(patch[key]!==undefined)p[key]=patch[key];
 if(patch.saved)p.saved=true;
 p.done=Math.min(p.total,p.completedPages+p.skippedPages+(p.saved?1:0));
}

async function runMetadataAutonomousUpdate(options = {}) {
  if (rescueMode.active) return rescueMode.skipped();
  if (metadataAutonomousJob && options.wait !== true) return { ok: true, skipped: true, reason: "already-running" };
  if (metadataAutonomousJob) return metadataAutonomousJob;

  metadataAutonomousJob = (async () => {
    await db.whenReady();
    const config = metadataAutonomousConfig();
    if (options.startup === true && !config.enabled) {
      const status = writeMetadataAutonomousStatus({ ok: true, skipped: true, status: "disabled" });
      return { ok: true, skipped: true, reason: "disabled", status };
    }
    if (!shouldCheckMetadataAutonomous(options.force === true)) {
      const current = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
      const status = writeMetadataAutonomousStatus({ ok: true, skipped: true, status: "recent", count: current.count });
      return { ok: true, skipped: true, reason: "recent", count: current.count, status };
    }

    const before = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
    const startedAt = new Date().toISOString();
    metadataAutonomousProgress={id:startedAt,startedAt,status:'running',phase:'fetch',source:'',page:0,done:0,total:config.seasonalPages+config.upcomingPages+config.topPages+config.aniListPages+1,completedPages:0,skippedPages:0,rows:0};
    writeMetadataAutonomousStatus({ ok: true, status: "running", startedAt, count: before.count });
    metadataSetSyncValues({ lastAutonomousCheckAt: startedAt, autonomousStatus: "running", autonomousError: "" }, { save: false });

    const rows = [];
    const stats = [];
    const errors = [];

    try {
      const jikan = await collectJikanAutonomousRows(config, updateMetadataProgress);
      rows.push(...jikan.rows);
      stats.push(...jikan.stats);
      errors.push(...jikan.errors);
    } catch (error) {
      errors.push({ source: "jikan", error: error.message });
    }

    try {
      const anilist = await collectAniListAutonomousRows(config, updateMetadataProgress);
      rows.push(...anilist.rows);
      stats.push(...anilist.stats);
      errors.push(...anilist.errors);
    } catch (error) {
      errors.push({ source: "anilist", error: error.message });
    }

    updateMetadataProgress({phase:'save'});
    await yieldToEventLoop();
    const prepared = prepareMetadataRefreshRows(rows);
    const result = prepared.length ? db.importMetadataRows(prepared, { clear: false }) : { ok: true, before: before.count || 0, after: before.count || 0, imported: 0, skipped: 0 };
    const after = db.getMetadataStats ? db.getMetadataStats() : { count: result.after || before.count || 0 };
    const newRows = Math.max(0, Number(after.count || 0) - Number(before.count || 0));
    const finishedAt = new Date().toISOString();
    const ok = result.ok !== false && (prepared.length > 0 || errors.length === 0);

    metadataSetSyncValues({
      lastAutonomousCheckAt: startedAt,
      lastAutonomousFinishedAt: finishedAt,
      lastAutonomousImportAt: prepared.length ? finishedAt : metadataGetSyncValue("lastAutonomousImportAt", ""),
      autonomousStatus: ok ? "ok" : "no-data",
      autonomousRowsFetched: String(rows.length),
      autonomousRowsMerged: String(prepared.length),
      autonomousRowsNew: String(newRows),
      autonomousSources: JSON.stringify(stats),
      autonomousErrors: JSON.stringify(errors),
      autonomousError: result.error || (errors.length ? errors.map(e => e.error).join(" | ") : "")
    });

    const status = writeMetadataAutonomousStatus({
      ok,
      status: prepared.length ? "synced" : "no-data",
      startedAt,
      finishedAt,
      count: after.count,
      fetched: rows.length,
      merged: prepared.length,
      newRows,
      sources: stats,
      errors,
      result
    });

    updateMetadataProgress({saved:true,status:!ok?'error':errors.length?'partial':'done',phase:'done',merged:prepared.length,newRows});
    return { ok, skipped: prepared.length === 0, count: after.count, fetched: rows.length, merged: prepared.length, newRows, sources: stats, errors, result, status };
  })().catch(error=>{updateMetadataProgress({status:'error',error:error.message});throw error;}).finally(() => { metadataAutonomousJob = null; });

  return metadataAutonomousJob;
}

function getMetadataRemoteUrl() {
  const config = readConfig();
  return String(process.env.ALM_METADATA_URL || config.metadataUrl || "").trim();
}

function getMetadataManifestUrl() {
  const config = readConfig();
  const explicit = String(process.env.ALM_METADATA_MANIFEST_URL || config.metadataManifestUrl || "").trim();
  if (explicit) return explicit;

  const direct = getMetadataRemoteUrl();
  if (!direct) return "";

  try {
    const derived = new URL(direct);
    derived.pathname = derived.pathname.replace(/[^/]*$/, "metadata-manifest.json");
    return derived.toString();
  } catch {
    return "";
  }
}

function isMetadataRemoteConfigured() {
  return Boolean(getMetadataManifestUrl() || getMetadataRemoteUrl());
}

function metadataLocalPayloadCandidates() {
  const names = [
    "metadata-full.sql.gz",
    "metadata-full.sql",
    "metadata-snapshot.sql.gz",
    "metadata-snapshot.sql",
    "metadata-seed.sql.gz",
    "metadata-seed.sql",
    "metadata.json.gz",
    "metadata.json"
  ];
  const dirs = [APP_BUNDLED_DATABASE_DIR, DATABASE_DIR];
  const files = [];
  for (const name of names) {
    for (const dir of dirs) {
      const file = path.join(dir, name);
      if (!files.includes(file)) files.push(file);
    }
  }
  return files;
}

function gunzipMaybe(buffer, sourceName = "", contentEncoding = "") {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  const shouldGunzip = /gzip/i.test(contentEncoding) || /\.gz$/i.test(sourceName) || (buf[0] === 0x1f && buf[1] === 0x8b);
  if (buf.length > 64 * 1024 * 1024) throw Error("ALM_METADATA_COMPRESSED_LIMIT");
  const result = shouldGunzip ? zlib.gunzipSync(buf, {maxOutputLength:256*1024*1024}) : buf;
  if (result.length > 256 * 1024 * 1024) throw Error("ALM_METADATA_OUTPUT_LIMIT");
  return result;
}

function metadataRowsFromJsonPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.items && typeof payload.items === "object") return Object.values(payload.items);
  return [];
}

function importMetadataBuffer(buffer, sourceName, options = {}) {
  const clear = options.clear === true;
  const uncompressed = gunzipMaybe(buffer, sourceName, options.contentEncoding);
  const text = uncompressed.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return { ok: false, error: "Payload metadata vide", source: sourceName };

  if (/\.sql(\.gz)?$/i.test(sourceName) || /^\s*(CREATE|INSERT|BEGIN|PRAGMA)\b/i.test(text)) {
    return { source: sourceName, ...db.importMetadataSql(text, {clear}) };
  }

  const json = JSON.parse(text);
  const rows = metadataRowsFromJsonPayload(json);
  return { source: sourceName, ...db.importMetadataRows(rows, { clear }) };
}

async function downloadMetadataBuffer(url) {
  const result = await require('./lib/public-network').fetchBinary(url, {
    requireHttps:true, timeoutMs:METADATA_DOWNLOAD_TIMEOUT_MS, maxBytes:64*1024*1024,
    headers:{Accept:'application/json, application/gzip, application/sql, text/plain',
      'Accept-Encoding':'identity','User-Agent':'Anime Local Manager/'+require('./package.json').version}
  });
  return {buffer:result.bytes,contentEncoding:result.headers['content-encoding']||'',
    etag:result.headers.etag||'',lastModified:result.headers['last-modified']||''};
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function expectedSha256(entry) {
  const raw = String(entry?.sha256 || entry?.hash || entry?.checksum || entry?.integrity || "").trim();
  if (!raw) return "";
  return raw.replace(/^sha256[-:]/i, "").trim().toLowerCase();
}

function verifyMetadataHash(buffer, entry, label) {
  const expected = expectedSha256(entry);
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('ALM_METADATA_SHA256_REQUIRED: remote snapshots require a SHA-256 digest');
  const actual = sha256Hex(buffer);
  if (actual.toLowerCase() !== expected) {
    throw new Error(`Hash SHA-256 invalide pour ${label || "metadata"} : attendu ${expected}, obtenu ${actual}`);
  }
  return { ok: true, sha256: actual };
}

async function downloadMetadataJson(url) {
  const downloaded = await downloadMetadataBuffer(url);
  const text = gunzipMaybe(downloaded.buffer, url, downloaded.contentEncoding).toString("utf8").replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("Manifest metadata vide");
  return { json: JSON.parse(text), downloaded };
}

function metadataResolveUrl(baseUrl, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { return new URL(raw, baseUrl).toString(); }
  catch { return raw; }
}

function metadataManifestVersion(manifest) {
  return String(manifest?.version || manifest?.id || manifest?.generatedAt || manifest?.updatedAt || "").trim();
}

function metadataManifestFullEntry(manifest) {
  const full = manifest?.full || manifest?.snapshot || manifest?.seed || manifest?.latest || null;
  if (!full) return null;
  if (typeof full === "string") return { url: full };
  if (typeof full === "object") return full;
  return null;
}

function metadataManifestDeltas(manifest) {
  const deltas = Array.isArray(manifest?.deltas) ? manifest.deltas : [];
  return deltas
    .map((entry, index) => {
      if (typeof entry === "string") return { id: entry, url: entry, order: index };
      if (entry && typeof entry === "object") return { ...entry, order: index };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const da = Date.parse(a.createdAt || a.date || a.generatedAt || "") || 0;
      const dbb = Date.parse(b.createdAt || b.date || b.generatedAt || "") || 0;
      if (da && dbb && da !== dbb) return da - dbb;
      return Number(a.order || 0) - Number(b.order || 0);
    });
}

function metadataGetSyncValue(key, fallback = "") {
  return db.getMetadataSyncValue ? db.getMetadataSyncValue(key, fallback) : fallback;
}

function metadataSetSyncValues(values) {
  if (db.setMetadataSyncValues) return db.setMetadataSyncValues(values);
  return { ok: false, error: "metadata_sync indisponible" };
}

function metadataReadAppliedDeltas() {
  const raw = metadataGetSyncValue("remoteAppliedDeltas", "[]");
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function metadataDeltaId(entry) {
  return String(entry?.id || entry?.version || entry?.toVersion || entry?.url || entry?.path || entry?.file || "").trim();
}

function getMetadataUpdateIntervalMs() {
  const config = readConfig();
  const hours = Number(config.metadataUpdateIntervalHours);
  if (Number.isFinite(hours) && hours > 0) return Math.max(60 * 60 * 1000, hours * 60 * 60 * 1000);
  return METADATA_REMOTE_CHECK_INTERVAL_MS;
}

function shouldCheckMetadataRemote(force = false) {
  if (force) return true;
  const last = Date.parse(metadataGetSyncValue("lastRemoteCheckAt", ""));
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= getMetadataUpdateIntervalMs();
}

async function importMetadataRemoteEntry(entry, baseUrl, options = {}) {
  const url = metadataResolveUrl(baseUrl, entry?.url || entry?.href || entry?.path || entry?.file);
  if (!url) throw new Error("Entrée metadata distante sans URL");

  if (!/^[a-f0-9]{64}$/.test(expectedSha256(entry))) throw new Error('ALM_METADATA_SHA256_REQUIRED');

  const downloaded = await downloadMetadataBuffer(url);
  verifyMetadataHash(downloaded.buffer, entry, url);

  const result = importMetadataBuffer(downloaded.buffer, url, {
    clear: options.clear === true,
    contentEncoding: downloaded.contentEncoding
  });

  if (!result.ok) throw new Error(result.error || `Import metadata impossible depuis ${url}`);
  return {
    ...result,
    url,
    etag: downloaded.etag,
    lastModified: downloaded.lastModified,
    sha256: sha256Hex(downloaded.buffer)
  };
}

async function almMetadataDirectRemoteImport(url, options = {}) {
  const before = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
  const result = await importMetadataRemoteEntry({ url, sha256:process.env.ALM_METADATA_SHA256 || readConfig().metadataSha256 || '' }, url, { clear: options.clear === true || Number(before.count || 0) === 0 });
  const after = db.getMetadataStats ? db.getMetadataStats() : { count: result.after || 0 };
  metadataSetSyncValues({
    lastRemoteCheckAt: new Date().toISOString(),
    lastRemoteImportAt: new Date().toISOString(),
    remoteMode: "direct",
    remoteUrl: url,
    remoteRows: String(after.count || 0),
    remotePayloadSha256: result.sha256 || ""
  });
  const status = writeMetadataPreloadStatus({ ok: true, status: "imported-remote-direct", source: url, result, count: after.count });
  return { ok: true, mode: "direct", result, count: after.count, status };
}

async function almMetadataRemoteSync(options = {}) {
  if (rescueMode.active) return rescueMode.skipped();
  await db.whenReady();

  const force = options.force === true;
  const config = readConfig();
  if (options.startup === true && config.metadataUpdateOnStart === false) {
    const status = writeMetadataPreloadStatus({ ok: true, status: "remote-update-disabled", skipped: true, reason: "metadataUpdateOnStart=false" });
    return { ok: true, skipped: true, reason: "metadataUpdateOnStart=false", status };
  }

  const manifestUrl = getMetadataManifestUrl();
  const directUrl = getMetadataRemoteUrl();
  const before = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };

  if (!manifestUrl && !directUrl) {
    const status = writeMetadataPreloadStatus({ ok: true, status: "remote-disabled", skipped: true, count: before.count, reason: "Aucune URL metadata distante configurée" });
    return { ok: true, skipped: true, reason: "remote-disabled", count: before.count, status };
  }

  if (!shouldCheckMetadataRemote(force)) {
    const status = writeMetadataPreloadStatus({ ok: true, status: "remote-check-recent", skipped: true, count: before.count });
    return { ok: true, skipped: true, reason: "remote-check-recent", count: before.count, status };
  }

  metadataSetSyncValues({ lastRemoteCheckAt: new Date().toISOString() });

  if (!manifestUrl && directUrl) {
    return almMetadataDirectRemoteImport(directUrl, { clear: options.clear === true });
  }

  let manifest;
  try {
    ({ json: manifest } = await downloadMetadataJson(manifestUrl));
  } catch (error) {
    if (directUrl && (force || Number(before.count || 0) === 0)) {
      return almMetadataDirectRemoteImport(directUrl, { clear: options.clear === true });
    }
    const status = writeMetadataPreloadStatus({ ok: false, status: "manifest-error", source: manifestUrl, error: error.message, count: before.count });
    return { ok: false, skipped: true, reason: "manifest-error", error: error.message, count: before.count, status };
  }

  const version = metadataManifestVersion(manifest) || sha256Hex(Buffer.from(JSON.stringify(manifest), "utf8"));
  const localVersion = metadataGetSyncValue("remoteManifestVersion", "");
  const fullEntry = metadataManifestFullEntry(manifest);
  const deltas = metadataManifestDeltas(manifest);
  const appliedDeltas = metadataReadAppliedDeltas();
  const pendingDeltas = deltas.filter(entry => {
    const id = metadataDeltaId(entry);
    return id && !appliedDeltas.has(id);
  });

  if (!force && localVersion && localVersion === version && pendingDeltas.length === 0) {
    metadataSetSyncValues({ lastRemoteManifestSeenAt: new Date().toISOString(), remoteManifestUrl: manifestUrl });
    const status = writeMetadataPreloadStatus({ ok: true, status: "remote-up-to-date", skipped: true, count: before.count, version });
    return { ok: true, skipped: true, reason: "remote-up-to-date", count: before.count, version, status };
  }

  const imported = [];
  let usedFullSnapshot = false;
  const countBefore = Number(before.count || 0);
  const shouldImportFull = Boolean(fullEntry) && (
    options.clear === true ||
    force ||
    countBefore === 0 ||
    (localVersion && localVersion !== version && pendingDeltas.length === 0)
  );

  if (shouldImportFull) {
    const result = await importMetadataRemoteEntry(fullEntry, manifestUrl, { clear: true });
    imported.push({ type: "full", ...result });
    usedFullSnapshot = true;
    appliedDeltas.clear();
  }

  if (!usedFullSnapshot) {
    for (const delta of pendingDeltas) {
      const id = metadataDeltaId(delta);
      const result = await importMetadataRemoteEntry(delta, manifestUrl, { clear: false });
      imported.push({ type: "delta", id, ...result });
      appliedDeltas.add(id);
    }
  }

  const after = db.getMetadataStats ? db.getMetadataStats() : { count: countBefore };
  metadataSetSyncValues({
    remoteMode: "manifest",
    remoteManifestUrl: manifestUrl,
    remoteManifestVersion: version,
    remoteManifestGeneratedAt: String(manifest.generatedAt || manifest.updatedAt || ""),
    lastRemoteImportAt: imported.length ? new Date().toISOString() : metadataGetSyncValue("lastRemoteImportAt", ""),
    remoteRows: String(after.count || 0),
    remoteAppliedDeltas: JSON.stringify(Array.from(appliedDeltas))
  });

  const status = writeMetadataPreloadStatus({
    ok: true,
    status: imported.length ? "remote-synced" : "remote-manifest-seen",
    source: manifestUrl,
    version,
    imported: imported.map(x => ({ type: x.type, id: x.id || "", imported: x.imported, after: x.after, url: x.url })),
    count: after.count
  });

  return { ok: true, skipped: imported.length === 0, version, imported, count: after.count, status };
}

async function almMetadataPreload(options = {}) {
  if (rescueMode.active) return rescueMode.skipped();
  await db.whenReady();

  const force = options.force === true;
  const before = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
  let local = null;
  let remote = null;
  let autonomous = null;

  const localFile = metadataLocalPayloadCandidates().find(file => fs.existsSync(file));
  const hasOldMetadataWithoutImages = Number(before.count || 0) > 0 && Number(before.withImages || 0) === 0 && Boolean(localFile);
  const shouldImportLocal = force || Number(before.count || 0) === 0 || hasOldMetadataWithoutImages;

  if (shouldImportLocal) {
    if (localFile) {
      const clearBeforeImport = options.clear === true || hasOldMetadataWithoutImages;
      local = importMetadataBuffer(fs.readFileSync(localFile), localFile, { clear: clearBeforeImport });
      if (local.ok) {
        metadataSetSyncValues({
          lastLocalImportAt: new Date().toISOString(),
          localSnapshotFile: path.basename(localFile),
          localSnapshotSource: localFile,
          localImportReason: hasOldMetadataWithoutImages ? "upgrade-v2-enriched-snapshot" : (force ? "force" : "empty")
        });
      }
    }
  }

  if (options.syncRemote !== false) {
    try {
      remote = await almMetadataRemoteSync({
        force: options.forceRemote === true,
        clear: options.clear === true && !local,
        startup: options.silent === true || options.startup === true
      });
    } catch (error) {
      remote = { ok: false, error: error.message };
    }
  }

  if (options.syncAutonomous !== false) {
    try {
      autonomous = await runMetadataAutonomousUpdate({
        force: options.forceAutonomous === true,
        startup: options.silent === true || options.startup === true
      });
    } catch (error) {
      autonomous = { ok: false, error: error.message };
      writeMetadataAutonomousStatus({ ok: false, status: "error", error: error.message });
    }
  }

  const after = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
  const hasMetadata = Number(after.count || 0) > 0;
  const ok = Boolean(local?.ok || (remote?.ok && remote?.skipped !== true) || (autonomous?.ok && autonomous?.skipped !== true) || hasMetadata);
  const statusName = local?.ok
    ? (remote?.ok && !remote?.skipped ? "imported-local-and-remote-synced" : (autonomous?.ok && !autonomous?.skipped ? "imported-local-and-autonomous-synced" : "imported-local"))
    : (remote?.ok && !remote?.skipped ? "remote-synced" : (autonomous?.ok && !autonomous?.skipped ? "autonomous-synced" : (hasMetadata ? "already-loaded" : "disabled")));

  const status = writeMetadataPreloadStatus({
    ok,
    status: statusName,
    count: after.count,
    local,
    remote,
    autonomous,
    seedPathExists: Boolean(after.seedPathExists),
    remoteConfigured: isMetadataRemoteConfigured(),
    autonomousEnabled: metadataAutonomousConfig().enabled
  });

  if (!ok && !options.silent) {
    return { ok: false, skipped: true, reason: "Aucun snapshot metadata local ou distant disponible", count: after.count, status };
  }

  return {
    ok,
    skipped: !local && (!remote || remote.skipped === true) && (!autonomous || autonomous.skipped === true),
    count: after.count,
    local,
    remote,
    autonomous,
    status
  };
}

function nextAnimeId(animes) {
  return animes.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;
}

function mergeImportedAnime(existing, incoming, overwrite) {
  if (overwrite) {
    const merged={...existing};
    for(const [key,value] of Object.entries(incoming)) if(key!=="id" && value!=="" && value!=null && (!Array.isArray(value)||value.length)) merged[key]=value;
    merged.id=existing.id; merged.poster=existing.poster||incoming.poster||"";
    merged.notes=require('./lib/notebook-model').mergeNotes(existing.notes,incoming.notes);
    if(existing.personalJournal||incoming.personalJournal)merged.personalJournal=require('./lib/notebook-model').mergeJournal(existing.personalJournal,incoming.personalJournal);
    merged.tags=[...new Set([...(existing.tags||[]),...(incoming.tags||[])])];
    if(require("./public/title-preference").custom(existing)){merged.title=existing.title;merged.customTitle=require("./public/title-preference").custom(existing);}
    return metadataPreferences.preserve(existing,clampEpisodesSeenToTotal(merged));
  }
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "id") continue;
    if ((merged[key] === "" || merged[key] == null || (Array.isArray(merged[key]) && merged[key].length === 0)) && value) merged[key] = value;
  }

  // Une réimportation BetaSeries doit pouvoir avancer la progression d'une fiche
  // déjà présente, même lorsque "écraser" n'est pas coché. Les métadonnées
  // personnelles restent intactes : seules la progression et les balises source
  // sont fusionnées de façon monotone.
  const betaProgress = Boolean(incoming?.betaseriesId || incoming?.betaseriesSeriesId || incoming?.betaseriesEpisode);
  if (betaProgress) {
    const oldSeen = numberOrZero(existing?.episodesSeen);
    const newSeen = numberOrZero(incoming?.episodesSeen);
    if (newSeen >= oldSeen) {
      if (incoming?.episodesSeen !== "" && incoming?.episodesSeen != null) merged.episodesSeen = incoming.episodesSeen;
      if (incoming?.status&&!existing.seasonStatusExplicit&&!(existing.status==='Completed'&&incoming.status!=='Completed')) merged.status = incoming.status;
    }
    if (!merged.episodesTotal && incoming?.episodesTotal) merged.episodesTotal = incoming.episodesTotal;
    merged.tags = Array.from(new Set([...(Array.isArray(existing?.tags) ? existing.tags : []), ...(Array.isArray(incoming?.tags) ? incoming.tags : [])]));
    for (const key of ["betaseriesId", "betaseriesSeriesId", "betaseriesSeason", "betaseriesEpisode", "betaseriesStatus"]) {
      if (incoming?.[key] !== "" && incoming?.[key] != null) merged[key] = incoming[key];
    }
  }
  return metadataPreferences.preserve(existing,clampEpisodesSeenToTotal(merged));
}

async function getRelations(malId) {
  if (!malId) return [];
  await db.prepareMetadataTitleIndex();
  const base=db.getMetadataByMalId(malId),next=base&&nextVerifiedLocalSeason(base);
  if(next)return [{relation:'Sequel',source:'canonical-title',entry:[{mal_id:Number(next.row.malId),type:'anime',name:next.row.title,mediaType:next.row.type}]}];
  const cache=await readJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE,{});
  const map=await betaSeriesResolveRelationLayer([malId],cache,{deadlineAt:Date.now()+7000,jikanFallbackLimit:0});
  await writeJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE,cache);
  return map.get(String(malId))||[];
}

function relationEntryToSeasonCandidate(relation, entry) {
  if (!entry || String(entry.type || "").toLowerCase() !== "anime") return null;
  return {
    title: entry.name || entry.title || "",
    type: entry.type || "anime",
    mediaType: entry.mediaType || entry.format || "",
    episodesTotal: entry.episodesTotal || entry.episodes || "",
    startDate: entry.startDate || "",
    relation: relation?.relation || "",
    url: entry.url || "",
    malId: entry.mal_id || entry.malId || ""
  };
}

function nextSeasonFromRelations(relations, existingTitles, existingMalIds = new Set()) {
  const allowed = new Set(["Sequel", "Side story", "Spin-off", "Alternative version", "Summary", "Other"]);
  const candidates = [];
  const seen = new Set();

  for (const relation of relations || []) {
    if (!allowed.has(relation.relation)) continue;
    for (const entry of relation.entry || []) {
      const candidate = relationEntryToSeasonCandidate(relation, entry);
      if (!candidate?.title) continue;

      const titleKey = normalizeTitle(candidate.title);
      const idKey = String(candidate.malId || "");
      const uniqueKey = idKey || titleKey;
      if (!uniqueKey || seen.has(uniqueKey)) continue;
      if (titleKey && existingTitles.has(titleKey)) continue;
      if (idKey && existingMalIds.has(idKey)) continue;

      seen.add(uniqueKey);
      candidates.push(candidate);
    }
  }
  return candidates;
}

function normalizeSeasonMediaType(value) {
  return String(value || "").trim().toLowerCase();
}

function classifySeasonCandidate(candidate = {}, details = null) {
  const relation = String(candidate?.relation || "").trim();
  const title = String(details?.officialTitle || details?.title || candidate?.title || "");
  const type = normalizeSeasonMediaType(details?.type || candidate?.mediaType || "");
  const text = `${title} ${type}`.toLowerCase();
  const isRecap = /(?:recap|recapitulation|summary|digest|soushuuhen|soushuu-hen|compilation)/i.test(text) || relation === "Summary";
  const isPictureDrama = /picture\s*drama/i.test(text);
  const isSpecial = /(?:special|ova|ona\s*special|episode\s*0|bonus|short|chibi|jump\s*festa)/i.test(text) || ["special","tv special","ova","music","pv","cm"].includes(type);
  const isMovie = /(?:movie|film)/i.test(type) || /\bmovie\b/i.test(title);
  const directRelation = relation === "Sequel";

  if (isRecap) return { key: "recap", label: "Récapitulatif", defaultSelected: false };
  if (isPictureDrama) return { key: "picture_drama", label: "Picture drama / bonus", defaultSelected: false };
  if (relation === "Side story") return { key: "side_story", label: "Histoire parallèle", defaultSelected: false };
  if (relation === "Spin-off") return { key: "spin_off", label: "Spin-off", defaultSelected: false };
  if (relation === "Alternative version") return { key: "alternative", label: "Version alternative", defaultSelected: false };
  if (isSpecial) return { key: "special", label: "OVA / Special", defaultSelected: false };
  if (isMovie) return { key: "movie", label: directRelation ? "Film suite" : "Film lié", defaultSelected: false };
  if (directRelation && (!type || ["tv","tv short","ona"].includes(type))) {
    return { key: "direct_sequel", label: "Saison / suite directe", defaultSelected: true };
  }
  if (directRelation) return { key: "sequel_other", label: "Suite liée", defaultSelected: false };
  return { key: "related", label: "Contenu lié", defaultSelected: false };
}

function isAnimeFeatureEligible(anime) {
  if (!anime || typeof anime !== "object") return false;
  const kind = String(anime.mediaKind || "").toLowerCase();
  if (["manual", "non_anime"].includes(kind) || anime.manualLibraryChoice === true || anime.nonAnimeFallback === true) return false;
  const tags = (Array.isArray(anime.tags) ? anime.tags : []).map(t => normalizeForCompare(t));
  if (tags.some(t => ["hors anime probable","hors anime confirme","choix manuel source","conserve manuellement"].includes(t))) return false;
  return true;
}

function romanSeasonToNumber(value) {
  const text = String(value || "").toUpperCase().trim();
  const map = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  return map[text] || 0;
}

function inferSeasonNumberFromTitle(title, fallback = 2) {
  const text = String(title || "");
  const patterns = [
    /\bseason\s*(\d{1,2})\b/i,
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+season\b/i,
    /\bpart\s*(\d{1,2})\b/i,
    /\bcour\s*(\d{1,2})\b/i,
    /\bact\.?\s*(\d{1,2})\b/i,
    /\bs\s*(\d{1,2})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const roman = text.match(/\b(II|III|IV|V|VI|VII|VIII|IX|X)\b/i);
  if (roman) return romanSeasonToNumber(roman[1]) || fallback;
  return fallback;
}

function titleSuggestsContinuation(title) {
  return /\b(2nd|3rd|4th|5th|season\s*\d+|\d+\s*season|part\s*\d+|cour\s*\d+|act\.?\s*\d+|\bII\b|\bIII\b|\bIV\b|\bV\b)\b/i.test(String(title || ""));
}

function animeTitleMatchLooksReliable(anime) {
  const sourceTitle = decodeHtmlEntitiesPlain(anime?.title || "");
  if (!sourceTitle) return false;
  const tags = Array.isArray(anime?.tags) ? anime.tags.map(t => String(t).toLowerCase()) : [];
  const isFlagged = tags.some(t => t.includes("vérifier") || t.includes("verifier") || t.includes("review"));
  const refs = [
    anime?.englishTitle,
    anime?.officialTitle,
    anime?.romajiTitle,
    anime?.animeTitle
  ].map(v => String(v || "").trim()).filter(Boolean);

  if (!refs.length) return true;

  let best = 0;
  for (const ref of refs) {
    best = Math.max(best, similarityScore(sourceTitle, ref), fuzzyScore(sourceTitle, ref));
  }
  if (best >= 58) return true;

  const srcTokens = new Set(normalizeForCompare(sourceTitle).split(" ").filter(w => w.length > 3));
  let shared = 0;
  for (const ref of refs) {
    const refTokens = new Set(normalizeForCompare(ref).split(" ").filter(w => w.length > 3));
    shared = Math.max(shared, [...srcTokens].filter(t => refTokens.has(t)).length);
  }
  if (shared >= 2) return true;

  // Si le match était déjà signalé "à vérifier", on ne l'utilise pas comme base
  // pour détecter des saisons. Cela évite les faux positifs du type série TV non-anime
  // ou mauvais cross-match MAL.
  return !isFlagged && best >= 48;
}

function betaCoverageForAnime(anime) {
  const parsed = parseBetaSeriesEpisode(anime?.betaseriesEpisode || anime?.episode || "");
  const seen = Number(anime?.episodesSeen || 0) || 0;
  const total = Number(anime?.episodesTotal || 0) || 0;
  return {
    season: Number(parsed.season || 0) || 0,
    episode: Number(parsed.episode || 0) || 0,
    seen,
    total
  };
}

function candidateAlreadyCoveredByBetaSeries(anime, candidate, details = null) {
  const coverage = betaCoverageForAnime(anime);
  if (!coverage.season && !coverage.episode) return false;

  const relation = String(candidate?.relation || "").toLowerCase();
  const title = String(candidate?.title || details?.officialTitle || details?.title || "");
  const candidateSeason = inferSeasonNumberFromTitle(title, relation.includes("sequel") ? 2 : 0);

  // BetaSeries exporte souvent un show en S02/S03 alors que MAL sépare chaque saison
  // en fiches distinctes reliées par "Sequel". Si l'utilisateur est déjà en S02,
  // proposer la fiche MAL "2nd Season" comme nouvelle saison est un faux positif.
  if (coverage.season > 1 && candidateSeason > 0 && candidateSeason <= coverage.season) {
    return true;
  }

  // Cas BetaSeries S01E24 alors que MAL a S1=12 + Part 2=12 : l'utilisateur a
  // probablement déjà couvert le second cour même si MAL le présente en sequel/part.
  const baseTotal = coverage.total;
  const betaEpisode = coverage.episode || coverage.seen;
  const candidateEpisodes = Number(details?.episodesTotal || details?.episodes || candidate?.episodesTotal || 0) || 0;
  if (coverage.season <= 1 && baseTotal > 0 && betaEpisode > baseTotal) {
    if (candidateEpisodes > 0 && betaEpisode >= baseTotal + Math.max(1, Math.floor(candidateEpisodes * 0.75))) return true;
    if (candidateSeason === 2 && titleSuggestsContinuation(title) && betaEpisode >= baseTotal + 3) return true;
  }

  return false;
}

function filterSeasonNewsItemsForLibrary(items, animes) {
  const normalizeYearSuffix = value => normalizeTitle(String(value || "").replace(/\s*\((19|20)\d{2}\)\s*$/i, ""));
  const existingTitles = new Set();
  const existingMalIds = new Set();
  const sourceByTitle = new Map();

  for (const a of animes || []) {
    for (const t of [a.title, a.officialTitle, a.englishTitle]) {
      const n = normalizeTitle(t);
      const y = normalizeYearSuffix(t);
      if (n) existingTitles.add(n);
      if (y) existingTitles.add(y);
      if (n) sourceByTitle.set(n, a);
      if (y) sourceByTitle.set(y, a);
    }
    const mid = String(a.malId || a.mal_id || "").trim();
    if (mid) existingMalIds.add(mid);
  }

  const out = [];
  const seen = new Set();

  for (const raw of items || []) {
    const item = hydrateSeasonNewsWithLocalDetails(raw);
    if (!item.seasonClass) { const kind=classifySeasonCandidate(item,item);Object.assign(item,{seasonClass:kind.key,seasonClassLabel:kind.label,defaultSelected:kind.defaultSelected}); }
    const titleKeys = [item.title, item.sequelTitle, item.officialTitle, item.englishTitle, item.name]
      .flatMap(t => [normalizeTitle(t), normalizeYearSuffix(t)])
      .filter(Boolean);
    const idKey = String(item.malId || item.mal_id || item.id || "").trim();
    const unique = idKey || titleKeys[0];
    if (!unique || seen.has(unique)) continue;
    if (idKey && existingMalIds.has(idKey)) continue;
    if (titleKeys.some(t => existingTitles.has(t))) continue;

    const source = sourceByTitle.get(normalizeTitle(item.sourceTitle)) || sourceByTitle.get(normalizeYearSuffix(item.sourceTitle));
    if (source) {
      if (!animeTitleMatchLooksReliable(source)) continue;
      if (candidateAlreadyCoveredByBetaSeries(source, item, item)) continue;
    }

    seen.add(unique);
    out.push(item);
  }

  return out;
}



function xmlDecode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function getTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? xmlDecode(match[1]) : "";
}

function normalizeMalStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "watching") return "Watching";
  if (s === "on-hold" || s === "on hold") return "On-Hold";
  if (s === "dropped") return "Dropped";
  if (s === "plan to watch" || s === "plantowatch" || s === "ptw") return "Plan to Watch";
  return status || "Completed";
}

function parseMalAnimeBlock(block) {
  const title = getTag(block, "series_title") || getTag(block, "title");
  if (!title) return null;

  const myTags = getTag(block, "my_tags");
  const notes = getTag(block, "my_comments");
  const rawId = Number(getTag(block, "series_animedb_id"));
  const malId = Number.isSafeInteger(rawId) && rawId > 0 ? String(rawId) : "";
  const rawType = getTag(block, "series_type");
  return {
    title,
    status: normalizeMalStatus(getTag(block, "my_status") || "Completed"),
    score: getTag(block, "my_score") || "",
    episodesSeen: getTag(block, "my_watched_episodes") || "0",
    episodesTotal: getTag(block, "series_episodes") || "",
    type: ({1:"TV",2:"OVA",3:"Movie",4:"Special",5:"ONA",6:"Music"})[rawType] || rawType || "TV",
    malId,
    tags: myTags ? myTags.split(",").map(x => x.trim()).filter(Boolean) : [],
    poster: "",
    malUrl: malId ? `https://myanimelist.net/anime/${malId}` : "",
    notes: notes || "",
    startDate: "",
    endDate: "",
    publicScore: "",
    rank: "",
    popularity: "",
    members: "",
    genres: [],
    synopsis: "",
    relations: [],
    nextSeasonCandidates: []
  };
}

function parseMalXml(xmlText) {
  const blocks = String(xmlText).match(/<anime>[\s\S]*?<\/anime>/gi) || [];
  return blocks.map(parseMalAnimeBlock).filter(Boolean);
}

async function parseMalXmlCooperative(xmlText, progressCallback) {
  const text = String(xmlText || "");
  const total = (text.match(/<anime>/gi) || []).length;
  const items = [];
  const regex = /<anime>[\s\S]*?<\/anime>/gi;
  let match;
  let done = 0;

  while ((match = regex.exec(text)) !== null) {
    const item = parseMalAnimeBlock(match[0]);
    if (item) items.push(item);
    done++;
    if (progressCallback && (done === 1 || done % 25 === 0 || done === total)) {
      progressCallback(done, total, item?.title || "");
    }
    if (done % 50 === 0) await yieldToEventLoop();
  }

  return items;
}


// Avoid reparsing the whole library for every visible poster. Freshness is bounded
// to one second and the index is immediately invalidated by the main library GET.
let ownedCoverIndex=new Map(),ownedCoverIndexAt=0;
function ownedCoverSource(id){
 const now=Date.now();
 if(now-ownedCoverIndexAt>1000){
  const next=new Map();
  for(const row of readAnimes(false)){
   const malId=Number(row.malId);
   if(!Number.isSafeInteger(malId)||malId<1||malId>100000000)continue;
   // Remember membership even when the imported anime has no poster yet.
   // The metadata fallback below is NEVER available to non-library IDs.
   if(!next.has(malId))next.set(malId,'');
   const source=albumCovers.safeSource(row.poster)||albumCovers.safeSource(row.imageUrl);
   if(source&&!next.get(malId))next.set(malId,source);
  }
  ownedCoverIndex=next;ownedCoverIndexAt=now;
 }
 if(!ownedCoverIndex.has(id))return '';
 const source=ownedCoverIndex.get(id);
 if(source)return source;
 // Some BetaSeries imports contain a correct MAL identity but no poster.
 // Reuse the embedded catalogue's image URL, still through the same bounded
 // server-side cache and provider allow-list; do not alter collection data.
 const metadata=db.getMetadataByMalId(id);
 const fallback=albumCovers.safeSource(metadata?.imageUrl||metadata?.poster);
 if(fallback)ownedCoverIndex.set(id,fallback);
 return fallback||'';
}
// Only IDs actually present in the local library can trigger an external image fetch.
// This route is protected by the existing loopback/session middleware above.
// A same-origin browser 'online' event may reopen network-only failures at most
// once per minute. It cannot override provider Retry-After or bad image URLs.
app.post('/api/cover-cache/reconnect',(req,res)=>{
 const origin=String(req.get('origin')||'');
 const fetchSite=String(req.get('sec-fetch-site')||'');
 if(req.get('x-alm-cover-reconnect')!=='1'||fetchSite&&fetchSite!=='same-origin'&&fetchSite!=='none')return res.status(403).end();
 if(origin){let allowed=false;try{const parsed=new URL(origin);allowed=parsed.host===req.get('host')&&['http:','https:'].includes(parsed.protocol);}catch{}
  if(!allowed)return res.status(403).end();
 }
 res.set('Cache-Control','no-store');
 res.json({ok:true,reopened:albumCovers.reconnect()});
});
app.get('/api/cover-cache/:malId', async (req,res)=>{
 res.set('Cache-Control','private, no-store');
 const id=Number(req.params.malId);
 if(!Number.isSafeInteger(id)||id<1||id>100000000)return res.status(400).end();
 const source=ownedCoverSource(id);
 if(!source)return res.status(404).end();
 const file=await albumCovers.get(source,{offline:process.env.ALM_RELEASE_SMOKE==='1'});
 if(!file)return res.status(404).end();
 res.set('Cache-Control','private, no-store');
 res.set('X-Content-Type-Options','nosniff');
 res.type(path.extname(file));
 return res.sendFile(file,error=>{if(error&&!res.headersSent)res.status(error.code==='ENOENT'?404:500).end();});
});

app.get("/api/animes", (req, res) => {
  ownedCoverIndexAt=0;
  res.json(readAnimes(false));
});

app.get("/api/animes/duplicates/status", (req, res) => {
  try {
    const report = ensureLibraryIntegrity(db.getAllAnimes());
    res.json({ ok: true, removed: report.removed, changed: report.changed, groups: report.groups, last: _lastLibraryIntegrityReport });
  } catch (error) {
    res.status(500).json({ error: "Diagnostic doublons impossible : " + error.message });
  }
});

app.post("/api/animes/duplicates/repair", (req, res) => {
  try {
    const report = ensureLibraryIntegrity(db.getAllAnimes());
    res.json({ ok: true, removed: report.removed, changed: report.changed, groups: report.groups, count: report.items.length });
  } catch (error) {
    res.status(500).json({ error: "Réparation doublons impossible : " + error.message });
  }
});


function manualAddProgress(record) {
  const seen = Number(record?.episodesSeen || 0) || 0;
  const total = Number(record?.episodesTotal || 0) || 0;
  return { seen, total, status: String(record?.status || "") };
}

function manualAddLooksLikeSeasonContinuation(existing, incoming) {
  if (!existing || !incoming) return false;
  const before = manualAddProgress(existing);
  const next = manualAddProgress(incoming);
  const previousCompleted = before.status === "Completed" || (before.total > 0 && before.seen >= before.total);
  const nextInProgress = next.status === "Watching" && next.seen > 0 && (next.total <= 0 || next.seen < next.total);
  return previousCompleted && nextInProgress;
}

function manualAddSeasonRootTitle(existing, requestedTitle) {
  return String(existing?.seriesRootTitle || requestedTitle || existing?.title || "").trim();
}

function manualAddDirectSequel(existing) {
  const candidates = [];
  for (const candidate of (Array.isArray(existing?.nextSeasonCandidates) ? existing.nextSeasonCandidates : [])) {
    if (!candidate?.title) continue;
    if (candidate.relation && !/sequel|suite/i.test(String(candidate.relation))) continue;
    candidates.push({ title: candidate.title, malId: candidate.malId || "" });
  }
  for (const relation of (Array.isArray(existing?.relations) ? existing.relations : [])) {
    if (!/sequel|suite/i.test(String(relation?.relation || ""))) continue;
    for (const entry of (Array.isArray(relation?.entry) ? relation.entry : [])) {
      if (String(entry?.type || "anime").toLowerCase() !== "anime") continue;
      const title = String(entry?.name || entry?.title || "").trim();
      if (title) candidates.push({ title, malId: entry?.mal_id || entry?.malId || "" });
    }
  }
  const previousMalId = String(existing?.malId || "").trim();
  return candidates.find(candidate => !previousMalId || String(candidate.malId || "").trim() !== previousMalId) || candidates[0] || null;
}

function manualAddSeasonNumber(record) {
  const explicit = Number(record?.manualSeasonNumber || record?.betaseriesSeason || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const inferred = inferSeasonNumberFromTitle(record?.title || "", 0);
  return inferred > 0 ? inferred : 1;
}

function manualAddNextSeasonNumber(animes, existing, requestedTitle) {
  const root = libraryNormalizeTitle(manualAddSeasonRootTitle(existing, requestedTitle));
  let highest = Math.max(1, manualAddSeasonNumber(existing));
  for (const item of (Array.isArray(animes) ? animes : [])) {
    const itemRoot = libraryNormalizeTitle(item?.seriesRootTitle || item?.title || "");
    if (root && itemRoot && itemRoot !== root) continue;
    highest = Math.max(highest, manualAddSeasonNumber(item));
  }
  return highest + 1;
}

function manualAddSeasonSearchTitle(rootTitle, seasonNumber, sequel = null) {
  if (sequel?.title) return String(sequel.title).trim();
  const n = Math.max(2, Number(seasonNumber || 2));
  const suffix = n === 2 ? "2nd Season" : n === 3 ? "3rd Season" : `${n}th Season`;
  return `${String(rootTitle || "").trim()} ${suffix}`.trim();
}

function manualAddFindExistingV2(animes, candidate, requestedTitle = "") {
  const list = Array.isArray(animes) ? animes : [];
  const malId = String(candidate?.malId || "").trim();
  const anilistId = String(candidate?.anilistId || "").trim();
  const keys = new Set([
    requestedTitle,
    candidate?.title,
    candidate?.officialTitle,
    candidate?.englishTitle,
    candidate?.romajiTitle
  ].map(libraryNormalizeTitle).filter(Boolean));
  return list.find(item => {
    if (malId && String(item?.malId || "").trim() === malId) return true;
    if (anilistId && String(item?.anilistId || "").trim() === anilistId) return true;
    const titleKey = libraryNormalizeTitle(item?.title || "");
    return titleKey && keys.has(titleKey);
  }) || null;
}

async function searchAnimeForManualAddV2(title, options = {}) {
  const requested = String(title || "").trim();
  if (!requested) return null;
  const alias = getAliasMatch(requested);
  if (alias) return aliasToFound(alias);

  // Les alias embarqués couvrent aussi les titres courts usuels qui peuvent
  // différer fortement du titre catalogue officiel (cas fréquent des nouvelles
  // séries 2026). Ils servent uniquement à reformuler la recherche ; la fiche
  // finale doit toujours être confirmée par la metadata locale ou une API anime.
  const bundledAlias = typeof almAliasHit === "function" ? almAliasHit(requested) : null;
  const canonicalTitle = String(bundledAlias?.animeTitle || requested).trim();

  // La base locale doit être prioritaire : instantanée et sans réseau.
  const local = searchMetadataLocal(canonicalTitle) || (canonicalTitle !== requested ? searchMetadataLocal(requested) : null);
  const threshold = minimumAcceptableMatchScoreForTitle(requested);
  if (local && Number(local.matchingScore || 0) >= Math.max(78, threshold)) return local;
  if (options.localOnly) return null;

  // Pour un ajout manuel, ne pas parcourir séquentiellement toutes les variantes
  // pendant des dizaines de secondes. Une seule recherche multi-source bornée
  // suffit ; si elle échoue, la fiche est tout de même ajoutée et pourra être
  // enrichie plus tard avec « Infos auto ».
  try {
    const found = await withTimeout(searchAnimeSmart(canonicalTitle), 9000);
    if (!found) return local && Number(local.matchingScore || 0) >= threshold ? local : null;
    const score = Number(found.matchingScore || 0);
    if (score < threshold) return local && Number(local.matchingScore || 0) >= threshold ? local : null;
    try { saveAliasMatch(requested, found); } catch {}
    return found;
  } catch {
    return local && Number(local.matchingScore || 0) >= threshold ? local : null;
  }
}

async function enrichManualAddInBackgroundV2(localId, requestedTitle, options = {}) {
  try {
    const found = await searchAnimeForManualAddV2(options.searchTitle || requestedTitle);
    if (!found) return;
    if (options.previousMalId && String(found?.malId || "").trim() === String(options.previousMalId).trim()) return;
    if (found?.malId) metadataLearnFromFound(found, "add-anime-background");

    const latest = readAnimes();
    const index = latest.findIndex(item => Number(item.id) === Number(localId));
    if (index < 0) return;
    const current = latest[index];

    // Si l'enrichissement découvre qu'une fiche équivalente existait déjà sous
    // un autre titre, fusionner au lieu de créer durablement un doublon.
    const duplicate = options.keepDistinctSeason ? null : manualAddFindExistingV2(
      latest.filter(item => Number(item.id) !== Number(localId)),
      { ...current, ...found },
      requestedTitle
    );
    if (duplicate) {
      const enrichedCurrent = mergeAutoInfo({ ...current }, found, false);
      if (!enrichedCurrent.poster && found?.imageUrl) enrichedCurrent.poster = found.imageUrl;
      const mergedDuplicate = mergeDuplicateAnimeRecords(duplicate, enrichedCurrent);
      db.updateAnime(duplicate.id, { ...mergedDuplicate, id: duplicate.id }, { save: "deferred", delayMs: 12000 });
      db.deleteAnime(current.id, { save: "deferred", delayMs: 12000 });
      return;
    }

    const merged = mergeAutoInfo({ ...current }, found, false);
    if (!merged.poster && found?.imageUrl) merged.poster = found.imageUrl;
    db.updateAnime(current.id, { ...merged, id: current.id }, { save: "deferred", delayMs: 12000 });
  } catch (error) {
    console.warn("[manual-add] Enrichissement arrière-plan ignoré :", error.message);
  }
}

function scheduleManualAddEnrichmentV2(localId, requestedTitle, enabled, options = {}) {
  if (!enabled) return;
  setImmediate(() => enrichManualAddInBackgroundV2(localId, requestedTitle, options));
}

app.post("/api/animes", async (req, res) => {
  const animes = readAnimes();
  const body = req.body || {};
  const requestedTitle = String(body.title || "").trim();
  if (!requestedTitle) return res.status(400).json({ error: "Titre obligatoire." });

  if (body.catalogAdd === true) {
    const duplicate = collectionIdentity.find(body, animes);
    if (duplicate) return res.json({...duplicate, _addOutcome:{status:'existing', requestedTitle, storedTitle:duplicate.title}});
  }

  const nextLocalId = animes.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;
  let anime = {
    id: nextLocalId,
    title: requestedTitle,
    status: body.status || "Watching",
    score: body.score || "",
    episodesSeen: body.episodesSeen || "",
    episodesTotal: body.episodesTotal || "",
    type: body.type || "TV",
    tags: Array.isArray(body.tags) ? body.tags : [],
    poster: body.poster || "",
    malUrl: body.malUrl || "",
    notes: body.notes || "",
    startDate: body.startDate || "",
    endDate: body.endDate || "",
    publicScore: body.publicScore || "",
    rank: body.rank || "",
    popularity: body.popularity || "",
    members: body.members || "",
    genres: Array.isArray(body.genres) ? body.genres : [],
    synopsis: body.synopsis || "",
    studios: Array.isArray(body.studios) ? body.studios : [],
    synonyms: Array.isArray(body.synonyms) ? body.synonyms : [],
    seriesGroupTitle:String(body.seriesGroupTitle||'').trim().slice(0,300),seriesSeparate:body.seriesSeparate===true,manualSeasonNumber:Math.min(100,Math.max(0,Number(body.manualSeasonNumber)||0)),
    duration: body.duration || "", titleEn: body.titleEn || "", titleJa: body.titleJa || "",
    malId:Number(body.malId)||"", anilistId:Number(body.anilistId)||""
  };

  // L'ajout manuel est volontairement transactionnel et immédiat : on écrit
  // d'abord exactement ce que l'utilisateur vient de saisir. La résolution
  // metadata/API se fait ensuite en arrière-plan afin qu'une API lente, une VM
  // ou une base metadata en cours de chargement ne puisse jamais faire
  // disparaître le clic « + Ajouter ».
  let found = null;

  anime = viewing.completeEpisodes(anime, anime.malId ? db.getMetadataByMalId(anime.malId) : null);
  if (anime.completionNeedsEpisodes && body.confirmUnknownEpisodes !== true) return res.status(409).json({code:'ALM_EPISODES_UNKNOWN',error:'Indique le nombre d’épisodes vus, ou confirme que le total reste inconnu.'});
  try { anime = viewing.recordViewing(null, anime, body); }
  catch (error) { return res.status(400).json({code:error.message,error:'Date de visionnage invalide.'}); }

  const existing = body.catalogAdd === true ? null : manualAddFindExistingV2(animes, anime, requestedTitle);
  if (existing && manualAddLooksLikeSeasonContinuation(existing, anime)) {
    const seriesRootTitle = manualAddSeasonRootTitle(existing, requestedTitle);
    const seasonNumber = manualAddNextSeasonNumber(animes, existing, requestedTitle);
    const sequel = manualAddDirectSequel(existing);
    const searchTitle = manualAddSeasonSearchTitle(seriesRootTitle, seasonNumber, sequel);

    // Une saison déjà terminée ne doit jamais absorber la progression de la
    // saison suivante. On crée une fiche distincte immédiatement, puis on
    // résout son titre/MAL en arrière-plan. Le titre temporaire est volontairement
    // différent pour que le réparateur de doublons ne fusionne pas S1 et S2.
    anime = {
      ...anime,
      title: sequel?.title || `${seriesRootTitle} — Saison ${seasonNumber}`,
      seriesRootTitle,
      manualSeasonNumber: seasonNumber,
      previousSeasonId: existing.id,
      previousSeasonMalId: existing.malId || "",
      notes: [anime.notes, `Saison ${seasonNumber} suivie séparément : la saison précédente reste terminée.`].filter(Boolean).join("\n")
    };
    if (sequel?.malId) anime.malId = sequel.malId;

    db.insertAnime(anime, { save: "deferred", delayMs: 12000 });
    const persistedSeason = readAnimes().find(item => Number(item.id) === Number(anime.id));
    if (!persistedSeason) {
      return res.status(500).json({ error: "La saison en cours n'a pas pu être retrouvée après son enregistrement." });
    }
    const backgroundEnrichment = body.autoInfo !== false;
    res.json({
      ...persistedSeason,
      _addOutcome: {
        status: "added-season",
        requestedTitle,
        storedTitle: persistedSeason.title || anime.title,
        seasonNumber,
        matched: Boolean(sequel),
        matchedTitle: sequel?.title || "",
        backgroundEnrichment
      }
    });
    scheduleManualAddEnrichmentV2(persistedSeason.id, requestedTitle, backgroundEnrichment, {
      keepDistinctSeason: true,
      previousMalId: existing.malId || "",
      searchTitle
    });
    return;
  }

  if (existing) {
    const merged = mergeAutoInfo({ ...existing }, found, false);
    db.updateAnime(existing.id, { ...merged, id: existing.id }, { save: "deferred", delayMs: 12000 });
    const persisted = readAnimes().find(item => Number(item.id) === Number(existing.id)) || merged;
    const backgroundEnrichment = body.autoInfo !== false && !found;
    res.json({
      ...persisted,
      _addOutcome: {
        status: "existing",
        requestedTitle,
        storedTitle: persisted.title || existing.title || requestedTitle,
        matched: Boolean(found),
        matchedTitle: found?.officialTitle || found?.title || "",
        backgroundEnrichment
      }
    });
    scheduleManualAddEnrichmentV2(existing.id, requestedTitle, backgroundEnrichment);
    return;
  }

  db.insertAnime(anime, { save: "deferred", delayMs: 12000 });
  const persisted = readAnimes().find(item => Number(item.id) === Number(anime.id));
  if (!persisted) {
    return res.status(500).json({ error: "La fiche n'a pas pu être retrouvée après son enregistrement. Aucun ajout silencieux n'a été considéré comme réussi." });
  }
  const backgroundEnrichment = body.autoInfo !== false && !found;
  res.json({
    ...persisted,
    _addOutcome: {
      status: "added",
      requestedTitle,
      storedTitle: persisted.title || requestedTitle,
      matched: Boolean(found),
      matchedTitle: found?.officialTitle || found?.title || "",
      backgroundEnrichment
    }
  });
  scheduleManualAddEnrichmentV2(persisted.id, requestedTitle, backgroundEnrichment);
  return;
});

function exactLocalCompletion(anime) {
  if(anime.automationDecision?.kind==='undo'&&anime.automationDecision.sourcePosition===(anime.betaseriesEpisode||'')&&anime.automationDecision.malId===String(anime.malId||''))return null;
  if(anime.importIdentityReview||!isAnimeFeatureEligible(anime))return null;
  if(!anime.malId&&importIntegrity.provisional(anime)){
    const family=String(anime.betaseriesSeriesId||anime.betaseriesId||'');
    const root=family&&readAnimes().find(a=>a.malId&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&Number(a.betaseriesSeason||1)===1);
    const learned=automation.season(family,Number(anime.manualSeasonNumber||anime.betaseriesSeason));
    if(root&&learned?.source==='manual'&&Number(learned.rootMalId)===Number(root.malId)){
      const row=db.getMetadataByMalId(learned.malId);if(row)return {...metadataToFound(row,row.title,100),verifiedSeriesSeason:{rootMalId:Number(root.malId),season:Number(anime.manualSeasonNumber||anime.betaseriesSeason),source:'manual'}};
    }
    if(root&&!progressReconciliation.continuous(root)){
      const direct=localSeasonLinks.findSeason(db.getMetadataByMalId(root.malId),anime,localSeasonSearch);
      if(direct)return {...metadataToFound(direct.row,direct.row.title,100),verifiedSeriesSeason:{...direct.proof,rootMalId:Number(root.malId),season:Number(anime.manualSeasonNumber||anime.betaseriesSeason)}};
      let row=db.getMetadataByMalId(root.malId),logical=1;const visited=new Set();
      for(let i=0;i<100&&row&&logical<Number(anime.manualSeasonNumber||anime.betaseriesSeason);i++){
        if(visited.has(row.malId))break;visited.add(row.malId);
        const next=nextVerifiedLocalSeason(row);if(!next)break;
        if(!next.proof.split)logical++;row=next.row;
      }
      if(row&&logical===Number(anime.manualSeasonNumber||anime.betaseriesSeason))return {...metadataToFound(row,row.title,100),verifiedSeriesSeason:{rootMalId:Number(root.malId),season:logical}};
    }
  }
  let row=null;
  if(Number(anime.malId)>0)row=db.getMetadataByMalId(anime.malId);
  else {
    const norm=require('./lib/season-identity').norm,q=String(anime.canonicalTitle||anime.title||'');
    const matches=(db.searchMetadataByTitle(q,100)||[]).filter(r=>[r.title,r.titleEn,r.titleRomaji,...(Array.isArray(r.synonyms)?r.synonyms:[])].some(name=>norm(name)&&norm(name)===norm(q)));
    const unique=new Map(matches.map(r=>[Number(r.malId),r]));
    if(unique.size===1)row=[...unique.values()][0];
  }
  if(!row)return null;
  const found=metadataToFound(row,anime.title,100);
  return importIntegrity.acceptsInfo(anime,found)?found:null;
}

function localSeasonSearch(query,limit){
 const rows=[...(db.searchMetadataByTitle(query,limit)||[]),...(db.searchMetadataByTitleTokens(query,limit)||[])];
 return [...new Map(rows.map(r=>[r.malId,r])).values()];
}

app.put("/api/animes/:id", async (req, res) => {
  await db.whenReady();
  if(!require('./lib/restoration').validAnimeLists(req.body))return res.status(400).json({error:'ALM_INVALID_LIST_FIELDS',code:'ALM_INVALID_LIST_FIELDS'});
  const id = Number(req.params.id);
  const animes = readAnimes();
  const index = animes.findIndex(a => Number(a.id) === id);
  if (index === -1) return res.status(404).json({ error: "Anime introuvable." });

  if(Object.hasOwn(req.body||{},'expectedNotes')&&req.body.expectedNotes!==require('./lib/notebook-model').notes(animes[index].notes))return res.status(409).json({code:'NOTEBOOK_CONFLICT',error:'NOTEBOOK_CONFLICT'});
  if(Object.hasOwn(req.body||{},'personalJournal'))return res.status(400).json({code:'NOTEBOOK_INVALID',error:'NOTEBOOK_INVALID'});
  let next = { ...animes[index], ...req.body, id };
  delete next.expectedNotes;
  delete next.manualMetadata;delete next.associationResolution;
  if(animes[index].associationResolution)next.associationResolution=animes[index].associationResolution;
  metadataPreferences.capture(animes[index],req.body,next);
  if(Object.hasOwn(req.body||{},'status'))next.seasonStatusExplicit=true;
  if(Object.hasOwn(req.body||{},'episodesSeen')&&String(req.body.episodesSeen??'')!==String(animes[index].episodesSeen??''))next.episodesSeenExplicit=true;
  if(req.body?.autoInfo===true){
    const found=exactLocalCompletion(next);
    if(found){mergeAutoInfo(next,found,false);clearAutoCompletionUnresolved(next);clearAutoImageUnresolved(next);}
  }
  if(!next.episodesSeenExplicit||next.status==='Completed'&&req.body?.status!==animes[index].status)next=viewing.completeEpisodes(next,db.getMetadataByMalId(next.malId));
  if(typeof req.body?.title==='string'&&req.body.title.trim()!==String(animes[index].title||'').trim()){
    next.title=req.body.title.trim().slice(0,300);next.customTitle=next.title;
  }
  if (next.completionNeedsEpisodes && req.body?.confirmUnknownEpisodes !== true && animes[index].status !== 'Completed') return res.status(409).json({code:'ALM_EPISODES_UNKNOWN',error:'Indique le nombre d’épisodes vus, ou confirme que le total reste inconnu.'});
  try { next = viewing.recordViewing(animes[index], next, req.body); }
  catch (error) { return res.status(400).json({code:error.message,error:'Date de visionnage invalide.'}); }
  delete next.watchedOn; delete next.confirmUnknownEpisodes;
  next.autoCompletionMissing=animeFullCompleteness(next).missing;
  next.autoCompletionSignature=animeCompletionSignature(next);
  animes[index] = next;
  writeAnimes(animes);
  scheduleDeferredCompletion();
  res.json(animes[index]);
});

app.patch('/api/animes/:id/season-status', (req,res)=>{
  const statuses=new Set(['Watching','Plan to Watch','Completed','On-Hold','Dropped']);
  const status=req.body?.status,season=Number(req.body?.season||0);
  if(!statuses.has(status)||!Number.isInteger(season)||season<0||season>100)return res.status(400).json({error:'Statut ou saison invalide.'});
  const items=readAnimes(),record=items.find(a=>Number(a.id)===Number(req.params.id));
  if(!record)return res.status(404).json({error:'Anime introuvable.'});
  if(season){
    record.seriesSeasonStatuses={...(record.seriesSeasonStatuses||{}),[season]:status};
    if(record.betaseriesProgressScope==='season-marker' && season===Number(String(record.betaseriesEpisode||'').match(/^S(\d+)E/i)?.[1])){record.status=status;record.seasonStatusExplicit=true;}
  }
  else {record.status=status;record.seasonStatusExplicit=true;}
  // A status choice does not assert a missing episode count or external identity.
  writeAnimes(items);res.json({ok:true,anime:record});
});

app.delete("/api/animes/:id", (req, res) => {
  const id = Number(req.params.id);
  const animes = readAnimes();
  const filtered = animes.filter(a => Number(a.id) !== id);
  writeAnimes(filtered);
  res.json({ ok: true });
});

app.get('/api/viewing', (req,res) => {
  try { res.json(viewing.viewingData(readAnimes(false), req.query.year || new Date().getFullYear())); }
  catch (error) { res.status(400).json({error:error.message,code:error.message}); }
});

app.get('/api/completion',(req,res)=>{
  const id=Number(req.query.malId);
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid MAL id'});
  const row=db.getMetadataByMalId(id);
  res.json({episodes:viewing.positive(row?.episodes)||viewing.positive(row?.episodesTotal)||null});
});


function combineCompletionCandidates(local,remote){
  const result={...local,...remote};
  for(const [key,value]of Object.entries(local||{}))if(result[key]===''||result[key]===null||result[key]===undefined||(Array.isArray(result[key])&&!result[key].length))result[key]=value;
  return result;
}
async function resolveProvisionalSeasonInfo(anime,options={}){
  const season=Number(anime.manualSeasonNumber||anime.betaseriesSeason||0);
  const seriesId=String(anime.betaseriesSeriesId||anime.betaseriesId||'');
  if(!seriesId||season<2||season>100)return null;
  const root=readAnimes().find(a=>String(a.betaseriesSeriesId||a.betaseriesId||'')===seriesId&&a.malId&&!a.importIdentityReview&&!importIntegrity.provisional(a)&&Number(a.betaseriesSeason||a.manualSeasonNumber||1)===1);
  if(!root||root.betaseriesProgressScope==='season-marker')return null;
  const cache=await readJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE,{}),visited=new Set(['mal:'+root.malId]);
  let current=betaSeriesSeasonEntryFromItem({anime:root});
  const deadlineAt=Date.now()+(options.timeoutMs||14000);
  let logical=1;
  for(let index=1;index<=100&&logical<season;index++){
    let relations=current.anime?.relations||[];
    if(!relations.length){
      const local=betaSeriesChooseDirectSequel(current,[],logical,visited);
      if(local){visited.add('mal:'+local.malId);logical=local.sourceSeason||logical+1;current=local;continue;}
      const cached=cache[String(current.malId)];
      if(options.localOnly&&!cached)return null;
      const map=cached?new Map([[String(current.malId),betaSeriesRelationCacheEntry(cached).relations]]):await betaSeriesResolveRelationLayer([current.malId],cache,{deadlineAt,jikanFallbackLimit:2});
      relations=map.get(String(current.malId))||[];
    }
    const next=await betaSeriesNextLinkedEntry(current,relations,logical,visited,cache,{deadlineAt,localOnly:options.localOnly});
    if(!next?.malId)return null;
    visited.add('mal:'+next.malId);logical=next.sourceSeason||logical+1;current=next;
  }
  if(logical!==season)return null;
  await writeJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE,cache).catch(()=>{});
  let found=current.found;
  if(!found)try{found=await withTimeout(getAnimeById(current.malId),Math.max(750,deadlineAt-Date.now()));}catch{}
  if(found&&options.requireImage&&!found.imageUrl)try{const remote=await withTimeout(getAnimeById(current.malId,{forceRemote:true}),Math.max(750,deadlineAt-Date.now()));if(String(remote?.malId)===String(current.malId))found=combineCompletionCandidates(found,remote);}catch{}
  if(!found||String(found.malId)!==String(current.malId))return null;
  return {...found,verifiedSeriesSeason:{rootMalId:Number(root.malId),season}};
}
async function recoverVerifiedBetaSeriesOverflow(anime,found,options={}){
  if(anime.automationDecision?.kind==='undo'&&anime.automationDecision.sourcePosition===anime.betaseriesEpisode&&anime.automationDecision.malId===String(anime.malId||''))return 0;
  const marker=betaSeriesProgress.parseBetaSeriesEpisode(anime.betaseriesEpisode);
  if(!marker.episode||!Number(anime.unallocatedEpisodes)||!anime.malId||anime.importIdentityReview||progressReconciliation.acknowledged(anime))return 0;
  const before={id:anime.id,malId:anime.malId,episodesSeen:anime.episodesSeen,marker:anime.betaseriesEpisode};
  const family=String(anime.betaseriesSeriesId||anime.betaseriesId||'');
  const original=readAnimes().find(a=>family&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&Number(a.betaseriesSeason||1)===1&&a.malId)||anime;
  const base=metadataToFound(db.getMetadataByMalId(original.malId),original.title,100)||found;
  const row={...(original.betaseriesSourceRow||{}),id:original.betaseriesSeriesId||original.betaseriesId,title:original.betaseriesSourceTitle||original.seriesRootTitle||original.title,episode:anime.betaseriesEpisode};
  const expanded=await expandBetaSeriesProgressItems([{source:'BetaSeries',sourceTitle:row.title,classification:'anime',row,found:base,anime:original}],{boundedNetwork:true,deadlineAt:Date.now()+(options.localOnly?1:7000),jikanFallbackLimit:0,localOnly:options.localOnly});
  const confirmed=expanded.map(a=>a.anime).filter(a=>a.malId);
  if(confirmed.length<2)return 0;
  const latest=readAnimes(),historyBefore=JSON.parse(JSON.stringify(latest)),root=latest.find(a=>Number(a.id)===Number(before.id));
  if(!root||String(root.malId)!==String(before.malId)||root.betaseriesEpisode!==before.marker||root.episodesSeen!==before.episodesSeen)return 0;
  let added=0;for(const next of confirmed){const index=latest.findIndex(a=>String(a.malId)===String(next.malId));if(index>=0){latest[index]=mergeImportedAnime(latest[index],next,false);continue;}latest.push({...next,id:nextId(latest),importShapeVersion:55});added++;}
  const capacity=confirmed.filter(a=>marker.season===1||Number(a.betaseriesSeason)===marker.season).reduce((sum,a)=>sum+Number(a.episodesTotal||0),0),remaining=Math.max(0,marker.episode-capacity);
  for(const target of [...latest.filter(a=>family&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family),anime]){
    const own=Number(target.id)===Number(before.id)?remaining:0;
    target.unallocatedEpisodes=own;target.needsSequelCheck=own>0;target.progressWarning=own?own+' épisode(s) importés restent à rattacher.':'';
    if(!own)target.tags=(target.tags||[]).filter(t=>!/progression à vérifier|suite probable/.test(t));
  }
  writeAnimes(latest);automation.record('season-allocation',historyBefore,readAnimes());return added;
}
const cardInfoFlight=singleFlight((key,anime,query,options)=>lookupAnimeInfoForCardUnshared(anime,query,options));
async function lookupAnimeInfoForCard(anime,query,options={}) {
  const key=JSON.stringify([anime?.malId||"",anime?.anilistId||"",anime?.manualSeasonNumber||anime?.betaseriesSeason||0,query||anime?.title||"",options.localMinScore,options.includeTvmaze,options.timeoutMs,options.requireImage,options.localOnly]);
  return cardInfoFlight(key,anime,query,options);
}
async function lookupAnimeInfoForCardUnshared(anime, query, options = {}) {
  const deadlineAt=Date.now()+Math.max(750,Number(options.timeoutMs)||16000);
  const remaining=()=>Math.max(1,deadlineAt-Date.now());
  if(anime.automationDecision?.kind==='undo'&&anime.automationDecision.sourcePosition===(anime.betaseriesEpisode||'')&&anime.automationDecision.malId===String(anime.malId||''))return null;
  if(anime.importIdentityReview)return null;
  if(importIntegrity.provisional(anime)){
    const local=exactLocalCompletion(anime);if(local)return local;
    const resolved=await resolveProvisionalSeasonInfo(anime,options);
    if(resolved)return resolved;
  }
  const requestedTitle = String(query || anime?.title || "").trim();
  const originalTitle = String(anime?.title || "").trim();
  const known=anime.malId?db.getMetadataByMalId(anime.malId):null;
  const titlesToTry = [...new Set([requestedTitle,originalTitle,...seasonReference.queries(anime,known||{})].filter(Boolean))];
  const remember = (found, reason) => {
    if (!importIntegrity.acceptsInfo(anime,found)) return null;
    if(anime?.malId&&found?.malId&&Number(anime.malId)!==Number(found.malId))return null;
    if (found?.malId) metadataLearnFromFound(found, reason);
    return found;
  };

  // 1) Snapshot metadata local : immédiat. Si on a déjà un malId, ne pas
  // commencer par Jikan : c'était fiable, mais lent et inutile avec un EXE embarqué.
  if (anime?.malId) {
    try {
      const meta = db?.getMetadataByMalId ? db.getMetadataByMalId(anime.malId) : null;
      if (meta) {
        const local=metadataToFound(meta,requestedTitle||meta.title,100);
        if(hasUsefulAnimeInfo(mergeAutoInfo(JSON.parse(JSON.stringify(anime)),local,false))&&(!options.requireImage||local.imageUrl))return local;
        if(!options.localOnly)try{
          const remote=await withTimeout(getAnimeById(anime.malId,{forceRemote:true}),remaining());
          if(remote&&remote.source!=='LocalMetadata')return remember(combineCompletionCandidates(local,remote),'lookup-partial-by-id')||local;
        }catch{}
        return local;
      }
    } catch {}
  }

  // 2) Snapshot metadata local par titre.
  // Si la DB est vide, tenter un auto-seed depuis le cache Jikan avant de chercher
  const metaStats = db?.getMetadataStats ? db.getMetadataStats() : { count: 0 };
  if (Number(metaStats.count || 0) < 5) {
    try { await autoSeedMetadataFromCache(); } catch {}
  }
  for (const title of titlesToTry) {
    try {
      const local = searchMetadataLocal(title, { minScore: options.localMinScore ?? 55, limit: 10 });
      if (local && importIntegrity.acceptsInfo(anime,local)) {
        if(!options.localOnly&&local.malId&&(!hasUsefulAnimeInfo(mergeAutoInfo(JSON.parse(JSON.stringify(anime)),local,false))||(options.requireImage&&!local.imageUrl))){
          try{const remote=await withTimeout(getAnimeById(local.malId,{forceRemote:true}),remaining());if(remote&&remote.source!=='LocalMetadata')return remember(combineCompletionCandidates(local,remote),'lookup-partial-title')||local;}catch{}
        }
        return local;
      }
    } catch {}
  }

  // 3) MAL ID existant en réseau uniquement si le snapshot local n'a rien.
  if(options.localOnly)return null;
  if (anime?.malId) {
    try {
      const byId = await withTimeout(getAnimeById(anime.malId), remaining());
      if (byId) return remember(byId, "lookup-by-id");
    } catch {}
  }

  // 4) Alias locaux + recherche intelligente réseau.
  for (const title of titlesToTry.slice(0,3)) {
    if(Date.now()>=deadlineAt)break;
    try {
      const searchFn = typeof searchAnimeWithAliases === "function" ? searchAnimeWithAliases : searchAnimeSmart;
      const found = await withTimeout(searchFn(title), remaining());
      if (found && importIntegrity.acceptsInfo(anime,found)) return remember(found, "lookup-search");
    } catch {}
  }

  // 5) Fallback BetaSeries optionnel : jamais bloquant.
  for (const title of titlesToTry.slice(0,2)) {
    if(Date.now()>=deadlineAt)break;
    try {
      const beta = await withTimeout(searchBetaSeriesShow(title), Math.min(10000,remaining()));
      if (beta) return remember(beta, "lookup-betaseries");
    } catch {}
  }

  // 6) Fallback TVMaze sans clé : utile pour les imports BetaSeries qui ne sont
  // pas de vrais anime MAL/AniList (ex. Treadstone, Лучше, чем люди). On les
  // complète, mais on les marque comme hors-anime probable pour ne pas les
  // reproposer éternellement dans la bannière de complétion anime.
  if (options.includeTvmaze !== false && !importIntegrity.provisional(anime)) {
    for (const title of titlesToTry.slice(0,2)) {
      if(Date.now()>=deadlineAt)break;
      try {
        const tv = await withTimeout(searchTvmazeShow(title), Math.min(12000,remaining()));
        if (tv) return tv;
      } catch {}
    }
  }

  return null;
}

async function findBestImageUrlForAnimeCard(anime, query) {
  if(!anime.malId&&!anime.anilistId&&importIntegrity.provisional(anime)){
    const found=await lookupAnimeInfoForCard(anime,query,{requireImage:true,timeoutMs:7000,includeTvmaze:false});
    return {found,imageUrl:found?.imageUrl||''};
  }
  if(anime.importIdentityReview)return {imageUrl:'',found:null};
  const requestedTitle = String(query || anime?.title || "").trim();
  const originalTitle = String(anime?.title || "").trim();
  const titlesToTry = [...new Set([requestedTitle, originalTitle].filter(Boolean))];
  let malId = anime?.malId || "";
  let found = null;

  if (malId) {
    try {
      const local = db?.getMetadataByMalId ? db.getMetadataByMalId(malId) : null;
      if (local?.imageUrl) return { imageUrl: local.imageUrl, found: metadataToFound(local, local.title || requestedTitle, 100) };
    } catch {}
  }

  found = await lookupAnimeInfoForCard(anime, requestedTitle, { timeoutMs: 16000, localMinScore: 55,requireImage:true });
  if (found?.malId && !malId) malId = found.malId;
  if (found?.imageUrl) return { imageUrl: found.imageUrl, found };

  if (importIntegrity.provisional(anime)||malId) return {imageUrl:"",found};
  for (const title of titlesToTry) {
    try {
      const url = await searchBestImageUrl(title, malId || found?.malId || null);
      if (url) return { imageUrl: url, found };
    } catch {}
  }

  for (const title of titlesToTry) {
    try {
      const fallback = await searchImageFallbackAll(title);
      if (fallback) return { imageUrl: fallback, found };
    } catch {}
  }

  return { imageUrl: "", found };
}

app.post("/api/animes/:id/download-image", async (req, res) => {
  const id = Number(req.params.id);
  const query = String(req.body?.query || "").trim();

  const animes = readAnimes();
  const anime = animes.find(a => Number(a.id) === id);
  if (!anime) return res.status(404).json({ error: "Anime introuvable." });

  try {
    const { imageUrl, found } = await findBestImageUrlForAnimeCard(anime, query || anime.title);
    if (!imageUrl) return res.status(404).json({ error: "Image introuvable pour : " + (query || anime.title) });

    const localPath = await downloadImage(imageUrl, anime.title);
    if (localPath) {
      anime.poster = localPath;
    } else {
      anime.imageUrl = imageUrl;
    }
    clearAutoImageUnresolved(anime);
    if (found) { mergeAutoInfo(anime, found, false); if (found.source === "TVMaze" || found.nonAnimeFallback) markTvmazeFallback(anime); }
    writeCompletionAnimes(animes);

    res.json({ ok: true, anime, source: found?.source || "image-search", imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/api/animes/:id/refresh-info", async (req, res) => {
  const id = Number(req.params.id);
  const animes = readAnimes();
  const anime = animes.find(a => Number(a.id) === id);
  if (!anime) return res.status(404).json({ error: "Anime introuvable." });

  try {
    const query = String(req.body?.query || anime.title || "").trim();
    const overwrite = req.body?.overwrite === true;
    const found = await lookupAnimeInfoForCard(anime, query || anime.title, { timeoutMs: 17000, localMinScore: 55 });

    if (!found) return res.status(404).json({ error: "Informations non trouvées pour : " + (query || anime.title) });

    mergeAutoInfo(anime, found, overwrite);
    clearAutoCompletionUnresolved(anime);
    if (found.source === "TVMaze" || found.nonAnimeFallback) markTvmazeFallback(anime);

    let imageDownloaded = false;
    if (!String(anime.poster || "").trim()) {
      const malId = anime.malId || found.malId || null;
      let imgUrl = found.imageUrl || "";
      if (!imgUrl) {
        try { imgUrl = await searchBestImageUrl(query || anime.title, malId); } catch {}
      }
      if (!imgUrl) {
        try {
          const imageLookup = await findBestImageUrlForAnimeCard(anime, query || anime.title);
          imgUrl = imageLookup.imageUrl || "";
        } catch {}
      }
      if (imgUrl) {
        if (!String(anime.imageUrl || "").trim()) anime.imageUrl = imgUrl;
        const localPath = await downloadImage(imgUrl, anime.title);
        if (localPath) {
          anime.poster = localPath;
          imageDownloaded = true;
        }
        clearAutoImageUnresolved(anime);
      }
    }

    writeCompletionAnimes(animes);
    res.json({ ok: true, anime, source: found.source || "auto", imageDownloaded });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


function animeAutoTags(a) {
  return Array.isArray(a?.tags) ? a.tags.map(t => String(t || "").toLowerCase()) : [];
}
function hasDisplayImage(a) {
  return !!String(a?.poster || a?.imageUrl || "").trim();
}
function animeCompletionDateInfo(a) {
  const raw = String(a?.startDate || a?.year || "").trim();
  const match = raw.match(/(?:^|\D)(19\d{2}|20\d{2}|21\d{2})(?:\D|$)/);
  const year = match ? Number(match[1]) : 0;
  const timestamp = /^\d{4}-\d{2}-\d{2}/.test(raw) ? Date.parse(raw.slice(0, 10) + "T00:00:00Z") : NaN;
  return { raw, year, timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
}

function animeCompletionRequiresEpisodeTotal(a) {
  const type = String(a?.type || a?.format || "").trim().toLowerCase();
  if (/movie|film/.test(type)) return false;

  // Pour une oeuvre future ou tout juste commencée, le nombre total d'épisodes
  // peut légitimement ne pas encore être publié. On ne transforme pas ce cas en
  // faux échec de complétion.
  const date = animeCompletionDateInfo(a);
  const now = Date.now();
  if (date.timestamp && date.timestamp > now) return false;
  const status = String(a?.status || "").trim().toLowerCase();
  if (status === "completed" || status === "termine" || status === "terminé") return true;
  const end = String(a?.endDate || "").trim();
  const startedRecently = date.timestamp && date.timestamp <= now && (now - date.timestamp) < 18 * 30 * 24 * 60 * 60 * 1000;
  if (!end && startedRecently && ["tv", "ona", "ova", "special", "tv special", "tv short", ""].includes(type)) return false;
  return true;
}

function animeInfoCompleteness(a) {
  if (!a?.title) return { complete: false, missing: ["titre"] };
  if(a.importIdentityReview)return {complete:false,missing:['association importée']};
  const tags = animeAutoTags(a);
  if (tags.includes("hors anime probable") || tags.includes("tvmaze") || !isAnimeFeatureEligible(a)) {
    return { complete: true, excluded: true, missing: [] };
  }

  const missing = [];
  const genres = Array.isArray(a.genres) ? a.genres.map(value => String(value || "").trim()).filter(Boolean) : [];
  const hasStableId = Boolean(String(a.malId || a.anilistId || "").trim()) || a.verifiedAnime === true || String(a.mediaKind || "").toLowerCase() === "anime";
  const synopsis = String(a.synopsis || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const type = String(a.type || a.format || "").trim();
  const date = animeCompletionDateInfo(a);
  const episodeTotal = Number(a.episodesTotal || a.episodes || 0) || 0;

  if (!hasStableId) missing.push("identifiant anime fiable");
  if(!a.malId&&!a.anilistId&&importIntegrity.provisional(a))missing.push('saison importée');
  if (!type) missing.push("format/type");
  if (!synopsis || /^(?:unknown|n\/?a|no synopsis(?: information)?(?: has been added)?[.!]?)$/i.test(synopsis)) missing.push("synopsis");
  if (!genres.length) missing.push("genres");
  if (!date.year) missing.push("date de diffusion");
  if (animeCompletionRequiresEpisodeTotal(a) && episodeTotal <= 0) missing.push("nombre d'épisodes");

  // An identified, planned title without a broadcast date may be announced
  // before either its date or episode count exists. Keep these unknown values
  // visible as pending information, rather than asking for the same repair forever.
  const awaiting = [];
  if(hasStableId&&(a.malId||a.anilistId)&&a.status!=='Completed'&&!a.endDate&&!Number(a.episodesTotal||a.episodes)&&!importIntegrity.provisional(a)){
    const index=missing.indexOf("nombre d'épisodes");if(index>=0){missing.splice(index,1);awaiting.push("nombre d'épisodes");}
  }
  if (hasStableId && a.status === "Plan to Watch" && !date.year && !a.endDate &&
      missing.every(field => ["date de diffusion", "nombre d'épisodes"].includes(field))) {
    awaiting.push(...missing.splice(0));
  }
  return { complete: missing.length === 0, missing, awaiting };
}

function animeFullCompleteness(a) {
  const info = animeInfoCompleteness(a);
  if (info.excluded) return info;
  const missing = [...info.missing];
  if (!hasDisplayImage(a)) missing.push("image");
  return { complete: missing.length === 0, missing, awaiting: info.awaiting || [] };
}

function hasUsefulAnimeInfo(a) {
  return animeInfoCompleteness(a).complete;
}
function isAutoCompletionExcluded(a, options = {}) {
  const opts = (options && typeof options === "object") ? options : {};
  if (opts.includeMarked === true || opts.retryMarked === true) return false;
  const tags = animeAutoTags(a);
  return tags.includes("non trouvé auto") || tags.includes("hors anime probable") || tags.includes("non anime probable");
}
function markAutoCompletionUnresolved(anime, reason = "non trouvé auto") {
  if (!anime) return;
  const tags = Array.isArray(anime.tags) ? anime.tags : [];
  if (!tags.includes(reason)) tags.push(reason);
  if (!tags.includes("à vérifier")) tags.push("à vérifier");
  anime.tags = tags;
  anime.autoCompletionReason=importIntegrity.provisional(anime)?'season-association-pending':'metadata-unconfirmed';
}
function clearAutoCompletionUnresolved(anime) {
  if (!anime || !Array.isArray(anime.tags)) return;
  anime.tags = anime.tags.filter(t => !["non trouvé auto"].includes(String(t || "").toLowerCase()));
  delete anime.autoCompletionReason;
}
function markAutoImageUnresolved(anime) {
  if (!anime) return;
  const tags = Array.isArray(anime.tags) ? anime.tags : [];
  if (!tags.includes("image introuvable auto")) tags.push("image introuvable auto");
  if (!tags.includes("à vérifier")) tags.push("à vérifier");
  anime.tags = tags;
}
function clearAutoImageUnresolved(anime) {
  if (!anime || !Array.isArray(anime.tags)) return;
  anime.tags = anime.tags.filter(t => String(t || "").toLowerCase() !== "image introuvable auto");
}
function markTvmazeFallback(anime) {
  if (!anime) return;
  const tags = Array.isArray(anime.tags) ? anime.tags : [];
  for (const tag of ["TVMaze", "hors anime probable", "à vérifier"]) {
    if (!tags.includes(tag)) tags.push(tag);
  }
  anime.tags = tags;
}
function needsAnimeInfo(a, options = {}) {
  const opts = (options && typeof options === "object") ? options : {};
  return !!(a?.title && !isAutoCompletionExcluded(a, opts) && (opts.forceWaiting===true||!resolutionWaitingCurrent(a)) && (!hasUsefulAnimeInfo(a)||(Number(a.unallocatedEpisodes)>0&&!progressReconciliation.acknowledged(a))));
}
function isMinorCompletionGapForBanner(a) {
  const state = animeInfoCompleteness(a);
  if (state.complete || state.excluded || !Array.isArray(state.missing) || !state.missing.length) return false;
  // Une date de diffusion ou un total d'épisodes peut légitimement rester
  // inconnu (anime futur, ONA en cours, catalogue source incomplet). Après
  // une fiche autrement exploitable, ces champs ne justifient pas à eux
  // seuls une bannière persistante sur chaque navigation.
  const advisory = new Set(["date de diffusion", "nombre d'épisodes"]);
  return state.missing.every(field => advisory.has(String(field || "")));
}
function needsAnimeImage(a, options = {}) {
  const opts = (options && typeof options === "object") ? options : {};
  const tags = animeAutoTags(a);
  const imageWasMarked = tags.includes("image introuvable auto");
  return !!(a?.title && !isAutoCompletionExcluded(a, opts) && (opts.forceWaiting===true||!resolutionWaitingCurrent(a)) && (opts.includeMarked === true || opts.retryMarked === true || !imageWasMarked) && !hasDisplayImage(a));
}
function needsAnimeRelations(a, options = {}) {
  const opts = (options && typeof options === "object") ? options : {};
  return !!(a?.title && !isAutoCompletionExcluded(a, opts) && a.malId && !a.relations?.length);
}

// ── COMPLETE ALL EN UNE SEULE PASSE : infos + images + relations ──
// ── COMPLETE-ALL : progress en temps réel ──
const _completeAllJobs = {};
const completionInfoUpdates=new WeakMap();
function resolutionFingerprint(a){return require('./lib/library-automation').hash([a.malId||'',a.betaseriesSeriesId||a.betaseriesId||'',a.betaseriesEpisode||'',a.episodesTotal||'',a.unallocatedEpisodes||0,a.manualSeasonNumber||a.betaseriesSeason||0,a.importIdentityReview||false,animeCompletionSignature(a)]);}
function resolutionWaitingCurrent(a){
 const state=a?.resolutionAssessment;if(!state||state.fingerprint!==resolutionFingerprint(a))return false;
 if(state.resolverVersion!==57)return false;
 const signature=db.getMetadataTitleSignature();return signature?state.catalogueSignature===signature:state.catalogueRevision===db.getMetadataRevision();
}
function assessCompletionWaiting(anime,job){
 if(anime.importIdentityReview||progressReconciliation.acknowledged(anime))return;
 const hasGap=Number(anime.unallocatedEpisodes)>0,provisional=importIntegrity.provisional(anime),family=String(anime.betaseriesSeriesId||anime.betaseriesId||'');
 const root=family&&readAnimes().find(a=>a.malId&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&Number(a.betaseriesSeason||1)===1);
 if(provisional&&root){
  let row=db.getMetadataByMalId(root.malId),logical=1;
  for(let i=0;row&&i<100&&logical<Number(anime.manualSeasonNumber||anime.betaseriesSeason);i++){
   const result=localSeasonLinks.findNext(row,localSeasonSearch,{explain:true});if(result?.choices?.length>1)return;
   if(!result?.row)break;if(!result.proof.split)logical++;row=result.row;
  }
 }
 const metadataKnown=!!anime.malId&&!provisional;
 if((hasGap&&hasUsefulAnimeInfo(anime))||(provisional&&root)||(metadataKnown&&!animeFullCompleteness(anime).complete)){
  anime.resolutionAssessment={resolverVersion:57,kind:hasGap?'source-gap':provisional?'season-source-wait':'metadata-source-wait',fingerprint:resolutionFingerprint(anime),sourcePosition:anime.betaseriesEpisode||'',episodes:Number(anime.unallocatedEpisodes)||0,catalogueSignature:db.getMetadataTitleSignature(),catalogueRevision:db.getMetadataRevision(),checkedAt:new Date().toISOString(),nextCheckAt:Date.now()+(!hasGap&&job.relationsUnavailable?30*60*1000:24*60*60*1000)};
  if(provisional&&root)anime.seriesReference={status:'provisional',rootMalId:Number(root.malId),sourceSeason:Number(anime.manualSeasonNumber||anime.betaseriesSeason),part:0};
  anime.needsSequelCheck=false;anime.progressWarning='';
  anime.tags=(anime.tags||[]).filter(t=>!/^(?:non trouvé auto|progression à vérifier|suite probable|image introuvable auto)$/.test(t));
 }else if(!hasGap&&!provisional&&animeFullCompleteness(anime).complete)delete anime.resolutionAssessment;
}
function completionInfoSignature(anime){
 const fields=['title','canonicalTitle','malId','anilistId','type','episodesTotal','startDate','endDate','synopsis','genres','themes','demographics','studios','producers','studio','publicScore','rank','popularity','members','malUrl','englishTitle','rating','duration','trailer'];
 return JSON.stringify(fields.map(key=>{const value=anime?.[key];return value==null?'':typeof value==='object'?value:String(value);}));
}
function recordCompletionInfoUpdate(job,before,anime){
 if(before===completionInfoSignature(anime))return;
 let ids=completionInfoUpdates.get(job);if(!ids){ids=new Set();completionInfoUpdates.set(job,ids);}ids.add(String(anime.id));job.updatedInfos=ids.size;
}
function completionIssueItems(animes=readAnimes()){
 return animes.map(anime=>{
  const state=animeFullCompleteness(anime),progress=Number(anime.unallocatedEpisodes)>0&&!progressReconciliation.acknowledged(anime);
  if(state.excluded||resolutionWaitingCurrent(anime)||(state.complete&&!progress))return null;
  const missing=[...state.missing,...(progress?['progression importée']:[])];
  const kind=anime.importIdentityReview?'identity':missing.includes('saison importée')?'season':progress?'progress':'metadata';
  return {id:anime.id,title:anime.title,kind,missing,identityReview:!!anime.importIdentityReview,poster:anime.poster||anime.imageUrl||'',checkedAt:anime.autoCompletionCheckedAt||null,sourcePosition:anime.betaseriesEpisode||'',unallocated:Number(anime.unallocatedEpisodes)||0,episodesTotal:anime.episodesTotal||'',malId:anime.malId||''};
 }).filter(Boolean);
}
function completionAwaitingItems(animes=readAnimes()) {
 return animes.map(anime=>({anime,state:animeFullCompleteness(anime)}))
  .filter(({anime,state})=>!state.excluded && (resolutionWaitingCurrent(anime)||(state.complete && state.awaiting?.length)))
  .map(({anime,state})=>({id:anime.id,title:anime.title,kind:anime.resolutionAssessment?.kind||'unpublished',missing:resolutionWaitingCurrent(anime)?(anime.resolutionAssessment.kind==='source-gap'?['progression importée']:anime.resolutionAssessment.kind==='season-source-wait'?['saison importée']:state.missing):state.awaiting,sourcePosition:anime.betaseriesEpisode||'',unallocated:Number(anime.unallocatedEpisodes)||0,nextCheckAt:anime.resolutionAssessment?.nextCheckAt||null}));
}
function finishCompletionCounts(job,targets){
 const ids=new Set(targets.map(a=>String(a.id))),current=readAnimes().filter(a=>ids.has(String(a.id)));
 job.failed=current.filter(a=>hasCompletionIssue(a,job.kind)).length;
 job.incomplete=current.filter(a=>!hasUsefulAnimeInfo(a)).length;
 job.successful=current.length-job.failed;
 job.waiting=current.filter(resolutionWaitingCurrent).length;
 const previouslyIncomplete=new Set(job.resolutionTargetIds||targets.map(a=>Number(a.id)));
 job.resolved=current.filter(a=>previouslyIncomplete.has(Number(a.id))&&!hasCompletionIssue(a,job.kind)&&!resolutionWaitingCurrent(a)).length;
 job.successful=job.resolved;
 job.remainingDecisions=job.failed;
}


function newCompletionJob(kind = "complete-all") {
  return {
    kind,
    status: "running",
    cancelRequested: false,
    done: 0,
    total: 0,
    current: "",
    updatedInfos: 0,
    updatedImages: 0,
    updatedRelations: 0,
    failed: 0,
    incomplete: 0,
    successful: null,
    startedAt: Date.now(),
    finishedAt: null
  };
}

function completionJobId(kind = "job") {
  return `${Date.now()}-${kind}-${Math.random().toString(36).slice(2, 8)}`;
}

function finishCompletionJob(job, status, error = "") {
  if (!job) return;
  job.status = status;
  job.current = "";
  job.finishedAt = Date.now();
  if (error) job.error = error;
  if(job.processedIds?.length){const ids=new Set(job.processedIds);job.completedIds=readAnimes().filter(a=>ids.has(Number(a.id))).map(a=>[Number(a.id),resolutionFingerprint(a)]);}
  if(job.id)automation.checkpoint(job.id,job);
}

function completionJobCancelled(job) {
  return !!job?.cancelRequested;
}

function hasCompletionIssue(anime, kind = "complete-all") {
  if(resolutionWaitingCurrent(anime))return false;
  if (kind === "images-only") return !hasDisplayImage(anime);
  const actual = animeFullCompleteness(anime);
  return !actual.complete||(Number(anime.unallocatedEpisodes)>0&&!progressReconciliation.acknowledged(anime));
}

function countCompletionIssues(animes, targets, kind = "complete-all") {
  const targetIds = new Set((Array.isArray(targets) ? targets : []).map(item => String(item?.id ?? "")));
  return (Array.isArray(animes) ? animes : []).reduce((count, anime) => {
    if (!targetIds.has(String(anime?.id ?? ""))) return count;
    return count + (hasCompletionIssue(anime, kind) ? 1 : 0);
  }, 0);
}

function cleanupCompletionJobs() {
  const now = Date.now();
  for (const [id, job] of Object.entries(_completeAllJobs)) {
    if (!job || !job.finishedAt) continue;
    if (now - job.finishedAt > 60 * 60 * 1000) delete _completeAllJobs[id];
  }
}

function activeCompletionJobEntry() {
  return Object.entries(_completeAllJobs)
    .filter(([, job]) => job && ["queued", "running", "cancelling"].includes(job.status))
    .sort((a, b) => Number(b[1].startedAt || 0) - Number(a[1].startedAt || 0))[0] || null;
}

function rejectWhenCompletionJobIsActive(res) {
  const active = activeCompletionJobEntry();
  if (!active) return false;
  const [jobId, job] = active;
  res.status(409).json({
    error: "Une complétion de bibliothèque est déjà en cours.",
    activeJobId: jobId,
    activeJobKind: job.kind || "complete-all",
    activeJobStatus: job.status || "running"
  });
  return true;
}

async function preflightCompletionRelations(animes, targets, job) {
  job.phase='relations';job.current='Vérification des liens de saisons';
  const familyIds=new Set(targets.map(a=>String(a.betaseriesSeriesId||a.betaseriesId||'')).filter(Boolean));
  const targetIds=new Set(targets.map(a=>Number(a.id)));
  const families=animes.filter(a=>a.malId&&Number(a.betaseriesSeason||1)===1&&(targetIds.has(Number(a.id))||familyIds.has(String(a.betaseriesSeriesId||a.betaseriesId||''))))
   .filter(a=>!nextVerifiedLocalSeason(db.getMetadataByMalId(a.malId)));
  const relationCache=await readJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE,{});
  const preflight=await betaSeriesResolveRelationLayer(families.map(a=>a.malId),relationCache,{deadlineAt:Date.now()+12000,jikanFallbackLimit:0,batchConcurrency:2,shouldStop:()=>completionJobCancelled(job),onProgress:info=>{job.relationDone=info.resolved||0;job.relationTotal=info.requested||0;job.current='Sources de saisons — '+job.relationDone+'/'+job.relationTotal;}});
  await writeJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE,relationCache);
  job.relationsUnavailable=preflight.unavailable===true;
}
function completionLocalOnly(job,anime) {
  // A failed relation provider does not prevent exact-ID metadata requests.
  return job.relationsUnavailable===true && (importIntegrity.provisional(anime)||Number(anime?.unallocatedEpisodes)>0);
}
async function executeCompleteAll(req,res){
  const overwrite = req.body?.overwrite === true;
  const retryMarked = req.body?.retryMarked === true;
  cleanupCompletionJobs();
  if (!req.body?._automationId && rejectWhenCompletionJobIsActive(res)) return;
  const jobId = req.body?._automationId || completionJobId("complete-all");
  _completeAllJobs[jobId] = {...newCompletionJob("complete-all"),id:jobId};
  res.json({ ok: true, jobId, kind: "complete-all" }); // Réponse immédiate — le job tourne en arrière-plan

  (async () => {
    const job = _completeAllJobs[jobId];
    try {
      await db.prepareMetadataTitleIndex();
      const animes = readAnimes();
      const targets = animes.filter(a => {
        if (!a?.title) return false;
        if (overwrite) return true;
        const exact=a.malId?db.getMetadataByMalId(a.malId):null;
        const needsTitle=exact?.title&&a.title!==exact.title&&!Object.values(a.localizedTitles||{}).includes(a.title);
        return needsTitle || needsAnimeInfo(a, { retryMarked }) || needsAnimeImage(a, { retryMarked });
      });

      job.total = targets.length;
      job.resolutionTargetIds=targets.filter(a=>!animeFullCompleteness(a).complete||(Number(a.unallocatedEpisodes)>0&&!progressReconciliation.acknowledged(a))).map(a=>Number(a.id));
      if (!targets.length) { finishCompletionJob(job, "done"); return; }

      await preflightCompletionRelations(animes,targets,job);

      await runWithConcurrency(targets, 2, async (anime) => {
        if (completionJobCancelled(job)) return;
        const idx = animes.findIndex(a => Number(a.id) === Number(anime.id));
        if (idx < 0) return;
        job.current = anime.title;
        const infoBefore=completionInfoSignature(animes[idx]);

        try {
          let found = null;
          // Action globale : même logique élargie que le bouton Infos auto d'une carte
          try { found = await lookupAnimeInfoForCard(animes[idx], anime.title, { timeoutMs: 17000, localMinScore: 55,localOnly:completionLocalOnly(job,animes[idx]) }); } catch {}

          if (found) {
            mergeAutoInfo(animes[idx], found, overwrite);
            if (found.imageUrl && !String(animes[idx].imageUrl || "").trim()) animes[idx].imageUrl = found.imageUrl;
            clearAutoCompletionUnresolved(animes[idx]);
            job.updatedRelations+=await recoverVerifiedBetaSeriesOverflow(animes[idx],found,{localOnly:job.relationsUnavailable});
            if (found.source === "TVMaze" || found.nonAnimeFallback) markTvmazeFallback(animes[idx]);
            // Image — malId direct = plus fiable
            if (!String(animes[idx].poster || "").trim()) {
              const mId = animes[idx].malId || found.malId || null;
              const imgUrl = found.imageUrl || await searchBestImageUrl(anime.title, mId);
              if (imgUrl) {
                if (!String(animes[idx].imageUrl || "").trim()) animes[idx].imageUrl = imgUrl;
                try {
                  const localPath = await downloadImage(imgUrl, anime.title);
                  if (localPath) { animes[idx].poster = localPath; job.updatedImages++; }
                  clearAutoImageUnresolved(animes[idx]);
                } catch {
                  // L'URL distante reste affichable dans l'interface même si la copie locale échoue.
                  clearAutoImageUnresolved(animes[idx]);
                  job.updatedImages++;
                }
              } else {
                markAutoImageUnresolved(animes[idx]);
              }
            }
            // Relations
            if (!job.relationsUnavailable && animes[idx].malId && !animes[idx].relations?.length) {
              try {
                const rels = await getRelations(animes[idx].malId);
                if (rels?.length) { animes[idx].relations = rels; job.updatedRelations++; }
              } catch {}
            }
          } else {
            // Image seule sans infos
            if (!String(animes[idx].poster || "").trim()) {
              try {
                const imgUrl = await searchBestImageUrl(anime.title, animes[idx].malId || null);
                if (imgUrl) {
                  animes[idx].imageUrl = imgUrl;
                  try {
                    const localPath = await downloadImage(imgUrl, anime.title);
                    if (localPath) animes[idx].poster = localPath;
                    clearAutoImageUnresolved(animes[idx]);
                    job.updatedImages++;
                  } catch {
                    clearAutoImageUnresolved(animes[idx]);
                    job.updatedImages++;
                  }
                } else markAutoImageUnresolved(animes[idx]);
              } catch { markAutoImageUnresolved(animes[idx]); }
            }
            markAutoCompletionUnresolved(animes[idx]);
            job.failed++;
          }
        } catch (err) {
          const alreadyUnresolved = animeAutoTags(animes[idx]).includes("non trouvé auto");
          markAutoCompletionUnresolved(animes[idx]);
          if (!alreadyUnresolved) job.failed++;
          console.error("[complete-all]", anime.title, err.message);
        }

        const currentAfterAttempt = animes[idx];
        assessCompletionWaiting(currentAfterAttempt,job);
        recordCompletionInfoUpdate(job,infoBefore,currentAfterAttempt);
        currentAfterAttempt.autoCompletionCheckedAt = new Date().toISOString();
        currentAfterAttempt.autoCompletionMissing = animeFullCompleteness(currentAfterAttempt).missing || [];
        currentAfterAttempt.autoCompletionSignature = animeCompletionSignature(currentAfterAttempt);
        if(anime.verifiedSeriesSeason)automation.rememberSeason(anime);
        job.done++;
        if (job.done % 4 === 0) writeCompletionAnimes(animes);
        await yieldToEventLoop();
      }, () => completionJobCancelled(job));

      if (completionJobCancelled(job)) {
        job.failed = countCompletionIssues(animes, targets, job.kind);
        writeCompletionAnimes(animes);
        finishCompletionJob(job, "cancelled");
        return;
      }

      const failedAnimes = targets.filter(a => {
        const idx = animes.findIndex(x => Number(x.id) === Number(a.id));
        if (idx < 0) return false;
        const current = animes[idx];
        return !current.malId && !String(current.synopsis || "").trim();
      });

      if (!completionJobCancelled(job) && !job.relationsUnavailable && failedAnimes.length > 0) {
        const initialDone = job.done;
        job.phase = "second-pass";
        job.current = `2ème passe : ${failedAnimes.length} animé(s) restant(s)...`;
        job.total = initialDone + failedAnimes.length;
        await runWithConcurrency(failedAnimes, 2, async (anime) => {
          if (completionJobCancelled(job)) return;
          const idx = animes.findIndex(x => Number(x.id) === Number(anime.id));
          if (idx < 0) return;
          const infoBefore=completionInfoSignature(animes[idx]);
          job.current = `2ème passe : ${anime.title}`;
          try {
            const found = await lookupAnimeInfoForCard(animes[idx], anime.title, { timeoutMs: 25000, localMinScore: 0, skipCache: false });
            if (found) {
              const wasUnresolved = animeAutoTags(animes[idx]).includes("non trouvé auto");
              mergeAutoInfo(animes[idx], found, overwrite);
              if (found.imageUrl && !String(animes[idx].imageUrl || "").trim()) animes[idx].imageUrl = found.imageUrl;
              clearAutoCompletionUnresolved(animes[idx]);
              if (wasUnresolved) job.failed = Math.max(0, job.failed - 1);
              if (!String(animes[idx].poster || "").trim()) {
                const imgUrl = found.imageUrl || await searchBestImageUrl(anime.title, animes[idx].malId || found.malId || null);
                if (imgUrl) {
                  animes[idx].imageUrl = imgUrl;
                  try {
                    const localPath = await downloadImage(imgUrl, anime.title);
                    if (localPath) animes[idx].poster = localPath;
                    clearAutoImageUnresolved(animes[idx]);
                    job.updatedImages++;
                  } catch {
                    clearAutoImageUnresolved(animes[idx]);
                    job.updatedImages++;
                  }
                }
              }
              if (animes[idx].malId && !animes[idx].relations?.length) {
                try {
                  const rels = await getRelations(animes[idx].malId);
                  if (rels?.length) { animes[idx].relations = rels; job.updatedRelations++; }
                } catch {}
              }
            } else {
              const alreadyUnresolved = animeAutoTags(animes[idx]).includes("non trouvé auto");
              markAutoCompletionUnresolved(animes[idx]);
              if (!alreadyUnresolved) job.failed++;
            }
          } catch (error) {
            const alreadyUnresolved = animeAutoTags(animes[idx]).includes("non trouvé auto");
            markAutoCompletionUnresolved(animes[idx]);
            if (!alreadyUnresolved) job.failed++;
          }
          recordCompletionInfoUpdate(job,infoBefore,animes[idx]);
          animes[idx].autoCompletionCheckedAt = new Date().toISOString();
          Object.assign(animes[idx], viewing.completeEpisodes(animes[idx], db.getMetadataByMalId(animes[idx].malId)));
          animes[idx].autoCompletionMissing = animeFullCompleteness(animes[idx]).missing || [];
          animes[idx].autoCompletionSignature = animeCompletionSignature(animes[idx]);
          job.done++;
          if (job.done % 10 === 0) writeCompletionAnimes(animes);
        }, () => completionJobCancelled(job));
      }

      writeCompletionAnimes(animes);
      finishCompletionCounts(job,targets);
      if (completionJobCancelled(job)) finishCompletionJob(job, "cancelled");
      else finishCompletionJob(job, "done");
    } catch (err) {
      if (completionJobCancelled(job)) finishCompletionJob(job, "cancelled");
      else finishCompletionJob(job, "error", err.message);
    }
  })();
}

// Polling, reprise et annulation des jobs de complétion.
app.get("/api/bulk/complete-all/progress/:jobId", (req, res) => {
  const job = _completeAllJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: "Job introuvable" });
  const end = job.finishedAt || Date.now();
  const elapsed = Math.max(0, Math.round((end - (job.startedAt || end)) / 1000));
  const rate = elapsed > 0 && job.done > 0 ? job.done / elapsed : 0;
  const remaining = job.status === "running" && rate > 0 && job.total > job.done
    ? Math.round((job.total - job.done) / rate)
    : null;
  const percent = job.status==='done'?100:job.phase==='relations'?5:job.total>0?Math.min(95,10+Math.round(job.done/job.total*85)):0;
  res.json({ ...job, elapsed, percent, estimatedRemainingSeconds: remaining });
});

app.get("/api/bulk/active-job", (req, res) => {
  cleanupCompletionJobs();
  const active = activeCompletionJobEntry();
  if (!active) return res.json({ active: false });
  const [jobId, job] = active;
  res.json({ active: true, jobId, job });
});

app.post("/api/bulk/complete-all/cancel/:jobId", (req, res) => {
  const job = _completeAllJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: "Job introuvable" });
  if(automation.cancel(req.params.jobId)){finishCompletionJob(job,'cancelled');return res.json({ok:true,status:'cancelled'});}
  if (!["running", "cancelling"].includes(job.status)) {
    return res.json({ ok: true, alreadyFinished: true, status: job.status });
  }
  job.cancelRequested = true;
  job.status = "cancelling";
  job.current = job.current || "Arrêt après l’élément en cours…";
  res.json({ ok: true, status: job.status });
});

// ── INFOS + IMAGES UTILES : le bouton "Compléter les infos" complète les
// métadonnées et télécharge aussi la jaquette quand elle est trouvée avec la fiche.
// Le bouton "Télécharger les images" reste utile pour retenter uniquement les images.
async function executeInfoCompletion(req,res){
  const requestedIds=req.body?.ids;
  if(requestedIds!==undefined&&(!Array.isArray(requestedIds)||!requestedIds.length||requestedIds.length>10000||requestedIds.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<=0)))return res.status(400).json({error:'Sélection de fiches invalide.'});
  const selectedIds=requestedIds===undefined?null:new Set(requestedIds.map(Number));
  const resumeCompleted=new Map(req.body?._resumeCompleted||[]);
  const overwrite = req.body?.overwrite === true;
  const retryMarked = req.body?.retryMarked === true;
  cleanupCompletionJobs();
  if (!req.body?._automationId && rejectWhenCompletionJobIsActive(res)) return;
  const jobId = req.body?._automationId || completionJobId("info-images");
  _completeAllJobs[jobId] = {...newCompletionJob("info-images"),id:jobId,scopeIds:requestedIds||[]};
  res.json({ ok: true, jobId, kind: "info-images" });

  (async () => {
    const job = _completeAllJobs[jobId];
    try {
      await db.prepareMetadataTitleIndex();
      const animes = readAnimes();
      const targets = animes.filter(a => {
        if (!a?.title) return false;
        if(resumeCompleted.get(Number(a.id))===resolutionFingerprint(a))return false;
        if(selectedIds&&!selectedIds.has(Number(a.id)))return false;
        if(selectedIds&&resolutionWaitingCurrent(a))return true;
        if (overwrite) return true;
        // Ne pas inclure les relations dans ce bouton : les relations servent surtout
        // aux nouvelles saisons et rendaient la complétion globale inutilement lente.
        return needsAnimeInfo(a, { retryMarked }) || needsAnimeImage(a, { retryMarked });
      });

      job.total = targets.length;
      job.resolutionTargetIds=targets.filter(a=>!animeFullCompleteness(a).complete||(Number(a.unallocatedEpisodes)>0&&!progressReconciliation.acknowledged(a))).map(a=>Number(a.id));
      if (!targets.length) { finishCompletionJob(job, "done"); return; }

      job.failed = countCompletionIssues(animes, targets, job.kind);

      await preflightCompletionRelations(animes,targets,job);

      await runWithConcurrency(targets, 2, async (anime) => {
        if (completionJobCancelled(job)) return;
        const idx = animes.findIndex(a => Number(a.id) === Number(anime.id));
        if (idx < 0) return;
        const currentAnime = animes[idx];
        const hadIssue = hasCompletionIssue(currentAnime, job.kind);
        const infoBefore=completionInfoSignature(currentAnime);
        const infoWasMissing = overwrite || needsAnimeInfo(currentAnime, { retryMarked: true,forceWaiting:!!selectedIds });
        const imageWasMissing = needsAnimeImage(currentAnime, { retryMarked: true,forceWaiting:!!selectedIds });
        job.phase='metadata';job.current = currentAnime.title;

        let found = null;
        try {
          found = await lookupAnimeInfoForCard(currentAnime, currentAnime.title, { timeoutMs: 14000, localMinScore: 55,requireImage:imageWasMissing,localOnly:completionLocalOnly(job,currentAnime) });
        } catch (error) {
          console.error("[info-images:lookup]", currentAnime.title, error.message);
        }

        if (found) {
          if (infoWasMissing) {
            mergeAutoInfo(currentAnime, found, overwrite);
            clearAutoCompletionUnresolved(currentAnime);
            if (found.source === "TVMaze" || found.nonAnimeFallback) markTvmazeFallback(currentAnime);
          }
          if (found.imageUrl && !String(currentAnime.imageUrl || "").trim()) currentAnime.imageUrl = found.imageUrl;
          job.updatedRelations+=await recoverVerifiedBetaSeriesOverflow(currentAnime,found,{localOnly:job.relationsUnavailable});
        } else if (infoWasMissing && !hasUsefulAnimeInfo(currentAnime)) {
          markAutoCompletionUnresolved(currentAnime);
        }

        if (imageWasMissing) {
          job.phase='images';
          let imgUrl = String(currentAnime.imageUrl || found?.imageUrl || "").trim();
          if (!imgUrl) {
            try {
              imgUrl = (await findBestImageUrlForAnimeCard(currentAnime,currentAnime.title)).imageUrl;
            } catch (error) {
              console.error("[info-images:image]", currentAnime.title, error.message);
            }
          }

          if (imgUrl) {
            currentAnime.imageUrl = imgUrl;
            try {
              const localPath = await downloadImage(imgUrl, currentAnime.title);
              if (localPath) currentAnime.poster = localPath;
              clearAutoImageUnresolved(currentAnime);
              job.updatedImages++;
            } catch (error) {
              // L'URL distante reste utilisable même si la copie locale échoue.
              clearAutoImageUnresolved(currentAnime);
              job.updatedImages++;
              console.warn("[info-images:download]", currentAnime.title, error.message);
            }
          } else {
            markAutoImageUnresolved(currentAnime);
          }
        }

        recordCompletionInfoUpdate(job,infoBefore,currentAnime);
        const hasIssue = hasCompletionIssue(currentAnime, job.kind);
        assessCompletionWaiting(currentAnime,job);
        currentAnime.autoCompletionCheckedAt = new Date().toISOString();
        currentAnime.autoCompletionMissing = hasIssue ? animeFullCompleteness(currentAnime).missing : [];
        currentAnime.autoCompletionSignature = animeCompletionSignature(currentAnime);
        if (hadIssue !== hasIssue) job.failed = Math.max(0, job.failed + (hasIssue ? 1 : -1));
        if(currentAnime.verifiedSeriesSeason)automation.rememberSeason(currentAnime);
        job.processedIds=[...(job.processedIds||[]),Number(currentAnime.id)];
        job.done++;
        if(job.done%4===0){writeCompletionAnimes(animes);const ids=new Set(job.processedIds);job.completedIds=animes.filter(a=>ids.has(Number(a.id))).map(a=>[Number(a.id),resolutionFingerprint(a)]);}
        await yieldToEventLoop();
      }, () => completionJobCancelled(job));

      writeCompletionAnimes(animes);
      finishCompletionCounts(job,targets);
      if (completionJobCancelled(job)) finishCompletionJob(job, "cancelled");
      else finishCompletionJob(job, "done");
    } catch (err) {
      if (completionJobCancelled(job)) finishCompletionJob(job, "cancelled");
      else finishCompletionJob(job, "error", err.message);
    }
  })();
}

// Diagnostic : ce qui manque dans la bibliothèque
app.get("/api/bulk/smart-status", (req, res) => {
  try {
    const animes = readAnimes();
    const runningEntries = Object.entries(_completeAllJobs || {})
      .filter(([, job]) => job && ["queued", "running", "cancelling"].includes(job.status))
      .sort((a, b) => Number(b[1].startedAt || 0) - Number(a[1].startedAt || 0));
    const runningJobs = runningEntries.length;
    const activeEntry = runningEntries[0] || null;
    const bannerMode = String(req.query?.mode || "").toLowerCase() === "banner";
    const retryCooldownMs = 7 * 24 * 60 * 60 * 1000;
    const checkedRecently = anime => {
      if (!bannerMode) return false;
      const checkedAt = Date.parse(String(anime?.autoCompletionCheckedAt || ""));
      return Number.isFinite(checkedAt) && Date.now() - checkedAt < retryCooldownMs;
    };
    const alreadyTriedSameState = anime => bannerMode && autoCompletionAttemptIsCurrent(anime);
    // Une saison BetaSeries provisoire (ex. Hell Mode S2 7/12) est une fiche
    // volontairement conservée en attendant son rattachement officiel. Elle ne
    // doit pas faire croire que toute la bibliothèque est incomplète.
    const provisionalSeason = anime => bannerMode && isBetaSeriesProvisionalSeasonForBanner(anime);
    const deferredFromBanner = anime => checkedRecently(anime) || alreadyTriedSameState(anime) || provisionalSeason(anime);
    const needsInfo = anime => needsAnimeInfo(anime)
      && !deferredFromBanner(anime)
      && !(bannerMode && isMinorCompletionGapForBanner(anime));
    const needsImage = anime => needsAnimeImage(anime) && !deferredFromBanner(anime);
    const needsRelation = needsAnimeRelations;
    const missingInfo  = animes.filter(needsInfo);
    const missingImage = animes.filter(needsImage);
    const missingRel   = animes.filter(needsRelation);
    const needsAny     = animes.filter(a => needsInfo(a) || needsImage(a));
    const missingBoth  = animes.filter(a => needsInfo(a) && needsImage(a));
    const deferredRecent = bannerMode ? animes.filter(a => deferredFromBanner(a) && (needsAnimeInfo(a) || needsAnimeImage(a))) : [];
    const avgSec = db?.isReady?.() && db?.getMetadataCount?.() > 0 ? 0.65 : 2.2;
    const estimated = Math.round(needsAny.length * avgSec);
    res.json({
      total: animes.length,
      missingInfo:  missingInfo.length,
      missingImage: missingImage.length,
      missingRelations: missingRel.length,
      missingBoth: missingBoth.length,
      needsCount: needsAny.length,
      needsWork: needsAny.length > 0,
      excludedAuto: animes.filter(isAutoCompletionExcluded).length,
      imageUnresolved: animes.filter(a => animeAutoTags(a).includes("image introuvable auto")).length,
      deferredRecent: deferredRecent.length,
      deferredSameState: bannerMode ? animes.filter(a => alreadyTriedSameState(a) && (needsAnimeInfo(a) || needsAnimeImage(a))).length : 0,
      retryCooldownHours: bannerMode ? 168 : 0,
      estimatedSeconds: estimated,
      estimatedMinutes: Math.max(1, Math.ceil(estimated / 60)),
      runningJobs,
      completionRunning: runningJobs > 0,
      activeJobId: activeEntry ? activeEntry[0] : "",
      activeJobKind: activeEntry ? activeEntry[1].kind || "complete-all" : "",
      activeJobStatus: activeEntry ? activeEntry[1].status || "running" : ""
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/bulk/complete-fast", async (req, res) => {

  try {
    const animes = readAnimes();
    const workers = almTurboWorkerCount(readConfig().workerMode || "turbo");
    let updated = 0;
    await almTurboQueue(animes, workers, async (anime) => {
      if (!anime?.title) return null;
      const found = await almDbLookupAnime(anime.title);
      if (!found) return null;
      const index = animes.findIndex(a => Number(a.id) === Number(anime.id));
      if (index >= 0) {
        animes[index] = mergeImportedAnime(animes[index], found, false);
        updated++;
      }
      return found;
    });
    writeCompletionAnimes(animes);
    res.json({ ok: true, updated, workers });
  } catch (error) {
    res.status(500).json({ error: "Complétion rapide impossible : " + error.message });
  }
});


app.post("/api/bulk/images-turbo", async (req, res) => {
  try {
    const animes = readAnimes();
    const missing = animes.filter(a => !a.poster);
    const workers = almTurboWorkerCount(readConfig().workerMode || "turbo");
    let updated = 0;
    await almTurboQueue(missing, workers, async (anime) => {
      const imageUrl = (await findBestImageUrlForAnimeCard(anime,anime.title)).imageUrl;
      if (!imageUrl) return null;
      const index = animes.findIndex(a => Number(a.id) === Number(anime.id));
      if (index >= 0) {
        animes[index].poster = imageUrl;
        updated++;
      }
      return imageUrl;
    });
    writeCompletionAnimes(animes);
    res.json({ ok: true, updated, workers, total: missing.length });
  } catch (error) {
    res.status(500).json({ error: "Téléchargement turbo images impossible : " + error.message });
  }
});

app.post("/api/bulk/images-fast", async (req, res) => {
  try {
    const animes = readAnimes();
    const missing = animes.filter(a => !a.poster);
    const workers = almTurboWorkerCount(readConfig().workerMode || "turbo");
    let updated = 0;
    await almTurboQueue(missing, workers, async (anime) => {
      const imageUrl = (await findBestImageUrlForAnimeCard(anime,anime.title)).imageUrl;
      if (!imageUrl) return null;
      const index = animes.findIndex(a => Number(a.id) === Number(anime.id));
      if (index >= 0) {
        animes[index].poster = imageUrl;
        updated++;
      }
      return imageUrl;
    });
    writeCompletionAnimes(animes);
    res.json({ ok: true, updated, workers, total: missing.length });
  } catch (error) {
    res.status(500).json({ error: "Téléchargement images rapide impossible : " + error.message });
  }
});

app.post("/api/bulk/missing-images", async (req, res) => {
  try {
    const animes = await readAnimesAsync();
    const missing = animes.filter(a => !String(a.poster || "").trim());
    let success = 0;
    let failed = 0;
    let done = 0;

    await runWithConcurrency(missing, 5, async (anime) => {
      try {
        const imageUrl = await searchImageFallbackAll(anime.title);
        if (imageUrl) {
          const localPath = await downloadImage(imageUrl, anime.title);
          if (localPath) { anime.poster = localPath; success++; }
          else failed++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.error("Image manquante:", anime.title, error.message);
      } finally {
        done++;
      }
    });

    writeCompletionAnimes(animes);
    res.json({ ok: true, total: missing.length, success, failed, done });
  } catch (error) {
    res.status(500).json({ error: "Téléchargement des images impossible : " + error.message });
  }
});



app.post("/api/bulk/refresh-one", async (req, res) => {
  const id = Number(req.body?.id);
  const overwrite = req.body?.overwrite === true;
  const animes = readAnimes();
  const anime = animes.find(a => Number(a.id) === id);
  if (!anime) return res.status(404).json({ error: "Anime introuvable." });

  try {
    const found = await lookupAnimeInfoForCard(anime, anime.title, { timeoutMs: 17000, localMinScore: 55 });
    if (found) {
      mergeAutoInfo(anime, found, overwrite);
      if (anime.malId && !anime.relations?.length) anime.relations = await getRelations(anime.malId);
    }

    if (!anime.poster) {
      const lookup = await findBestImageUrlForAnimeCard(anime, anime.title);
      const imageUrl = lookup.imageUrl || found?.imageUrl || "";
      if (imageUrl) anime.poster = await downloadImage(imageUrl, anime.title);
    }

    writeCompletionAnimes(animes);
    return res.json({ ok: true, success: Boolean(found || anime.poster), anime, source: found?.source || "auto" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




function seasonNewsSameItem(a, b) {
  const aId = String(a?.malId || "").trim();
  const bId = String(b?.malId || "").trim();
  if (aId && bId) return aId === bId;
  const at = normalizeTitle(a?.title || a?.sequelTitle || a?.name || "");
  const bt = normalizeTitle(b?.title || b?.sequelTitle || b?.name || "");
  return !!(at && bt && at === bt);
}
function linkSeasonFamily(item,library){
 if(!item.sourceTitle)return {};
 const source=library.find(a=>item.sourceAnimeId&&Number(a.id)===Number(item.sourceAnimeId))||library.find(a=>item.sourceMalId&&String(a.malId)===String(item.sourceMalId))||collectionIdentity.find({title:item.sourceTitle},library);
 if(!source||source.seriesSeparate)return {};
 const verifiedTvSequel=/^(tv|ona)$/i.test(item.type||'') && Number(item.malId)>0 && (source.relations||[]).some(r=>/^sequel$/i.test(r.relation||'')&&(r.entry||[]).some(e=>e.type==='anime'&&Number(e.mal_id||e.malId)===Number(item.malId)));
 if(!['direct_sequel','split_cour'].includes(item.seasonClass)&&!verifiedTvSequel)return {};
 const root=source.seriesGroupTitle||source.seriesRootTitle||require('./public/series-state').slot(source).base||source.title;
 const slot=require('./public/series-state').slot({title:item.title});
 source.seriesGroupTitle=root;
 return {seriesGroupTitle:root,seriesRootTitle:root,previousSeasonId:source.id,manualSeasonNumber:slot.number||(require('./public/series-state').slot(source).number||1)+(item.seasonClass==='split_cour'?0:1),partNumber:slot.part||0};
}
let _lastSeasonBulkAdd = null;

function removeSeasonNewsItemsFromCache(addedItems) {
  const added = Array.isArray(addedItems) ? addedItems : [];
  if (!added.length) return readNewsResults();
  const remaining = readNewsResults().filter(cached => !added.some(item => seasonNewsSameItem(cached, item)));
  writeNewsResults(remaining);
  return remaining;
}

app.post("/api/news/add-all-to-watchlist", (req, res) => {
  try {
    const animes = readAnimes();
    let news = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!news.length) news = readNewsResults();
    if (!Array.isArray(news)) news = [];

    const existingTitles = new Set(animes.map(a => normalizeTitle(a.title)).filter(Boolean));
    const existingMalIds = new Set(animes.map(a => String(a.malId || "")).filter(Boolean));
    let added = 0;
    const acceptedItems = [];
    const addedAnimeIds = [];

    for (const item of news) {
      const title = item.title || item.name || item.officialTitle;
      if (!title) continue;
      const key = normalizeTitle(title);
      const malKey = String(item.malId || "");
      if (collectionIdentity.find({...item,title},animes)) continue;

      const newId = nextId(animes);
      animes.push({
        id: newId,
        ...linkSeasonFamily(item,animes),
        title,
        status: "Plan to Watch",
        type: item.type || "TV",
        score: "",
        episodesSeen: "0",
        episodesTotal: item.episodesTotal || item.episodes || "",
        startDate: item.startDate || "",
        endDate: item.endDate || "",
        genres: item.genres || [],
        tags: item.defaultSelected === true || item.seasonClass === "direct_sequel"
          ? ["nouvelle saison"]
          : ["contenu lié", String(item.seasonClassLabel || "à vérifier")],
        notes: item.sourceTitle ? `Suite liée à : ${item.sourceTitle}${item.relation ? " • " + item.relation : ""}` : (item.relation ? `Suite liée à : ${item.relation}` : "Ajouté depuis Nouvelles saisons."),
        poster: item.poster && String(item.poster).startsWith("/images/") ? item.poster : "",
        imageUrl: item.imageUrl || "",
        publicScore: item.publicScore || "",
        malUrl: item.malUrl || item.url || "",
        malId: item.malId || "",
        synopsis: item.synopsis || "",
        rank: item.rank || ""
      });
      existingTitles.add(key);
      if (malKey) existingMalIds.add(malKey);
      acceptedItems.push(item);
      addedAnimeIds.push(newId);
      added++;
    }

    writeAnimes(animes);
    // Après un ajout en masse, filtrer le cache avec la bibliothèque mise à jour.
    // Cela évite que les mêmes suites réapparaissent au prochain clic sur Saisons.
    removeSeasonNewsItemsFromCache(news);
    const remaining = filterSeasonNewsItemsForLibrary(readNewsResults(), animes);
    writeNewsResults(remaining);
    const operationId = addedAnimeIds.length ? `season-add-${Date.now()}-${Math.random().toString(36).slice(2,7)}` : "";
    if (operationId) {
      _lastSeasonBulkAdd = { operationId, ids: addedAnimeIds, items: acceptedItems, createdAt: Date.now() };
    }
    res.json({ ok: true, added, total: news.length, remaining: remaining.length, operationId });
  } catch (error) {
    res.status(500).json({ error: "Import des nouvelles saisons impossible : " + error.message });
  }
});

app.post("/api/news/undo-last-add", (req, res) => {
  try {
    const operationId = String(req.body?.operationId || "");
    const op = _lastSeasonBulkAdd;
    if (!op || !operationId || op.operationId !== operationId || Date.now() - op.createdAt > 15 * 60 * 1000) {
      return res.status(409).json({ error: "Aucun ajout récent réversible n'est disponible." });
    }
    const idSet = new Set(op.ids.map(Number));
    const animes = readAnimes();
    const kept = animes.filter(a => !idSet.has(Number(a.id)));
    const removed = animes.length - kept.length;
    writeAnimes(kept);
    const restoredNews = filterSeasonNewsItemsForLibrary([...(readNewsResults() || []), ...(op.items || [])], kept);
    writeNewsResults(restoredNews);
    _lastSeasonBulkAdd = null;
    res.json({ ok: true, removed, news: restoredNews });
  } catch (error) {
    res.status(500).json({ error: "Annulation de l'ajout impossible : " + error.message });
  }
});

app.post("/api/news/detail-one", async (req, res) => {
  const item = req.body || {};

  try {
    const details = await searchNewsDetailsAllMethods(item);

    if (!details) {
      return res.json({ ok: true, success: false, item });
    }

    res.json({ ok: true, success: true, item: details });
  } catch (error) {
    console.error("News detail-one error:", error.message);
    res.json({ ok: true, success: false, item });
  }
});

app.post("/api/bulk/refresh-info", async (req, res) => {
  try {
    await db.whenReady();
    const overwrite = req.body?.overwrite === true;
    const animes = await readAnimesAsync();
    const targets = animes.filter(anime => {
      if (!anime?.title) return false;
      if (overwrite) return true;
      return !(anime.malId && String(anime.synopsis || "").trim() && anime.episodesTotal);
    });

    let success = 0;
    let failed = 0;
    let skipped = animes.length - targets.length;
    let done = 0;

    await runWithConcurrency(targets, 3, async (anime) => {
      try {
        const found = await lookupAnimeInfoForCard(anime, anime.title, { timeoutMs: 17000, localMinScore: 55 });
        if (found) {
          mergeAutoInfo(anime, found, overwrite);
          clearAutoCompletionUnresolved(anime);
          if (found.source === "TVMaze" || found.nonAnimeFallback) markTvmazeFallback(anime);
          if (!anime.poster) {
            const lookup = await findBestImageUrlForAnimeCard(anime, anime.title);
            const imgUrl = lookup.imageUrl || found.imageUrl || "";
            if (imgUrl) {
              const localPath = await downloadImage(imgUrl, anime.title);
              if (localPath) { anime.poster = localPath; clearAutoImageUnresolved(anime); }
              else markAutoImageUnresolved(anime);
            }
          }
          if (anime.malId && !anime.relations?.length) {
            try { anime.relations = await getRelations(anime.malId); } catch {}
          }
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.error("Infos non trouvées:", anime.title, error.message);
      } finally {
        done++;
      }
    });

    writeCompletionAnimes(animes);
    res.json({ ok: true, total: animes.length, checked: targets.length, skipped, success, failed, done });
  } catch (error) {
    res.status(500).json({ error: "Refresh infos impossible : " + error.message });
  }
});




function ensureAliasFiles() {
  fs.mkdirSync(path.join(DATA_DIR, "cache"), { recursive: true });
  if (!fs.existsSync(ALIASES_FILE)) {
    fs.writeFileSync(ALIASES_FILE, JSON.stringify({ version: 1, updatedAt: null, items: {} }, null, 2), "utf8");
  }
  if (!fs.existsSync(MATCHING_CACHE_FILE)) {
    fs.writeFileSync(MATCHING_CACHE_FILE, JSON.stringify({}, null, 2), "utf8");
  }
  if (!fs.existsSync(LAST_ALIAS_SYNC_FILE)) {
    fs.writeFileSync(LAST_ALIAS_SYNC_FILE, JSON.stringify({ updatedAt: null }, null, 2), "utf8");
  }
}

function readAliases() {
  ensureAliasFiles();
  try {
    const data = JSON.parse(fs.readFileSync(ALIASES_FILE, "utf8"));
    if (!data.items) data.items = {};
    return data;
  } catch {
    return { version: 1, updatedAt: null, items: {} };
  }
}

function writeAliases(data) {
  ensureAliasFiles();
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: data?.items || {}
  };
  fs.writeFileSync(ALIASES_FILE, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function normalizeAliasKey(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasIsTrusted(alias) {
  if (!alias || typeof alias !== "object") return false;
  if (alias.source === "manual" || alias.aliasSource === "manual") return true;
  if (alias.verifiedAnime === true || alias.mediaKind === "anime") return true;
  if (Number(alias.malId || 0) > 0 || Number(alias.anilistId || 0) > 0) return true;
  const source = String(alias.sourceDetail || alias.source || "");
  return /localmetadata|jikan|myanimelist|anilist/i.test(source) && Number(alias.confidence || 0) >= 90;
}

function getAliasMatch(title) {
  const aliases = readAliases();
  const key = normalizeAliasKey(title);
  const alias = aliases.items[key] || null;
  return aliasIsTrusted(alias) ? alias : null;
}

function saveAliasMatch(sourceTitle, anime) {
  if (!sourceTitle || !anime || !anime.title) return null;
  const evidence = mediaClassifier.animeEvidence(sourceTitle, anime);
  if (!evidence.strong) return null;
  const advertised=seasonResolver.titleSlot(sourceTitle),official=seasonResolver.titleSlot(anime.officialTitle||anime.romajiTitle||anime.title);
  if(advertised.season&&advertised.season!==official.season&&!anime.verifiedSeriesSeason)return null;
  if(advertised.part&&advertised.part!==official.part)return null;
  const aliases = readAliases();
  const key = normalizeAliasKey(sourceTitle);
  aliases.items[key] = {
    sourceTitle,
    animeTitle: anime.officialTitle||anime.romajiTitle||anime.title,
    malId: anime.malId || "",
    malUrl: anime.malUrl || "",
    imageUrl: anime.imageUrl || "",
    type: anime.type || "",
    publicScore: anime.publicScore || "",
    genres: anime.genres || [],
    confidence: anime.matchingScore || 100,
    source: "auto",
    sourceDetail: anime.source || "",
    verifiedAnime: true,
    mediaKind: "anime",
    updatedAt: new Date().toISOString()
  };
  return writeAliases(aliases);
}

function saveManualAliasMatch(sourceTitle, anime) {
  const source = String(sourceTitle || "").trim();
  const target = String(anime?.title || "").trim();
  if (!source || !target) return null;
  const aliases = readAliases();
  aliases.items[normalizeAliasKey(source)] = {
    sourceTitle: source,
    animeTitle: target,
    malId: anime?.malId || "",
    anilistId: anime?.anilistId || "",
    malUrl: anime?.malUrl || "",
    imageUrl: anime?.imageUrl || anime?.poster || "",
    type: anime?.type || "",
    publicScore: anime?.publicScore || "",
    genres: Array.isArray(anime?.genres) ? anime.genres : [],
    confidence: 100,
    source: "manual",
    aliasSource: "manual",
    sourceDetail: "choix explicite dans le contrôle anime",
    verifiedAnime: true,
    mediaKind: "anime",
    updatedAt: new Date().toISOString()
  };
  return writeAliases(aliases);
}

function removeAliasMatch(sourceTitle) {
  const aliases = readAliases();
  const key = normalizeAliasKey(sourceTitle);
  delete aliases.items[key];
  return writeAliases(aliases);
}

function aliasToFound(alias) {
  if (!alias) return null;
  if(alias.malId){const canonical=db.getMetadataByMalId(alias.malId);if(canonical)return metadataToFound(canonical,alias.sourceTitle,alias.confidence||100);}
  return {
    title: alias.animeTitle,
    officialTitle: alias.animeTitle,
    malId: alias.malId || "",
    malUrl: alias.malUrl || "",
    imageUrl: alias.imageUrl || "",
    type: alias.type || "TV",
    publicScore: alias.publicScore || "",
    genres: alias.genres || [],
    matchingScore: alias.confidence || 100,
    source: alias.sourceDetail || "LocalMetadata",
    verifiedAnime: true,
    mediaKind: "anime"
  };
}

// Variantes de titres enrichies : gère les titres français/multi-langues
function lightweightTitleVariants(title) {
  const base = String(title || "").trim();

  // Normalisation : supprimer articles français, remplacer caractères spéciaux
  const noArticle = base.replace(/^(Le |La |Les |L'|Un |Une |Des )/i, "").trim();
  const noParens  = base.replace(/\([^)]*\)/g, " ").trim();
  const noPunct   = base.replace(/[:\-–—].*$/, " ").trim();
  const noSeason  = base.replace(/\b(Season|Saison|Part|Partie|TV|Movie|Film|OVA|ONA|Special)\b.*$/i, "").trim();

  // Traductions FR→EN les plus courantes
  const frToEn = {
    "attaque des titans": "attack on titan",
    "l'attaque des titans": "attack on titan",
    "mon héros academia": "my hero academia",
    "académie des super-héros": "my hero academia",
    "une pièce": "one piece",
    "les chevaliers du zodiaque": "saint seiya",
    "naruto shippuden": "naruto shippuden",
    "fullmetal alchemist": "fullmetal alchemist brotherhood",
    "demon slayer": "kimetsu no yaiba",
    "jujutsu kaisen": "jujutsu kaisen",
    "sword art online": "sword art online",
    "hunter x hunter": "hunter x hunter",
    "tokyo ghoul": "tokyo ghoul",
    "death note": "death note",
    "dragon ball super": "dragon ball super"
  };

  const normalized = base.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const translated = frToEn[normalized] || null;

  return [...new Set([
    base,
    noArticle !== base ? noArticle : null,
    noParens  !== base ? noParens  : null,
    noPunct   !== base ? noPunct   : null,
    noSeason  !== base ? noSeason  : null,
    translated
  ].filter(Boolean))];
}

// Recherche AniList (meilleur support multilingue que Jikan)
async function searchAniList(title) {
  const query = `query($s:String){Media(search:$s,type:ANIME){id idMal type format countryOfOrigin title{romaji english native}synonyms coverImage{large}episodes averageScore genres description(asHtml:false)siteUrl status}}`;
  try {
    const res = await aniListFetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { s: title } })
    });
    if (!res.ok) return null;
    const json = await res.json();
    const m = json?.data?.Media;
    if (!m) return null;
    const officialTitle = m.title?.english || m.title?.romaji || title;
    const score = Math.max(
      fuzzyScore(title, officialTitle),
      fuzzyScore(title, m.title?.romaji || ""),
      fuzzyScore(title, m.title?.native || "")
    );
    return {
      title,
      officialTitle,
      romajiTitle: m.title?.romaji || "",
      englishTitle: m.title?.english || "",
      title_japanese: m.title?.native || "",
      synonyms: Array.isArray(m.synonyms) ? m.synonyms : [],
      type: m.format || "",
      format: m.format || "",
      countryOfOrigin: m.countryOfOrigin || "",
      episodesTotal: m.episodes ? String(m.episodes) : "",
      publicScore: m.averageScore ? String(m.averageScore / 10) : "",
      genres: m.genres || [],
      synopsis: (m.description || "").replace(/<[^>]+>/g, ""),
      imageUrl: m.coverImage?.large || "",
      malUrl: m.idMal ? `https://myanimelist.net/anime/${m.idMal}` : (m.siteUrl || ""),
      malId: m.idMal || "",
      anilistId: m.id || "",
      matchingScore: score,
      source: "AniList"
    };
  } catch { return null; }
}


function minimumAcceptableMatchScoreForTitle(title) {
  const normalized = normalizeForCompare(title);
  if (!normalized) return 100;
  const words = normalized.split(" ").filter(Boolean);
  if (normalized.length <= 3) return 98;
  if (words.length === 1 && normalized.length <= 6) return 90;
  if (/^\d+%?$/.test(normalized)) return 98;
  if (/\b\d{4}\b/.test(String(title || ""))) return 78;
  if (words.length <= 2) return 72;
  return 62;
}

async function searchAnimeSmart(title, options = {}) {
  let best = null;
  let bestScore = 0;

  // 1) SQL local : instantané, zéro API. Si exact, on évite tout appel réseau.
  const metadataFound = options.forceOnline ? null : searchMetadataLocal(title);
  if (metadataFound && Number(metadataFound.matchingScore || 0) >= 96) return metadataFound;

  // 2) Chercher Jikan ET AniList en parallèle.
  const [jikanRes, anilistRes] = await Promise.allSettled([
    withTimeout(searchJikan(title), 8000),
    withTimeout(searchAniList(title), 6000)
  ]);

  for (const found of [
    metadataFound,
    jikanRes.status === "fulfilled" ? jikanRes.value : null,
    anilistRes.status === "fulfilled" ? anilistRes.value : null
  ]) {
    if (!found) continue;
    const score = Number(found.matchingScore || 0) ||
      Math.max(
        fuzzyScore(title, found.officialTitle || ""),
        fuzzyScore(title, found.title || ""),
        fuzzyScore(title, found.englishTitle || ""),
        fuzzyScore(title, found.romajiTitle || "")
      );
    found.matchingScore = score;
    if (score > bestScore) { best = found; bestScore = score; }
  }

  return best;
}

async function searchAnimeWithAliases(title) {
  const alias = getAliasMatch(title);
  if (alias) {
    const found = aliasToFound(alias);
    found.aliasSource = "local";
    return found;
  }

  const variants = lightweightTitleVariants(title);
  let best = null;
  let bestScore = 0;

  for (const variant of variants) {
    try {
      const found = typeof searchAnimeSmart === "function"
        ? await searchAnimeSmart(variant)
        : await withTimeout(searchJikan(variant), 8000);

      if (!found) continue;

      let score = Number(found.matchingScore || 0);
      if (!score && typeof similarityScore === "function") {
        score = Math.max(
          similarityScore(title, found.officialTitle || ""),
          similarityScore(title, found.title || ""),
          similarityScore(title, found.englishTitle || ""),
          similarityScore(title, found.romajiTitle || "")
        );
      }

      if (!score && typeof fuzzyScore === "function") {
        score = Math.max(
          fuzzyScore(title, found.officialTitle || ""),
          fuzzyScore(title, found.title || "")
        );
      }

      found.matchingScore = score;

      if (score > bestScore) {
        best = found;
        bestScore = score;
      }

      if (score >= 90) break;
    } catch {}
  }

  const acceptScore = minimumAcceptableMatchScoreForTitle(title);
  if (best && bestScore >= acceptScore) {
    saveAliasMatch(title, best);
    return best;
  }

  return null;
}

async function refreshAliasCacheFromLibrary() {
  const animes = readAnimes();
  const aliases = readAliases();

  // Retirer les anciens alias créés à partir d'entrées BetaSeries/TVMaze non
  // confirmées. Sans cela, une série live action déjà importée pouvait devenir
  // sa propre « preuve anime » lors de l'import suivant.
  for (const [key, alias] of Object.entries(aliases.items || {})) {
    if ((alias?.source === "library" || alias?.source === "auto") && !aliasIsTrusted(alias)) {
      delete aliases.items[key];
    }
  }

  let aliasScanIndex = 0;
  for (const anime of animes) {
    aliasScanIndex += 1;
    if (aliasScanIndex % 12 === 0) await yieldToEventLoop();
    if (!anime.title) continue;
    const classification = mediaClassifier.classifyLibraryEntry(anime, metadataMatchForMediaReview(anime));
    if (classification.classification !== "anime") continue;
    const trusted = Boolean(
      anime.mediaKind === "anime" || anime.verifiedAnime === true || Number(anime.malId || 0) > 0 ||
      (Array.isArray(anime.tags) && anime.tags.some(tag => mediaClassifier.normalizeMediaTitle(tag) === "anime confirme manuellement"))
    );
    if (!trusted) continue;
    const key = normalizeAliasKey(anime.title);
    aliases.items[key] = {
      sourceTitle: anime.title,
      animeTitle: anime.title,
      malId: anime.malId || "",
      malUrl: anime.malUrl || "",
      imageUrl: anime.imageUrl || "",
      type: anime.type || "",
      publicScore: anime.publicScore || "",
      genres: anime.genres || [],
      confidence: 100,
      source: "library",
      sourceDetail: anime.malId ? "MyAnimeList" : "validation manuelle",
      verifiedAnime: true,
      mediaKind: "anime",
      updatedAt: new Date().toISOString()
    };
  }

  const saved = writeAliases(aliases);
  fs.writeFileSync(LAST_ALIAS_SYNC_FILE, JSON.stringify({ updatedAt: saved.updatedAt, count: Object.keys(saved.items).length }, null, 2), "utf8");
  return saved;
}


function csvSplitLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}


function normalizeAdvancedTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  a = normalizeAdvancedTitle(a);
  b = normalizeAdvancedTitle(b);

  const matrix = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function fuzzyScore(a, b) {
  const aa = normalizeAdvancedTitle(a);
  const bb = normalizeAdvancedTitle(b);

  if (!aa || !bb) return 0;
  if (aa === bb) return 100;
  if ((aa.includes(bb) || bb.includes(aa)) && Math.min(aa.length, bb.length) >= 5) return 92;

  const distance = levenshteinDistance(aa, bb);
  const maxLength = Math.max(aa.length, bb.length);

  return Math.max(0, Math.round((1 - distance / maxLength) * 100));
}

// searchAnimeSmart : voir définition ligne 1260 (Jikan + AniList parallèle)
function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = csvSplitLine(lines[0]).map(h => h.trim());
  const rows = [];

  for (const line of lines.slice(1)) {
    const values = csvSplitLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] == null ? "" : String(values[index]).trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseBetaSeriesEpisode(value) {
  const match = String(value || "").match(/S(\d+)E(\d+)/i);
  if (!match) return { season: "", episode: "" };
  return { season: Number(match[1]) || "", episode: Number(match[2]) || "" };
}

function normalizeForCompare(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(a, b) {
  const aa = normalizeForCompare(a);
  const bb = normalizeForCompare(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 100;
  if ((aa.includes(bb) || bb.includes(aa)) && Math.min(aa.length, bb.length) >= 5) return 82;

  const aw = new Set(aa.split(" ").filter(w => w.length > 2));
  const bw = new Set(bb.split(" ").filter(w => w.length > 2));
  if (!aw.size || !bw.size) return 0;

  let common = 0;
  for (const w of aw) if (bw.has(w)) common++;
  return Math.round((common / Math.max(aw.size, bw.size)) * 100);
}


function numberOrZero(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function uniqueNoteLines(...values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    for (const raw of String(value || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const key = line.replace(/\s+/g, " ").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out.join("\n");
}

function appendUniqueNote(notes, line) {
  const old=require('./lib/notebook-model').notes(notes);return old.split('\n').some(v=>v.trim()===String(line||'').trim())?old:[old,line].filter(Boolean).join('\n');
}

function betaseriesWatchedCount(row) {
  const ep = parseBetaSeriesEpisode(row.episode);
  const rawEpisode = numberOrZero(ep.episode);
  const season = numberOrZero(ep.season);
  const remaining = numberOrZero(row.remaining);
  const status = numberOrZero(row.status);

  // A completion percentage is never an episode count or an overflow sentinel.

  // Saison > 1 : BetaSeries donne le N° dans la saison, pas le cumul global
  // On retourne un objet enrichi pour que applyBetaSeriesProgressLogic puisse décider
  if (season > 1 && rawEpisode > 0) {
    return { episodesSeen: rawEpisode, season, isMultiSeason: true };
  }

  return rawEpisode;
}

function applyBetaSeriesProgressLogic(anime, row, found) {
  const copy = { ...anime };
  const watchedRaw = betaseriesWatchedCount(row);
  const total = numberOrZero(copy.episodesTotal || found?.episodesTotal || found?.episodes || 0);
  const remaining = numberOrZero(row.remaining);
  const status = numberOrZero(row.status);

  // Cas multi-saison : S02E02 → l'utilisateur a continué sur la saison 2
  if (watchedRaw && typeof watchedRaw === "object" && watchedRaw.isMultiSeason) {
    copy.episodesSeen = String(total || watchedRaw.episodesSeen);
    if (total) copy.episodesTotal = String(total);
    copy.status = "Completed";
    copy.tags = Array.from(new Set([...(copy.tags || []), "suite probable", "multi-saison"]));
    const note = `BetaSeries : saison ${watchedRaw.season} épisode ${watchedRaw.episodesSeen} → anime de saison 1 marqué terminé. Chercher la suite.`;
    copy.notes = copy.notes ? copy.notes + "\n" + note : note;
    copy.needsSequelCheck = true;
    copy.betaseriesMultiSeason = true;
    copy.progressWarning = `Progression multi-saison détectée (S${watchedRaw.season}E${watchedRaw.episodesSeen}).`;
    return copy;
  }

  const watched = typeof watchedRaw === "number" ? watchedRaw : 0;

  if (watched) copy.episodesSeen = String(watched);
  if (total) copy.episodesTotal = String(total);

  if ((total && watched >= total) || status >= 100 || (String(row.remaining ?? "").trim() !== "" && remaining === 0)) {
    if (status >= 100 && total && watched <= total) copy.episodesSeen = String(total);
    copy.status = "Completed";
  }

  // Overflow : S01E13 pour une série de 11 épisodes
  if (total && watched > total) {
    copy.status = "Completed";
    copy.episodesSeen = String(total);
    copy.tags = Array.from(new Set([...(copy.tags || []), "suite probable"]));
    const overflow = watched - total;
    const note = `BetaSeries indique ${watched}/${total} épisodes vus. Corrigé en ${total}/${total}. Suite probable : ${overflow} épisode(s) au-delà de la fiche détectée.`;
    copy.notes = appendUniqueNote(copy.notes, note);
    copy.betaseriesOriginalProgress = copy.betaseriesOriginalProgress || `${watched}/${total}`;
    copy.betaseriesOverflowEpisodes = overflow;
    copy.needsSequelCheck = true;
    copy.progressWarning = "Progression corrigée : suite probable.";
  }

  return copy;
}

function buildAnimeFromBetaSeries(row, found, classification = "review", tvmaze = null) {
  const title = row.title || found?.title || "";
  const ep = parseBetaSeriesEpisode(row.episode);
  const rawStatus = String(row.status || "").replace(",", ".");
  const statusValue = Number(rawStatus);
  const hasRemaining = row.remaining !== undefined && row.remaining !== null && String(row.remaining).trim() !== "";
  const completed = statusValue >= 100 || (hasRemaining && Number(row.remaining) === 0);

  const anime = {
    title,
    status: completed ? "Completed" : "Watching",
    type: classification === "non_anime" ? (tvmaze?.type || "TV") : (found?.type || ""),
    score: "",
    episodesSeen: ep.episode ? String(ep.episode) : "",
    episodesTotal: found?.episodesTotal || "",
    startDate: found?.startDate || tvmaze?.premiered || "",
    endDate: found?.endDate || tvmaze?.ended || "",
    genres: classification === "non_anime" ? (tvmaze?.genres || []) : (found?.genres || []),
    tags: Array.from(new Set([
      "BetaSeries",
      ...(classification === "anime" ? [] : ["à vérifier"]),
      ...(classification === "non_anime" ? ["TVMaze", "hors anime probable"] : []),
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
    rank: found?.rank || "",
    popularity: found?.popularity || "",
    members: found?.members || "",
    malUrl: found?.malUrl || "",
    synopsis: found?.synopsis || "",
    malId: found?.malId || "",
    betaseriesId: row.id || "",
    betaseriesEpisode: row.episode || "",
    betaseriesStatus: row.status || "",
    mediaKind: classification === "anime" ? "anime" : "",
    verifiedAnime: classification === "anime"
  };

  if (!found && !anime.tags.includes("à vérifier")) anime.tags.push("à vérifier");
  return anime;
}



function clampEpisodesSeenToTotal(anime) {
  const copy = { ...anime };
  const seen = numberOrZero(copy.episodesSeen);
  const total = numberOrZero(copy.episodesTotal);
  copy.notes = require('./lib/notebook-model').notes(copy.notes);
  if (seen && total && seen >= total && !copy.seasonStatusExplicit && !["Dropped"].includes(String(copy.status || "")) && !(seen===total && copy.status==='Watching' && copy.completionPending===true)) {
    copy.status = "Completed";
  }
  if (seen && total && seen > total && !copy.episodesSeenExplicit) {
    const overflow = seen - total;
    copy.status = "Completed";
    copy.episodesSeen = String(total);
    copy.tags = Array.from(new Set([...(copy.tags || []), "suite probable"]));
    copy.betaseriesOriginalProgress = copy.betaseriesOriginalProgress || `${seen}/${total}`;
    const note = `Progression corrigée automatiquement : BetaSeries indiquait ${seen}/${total}. La fiche est passée en ${total}/${total}. ${overflow} épisode(s) sont probablement une suite.`;
    copy.notes = appendUniqueNote(copy.notes, note);
    copy.betaseriesOverflowEpisodes = Math.max(numberOrZero(copy.betaseriesOverflowEpisodes), overflow);
    copy.needsSequelCheck = true;
    copy.progressWarning = "Progression corrigée : suite probable.";
  }
  return copy;
}
function readFastCache() {
  try {
    fs.mkdirSync(path.join(DATA_DIR, "cache"), { recursive: true });
    const file = path.join(DATA_DIR, "cache", "betaseries-fast-cache.json");
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}", "utf8");
    return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch { return { file: null, data: {} }; }
}
function writeFastCache(cache) {
  try { if (cache.file) fs.writeFileSync(cache.file, JSON.stringify(cache.data || {}, null, 2), "utf8"); } catch {}
}
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const n = i++;
      results[n] = await worker(items[n], n);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, Math.max(1, items.length))}, run));
  return results;
}


function normalizedProgressFromBetaSeries(anime, row, found) {
  const copy = { ...anime };
  const seen = Number(copy.episodesSeen || 0);
  const total = Number(copy.episodesTotal || found?.episodesTotal || found?.episodes || 0);
  if (seen && total && seen >= total && !copy.seasonStatusExplicit && !copy.episodesSeenExplicit && !["Dropped"].includes(String(copy.status || "")) && !(seen===total && copy.status==='Watching' && copy.completionPending===true)) {
    copy.status = "Completed";
  }
  if (seen && total && seen > total && !copy.episodesSeenExplicit) {
    const overflow = seen - total;
    copy.episodesSeen = String(total);
    copy.status = "Completed";
    copy.tags = Array.from(new Set([...(copy.tags || []), "suite probable"]));
    copy.betaseriesOverflowEpisodes = overflow;
    copy.needsSequelCheck = true;
    copy.progressWarning = `Progression corrigée : ${seen}/${total} devient ${total}/${total}. Suite probable (${overflow} épisode(s)).`;
    const note = `Import BetaSeries : progression ${seen}/${total} corrigée en ${total}/${total}. ${overflow} épisode(s) indiquent probablement une suite ou saison liée.`;
    copy.notes = appendUniqueNote(copy.notes, note);
  }
  return copy;
}


// V1.1.11 task queue + cache + BetaSeries reconciliation
function almWorkerCount(mode = "normal") {
  let cpu = 4;
  try { cpu = Math.max(2, require("os").cpus()?.length || 4); } catch {}
  if (mode === "prudent") return 3;
  if (mode === "rapide") return Math.min(cpu, 8);
  return Math.min(cpu, 5);
}

async function almRunQueue(items, workers, worker, onProgress = null) {
  const results = new Array(items.length);
  let index = 0;
  let done = 0;
  async function runner(id) {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      if (onProgress) onProgress(done, items.length, `workers ${workers} — ${item?.title || item?.name || ""}`);
      try { results[i] = await worker(item, i, id); }
      catch (error) { results[i] = { error: error.message, item }; }
      done++;
      if (onProgress) onProgress(done, items.length, `workers ${workers} — ${item?.title || item?.name || ""}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, items.length || 1)) }, (_, i) => runner(i + 1)));
  return results;
}

function almCache(name) {
  fs.mkdirSync(path.join(DATA_DIR, "cache"), { recursive: true });
  const file = path.join(DATA_DIR, "cache", name);
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}", "utf8");
    return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch { return { file, data: {} }; }
}

function almSaveCache(cache) {
  try { fs.writeFileSync(cache.file, JSON.stringify(cache.data || {}, null, 2), "utf8"); } catch {}
}

function almKey(title) {
  try {
    if (typeof normalizeAliasKey === "function") return normalizeAliasKey(title || "");
    return normalizeTitle(title || "");
  } catch {
    return String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
}

async function almCachedAnime(title) {
  const cache = almCache("anime-lookup-cache.json");
  const key = almKey(title);
  if (cache.data[key]) return cache.data[key].value || null;
  let found = null;
  try {
    if (typeof searchAnimeWithAliases === "function") found = await searchAnimeWithAliases(title);
    else if (typeof searchAnimeSmart === "function") found = await searchAnimeSmart(title);
    else found = await withTimeout(searchJikan(title), 6500);
  } catch {}
  if (!found) { try { found = await searchBetaSeriesShow(title); } catch {} }
  cache.data[key] = { value: found, updatedAt: new Date().toISOString() };
  almSaveCache(cache);
  return found;
}

async function almCachedImage(title) {
  const cache = almCache("image-lookup-cache.json");
  const key = almKey(title);
  if (cache.data[key]) return cache.data[key].value || "";
  let image = "";
  try {
    if (typeof searchImageFallbackAll === "function") image = await searchImageFallbackAll(title);
    else image = await searchBestImageUrl(title);
  } catch {}
  cache.data[key] = { value: image || "", updatedAt: new Date().toISOString() };
  almSaveCache(cache);
  return image || "";
}

function almNormalizeProgress(anime, row, found) {
  const copy = { ...anime };
  const seen = Number(copy.episodesSeen || 0);
  const total = Number(copy.episodesTotal || found?.episodesTotal || found?.episodes || 0);
  if (total && seen >= total) copy.status = "Completed";
  if (total && seen > total) {
    const overflow = seen - total;
    copy.episodesSeen = String(total);
    copy.episodesTotal = String(total);
    copy.status = "Completed";
    copy.tags = Array.from(new Set([...(copy.tags || []), "suite probable"]));
    copy.betaseriesOverflowEpisodes = overflow;
    copy.needsSequelCheck = true;
    copy.progressWarning = `Progression BetaSeries ${seen}/${total} répartie : cette fiche devient ${total}/${total}.`;
    copy.notes = (copy.notes || "") + `\nBetaSeries indiquait ${seen}/${total}. ${overflow} épisode(s) doivent être rattachés à une suite.`;
  }
  return copy;
}

function almExpandOverflowItems(items) {
  const out = [];
  for (const item of items || []) {
    const anime = item.anime || item;
    if (!anime?.title) continue;
    const total = Number(anime.episodesTotal || 0);
    const overflow = Number(anime.betaseriesOverflowEpisodes || 0);
    out.push(item);
    if (total && overflow > 0) {
      out.push({
        ...item,
        anime: {
          ...anime,
          id: undefined,
          title: `${anime.title} — suite probable`,
          status: "Plan to Watch",
          episodesSeen: "0",
          episodesTotal: "?",
          poster: "",
          tags: Array.from(new Set([...(anime.tags || []), "suite probable", "à vérifier"])),
          notes: `Suite probable créée automatiquement. ${overflow} épisode(s) BetaSeries non rattaché(s) à la fiche précédente.`,
          progressWarning: `Suite probable à vérifier : ${overflow} épisode(s).`
        }
      });
    }
  }
  return out;
}


// V1.1.12 Turbo architecture
const TURBO_MAX_WORKERS = 20;
const TURBO_CACHE_VERSION = 1;

function almTurboWorkerCount(mode = "turbo") {
  let cpu = 4;
  try { cpu = Math.max(2, require("os").cpus()?.length || 4); } catch {}
  if (mode === "prudent") return 3;
  if (mode === "normal") return Math.min(cpu, 5);
  if (mode === "rapide") return Math.min(cpu * 2, 8);
  return TURBO_MAX_WORKERS;
}

async function almTurboQueue(items, workers, worker, onProgress = null) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const total = items.length;

  async function runner(id) {
    while (cursor < total) {
      const index = cursor++;
      const item = items[index];
      const label = item?.title || item?.name || item?.sourceTitle || item?.anime?.title || String(item || "");
      if (onProgress) onProgress(done, total, `turbo ${workers} workers — ${label}`);
      try {
        results[index] = await worker(item, index, id);
      } catch (error) {
        results[index] = { error: error.message, item };
      }
      done++;
      if (onProgress) onProgress(done, total, `turbo ${workers} workers — ${label}`);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, total || 1)) }, (_, i) => runner(i + 1)));
  return results;
}

function almTurboCacheFile(name) {
  fs.mkdirSync(path.join(DATA_DIR, "cache"), { recursive: true });
  return path.join(DATA_DIR, "cache", name);
}

function almTurboReadCache(name) {
  const file = almTurboCacheFile(name);
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}", "utf8");
    return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { file, data: {} };
  }
}

function almTurboWriteCache(cache) {
  try { if (cache?.file) fs.writeFileSync(cache.file, JSON.stringify(cache.data || {}, null, 2), "utf8"); } catch {}
}

function almTurboKey(title) {
  try {
    if (typeof normalizeAliasKey === "function") return normalizeAliasKey(title || "");
    return normalizeTitle(title || "");
  } catch {
    return String(title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
}

function almReadAliasBase() {
  // En Electron, DATA_DIR pointe vers le dossier utilisateur. Charger d'abord
  // les alias livrés avec l'application, puis laisser les décisions utilisateur
  // les surcharger. Sans ce chemin embarqué, une installation fraîche ignorait
  // les alias seedés dans data/aliases-anime.json.
  const files = [
    path.join(__dirname, "data", "aliases-anime.json"),
    path.join(DATA_DIR, "aliases-anime.json"),
    path.join(DATA_DIR, "aliases.json")
  ];
  const merged = {};
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      Object.assign(merged, data.items || {});
    } catch {}
  }
  return merged;
}

function almAliasHit(title) {
  const aliases = almReadAliasBase();
  const key = almTurboKey(title);
  return aliases[key] || null;
}

function almAliasToFound(alias, title) {
  if (!alias) return null;
  if (alias.source === "non-anime-review") {
    return {
      title: alias.animeTitle || title,
      officialTitle: alias.animeTitle || title,
      type: "",
      matchingScore: alias.confidence || 20,
      source: "AliasBaseReview"
    };
  }
  return {
    title: alias.animeTitle || title,
    officialTitle: alias.animeTitle || title,
    type: alias.type || "TV",
    malId: alias.malId || "",
    malUrl: alias.malUrl || "",
    imageUrl: alias.imageUrl || "",
    genres: alias.genres || [],
    matchingScore: alias.confidence || 100,
    aliasSource: "local-giant",
    source: "AliasBase"
  };
}

async function almTurboAnimeLookup(title, options = {}) {
  const key = almTurboKey(title);
  const cache = almTurboReadCache("anime-lookup-cache.json");
  if (cache.data[key] && !options.force) return cache.data[key].value || null;

  const alias = almAliasHit(title);
  if (alias && !options.force) {
    const foundAlias = almAliasToFound(alias, title);
    cache.data[key] = { value: foundAlias, from: "alias", updatedAt: new Date().toISOString(), version: TURBO_CACHE_VERSION };
    almTurboWriteCache(cache);
    return foundAlias;
  }

  let found = null;
  try {
    if (typeof searchAnimeWithAliases === "function") found = await searchAnimeWithAliases(title);
    else if (typeof searchAnimeSmart === "function") found = await searchAnimeSmart(title);
    else found = await withTimeout(searchJikan(title), 4500);
  } catch {}

  if (!found) { try { found = await searchBetaSeriesShow(title); } catch {} }

  cache.data[key] = { value: found || null, from: found ? "api" : "none", updatedAt: new Date().toISOString(), version: TURBO_CACHE_VERSION };
  almTurboWriteCache(cache);
  return found || null;
}

async function almTurboImageLookup(title, options = {}) {
  const key = almTurboKey(title);
  const cache = almTurboReadCache("image-lookup-cache.json");
  if (cache.data[key] && !options.force) return cache.data[key].value || "";

  let image = "";
  try {
    const found = await almTurboAnimeLookup(title);
    image = found?.imageUrl || found?.poster || "";
  } catch {}

  if (!image) {
    try {
      if (typeof searchImageFallbackAll === "function") image = await searchImageFallbackAll(title);
      else image = await searchBestImageUrl(title);
    } catch {}
  }

  cache.data[key] = { value: image || "", updatedAt: new Date().toISOString(), version: TURBO_CACHE_VERSION };
  almTurboWriteCache(cache);
  return image || "";
}

function almProgressNumbers(anime, row, found) {
  const seen = Number(String(anime.episodesSeen || "0").replace(",", "."));
  const total = Number(String(anime.episodesTotal || found?.episodesTotal || found?.episodes || "0").replace(",", "."));
  return { seen: Number.isFinite(seen) ? seen : 0, total: Number.isFinite(total) ? total : 0 };
}

function almReconcileProgress(anime, row, found) {
  const copy = { ...anime };
  const { seen, total } = almProgressNumbers(copy, row, found);

  if (total && seen >= total) copy.status = "Completed";

  if (total && seen > total) {
    const overflow = seen - total;
    copy.episodesSeen = String(total);
    copy.episodesTotal = String(total);
    copy.status = "Completed";
    copy.tags = Array.from(new Set([...(copy.tags || []), "suite probable"]));
    copy.betaseriesOriginalProgress = `${seen}/${total}`;
    copy.betaseriesOverflowEpisodes = overflow;
    copy.needsSequelCheck = true;
    copy.progressWarning = `Progression répartie : ${seen}/${total} devient ${total}/${total}. Suite probable : ${overflow} épisode(s).`;
    copy.notes = (copy.notes || "") + `\nRéconciliation BetaSeries : ${seen}/${total} corrigé en ${total}/${total}. ${overflow} épisode(s) à rattacher à une suite.`;
  }

  return copy;
}

function almCreateSequelCandidate(anime) {
  const overflow = Number(anime.betaseriesOverflowEpisodes || 0);
  if (!overflow) return null;
  return {
    ...anime,
    id: undefined,
    title: `${anime.title} — suite probable`,
    status: "Plan to Watch",
    episodesSeen: "0",
    episodesTotal: "?",
    poster: "",
    tags: Array.from(new Set([...(anime.tags || []), "suite probable", "à vérifier"])),
    notes: `Entrée créée automatiquement. ${overflow} épisode(s) BetaSeries n'ont pas pu être rattachés à la fiche précédente. Utilise News saisons / Infos auto pour confirmer la bonne suite.`,
    progressWarning: `Suite probable à vérifier : ${overflow} épisode(s).`
  };
}

function almExpandImportedItems(items) {
  const out = [];
  for (const item of items || []) {
    const anime = item.anime || item;
    if (!anime?.title) continue;
    out.push(item);
    const sequel = almCreateSequelCandidate(anime);
    if (sequel) out.push({ ...item, anime: sequel, classification: "review", reason: "Suite probable créée automatiquement." });
  }
  return out;
}

async function almPreloadCacheFromLibrary() {
  const animes = readAnimes();
  const titles = Array.from(new Set(animes.map(a => a.title).filter(Boolean)));
  const workers = almTurboWorkerCount(readConfig().workerMode || "normal");
  await almTurboQueue(titles, workers, async (title) => {
    await almTurboAnimeLookup(title);
    if (title) await almTurboImageLookup(title);
  });
  const status = { ok: true, count: titles.length, updatedAt: new Date().toISOString() };
  fs.writeFileSync(almTurboCacheFile("preload-cache-status.json"), JSON.stringify(status, null, 2), "utf8");
  return status;
}


// V2.0 Database Edition
function almDbEnsure() {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "cache"), { recursive: true });
}

function almDbReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function almDbWriteJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function almDbKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function almDbLoad() {
  almDbEnsure();
  const database = almDbReadJson(path.join(DATABASE_DIR, "anime_database.json"), { version: 1, items: {} });
  const aliases = almDbReadJson(path.join(DATABASE_DIR, "anime_aliases.json"), { version: 1, items: {} });
  const relations = almDbReadJson(path.join(DATABASE_DIR, "anime_relations.json"), { version: 1, items: {} });
  return { database, aliases, relations };
}

function almDbFindLocal(title) {
  const { database, aliases } = almDbLoad();
  const key = almDbKey(title);
  const aliasTitle = aliases.items?.[key];
  if (aliasTitle && database.items?.[aliasTitle]) {
    const item = database.items[aliasTitle];
    return {
      title: item.title,
      officialTitle: item.title,
      episodesTotal: item.episodes || "",
      episodes: item.episodes || "",
      type: item.type || "TV",
      genres: item.genres || [],
      malId: item.malId || "",
      malUrl: item.malUrl || "",
      imageUrl: item.imageUrl || "",
      matchingScore: 100,
      source: "LocalDatabase"
    };
  }

  for (const item of Object.values(database.items || {})) {
    const candidates = [item.title, ...(item.aliases || [])].map(almDbKey);
    if (candidates.includes(key)) {
      return {
        title: item.title,
        officialTitle: item.title,
        episodesTotal: item.episodes || "",
        episodes: item.episodes || "",
        type: item.type || "TV",
        genres: item.genres || [],
        malId: item.malId || "",
        malUrl: item.malUrl || "",
        imageUrl: item.imageUrl || "",
        matchingScore: 100,
        source: "LocalDatabase"
      };
    }
  }

  const metadata = searchMetadataLocal(title, { minScore: 55, limit: 6 });
  if (metadata) return metadata;

  return null;
}

function almDbSaveLearned(title, found) {
  if (!title || !found?.title) return;
  const dbFile = path.join(DATABASE_DIR, "anime_database.json");
  const aliasFile = path.join(DATABASE_DIR, "anime_aliases.json");
  const database = almDbReadJson(dbFile, { version: 1, items: {} });
  const aliases = almDbReadJson(aliasFile, { version: 1, items: {} });

  const animeTitle = found.officialTitle || found.title;
  if (!database.items[animeTitle]) {
    database.items[animeTitle] = {
      title: animeTitle,
      aliases: Array.from(new Set([found.title, found.officialTitle, title].filter(Boolean))),
      episodes: found.episodesTotal || found.episodes || "",
      type: found.type || "TV",
      genres: found.genres || [],
      malId: found.malId || "",
      malUrl: found.malUrl || "",
      imageUrl: found.imageUrl || found.poster || "",
      relations: []
    };
  }

  aliases.items[almDbKey(title)] = animeTitle;
  aliases.updatedAt = new Date().toISOString();
  database.updatedAt = new Date().toISOString();

  almDbWriteJson(dbFile, database);
  almDbWriteJson(aliasFile, aliases);
}

function almCacheRead(name) {
  const file = path.join(DATA_DIR, "cache", name);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}", "utf8");
    return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { file, data: {} };
  }
}

function almCacheWrite(cache) {
  try {
    if (cache?.file) fs.writeFileSync(cache.file, JSON.stringify(cache.data || {}, null, 2), "utf8");
  } catch {}
}

async function almDbLookupAnime(title, options = {}) {
  const local = almDbFindLocal(title);
  if (local && !options.forceApi) return local;

  const cache = almCacheRead("jikan-cache.json");
  const key = almDbKey(title);
  if (cache.data[key] && !options.forceApi) return cache.data[key].value || null;

  let found = null;
  try {
    if (typeof searchAnimeWithAliases === "function") found = await searchAnimeWithAliases(title);
    else if (typeof searchAnimeSmart === "function") found = await searchAnimeSmart(title);
    else found = await withTimeout(searchJikan(title), 5000);
  } catch {}

  if (!found) {
    const betaCache = almCacheRead("betaseries-cache.json");
    if (betaCache.data[key]) {
      found = betaCache.data[key].value || null;
    } else {
      try { found = await searchBetaSeriesShow(title); } catch {}
      betaCache.data[key] = { value: found || null, updatedAt: new Date().toISOString() };
      almCacheWrite(betaCache);
    }
  }

  cache.data[key] = { value: found || null, updatedAt: new Date().toISOString() };
  almCacheWrite(cache);
  if (found) almDbSaveLearned(title, found);
  return found || null;
}

async function almDbLookupImage(title) {
  const cache = almCacheRead("image-cache.json");
  const key = almDbKey(title);
  if (cache.data[key]) return cache.data[key].value || "";

  let image = "";
  const local = almDbFindLocal(title);
  if (local?.imageUrl) image = local.imageUrl;

  if (!image) {
    try {
      const found = await almDbLookupAnime(title);
      image = found?.imageUrl || found?.poster || "";
    } catch {}
  }

  if (!image) {
    try {
      if (typeof searchImageFallbackAll === "function") image = await searchImageFallbackAll(title);
      else image = await searchBestImageUrl(title);
    } catch {}
  }

  cache.data[key] = { value: image || "", updatedAt: new Date().toISOString() };
  almCacheWrite(cache);
  return image || "";
}

function almDbGetRelations(title) {
  const { database, relations } = almDbLoad();
  const local = almDbFindLocal(title);
  const canonical = local?.title || title;
  return relations.items?.[canonical] || database.items?.[canonical]?.relations || [];
}

function almDbReconcileProgress(anime, row, found) {
  const copy = { ...anime };
  const seen = Number(String(copy.episodesSeen || 0).replace(",", "."));
  const total = Number(String(copy.episodesTotal || found?.episodesTotal || found?.episodes || 0).replace(",", "."));
  if (total && seen >= total) copy.status = "Completed";

  if (total && seen > total) {
    const overflow = seen - total;
    copy.episodesSeen = String(total);
    copy.episodesTotal = String(total);
    copy.status = "Completed";
    copy.tags = Array.from(new Set([...(copy.tags || []), "suite probable"]));
    copy.betaseriesOriginalProgress = `${seen}/${total}`;
    copy.betaseriesOverflowEpisodes = overflow;
    copy.needsSequelCheck = true;
    copy.progressWarning = `Progression répartie : ${seen}/${total} devient ${total}/${total}. ${overflow} épisode(s) à rattacher à une suite.`;
    copy.notes = (copy.notes || "") + `\nDatabase Edition : ${seen}/${total} corrigé en ${total}/${total}. ${overflow} épisode(s) à rattacher à une suite.`;
  }
  return copy;
}

function almDbExpandWithSequels(item) {
  const anime = item.anime || item;
  if (!anime?.title) return [item];

  const out = [item];
  const overflow = Number(anime.betaseriesOverflowEpisodes || 0);
  if (!overflow) return out;

  let remaining = overflow;
  const relations = almDbGetRelations(anime.title).filter(r => String(r.type || "").toLowerCase().includes("sequel") || String(r.type || "").toLowerCase().includes("suite"));

  for (const rel of relations) {
    if (remaining <= 0) break;
    const ep = Number(rel.episodes || 0);
    const seen = ep ? Math.min(remaining, ep) : 0;
    out.push({
      ...item,
      classification: "anime",
      reason: "Suite détectée via base locale.",
      anime: {
        title: rel.title,
        status: ep && seen >= ep ? "Completed" : "Watching",
        type: rel.typeAnime || "TV",
        score: "",
        episodesSeen: ep ? String(seen) : "0",
        episodesTotal: ep ? String(ep) : "?",
        startDate: "",
        endDate: "",
        genres: anime.genres || [],
        tags: Array.from(new Set([...(anime.tags || []), "suite détectée", "BetaSeries"])),
        notes: `Créé automatiquement pour répartir la progression BetaSeries. Source : ${anime.title}.`,
        poster: rel.poster || "",
        publicScore: "",
        malUrl: rel.malUrl || "",
        malId: rel.malId || ""
      }
    });
    if (ep) remaining -= seen;
  }

  if (remaining > 0) {
    out.push({
      ...item,
      classification: "review",
      reason: "Suite probable créée automatiquement.",
      anime: {
        ...anime,
        id: undefined,
        title: `${anime.title} — suite probable`,
        status: "Plan to Watch",
        episodesSeen: "0",
        episodesTotal: "?",
        poster: "",
        tags: Array.from(new Set([...(anime.tags || []), "suite probable", "à vérifier"])),
        notes: `Entrée créée automatiquement : ${remaining} épisode(s) BetaSeries non rattaché(s) à une suite connue.`,
        betaseriesOverflowEpisodes: remaining,
        needsSequelCheck: true,
        progressWarning: `Suite probable à vérifier : ${remaining} épisode(s).`
      }
    });
  }

  return out;
}

function almDbExpandImportItems(items) {
  const out = [];
  for (const item of items || []) {
    for (const expanded of almDbExpandWithSequels(item)) out.push(expanded);
  }
  return out;
}


function betaSeriesSeasonEntryFromItem(item) {
  const anime = { ...(item?.anime || {}) };
  const found = item?.found || null;
  if (found) mergeAutoInfo(anime, found, false);
  return {
    malId: String(anime.malId || found?.malId || ""),
    title: String(anime.officialTitle || found?.officialTitle || anime.title || found?.title || "").trim(),
    episodesTotal: numberOrZero(anime.episodesTotal || found?.episodesTotal || found?.episodes || 0),
    type: String(anime.type || found?.type || ""),
    startDate: String(anime.startDate || found?.startDate || ""),
    found,
    anime,
    sourceSeriesId:String(anime.betaseriesSeriesId||anime.betaseriesId||item?.row?.id||''),
    rootMalId:Number(anime.seriesReference?.rootMalId||anime.malId||found?.malId)||0,
    generated: false
  };
}

function betaSeriesSeasonEntryFromCandidate(candidate) {
  if (!candidate?.title) return null;
  let found = null;
  try {
    const malId = Number(candidate.malId || 0);
    if (malId > 0 && db?.getMetadataByMalId) {
      const row = db.getMetadataByMalId(malId);
      if (Number(row?.malId) === malId) found = metadataToFound(row, candidate.title, 100);
    }
    if (!found && !malId && typeof searchMetadataLocal === "function") {
      found = searchMetadataLocal(candidate.title, { minScore: 82, limit: 10, tokenLimit: 100 });
    }
  } catch {}
  const details = found || {};
  return {
    malId: String(candidate.malId || details.malId || ""),
    title: String(details.officialTitle || details.title || candidate.title || "").trim(),
    episodesTotal: numberOrZero(details.episodesTotal || details.episodes || candidate.episodesTotal || 0),
    type: String(details.type || candidate.mediaType || ""),
    startDate: String(details.startDate || candidate.startDate || ""),
    found: found || null,
    candidate,
    generated: true
  };
}

function betaSeriesDirectSequelCandidates(relations) {
  const candidates = [];
  for (const relation of Array.isArray(relations) ? relations : []) {
    if (String(relation?.relation || "") !== "Sequel") continue;
    for (const entry of Array.isArray(relation?.entry) ? relation.entry : []) {
      const candidate = relationEntryToSeasonCandidate(relation, entry);
      if (candidate?.title) candidates.push(candidate);
    }
  }
  return candidates;
}

function betaSeriesChooseDirectSequel(currentEntry, relations, expectedChainIndex, visited = new Set()) {
  const localBase=currentEntry?.malId?db.getMetadataByMalId(currentEntry.malId):null;
  const logical=Number(currentEntry?.sourceSeason||expectedChainIndex||1);
  const learned=currentEntry?.sourceSeriesId&&automation.season(currentEntry.sourceSeriesId,logical+1);
  const learnedRow=learned?.source==='manual'&&Number(learned.rootMalId)===Number(currentEntry.rootMalId)?db.getMetadataByMalId(learned.malId):null;
  const manualNext=learnedRow&&!visited.has('mal:'+learnedRow.malId)?{malId:learnedRow.malId,title:learnedRow.title,type:learnedRow.type,episodesTotal:Number(learnedRow.episodes)||0,startDate:learnedRow.startDate,found:metadataToFound(learnedRow,learnedRow.title,100),generated:true,sourceSeason:logical+1,sourceSeriesId:currentEntry.sourceSeriesId,rootMalId:currentEntry.rootMalId,proof:{source:'manual',rootMalId:currentEntry.rootMalId,season:logical+1}}:null;
  if(localBase){
    const next=nextVerifiedLocalSeason(localBase);
    if(manualNext&&!next?.proof.split)return manualNext;
    if(next&&!visited.has('mal:'+next.row.malId)){
      const found=metadataToFound(next.row,next.row.title,100);
      return {malId:next.row.malId,title:next.row.title,type:next.row.type,episodesTotal:Number(next.row.episodes)||0,startDate:next.row.startDate,found,generated:true,sourceSeason:Number(currentEntry.sourceSeason||expectedChainIndex||1)+(next.proof.split?0:1),proof:next.proof,sourceSeriesId:currentEntry.sourceSeriesId,rootMalId:currentEntry.rootMalId};
    }
  }
  if(manualNext)return manualNext;
  const ranked = [];
  for (const candidate of betaSeriesDirectSequelCandidates(relations)) {
    const idKey = String(candidate.malId || "");
    const titleKey = normalizeTitle(candidate.title || "");
    if ((idKey && visited.has(`mal:${idKey}`)) || (titleKey && visited.has(`title:${titleKey}`))) continue;
    const entry = betaSeriesSeasonEntryFromCandidate(candidate);
    if (!entry) continue;
    const kind = classifySeasonCandidate(candidate, entry.found || entry);
    const numberedOva=/^OVA$/i.test(entry.type||'')&&localSeasonLinks.descriptor({...entry,...(entry.found||{}),title:entry.found?.officialTitle||entry.title}).season>1&&Number(entry.episodesTotal)>1;
    if (kind.key !== "direct_sequel" && !numberedOva) continue;
    if(entry.startDate&&entry.startDate>new Date().toISOString().slice(0,10))continue;

    let score = 100;
    const type = normalizeSeasonMediaType(entry.type);
    if (type === "tv") score += 24;
    else if (type === "tv short") score += 18;
    else if (type === "ona") score += 12;
    else if (!type) score += 5;

    const expectedSeason = Math.max(2, Number(expectedChainIndex || 1) + 1);
    const inferred = inferSeasonNumberFromTitle(entry.title, 0);
    if (inferred === expectedSeason) score += 18;
    else if (inferred > 0 && Math.abs(inferred - expectedSeason) >= 2) score -= 12;

    const titleOverlap = metadataTokenOverlapScore(currentEntry?.title || "", entry.title || "");
    score += Math.round(Math.min(100, titleOverlap) * 0.08);

    const currentDate = Date.parse(currentEntry?.startDate || "");
    const nextDate = Date.parse(entry.startDate || "");
    if (Number.isFinite(currentDate) && Number.isFinite(nextDate)) {
      if (nextDate >= currentDate) score += 5;
      else score -= 20;
    }
    ranked.push({ entry, score });
  }

  ranked.sort((a, b) => b.score - a.score || String(a.entry.startDate || "").localeCompare(String(b.entry.startDate || "")));
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 5) return null;
  const entry=ranked[0].entry,previous=localBase?localSeasonLinks.descriptor(localBase):{season:0,part:0},following=localSeasonLinks.descriptor({...entry,...(entry.found||{}),title:entry.found?.officialTitle||entry.title});
  const split=following.part===(previous.part||1)+1&&(following.season||1)===(previous.season||1);
  return {...entry,sourceSeriesId:currentEntry.sourceSeriesId,rootMalId:currentEntry.rootMalId,sourceSeason:Number(currentEntry?.sourceSeason||expectedChainIndex||1)+(split?0:1)};
}

function betaSeriesRelationCacheEntry(value) {
  if (Array.isArray(value)) return { relations: value, updatedAt: "" };
  if (value && typeof value === "object") return { relations: Array.isArray(value.relations) ? value.relations : [], updatedAt: String(value.updatedAt || "") };
  return { relations: [], updatedAt: "" };
}

async function betaSeriesNextLinkedEntry(current,relations,logical,visited,cache,options={}){
 const direct=betaSeriesChooseDirectSequel(current,relations,logical,visited);if(direct)return direct;
 const candidates=betaSeriesDirectSequelCandidates(relations),bridges=candidates.filter(c=>/^Movie$/i.test(c.mediaType||db.getMetadataByMalId(c.malId)?.type||''));
 if(candidates.length!==1||bridges.length!==1)return null;
 const bridge=bridges[0],key=String(bridge.malId);if(!key||visited.has('mal:'+key))return null;
 const cached=cache[key],map=cached?new Map([[key,betaSeriesRelationCacheEntry(cached).relations]]):options.localOnly?new Map():await betaSeriesResolveRelationLayer([key],cache,{deadlineAt:options.deadlineAt,jikanFallbackLimit:0});
 const next=betaSeriesChooseDirectSequel({malId:bridge.malId,title:bridge.title,sourceSeason:current.sourceSeason||logical,sourceSeriesId:current.sourceSeriesId,rootMalId:current.rootMalId},map.get(key)||[],logical,new Set([...visited,'mal:'+key]));
 return next?{...next,bridgeMalId:Number(key)}:null;
}

function betaSeriesRelationCacheFresh(value) {
  const parsed = betaSeriesRelationCacheEntry(value);
  if (!parsed.updatedAt) return parsed.relations.length > 0;
  const age = Date.now() - Date.parse(parsed.updatedAt);
  return Number.isFinite(age) && age >= 0 && age < 30 * 24 * 60 * 60 * 1000;
}

async function betaSeriesResolveRelationLayer(malIds, cache, options = {}) {
  const ids = Array.from(new Set((Array.isArray(malIds) ? malIds : []).map(value => Number(value) || 0).filter(Boolean)));
  const out = new Map();
  const missing = [];
  const shouldStop = typeof options.shouldStop === "function" ? options.shouldStop : () => false;
  const externalSignal = options.signal || null;
  const deadlineAt = Number(options.deadlineAt || 0);
  const deadlineReached = () => Boolean(deadlineAt && Date.now() >= deadlineAt);
  const stopped = () => shouldStop() || Boolean(externalSignal?.aborted) || deadlineReached();
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const aniListTimeoutMs = Math.max(750, Math.min(12000, Number(options.aniListTimeoutMs || 8000)));
  const batchConcurrency = Math.max(1, Math.min(4, Number(options.batchConcurrency || 3)));
  const jikanFallbackLimit = options.jikanFallbackLimit == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Number(options.jikanFallbackLimit || 0));

  for (const id of ids) {
    const cached = cache[String(id)];
    if (cached && betaSeriesRelationCacheFresh(cached)) out.set(String(id), betaSeriesRelationCacheEntry(cached).relations);
    else missing.push(id);
  }

  const batches = [];
  for (let offset = 0; offset < missing.length; offset += 30) batches.push(missing.slice(offset, offset + 30));
  let batchesDone = 0;

  // Pendant l'import on groupe les requêtes AniList et on autorise plusieurs
  // lots en parallèle. L'ancienne boucle séquentielle pouvait rester plusieurs
  // minutes silencieuse lorsqu'un service distant ralentissait.
  await runWithConcurrency(batches, batchConcurrency, async batchIds => {
    if (stopped()) return;
    const batch = batchIds.map(malId => ({ malId }));
    let resolved = new Map();
    try {
      const timeLeft = deadlineAt ? Math.max(750, deadlineAt - Date.now()) : aniListTimeoutMs;
      resolved = await fetchAniListSeasonRelationsBatch(batch, { timeoutMs: Math.min(aniListTimeoutMs, timeLeft), signal: externalSignal });
    } catch {}
    for (const [malId, relations] of resolved) {
      const key = String(malId);
      out.set(key, relations || []);
      cache[key] = { relations: relations || [], updatedAt: new Date().toISOString(), source: "AniList" };
    }
    batchesDone += 1;
    onProgress({
      source: "AniList",
      batchesDone,
      batchesTotal: batches.length,
      resolved: out.size,
      requested: ids.length,
      stopped: stopped()
    });
  }, stopped);

  // Jikan reste utile dans les autres parcours, mais un gros import BetaSeries
  // peut explicitement le désactiver (jikanFallbackLimit=0). Faire un repli
  // individuel sur des dizaines de titres était la cause principale des imports
  // donnant l'impression d'être bloqués.
  if (!stopped() && jikanFallbackLimit > 0) {
    const unresolved = missing.filter(id => !out.has(String(id))).slice(0, jikanFallbackLimit);
    let jikanDone = 0;
    await runWithConcurrency(unresolved, 2, async id => {
      if (stopped()) return;
      try {
        const fetched = await fetchSeasonRelations(id);
        if (fetched.ok) {
          out.set(String(id), fetched.relations || []);
          cache[String(id)] = { relations: fetched.relations || [], updatedAt: new Date().toISOString(), source: "Jikan" };
        }
      } catch {}
      jikanDone += 1;
      onProgress({
        source: "Jikan",
        batchesDone: jikanDone,
        batchesTotal: unresolved.length,
        resolved: out.size,
        requested: ids.length,
        stopped: stopped()
      });
    }, stopped);
  }
  out.unavailable=ids.some(id=>!out.has(String(id)));
  return out;
}

function betaSeriesProgressNeedsMore(state) {
  if(state.continuous)return false;
  const parsed = state.parsed;
  if (!state.chain.length) return false;
  if (parsed.season > 1){
    const target=state.chain.filter(e=>Number(e.sourceSeason||e.chainIndex+1)===parsed.season);
    if(!target.length)return true;
    if(target.some(e=>!Number(e.episodesTotal)))return false;
    return target.reduce((n,e)=>n+Number(e.episodesTotal),0)<Number(parsed.episode||0);
  }
  const requiredEpisodes = Number(parsed.episode || 0);
  if (!requiredEpisodes) return false;
  let capacity = 0;
  for (const entry of state.chain) {
    const total = Number(entry.episodesTotal || 0);
    if (!total) return false;
    capacity += total;
    if (capacity >= requiredEpisodes) return false;
  }
  return capacity < requiredEpisodes;
}

function betaSeriesGeneratedAnime(entry, sourceItem, chainIndex, planRecord) {
  const found = entry.found || {};
  const row = sourceItem?.row || {};
  const total = Number(planRecord?.episodesTotal || entry.episodesTotal || 0);
  const seen = Number(planRecord?.episodesSeen || 0);
  const status = String(planRecord?.status || (seen > 0 ? "Watching" : "Plan to Watch"));
  const title = String(entry.title || found.officialTitle || found.title || "Suite détectée");
  return {
    title,
    canonicalTitle:found.officialTitle||title,
    seriesReference:{status:'verified',rootMalId:Number(sourceItem?.anime?.seriesReference?.rootMalId||sourceItem?.anime?.malId||sourceItem?.found?.malId)||0,sourceSeason:Number(entry.sourceSeason)||chainIndex+1,part:Number(localSeasonLinks.descriptor({...found,title}).part)||1},
    betaseriesSourceTitle:sourceItem?.row?.title||sourceItem?.sourceTitle||sourceItem?.anime?.betaseriesSourceTitle||'',
    betaseriesSourceRow:{...row},
    status,
    type: found.type || entry.type || "TV",
    score: "",
    episodesSeen: total || seen ? String(seen) : "",
    episodesTotal: total ? String(total) : "",
    startDate: found.startDate || entry.startDate || "",
    endDate: found.endDate || "",
    genres: Array.isArray(found.genres) ? found.genres : (Array.isArray(sourceItem?.anime?.genres) ? sourceItem.anime.genres : []),
    tags: Array.from(new Set([...(sourceItem?.anime?.tags || []), "BetaSeries", "progression répartie", "suite détectée"])).filter(tag => !/suite probable|multi-saison|à vérifier/i.test(String(tag))),
    notes: "",
    poster: found.imageUrl || "",
    imageUrl: found.imageUrl || "",
    publicScore: found.publicScore || "",
    rank: found.rank || "",
    popularity: found.popularity || "",
    members: found.members || "",
    malUrl: found.malUrl || (entry.malId ? `https://myanimelist.net/anime/${entry.malId}` : ""),
    synopsis: found.synopsis || "",
    malId: found.malId || entry.malId || "",
    englishTitle: found.englishTitle || "",
    studios: Array.isArray(found.studios) ? found.studios : [],
    mediaKind: "anime",
    verifiedAnime: true,
    betaseriesSeriesId: row.id || sourceItem?.anime?.betaseriesId || "",
    betaseriesSeason: entry.sourceSeason || chainIndex + 1,
    partNumber: localSeasonLinks.descriptor({...found,title:found.officialTitle||entry.title}).part||0,
    betaseriesEpisode: row.episode || "",
    betaseriesStatus: row.status || ""
  };
}

function betaSeriesUnresolvedTargetAnime(state) {
  const sourceItem = state?.item || {};
  const sourceAnime = sourceItem?.anime || {};
  const row = sourceItem?.row || {};
  const seasonNumber = Math.max(2, Number(state?.parsed?.season || 2));
  const seen = Math.max(0, Number(state?.parsed?.episode || 0));
  const completed = state?.completed === true;
  // `remaining` belongs to the entire BetaSeries show, not this season.
  const total = 0;
  const status = completed || (total > 0 && seen >= total) ? "Completed" : (seen > 0 ? "Watching" : "Plan to Watch");
  const rootTitle = String(sourceItem?.sourceTitle || sourceAnime?.seriesRootTitle || sourceAnime?.title || row?.title || "Anime").trim();
  const title = `${rootTitle} — Saison ${seasonNumber}`;
  return {
    title,
    seriesRootTitle: rootTitle,
    manualSeasonNumber: seasonNumber,
    status,
    type: sourceAnime?.type || "TV",
    score: "",
    episodesSeen: seen ? String(seen) : "",
    episodesTotal: total ? String(total) : "",
    startDate: "",
    endDate: "",
    genres: Array.isArray(sourceAnime?.genres) ? sourceAnime.genres : [],
    tags: Array.from(new Set([...(sourceAnime?.tags || []), "BetaSeries", "progression répartie", "saison à identifier", "progression à vérifier"])),
    notes: "",
    poster: "",
    imageUrl: "",
    malUrl: "",
    synopsis: "",
    malId: "",
    mediaKind: "anime",
    verifiedAnime: true,
    betaseriesId: sourceAnime?.betaseriesId || row?.id || "",
    betaseriesSeriesId: row?.id || sourceAnime?.betaseriesSeriesId || sourceAnime?.betaseriesId || "",
    betaseriesSeason: seasonNumber,
    betaseriesEpisode: row?.episode || "",
    betaseriesStatus: row?.status || "",
    betaseriesSourceTitle:rootTitle,
    betaseriesSourceRow:{...row},
    seriesReference:{status:'provisional',rootMalId:Number(sourceAnime.malId)||0,sourceSeason:seasonNumber,part:0},
    needsSequelCheck: true,
    progressWarning: `Saison ${seasonNumber} en cours conservée (${seen}${total ? `/${total}` : " épisode(s)"}), mais sa fiche officielle reste à identifier.`
  };
}

function betaSeriesUnresolvedOverflowAnimes(state, plan) {
  const remaining = Math.max(0, Number(plan?.remainingUnallocatedEpisodes || 0));
  if (!remaining) return [];
  const next = Math.max(2, (state.chain?.length || 1)+1);
  const target=betaSeriesUnresolvedTargetAnime({...state,parsed:{season:next,episode:remaining},completed:false});
  target.episodesTotal="";target.episodesSeen="0";target.unallocatedEpisodes=remaining; target.status="Watching";
  target.progressUnallocated=true;
  target.progressWarning=remaining+" épisode(s) à rattacher à une saison confirmée.";
  return [target];
}

function betaSeriesApplyPlanToBase(sourceItem, entry, planRecord, completePlan) {
  const anime = { ...(sourceItem?.anime || {}) };
  if (entry.found) mergeAutoInfo(anime, entry.found, false);
  const total = Number(planRecord?.episodesTotal || entry.episodesTotal || anime.episodesTotal || 0);
  const seen = Number(planRecord?.episodesSeen || 0);
  anime.episodesSeen = total || seen ? String(seen) : (anime.episodesSeen || "");
  if (total) anime.episodesTotal = String(total);
  anime.status = String(planRecord?.status || anime.status || "Watching");
  anime.betaseriesSeason = 1;
  anime.betaseriesSeriesId = sourceItem?.row?.id || anime.betaseriesId || "";
  anime.tags = Array.from(new Set([...(anime.tags || []), "BetaSeries", "progression répartie"]))
    .filter(tag => !/suite probable|multi-saison/i.test(String(tag)));
  anime.betaseriesOverflowEpisodes = 0;
  anime.needsSequelCheck = !completePlan;
  if (completePlan) {
    anime.progressWarning = "";
  }
  return anime;
}

async function expandBetaSeriesProgressItems(items, options = {}) {
  await db.whenReady();
  await db.prepareMetadataTitleIndex();
  const sourceItems = Array.isArray(items) ? items : [];
  const relationCache = await readJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE, {});
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const shouldStop = typeof options.shouldStop === "function" ? options.shouldStop : () => false;
  const externalSignal = options.signal || null;
  const networkBudgetMs = Math.max(0, Number(options.networkBudgetMs || 0));
  let deadlineAt = Number(options.deadlineAt || 0);
  const deadlineReached = () => Boolean(deadlineAt && Date.now() >= deadlineAt);
  const stopped = () => shouldStop() || Boolean(externalSignal?.aborted) || deadlineReached();
  const boundedImport = networkBudgetMs > 0 || Boolean(options.boundedNetwork);
  const savedByMalId=new Map(readAnimes().filter(a=>a.malId).map(a=>[String(a.malId),a]));
  const states = sourceItems.map((item, index) => {
    item={...item,anime:require('./lib/betaseries-import-shape').sourceState(item.anime||{},item.row||{},item.found)};
    let parsed = betaSeriesProgress.parseBetaSeriesEpisode(item?.row?.episode || item?.anime?.betaseriesEpisode || "");
    const fallbackSeen = Math.max(0, numberOrZero(item?.anime?.episodesSeen));
    if (!parsed.episode && fallbackSeen > 0) parsed = { season: 1, episode: fallbackSeen, inferredFromProgress: true };
    const base = betaSeriesSeasonEntryFromItem(item);
    const saved=savedByMalId.get(String(base.malId));
    const preservedRecord=saved?.automationDecision?.kind==='undo'&&saved.automationDecision.sourcePosition===(item.row?.episode||item.anime?.betaseriesEpisode)&&saved.automationDecision.malId===String(base.malId)?saved:null;
    return {
      index,
      item,
      parsed,
      completed: numberOrZero(item?.row?.status) >= 100 || (item?.row?.remaining !== undefined && item?.row?.remaining !== null && String(item.row.remaining).trim() !== "" && numberOrZero(item.row.remaining) === 0),
      chain: [{...base,sourceSeason:1}],
      continuous:item.anime.betaseriesProgressScope==='season-marker',
      preservedRecord,
      unresolved: !!preservedRecord
    };
  });

  const readyCount = () => states.filter(state => state.unresolved || !betaSeriesProgressNeedsMore(state)).length;
  onProgress({ phase: "relations", done: readyCount(), total: states.length, current: "Préparation de la répartition des saisons…", layer: 0 });

  // Résolution couche par couche. Pour l'import interactif, les appels réseau
  // sont volontairement bornés : AniList est groupé et parallèle, Jikan n'est
  // jamais lancé titre par titre. Si le budget est épuisé, l'import continue et
  // les rares progressions non résolues sont clairement marquées « à vérifier ».
  for (let layer = 0; layer < 100; layer += 1) {
    if (shouldStop()) break;
    const active = states.filter(state => !state.unresolved && betaSeriesProgressNeedsMore(state));
    if (!active.length) break;
    if (!options.localOnly&&deadlineAt&&deadlineReached()) {
      active.forEach(state => { state.unresolved = true; });
      onProgress({ phase: "relations", done: readyCount(), total: states.length, current: "Budget réseau atteint — les cas restants seront signalés à vérifier.", layer: layer + 1, budgetReached: true });
      break;
    }
    const localReady=new Set();
    for(const state of active){
      const current=state.chain[state.chain.length-1],visited=new Set(state.chain.map(e=>'mal:'+e.malId));
      const next=betaSeriesChooseDirectSequel(current,[],current.sourceSeason||state.chain.length,visited);
      if(next){state.chain.push(next);localReady.add(state);}
      if(localReady.size%8===0)await yieldToEventLoop();
    }
    const remoteActive=active.filter(state=>!localReady.has(state));
    const ids = remoteActive.map(state => state.chain[state.chain.length - 1]?.malId).filter(Boolean);
    if (!ids.length) {
      if(localReady.size)continue;
      remoteActive.forEach(state => { state.unresolved = true; });break;
    }

    onProgress({
      phase: "relations",
      done: readyCount(),
      total: states.length,
      current: `Recherche des suites directes — niveau ${layer + 1}`,
      layer: layer + 1,
      active: active.length
    });

    if(!deadlineAt&&networkBudgetMs)deadlineAt=Date.now()+networkBudgetMs;
    const relationMap = options.localOnly
      ? new Map(ids.filter(id=>betaSeriesRelationCacheFresh(relationCache[String(id)])).map(id=>[String(id),betaSeriesRelationCacheEntry(relationCache[String(id)]).relations]))
      : await betaSeriesResolveRelationLayer(ids, relationCache, {
      shouldStop,
      signal: externalSignal,
      deadlineAt,
      aniListTimeoutMs: Number(options.aniListTimeoutMs || (boundedImport ? 7000 : 8000)),
      batchConcurrency: Number(options.batchConcurrency || (boundedImport ? 3 : 3)),
      jikanFallbackLimit: options.jikanFallbackLimit == null ? (boundedImport ? 0 : Number.POSITIVE_INFINITY) : options.jikanFallbackLimit,
      onProgress: info => {
        onProgress({
          phase: "relations",
          done: readyCount(),
          total: states.length,
          current: info.batchesTotal
            ? `${info.source} — lot ${Math.min(info.batchesDone, info.batchesTotal)}/${info.batchesTotal} · ${info.resolved}/${info.requested} relation(s) récupérée(s)`
            : `Recherche ${info.source}…`,
          layer: layer + 1,
          relationInfo: info
        });
      }
    });

    if (shouldStop()) break;
    for (const state of remoteActive) {
      const current = state.chain[state.chain.length - 1];
      if (!current?.malId) { state.unresolved = true; continue; }
      const visited = new Set();
      for (const entry of state.chain) {
        if (entry.malId) visited.add(`mal:${entry.malId}`);
        if (entry.title) visited.add(`title:${normalizeTitle(entry.title)}`);
      }
      const next = await betaSeriesNextLinkedEntry(current, relationMap.get(String(current.malId)) || [], current.sourceSeason||state.chain.length, visited,relationCache,{deadlineAt,localOnly:options.localOnly});
      if (!next) { state.unresolved = true; continue; }
      state.chain.push(next);
    }
    onProgress({
      phase: "relations",
      done: readyCount(),
      total: states.length,
      current: `Répartition des saisons — ${readyCount()}/${states.length} fiche(s) prêtes`,
      layer: layer + 1
    });
  }

  await writeJsonSafe(BETASERIES_SEASON_RELATIONS_CACHE_FILE, relationCache).catch(() => {});

  const out = [];
  let processedStates = 0;
  for (const state of states) {
    if (shouldStop()) break;
    if(state.preservedRecord){out.push({...state.item,anime:{...state.preservedRecord}});processedStates++;continue;}
    if(state.continuous){
      out.push({...state.item,anime:require('./lib/betaseries-import-shape').sourceState(state.chain[0].anime,state.item.row,state.item.found)});
      processedStates++;continue;
    }
    const marker = state.item?.row?.episode || state.item?.anime?.betaseriesEpisode || "";
    const plan = betaSeriesProgress.buildSeasonProgressPlan(state.parsed, state.chain, { completed: state.completed });
    const needsDistribution = state.parsed.season > 1 || state.chain.length > 1 || plan.remainingUnallocatedEpisodes > 0;

    if (!needsDistribution) {
      let anime = applyBetaSeriesProgressLogic({ ...(state.item?.anime || {}) }, state.item?.row || {}, state.item?.found || null);
      anime = clampEpisodesSeenToTotal(anime);
      if (!plan.complete && (state.parsed.season > 1 || plan.remainingUnallocatedEpisodes > 0)) {
        anime.needsSequelCheck = true;
        anime.tags = Array.from(new Set([...(anime.tags || []), "progression à vérifier"]));
        anime.progressWarning = `Progression BetaSeries ${marker} détectée, mais la suite n'a pas pu être identifiée avec assez de certitude.`;
      }
      out.push({ ...state.item, anime });
    } else {
      const baseRecord = plan.records.find(record => Number(record.chainIndex) === 0) || { ...state.chain[0], episodesSeen: 0, status: state.item?.anime?.status || "Watching" };
      const baseAnime = betaSeriesApplyPlanToBase(state.item, state.chain[0], baseRecord, plan.complete);
      const provisionalTargets = [];
      if (!plan.complete && plan.missingSeasonSlots) {
        provisionalTargets.push(betaSeriesUnresolvedTargetAnime(state));
      }
      const provisionalTargetWillBeCreated = provisionalTargets.length > 0;
      if (!plan.complete && !provisionalTargetWillBeCreated) {
        baseAnime.unallocatedEpisodes=plan.remainingUnallocatedEpisodes||0;
        baseAnime.needsSequelCheck = true;
        baseAnime.tags = Array.from(new Set([...(baseAnime.tags || []), "progression à vérifier"]));
        const unresolved = plan.missingSeasonSlots
          ? `${plan.missingSeasonSlots} saison(s) restent à identifier`
          : `${plan.remainingUnallocatedEpisodes} épisode(s) restent à rattacher`;
        baseAnime.progressWarning = `Répartition partielle de ${marker} : ${unresolved}.`;
        baseAnime.notes = [baseAnime.notes, `BetaSeries : répartition partielle de ${marker}; ${unresolved}.`].filter(Boolean).join("\n");
      } else if (provisionalTargetWillBeCreated) {
        baseAnime.needsSequelCheck = false;
        baseAnime.progressWarning = "";
        baseAnime.tags = (baseAnime.tags || []).filter(tag => !/progression à vérifier/i.test(String(tag)));
      }
      out.push({ ...state.item, anime: baseAnime });

      for (const record of plan.records.filter(record => Number(record.chainIndex) > 0)) {
        const chainIndex = Number(record.chainIndex);
        const entry = state.chain[chainIndex];
        if (!entry) continue;
        out.push({
          ...state.item,
          classification: "anime",
          reason: "Progression BetaSeries répartie sur la suite directe confirmée.",
          found: entry.found || null,
          anime: betaSeriesGeneratedAnime(entry, state.item, chainIndex, record)
        });
      }

      // Si la relation MAL/AniList n'est pas encore résolue, ne jamais perdre
      // la progression de la saison active. Cela couvre à la fois S02E07 et une
      // progression cumulée 19/12 : cette dernière devient S1 12/12 + S2 7/12.
      for (const unresolvedAnime of provisionalTargets) {
        out.push({
          ...state.item,
          classification: "anime",
          reason: `Progression BetaSeries conservée pour la saison ${unresolvedAnime.betaseriesSeason || unresolvedAnime.manualSeasonNumber || "suivante"}, fiche officielle à identifier.`,
          found: null,
          anime: unresolvedAnime
        });
      }
    }

    processedStates += 1;
    if(processedStates%8===0)await yieldToEventLoop();
    if (processedStates === states.length || processedStates % 12 === 0) {
      onProgress({
        phase: "distribution",
        done: processedStates,
        total: states.length,
        current: `Application des progressions — ${processedStates}/${states.length}`
      });
    }
  }
  return out;
}

async function almDbPreloadCache() {
  const animes = readAnimes();
  const titles = Array.from(new Set(animes.map(a => a.title).filter(Boolean)));
  for (const title of titles) {
    await almDbLookupAnime(title);
    await almDbLookupImage(title);
  }
  const result = { ok: true, count: titles.length, updatedAt: new Date().toISOString() };
  almDbWriteJson(path.join(DATA_DIR, "cache", "preload-cache-status.json"), result);
  return result;
}

async function analyseBetaSeriesRows(rows, progressCallback = null, shouldCancel = null, options={}) {
  const matchingCache = await readJsonSafe(MATCHING_CACHE_FILE, {});
  const betaFastCache = await readJsonSafe(BETASERIES_FAST_CACHE_FILE, {});
  const items = Array.isArray(rows) ? rows : [];
  const results = new Array(items.length);
  let done = 0;
  let networkCalls = 0;

  function cacheHit(title) {
    const keys = [title, normalizeTitle(title), normalizeCacheLookupKey(title), normalizeAliasKey(title)].filter(Boolean);
    for (const key of keys) {
      if (matchingCache[key]) return matchingCache[key];
      if (betaFastCache[key]) return betaFastCache[key];
    }
    return null;
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

  // 6 workers : chaque worker traite 1 anime à la fois en séquentiel (4 variantes intactes)
  // le semaphore jikanLimited gère le rate-limit (3 appels Jikan simultanés max)
  await runWithConcurrency(items.map((row, index) => ({ row, index })), 6, async ({ row, index }) => {
    if (typeof shouldCancel === "function" && shouldCancel()) return;
    const title = String(row.title || "").trim();
    if (!title) {
      done++;
      if (progressCallback) progressCallback(done, items.length, "", { cached: true, skipped: true });
      return;
    }

    if (progressCallback) progressCallback(done, items.length, title, { cached: false });

    let found = cacheHit(title)||searchMetadataLocal(title,{minScore:72});
    let usedCache = Boolean(found);
    let usedNetwork = false;

    if (!found&&!options.localOnly) {
      try {
        usedNetwork = true;
        networkCalls++;
        if (typeof searchAnimeWithAliases === "function") found = await searchAnimeWithAliases(title);
        else if (typeof searchAnimeSmart === "function") found = await searchAnimeSmart(title);
        else found = await withTimeout(searchJikan(title), 8000);
      } catch {}

      if (!found) {
        try { found = await searchBetaSeriesShow(title); } catch {}
      }

      if (found) {
        betaFastCache[normalizeCacheLookupKey(title)] = found;
        betaFastCache[normalizeTitle(title)] = found;
        if (networkCalls % 15 === 0) writeJsonSafe(BETASERIES_FAST_CACHE_FILE, betaFastCache).catch(() => {});
      }
    }

    let tvmaze = null;
    if (!options.localOnly&&needsTvCounterCheck(title, found)) {
      try {
        const tvmazeFound = found?.source === "TVMaze" ? found : await searchTvmazeShow(title);
        if (tvmazeFound) {
          tvmaze = {
            id: tvmazeFound.tvmazeId || "",
            name: tvmazeFound.officialTitle || tvmazeFound.title || title,
            type: tvmazeFound.tvmazeType || "Scripted",
            language: tvmazeFound.tvmazeLanguage || "",
            country: tvmazeFound.tvmazeCountry || "",
            genres: Array.isArray(tvmazeFound.genres) ? tvmazeFound.genres : [],
            premiered: tvmazeFound.startDate || "",
            ended: tvmazeFound.endDate || "",
            status: tvmazeFound.status || "",
            country: tvmazeFound.tvmazeCountry || "",
            network: Array.isArray(tvmazeFound.studios) ? tvmazeFound.studios[0] || "" : "",
            imageUrl: tvmazeFound.imageUrl || "",
            url: tvmazeFound.malUrl || "",
            matchingScore: Number(tvmazeFound.matchingScore || 0),
            source: "TVMaze"
          };
        }
      } catch {}
    }

    if (typeof shouldCancel === "function" && shouldCancel()) return;
    const verdict = mediaClassifier.classifyImportCandidate({ title, animeFound: found, tvFound: tvmaze });
    const { classification, reason, score, confidence, evidence } = verdict;
    results[index] = {
      source: "BetaSeries",
      sourceTitle: title,
      classification,
      reason,
      score,
      confidence,
      evidence,
      row,
      found,
      tvmaze,
      anime: buildAnimeFromBetaSeries(row, found, classification, tvmaze)
    };
    done++;
    if (progressCallback) progressCallback(done, items.length, title, { cached: usedCache, network: usedNetwork });
    // Sleep seulement si appel réseau réel (pas pour les cache hits)
    if (usedNetwork) await sleep(250);
  });

  await writeJsonSafe(BETASERIES_FAST_CACHE_FILE, betaFastCache);
  return results.filter(Boolean);
}




const XML_IMPORT_PROGRESS = new Map();

function setXmlImportProgress(id, patch) {
  if (!id) return;
  XML_IMPORT_PROGRESS.set(String(id), {
    id: String(id),
    updatedAt: new Date().toISOString(),
    ...(XML_IMPORT_PROGRESS.get(String(id)) || {}),
    ...patch
  });
}

app.get("/api/import/xml/progress/:id", (req, res) => {
  res.json(XML_IMPORT_PROGRESS.get(String(req.params.id)) || {
    id: String(req.params.id),
    status: "pending",
    phase: "waiting",
    done: 0,
    total: 0,
    current: ""
  });
});

app.post("/api/import/xml", upload.single("file"), async (req, res) => {
  const progressId = String(req.body?.progressId || Date.now());

  try {
    if (!req.file) return res.status(400).json({ error: "Fichier XML manquant." });

    const overwrite = String(req.body.overwrite || "false") === "true";
    const xmlText = req.file.buffer.toString("utf8");

    setXmlImportProgress(progressId, { status: "running", phase: "parse", done: 0, total: 0, current: "Lecture XML..." });

    const imported = await parseMalXmlCooperative(xmlText, (done, total, current) => {
      setXmlImportProgress(progressId, { status: "running", phase: "parse", done, total, current });
    });

    const animes = await readAnimesAsync();
    const importBefore = JSON.parse(JSON.stringify(animes));
    const byTitle = new Map(animes.map(a => [normalizeTitle(a.title), a]));
    const byMal = new Map(animes.filter(a=>a.malId).map(a=>[String(a.malId),a]));

    let added = 0;
    let updated = 0;
    let ignored = 0;

    setXmlImportProgress(progressId, { status: "running", phase: "merge", done: 0, total: imported.length, current: "Fusion des donnees..." });

    for (let i = 0; i < imported.length; i++) {
      const incoming = imported[i];
      const key = normalizeTitle(incoming.title);
      const titleMatch=byTitle.get(key);
      const existing = incoming.malId ? byMal.get(String(incoming.malId)) || (titleMatch && seasonResolver.sameSeason(titleMatch,incoming) ? titleMatch : null) : titleMatch;

      if (existing) {
        const index = animes.findIndex(a => Number(a.id) === Number(existing.id));
        if (index >= 0) {
          animes[index] = mergeImportedAnime(animes[index],incoming,overwrite);
          const merged = animes[index];
          merged.notes = require('./lib/notebook-model').mergeNotes(existing.notes, incoming.notes);
          byTitle.set(normalizeTitle(merged.title), merged);
          if (merged.malId) byMal.set(String(merged.malId), merged);
          updated++;
        } else {
          ignored++;
        }
      } else {
        incoming.id = nextId(animes);
        animes.push(incoming);
        byTitle.set(key, incoming);
        if(incoming.malId)byMal.set(String(incoming.malId),incoming);
        added++;
      }

      if (i % 25 === 0 || i === imported.length - 1) {
        setXmlImportProgress(progressId, { status: "running", phase: "merge", done: i + 1, total: imported.length, current: incoming.title });
        await yieldToEventLoop();
      }
    }

    setXmlImportProgress(progressId, { status: "running", phase: "save", done: imported.length, total: imported.length, current: "Sauvegarde..." });
    commitImportedLibrary(importBefore, animes);

    const result = { ok: true, total: imported.length, added, updated, ignored, overwrite, progressId };
    setXmlImportProgress(progressId, { status: "done", phase: "done", done: imported.length, total: imported.length, current: "Termine", result });

    res.json(result);
  } catch (error) {
    setXmlImportProgress(progressId, { status: "error", phase: "error", current: error.message });
    res.status(500).json({ error: "Import XML impossible : " + error.message, progressId });
  }
});



function simplifyAnimeTitleForSearch(title) {
  return String(title || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(TV|Movie|OVA|ONA|Special)\b/gi, " ")
    .replace(/\b(Season|Saison|Part|Cour)\b.*$/gi, " ")
    .replace(/[:\-].*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchAniListDetails(title) {
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          title { romaji english native }
          description(asHtml: false)
          episodes
          type
          startDate { year month day }
          endDate { year month day }
          averageScore
          popularity
          genres
          coverImage { extraLarge large medium }
          siteUrl
        }
      }
    `;

    const response = await aniListFetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { search: title } })
    });

    if (!response.ok) return null;

    const media = (await response.json())?.data?.Media;
    if (!media) return null;

    const dateToString = (d) => {
      if (!d || !d.year) return "";
      const m = String(d.month || 1).padStart(2, "0");
      const day = String(d.day || 1).padStart(2, "0");
      return `${d.year}-${m}-${day}`;
    };

    return {
      title: media.title?.romaji || media.title?.english || title,
      imageUrl: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "",
      synopsis: media.description || "",
      type: media.type || "",
      episodesTotal: media.episodes || "",
      startDate: dateToString(media.startDate),
      endDate: dateToString(media.endDate),
      publicScore: media.averageScore ? (Number(media.averageScore) / 10).toFixed(2) : "",
      rank: "",
      popularity: media.popularity || "",
      genres: media.genres || [],
      malUrl: media.siteUrl || ""
    };
  } catch (e) {
    return null;
  }
}

function hydrateSeasonNewsWithLocalDetails(item) {
  const out = { ...(item || {}) };
  let details = null;

  try {
    if (out.malId && db?.getMetadataByMalId) {
      const meta = db.getMetadataByMalId(out.malId);
      if (meta) details = metadataToFound(meta, out.title || meta.title, 100);
    }
  } catch {}

  try {
    if (!details && !out.malId && out.title) {
      details = searchMetadataLocal(out.title, { minScore: 95, limit: 10 });
    }
  } catch {}

  if (!details) return out;

  return {
    ...out,
    title: out.title || details.officialTitle || details.title || "",
    imageUrl: out.imageUrl || details.imageUrl || "",
    synopsis: out.synopsis || details.synopsis || "",
    type: out.type || details.type || "",
    episodesTotal: out.episodesTotal || details.episodesTotal || "",
    startDate: out.startDate || details.startDate || "",
    endDate: out.endDate || details.endDate || "",
    publicScore: out.publicScore || details.publicScore || "",
    rank: out.rank || details.rank || "",
    genres: Array.isArray(out.genres) && out.genres.length ? out.genres : (details.genres || []),
    studios: Array.isArray(out.studios) && out.studios.length ? out.studios : (details.studios || []),
    url: out.url || details.malUrl || "",
    malId: out.malId || details.malId || ""
  };
}

function seasonNewsCompleteness(item) {
  const hasImage = Boolean(String(item?.imageUrl || item?.poster || "").trim());
  const hasSynopsis = String(item?.synopsis || "").trim().length > 0;
  const hasDate = /^\d{4}-\d{2}-\d{2}/.test(String(item?.startDate || ""));
  const hasEpisodes = Number(item?.episodesTotal || 0) > 0 || /movie|film/i.test(String(item?.type || ""));
  const complete = hasImage && hasSynopsis && hasDate && hasEpisodes;
  const missing = [];
  if (!hasImage) missing.push("image");
  if (!hasSynopsis) missing.push("description");
  if (!hasDate) missing.push("date");
  if (!hasEpisodes) missing.push("épisodes");
  return { complete, missing };
}

function hasUsefulSeasonNewsDetails(item) {
  return seasonNewsCompleteness(item).complete;
}

const seasonDetails = require('./lib/season-details').createSeasonDetails({
 hydrate:hydrateSeasonNewsWithLocalDetails,complete:hasUsefulSeasonNewsDetails,
 fetchBatch:async ids=>{
  const fields='id idMal title { romaji english native } synonyms format episodes averageScore genres description(asHtml:false) popularity duration startDate { year month day } endDate { year month day } coverImage { extraLarge large medium } studios(isMain:true) { nodes { name isAnimationStudio } }';
  const query='{'+ids.map(id=>`m${id}:Media(idMal:${id},type:ANIME){${fields}}`).join(' ')+'}';
  const result=await boundedTextFetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),timeoutMs:8000,maxBytes:2*1024*1024,maxRedirects:0,fetchImpl:aniListFetch});
  if(!result.response.ok)throw Error('AniList details unavailable');const data=JSON.parse(result.text);
  const rows=Object.values(data.data||{}).filter(Boolean).map(anilistMediaToMetadataRow).filter(Boolean);
  metadataLearnFromRows(rows,'season-details');return rows.map(row=>metadataToFound(row,row.title,100));
 },
 fetchOne:async id=>{
  const raw=await metadataProviders.byId(id);if(!raw)throw Error('ALM_SOURCE_UNAVAILABLE');
  const row=jikanAnimeToMetadataRow(raw);metadataLearnFromRows([row],'season-details');return metadataToFound(row,row.title,100);
 }
});
async function searchNewsDetailsAllMethods(item) { return seasonDetails.resolve(item); }

async function resolveNewsDetails(item) {
  return await searchNewsDetailsAllMethods(item);
}



app.get("/api/aliases/status", (req, res) => {
  try {
    const aliases = readAliases();
    let lastSync = { updatedAt: null, count: Object.keys(aliases.items || {}).length };
    try {
      lastSync = JSON.parse(fs.readFileSync(LAST_ALIAS_SYNC_FILE, "utf8"));
    } catch {}
    res.json({
      ok: true,
      count: Object.keys(aliases.items || {}).length,
      updatedAt: aliases.updatedAt || null,
      lastSync
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/aliases/refresh", async (req, res) => {
  try {
    const aliases = await refreshAliasCacheFromLibrary();
    res.json({
      ok: true,
      count: Object.keys(aliases.items || {}).length,
      updatedAt: aliases.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: "Mise à jour des alias impossible : " + error.message });
  }
});

app.post("/api/aliases/manual", (req, res) => {
  try {
    const sourceTitle = String(req.body?.sourceTitle || "").trim();
    const animeTitle = String(req.body?.animeTitle || "").trim();
    if (!sourceTitle || !animeTitle) return res.status(400).json({ error: "Titre source et titre anime requis." });

    const aliases = readAliases();
    aliases.items[normalizeAliasKey(sourceTitle)] = {
      sourceTitle,
      animeTitle,
      confidence: 100,
      source: "manual",
      sourceDetail: "validation manuelle",
      verifiedAnime: true,
      mediaKind: "anime",
      updatedAt: new Date().toISOString()
    };

    const saved = writeAliases(aliases);
    res.json({ ok: true, count: Object.keys(saved.items || {}).length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


const CSV_PROGRESS = {};
const CSV_JOBS = new Map();
function setCsvProgress(id, data) {
  const key = String(id || "");
  CSV_PROGRESS[key] = { ...(CSV_PROGRESS[key] || {}), id: key, updatedAt: new Date().toISOString(), ...data };
}

function setCsvImportProgress(id, job, data = {}) {
  const percent = Math.max(0, Math.min(100, Number(data.percent || 0)));
  const elapsedSeconds = Math.max(0, (Date.now() - Number(job?.startedAt || Date.now())) / 1000);
  const estimatedRemainingSeconds = percent >= 3 && percent < 100
    ? Math.max(0, Math.round((elapsedSeconds / percent) * (100 - percent)))
    : 0;
  setCsvProgress(id, {
    kind: "import",
    status: data.status || "running",
    phase: data.phase || "import",
    done: Number(data.done || 0),
    total: Number(data.total || 0),
    percent,
    current: data.current || "Import BetaSeries en cours…",
    cancelRequested: Boolean(job?.cancelRequested),
    elapsedSeconds: Math.round(elapsedSeconds),
    estimatedRemainingSeconds,
    ...data
  });
}
app.get("/api/import/csv/progress/:id", (req, res) => {
  const stored=automation.job(req.params.id);
  const progress={...(CSV_PROGRESS[req.params.id]||stored?.progress||{id:req.params.id,status:stored?.status||'unknown',done:0,total:0})};
  if(progress.kind==='import')progress.elapsedSeconds=Math.max(0,Math.round(((stored?.finishedAt||Date.now())-(CSV_JOBS.get(req.params.id)?.startedAt||stored?.startedAt||stored?.createdAt||Date.now()))/1000));
  if(stored?.result)progress.result=stored.result;
  const previews=CSV_JOBS.get(req.params.id)?.previewResults;
  if(req.query?.preview==='1'&&Array.isArray(previews)){
    const cursor=Math.min(previews.length,Math.max(0,Math.floor(Number(req.query?.cursor)||0))),batch=previews.slice(cursor,cursor+100);
    return res.json({...progress,previews:batch,previewCursor:cursor+batch.length});
  }
  res.json(progress);
});
app.post("/api/import/csv/cancel/:id", (req, res) => {
  const id = String(req.params.id || "");
  const progress = CSV_PROGRESS[id] || { id, status: "unknown", done: 0, total: 0 };
  if (["done", "error", "cancelled"].includes(progress.status)) {
    return res.json({ ok: true, alreadyFinished: true, ...progress });
  }
  if(automation.cancel(id)){setCsvProgress(id,{status:'cancelled',phase:'cancelled',kind:'import'});return res.json({ok:true,cancelRequested:true});}
  const job = CSV_JOBS.get(id);
  if (job?.committing) {
    setCsvProgress(id, {
      status: "running",
      cancelRequested: false,
      current: "Enregistrement final en cours… cette dernière étape ne peut plus être annulée."
    });
    return res.json({ ok: true, tooLate: true, ...CSV_PROGRESS[id] });
  }
  if (job) {
    job.cancelRequested = true;
    try { job.worker?.postMessage({ type: "cancel" }); } catch {}
    try { job.abortController?.abort(); } catch {}
  }
  const isImport = job?.kind === "import" || progress?.kind === "import";
  setCsvProgress(id, {
    status: "cancelling",
    cancelRequested: true,
    current: isImport
      ? "Annulation de l’import demandée… la requête réseau en cours se termine puis rien ne sera écrit."
      : "Annulation demandée… les requêtes déjà lancées se terminent."
  });
  res.json({ ok: true, cancelRequested: true, ...CSV_PROGRESS[id] });
});


function getBetaSeriesApiKey() {
  try { return String(readConfig().betaseriesApiKey || process.env.BETASERIES_API_KEY || DEFAULT_BETASERIES_API_KEY || "").trim(); }
  catch { return String(process.env.BETASERIES_API_KEY || DEFAULT_BETASERIES_API_KEY || "").trim(); }
}
async function searchBetaSeriesShow(title) {
  const key = getBetaSeriesApiKey();
  if (!key || !title) return null;
  try {
    const url = "https://api.betaseries.com/search/shows?text=" + encodeURIComponent(title) + "&fields=id,title,original_title,images,description,genres";
    const { response, text } = await boundedTextFetch(url, {
      timeoutMs: 10000, maxBytes: 2 * 1024 * 1024, maxRedirects: 0,
      headers: { "X-BetaSeries-Key": key, "User-Agent": `Anime Local Manager/${PRODUCT_RELEASE.technicalVersion}` }
    });
    if (!response.ok) return null;
    const json = JSON.parse(text);
    const shows = json.shows || json.results || [];
    if (!Array.isArray(shows) || !shows.length) return null;
    const show = shows[0];

    // Essayer de croiser avec Jikan via le titre original (souvent anglais/japonais)
    const originalTitle = show.original_title || show.title || title;
    let jikanResult = null;
    if (originalTitle && originalTitle.toLowerCase() !== title.toLowerCase()) {
      try { jikanResult = await withTimeout(searchJikan(originalTitle), 6000); } catch {}
    }
    if (!jikanResult) {
      try { jikanResult = await withTimeout(searchJikan(show.title || title), 6000); } catch {}
    }

    if (jikanResult) {
      // On a le résultat Jikan croisé avec BetaSeries → très fiable
      jikanResult.matchingScore = Math.max(Number(jikanResult.matchingScore || 0), 72);
      jikanResult.betaseriesId = show.id || "";
      jikanResult.imageUrl = jikanResult.imageUrl || show.images?.poster || "";
      jikanResult.source = "BetaSeries+Jikan";
      return jikanResult;
    }

    // Fallback : résultat BetaSeries seul
    return {
      title: show.title || title,
      officialTitle: originalTitle,
      imageUrl: show.images?.poster || "",
      synopsis: show.description || "",
      type: "TV",
      genres: Array.isArray(show.genres) ? show.genres : [],
      matchingScore: 72,
      source: "BetaSeries",
      betaseriesId: show.id || ""
    };
  } catch { return null; }
}
async function searchImageFallbackAll(title) {
  try {
    const img = await searchBestImageUrl(title);
    if (img) return img;
  } catch {}

  try {
    const beta = await searchBetaSeriesShow(title);
    if (beta?.imageUrl) {
      await sleep(250);
      return beta.imageUrl;
    }
  } catch {}

  return "";
}


app.post("/api/import/csv/preview", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier CSV manquant." });

  const source = String(req.body.source || "betaseries").toLowerCase();
  if (source !== "betaseries") return res.status(400).json({ error: "Source CSV non supportée." });

  const csvText = req.file.buffer.toString("utf8");
  const rows = parseCsv(csvText);
  const progressId = String(req.body.progressId || Date.now());
  const job = { id: progressId, kind: "analysis", worker: null, cancelRequested: false, startedAt: Date.now(),previewResults:[] };
  CSV_JOBS.set(progressId, job);

  const markCancelled = (partialCount = 0) => {
    setCsvProgress(progressId, {
      status: "cancelled",
      cancelRequested: true,
      done: Number(CSV_PROGRESS[progressId]?.done || partialCount || 0),
      total: rows.length,
      current: "Analyse annulée. Aucun résultat partiel n’a été importé."
    });
  };

  setCsvProgress(progressId, {
    kind: "analysis",
    status: "running",
    done: 0,
    total: rows.length,
    percent: 0,
    cancelRequested: false,
    current: "Démarrage de l'analyse..."
  });

  // Lire les caches à passer au worker
  const matchingCache = await readJsonSafe(MATCHING_CACHE_FILE, {});
  const betaFastCache = await readJsonSafe(BETASERIES_FAST_CACHE_FILE, {});

  try {
    let workerFailure = null;
    let workerResult = null;

    try {
      workerResult = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, "csv-worker.js"), {
          workerData: { rows, matchingCache, betaFastCache, config: readConfig(), dataDir: DATA_DIR, networkBudgetMs:Number(process.env.ALM_CSV_ANALYSIS_NETWORK_BUDGET_MS)||undefined }
        });
        job.worker = worker;
        let settled = false;

        const finishResolve = value => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const finishReject = error => {
          if (settled) return;
          settled = true;
          reject(error);
        };

        worker.on("message", (msg) => {
          if (msg.type === "progress") {
            if (!job.cancelRequested) {
              if(msg.preview?.item&&Number.isInteger(msg.preview.index))job.previewResults.push(msg.preview);
              setCsvProgress(progressId, { status: "running", done: msg.done, total: msg.total, current: msg.current });
            }
          } else if (msg.type === "cancelled") {
            finishResolve({ cancelled: true, results: Array.isArray(msg.results) ? msg.results : [], done: msg.done || 0 });
          } else if (msg.type === "result") {
            finishResolve({ cancelled: false, results: Array.isArray(msg.results) ? msg.results : [] });
          } else if (msg.type === "error") {
            finishReject(new Error(msg.message));
          }
        });
        worker.on("error", finishReject);
        worker.on("exit", (code) => {
          job.worker = null;
          if (!settled && code !== 0) finishReject(new Error(`Worker exited with code ${code}`));
          else if (!settled && job.cancelRequested) finishResolve({ cancelled: true, results: [], done: CSV_PROGRESS[progressId]?.done || 0 });
        });

        if (job.cancelRequested) {
          try { worker.postMessage({ type: "cancel" }); } catch {}
        }
      });
    } catch (error) {
      workerFailure = error;
    } finally {
      job.worker = null;
    }

    if (job.cancelRequested || workerResult?.cancelled) {
      markCancelled(workerResult?.done || 0);
      return res.json({ ok: true, cancelled: true, progressId, items: [], counts: { total: 0, anime: 0, review: 0, nonAnime: 0, ignored: 0, quarantine: 0 } });
    }

    let analysed = workerResult?.results;
    if (workerFailure) {
      // Fallback uniquement en cas de vraie panne du worker. Une annulation utilisateur
      // ne relance jamais silencieusement tout le travail dans le thread principal.
      console.warn("[CSV] Worker indisponible, fallback thread principal :", workerFailure.message);
      setCsvProgress(progressId, { status: "running", done: 0, total: rows.length, current: "Reprise de l’analyse en mode compatible…" });
      analysed = await analyseBetaSeriesRows(
        rows,
        (done, total, current) => {
          if (!job.cancelRequested) setCsvProgress(progressId, { status: "running", done, total, current });
        },
        () => job.cancelRequested,
        {localOnly:true}
      );
      if (job.cancelRequested) {
        markCancelled(analysed.length);
        return res.json({ ok: true, cancelled: true, progressId, items: [], counts: { total: 0, anime: 0, review: 0, nonAnime: 0, ignored: 0, quarantine: 0 } });
      }
    }

    analysed = Array.isArray(analysed) ? analysed : [];
    // Exposer la clé stable de revue au frontend : elle permet d'écarter en une
    // seule opération plusieurs résultats ambigus / hors-anime sans lancer des
    // dizaines d'écritures individuelles dans la quarantaine.
    analysed = analysed.map(item => ({ ...item, reviewKey: mediaReviewImportKey(item) }));
    setCsvProgress(progressId, { status: "running", done: rows.length, total: rows.length, current: "Finalisation des résultats…" });

    const quarantine = await upsertPendingMediaReviews(analysed);
    // Reprendre les décisions déjà mémorisées pour que « Écarter » reste vrai
    // lors d'une nouvelle analyse du même CSV. Le moteur de classification peut
    // retrouver la fiche, mais une décision explicite ne doit pas réapparaître
    // comme « à vérifier » tant qu'aucune meilleure preuve anime n'est apparue.
    const reviewState = await readMediaReviewState();
    const reviewDecisions = new Map(reviewState.pendingImports.map(item => [String(item.key || ""), item]));
    analysed = analysed.map(item => {
      const previous = reviewDecisions.get(String(item.reviewKey || ""));
      return csvPreviewDecision(item, previous);
    });
    const counts = {
      total: analysed.length,
      anime: analysed.filter(x => x.classification === "anime").length,
      review: analysed.filter(x => x.classification === "review").length,
      nonAnime: analysed.filter(x => x.classification === "non_anime").length,
      ignored: analysed.filter(x => x.classification === "ignored").length,
      quarantine: quarantine.pending,
      tvUnverified: analysed.filter(x => x.classification === "review" && ["deferred","unavailable"].includes(x.tvLookupState)).length
    };
    setCsvProgress(progressId,{status:'done',done:rows.length,total:rows.length,current:'Analyse terminée'});
    return res.json({ ok: true, source, progressId, counts, items: analysed, quarantine: { pending: quarantine.pending, added: quarantine.added, updated: quarantine.updated } });
  } catch (err) {
    if (job.cancelRequested) {
      markCancelled();
      return res.json({ ok: true, cancelled: true, progressId, items: [], counts: { total: 0, anime: 0, review: 0, nonAnime: 0, ignored: 0, quarantine: 0 } });
    }
    setCsvProgress(progressId, { status: "error", current: `Erreur : ${err.message}` });
    return res.status(500).json({ error: "Analyse CSV impossible : " + err.message, progressId });
  } finally {
    CSV_JOBS.delete(progressId);
  }
});

async function executeCsvImport(req,res){
  const progressId = String(req.body?.progressId || `import-${Date.now()}`);
  await db.prepareMetadataTitleIndex();
  const preCancelled = Boolean(CSV_PROGRESS[progressId]?.cancelRequested);
  const job = { id: progressId, kind: "import", worker: null, abortController: new AbortController(), cancelRequested: preCancelled, committing: false, startedAt: Date.now() };
  CSV_JOBS.set(progressId, job);
  if (preCancelled) { try { job.abortController.abort(); } catch {} }

  const selectedRaw = Array.isArray(req.body?.items) ? req.body.items : [];
  const overwrite = req.body?.overwrite === true;
  const cancelledPayload = () => ({
    ok: true,
    cancelled: true,
    progressId,
    total: selectedRaw.length,
    approved: 0,
    added: 0,
    updated: 0,
    ignored: 0,
    blocked: 0,
    blockedItems: [],
    overwrite
  });
  const finishCancelled = current => {
    setCsvImportProgress(progressId, job, {
      status: "cancelled",
      phase: "cancelled",
      percent: Number(CSV_PROGRESS[progressId]?.percent || 0),
      done: Number(CSV_PROGRESS[progressId]?.done || 0),
      total: Number(CSV_PROGRESS[progressId]?.total || selectedRaw.length),
      current: current || "Import annulé. Aucune modification n’a été enregistrée."
    });
    return res.json(cancelledPayload());
  };

  setCsvImportProgress(progressId, job, {
    status: job.cancelRequested ? "cancelling" : "running",
    phase: "prepare",
    percent: 1,
    done: 0,
    total: selectedRaw.length,
    current: job.cancelRequested ? "Annulation demandée avant le démarrage…" : `Préparation de ${selectedRaw.length} entrée(s)…`
  });

  try {
    if (job.cancelRequested) return finishCancelled();
    const approvedRaw = [];
    const blockedItems = [];

    for (let rawIndex = 0; rawIndex < selectedRaw.length; rawIndex++) {
      if (job.cancelRequested) return finishCancelled();
      let rawItem = selectedRaw[rawIndex];
      if(rawItem?.forceImport!==true&&rawItem?.classification==='anime'){
        const official=db.getMetadataByMalId(rawItem.found?.malId||rawItem.anime?.malId);
        const found=official?metadataToFound(official,rawItem.sourceTitle||rawItem.row?.title,100):rawItem.found;
        const verdict=importCandidateValidation.validate({...rawItem.row,title:rawItem.sourceTitle||rawItem.row?.title||rawItem.anime?.title},found,rawItem.tvmaze);
        rawItem={...rawItem,...verdict,found};
      }
      if(rawIndex%8===0)await yieldToEventLoop();
      const classification = String(rawItem?.classification || "review");
      const forced = rawItem?.forceImport === true;
      if (classification !== "anime" && !forced) {
        blockedItems.push({
          title: rawItem?.sourceTitle || rawItem?.anime?.title || "",
          classification,
          reason: rawItem?.reason || "Validation manuelle requise"
        });
        continue;
      }

      const item = { ...rawItem, anime: { ...(rawItem?.anime || {}) } };
      // La vraie répartition SxxEyy est faite après validation, sur une chaîne de
      // suites directes MAL/AniList. On ne marque plus artificiellement la saison 1
      // comme terminée avant d'avoir identifié la saison cible.
      if (forced) {
        item.anime = mediaClassifier.markAsConfirmedAnime(item.anime);
        item.anime.tags = Array.from(new Set([...(item.anime.tags || []), "import forcé"]));
        item.anime.notes = [
          item.anime.notes,
          `Import forcé manuellement le ${new Date().toLocaleDateString("fr-FR")}.`
        ].filter(Boolean).join("\n");
      }
      approvedRaw.push(item);
    }

    if (job.cancelRequested) return finishCancelled();
    setCsvImportProgress(progressId, job, {
      status: "running",
      phase: "relations",
      percent: 7,
      done: 0,
      total: approvedRaw.length,
      current: `Répartition des saisons BetaSeries — ${approvedRaw.length} anime confirmé(s)`
    });

    // Important : l'import interactif ne doit jamais attendre une longue série
    // de replis Jikan titre par titre. AniList est interrogé par lots pendant un
    // budget réseau borné ; si une relation reste inconnue, la fiche est importée
    // avec « progression à vérifier » plutôt que de bloquer toute l'interface.
    const importNetworkBudgetMs = Math.max(250, Math.min(45000, Number(process.env.ALM_BETASERIES_IMPORT_NETWORK_BUDGET_MS || 24000)));
    const importAniListTimeoutMs = Math.max(200, Math.min(12000, Number(process.env.ALM_BETASERIES_IMPORT_ANILIST_TIMEOUT_MS || 6500)));
    const selected = await expandBetaSeriesProgressItems(approvedRaw, {
      boundedNetwork: true,
      networkBudgetMs: importNetworkBudgetMs,
      aniListTimeoutMs: importAniListTimeoutMs,
      batchConcurrency: 3,
      jikanFallbackLimit: 0,
      shouldStop: () => job.cancelRequested,
      signal: job.abortController.signal,
      onProgress: info => {
        if (job.cancelRequested) return;
        const total = Math.max(1, Number(info.total || approvedRaw.length || 1));
        const done = Math.max(0, Math.min(total, Number(info.done || 0)));
        let percent = 8;
        if (info.phase === "relations") percent = 8 + Math.round((done / total) * 50);
        else if (info.phase === "distribution") percent = 58 + Math.round((done / total) * 16);
        setCsvImportProgress(progressId, job, {
          status: "running",
          phase: info.phase || "relations",
          percent: Math.max(8, Math.min(74, percent)),
          done,
          total,
          current: info.current || "Répartition des saisons…"
        });
      }
    });

    if (job.cancelRequested) return finishCancelled();

    const animes = readAnimes();
    const importBefore=JSON.parse(JSON.stringify(animes));
    const byTitle = new Map(animes.map(a => [normalizeTitle(a.title), a]));
    const byMalId = new Map(animes.filter(a => a?.malId).map(a => [String(a.malId), a]));
    const byAniListId = new Map(animes.filter(a => a?.anilistId).map(a => [String(a.anilistId), a]));

    let added = 0;
    let updated = 0;
    let ignored = 0;
    let progressionToReview = 0;

    setCsvImportProgress(progressId, job, {
      status: "running",
      phase: "merge",
      percent: 76,
      done: 0,
      total: selected.length,
      current: `Préparation de la bibliothèque — ${selected.length} fiche(s)`
    });

    for (let index = 0; index < selected.length; index++) {
      if (job.cancelRequested) return finishCancelled();
      const item = selected[index];
      const incoming = item?.anime || item;
      if (!incoming || !incoming.title) {
        ignored++;
        continue;
      }
      if (incoming.needsSequelCheck || (Array.isArray(incoming.tags) && incoming.tags.some(tag => /progression à vérifier/i.test(String(tag))))) {
        progressionToReview++;
      }

      const key = normalizeTitle(incoming.title);
      const malKey = incoming.malId ? String(incoming.malId) : "";
      const aniListKey = incoming.anilistId ? String(incoming.anilistId) : "";
      const existing = (malKey && byMalId.get(malKey)) || (aniListKey && byAniListId.get(aniListKey)) || byTitle.get(key) || animes.find(a=>seasonResolver.sameSeason(a,incoming));

      if (existing) {
        const existingIndex = animes.findIndex(a => Number(a.id) === Number(existing.id));
        if (existingIndex >= 0) {
          animes[existingIndex] = mergeImportedAnime(animes[existingIndex], incoming, overwrite);
          const merged = animes[existingIndex];
          if (merged?.title) byTitle.set(normalizeTitle(merged.title), merged);
          if (merged?.malId) byMalId.set(String(merged.malId), merged);
          if (merged?.anilistId) byAniListId.set(String(merged.anilistId), merged);
          updated++;
        } else {
          ignored++;
        }
      } else {
        incoming.id = nextId(animes);
        animes.push(incoming);
        byTitle.set(key, incoming);
        if (malKey) byMalId.set(malKey, incoming);
        if (aniListKey) byAniListId.set(aniListKey, incoming);
        added++;
      }

      if ((index + 1) % 12 === 0 || index + 1 === selected.length) {
        await yieldToEventLoop();
        const ratio = selected.length ? (index + 1) / selected.length : 1;
        setCsvImportProgress(progressId, job, {
          status: "running",
          phase: "merge",
          percent: 76 + Math.round(ratio * 19),
          done: index + 1,
          total: selected.length,
          current: `Fusion dans la bibliothèque — ${index + 1}/${selected.length}`
        });
      }
    }

    if (job.cancelRequested) return finishCancelled();

    // À partir de cette étape, les données vont être écrites. On désactive
    // l'annulation pour éviter un état « moitié écrit / moitié annulé ».
    job.committing = true;
    setCsvImportProgress(progressId, job, {
      status: "running",
      phase: "commit",
      percent: 97,
      done: selected.length,
      total: selected.length,
      current: "Enregistrement final de la bibliothèque…"
    });

    commitImportedLibrary(importBefore,animes);
    const persisted=readAnimes(),beforeIds=new Set(importBefore.map(a=>Number(a.id)));
    added=persisted.filter(a=>!beforeIds.has(Number(a.id))).length;
    updated=persisted.filter(a=>beforeIds.has(Number(a.id))&&JSON.stringify(a)!==JSON.stringify(importBefore.find(b=>Number(b.id)===Number(a.id)))).length;
    progressionToReview=completionIssueItems(persisted).filter(a=>a.kind==='progress'||a.kind==='season').length;
    automation.record('import-reconciliation',importBefore,persisted);

    for (const rawItem of approvedRaw) {
      await markPendingMediaReviewDecision(mediaReviewImportKey(rawItem), "imported", {
        state: "imported",
        importedAt: new Date().toISOString()
      });
    }

    setCsvImportProgress(progressId, job, {
      status: "done",
      phase: "done",
      percent: 100,
      done: selected.length,
      total: selected.length,
      current: progressionToReview > 0
        ? `Import terminé — ${progressionToReview} progression(s) multi-saisons restent à vérifier.`
        : "Import terminé."
    });

    return res.json({
      ok: true,
      progressId,
      total: selectedRaw.length,
      approved: approvedRaw.length,
      added,
      updated,
      ignored,
      blocked: blockedItems.length,
      blockedItems,
      progressionToReview,
      overwrite
    });
  } catch (error) {
    if (job.cancelRequested && !job.committing) return finishCancelled();
    setCsvImportProgress(progressId, job, {
      status: "error",
      phase: "error",
      percent: Number(CSV_PROGRESS[progressId]?.percent || 0),
      done: Number(CSV_PROGRESS[progressId]?.done || 0),
      total: Number(CSV_PROGRESS[progressId]?.total || selectedRaw.length),
      current: `Erreur pendant l’import : ${error.message}`
    });
    return res.status(500).json({ error: "Import CSV impossible : " + error.message, progressId });
  } finally {
    CSV_JOBS.delete(progressId);
  }
}

let automationRetryTimer=null;
function enqueueCompletion(kind,payload={},id=completionJobId(kind),options={}){
 const stored=automation.enqueue(kind,payload,id,options);
 if(!['done','error','cancelled'].includes(stored.status))_completeAllJobs[id]={...newCompletionJob(kind==='complete-all'?'complete-all':'info-images'),...(stored.progress||{}),status:stored.status==='retrying'?'retrying':'queued',phase:'queued',startedAt:stored.startedAt||stored.createdAt,current:'Traitement enregistré — démarrage automatique'};
 return stored;
}
function queueCompletionRequest(kind,req,res){
 const ids=req.body?.ids;
 if(ids!==undefined&&(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(v=>!Number.isSafeInteger(Number(v))||Number(v)<=0)))return res.status(400).json({error:'Sélection de fiches invalide.'});
 const job=enqueueCompletion(kind,{overwrite:req.body?.overwrite===true,retryMarked:req.body?.retryMarked===true,...(ids?{ids:ids.map(Number)}:{})});
 res.json({ok:true,jobId:job.id,kind:kind==='complete-all'?'complete-all':'info-images',status:job.status});
}
app.post('/api/bulk/info-only',(req,res)=>queueCompletionRequest('info-images',req,res));
app.post('/api/bulk/complete-all',(req,res)=>queueCompletionRequest('complete-all',req,res));
app.post('/api/import/csv',async(req,res)=>{
 const items=req.body?.items;if(!Array.isArray(items)||items.length>10000)return res.status(400).json({error:'Entrées d’import invalides.'});
 const id=String(req.body?.progressId||completionJobId('import'));
 if(!/^[\w:-]{1,100}$/.test(id))return res.status(400).json({error:'Identifiant d’import invalide.'});
 const job=automation.enqueue('csv-import',{items,overwrite:req.body?.overwrite===true,progressId:id},id);
 if(!CSV_PROGRESS[id])setCsvProgress(id,{kind:'import',status:'queued',phase:'queued',percent:0,total:items.length,done:0,current:'Import enregistré — préparation automatique'});
 if(req.body?.background===true)return res.status(202).json({ok:true,queued:true,progressId:id});
 // Compatibility with existing callers. The renderer uses the immediate path.
 while(!['done','error','cancelled'].includes(job.status)&&!runtimeStopping)await new Promise(r=>setTimeout(r,30));
 if(job.status==='error')return res.status(500).json({error:job.error||job.result?.error||'Import interrompu',progressId:id});
 return res.json(job.result||{ok:true,cancelled:true,progressId:id});
});
async function runAutomationCompletion(stored){
 while(Object.entries(_completeAllJobs).some(([id,j])=>id!==stored.id&&['running','cancelling'].includes(j.status))&&!runtimeStopping)await new Promise(r=>setTimeout(r,100));
 let responseCode=200,response;
 const res={status(code){responseCode=code;return this;},json(value){response=value;return this;}};
 const monitor=setInterval(()=>{const job=_completeAllJobs[stored.id];if(job)automation.checkpoint(stored.id,job);},750);monitor.unref?.();
 try{
  const handler=stored.kind==='complete-all'?executeCompleteAll:executeInfoCompletion;
  await handler({body:{...stored.payload,_automationId:stored.id,_resumeCompleted:stored.resumed?stored.progress?.completedIds:undefined}},res);
  if(responseCode>=400||!response?.jobId)throw Error(response?.error||'Traitement non démarré');
  const job=_completeAllJobs[stored.id];
  while(!['done','error','cancelled'].includes(job.status)&&!runtimeStopping)await new Promise(r=>setTimeout(r,50));
  automation.checkpoint(stored.id,job);
  if(job.status==='done')scheduleDeferredCompletion();
  return {...job};
 }finally{clearInterval(monitor);}
}
async function runAutomationImport(stored){
 let code=200;let payload;
 const res={status(value){code=value;return this;},json(value){payload=value;return this;}};
 const monitor=setInterval(()=>{const progress=CSV_PROGRESS[stored.id];if(progress)automation.checkpoint(stored.id,progress);},750);monitor.unref?.();
 try{
  await executeCsvImport({body:stored.payload},res);
  if(code>=400)throw Error(payload?.error||'Import non enregistré');
  if(payload?.ok&&!payload.cancelled){
   const ids=readAnimes().filter(a=>needsAnimeInfo(a,{retryMarked:true})||needsAnimeImage(a,{retryMarked:true})).map(a=>Number(a.id));
   if(ids.length){const follow=enqueueCompletion('info-images',{ids,retryMarked:true,automatic:true},stored.id+':enrich');payload.enrichmentJobId=follow.id;}
  }
  setCsvProgress(stored.id,{result:payload});automation.checkpoint(stored.id,CSV_PROGRESS[stored.id]);
  return payload;
 }finally{clearInterval(monitor);}
}
function scheduleDeferredCompletion(){
 if(runtimeStopping)return;
 const all=readAnimes(),stale=all.filter(a=>a.resolutionAssessment&&!resolutionWaitingCurrent(a));
 const pending=automation.jobs().filter(j=>['queued','running','retrying'].includes(j.status)&&['info-images','complete-all'].includes(j.kind));
 const newIds=[];
 for(const a of stale){const task=pending.find(j=>{const ids=automation.job(j.id)?.payload?.ids;return !ids||ids.some(id=>Number(id)===Number(a.id));});if(task){if(automation.wake(task.id)&&_completeAllJobs[task.id])_completeAllJobs[task.id].status='queued';}else newIds.push(Number(a.id));}
 if(newIds.length)enqueueCompletion('info-images',{ids:newIds,retryMarked:true,automatic:true});
 const rows=all.filter(a=>resolutionWaitingCurrent(a));
 const scheduled=automation.jobs().filter(j=>['queued','running','retrying'].includes(j.status)&&j.id.startsWith('automatic-recheck-'));
 if(rows.length&&!scheduled.length){
  const at=Math.max(Date.now()+60000,Math.min(...rows.map(a=>Number(a.resolutionAssessment.nextCheckAt)||Date.now()+86400000)));
  enqueueCompletion('info-images',{ids:rows.filter(a=>Number(a.resolutionAssessment.nextCheckAt)<=at).map(a=>Number(a.id)),retryMarked:true,automatic:true},'automatic-recheck-'+at,{notBefore:at});
 }
 clearTimeout(automationRetryTimer);
 automationRetryTimer=setTimeout(()=>scheduleDeferredCompletion(),60000);automationRetryTimer.unref?.();
}
async function startLibraryAutomation(...args){return mediaReviewQueue.run(()=>startLibraryAutomationUnlocked(...args));}
async function startLibraryAutomationUnlocked(legacyImportedIds=[]){
 for(const stored of automation.jobs()){
  if(stored.kind==='csv-import')CSV_PROGRESS[stored.id]={...(stored.progress||{}),id:stored.id,kind:'import',status:['queued','running'].includes(stored.status)?'queued':stored.status};
  else if(['info-images','complete-all'].includes(stored.kind))_completeAllJobs[stored.id]={...newCompletionJob(stored.kind),...(stored.progress||{}),status:stored.status==='running'?'queued':stored.status,startedAt:stored.startedAt||stored.createdAt};
 }
 automation.start({'csv-import':runAutomationImport,'info-images':runAutomationCompletion,'complete-all':runAutomationCompletion});
 if(legacyImportedIds.length&&process.env.ALM_AUTOMATION_STARTUP!=='0'){
  const review=await readMediaReviewState();await enrichMediaReviewStateLocal(review);
  const imported=new Set(readAnimes().map(a=>String(a.betaseriesSeriesId||a.betaseriesId||''))),approved=[];
  for(const item of review.pendingImports||[]){
   if(item.state!=='pending')continue;
   const source=item.sourceTitle||item.row?.title||'';
   const candidates=localSeasonSearch(source,100).map(row=>metadataToFound(row,source,100)).filter(found=>importCandidateValidation.validate({...item.row,title:source},found,item.tvmaze).classification==='anime'&&mediaClassifier.candidateTitleScore(source,found)>=96);
   const unique=[...new Map(candidates.map(a=>[String(a.malId),a])).values()];
   if(unique.length!==1||imported.has(String(item.row?.id||item.anime?.betaseriesSeriesId||'')))continue;
   approved.push({...item,sourceTitle:source,classification:'anime',found:unique[0],anime:buildAnimeFromBetaSeries(item.row,unique[0],'anime',item.tvmaze)});
  }
  await writeMediaReviewState(review);
  automation.once('beta56-common-resolver',()=>{
   if(approved.length)automation.enqueue('csv-import',{items:approved,overwrite:false,progressId:'beta56-upgrade:imports'},'beta56-upgrade:imports');
   enqueueCompletion('info-images',{ids:legacyImportedIds,retryMarked:true,automatic:true},'beta56-upgrade:reconcile');
  });
  automation.once('beta57-season-normalization',()=>enqueueCompletion('info-images',{ids:legacyImportedIds,retryMarked:true,automatic:true},'beta57-upgrade:reconcile'));
 }
 scheduleDeferredCompletion();
}
app.get('/api/library/automation',(req,res)=>res.json({jobs:automation.jobs(),history:automation.history(readAnimes())}));
app.post('/api/library/corrections/:id/undo',(req,res)=>{
 try{const result=automation.undo(req.params.id,readAnimes());writeAnimes(result.rows);result.commit();res.json({ok:true});}catch(error){res.status(error.status||500).json({code:error.message});}
});




app.get("/api/v2/lexicon/examples", async (req, res) => {
  try {
    await db.whenReady();
    const ids = Array.from(new Set(String(req.query?.ids || "")
      .split(",")
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0)))
      .slice(0, 140);
    const items = ids.map(id => db.getMetadataByMalId(id)).filter(Boolean).map(meta => ({
      malId: Number(meta.malId || 0),
      title: String(meta.titleEn || meta.title || meta.titleRomaji || `Anime ${meta.malId}`),
      type: String(meta.type || ""),
      year: String(meta.startDate || "").slice(0, 4),
      imagePath: meta.imageUrl ? `/api/v2/lexicon/example-image/${Number(meta.malId || 0)}` : "",
      malUrl: meta.malId ? `https://myanimelist.net/anime/${Number(meta.malId)}` : ""
    }));
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ error: "Exemples du dictionnaire indisponibles : " + error.message });
  }
});

app.get("/api/v2/lexicon/example-image/:malId", async (req, res) => {
  try {
    await db.whenReady();
    const meta = db.getMetadataByMalId(req.params.malId);
    if (!meta?.imageUrl) return res.status(404).end();
    const localPath = await cacheExternalImageStable(meta.imageUrl, meta.titleEn || meta.title || `anime-${meta.malId}`, "lexicon");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    if (localPath) return res.redirect(302, localPath);
    return res.redirect(302, meta.imageUrl);
  } catch {
    return res.status(404).end();
  }
});

function auditTvCandidateFromAnimeRecord(anime) {
  if (!anime || typeof anime !== "object") return null;
  const tags = Array.isArray(anime.tags) ? anime.tags.map(value => String(value || "").trim()) : [];
  const hasTvMarker = anime.nonAnimeFallback === true || anime.mediaKind === "non_anime" || Boolean(anime.tvmazeId) ||
    tags.some(tag => /^(?:tvmaze|hors anime probable|non anime probable|serie tv probable)$/i.test(tag));
  if (!hasTvMarker) return null;
  const taggedName = tags.find(tag => /^tvmaze\s*:/i.test(tag))?.replace(/^tvmaze\s*:\s*/i, "") || "";
  return sanitizeMediaReviewTv({
    id: anime.tvmazeId || "",
    name: taggedName || anime.title || "",
    type: anime.tvmazeType || anime.type || "Série TV",
    language: anime.tvmazeLanguage || "",
    genres: Array.isArray(anime.genres) ? anime.genres : [],
    premiered: anime.startDate || "",
    ended: anime.endDate || "",
    status: anime.tvmazeStatus || "",
    country: anime.tvmazeCountry || "",
    network: Array.isArray(anime.studios) ? anime.studios[0] || "" : anime.studio || "",
    imageUrl: mediaReviewImageUrl(anime.poster, anime.imageUrl),
    url: anime.tvmazeUrl || anime.malUrl || "",
    matchingScore: 98,
    source: "TVMaze / fiche importée"
  });
}

function auditLocalFoundCandidate(title, current = null, anime = null) {
  const query = String(title || anime?.title || "").trim();
  let existing = sanitizeMediaReviewFound(current);
  if (existing && !mediaReviewFoundReliability(query, existing).reliable) existing = null;
  let local = null;
  try {
    const malId = Number(existing?.malId || 0);
    if (malId > 0 && db?.getMetadataByMalId) {
      const row = db.getMetadataByMalId(malId);
      if (row) {
        const byId = metadataToFound(row, query || row.title || "", 100);
        if (mediaReviewFoundReliability(query, byId).reliable) local = byId;
      }
    }
    if (!local && typeof searchMetadataLocal === "function" && query) {
      const minScore = Math.max(70, Number(mediaClassifier.minimumAnimeScore(query) || 70));
      const fresh = searchMetadataLocal(query, { minScore, limit: 12, tokenLimit: 120 });
      if (fresh && mediaReviewFoundReliability(query, fresh).reliable) local = fresh;
    }
  } catch {}
  const chosen = local || existing;
  if (!chosen) return null;
  return sanitizeMediaReviewFound({
    ...chosen,
    title: chosen?.title || query || "",
    officialTitle: chosen?.officialTitle || chosen?.title || query || "",
    imageUrl: mediaReviewImageUrl(chosen?.imageUrl),
    matchingScore: Number(mediaClassifier.candidateTitleScore(query, chosen) || 0)
  });
}

function auditEvidenceFromCandidates(title, found, tvmaze, fallback = []) {
  const verdict = mediaClassifier.classifyImportCandidate({ title, animeFound: found, tvFound: tvmaze });
  return Array.isArray(verdict?.evidence) && verdict.evidence.length
    ? verdict.evidence
    : (Array.isArray(fallback) ? fallback : []);
}

function contentAuditEntryFromCandidate(item, animeRecord = null, foundOverride = undefined, tvOverride = undefined) {
  const id = Number(item?.animeId || item?.id || animeRecord?.id || 0);
  const title = String(item?.title || animeRecord?.title || "");
  const found = foundOverride === undefined
    ? auditLocalFoundCandidate(title, null, animeRecord || item)
    : sanitizeMediaReviewFound(foundOverride);
  const tvmaze = tvOverride === undefined
    ? auditTvCandidateFromAnimeRecord(animeRecord || item)
    : sanitizeMediaReviewTv(tvOverride);
  const classification = String(item?.classification || "review");
  const evidence = auditEvidenceFromCandidates(title, found, tvmaze, item?.evidence);
  const sourceImageUrl = mediaReviewImageUrl(
    classification === "non_anime" ? tvmaze?.imageUrl : "",
    item?.sourceImageUrl,
    item?.poster,
    animeRecord?.poster,
    animeRecord?.imageUrl,
    found?.imageUrl,
    tvmaze?.imageUrl
  );
  return {
    key: `library:${id}`,
    ref: `library:${id}`,
    id,
    title,
    poster: sourceImageUrl,
    sourceImageUrl,
    status: item?.status || animeRecord?.status || "",
    type: item?.type || animeRecord?.type || "",
    startDate: item?.startDate || animeRecord?.startDate || "",
    tags: Array.isArray(item?.tags) ? item.tags : (Array.isArray(animeRecord?.tags) ? animeRecord.tags : []),
    source: (Array.isArray(item?.tags || animeRecord?.tags) && (item?.tags || animeRecord?.tags).some(tag => String(tag || "").toLowerCase() === "betaseries")) ? "BetaSeries" : "Bibliothèque",
    classification,
    confidence: Number(item?.confidence || 0),
    reason: String(item?.reason || "À vérifier."),
    evidence,
    found,
    tvmaze
  };
}

function contentAuditQuarantineEntry(item, kind = "pending") {
  if (kind === "quarantined") {
    const title = String(item?.anime?.title || item?.title || "");
    const found = auditLocalFoundCandidate(title, item?.found, item?.anime);
    const tvmaze = sanitizeMediaReviewTv(item?.tvmaze) || auditTvCandidateFromAnimeRecord(item?.anime);
    const classification = String(item?.classification || "non_anime");
    const sourceImageUrl = mediaReviewImageUrl(
      classification === "non_anime" ? tvmaze?.imageUrl : "",
      item?.sourceImageUrl,
      item?.anime?.poster,
      item?.anime?.imageUrl,
      found?.imageUrl,
      tvmaze?.imageUrl
    );
    return {
      key: String(item?.quarantineId || ""),
      ref: `removed:${String(item?.quarantineId || "")}`,
      source: "Bibliothèque",
      sourceId: String(item?.originalId || item?.anime?.id || ""),
      sourceTitle: title,
      sourceImageUrl,
      classification,
      reason: String(item?.reason || "Retiré de la bibliothèque et conservé en quarantaine."),
      confidence: Number(item?.confidence || 0),
      evidence: auditEvidenceFromCandidates(title, found, tvmaze, item?.evidence),
      anime: item?.anime || {},
      found,
      tvmaze,
      state: "removed",
      createdAt: item?.createdAt || "",
      updatedAt: item?.updatedAt || ""
    };
  }
  const title = String(item?.sourceTitle || item?.anime?.title || "");
  const found = auditLocalFoundCandidate(title, item?.found, item?.anime);
  const tvmaze = sanitizeMediaReviewTv(item?.tvmaze) || auditTvCandidateFromAnimeRecord(item?.anime);
  const classification = String(item?.classification || "review");
  return {
    ...item,
    key: String(item?.key || ""),
    ref: `pending:${String(item?.key || "")}`,
    sourceImageUrl: mediaReviewImageUrl(
      classification === "non_anime" || (/betaseries/i.test(String(item?.source || "")) && tvmaze?.imageUrl) ? tvmaze?.imageUrl : "",
      item?.sourceImageUrl,
      item?.anime?.poster,
      item?.anime?.imageUrl,
      found?.imageUrl,
      tvmaze?.imageUrl
    ),
    found,
    tvmaze,
    evidence: auditEvidenceFromCandidates(title, found, tvmaze, item?.evidence),
    state: String(item?.state || "pending")
  };
}

async function cacheMediaReviewVisual(url, title, namespace) {
  const source = mediaReviewImageUrl(url);
  if (!source || source.startsWith("/images/") || source.startsWith("/assets/") || /^(?:data:|blob:|file:)/i.test(source)) return source;
  const cached = await cacheExternalImageStable(source, title || "media", namespace);
  return cached || source;
}

async function resolvePendingMediaReviewVisual(item) {
  const title = String(item?.sourceTitle || item?.anime?.title || "").trim();
  let found = auditLocalFoundCandidate(title, item?.found, item?.anime);
  let tvmaze = sanitizeMediaReviewTv(item?.tvmaze) || auditTvCandidateFromAnimeRecord(item?.anime);
  const wantsTv = item?.classification === "non_anime" || /betaseries/i.test(String(item?.source || "")) ||
    mediaReviewEvidenceScore(item, "tv") > 0;
  if (wantsTv && (!tvmaze?.name || !mediaReviewImageUrl(tvmaze.imageUrl))) {
    const fetched = await searchTvmazeAuditCandidate(title, tvmaze?.id).catch(() => null);
    if (fetched) tvmaze = sanitizeMediaReviewTv({ ...(tvmaze || {}), ...fetched, imageUrl: fetched.imageUrl || tvmaze?.imageUrl || "" });
  }
  if (found?.imageUrl) found.imageUrl = mediaReviewImageUrl(found.imageUrl);
  if (tvmaze?.imageUrl) tvmaze.imageUrl = mediaReviewImageUrl(tvmaze.imageUrl);

  const verdict = mediaClassifier.classifyImportCandidate({ title, animeFound: found, tvFound: tvmaze });
  let classification = String(item?.classification || "review");
  let reason = String(item?.reason || "À vérifier.");
  let confidence = Number(item?.confidence || item?.score || 0);
  if (["review", "non_anime"].includes(verdict.classification)) {
    classification = verdict.classification;
    reason = verdict.reason || reason;
    confidence = Number(verdict.confidence || confidence);
  } else if (verdict.classification === "anime" && classification === "review") {
    reason = "Une fiche anime fiable a été retrouvée après l’import. Compare les deux candidats puis utilise « Forcer dans la bibliothèque » si c’est bien l’œuvre attendue.";
    confidence = Number(verdict.confidence || confidence);
  }

  const anime = { ...(item?.anime || {}) };
  const foundImage = mediaReviewImageUrl(found?.imageUrl);
  const tvImage = mediaReviewImageUrl(tvmaze?.imageUrl);
  if (classification === "non_anime") anime.poster = tvImage || anime.poster || foundImage;
  else anime.poster = foundImage || anime.poster || tvImage;
  anime.imageUrl = anime.imageUrl || foundImage || tvImage;

  return sanitizePendingMediaReviewItem({
    ...item,
    classification,
    reason,
    score: confidence,
    confidence,
    evidence: auditEvidenceFromCandidates(title, found, tvmaze, item?.evidence),
    found,
    tvmaze,
    anime,
    sourceImageUrl: classification === "non_anime" || (/betaseries/i.test(String(item?.source || "")) && tvImage)
      ? (tvImage || foundImage)
      : (foundImage || tvImage)
  }, item);
}

async function resolveQuarantinedMediaReviewVisual(item) {
  const title = String(item?.anime?.title || item?.sourceTitle || "").trim();
  let found = auditLocalFoundCandidate(title, item?.found, item?.anime);
  let tvmaze = sanitizeMediaReviewTv(item?.tvmaze) || auditTvCandidateFromAnimeRecord(item?.anime);
  const wantsTv = item?.classification === "non_anime" || mediaReviewEvidenceScore(item, "tv") > 0 || Boolean(tvmaze);
  if (wantsTv && (!tvmaze?.name || !mediaReviewImageUrl(tvmaze.imageUrl))) {
    const fetched = await searchTvmazeAuditCandidate(title, tvmaze?.id || item?.anime?.tvmazeId).catch(() => null);
    if (fetched) tvmaze = sanitizeMediaReviewTv({ ...(tvmaze || {}), ...fetched, imageUrl: fetched.imageUrl || tvmaze?.imageUrl || "" });
  }
  if (found?.imageUrl) found.imageUrl = mediaReviewImageUrl(found.imageUrl);
  if (tvmaze?.imageUrl) tvmaze.imageUrl = mediaReviewImageUrl(tvmaze.imageUrl);

  const anime = { ...(item?.anime || {}) };
  const foundImage = mediaReviewImageUrl(found?.imageUrl);
  const tvImage = mediaReviewImageUrl(tvmaze?.imageUrl);
  if (item?.classification === "non_anime") anime.poster = tvImage || anime.poster || foundImage;
  else anime.poster = anime.poster || foundImage || tvImage;
  anime.imageUrl = anime.imageUrl || foundImage || tvImage;
  return sanitizeQuarantinedMediaReviewItem({
    ...item,
    anime,
    found,
    tvmaze,
    sourceImageUrl: item?.classification === "non_anime" ? (tvImage || foundImage) : (foundImage || tvImage),
    evidence: auditEvidenceFromCandidates(title, found, tvmaze, item?.evidence),
    updatedAt: new Date().toISOString()
  });
}

async function resolveLibraryMediaReviewVisual(id, state) {
  const library = readAnimes();
  const index = library.findIndex(anime => Number(anime?.id || 0) === Number(id));
  if (index < 0) return null;
  const anime = { ...library[index] };
  const title = String(anime.title || "").trim();
  const classification = mediaClassifier.classifyLibraryEntry(anime, metadataMatchForMediaReview(anime));
  let found = auditLocalFoundCandidate(title, metadataMatchForMediaReview(anime), anime);
  let tvmaze = auditTvCandidateFromAnimeRecord(anime);
  const wantsTv = classification.classification === "non_anime" ||
    (Array.isArray(classification.evidence) && classification.evidence.some(evidence => evidence?.kind === "tv"));
  if (wantsTv && (!tvmaze?.name || !mediaReviewImageUrl(tvmaze.imageUrl))) {
    const fetched = await searchTvmazeAuditCandidate(title, tvmaze?.id || anime.tvmazeId).catch(() => null);
    if (fetched) tvmaze = fetched;
  }
  if (found?.imageUrl) found.imageUrl = mediaReviewImageUrl(found.imageUrl);
  if (tvmaze?.imageUrl) tvmaze.imageUrl = mediaReviewImageUrl(tvmaze.imageUrl);
  const preferred = classification.classification === "non_anime"
    ? mediaReviewImageUrl(tvmaze?.imageUrl, anime.poster, anime.imageUrl, found?.imageUrl)
    : mediaReviewImageUrl(anime.poster, anime.imageUrl, found?.imageUrl, tvmaze?.imageUrl);
  const latest = db.getAnimeById(id);
  if (!latest || seasonReference.identity(latest) !== seasonReference.identity(anime)) return null;
  const visualChanges = {};
  if (preferred && latest.poster === anime.poster && !metadataPreferences.locked(latest, 'poster')) visualChanges.poster = preferred;
  if (preferred && !latest.imageUrl && !metadataPreferences.locked(latest, 'imageUrl')) visualChanges.imageUrl = preferred;
  Object.assign(anime, latest, visualChanges);
  if (Object.keys(visualChanges).some(key => latest[key] !== visualChanges[key])) db.updateAnime(id, visualChanges, { save: "memory" });

  const analysisIndex = state.analysis?.items?.findIndex(item => Number(item?.animeId || item?.id || 0) === Number(id)) ?? -1;
  const base = analysisIndex >= 0 ? state.analysis.items[analysisIndex] : mediaReviewCandidateFromAnime(anime, classification);
  const enrichedEvidence = auditEvidenceFromCandidates(title, found, tvmaze, base?.evidence);
  const acceptedPoster = anime.poster || anime.imageUrl || "";
  if (analysisIndex >= 0) {
    state.analysis.items[analysisIndex] = { ...base, poster: acceptedPoster, evidence: enrichedEvidence };
  }
  return contentAuditEntryFromCandidate({ ...base, poster: acceptedPoster, evidence: enrichedEvidence }, anime, found, tvmaze);
}

let _contentAuditProgress = { status: "idle", percent: 0, done: 0, total: 0, phase: "idle", current: "", updatedAt: Date.now() };
function setContentAuditProgress(patch = {}) {
  _contentAuditProgress = { ..._contentAuditProgress, ...patch, updatedAt: Date.now() };
  return _contentAuditProgress;
}

let contentAuditCache=null,contentAuditPending=null;
function contentAuditKey(){const files=[MEDIA_REVIEW_FILE,ALIASES_FILE];return crypto.createHash('sha256').update(JSON.stringify(readAnimes())).update(files.map(f=>{try{return fs.statSync(f).mtimeMs;}catch{return 0;}}).join('|')).update(String(db.getMetadataStats?.().count||0)).digest('hex');}
async function contentAuditPayload(options={}){
 const freshCompletion=payload=>({...payload,completion:{items:completionIssueItems(),awaiting:completionAwaitingItems()}});
 const key=contentAuditKey();if(!options.force&&contentAuditCache?.key===key&&Date.now()-contentAuditCache.at<30000){options.onProgress?.({status:'done',phase:'done',percent:100,current:'Contrôle anime prêt.'});return freshCompletion(contentAuditCache.payload);}
 if(contentAuditPending)return contentAuditPending;
 contentAuditPending=contentAuditPayloadUncached(options).then(payload=>{payload=freshCompletion(payload);contentAuditCache={key:contentAuditKey(),at:Date.now(),payload};return payload;}).finally(()=>{contentAuditPending=null;});return contentAuditPending;
}
async function contentAuditPayloadUncached(options = {}) {
  const report = typeof options.onProgress === "function" ? options.onProgress : () => {};
  report({ status: "running", phase: "library", percent: 3, done: 0, total: 0, current: "Préparation de la bibliothèque…" });
  const analysis = await analyseLibraryMediaKinds({
    force: options.force === true,
    onProgress: info => {
      const total = Math.max(1, Number(info?.total || 1));
      const done = Math.max(0, Number(info?.done || 0));
      report({ status: "running", phase: "library", percent: 5 + Math.round((done / total) * 48), done, total, current: `Bibliothèque — ${info?.current || "analyse locale"}` });
    }
  });
  report({ status: "running", phase: "quarantine", percent: 57, done: 0, total: 0, current: "Vérification des imports et de la quarantaine…" });
  const state = await readMediaReviewState();
  const localEnrichment = await enrichMediaReviewStateLocal(state, {
    onProgress: info => {
      const total = Math.max(1, Number(info?.total || 1));
      const done = Math.max(0, Number(info?.done || 0));
      report({ status: "running", phase: "quarantine", percent: 57 + Math.round((done / total) * 34), done, total, current: `Quarantaine — ${info?.current || "vérification"}` });
    }
  });
  if (localEnrichment.changed) await writeMediaReviewState(state);
  const libraryById = new Map(readAnimes().map(anime => [Number(anime?.id || 0), anime]));
  const suspects = (Array.isArray(analysis.items) ? analysis.items : []).map(item => {
    const record = libraryById.get(Number(item?.animeId || item?.id || 0)) || null;
    return contentAuditEntryFromCandidate(item, record);
  });
  const pendingRows = state.pendingImports.filter(item => item?.state === "pending");
  const autoExcludedRows = state.pendingImports.filter(item =>
    item?.state === "auto_excluded" || (item?.state === "pending" && mediaReviewIsCertainGeneralTv(item))
  );
  const pending = pendingRows
    .filter(item => !mediaReviewIsCertainGeneralTv(item))
    .map(item => contentAuditQuarantineEntry(item, "pending"));
  const removed = state.quarantined
    .map(item => contentAuditQuarantineEntry(item, "quarantined"));
  const visibleQuarantine = [...removed, ...pending]
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  report({ status: "running", phase: "finalize", percent: 96, done: visibleQuarantine.length, total: visibleQuarantine.length, current: "Préparation de l’affichage…" });
  await yieldToEventLoop();
  report({ status: "done", phase: "done", percent: 100, done: visibleQuarantine.length, total: visibleQuarantine.length, current: "Contrôle anime prêt." });
  return {
    ok: true,
    completion: {items:completionIssueItems([...libraryById.values()]),awaiting:completionAwaitingItems([...libraryById.values()])},
    library: {
      total: Number(analysis.total || 0),
      confirmed: Math.max(0, Number(analysis.total || 0) - suspects.length),
      suspects,
      nonAnime: suspects.filter(item => item.classification === "non_anime").length,
      review: suspects.filter(item => item.classification === "review").length,
      scannedAt: state.analysis?.updatedAt || new Date().toISOString(),
      cached: Boolean(analysis.cached)
    },
    quarantine: {
      total: visibleQuarantine.length,
      pending: pending.length,
      removed: removed.length,
      nonAnime: visibleQuarantine.filter(item => item.classification === "non_anime").length,
      review: visibleQuarantine.filter(item => item.classification === "review").length,
      autoExcluded: autoExcludedRows.length,
      items: visibleQuarantine
    }
  };
}

let _mediaReviewAliasRefreshTimer = null;
let _mediaReviewAliasRefreshRunning = false;
let _mediaReviewAliasRefreshRequested = false;

function scheduleMediaReviewAliasRefresh(delayMs = 10000) {
  _mediaReviewAliasRefreshRequested = true;
  if (_mediaReviewAliasRefreshRunning) return;
  if (_mediaReviewAliasRefreshTimer) clearTimeout(_mediaReviewAliasRefreshTimer);
  _mediaReviewAliasRefreshTimer = setTimeout(async () => {
    _mediaReviewAliasRefreshTimer = null;
    _mediaReviewAliasRefreshRunning = true;
    _mediaReviewAliasRefreshRequested = false;
    try {
      await refreshAliasCacheFromLibrary();
    } catch {}
    finally {
      _mediaReviewAliasRefreshRunning = false;
      // Plusieurs choix successifs ne doivent jamais lancer plusieurs scans en
      // parallèle. Si une nouvelle décision est arrivée pendant le scan, on
      // refait au maximum une passe, après une nouvelle période de calme.
      if (_mediaReviewAliasRefreshRequested) scheduleMediaReviewAliasRefresh(delayMs);
    }
  }, Math.max(1000, Number(delayMs) || 10000));
  _mediaReviewAliasRefreshTimer.unref?.();
}

// Keep a recovery copy before removal. On restore, persist the library first.
function commitMediaReviewLibraryChange(state, mutate, preserveRemoval = false) {
  if (preserveRemoval && state.quarantined.length > 1000) throw Object.assign(Error('ALM_QUARANTINE_LIMIT'), { status: 409 });
  const previous = db.getAllAnimes();
  const original = fs.existsSync(MEDIA_REVIEW_FILE) ? fs.readFileSync(MEDIA_REVIEW_FILE) : null;
  let libraryTouched = false, reviewWritten = false;
  invalidateMediaReviewAnalysis(state);
  try {
    if (preserveRemoval) { writeMediaReviewStateSync(state); reviewWritten = true; }
    libraryTouched = true;
    const result = mutate();
    if (result && typeof result.then === 'function') throw Error('ALM_REVIEW_ASYNC_COMMIT');
    if (!preserveRemoval) { writeMediaReviewStateSync(state); reviewWritten = true; }
    return result;
  } catch (error) {
    try {
      if (libraryTouched) db.writeAllAnimes(previous);
      if (reviewWritten) { if (original === null) fs.unlinkSync(MEDIA_REVIEW_FILE); else require('./lib/atomic-file').atomicWrite(MEDIA_REVIEW_FILE, original); }
    } catch { throw Error('ALM_MEDIA_REVIEW_ROLLBACK_FAILED'); }
    throw error;
  }
}

async function refreshAfterMediaReviewMutation(state = null) {
  const current = state || await readMediaReviewState();
  invalidateMediaReviewAnalysis(current);
  await writeMediaReviewState(current);
  // Le choix précis (et l'alias manuel éventuel) est déjà enregistré. Ne pas
  // recalculer toute la bibliothèque après chaque décision : ce travail lourd
  // n'est pas nécessaire au Contrôle anime et provoquait encore des gels tardifs.
}

app.get("/api/v2/content-audit/progress", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, ..._contentAuditProgress });
});

app.get("/api/v2/content-audit", serializeMediaReview(async (req, res) => {
  try {
    setContentAuditProgress({ status: "running", phase: "prepare", percent: 1, done: 0, total: 0, current: "Ouverture du contrôle anime…" });
    res.json(await contentAuditPayload({ force: false, onProgress: setContentAuditProgress }));
  } catch (error) {
    setContentAuditProgress({ status: "error", current: error.message || "Analyse impossible" });
    res.status(500).json({ error: "Contrôle de la bibliothèque impossible : " + error.message });
  }
}));

app.post("/api/v2/content-audit/scan", serializeMediaReview(async (req, res) => {
  try {
    setContentAuditProgress({ status: "running", phase: "prepare", percent: 1, done: 0, total: 0, current: "Nouvelle analyse locale…" });
    res.json(await contentAuditPayload({ force: true, onProgress: setContentAuditProgress }));
  } catch (error) {
    setContentAuditProgress({ status: "error", current: error.message || "Analyse impossible" });
    res.status(500).json({ error: "Analyse de la bibliothèque impossible : " + error.message });
  }
}));

app.post("/api/v2/content-audit/images/resolve", serializeMediaReview(async (req, res) => {
  try {
    const refs = Array.from(new Set((Array.isArray(req.body?.refs) ? req.body.refs : [])
      .map(value => String(value || "").trim())
      .filter(Boolean)))
      .slice(0, 10);
    if (!refs.length) return res.json({ ok: true, updated: 0, items: [] });

    const state = await readMediaReviewState();
    // Ne jamais retraiter toute la quarantaine pour résoudre une seule jaquette.
    // Cette boucle globale était la principale cause de lag lors du scroll.
    let stateChanged = false;
    const results = [];

    await runWithConcurrency(refs, 2, async ref => {
      if (ref.startsWith("library:")) {
        const id = Number(ref.slice("library:".length));
        const item = Number.isFinite(id) && id > 0 ? await resolveLibraryMediaReviewVisual(id, state) : null;
        if (item) results.push({ ref, kind: "library", item });
        return;
      }

      if (ref.startsWith("pending:")) {
        const key = ref.slice("pending:".length);
        const index = state.pendingImports.findIndex(item => item.key === key && item.state === "pending");
        if (index < 0) return;
        const before = JSON.stringify(state.pendingImports[index]);
        const next = await resolvePendingMediaReviewVisual(state.pendingImports[index]);
        const excluded = mediaReviewIsCertainGeneralTv(next);
        if (excluded) { next.state = "auto_excluded"; next.decision = "auto_excluded_non_anime"; }
        state.pendingImports[index] = next;
        if (JSON.stringify(next) !== before) stateChanged = true;
        results.push({ ref, kind: "pending", excluded, item: contentAuditQuarantineEntry(next, "pending") });
        return;
      }

      if (ref.startsWith("removed:")) {
        const key = ref.slice("removed:".length);
        const index = state.quarantined.findIndex(item => item.quarantineId === key);
        if (index < 0) return;
        const before = JSON.stringify(state.quarantined[index]);
        const next = await resolveQuarantinedMediaReviewVisual(state.quarantined[index]);
        state.quarantined[index] = next;
        if (JSON.stringify(next) !== before) stateChanged = true;
        results.push({ ref, kind: "removed", item: contentAuditQuarantineEntry(next, "quarantined") });
      }
    });

    if (stateChanged) await writeMediaReviewState(state);
    res.json({ ok: true, updated: results.length, items: results });
  } catch (error) {
    res.status(500).json({ error: "Récupération des jaquettes impossible : " + error.message });
  }
}));

app.post("/api/v2/content-audit/library/:id/action", serializeMediaReview(async (req, res) => {
  try {
    const id = Number(req.params.id);
    const action = String(req.body?.action || "").toLowerCase();
    const state = await readMediaReviewState();
    const animes = readAnimes();
    const index = animes.findIndex(anime => Number(anime.id) === id);
    if (index < 0) return res.status(404).json({ error: "Fiche introuvable." });
    const anime = { ...animes[index] };

    if (action === "keep") {
      const confirmed = mediaClassifier.markAsConfirmedAnime(anime);
      confirmed.notes = [
        confirmed.notes,
        `Conservé comme anime lors du contrôle de la bibliothèque le ${new Date().toLocaleDateString("fr-FR")}.`
      ].filter(Boolean).join("\n");
      animes[index] = confirmed;
      commitMediaReviewLibraryChange(state, () => db.updateAnime(id, confirmed, { save: "memory" }));
      return res.json({ ok: true, action, anime: confirmed });
    }

    if (action === "review") {
      anime.tags = Array.from(new Set([...(Array.isArray(anime.tags) ? anime.tags : []), "à vérifier"]));
      anime.mediaKind = "review";
      animes[index] = anime;
      commitMediaReviewLibraryChange(state, () => db.updateAnime(id, anime, { save: "memory" }));
      return res.json({ ok: true, action, anime });
    }

    if (action === "remove") {
      animes.splice(index, 1);
      const classification = mediaClassifier.classifyLibraryEntry(anime, metadataMatchForMediaReview(anime));
      const quarantineId = crypto.createHash("sha1")
        .update(`${anime.id}|${normalizeCacheLookupKey(anime.title)}|${Date.now()}`)
        .digest("hex")
        .slice(0, 20);
      state.quarantined.unshift({
        quarantineId,
        originalId: Number(anime.id || 0),
        anime,
        classification: classification.classification === "anime" ? "review" : classification.classification,
        confidence: Number(classification.confidence || 0),
        reason: "Retiré manuellement de la bibliothèque. La fiche reste restaurable depuis la quarantaine.",
        evidence: Array.isArray(classification.evidence) ? classification.evidence : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      commitMediaReviewLibraryChange(state, () => db.deleteAnime(id, { save: "memory" }), true);
      return res.json({ ok: true, action, removed: anime.title, quarantineKey: quarantineId });
    }

    return res.status(400).json({ error: "Action inconnue." });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message === "ALM_QUARANTINE_LIMIT" ? "La quarantaine est pleine (1 000 fiches). Restaure des fiches avant de continuer." : "Action impossible : " + error.message, code: error.message });
  }
}));


app.post("/api/v2/content-audit/library/batch", serializeMediaReview(async (req, res) => {
  try {
    const action = String(req.body?.action || "").toLowerCase();
    if (action !== "quarantine_non_anime") {
      return res.status(400).json({ error: "Action groupée inconnue." });
    }

    const requestedIds = new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0));
    const minConfidence = Math.max(90, Math.min(100, Number(req.body?.minConfidence || 90)));
    const state = await readMediaReviewState();
    const animes = readAnimes();
    const keep = [];
    const moved = [];
    const now = new Date().toISOString();

    for (const anime of animes) {
      if (requestedIds.size && !requestedIds.has(Number(anime?.id || 0))) {
        keep.push(anime);
        continue;
      }
      const classification = mediaClassifier.classifyLibraryEntry(anime, metadataMatchForMediaReview(anime));
      const safeToMove = classification.classification === "non_anime" && Number(classification.confidence || 0) >= minConfidence;
      if (!safeToMove) {
        keep.push(anime);
        continue;
      }

      const quarantineId = crypto.createHash("sha1")
        .update(`${anime.id}|${normalizeCacheLookupKey(anime.title)}|${now}|batch`)
        .digest("hex")
        .slice(0, 20);
      state.quarantined.unshift({
        quarantineId,
        originalId: Number(anime.id || 0),
        anime: { ...anime },
        classification: "non_anime",
        confidence: Number(classification.confidence || 0),
        reason: "Retiré par l’action groupée « hors-anime sûrs ». La fiche reste restaurable depuis la quarantaine.",
        evidence: Array.isArray(classification.evidence) ? classification.evidence : [],
        createdAt: now,
        updatedAt: now
      });
      moved.push({ id: Number(anime.id || 0), title: String(anime.title || ""), quarantineId });
    }

    if (!moved.length) {
      return res.json({ ok: true, action, moved: 0, items: [], message: "Aucune fiche assez sûre à déplacer." });
    }

    commitMediaReviewLibraryChange(state, () => writeAnimes(keep), true);
    return res.json({ ok: true, action, moved: moved.length, items: moved });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message === "ALM_QUARANTINE_LIMIT" ? "La quarantaine est pleine (1 000 fiches). Restaure des fiches avant de continuer." : "Action groupée impossible : " + error.message, code: error.message });
  }
}));

function mediaReviewCleanSelectionNotes(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/(plac[ée]e? en quarantaine|s[ée]rie non[- ]anime probable|validation manuelle requise)/i.test(line))
    .join("\n");
}

function mediaReviewAppendSelectionNote(value, note) {
  const current = mediaReviewCleanSelectionNotes(value);
  if (!note || current.includes(note)) return current;
  return [current, note].filter(Boolean).join("\n");
}

function mediaReviewSelectionTitle(item, candidate) {
  if (candidate === "anime") {
    const found = sanitizeMediaReviewFound(item?.found);
    return String(found?.officialTitle || found?.englishTitle || found?.romajiTitle || item?.sourceTitle || item?.anime?.title || "").trim();
  }
  const tv = sanitizeMediaReviewTv(item?.tvmaze);
  return String(tv?.name || item?.sourceTitle || item?.anime?.title || "").trim();
}

function mediaReviewBuildSelectedCandidate(item, candidate) {
  const selection = String(candidate || "").toLowerCase();
  const sourceTitle = String(item?.sourceTitle || item?.anime?.title || "").trim();
  const base = { ...(item?.anime || {}) };
  delete base.id;

  if (selection === "anime") {
    const found = sanitizeMediaReviewFound(item?.found) || auditLocalFoundCandidate(sourceTitle, item?.found, item?.anime);
    if (!found) throw new Error("Le candidat anime de droite n'est plus disponible. Relance l'analyse des jaquettes puis réessaie.");

    const title = String(found.officialTitle || found.englishTitle || found.romajiTitle || sourceTitle || base.title || "").trim();
    if (!title) throw new Error("Le candidat anime ne possède aucun titre exploitable.");

    const selected = {
      ...base,
      title,
      type: found.type || base.type || "TV",
      episodesTotal: found.episodesTotal || base.episodesTotal || "",
      startDate: found.startDate || base.startDate || "",
      endDate: found.endDate || base.endDate || "",
      genres: found.genres?.length ? found.genres : (Array.isArray(base.genres) ? base.genres : []),
      studios: found.studios?.length ? found.studios : (Array.isArray(base.studios) ? base.studios : []),
      poster: found.imageUrl || base.poster || base.imageUrl || "",
      imageUrl: found.imageUrl || base.imageUrl || base.poster || "",
      publicScore: found.publicScore || base.publicScore || "",
      synopsis: found.synopsis || base.synopsis || "",
      malId: found.malId || base.malId || "",
      anilistId: found.anilistId || base.anilistId || "",
      malUrl: found.malUrl || base.malUrl || "",
      selectedCandidate: "anime",
      importSourceTitle: sourceTitle,
      notes: mediaReviewAppendSelectionNote(
        base.notes,
        `Contrôle anime : fiche anime « ${title} » choisie manuellement pour l'import « ${sourceTitle || title} ».`
      )
    };
    for (const key of ["tvmazeId", "tvmazeUrl", "tvmazeType", "tvmazeLanguage", "tvmazeCountry", "tvmazeStatus", "manualLibraryChoice"]) {
      delete selected[key];
    }
    return mediaClassifier.markAsConfirmedAnime(selected);
  }

  if (selection === "source") {
    const tv = sanitizeMediaReviewTv(item?.tvmaze);
    const title = String(tv?.name || sourceTitle || base.title || "").trim();
    if (!title) throw new Error("Le candidat de gauche ne possède aucun titre exploitable.");
    const poster = mediaReviewImageUrl(tv?.imageUrl, item?.sourceImageUrl, base.poster, base.imageUrl);
    const selected = {
      ...base,
      title,
      type: tv?.type || base.type || "Série / film",
      // Ne jamais conserver le nombre d'épisodes du candidat anime de droite
      // lorsque l'utilisateur choisit explicitement la fiche généraliste.
      episodesTotal: tv?.episodesTotal || "",
      startDate: tv?.premiered || base.startDate || "",
      endDate: tv?.ended || base.endDate || "",
      genres: tv?.genres?.length ? tv.genres : [],
      studios: tv?.network ? [tv.network] : [],
      poster,
      imageUrl: poster,
      publicScore: tv?.rating || "",
      synopsis: tv?.summary || "",
      malId: "",
      anilistId: "",
      malUrl: "",
      tvmazeId: tv?.id || base.tvmazeId || "",
      tvmazeUrl: tv?.url || base.tvmazeUrl || "",
      tvmazeType: tv?.type || base.tvmazeType || "",
      tvmazeLanguage: tv?.language || base.tvmazeLanguage || "",
      tvmazeCountry: tv?.country || base.tvmazeCountry || "",
      tvmazeStatus: tv?.status || base.tvmazeStatus || "",
      selectedCandidate: "source",
      importSourceTitle: sourceTitle,
      notes: mediaReviewAppendSelectionNote(
        base.notes,
        `Contrôle anime : candidat de gauche « ${title} »${tv?.type ? ` (${tv.type})` : ""} conservé manuellement pour l'import « ${sourceTitle || title} ».`
      )
    };
    for (const key of ["rank", "popularity", "members", "rating", "verifiedAnime"]) delete selected[key];
    return mediaClassifier.markAsManualLibraryChoice(selected);
  }

  throw new Error("Candidat inconnu. Choisis la fiche de gauche ou la fiche anime de droite.");
}

function mediaReviewFindSelectedCandidateIndex(animes, incoming) {
  return (Array.isArray(animes) ? animes : []).findIndex(anime => {
    if (seasonResolver.officialConflict(anime, incoming)) return false;
    if (incoming?.tvmazeId && anime?.tvmazeId && String(incoming.tvmazeId) === String(anime.tvmazeId)) return true;
    return seasonResolver.sameSeason(anime, incoming);
  });
}

function mediaReviewMergeSelectedCandidate(existing, incoming, candidate) {
  const merged = mergeImportedAnime(existing, incoming, false);
  merged.notes = require('./lib/notebook-model').mergeNotes(existing.notes, incoming.notes);
  const identityFields = [
    "title", "type", "episodesTotal", "startDate", "endDate", "genres", "studios",
    "poster", "imageUrl", "publicScore", "synopsis", "malId", "anilistId", "malUrl",
    "tvmazeId", "tvmazeUrl", "tvmazeType", "tvmazeLanguage", "tvmazeCountry", "tvmazeStatus",
    "selectedCandidate", "importSourceTitle", "mediaKind", "tags"
  ];
  for (const field of identityFields) {
    if (Object.prototype.hasOwnProperty.call(incoming, field)) merged[field] = incoming[field];
  }
  if (candidate === "anime") {
    merged.verifiedAnime = true;
    delete merged.manualLibraryChoice;
  } else {
    merged.manualLibraryChoice = true;
    delete merged.verifiedAnime;
  }
  merged.id = existing.id;
  return merged;
}

app.post("/api/v2/content-audit/quarantine/clear", serializeMediaReview(async (req, res) => {
  try {
    const state = await readMediaReviewState();
    const pendingBefore = state.pendingImports.length;
    const removedBefore = state.quarantined.length;
    // Ne supprimer que ce qui est actuellement visible en quarantaine : les
    // décisions historiques dismissed/imported sont conservées pour éviter de
    // réintroduire automatiquement les mêmes erreurs au prochain import.
    state.pendingImports = state.pendingImports.filter(item => item?.state !== "pending");
    state.quarantined = [];
    const removed = (pendingBefore - state.pendingImports.length) + removedBefore;
    await refreshAfterMediaReviewMutation(state);
    return res.json({ ok: true, removed });
  } catch (error) {
    res.status(500).json({ error: "Vidage de la quarantaine impossible : " + error.message });
  }
}));

app.post("/api/v2/content-audit/quarantine/bulk-dismiss", serializeMediaReview(async (req, res) => {
  try {
    const keys = [...new Set((Array.isArray(req.body?.keys) ? req.body.keys : [])
      .map(value => String(value || "").trim())
      .filter(Boolean))].slice(0, 1000);
    if (!keys.length) return res.status(400).json({ error: "Aucune entrée sélectionnée." });

    const state = await readMediaReviewState();
    const keySet = new Set(keys);
    let dismissed = 0;
    const now = new Date().toISOString();
    state.pendingImports = state.pendingImports.map(item => {
      if (!keySet.has(String(item?.key || "")) || !["pending", "auto_excluded"].includes(item?.state)) return item;
      dismissed += 1;
      return {
        ...item,
        state: "dismissed",
        decision: "dismissed-from-import-preview",
        updatedAt: now
      };
    });
    await writeMediaReviewState(state);
    return res.json({ ok: true, dismissed });
  } catch (error) {
    return res.status(500).json({ error: `Impossible d’écarter la sélection : ${error.message}` });
  }
}));

app.post("/api/v2/content-audit/quarantine/bulk-restore-preview", serializeMediaReview(async (req, res) => {
  try {
    const keys = [...new Set((Array.isArray(req.body?.keys) ? req.body.keys : [])
      .map(value => String(value || "").trim())
      .filter(Boolean))].slice(0, 1000);
    if (!keys.length) return res.status(400).json({ error: "Aucune entrée à restaurer." });

    const state = await readMediaReviewState();
    const keySet = new Set(keys);
    let restored = 0;
    const now = new Date().toISOString();
    state.pendingImports = state.pendingImports.map(item => {
      if (!keySet.has(String(item?.key || ""))) return item;
      if (item?.state !== "dismissed" || String(item?.decision || "") !== "dismissed-from-import-preview") return item;
      restored += 1;
      return {
        ...item,
        state: mediaReviewIsCertainGeneralTv(item) ? "auto_excluded" : "pending",
        decision: mediaReviewIsCertainGeneralTv(item) ? "auto_excluded_non_anime" : "restored-to-import-preview",
        updatedAt: now
      };
    });
    await writeMediaReviewState(state);
    return res.json({ ok: true, restored });
  } catch (error) {
    return res.status(500).json({ error: `Restauration impossible : ${error.message}` });
  }
}));

app.post("/api/v2/content-audit/quarantine/action", serializeMediaReview(async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();
    const action = String(req.body?.action || "").toLowerCase();
    const requestedCandidate = String(req.body?.candidate || "").toLowerCase();
    if (!key) return res.status(400).json({ error: "Identifiant de quarantaine manquant." });
    const state = await readMediaReviewState();
    const pendingIndex = state.pendingImports.findIndex(item => item.key === key && item.state === "pending");
    const removedIndex = state.quarantined.findIndex(item => item.quarantineId === key);
    if (pendingIndex < 0 && removedIndex < 0) return res.status(404).json({ error: "Entrée de quarantaine introuvable." });

    if (action === "delete") {
      if (pendingIndex >= 0) state.pendingImports.splice(pendingIndex, 1);
      if (removedIndex >= 0) state.quarantined.splice(removedIndex, 1);
      await writeMediaReviewState(state);
      return res.json({ ok: true, action });
    }

    if (action === "dismiss") {
      // « Ne pas importer » est une décision réservée aux propositions issues
      // d'un CSV. Une fiche retirée de la bibliothèque contient la seule copie
      // restaurable : elle ne doit jamais disparaître via une action ambiguë.
      if (pendingIndex < 0) {
        return res.status(400).json({ error: "Une fiche retirée doit être restaurée ou supprimée définitivement." });
      }
      state.pendingImports[pendingIndex] = {
        ...state.pendingImports[pendingIndex], state: "dismissed", decision: "dismissed", updatedAt: new Date().toISOString()
      };
      await writeMediaReviewState(state);
      return res.json({ ok: true, action });
    }

    if (["select", "force", "restore"].includes(action)) {
      const sourceItem = pendingIndex >= 0 ? state.pendingImports[pendingIndex] : state.quarantined[removedIndex];
      if (action === "select" && pendingIndex < 0) {
        return res.status(400).json({ error: "Le choix gauche/droite est réservé aux propositions d'import encore en attente." });
      }

      let selectedCandidate = "";
      let incoming;
      if (action === "select") {
        if (!['source', 'anime'].includes(requestedCandidate)) {
          return res.status(400).json({ error: "Choisis explicitement le candidat de gauche ou le candidat anime de droite." });
        }
        selectedCandidate = requestedCandidate;
        incoming = mediaReviewBuildSelectedCandidate(sourceItem, selectedCandidate);
      } else if (action === "force" && pendingIndex >= 0) {
        // Compatibilité avec les anciennes interfaces : privilégier la fiche
        // anime quand elle existe, sinon conserver la proposition importée.
        selectedCandidate = sourceItem?.found ? "anime" : "source";
        incoming = mediaReviewBuildSelectedCandidate(sourceItem, selectedCandidate);
      } else {
        incoming = { ...(sourceItem?.anime || {}) };
        if (!incoming.title) incoming.title = sourceItem?.sourceTitle || "";
        if (!incoming.title) return res.status(400).json({ error: "Titre manquant dans la fiche en quarantaine." });
        incoming = mediaClassifier.markAsConfirmedAnime(incoming);
        incoming.notes = mediaReviewAppendSelectionNote(incoming.notes, "Fiche restaurée depuis le contrôle anime.");
      }

      incoming = clampEpisodesSeenToTotal(incoming);
      const animes = readAnimes();
      const existingIndex = mediaReviewFindSelectedCandidateIndex(animes, incoming);
      if (existingIndex >= 0) {
        incoming = selectedCandidate
          ? mediaReviewMergeSelectedCandidate(animes[existingIndex], incoming, selectedCandidate)
          : mediaClassifier.markAsConfirmedAnime(mergeImportedAnime(animes[existingIndex], incoming, false));
        incoming.id = animes[existingIndex].id;
        // Une décision du Contrôle anime ne modifie qu'une fiche : éviter de
        // supprimer/réécrire toute la table SQLite à chaque clic.

      } else {
        incoming.id = nextId(animes);

      }

      if (pendingIndex >= 0) {
        state.pendingImports[pendingIndex] = {
          ...state.pendingImports[pendingIndex],
          state: "imported",
          decision: selectedCandidate ? `selected_${selectedCandidate}` : "imported",
          selectedCandidate,
          selectedTitle: incoming.title,
          importedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      if (removedIndex >= 0) state.quarantined.splice(removedIndex, 1);

      const aliasDecision = pendingIndex >= 0 && selectedCandidate
        ? {
            candidate: selectedCandidate,
            sourceTitle: sourceItem?.sourceTitle || sourceItem?.anime?.title || incoming.title,
            anime: incoming
          }
        : null;
      commitMediaReviewLibraryChange(state, () => existingIndex >= 0
        ? db.updateAnime(incoming.id, incoming, { save: "memory" })
        : db.insertAnime(incoming, { save: "memory" }));
      // Répondre au renderer avant les écritures d'alias. Le choix de fiche et
      // animes.json sont déjà durables ; l'alias est une optimisation pour les
      // imports futurs et ne doit jamais bloquer le clic interactif.
      res.json({
        ok: true,
        action,
        candidate: selectedCandidate || (action === "restore" ? "restored" : "anime"),
        selectedTitle: incoming.title,
        anime: incoming
      });
      if (aliasDecision) setImmediate(() => {
        try {
          if (aliasDecision.candidate === "anime") saveManualAliasMatch(aliasDecision.sourceTitle, aliasDecision.anime);
          else removeAliasMatch(aliasDecision.sourceTitle);
        } catch (error) {
          console.warn("[audit] Alias différé non enregistré :", error.message);
        }
      });
      return;
    }

    return res.status(400).json({ error: "Action inconnue." });
  } catch (error) {
    res.status(500).json({ error: "Action de quarantaine impossible : " + error.message });
  }
}));


const _newsSeasonProgress = {};
const _seasonScanJobs = {};
let _activeSeasonScanJobId = "";
const SEASON_RELATION_TTL_MS = {
  Watching: 3 * 24 * 60 * 60 * 1000,
  Completed: 10 * 24 * 60 * 60 * 1000,
  "On-Hold": 7 * 24 * 60 * 60 * 1000,
  "On Hold": 7 * 24 * 60 * 60 * 1000
};
const SEASON_NEGATIVE_LOOKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function setNewsSeasonProgress(progressId, patch) {
  if (!progressId) return;
  _newsSeasonProgress[String(progressId)] = {
    ...(_newsSeasonProgress[String(progressId)] || {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

function newSeasonScanJob(force = false, progressId = "") {
  const jobId = `season-scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    jobId,
    progressId: String(progressId || ""),
    force: Boolean(force),
    status: "running",
    phase: "prepare",
    done: 0,
    total: 0,
    current: "Préparation de la bibliothèque...",
    found: 0,
    localMatches: 0,
    cacheHits: 0,
    prepared: 0,
    anilistResolved: 0,
    anilistBatchFailures: 0,
    staleCacheFallbacks: 0,
    jikanFallback: 0,
    networkRequests: 0,
    relationBatchesDone: 0,
    relationBatchesTotal: 0,
    skipped: 0,
    failed: 0,
    startedAt: Date.now(),
    phaseStartedAt: Date.now(),
    scanStartedAt: 0,
    updatedAt: Date.now(),
    cancelRequested: false,
    news: []
  };
}

function cleanupSeasonScanJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [jobId, job] of Object.entries(_seasonScanJobs)) {
    if (["done", "cancelled", "error"].includes(job?.status) && Number(job?.updatedAt || 0) < cutoff) {
      delete _seasonScanJobs[jobId];
    }
  }
}

function seasonScanIsFresh(value, ttlMs) {
  const checkedAt = Date.parse(String(value || ""));
  return Number.isFinite(checkedAt) && Date.now() - checkedAt < ttlMs;
}

function seasonScanRelationTtl(anime) {
  return SEASON_RELATION_TTL_MS[String(anime?.status || "")] || 7 * 24 * 60 * 60 * 1000;
}

function seasonScanProgressPayload(job, includeNews = false) {
  const now = Date.now();
  const elapsed = Math.max(0, Math.round((now - Number(job?.startedAt || now)) / 1000));
  const done = Math.max(0, Number(job?.done || 0));
  const total = Math.max(0, Number(job?.total || 0));
  const scanElapsed = Number(job?.scanStartedAt || 0) > 0
    ? Math.max(0, (now - Number(job.scanStartedAt)) / 1000)
    : 0;
  const rate = scanElapsed > 0 && done >= 2 ? done / scanElapsed : 0;
  const seededEstimate = Math.max(0, Number(job?.estimatedTotalSeconds || 0) - elapsed);
  const relationDone = Math.max(0, Number(job?.relationBatchesDone || 0));
  const relationTotal = Math.max(0, Number(job?.relationBatchesTotal || 0));
  const phaseElapsed = Math.max(0, (now - Number(job?.phaseStartedAt || now)) / 1000);
  const relationRate = phaseElapsed > 0 && relationDone > 0 ? relationDone / phaseElapsed : 0;
  let estimatedRemainingSeconds = null;
  const estimateReady = elapsed >= 4 || relationDone >= 2 || done >= 8;
  if (estimateReady && seededEstimate > 0) estimatedRemainingSeconds = Math.round(seededEstimate);
  if (job?.phase === "relations" && relationRate > 0 && relationTotal > relationDone) {
    const remainingBatches = Math.max(0, relationTotal - relationDone);
    const scanEstimate = Math.max(1, Math.round(total * 0.04));
    estimatedRemainingSeconds = Math.max(1, Math.round(remainingBatches / relationRate) + scanEstimate);
  } else if (job?.phase === "scan" && estimateReady && rate > 0 && total > done) {
    estimatedRemainingSeconds = Math.max(1, Math.round((total - done) / rate));
  } else if (job?.phase === "save") {
    estimatedRemainingSeconds = 1;
  }
  let percent = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0;
  if (["prepare", "relations"].includes(job?.phase) && total > 0) {
    percent = Math.min(35, Math.round((Math.min(Number(job?.prepared || 0), total) / total) * 35));
  } else if (job?.phase === "scan" && total > 0) {
    percent = Math.min(99, 35 + Math.round((Math.min(done, total) / total) * 64));
  }
  if (job?.status === "done") percent = 100;
  let phasePercent = 0;
  if (job?.phase === "relations") {
    phasePercent = relationTotal > 0 ? Math.round((Math.min(relationDone, relationTotal) / relationTotal) * 100) : 100;
  } else if (job?.phase === "prepare") {
    phasePercent = total > 0 ? Math.round((Math.min(Number(job?.prepared || 0), total) / total) * 100) : 0;
  } else if (job?.phase === "scan") {
    phasePercent = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 100;
  } else if (["save", "cache"].includes(job?.phase) || job?.status === "done") {
    phasePercent = 100;
  }
  const payload = {
    jobId: job?.jobId || "",
    status: job?.status || "pending",
    phase: job?.phase || "prepare",
    done,
    total,
    current: job?.current || "",
    found: Number(job?.found || 0),
    count: Number(job?.found || 0),
    localMatches: Number(job?.localMatches || 0),
    cacheHits: Number(job?.cacheHits || 0),
    prepared: Number(job?.prepared || 0),
    anilistResolved: Number(job?.anilistResolved || 0),
    anilistBatchFailures: Number(job?.anilistBatchFailures || 0),
    staleCacheFallbacks: Number(job?.staleCacheFallbacks || 0),
    jikanFallback: Number(job?.jikanFallback || 0),
    networkRequests: Number(job?.networkRequests || 0),
    relationBatchesDone: relationDone,
    relationBatchesTotal: relationTotal,
    skipped: Number(job?.skipped || 0),
    failed: Number(job?.failed || 0),
    elapsed,
    estimatedRemainingSeconds,
    percent,
    phasePercent,
    cancelRequested: Boolean(job?.cancelRequested),
    cached: Boolean(job?.cached),
    lastScanAt: String(job?.lastScanAt || ""),
    error: job?.error || ""
  };
  if (includeNews) payload.news = Array.isArray(job?.news) ? job.news : [];
  return payload;
}

function syncLegacySeasonProgress(job) {
  if (!job?.progressId) return;
  setNewsSeasonProgress(job.progressId, seasonScanProgressPayload(job, false));
}

async function fetchSeasonRelations(malId) {
  const json = await fetchJikanJson(`https://api.jikan.moe/v4/anime/${malId}/relations`, {
    attempts: 2,
    timeoutMs: 9000
  });
  if (!json) return { ok: false, relations: [] };
  return { ok: true, relations: Array.isArray(json.data) ? json.data : [] };
}

function anilistSeasonRelationLabel(value) {
  const labels = {
    SEQUEL: "Sequel",
    SIDE_STORY: "Side story",
    SPIN_OFF: "Spin-off",
    ALTERNATIVE: "Alternative version",
    PREQUEL: "Prequel",
    PARENT: "Parent story",
    SUMMARY: "Summary",
    OTHER: "Other"
  };
  return labels[String(value || "").toUpperCase()] || String(value || "Other");
}

function anilistSeasonRelationsToLegacy(media) {
  const grouped = new Map();
  for (const edge of (media?.relations?.edges || [])) {
    const node = edge?.node;
    if (!node || String(node.type || "").toUpperCase() !== "ANIME") continue;
    const relation = anilistSeasonRelationLabel(edge?.relationType);
    if (!grouped.has(relation)) grouped.set(relation, []);
    const title = decodeHtmlEntitiesPlain(node?.title?.english || node?.title?.romaji || node?.title?.native || "");
    if (!title) continue;
    const malId = Number(node?.idMal) || "";
    const mediaType = String(node?.format || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    const startDate = node?.startDate?.year
      ? [node.startDate.year, String(node.startDate.month || 1).padStart(2, "0"), String(node.startDate.day || 1).padStart(2, "0")].join("-")
      : "";
    grouped.get(relation).push({
      mal_id: malId,
      malId,
      type: "anime",
      name: title,
      title,
      mediaType,
      episodesTotal: Number(node?.episodes || 0) || "",
      startDate,
      url: malId ? `https://myanimelist.net/anime/${malId}` : ""
    });
  }
  return [...grouped.entries()].map(([relation, entry]) => ({ relation, entry }));
}

async function fetchAniListSeasonRelationsBatch(items, options = {}) {
  const requestTimeoutMs = Math.max(750, Math.min(30000, Number(options.timeoutMs || 16000)));
  const valid = (Array.isArray(items) ? items : [])
    .map(item => ({ ...item, malId: Number(item?.malId) || 0 }))
    .filter(item => item.malId > 0)
    .slice(0, 30);
  if (!valid.length) return new Map();

  const fields = valid.map((item, index) => `
    m${index}: Media(idMal: ${item.malId}, type: ANIME) {
      idMal
      relations {
        edges {
          relationType
          node {
            idMal
            synonyms
            genres
            description
            duration
            coverImage { extraLarge large }
            endDate { year month day }
            type
            format
            episodes
            startDate { year month day }
            title { romaji english native }
          }
        }
      }
    }
  `).join("\n");

  const fetched = await boundedTextFetch("https://graphql.anilist.co", {
    fetchImpl: aniListFetch,
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query: `query SeasonRelationsBatch { ${fields} }` }),
    signal: options.signal,
    timeoutMs: requestTimeoutMs,
    maxBytes: 8 * 1024 * 1024,
    maxRedirects: 0
  });
  if (!fetched.response.ok) throw new Error(`AniList HTTP ${fetched.response.status}`);
  const json = JSON.parse(fetched.text);
  if (!json?.data && Array.isArray(json?.errors) && json.errors.length) {
    throw new Error(json.errors[0]?.message || "AniList indisponible");
  }

  const out = new Map(), learnedRows=[];
  valid.forEach((item, index) => {
    const media = json?.data?.[`m${index}`];
    // Une fiche trouvée avec zéro relation est un résultat valide : il faut la
    // mettre en cache pour ne pas la redemander à chaque recherche.
    if (Number(media?.idMal) !== item.malId) return;
    out.set(String(item.malId), anilistSeasonRelationsToLegacy(media));
    const rows = (media.relations?.edges || []).map(edge => edge.node)
      .filter(node => node?.type === "ANIME" && Number(node.idMal) > 0)
      .map(anilistMediaToMetadataRow).filter(Boolean);
    learnedRows.push(...rows);
  });
  if(learnedRows.length)metadataLearnFromRows(learnedRows, 'verified-season-relations');
  return out;
}

function chunkSeasonScanItems(items, size = 24) {
  const source = Array.isArray(items) ? items : [];
  const chunks = [];
  for (let i = 0; i < source.length; i += size) chunks.push(source.slice(i, i + size));
  return chunks;
}

async function executeSeasonScan(job) {
  try {
    await db.whenReady();
    const animes = await readAnimesAsync();

    if (!job.force) {
      const cached = readNewsResults();
      const cachedState = readSeasonScanState();
      const cacheStateFresh = isSeasonScanStateFresh(cachedState, animes);
      // Compatibilité avec les anciennes versions qui possédaient des résultats
      // mais pas encore de fichier d'état. On migre une seule fois au lieu de
      // relancer immédiatement plusieurs centaines de requêtes.
      const legacyCache = cached.length > 0 && !cachedState?.completedAt;
      if (cacheStateFresh || legacyCache) {
        const hydrated = filterSeasonNewsItemsForLibrary(cached, animes);
        try { writeNewsResults(hydrated); } catch {}
        const checked = Math.max(0, Number(cachedState?.checked || 0));
        const completedAt = cacheStateFresh
          ? String(cachedState.completedAt || "")
          : new Date().toISOString();
        if (legacyCache) {
          try {
            writeSeasonScanState({
              schemaVersion: 1,
              status: "done",
              completedAt,
              libraryKey: seasonScanLibraryFingerprint(animes),
              checked,
              processed: checked,
              count: hydrated.length,
              migratedLegacyCache: true
            });
          } catch {}
        }
        job.status = "done";
        job.phase = "cache";
        job.cached = true;
        job.lastScanAt = completedAt;
        job.total = checked || hydrated.length;
        job.done = job.total;
        job.prepared = job.total;
        job.found = hydrated.length;
        job.current = hydrated.length
          ? "Résultats récents chargés depuis le cache local"
          : "Recherche récente chargée : aucune nouvelle saison détectée";
        job.news = hydrated;
        job.updatedAt = Date.now();
        syncLegacySeasonProgress(job);
        return { ok: true, cached: true, checked, count: hydrated.length, news: hydrated, lastScanAt: completedAt };
      }
    }

    const ignoredRows = readIgnoredNews();
    const ignored = new Set(ignoredRows.flatMap(x => [normalizeTitle(decodeHtmlEntitiesPlain(x.title)), String(x.malId || "")]).filter(Boolean));
    const existingTitles = new Set(animes.flatMap(a => [a?.title, a?.officialTitle, a?.englishTitle]).map(value => normalizeTitle(decodeHtmlEntitiesPlain(value))).filter(Boolean));
    const existingMalIds = new Set(animes.map(a => String(a.malId || "")).filter(Boolean));
    const checkedStatuses = new Set(["Watching", "Completed", "On-Hold", "On Hold"]);
    const targets = animes.filter(a => a?.title && isAnimeFeatureEligible(a) && checkedStatuses.has(String(a.status || "")));
    const previousResults = readNewsResults();
    const seenNews = new Set();
    const news = [];

    job.phase = "prepare";
    job.phaseStartedAt = Date.now();
    job.total = targets.length;
    job.current = targets.length ? "Préparation des identifiants et des caches..." : "Aucun animé à analyser";
    job.updatedAt = Date.now();
    syncLegacySeasonProgress(job);

    // Première passe 100 % locale : compléter les malId disponibles dans le
    // snapshot et repérer les relations devenues obsolètes. Cette étape évite
    // des centaines de recherches réseau individuelles.
    const staleRelationTargets = [];
    let missingMalIdCount = 0;
    for (const anime of targets) {
      if (job.cancelRequested) break;
      if (!animeTitleMatchLooksReliable(anime)) continue;

      const scanTitle = decodeHtmlEntitiesPlain(anime.title || "");
      let malId = String(anime.malId || "").trim();
      if (!malId) {
        const local = searchMetadataLocal(scanTitle, { minScore: 70, limit: 8 });
        if (local?.malId) {
          mergeAutoInfo(anime, local, false);
          malId = String(anime.malId || local.malId || "").trim();
          job.localMatches++;
        }
      }

      const relations = Array.isArray(anime.relations) ? anime.relations : [];
      const legacyCandidates = Array.isArray(anime.nextSeasonCandidates) ? anime.nextSeasonCandidates : [];
      if (!anime.seasonRelationsCheckedAt && (relations.length || legacyCandidates.length)) {
        anime.seasonRelationsCheckedAt = new Date().toISOString();
      }

      if (malId && !seasonScanIsFresh(anime.seasonRelationsCheckedAt, seasonScanRelationTtl(anime))) {
        staleRelationTargets.push({ anime, malId });
      } else if (!malId) {
        missingMalIdCount++;
      }
    }

    const relationBatches = chunkSeasonScanItems(staleRelationTargets, 24);
    job.relationBatchesTotal = relationBatches.length;
    job.relationBatchesDone = 0;
    job.prepared = Math.max(0, targets.length - staleRelationTargets.length);
    job.estimatedTotalSeconds = Math.max(
      2,
      Math.ceil(relationBatches.length * 1.8 + missingMalIdCount * 2.5 + targets.length * 0.035)
    );

    // AniList accepte plusieurs alias GraphQL dans une seule requête. Une
    // bibliothèque de ~380 animés passe ainsi d'environ 380 appels Jikan à une
    // quinzaine d'appels groupés, avec repli Jikan seulement pour les trous.
    const prefetchedRelations = new Map();
    const failedPrefetchMalIds = new Set();
    if (relationBatches.length && !job.cancelRequested) {
      job.phase = "relations";
      job.phaseStartedAt = Date.now();
      for (let batchIndex = 0; batchIndex < relationBatches.length; batchIndex++) {
        if (job.cancelRequested) break;
        const batch = relationBatches[batchIndex];
        const firstTitle = decodeHtmlEntitiesPlain(batch[0]?.anime?.title || "");
        job.current = `Relations groupées ${batchIndex + 1}/${relationBatches.length}${firstTitle ? ` — ${firstTitle}` : ""}`;
        job.updatedAt = Date.now();
        syncLegacySeasonProgress(job);

        try {
          job.networkRequests++;
          let resolved;
          try {
            resolved = await fetchAniListSeasonRelationsBatch(batch);
          } catch (firstError) {
            // Un incident ponctuel ne doit pas faire basculer immédiatement tout
            // le lot vers des centaines d'appels Jikan individuels.
            if (job.cancelRequested) throw firstError;
            await sleep(420);
            job.networkRequests++;
            resolved = await fetchAniListSeasonRelationsBatch(batch);
          }
          for (const [malId, relations] of resolved) {
            prefetchedRelations.set(String(malId), relations);
            job.anilistResolved++;
          }
        } catch (error) {
          job.anilistBatchFailures++;
          for (const item of batch) failedPrefetchMalIds.add(String(item?.malId || ""));
          console.warn("[season-scan] Relations groupées AniList indisponibles :", error.message);
        }

        job.prepared = Math.min(targets.length, job.prepared + batch.length);
        job.relationBatchesDone = batchIndex + 1;
        job.updatedAt = Date.now();
        syncLegacySeasonProgress(job);
        if (batchIndex + 1 < relationBatches.length) await sleep(180);
      }
    }

    job.phase = "scan";
    job.phaseStartedAt = Date.now();
    job.scanStartedAt = job.phaseStartedAt;
    job.current = targets.length ? "Vérification des suites détectées..." : "Aucun animé à analyser";
    job.updatedAt = Date.now();
    syncLegacySeasonProgress(job);

    await runWithConcurrency(targets, 3, async (anime) => {
      if (job.cancelRequested) return;
      job.current = decodeHtmlEntitiesPlain(anime?.title || "Animé sans titre");
      job.updatedAt = Date.now();
      syncLegacySeasonProgress(job);

      try {
        if (!animeTitleMatchLooksReliable(anime)) {
          job.skipped++;
          return;
        }

        const scanTitle = decodeHtmlEntitiesPlain(anime.title || "");
        let malId = String(anime.malId || "").trim();
        if (!malId) {
          const local = searchMetadataLocal(scanTitle, { minScore: 70, limit: 8 });
          if (local?.malId) {
            mergeAutoInfo(anime, local, false);
            malId = String(anime.malId || local.malId || "").trim();
            job.localMatches++;
          }
        }

        if (!malId && !seasonScanIsFresh(anime.seasonLookupCheckedAt, SEASON_NEGATIVE_LOOKUP_TTL_MS)) {
          job.networkRequests++;
          const searchFn = typeof searchAnimeWithAliases === "function" ? searchAnimeWithAliases : searchAnimeSmart;
          const found = await withTimeout(searchFn(scanTitle), 11000).catch(() => null);
          anime.seasonLookupCheckedAt = new Date().toISOString();
          if (found) {
            mergeAutoInfo(anime, found, false);
            malId = String(anime.malId || found.malId || "").trim();
          }
        }

        if (!malId) {
          job.skipped++;
          return;
        }

        let relations = Array.isArray(anime.relations) ? anime.relations : [];
        let candidatesFromLegacyCache = Array.isArray(anime.nextSeasonCandidates) ? anime.nextSeasonCandidates : [];
        const ttlMs = seasonScanRelationTtl(anime);
        // Une recherche manuelle ignore uniquement le cache du résultat global.
        // Les relations encore fraîches restent valables, sinon “Nouvelle recherche”
        // provoquerait à nouveau un appel réseau par animé.
        let useCachedRelations = seasonScanIsFresh(anime.seasonRelationsCheckedAt, ttlMs);

        // Les RC précédentes stockaient les relations sans horodatage. On les réutilise
        // immédiatement et on les horodate au lieu de refaire des centaines d'appels.
        if (!anime.seasonRelationsCheckedAt && (relations.length || candidatesFromLegacyCache.length)) {
          anime.seasonRelationsCheckedAt = new Date().toISOString();
          useCachedRelations = true;
        }

        const prefetchedKey = String(malId || "");
        const hasPrefetchedRelations = prefetchedRelations.has(prefetchedKey);
        const failedGroupedLookup = failedPrefetchMalIds.has(prefetchedKey);
        const hasStaleLocalRelations = relations.length > 0 || candidatesFromLegacyCache.length > 0;

        if (useCachedRelations) {
          job.cacheHits++;
        } else if (hasPrefetchedRelations) {
          relations = prefetchedRelations.get(prefetchedKey) || [];
          anime.relations = relations;
          anime.seasonRelationsCheckedAt = new Date().toISOString();
          anime.seasonRelationsLastErrorAt = "";
          candidatesFromLegacyCache = [];
        } else if (failedGroupedLookup && hasStaleLocalRelations) {
          // Si AniList est momentanément indisponible, réutiliser un ancien cache
          // vaut mieux qu'une rafale de requêtes Jikan. Les données restent utiles
          // et seront rafraîchies lors d'une prochaine analyse.
          job.cacheHits++;
          job.staleCacheFallbacks++;
        } else if (!job.cancelRequested) {
          job.networkRequests++;
          job.jikanFallback++;
          const fetched = await fetchSeasonRelations(malId);
          if (fetched.ok) {
            relations = fetched.relations;
            anime.relations = relations;
            anime.seasonRelationsCheckedAt = new Date().toISOString();
            anime.seasonRelationsLastErrorAt = "";
            candidatesFromLegacyCache = [];
          } else {
            anime.seasonRelationsLastErrorAt = new Date().toISOString();
            job.failed++;
            // En cas de panne réseau, on conserve et utilise le cache existant.
          }
        }

        const rawCandidates = relations.length
          ? nextSeasonFromRelations(relations, existingTitles, existingMalIds)
          : candidatesFromLegacyCache.filter(candidate => {
              const titleKey = normalizeTitle(candidate?.title || "");
              const idKey = String(candidate?.malId || "");
              return candidate?.title && !existingTitles.has(titleKey) && !existingMalIds.has(idKey);
            });
        const keptCandidates = [];

        for (const candidate of rawCandidates) {
          const key = String(candidate.malId || normalizeTitle(candidate.title));
          const titleKey = normalizeTitle(candidate.title);
          if (!key || ignored.has(key) || ignored.has(titleKey) || seenNews.has(key)) continue;

          let localDetails = null;
          try {
            if (candidate.malId && db?.getMetadataByMalId) {
              const meta = db.getMetadataByMalId(candidate.malId);
              if (meta) localDetails = metadataToFound(meta, candidate.title, 100);
            }
            if (!localDetails) localDetails = searchMetadataLocal(candidate.title, { minScore: 55, limit: 6 });
          } catch {}
          if (candidateAlreadyCoveredByBetaSeries(anime, candidate, localDetails)) continue;

          seenNews.add(key);
          keptCandidates.push(candidate);
          const seasonClass = classifySeasonCandidate(candidate, localDetails);
          news.push({
            sourceAnimeId:anime.id,sourceMalId:anime.malId||"",sourceTitle: decodeHtmlEntitiesPlain(anime.title),
            title: decodeHtmlEntitiesPlain(localDetails?.officialTitle || candidate.title),
            relation: candidate.relation,
            seasonClass: seasonClass.key,
            seasonClassLabel: seasonClass.label,
            defaultSelected: seasonClass.defaultSelected,
            url: localDetails?.malUrl || candidate.url,
            malId: candidate.malId || localDetails?.malId || "",
            imageUrl: localDetails?.imageUrl || "",
            synopsis: localDetails?.synopsis || "",
            type: localDetails?.type || "",
            episodesTotal: localDetails?.episodesTotal || "",
            startDate: localDetails?.startDate || "",
            endDate: localDetails?.endDate || "",
            publicScore: localDetails?.publicScore || "",
            rank: localDetails?.rank || "",
            studios: Array.isArray(localDetails?.studios) ? localDetails.studios : [],
            genres: Array.isArray(localDetails?.genres) ? localDetails.genres : []
          });
          job.found = news.length;
        }
        anime.nextSeasonCandidates = keptCandidates;
      } catch (error) {
        job.failed++;
        console.error("News saison non récupérée:", anime?.title, error.message);
      } finally {
        if (!job.cancelRequested) job.done++;
        job.updatedAt = Date.now();
        syncLegacySeasonProgress(job);
      }
    }, () => job.cancelRequested);

    job.phase = "save";
    job.phaseStartedAt = Date.now();
    job.current = "Sauvegarde des résultats...";
    job.updatedAt = Date.now();
    syncLegacySeasonProgress(job);

    const sourceResults = job.cancelRequested ? [...previousResults, ...news] : news;
    const filteredNews = filterIgnoredSeasonNews(filterSeasonNewsItemsForLibrary(sourceResults, readAnimes()));
    writeCompletionAnimes(animes);
    writeNewsResults(filteredNews);
    const completedAt = new Date().toISOString();
    writeSeasonScanState({
      schemaVersion: 1,
      status: job.cancelRequested ? "cancelled" : "done",
      completedAt,
      libraryKey: seasonScanLibraryFingerprint(animes),
      checked: targets.length,
      processed: job.done,
      count: filteredNews.length,
      cancelled: Boolean(job.cancelRequested)
    });
    job.news = filteredNews;
    job.found = filteredNews.length;
    job.lastScanAt = job.cancelRequested ? "" : completedAt;
    job.status = job.cancelRequested ? "cancelled" : "done";
    job.phase = job.cancelRequested ? "cancelled" : "done";
    job.current = job.cancelRequested
      ? "Analyse arrêtée proprement ; les résultats déjà trouvés sont conservés"
      : "Analyse terminée";
    job.updatedAt = Date.now();
    syncLegacySeasonProgress(job);

    return {
      ok: true,
      cached: false,
      cancelled: job.cancelRequested,
      checked: targets.length,
      skipped: job.skipped,
      done: job.done,
      count: filteredNews.length,
      news: filteredNews
    };
  } catch (error) {
    job.status = "error";
    job.phase = "error";
    job.error = error.message;
    job.current = error.message;
    job.updatedAt = Date.now();
    syncLegacySeasonProgress(job);
    throw error;
  }
}

app.get("/api/news/seasons/progress/:progressId", (req, res) => {
  const state = _newsSeasonProgress[String(req.params.progressId)] || { status: "pending", done: 0, total: 0, current: "" };
  res.json(state);
});

app.get("/api/news/seasons/active-job", (req, res) => {
  cleanupSeasonScanJobs();
  const job = _activeSeasonScanJobId ? _seasonScanJobs[_activeSeasonScanJobId] : null;
  if (!job || ["done", "cancelled", "error"].includes(job.status)) {
    return res.json({ active: false });
  }
  res.json({ active: true, jobId: job.jobId, job: seasonScanProgressPayload(job, false) });
});

app.post("/api/news/seasons/job", async (req, res) => {
  cleanupSeasonScanJobs();
  const active = _activeSeasonScanJobId ? _seasonScanJobs[_activeSeasonScanJobId] : null;
  if (active && !["done", "cancelled", "error"].includes(active.status)) {
    return res.json({ ok: true, resumed: true, jobId: active.jobId, total: active.total });
  }

  const job = newSeasonScanJob(req.body?.force === true);
  _seasonScanJobs[job.jobId] = job;
  _activeSeasonScanJobId = job.jobId;
  res.json({ ok: true, resumed: false, jobId: job.jobId, total: job.total });

  setImmediate(async () => {
    try {
      await executeSeasonScan(job);
    } catch (error) {
      console.error("[season-scan]", error.message);
    } finally {
      if (_activeSeasonScanJobId === job.jobId) _activeSeasonScanJobId = "";
    }
  });
});

app.get("/api/news/seasons/job/:jobId", (req, res) => {
  const job = _seasonScanJobs[String(req.params.jobId)];
  if (!job) return res.status(404).json({ error: "Analyse des saisons introuvable." });
  const terminal = ["done", "cancelled", "error"].includes(job.status);
  res.json(seasonScanProgressPayload(job, terminal));
});

app.post("/api/news/seasons/job/:jobId/cancel", (req, res) => {
  const job = _seasonScanJobs[String(req.params.jobId)];
  if (!job) return res.status(404).json({ error: "Analyse des saisons introuvable." });
  if (["done", "cancelled", "error"].includes(job.status)) {
    return res.json({ ok: true, status: job.status });
  }
  job.cancelRequested = true;
  job.status = "cancelling";
  job.current = "Annulation demandée : les requêtes en cours se terminent...";
  job.updatedAt = Date.now();
  res.json({ ok: true, status: job.status });
});

// Route historique conservée pour les anciennes interfaces.
app.post("/api/news/seasons", async (req, res) => {
  const job = newSeasonScanJob(req.body?.force === true, req.body?.progressId || "");
  try {
    const result = await executeSeasonScan(job);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Nouvelles saisons impossibles : " + error.message });
  }
});

app.get("/api/news/results", async (req, res) => {
  try {
    await db.whenReady();
    const animes = await readAnimesAsync();
    const items = filterSeasonNewsItemsForLibrary(readNewsResults(), animes);
    const scanState = readSeasonScanState();
    const cacheValid = isSeasonScanStateFresh(scanState, animes);
    try { writeNewsResults(items); } catch {}
    res.json({ ok: true, count: items.length, news: items, cacheValid, scanState });
  } catch (error) {
    res.status(500).json({ error: "Lecture des saisons détectées impossible : " + error.message });
  }
});



const _newsDetailsJobs = {};

app.post("/api/news/details/job", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : readNewsResults();
  const jobId = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7);
  _newsDetailsJobs[jobId] = {
    status: "running",
    done: 0,
    checked: 0,
    total: items.length,
    phase: "local",
    current: "Préparation...",
    local: 0,
    network: 0,
    failed: 0,
    incomplete: 0,
    startedAt: Date.now(),
    cancelRequested: false,
    items: []
  };
  res.json({ ok: true, jobId, total: items.length });

  (async () => {
    const job = _newsDetailsJobs[jobId];
    const resolved = new Array(items.length);
    const networkQueue = [];

    try {
      // Phase locale : on vérifie tout, mais on ne compte comme "fait" que les
      // fiches réellement complétées. Le total utilisateur reste donc le nombre
      // de saisons visibles, pas "local + réseau". Cela évite les 52 -> 104.
      for (let i = 0; i < items.length; i++) {
        if (job.cancelRequested) break;
        const item = items[i];
        job.current = item?.title || "Metadata locale";
        const local = hydrateSeasonNewsWithLocalDetails(item);
        if (hasUsefulSeasonNewsDetails(local) || seasonDetails.recent(local)) {
          resolved[i] = local;
          job.local++;
          job.done = Math.min(items.length, job.local + job.network + job.failed + job.incomplete);
        } else {
          networkQueue.push({ item: local, i });
        }
        job.checked++;
        if (i % 8 === 0) await yieldToEventLoop();
      }

      job.phase = networkQueue.length ? "network" : "save";
      job.total = items.length;
      job.done = Math.min(items.length, job.local + job.network + job.failed + job.incomplete);

      await seasonDetails.prime(networkQueue.map(x=>x.item),()=>job.cancelRequested);
      await runWithConcurrency(networkQueue, 4, async ({ item, i }) => {
        job.current = item?.title || "Recherche réseau";
        try {
          const details = await searchNewsDetailsAllMethods(item);
          const final = details || item;
          resolved[i] = final;
          if (details && seasonNewsCompleteness(final).complete) job.network++;
          else if (details) job.incomplete++;
          else job.failed++;
        } catch (error) {
          resolved[i] = item;
          job.failed++;
        }
        job.done = Math.min(items.length, job.local + job.network + job.failed + job.incomplete);
      }, () => job.cancelRequested);

      const finalItems = writeNewsResults(items.map((item, i) => resolved[i] || item).filter(Boolean));
      job.phase = "save";
      job.current = "Sauvegarde...";
      job.items = finalItems;
      job.count = finalItems.length;
      if (job.cancelRequested) {
        job.status = "cancelled";
        job.current = "Complétion arrêtée proprement";
      } else {
        job.done = items.length;
        job.status = "done";
        job.current = "Terminé";
      }
    } catch (error) {
      job.status = "error";
      job.error = error.message;
      job.current = error.message;
    }
  })();
});

app.get("/api/news/details/progress/:jobId", (req, res) => {
  const job = _newsDetailsJobs[String(req.params.jobId)];
  if (!job) return res.status(404).json({ error: "Job saisons introuvable." });
  const elapsed = Math.round((Date.now() - (job.startedAt || Date.now())) / 1000);
  const rate = elapsed > 0 && job.done > 0 ? job.done / elapsed : 0;
  const remaining = rate > 0 && job.total > job.done ? Math.round((job.total - job.done) / rate) : null;
  res.json({ ...job, elapsed, estimatedRemainingSeconds: remaining });
});

app.post("/api/news/details/cancel/:jobId", (req, res) => {
  const job = _newsDetailsJobs[String(req.params.jobId)];
  if (!job) return res.status(404).json({ error: "Job saisons introuvable." });
  if (["done", "cancelled", "error"].includes(job.status)) return res.json({ ok: true, status: job.status });
  job.cancelRequested = true;
  job.status = "cancelling";
  job.current = "Annulation demandée : les requêtes en cours se terminent...";
  res.json({ ok: true, status: job.status });
});

app.post("/api/news/details/bulk", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : readNewsResults();
  const resolved = new Array(items.length);
  const networkQueue = [];

  // Phase 1 : ultra rapide, local SQL uniquement. Dans une release embarquée, la
  // majorité des saisons est déjà dans metadata-full.sql.gz. Aucun appel réseau.
  for (let i = 0; i < items.length; i++) {
    const local = hydrateSeasonNewsWithLocalDetails(items[i]);
    if (hasUsefulSeasonNewsDetails(local) || seasonDetails.recent(local)) resolved[i] = local;
    else networkQueue.push({ item: items[i], i });
  }

  // Phase 2 : réseau seulement pour les trous restants. Concurrence modérée pour
  // ne pas taper trop fort Jikan/AniList, mais sans pause artificielle par item.
  await seasonDetails.prime(networkQueue.map(x=>x.item));
  await runWithConcurrency(networkQueue, 4, async ({ item, i }) => {
    try {
      const details = await searchNewsDetailsAllMethods(item);
      resolved[i] = details || item;
    } catch (e) {
      resolved[i] = item;
    }
  });

  const finalItems = writeNewsResults(items.map((item, i) => resolved[i] || item).filter(Boolean));
  res.json({ ok: true, local: items.length - networkQueue.length, network: networkQueue.length, items: finalItems });
});

app.post("/api/news/results/save", (req, res) => {
  const items = writeNewsResults(Array.isArray(req.body?.items) ? req.body.items : []);
  res.json({ ok: true, count: items.length });
});

app.post("/api/news/ignore", (req, res) => {
  try {
    const item = req.body || {};
    const title = String(item.title || item.name || item.officialTitle || "").trim();
    if (!title && !item.malId) return res.status(400).json({ error: "Titre manquant." });

    const ignored = readIgnoredNews();
    const key = normalizeTitle(title) || String(item.malId || "");
    const exists = ignored.some(x => (normalizeTitle(x.title) || String(x.malId || "")) === key);
    if (!exists) {
      ignored.push({
        title,
        malId: item.malId || "",
        ignoredAt: new Date().toISOString()
      });
      writeIgnoredNews(ignored);
    }

    const remaining = readNewsResults().filter(x => {
      const xKey = normalizeTitle(x.title) || String(x.malId || "");
      return xKey !== key;
    });
    writeNewsResults(remaining);

    res.json({ ok: true, ignored: true, remaining: remaining.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/api/news/ignore-all-sequels", (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : readNewsResults();
    const items = incoming.filter(item => item && (item.malId || item.title || item.name || item.officialTitle));
    if (!items.length) return res.json({ ok: true, ignored: 0, remaining: readNewsResults().length });

    const ignored = readIgnoredNews();
    const existingKeys = new Set(ignored.map(item => {
      const malId = String(item?.malId || "").trim();
      const title = normalizeTitle(item?.title || "");
      return malId ? `mal:${malId}` : (title ? `title:${title}` : "");
    }).filter(Boolean));
    let added = 0;
    for (const item of items) {
      const malId = String(item?.malId || "").trim();
      const title = String(item?.title || item?.name || item?.officialTitle || "").trim();
      const key = malId ? `mal:${malId}` : (title ? `title:${normalizeTitle(title)}` : "");
      if (!key || existingKeys.has(key)) continue;
      existingKeys.add(key);
      ignored.push({ malId, title, ignoredAt: new Date().toISOString(), bulk: true });
      added++;
    }
    writeIgnoredNews(ignored);

    const itemKeys = new Set(items.map(item => {
      const malId = String(item?.malId || "").trim();
      const title = normalizeTitle(item?.title || item?.name || item?.officialTitle || "");
      return malId ? `mal:${malId}` : (title ? `title:${title}` : "");
    }).filter(Boolean));
    const remaining = readNewsResults().filter(item => {
      const malId = String(item?.malId || "").trim();
      const title = normalizeTitle(item?.title || item?.name || item?.officialTitle || "");
      const key = malId ? `mal:${malId}` : (title ? `title:${title}` : "");
      return !itemKeys.has(key);
    });
    writeNewsResults(remaining);
    res.json({ ok: true, ignored: items.length, newlyIgnored: added, remaining: remaining.length });
  } catch (error) {
    res.status(500).json({ error: "Oubli groupé impossible : " + error.message });
  }
});

app.post("/api/news/ignore-sequel", (req, res) => {
  try {
    const item = req.body || {};
    const title = String(item.title || item.name || item.officialTitle || "").trim();
    const malId = String(item.malId || "").trim();
    if (!title && !malId) return res.status(400).json({ error: "malId ou titre requis" });

    const ignored = readIgnoredNews();
    const exists = ignored.some(x => (malId && String(x.malId || "") === malId) || (title && normalizeTitle(x.title) === normalizeTitle(title)));
    if (!exists) {
      ignored.push({ malId, title, ignoredAt: new Date().toISOString() });
      writeIgnoredNews(ignored);
    }

    const remaining = readNewsResults().filter(x => {
      const sameId = malId && String(x.malId || "") === malId;
      const sameTitle = title && normalizeTitle(x.title) === normalizeTitle(title);
      return !(sameId || sameTitle);
    });
    writeNewsResults(remaining);
    res.json({ ok: true, ignored: true, remaining: remaining.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/news/add-to-plan", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Titre manquant." });

  const animes = readAnimes();
  const item = req.body || {};
  const malId = String(item.malId || "").trim();

  const existingAnime = collectionIdentity.find(item, animes);
  if (existingAnime) {
    const remaining = removeSeasonNewsItemsFromCache([item]);
    return res.json({ ok: true, alreadyExists: true, existingAnime, remaining: remaining.length });
  }

  const anime = {
    id: nextId(animes),
    ...linkSeasonFamily(item,animes),
    title,
    status: "Plan to Watch",
    score: "",
    episodesSeen: "0",
    episodesTotal: item.episodesTotal || item.episodes || "",
    type: item.type || "TV",
    tags: Array.from(new Set([...(Array.isArray(item.tags) ? item.tags : []), item.source === "recommendation" ? "recommandation" : "nouvelle saison"].filter(Boolean))),
    poster: item.poster && String(item.poster).startsWith("/images/") ? item.poster : "",
    imageUrl: item.imageUrl || "",
    malUrl: item.malUrl || item.url || "",
    malId,
    notes: item.sourceTitle
      ? `Suite détectée depuis : ${item.sourceTitle}`
      : (item.source === "recommendation" ? "Ajouté depuis Recommandations." : ""),
    startDate: item.startDate || "",
    endDate: item.endDate || "",
    publicScore: item.publicScore || "",
    rank: item.rank || "",
    popularity: item.popularity || "",
    members: item.members || "",
    genres: Array.isArray(item.genres) ? item.genres : [],
    synopsis: item.synopsis || "",
    relations: [],
    nextSeasonCandidates: []
  };

  // Les cartes de recommandations n'envoyaient historiquement que titre + MAL ID.
  // On hydrate donc immédiatement la nouvelle fiche depuis le snapshot local afin
  // qu'elle soit réellement retrouvable et exploitable dans la bibliothèque sans
  // attendre une seconde passe « Compléter les infos ».
  try {
    await db.whenReady();
    let found = null;
    if (malId && db?.getMetadataByMalId) {
      const localById = db.getMetadataByMalId(malId);
      if (localById) found = metadataToFound(localById, title, 100);
    }
    if (!found) found = searchMetadataLocal(title, { minScore: 55, limit: 10, tokenLimit: 100 });
    if (found) mergeAutoInfo(anime, found, false);
  } catch {}

  // Re-read after asynchronous metadata work: concurrent clicks cannot duplicate or overwrite entries.
  const current = readAnimes();
  const duplicate = collectionIdentity.find(item, current);
  if (duplicate) return res.json({ok:true, alreadyExists:true, existingAnime:duplicate});
  anime.id = nextId(current);
  Object.assign(anime,linkSeasonFamily(item,current));
  current.push(anime);
  writeAnimes(current);

  removeSeasonNewsItemsFromCache([item]);
  const remaining = filterSeasonNewsItemsForLibrary(readNewsResults(), current);
  writeNewsResults(remaining);

  res.json({ ok: true, anime, remaining: remaining.length });
});





app.post("/api/betaseries/test", async (req, res) => {
  try {
    const key = String(req.body?.betaseriesApiKey || getBetaSeriesApiKey() || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "Aucune clé BetaSeries configurée." });
    const { response, text } = await boundedTextFetch("https://api.betaseries.com/search/shows?text=naruto", {
      timeoutMs: 10000, maxBytes: 2 * 1024 * 1024, maxRedirects: 0,
      headers: { "X-BetaSeries-Key": key, "User-Agent": `Anime Local Manager/${PRODUCT_RELEASE.technicalVersion}` }
    });
    const ok = response.ok;
    const status = response.status;
    const payload = ok ? JSON.parse(text) : null;
    const count = Array.isArray(payload?.shows) ? payload.shows.length : 0;
    const config = readConfig();
    config.betaseriesApiKey = key;
    config.betaseriesLastTest = { ok, status, count, testedAt: new Date().toISOString() };
    writeConfig(config);
    res.json(config.betaseriesLastTest);
  } catch (error) {
    const config = readConfig();
    config.betaseriesLastTest = { ok: false, error: error.message, testedAt: new Date().toISOString() };
    writeConfig(config);
    res.status(500).json(config.betaseriesLastTest);
  }
});

app.get("/api/betaseries/status", (req, res) => {
  try {
    const configured = Boolean(getBetaSeriesApiKey());
    res.json({ ok: true, configured, mode: configured ? "optionnel actif : fallback BetaSeries disponible" : "optionnel inactif : catalogue local et sources disponibles" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




app.get("/api/database/status", async (req, res) => {
  try {
    await db.whenReady();
    const { database, aliases, relations } = almDbLoad();
    const metadata = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
    res.json({
      ok: true,
      database: Object.keys(database.items || {}).length,
      aliases: Object.keys(aliases.items || {}).length,
      relations: Object.keys(relations.items || {}).length,
      metadata: metadata.count || 0,
      metadataSeedPathExists: Boolean(metadata.seedPathExists),
      metadataSeedFiles: metadata.seedFiles || [],
      metadataOfflineReady: Number(metadata.count || 0) > 0 || Boolean(metadata.seedPathExists),
      metadataRemoteConfigured: isMetadataRemoteConfigured(),
      metadataBundled: readMetadataBundledStatus(),
      metadataPreload: readMetadataPreloadStatus(),
      metadataAutonomous: readMetadataAutonomousStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/metadata/status", async (req, res) => {
  try {
    await db.whenReady();
    const config = readConfig();
    res.json({
      ok: true,
      ...(db.getMetadataStats ? db.getMetadataStats() : { count: 0 }),
      remoteConfigured: isMetadataRemoteConfigured(),
      manifestUrl: getMetadataManifestUrl(),
      bundled: readMetadataBundledStatus(),
      preload: readMetadataPreloadStatus(),
      autonomous: readMetadataAutonomousStatus(),
      autonomousConfigured: config.metadataAutonomousUpdateOnStart !== false,
      autonomousIntervalHours: Number(config.metadataAutonomousIntervalHours || 168),
      autonomousConfig: metadataAutonomousConfig()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const translatePublicSynopsis=require('./lib/synopsis-language').createSynopsisLanguage({directory:DATA_DIR,fetchText:boundedTextFetch});
require('./lib/discovery').mountDiscovery(app,{db,searchOnline:title=>searchAnimeSmart(title,{forceOnline:true}),learn:item=>metadataLearnFromFound(item,'discovery'),translate:translatePublicSynopsis,fetchDetails:async id=>{const raw=await metadataProviders.details(id);return raw?{...require('./lib/discovery').publicAnime(jikanAnimeToMetadataRow(raw)),trailer:raw.trailer}:null;},upload:multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}}),imagesDir:IMAGES_DIR});
require('./lib/anime-association').mountAssociations(app,{db,readAnimes,writeAnimes,onAssociated:(previous,next,before,after)=>{const family=String(next.betaseriesSeriesId||next.betaseriesId||'');const root=after.find(a=>a.malId&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&Number(a.betaseriesSeason||1)===1);automation.rememberSeason(next,true,root?.malId);automation.record('manual-association',before,after);const pending=after.filter(a=>family&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&a.id!==next.id&&importIntegrity.provisional(a)).map(a=>Number(a.id));if(pending.length)enqueueCompletion('info-images',{ids:pending,retryMarked:true,automatic:true});scheduleDeferredCompletion();},fetchRecord:async id=>{const raw=await metadataProviders.details(id);return raw&&Number(raw.mal_id)===id?{...require('./lib/discovery').publicAnime(jikanAnimeToMetadataRow(raw)),trailer:raw.trailer}:null;}});
require('./lib/rankings').mountRankings(app, {
  directory: DATA_DIR, ready: () => db.whenReady(), getLocal: () => db.getTopMetadata(100),
  source: "mal", mapItem: require('./lib/rankings').fromJikan,
  fetchPage: page => metadataProviders.ranking(page),
  learn: rows => db.importMetadataRows(rows.map(r => ({...r, score:r.publicScore, episodes:r.episodesTotal, imageUrl:r.poster})))
});

require('./lib/studio-rankings').mountStudioRankings(app,{
 directory:DATA_DIR,retired:true,ready:()=>db.whenReady(),listStudios:()=>db.listMetadataStudios(),getLocal:name=>db.getStudioMetadata(name),
 fetchJson:async suffix=>{const r=await boundedTextFetch('https://api.jikan.moe/v4'+suffix,{timeoutMs:9000,maxBytes:3*1024*1024,maxRedirects:0,fetchImpl:(...args)=>jikanLimited(()=>fetch(...args))});if(!r.response.ok)throw Error('Studio source unavailable');return JSON.parse(r.text);},
 learn:rows=>db.importMetadataRows(rows.map(r=>({...r,score:r.publicScore,episodes:r.episodesTotal,imageUrl:r.poster})))
});

app.get("/api/metadata/search", async (req, res) => {
  try {
    await db.whenReady();
    const q = String(req.query.q || "").trim();
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    res.json({ ok: true, q, items: db.searchMetadataByTitle ? db.searchMetadataByTitle(q, limit) : [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/metadata/batch", async (req, res) => {
  try {
    await db.whenReady();
    const ids = Array.from(new Set((Array.isArray(req.body?.malIds) ? req.body.malIds : [])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0)))
      .slice(0, 120);
    const items = {};
    for (const id of ids) {
      const meta = db.getMetadataByMalId ? db.getMetadataByMalId(id) : null;
      if (!meta) continue;
      items[String(id)] = {
        malId: Number(meta.malId || id),
        title: String(meta.titleEn || meta.title || meta.titleRomaji || ""),
        imageUrl: String(meta.imageUrl || ""),
        type: String(meta.type || ""),
        score: meta.score || "",
        startDate: String(meta.startDate || "")
      };
    }
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ error: "Metadata groupée indisponible : " + error.message });
  }
});

app.get("/api/metadata/:malId", async (req, res) => {
  try {
    await db.whenReady();
    const item = db.getMetadataByMalId ? db.getMetadataByMalId(req.params.malId) : null;
    if (!item) return res.status(404).json({ error: "Metadata introuvable." });
    res.json({ ok: true, item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/metadata/preload", async (req, res) => {
  try {
    const result = await almMetadataPreload({
      force: req.body?.force === true,
      clear: req.body?.clear === true
    });
    res.json(result);
  } catch (error) {
    const status = writeMetadataPreloadStatus({ ok: false, status: "error", error: error.message });
    res.status(500).json({ error: "Préchargement metadata impossible : " + error.message, status });
  }
});

app.post("/api/metadata/sync", async (req, res) => {
  try {
    const result = await almMetadataRemoteSync({
      force: req.body?.force === true,
      clear: req.body?.clear === true
    });
    res.json(result);
  } catch (error) {
    const status = writeMetadataPreloadStatus({ ok: false, status: "sync-error", error: error.message });
    res.status(500).json({ error: "Synchronisation metadata impossible : " + error.message, status });
  }
});

app.get("/api/metadata/autonomous/status", async (req, res) => {
  try {
    await db.whenReady();
    res.json({
      ok: true,
      progress: metadataAutonomousProgress, running: Boolean(metadataAutonomousJob),
      config: metadataAutonomousConfig(),
      status: readMetadataAutonomousStatus(),
      stats: db.getMetadataStats ? db.getMetadataStats() : { count: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/metadata/autonomous/sync", async (req, res) => {
  try {
    if(req.body?.background===true){
      const reused=Boolean(metadataAutonomousJob);
      runMetadataAutonomousUpdate({force:req.body?.force===true,wait:true}).catch(error=>console.warn('[metadata]',error.message));
      return res.status(202).json({ok:true,running:true,reused,progress:metadataAutonomousProgress});
    }
    const result = await runMetadataAutonomousUpdate({
      force: req.body?.force === true,
      wait: true
    });
    res.json(result);
  } catch (error) {
    const status = writeMetadataAutonomousStatus({ ok: false, status: "manual-error", error: error.message });
    res.status(500).json({ error: "Mise a jour autonome metadata impossible : " + error.message, status });
  }
});

app.post("/api/metadata/autonomous-sync", async (req, res) => {
  try {
    const result = await runMetadataAutonomousUpdate({
      force: req.body?.force === true,
      startup: false,
      wait: true
    });
    res.json(result);
  } catch (error) {
    const status = writeMetadataAutonomousStatus({ ok: false, status: "manual-error", error: error.message });
    res.status(500).json({ error: "Mise a jour autonome metadata impossible : " + error.message, status });
  }
});

app.post("/api/metadata/import", async (req, res) => {
  try {
    await db.whenReady();
    let result;
    if (Array.isArray(req.body?.items)) {
      result = db.importMetadataRows(req.body.items, { clear: req.body?.clear === true });
    } else if (typeof req.body?.sql === "string") {
      result = db.importMetadataSql(req.body.sql, {clear:req.body?.clear === true});
    } else {
      return res.status(400).json({ error: "Envoyer { items:[...] } ou { sql:\"...\" }." });
    }
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ error: "Import metadata impossible : " + error.message });
  }
});

app.post("/api/database/preload", async (req, res) => {
  try {
    const result = await almDbPreloadCache();
    const metadata = await almMetadataPreload({ force: req.body?.forceMetadata === true });
    res.json({ ...result, metadata });
  } catch (error) {
    res.status(500).json({ error: "Préchargement database impossible : " + error.message });
  }
});

app.post("/api/cache/preload", async (req, res) => {
  try {
    const result = await almDbPreloadCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Préchargement du cache impossible : " + error.message });
  }
});


app.get("/api/cache/status", (req, res) => {
  try {
    const file = almTurboCacheFile("preload-cache-status.json");
    if (!fs.existsSync(file)) return res.json({ ok: false, count: 0, updatedAt: null });
    res.json(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/config/workers", (req, res) => {
  try {
    const config = readConfig();
    const mode = String(req.body?.workerMode || "normal");
    config.workerMode = ["prudent", "normal", "rapide", "turbo"].includes(mode) ? mode : "turbo";
    writeConfig(config);
    res.json({ ok: true, workerMode: config.workerMode, workers: almTurboWorkerCount(config.workerMode) });
  } catch (error) {
    res.status(500).json({ error: "Impossible d’enregistrer le mode workers : " + error.message });
  }
});

app.post("/api/config/betaseries", (req, res) => {
  try {
    const config = readConfig();
    const incoming = String(req.body?.betaseriesApiKey || "").trim();
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "betaseriesApiKey")) config.betaseriesApiKey = incoming;
    writeConfig(config);
    res.json({ ok: true, config: { ...Object.fromEntries(Object.entries(config).filter(([key])=>!require('./lib/config-secrets').sensitive(key))), betaseriesApiKeySaved: Boolean(config.betaseriesApiKey) } });
  } catch (error) {
    res.status(500).json({ error: "Impossible d’enregistrer la clé BetaSeries : " + error.message });
  }
});

app.get("/api/config/providers", (_req,res) => res.json({malConfigured:metadataProviders.configured(),jikan:"retired",localCatalog:true}));
app.post("/api/config/providers", (req,res) => {
  const clientId = String(req.body?.malClientId || "").trim();
  if (clientId && !/^[a-zA-Z0-9_-]{8,128}$/.test(clientId)) return res.status(400).json({error:"ALM_MAL_CLIENT_INVALID"});
  const config=readConfig();config.malClientId=clientId;writeConfig(config);
  res.json({ok:true,malConfigured:metadataProviders.configured()});
});

app.post("/api/config/metadata", (req, res) => {
  try {
    const config = readConfig();
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataManifestUrl")) {
      config.metadataManifestUrl = String(req.body?.metadataManifestUrl || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataUrl")) {
      config.metadataUrl = String(req.body?.metadataUrl || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataUpdateOnStart")) {
      config.metadataUpdateOnStart = req.body?.metadataUpdateOnStart !== false;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataUpdateIntervalHours")) {
      const hours = Number(req.body?.metadataUpdateIntervalHours);
      config.metadataUpdateIntervalHours = Number.isFinite(hours) && hours > 0 ? Math.max(1, Math.min(24 * 30, hours)) : 168;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataAutonomousUpdateOnStart")) {
      config.metadataAutonomousUpdateOnStart = req.body?.metadataAutonomousUpdateOnStart !== false;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataAutonomousIntervalHours")) {
      const hours = Number(req.body?.metadataAutonomousIntervalHours);
      config.metadataAutonomousIntervalHours = Number.isFinite(hours) && hours > 0 ? Math.max(6, Math.min(24 * 30, hours)) : 168;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataAutonomousSeasonalPages")) {
      config.metadataAutonomousSeasonalPages = clampNumber(req.body?.metadataAutonomousSeasonalPages, 2, 1, 12);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataAutonomousUpcomingPages")) {
      config.metadataAutonomousUpcomingPages = clampNumber(req.body?.metadataAutonomousUpcomingPages, 2, 0, 12);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataAutonomousTopPages")) {
      config.metadataAutonomousTopPages = clampNumber(req.body?.metadataAutonomousTopPages, 2, 0, 20);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataAutonomousAniListPages")) {
      config.metadataAutonomousAniListPages = clampNumber(req.body?.metadataAutonomousAniListPages, 2, 0, 5);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "metadataAutonomousLearnFromSearch")) {
      config.metadataAutonomousLearnFromSearch = req.body?.metadataAutonomousLearnFromSearch !== false;
    }
    writeConfig(config);
    res.json({
      ok: true,
      config: {
        metadataManifestUrl: config.metadataManifestUrl || "",
        metadataUrl: config.metadataUrl || "",
        metadataUpdateOnStart: config.metadataUpdateOnStart !== false,
        metadataUpdateIntervalHours: config.metadataUpdateIntervalHours || 168,
        metadataAutonomousUpdateOnStart: config.metadataAutonomousUpdateOnStart !== false,
        metadataAutonomousIntervalHours: config.metadataAutonomousIntervalHours || 168,
        metadataAutonomousSeasonalPages: config.metadataAutonomousSeasonalPages || 2,
        metadataAutonomousUpcomingPages: config.metadataAutonomousUpcomingPages || 2,
        metadataAutonomousTopPages: config.metadataAutonomousTopPages || 2,
        metadataAutonomousAniListPages: config.metadataAutonomousAniListPages || 2,
        metadataAutonomousLearnFromSearch: config.metadataAutonomousLearnFromSearch !== false
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Impossible d'enregistrer la configuration metadata : " + error.message });
  }
});

app.get("/api/config", (req, res) => {
  const config=readConfig();const publicConfig=Object.fromEntries(Object.entries(config).filter(([key])=>!require('./lib/config-secrets').sensitive(key)));res.json({...publicConfig,malClientIdSaved:metadataProviders.configured(),betaseriesApiKeySaved:Boolean(config.betaseriesApiKey)});
});


function safeReadJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function readBackupJsonFile(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw Error('ALM_BACKUP_STATE_READ_FAILED'); }
}
function createBackupPayload() {
  const payload = {
    app: "Anime Local Manager",
    version: typeof BACKUP_VERSION !== "undefined" ? BACKUP_VERSION : "1.0.0",
    createdAt: new Date().toISOString(),
    data: {
      animes: readAnimes(),
      ignoredNews: typeof IGNORED_NEWS_FILE !== "undefined" ? readBackupJsonFile(IGNORED_NEWS_FILE, []) : [],
      newsCache: typeof NEWS_CACHE_FILE !== "undefined" ? readBackupJsonFile(NEWS_CACHE_FILE, {}) : {},
      newsResults: typeof NEWS_RESULTS_FILE !== "undefined" ? readBackupJsonFile(NEWS_RESULTS_FILE, []) : [],
      seasonScanState: typeof NEWS_SCAN_STATE_FILE !== "undefined" ? readBackupJsonFile(NEWS_SCAN_STATE_FILE, {}) : {},
      mediaReview: readBackupJsonFile(MEDIA_REVIEW_FILE, mediaReviewDefaultState()),
      automationDecisions:automation.snapshot(),
      newsHistory: db.exportNewsHistory ? db.exportNewsHistory() : [],
      config: Object.fromEntries(Object.entries(readConfig()).filter(([key])=>!/(?:key|token|secret|password|clientId)/i.test(key))),
      localState: Object.fromEntries(['localized-titles.json','notification-center.json','episode-releases.json','broadcast-calendar.json','community-profile.json','community-favorites.json','maintenance-settings.json'].map(name=>[name,readBackupJsonFile(path.join(DATA_DIR,name),null)]))
    }
  };
  require('./lib/restoration').validatePayload(payload);
  return payload;
}

const storageMaintenance=require('./lib/storage-maintenance').mountStorage(app,{dataDir:DATA_DIR,imagesDir:IMAGES_DIR,db});
const notificationCenter=require('./lib/notification-center').createNotificationCenter({file:path.join(DATA_DIR,'notification-center.json')});
const localizedTitles=require('./lib/localized-titles').createLocalizedTitles({file:path.join(DATA_DIR,'localized-titles.json')});
const independentStore = require('./lib/independent-catalogue').createCatalogue(path.join(DATA_DIR, 'independent-catalogue'));
try {
  if (!independentStore.read()) {
    const bundled = require('./lib/independent-catalogue').createCatalogue(path.join(__dirname, 'data/independent-catalogue')).read();
    if (bundled) independentStore.install(bundled.data);
  }
} catch (error) { console.warn('[catalogue-secours] Catalogue unavailable:', error.code || error.message); }
require('./lib/independent-catalogue-api').mountIndependentCatalogue(app, {catalogue: independentStore, db, readAnimes: () => readAnimes(false), writeAnimes});
app.get('/api/rescue/status', (_req, res) => res.json({active: true, offline: true, experimental: true, personalProfile: 'separate', catalogueCoverageValidated: false}));
const catalogOperations=require('./lib/catalog').mountCatalog(app,{db,readAnimes:()=>readAnimes(false),writeAnimes,titles:localizedTitles,updatedAt:()=>{const status=readMetadataAutonomousStatus();return status?.completedAt||status?.finishedAt||safeReadJsonFile(path.join(__dirname,'data/database/metadata-manifest.json'),{}).generatedAt||null;}});
require('./lib/notebook').mountNotebook(app,{db,readAnimes,writeAnimes,titles:localizedTitles,rememberBatch:added=>catalogOperations.remember({kind:'batch',added})});
const releaseWatch=createReleaseWatch({stateFile:path.join(DATA_DIR,'episode-releases.json'),getAnimes:readAnimes}),versionCheck=createVersionCheck();
const calendar=createCalendar({stateFile:path.join(DATA_DIR,'broadcast-calendar.json'),getAnimes:readAnimes,getNotificationEvents:()=>notificationCenter.state().items.map(i=>i.airingAt?i:{...i,airingAt:releaseWatch.state().items.find(r=>r.animeId===i.animeId&&r.episode===i.episode)?.airingAt||null}),getMetadata:()=>db.listMetadataForCalendar().map(require('./lib/discovery').publicAnime),fetchTracked:providerBatchWithFallback});
onLibraryIdentityChange=ids=>{
 try{calendar.invalidate(ids);releaseWatch.invalidate(ids);notificationCenter.invalidate(ids);}catch(error){console.warn('[associations] Linked schedules will be refreshed:',error.message);}
};
app.get('/api/calendar/synopsis',async(req,res)=>{try{await db.whenReady();const item=calendar.state().events.find(e=>e.key===String(req.query.key||''));if(!item?.anime?.synopsis)return res.status(404).json({error:'Synopsis missing'});res.json({ok:true,...await translatePublicSynopsis(item.anime.synopsis,req.query.lang)});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/calendar',async(req,res)=>{try{await db.whenReady();res.json(calendar.state());}catch{res.status(503).json({code:'ALM_CALENDAR_SOURCE'});}});
app.post('/api/calendar/check',async(req,res)=>{try{await db.whenReady();calendar.check(req.body?.force===true).catch(()=>{});res.json(calendar.state());}catch{res.status(503).json({code:'ALM_CALENDAR_SOURCE'});}});
app.get('/api/airing',async(req,res)=>{try{await db.whenReady();res.json(releaseWatch.state());}catch{res.status(503).json({code:'ALM_AIRING_SOURCE'});}});
app.post('/api/airing/check',async(req,res)=>{try{await db.whenReady();res.json(await releaseWatch.check(req.body?.force===true));}catch{res.status(503).json({code:'ALM_AIRING_SOURCE'});}});
app.post('/api/airing/settings',(req,res)=>res.json(releaseWatch.configure(req.body?.enabled)));
app.get('/api/airing/notifications',(req,res)=>{const items=releaseWatch.unseen().slice(-5);for(const item of items)notificationCenter.record({...item,malId:readAnimes().find(a=>a.id===item.animeId)?.malId});res.json({items,muted:notificationCenter.state().muted});});
app.post('/api/airing/ack',(req,res)=>res.json({ok:releaseWatch.ack(String(req.body?.key||''))}));
app.get('/api/notifications',(req,res)=>res.json(notificationCenter.state()));
app.post('/api/notifications/read',(req,res)=>res.json(notificationCenter.read()));
app.post('/api/notifications/clear',(req,res)=>res.json(notificationCenter.clear()));
app.post('/api/notifications/settings',(req,res)=>res.json(notificationCenter.configure(req.body?.muted)));
app.post('/api/notifications/test',(req,res)=>res.json(notificationCenter.record({title:'Anime Local Manager'},'test')));
app.get('/api/titles',async(req,res)=>{const ids=String(req.query.ids||'').split(',').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,100);res.json({titles:await localizedTitles.resolve(ids)});});
app.get('/api/library/completion-issues',(req,res)=>{const animes=readAnimes();res.json({items:completionIssueItems(animes),awaiting:completionAwaitingItems(animes)});});
app.get('/api/animes/:id/association-candidates',async(req,res)=>{
 await db.whenReady();await db.prepareMetadataTitleIndex();
 const items=readAnimes(),anime=items.find(a=>Number(a.id)===Number(req.params.id));if(!anime)return res.status(404).json({code:'ALM_ANIME_MISSING'});
 const family=String(anime.betaseriesSeriesId||anime.betaseriesId||''),root=items.find(a=>a.malId&&family&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&Number(a.betaseriesSeason||1)===1);
 const base=root?db.getMetadataByMalId(root.malId):null,q=String(req.query.q||'').trim().slice(0,160),queries=q?seasonReference.queries({title:q},{}):seasonReference.queries(anime,base||{});
 const found=new Map();for(const query of queries)for(const row of localSeasonSearch(query,50))found.set(Number(row.malId),row);
 const sourceSeason=Number(anime.manualSeasonNumber||anime.betaseriesSeason)||0;
 const ranked=[...found.values()].map(row=>({row,match:!!base&&localSeasonLinks.familySlot(base,row)?.season===sourceSeason,main:localSeasonLinks.isMain(row)})).sort((a,b)=>Number(b.match)-Number(a.match)||Number(b.main)-Number(a.main)||String(a.row.startDate||'').localeCompare(String(b.row.startDate||'')));
 res.json({items:ranked.slice(0,40).map(({row,match,main})=>({...require('./lib/discovery').publicAnime(row),matchEvidence:{sourceSeasonMatch:match,mainSeries:main}})),sourceSeason,sourcePosition:anime.betaseriesEpisode||'',source:'local'});
});
app.post('/api/animes/:id/preserve-import-gap',(req,res)=>{
 const rows=readAnimes(),a=rows.find(a=>Number(a.id)===Number(req.params.id));
 if(!a)return res.status(404).json({code:'ALM_ANIME_MISSING'});
 if(req.body?.fingerprint!==progressReconciliation.fingerprint(a)||!Number(a.unallocatedEpisodes))return res.status(409).json({code:'ALM_PROGRESS_CHANGED'});
 a.progressResolution={kind:'preserved-source-gap',fingerprint:progressReconciliation.fingerprint(a),episodes:Number(a.unallocatedEpisodes),sourcePosition:a.betaseriesEpisode,at:new Date().toISOString()};
 a.needsSequelCheck=false;a.progressWarning='';
 writeAnimes(rows);res.json({ok:true,anime:a});
});
app.get('/api/animes/:id/import-gap',(req,res)=>{
 const a=readAnimes().find(a=>Number(a.id)===Number(req.params.id));if(!a)return res.status(404).json({code:'ALM_ANIME_MISSING'});
 res.json({id:a.id,title:a.title,sourcePosition:a.betaseriesEpisode||'',sourceTitle:a.betaseriesSourceTitle||a.seriesRootTitle||'',episodesSeen:a.episodesSeen||'',episodesTotal:a.episodesTotal||'',unallocated:Number(a.unallocatedEpisodes)||0,progressEvidence:require('./lib/import-progress-evidence').infer(a.betaseriesSourceRow),fingerprint:progressReconciliation.fingerprint(a),acknowledged:progressReconciliation.acknowledged(a)});
});

function upgradeLocalCollection(){
 ensureCatalogueIntegrity();const original=readAnimes(),items=original.map(a=>({...a})),corrected=[];
 for(let index=0;index<items.length;index++){
  const a=items[index];
  if(!a.malId&&importIntegrity.provisional(a)){
    const found=exactLocalCompletion(a);
    if(found&&!items.some(other=>other!==a&&String(other.malId)===String(found.malId))){mergeAutoInfo(a,found,false);clearAutoCompletionUnresolved(a);corrected.push(a.id);}
  }
  const marker=betaSeriesProgress.parseBetaSeriesEpisode(a.betaseriesEpisode);
  if(a.malId&&/^Movie$/i.test(a.type||'')&&marker.season===1&&marker.episode>1&&!a.importIdentityReviewed&&!metadataPreferences.locked(a,'type')&&a.associationResolution?.source!=='manual'){
    const source=a.betaseriesSourceTitle||a.betaseriesSourceRow?.title;
    if(!source)continue;
    const alternatives=localSeasonSearch(source,100).filter(r=>/^ONA$|^TV$/i.test(r.type||'')&&Number(r.episodes)===marker.episode&&[r.title,r.titleEn,...(r.synonyms||[])].some(t=>seasonResolver.norm(t)===seasonResolver.norm(source)));
    if(alternatives.length!==1||items.some(other=>other!==a&&Number(other.malId)===Number(alternatives[0].malId)))continue;
    const record=require('./lib/discovery').publicAnime(alternatives[0]);
    const next=require('./lib/anime-association').reassociate(a,record);
    next.importPreviousIdentity={malId:a.malId,title:a.title,type:a.type};next.episodesSeen=String(marker.episode);next.unallocatedEpisodes=0;next.needsSequelCheck=false;next.progressWarning='';next.importProgressVersion=55;
    next.tags=(next.tags||[]).filter(t=>!/non trouvé auto|progression à vérifier|suite probable/.test(t));
    items[index]=metadataPreferences.preserve(a,next);corrected.push(a.id);
  }
 }
 if(corrected.length){
  const file=path.join(DATA_DIR,'backups','before-beta57-local-associations.json');if(!fs.existsSync(file))require('./lib/atomic-file').atomicJson(file,original);
  writeAnimes(items);automation.record('season-reference-normalization',original,readAnimes());require('./lib/atomic-file').atomicJson(path.join(DATA_DIR,'backups','beta57-local-associations-report.json'),{version:57,corrected});
 }
 return {corrected};
}
app.post('/api/bulk/titles',async(req,res)=>{
 cleanupCompletionJobs();if(rejectWhenCompletionJobIsActive(res))return;
 await db.whenReady();const language=require('./lib/localized-titles');const lang=String(req.body?.lang||'fr');
 if(!['fr','en','ja','es','de','pt-BR','zh-CN'].includes(lang))return res.status(400).json({error:'Invalid language'});
 const targets=readAnimes(),jobId=crypto.randomUUID(),job={kind:'titles',status:'running',startedAt:Date.now(),total:targets.length,done:0,updatedInfos:0,updatedImages:0,failed:0,currentTitle:'',cancelRequested:false,elapsed:0};_completeAllJobs[jobId]=job;res.json({jobId});
 (async()=>{try{
  for(let offset=0;offset<targets.length;offset+=25){if(job.cancelRequested)break;const batch=targets.slice(offset,offset+25);job.current=batch[0]?.title||'';const names=await localizedTitles.resolve(batch.map(a=>a.malId));if(job.cancelRequested)break;
   const current=readAnimes();for(const old of batch){if(job.cancelRequested)break;const anime=current.find(a=>String(a.id)===String(old.id));if(!anime)continue;const metadata=anime.malId?db.getMetadataByMalId(anime.malId):null;const canonical=metadata?.titleRomaji||metadata?.title||anime.canonicalTitle||anime.title;const record={...anime,canonicalTitle:canonical,titleEn:metadata?.titleEn||anime.titleEn,titleJa:metadata?.titleJa||anime.titleJa,localizedTitles:{...anime.localizedTitles,...names[anime.malId]}};const title=language.titleFor(record,lang);if(!anime.customTitle&&title&&title!==anime.title){anime.title=title;job.updatedInfos++;}anime.canonicalTitle=canonical;anime.localizedTitles=record.localizedTitles;if(record.titleEn)anime.titleEn=record.titleEn;if(record.titleJa)anime.titleJa=record.titleJa;job.done++;job.current=anime.title;}writeAnimes(current);job.elapsed=(Date.now()-job.startedAt)/1000;await yieldToEventLoop();
  }job.status=job.cancelRequested?'cancelled':'done';
 }catch(error){job.status='error';job.error=error.message;}finally{job.finishedAt=Date.now();job.elapsed=(Date.now()-job.startedAt)/1000;}})();
});
app.get('/api/updates',(req,res)=>res.json(versionCheck.state()));
app.post('/api/updates/check',async(req,res)=>res.json(await versionCheck.check(req.body?.force===true,maintenance.state().settings.channel)));
const backupManager = encryptedBackup.createBackupManager({settingsFile:path.join(DATA_DIR,'encrypted-backup-settings.json'),imagesDir:IMAGES_DIR,getPayload:async()=>{await db.whenReady();return createBackupPayload();}});
app.get('/api/backup/encrypted/status',(req,res)=>res.json(backupManager.state()));
app.post('/api/backup/encrypted/settings',async(req,res)=>{
  try { res.json(await backupManager.configure(req.body||{})); }
  catch(error) { res.status(400).json({error:error.message,code:error.message}); }
});
app.post('/api/backup/encrypted/run',async(req,res)=>{
  try { res.json(await backupManager.run()); }
  catch(error) { res.status(400).json({error:error.code||error.message,code:error.message}); }
});
app.post('/api/backup/encrypted/export',async(req,res)=>{
  try {
    await db.whenReady();
    const payload=await encryptedBackup.attachImages(createBackupPayload(),IMAGES_DIR);
    const bytes=await encryptedBackup.encrypt(payload,req.body?.password);
    res.setHeader('Content-Type','application/octet-stream');
    res.setHeader('Content-Disposition','attachment; filename="ALM-'+new Date().toISOString().slice(0,10)+'.alm-backup"');
    res.send(bytes);
  }catch(error){res.status(400).json({error:error.message,code:error.message});}
});


app.get("/api/backup/export", async (req, res) => {
  try {
    await db.whenReady();
    const payload = createBackupPayload();
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename=anime-local-manager-backup-${date}.json`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    res.status(500).json({ error: "Impossible de créer la sauvegarde : " + error.message });
  }
});


function localPosterFileExists(poster) {
  if (!poster) return false;
  const normalized = String(poster).replace(/\\/g, "/");
  if (normalized.includes("/images/")) {
    const filename = path.basename(normalized);
    return fs.existsSync(path.join(IMAGES_DIR, filename));
  }
  return false;
}

function normalizeRestoredAnimeImages(animes) {
  return (Array.isArray(animes) ? animes : []).map(anime => {
    const copy = { ...anime };
    if (copy.poster && !localPosterFileExists(copy.poster)) copy.poster = "";
    return copy;
  });
}

async function restoreBackupPayload(...args){return mediaReviewQueue.run(()=>restoreBackupPayloadUnlocked(...args));}
async function restoreBackupPayloadUnlocked(payload,options={}) {
    await db.whenReady();
    if(automation.jobs().some(j=>['queued','running'].includes(j.status))||activeCompletionJobEntry())throw Error('ALM_LIBRARY_TASK_ACTIVE');
    const data = payload.data || payload;
    if(!Array.isArray(data?.animes)||data.animes.length>100000||data.animes.some(a=>!a||typeof a.title!=='string'||!Number.isSafeInteger(Number(a.id))||Number(a.id)<1))throw Error('ALM_BACKUP_FORMAT');
    require('./lib/restoration').validatePayload(payload);
    const originalHash=crypto.createHash('sha256').update(JSON.stringify(readAnimes())).digest('hex');
    if(options.expectedFingerprint&&options.expectedFingerprint!==originalHash)throw Error('ALM_BACKUP_COLLECTION_CHANGED');
    const recovery=await backupManager.recovery(createBackupPayload(),path.join(DATA_DIR,'restore-recovery'));
    if(crypto.createHash('sha256').update(JSON.stringify(readAnimes())).digest('hex')!==originalHash)throw Error('ALM_BACKUP_COLLECTION_CHANGED');
    const images=encryptedBackup.validateImages(payload);
    const posterMap=new Map();
    // Restore images under content-derived names, without overwriting unrelated files.
    for(const image of images){const name='restore-'+crypto.createHash('sha256').update(image.bytes).digest('hex')+path.extname(image.name).toLowerCase();const target=path.join(IMAGES_DIR,name);if(!fs.existsSync(target))require('./lib/atomic-file').atomicWrite(target,image.bytes);posterMap.set('/images/'+image.name,'/images/'+name);}
    const restoredAnimes=data.animes.map(a=>({...a,poster:posterMap.get(a.poster)||a.poster}));
    const previous={animes:db.getAllAnimes(),news:db.exportNewsHistory?db.exportNewsHistory():[]};
    const localNames=['localized-titles.json','notification-center.json','episode-releases.json','broadcast-calendar.json','community-profile.json','community-favorites.json','maintenance-settings.json'];
    const files=[...localNames.map(name=>path.join(DATA_DIR,name)),...['verified-series-links.json','corrections.json','library-tasks.json'].map(name=>path.join(DATA_DIR,'automation',name)),DATA_FILE,DATA_FILE+'.bak',IGNORED_NEWS_FILE,NEWS_CACHE_FILE,NEWS_RESULTS_FILE,NEWS_SCAN_STATE_FILE,MEDIA_REVIEW_FILE,CONFIG_FILE];
    const snapshots=files.map(file=>({file,bytes:fs.existsSync(file)?fs.readFileSync(file):null}));
    // Synchronous writes after validation prevent other requests from interleaving.
    try {
    writeAnimes(normalizeRestoredAnimeImages(restoredAnimes));
    if (Array.isArray(data.ignoredNews)) writeIgnoredNews(data.ignoredNews);
    if (data.newsCache && typeof data.newsCache === "object") writeNewsCache(data.newsCache);
    if (Array.isArray(data.newsResults)) writeNewsResults(data.newsResults);
    if (data.mediaReview && typeof data.mediaReview === "object") {
      writeJsonAtomicSync(MEDIA_REVIEW_FILE,normalizeRestoredMediaReviewState(data.mediaReview));
    } else if (data.importQuarantine && typeof data.importQuarantine === "object") {
      // Compatibilité avec une sauvegarde de développement antérieure : les
      // entrées deviennent des imports en attente dans le nouveau format.
      writeJsonAtomicSync(MEDIA_REVIEW_FILE,normalizeRestoredMediaReviewState(data.importQuarantine));
    }
    if (data.seasonScanState && typeof data.seasonScanState === "object" && !Array.isArray(data.seasonScanState)) {
      writeSeasonScanState(data.seasonScanState);
    }
    if (data.config && typeof data.config === "object" && !Array.isArray(data.config)) {
      const restoredConfig = { ...readConfig(), ...data.config };
      restoredConfig.newsHistoryRetentionDays = normalizeNewsRetentionDays(
        restoredConfig.newsHistoryRetentionDays,
        NEWS_HISTORY_DEFAULT_DAYS
      );
      writeConfig(restoredConfig);
    }

    if(data.localState&&typeof data.localState==='object')for(const name of localNames)if(data.localState[name]&&typeof data.localState[name]==='object')writeJsonAtomicSync(path.join(DATA_DIR,name),data.localState[name]);
    let newsHistoryRestore = null;
    if (Array.isArray(data.newsHistory) && db.clearNewsHistory && db.upsertNewsItems) {
      const previousCount = db.getNewsHistoryCount();
      const imported = db.upsertNewsItems(data.newsHistory, { replace: true, strict: true });
      if (!imported.ok || imported.processed !== data.newsHistory.length) throw Error('ALM_BACKUP_NEWS_RESTORE_FAILED');
      const cleared = { ok: true, deleted: previousCount, total: 0 };
      newsHistoryRestore = { cleared, imported };
    }

    if(data.automationDecisions)automation.restoreDecisions(data.automationDecisions);
    for(const [id,job]of Object.entries(_completeAllJobs))if(job.status==='retrying')finishCompletionJob(job,'cancelled');
    localSeasonMemo.clear();scheduleDeferredCompletion();
    return {
      ok: true,
      restored: true,
      requiresRestart: Boolean(data.localState),
      recovery,
      animeCount: Array.isArray(data.animes) ? data.animes.length : null,
      newsHistory: newsHistoryRestore
    };
    }catch(error){try{db.writeAllAnimes(previous.animes);if(db.upsertNewsItems){const rolledBack=db.upsertNewsItems(previous.news,{replace:true,strict:true});if(!rolledBack.ok||rolledBack.processed!==previous.news.length)throw Error('ALM_BACKUP_NEWS_ROLLBACK_FAILED');}for(const {file,bytes}of snapshots){if(bytes===null){if(fs.existsSync(file))fs.unlinkSync(file);}else require('./lib/atomic-file').atomicWrite(file,bytes);}}catch(rollbackError){console.error('[restore] Rollback failed:',rollbackError.message);throw Error('ALM_BACKUP_ROLLBACK_FAILED');}throw error;}
}

app.post("/api/backup/restore", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier de sauvegarde manquant." });
  try {
    const payload = JSON.parse(req.file.buffer.toString("utf8"));
    res.json(await restoreBackupPayload(payload));
  } catch (error) {
    res.status(400).json({ error: "Sauvegarde invalide : " + error.message });
  }
});

const encryptedUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:128*1024*1024,files:1}});
require('./lib/restoration').mountRestoration(app,{upload:encryptedUpload,encrypted:encryptedBackup,readAnimes,restore:restoreBackupPayload,ready:()=>db.whenReady()});
app.post('/api/backup/encrypted/restore',encryptedUpload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'ALM_BACKUP_FORMAT',code:'ALM_BACKUP_FORMAT'});
  try { const payload=await encryptedBackup.decrypt(req.file.buffer,req.body?.password);res.json(await restoreBackupPayload(payload)); }
  catch(error) { res.status(400).json({error:error.message,code:error.message}); }
});

app.get("/api/export", (req, res) => {
  db.flush();
  res.download(DATA_FILE, "animes.json");
});

async function startServer(port = PORT, attempt = 0) {
  await dbReady;
  const safePort = Math.max(1, Math.min(Number(port) || PORT, 65535));
  try {
    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(safePort, "127.0.0.1");
      const onError = error => {
        instance.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        instance.removeListener("error", onError);
        resolve(instance);
      };
      instance.once("error", onError);
      instance.once("listening", onListening);
    });
    server.almPort = Number(server.address()?.port || safePort);
    console.log(`${rescueMode.active ? 'ALM — prototype de secours' : PRODUCT_RELEASE.publicName} lancé : http://127.0.0.1:${server.almPort}`);
    return server;
  } catch (error) {
    if (error?.code === "EADDRINUSE" && attempt < 20 && safePort < 65535) {
      console.warn(`⚠️  Port ${safePort} déjà utilisé. Tentative sur le port ${safePort + 1}...`);
      return startServer(safePort + 1, attempt + 1);
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// V2 — STATS AVANCÉES
// ═══════════════════════════════════════════════════════════════
app.get("/api/v2/stats", async (req, res) => {
  try {
    const allAnimes = await readAnimesAsync(false);
    const animes = allAnimes.filter(isAnimeFeatureEligible);
    const scored = animes.filter(a => Number(a.score) >= 1);

    const totalEpisodes = animes.reduce((s, a) => s + Number(a.episodesSeen || 0), 0);
    const totalMinutes = totalEpisodes * 23;
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    const genreCount = Object.create(null);
    const genreScoreSum = Object.create(null);
    for (const anime of animes) {
      const w = Number(anime.score) || 0;
      for (const genre of (anime.genres || [])) {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
        genreScoreSum[genre] = (genreScoreSum[genre] || 0) + w;
      }
    }

    const genreAvgScore = {};
    for (const [g, sum] of Object.entries(genreScoreSum)) {
      if (genreCount[g] >= 2) genreAvgScore[g] = Math.round((sum / genreCount[g]) * 10) / 10;
    }

    // Le genre dominant doit refléter la bibliothèque elle-même. Les versions
    // précédentes utilisaient la meilleure moyenne personnelle, ce qui donnait
    // un résultat trompeur (voire arbitraire sans aucune note). La meilleure
    // moyenne reste utilisée séparément par la carte « Zone forte ».
    const favGenre = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))[0]?.[0] || "";

    const scoreDistrib = {};
    for (let i = 1; i <= 10; i++) scoreDistrib[i] = 0;
    for (const a of scored) {
      const s = Math.round(Number(a.score));
      if (s >= 1 && s <= 10) scoreDistrib[s]++;
    }

    const yearCount = {};
    for (const a of animes) {
      const y = (a.startDate || "").substring(0, 4);
      if (y && y.length === 4) yearCount[y] = (yearCount[y] || 0) + 1;
    }
    const favYear = Object.entries(yearCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

    const studioCount = Object.create(null);
    for (const a of animes) {
      if (a.studio) studioCount[a.studio] = (studioCount[a.studio] || 0) + 1;
    }

    const statusBreakdown = {
      Completed: animes.filter(a => a.status === "Completed").length,
      Watching: animes.filter(a => a.status === "Watching").length,
      "Plan to Watch": animes.filter(a => a.status === "Plan to Watch").length,
      Dropped: animes.filter(a => a.status === "Dropped").length,
      "On Hold": animes.filter(a => ["On-Hold", "On Hold"].includes(a.status)).length
    };

    const avgScore = scored.length
      ? Math.round((scored.reduce((s, a) => s + Number(a.score), 0) / scored.length) * 10) / 10
      : 0;

    res.json({
      totalAnimes: animes.length,
      totalEpisodes,
      totalHours,
      totalDays,
      averageScore: avgScore,
      favoriteGenre: favGenre,
      favoriteYear: favYear,
      statusBreakdown,
      genreBreakdown: Object.fromEntries(Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 20)),
      genreAvgScore: Object.fromEntries(Object.entries(genreAvgScore).sort((a, b) => b[1] - a[1]).slice(0, 20)),
      scoreDistribution: scoreDistrib,
      yearBreakdown: Object.fromEntries(Object.entries(yearCount).sort((a, b) => b[0] - a[0])),
      studioBreakdown: Object.fromEntries(Object.entries(studioCount).sort((a, b) => b[1] - a[1]).slice(0, 10))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// V2 — PROFIL DE NOTATION PERSONNEL
// ═══════════════════════════════════════════════════════════════
app.get("/api/v2/profile", async (req, res) => {
  try {
    const allAnimes = await readAnimesAsync(false);
    const animes = allAnimes.filter(isAnimeFeatureEligible);
    const scored = animes.filter(a => Number(a.score) >= 1);
    const patterns = Object.create(null);

    for (const anime of scored) {
      const s = Number(anime.score);
      for (const genre of (anime.genres || [])) {
        if (!patterns[genre]) patterns[genre] = { scores: [], count: 0 };
        patterns[genre].scores.push(s);
        patterns[genre].count++;
      }
    }

    const result = Object.create(null);
    for (const [genre, data] of Object.entries(patterns)) {
      if (data.count >= 2) {
        const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        result[genre] = {
          averageScore: Math.round(avg * 10) / 10,
          count: data.count,
          tendency: avg >= 8 ? "adore" : avg >= 6.5 ? "apprécie" : "neutre"
        };
      }
    }

    const sorted = Object.entries(result).sort((a, b) => b[1].averageScore - a[1].averageScore);
    res.json({
      topGenres: sorted.slice(0, 5).map(([g]) => g),
      patterns: Object.fromEntries(sorted)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// V2 — RECOMMANDATIONS INTELLIGENTES
// ═══════════════════════════════════════════════════════════════
const RECO_CACHE_FILE = path.join(DATA_DIR, "cache", "recommendations-v2.json");

app.get("/api/v2/recommendations", async (req, res) => {
  try {
    // Cache 24h
    try {
      const cached = JSON.parse(fs.readFileSync(RECO_CACHE_FILE, "utf8"));
      const age = (Date.now() - new Date(cached._at || 0).getTime()) / 3600000;
      if (age < 24 && Array.isArray(cached.items) && cached.items.length > 0) {
        return res.json({ ok: true, cached: true, recommendations: cached.items });
      }
    } catch {}

    const animes = (await readAnimesAsync()).filter(isAnimeFeatureEligible);
    const ownedMalIds = new Set(animes.map(a => String(a.malId)).filter(Boolean));

    // Top animes par score (min 7, avec malId)
    const topAnimes = animes
      .filter(a => Number(a.score) >= 7 && a.malId)
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 5);

    if (!topAnimes.length) {
      return res.json({ ok: true, cached: false, recommendations: [], message: "Note au moins 5 animes (score ≥ 7) pour obtenir des recommandations." });
    }

    // Récupérer les recommandations Jikan pour chaque top anime
    const recoMap = new Map();
    await runWithConcurrency(topAnimes, 3, async (anime) => {
      try {
        const r = await jikanLimited(() => fetch(`https://api.jikan.moe/v4/anime/${anime.malId}/recommendations`));
        if (!r.ok) return;
        const json = await r.json();
        for (const rec of (json.data || []).slice(0, 10)) {
          const mid = String(rec.entry?.mal_id || "");
          if (!mid || ownedMalIds.has(mid)) continue;
          const existing = recoMap.get(mid) || { ...rec.entry, votes: 0, recommendedBy: [] };
          existing.votes += (rec.votes || 1);
          existing.recommendedBy.push(anime.title);
          recoMap.set(mid, existing);
        }
      } catch {}
    });

    // Calculer le profil genre de l'utilisateur
    const genreWeight = {};
    for (const anime of animes.filter(a => Number(a.score) >= 7)) {
      const w = Number(anime.score) || 7;
      for (const g of (anime.genres || [])) genreWeight[g] = (genreWeight[g] || 0) + w;
    }

    // Scorer chaque recommandation
    const recommendations = [];
    for (const [malId, entry] of recoMap.entries()) {
      const titleForJikan = entry.title || "";
      let details = null;
      try {
        const r = await jikanLimited(() => fetch(`https://api.jikan.moe/v4/anime/${malId}`));
        if (r.ok) { const j = await r.json(); details = j.data; }
      } catch {}

      const genres = details?.genres?.map(g => g.name) || [];
      let relevance = entry.votes * 3 + (entry.recommendedBy?.length || 0) * 2;
      for (const g of genres) relevance += (genreWeight[g] || 0) / 10;

      recommendations.push({
        malId,
        title: entry.title,
        imageUrl: details?.images?.jpg?.large_image_url || "",
        publicScore: details?.score ? String(details.score) : "",
        synopsis: (details?.synopsis || "").substring(0, 200),
        genres,
        type: details?.type || "",
        relevanceScore: Math.round(relevance),
        reason: `Recommandé car tu as aimé : ${[...new Set(entry.recommendedBy)].slice(0, 2).join(", ")}`
      });
    }

    recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const top20 = recommendations.slice(0, 20);

    try {
      fs.mkdirSync(path.dirname(RECO_CACHE_FILE), { recursive: true });
      fs.writeFileSync(RECO_CACHE_FILE, JSON.stringify({ _at: new Date().toISOString(), items: top20 }), "utf8");
    } catch {}

    res.json({ ok: true, cached: false, recommendations: top20 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// V2 — SUITES MANQUANTES (séquels non possédés)
// ═══════════════════════════════════════════════════════════════
app.get("/api/v2/missing-sequels", async (req, res) => {
  try {
    const animes = await readAnimesAsync();
    const ownedMalIds = new Set(animes.map(a => String(a.malId)).filter(Boolean));
    const ownedTitles = new Set(animes.map(a => normalizeTitle(a.title)));
    const withMalId = animes.filter(a => a.malId && Array.isArray(a.relations) && a.relations.length > 0);
    const missing = [];

    for (const anime of withMalId) {
      const sequels = (anime.relations || []).filter(r =>
        ["Sequel", "Side story", "Alternative version"].includes(r.relation) && r.type === "anime"
      );
      const notOwned = sequels.filter(s =>
        !ownedMalIds.has(String(s.mal_id || s.malId || "")) &&
        !ownedTitles.has(normalizeTitle(s.title || ""))
      );
      if (notOwned.length > 0) {
        missing.push({
          anime: { title: anime.title, malId: anime.malId, poster: anime.poster, score: anime.score },
          sequels: notOwned.map(s => ({ title: s.title, malId: s.mal_id || s.malId, type: s.type, relation: s.relation }))
        });
      }
    }

    res.json({ ok: true, count: missing.length, missing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// V2 — ACTUALITÉS ANIME (RSS)
// ═══════════════════════════════════════════════════════════════
const NEWS_V2_CACHE_FILE = path.join(DATA_DIR, "cache", "news-v2-rss.json");
const NEWS_V2_TTL = 45; // minutes
const NEWS_HISTORY_DEFAULT_DAYS = 365;
const NEWS_HISTORY_STANDARD_MAX_DAYS = 730;
const NEWS_HISTORY_ALLOWED_DAYS = new Set([0, 7, 30, 90, 180, 365, 730]);
const NEWS_QUERY_MAX_ITEMS = 1000;

function normalizeNewsRetentionDays(value, fallback = NEWS_HISTORY_DEFAULT_DAYS) {
  const days = Number(value);
  if (NEWS_HISTORY_ALLOWED_DAYS.has(days)) return days;
  const fallbackDays = Number(fallback);
  return NEWS_HISTORY_ALLOWED_DAYS.has(fallbackDays) ? fallbackDays : NEWS_HISTORY_DEFAULT_DAYS;
}

function getNewsRetentionDays() {
  return normalizeNewsRetentionDays(readConfig().newsHistoryRetentionDays, NEWS_HISTORY_DEFAULT_DAYS);
}

function validNewsDateInput(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const time = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toISOString().slice(0, 10) === text ? text : "";
}

const RSS_SOURCES = [
  // Français
  { name: "Crunchyroll News FR", url: "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/fr-FR/rss", lang: "fr" },
  { name: "Adala News",         url: "https://adala-news.fr/feed",                          lang: "fr" },
  { name: "AnimeLand",          url: "https://www.animeland.fr/feed",                       lang: "fr" },
  { name: "GNN 動畫漫畫（繁體中文）", url: "https://gnn.gamer.com.tw/rss_utf8.xml", lang: "zh-CN", animeOnly: true },
  // English
  { name: "MyAnimeList News",   url: "https://myanimelist.net/rss/news.xml",                lang: "en" },
  { name: "Anime News Network", url: "https://www.animenewsnetwork.com/all/rss.xml",        lang: "en" },
  // 日本語 — flux éditeurs directs (pas de vignette générique Google News)
  { name: "Anime!Anime!",        url: "https://animeanime.jp/rss/index.rdf",                    lang: "ja" },
  { name: "Comic Natalie",       url: "https://natalie.mu/comic/feed/news",                       lang: "ja" },
  { name: "TV Tokyo Anime",      url: "https://www.tv-tokyo.co.jp/contents/anime/topics/index.xml", lang: "ja" },
  // Español — Crunchyroll News localisé
  { name: "Crunchyroll Noticias", url: "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/es-ES/rss", lang: "es" },
  { name: "Ramen Para Dos",      url: "https://ramenparados.com/feed",                              lang: "es" },
  // Deutsch — deux flux directs spécialisés
  { name: "AnimeNachrichten",    url: "https://www.animenachrichten.de/feed",                  lang: "de" },
  { name: "Anime2You",           url: "https://www.anime2you.de/news/feed/",                    lang: "de" },
  { name: "Crunchyroll News DE", url: "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/de-DE/rss", lang: "de" },
  // Português (Brasil) — Crunchyroll News localisé
  { name: "Crunchyroll Notícias BR", url: "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/pt-BR/rss", lang: "pt-BR" },
  { name: "JBox",                    url: "https://www.jbox.com.br/feed/",                              lang: "pt-BR" },
];

const serviceHealth=require('./lib/service-health').mountServiceHealth(app, {rssSources: RSS_SOURCES, getBetaSeriesKey: getBetaSeriesApiKey, getMalClientId: () => readConfig().malClientId || process.env.ALM_MAL_CLIENT_ID || "", validate: assertPublicNewsUrl});

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return " "; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; }
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…");
}

function htmlStrip(text) {
  return decodeHtmlEntities(text)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rssTag(block, tag) {
  const safeTag = String(tag || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cdata = new RegExp(`<${safeTag}\\b[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${safeTag}>`, "i");
  const normal = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, "i");
  const selfAttr = new RegExp(`<${safeTag}\\b[^>]*(?:href|url)=["']([^"']+)["'][^>]*\\/?>`, "i");
  const match = block.match(cdata) || block.match(normal) || block.match(selfAttr);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function rssAttribute(tag, name) {
  const safeName = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(new RegExp(`\\b${safeName}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"));
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? "").trim();
}

function rssResourceLooksLikeImage(url, type = "", medium = "", assumeImage = false) {
  const value = decodeHtmlEntities(String(url || "")).trim();
  if (!value) return false;
  if (/^image\//i.test(String(type || "").trim()) || /^image$/i.test(String(medium || "").trim())) return true;
  if (/\.(?:jpe?g|png|webp|avif|gif)(?:$|[?#])/i.test(value)) return true;
  return assumeImage && !/^(?:audio|video)\//i.test(String(type || "").trim());
}

function rssImage(block, description = "", baseUrl = "") {
  const text = String(block || "") + "\n" + String(description || "");

  // Les balises media/enclosure peuvent aussi pointer vers un podcast ou une
  // vidéo. Ne jamais prendre ces URLs pour des vignettes sans signal d'image.
  for (const tag of text.match(/<media:thumbnail\b[^>]*>/gi) || []) {
    const url = rssAttribute(tag, "url");
    if (rssResourceLooksLikeImage(url, rssAttribute(tag, "type"), rssAttribute(tag, "medium"), true)) return url;
  }
  for (const tag of text.match(/<media:content\b[^>]*>/gi) || []) {
    const url = rssAttribute(tag, "url");
    if (rssResourceLooksLikeImage(url, rssAttribute(tag, "type"), rssAttribute(tag, "medium"), false)) return url;
  }
  for (const tag of text.match(/<enclosure\b[^>]*>/gi) || []) {
    const url = rssAttribute(tag, "url");
    if (rssResourceLooksLikeImage(url, rssAttribute(tag, "type"), "", false)) return url;
  }

  const patterns = [
    /<(?:img|amp-img)[^>]+(?:data-lazy-src|data-src|data-original|src)=["']([^"']+)["']/i,
    /<(?:img|source)[^>]+(?:data-srcset|srcset)=["']([^"']+)["']/i,
    /url=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["']/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const raw = pattern.source.includes("srcset") ? largestSrcsetCandidate(match[1]) : match[1];
    if (raw) return decodeHtmlEntities(raw).trim();
  }
  return extractBestArticleImage(String(description || ""), baseUrl);
}

function absoluteNewsImageUrl(src, baseUrl = "") {
  let value = decodeHtmlEntities(String(src || "").trim());
  if (!value) return "";
  if (value.startsWith("//")) value = "https:" + value;
  if (/^https?:\/\//i.test(value)) return value;
  try { return new URL(value, baseUrl || undefined).toString(); } catch { return ""; }
}

function canonicalNewsUrl(value) {
  const raw = decodeHtmlEntities(String(value || "").trim());
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) parsed.port = "";
    const tracking = [
      "fbclid", "gclid", "dclid", "mc_cid", "mc_eid", "ref", "ref_src", "source",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"
    ];
    for (const key of [...parsed.searchParams.keys()]) {
      if (tracking.includes(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
    }
    if (typeof parsed.searchParams.sort === "function") parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return "";
  }
}

const NEWS_MONTHS_FR = Object.freeze({
  janvier: 0, janv: 0, fevrier: 1, "février": 1, fevr: 1, "févr": 1,
  mars: 2, avril: 3, avr: 3, mai: 4, juin: 5, juillet: 6, juil: 6,
  aout: 7, "août": 7, septembre: 8, sept: 8, octobre: 9, oct: 9,
  novembre: 10, nov: 10, decembre: 11, "décembre": 11, dec: 11, "déc": 11
});

function parseNewsPublishedDate(value) {
  let text = decodeHtmlEntities(String(value || "")).replace(/\s+/g, " ").trim();
  if (!text) return { iso: "", status: "missing" };

  let time = Number.NaN;
  const numeric = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})(?:\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?/);
  if (numeric) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = numeric;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)) time = date.getTime();
  }

  if (!Number.isFinite(time)) time = Date.parse(text);

  if (!Number.isFinite(time)) {
    const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const named = normalized.match(/\b(\d{1,2})\s+([a-z]+)\s+((?:19|20)\d{2})(?:\s+(\d{1,2})(?::(\d{2}))?)?/);
    if (named) {
      const [, day, monthName, year, hour = "0", minute = "0"] = named;
      const month = NEWS_MONTHS_FR[monthName];
      if (month != null) {
        const date = new Date(Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute), 0));
        if (date.getUTCFullYear() === Number(year) && date.getUTCMonth() === month && date.getUTCDate() === Number(day)) time = date.getTime();
      }
    }
  }

  if (!Number.isFinite(time)) return { iso: "", status: "invalid" };
  const now = Date.now();
  const min = Date.UTC(1990, 0, 1);
  const max = now + 3 * 24 * 60 * 60 * 1000;
  if (time < min || time > max) return { iso: "", status: "out-of-range" };
  return { iso: new Date(time).toISOString(), status: "valid" };
}

function buildNewsHistoryKey(item) {
  const canonicalUrl = canonicalNewsUrl(item?.articleUrl || "");
  const seed = canonicalUrl || [
    String(item?.source || "").trim().toLowerCase(),
    normalizeAdvancedTitle(item?.title || ""),
    String(item?.date || item?.publishedAt || "").slice(0, 10)
  ].join("|");
  return crypto.createHash("sha256").update(seed || JSON.stringify(item || {})).digest("hex");
}

function normalizeNewsLanguageCode(value) {
  const raw = String(value || "").trim();
  const low = raw.toLowerCase();
  if (low === "pt" || low === "pt-br") return "pt-BR";
  if (/^zh(?:-|$)/i.test(low)) return "zh-CN";
  return ["fr", "en", "ja", "es", "de"].includes(low) ? low : "";
}

function normalizeNewsHistoryItem(item, defaults = {}) {
  if (!item || !String(item.title || "").trim()) return null;
  const parsedDate = parseNewsPublishedDate(item.publishedAt || item.date);
  const articleUrl = canonicalNewsUrl(item.articleUrl || item.url || "") || String(item.articleUrl || item.url || "").trim();
  const normalized = {
    ...item,
    id: String(item.id || "").trim(),
    title: htmlStrip(item.title).slice(0, 500),
    summary: htmlStrip(item.summary || "").slice(0, 6000),
    articleUrl,
    imageUrl: absoluteNewsImageUrl(item.imageUrl || "", articleUrl),
    date: parsedDate.iso,
    publishedAt: parsedDate.iso,
    dateStatus: parsedDate.iso ? "valid" : String(item.dateStatus || parsedDate.status || "unknown"),
    discoveredAt: item.discoveredAt || defaults.discoveredAt || new Date().toISOString(),
    source: String(item.source || defaults.source || "").trim(),
    lang: normalizeNewsLanguageCode(item.lang || defaults.lang),
    category: String(item.category || defaults.category || "divers").trim() || "divers"
  };
  normalized.newsKey = String(item.newsKey || "").trim() || buildNewsHistoryKey(normalized);
  if (!normalized.id) normalized.id = normalized.newsKey;
  return normalized;
}

function extractArticleImage(html, baseUrl = "") {
  return extractBestArticleImage(html, baseUrl);
}

const NEWS_IMAGE_POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEWS_IMAGE_NEGATIVE_TTL_MS = 60 * 1000;
const _newsArticleImageCache = new Map();
const _newsArticleImagePending=new Map();

async function fetchNewsArticleImage(articleUrl,options={}){const key=String(articleUrl)+'|'+String(options.exclude||'');if(_newsArticleImagePending.has(key))return _newsArticleImagePending.get(key);const task=fetchNewsArticleImageOnce(articleUrl,options).finally(()=>_newsArticleImagePending.delete(key));_newsArticleImagePending.set(key,task);return task;}
async function fetchNewsArticleImageOnce(articleUrl, options = {}) {
  const url = String(articleUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  const now = Date.now();
  const cacheKey = url + (options.exclude ? "|" + options.exclude : "");
  const cached = _newsArticleImageCache.get(cacheKey);
  if (!options.force && cached && Number(cached.expiresAt || 0) > now) return cached.imageUrl || "";

  let finalUrl = "";
  try {
    const fetched = await fetchPublicNewsUrl(url, {
      timeoutMs: Number(options.timeoutMs || 25000),
      headers: {
        "User-Agent": `AnimeLocalManager/${PRODUCT_RELEASE.technicalVersion} RSS Image Fetcher`,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.5"
      }
    });
    const response = fetched.response;
    if (response.ok) {
      const length = Number(response.headers.get("content-length") || 0);
      if (length > 8 * 1024 * 1024) throw new Error("Page trop volumineuse");
      const html = fetched.text;
      finalUrl = extractBestArticleImage(html,fetched.finalUrl||url,{exclude:options.exclude?[options.exclude]:[]});
    }
  } catch {}

  _newsArticleImageCache.set(cacheKey, {
    imageUrl: finalUrl,
    checkedAt: now,
    expiresAt: now + (finalUrl ? NEWS_IMAGE_POSITIVE_TTL_MS : NEWS_IMAGE_NEGATIVE_TTL_MS)
  });
  return finalUrl;
}

function persistResolvedNewsImages(resolvedItems) {
  const items = (Array.isArray(resolvedItems) ? resolvedItems : [])
    .map(raw => {
      const normalized = normalizeNewsHistoryItem(raw);
      if (!normalized) return null;
      normalized.originalArticleUrl = String(raw?.originalArticleUrl || raw?.articleUrl || "").trim();
      return normalized;
    })
    .filter(item => item?.imageUrl && item?.articleUrl);
  if (!items.length) return { ok: true, processed: 0, updated: 0, inserted: 0 };

  let batchResult = { ok: true, processed: items.length, updated: 0, unmatchedKeys: items.map(item => item.newsKey) };
  try {
    if (db.updateNewsImagesByArticleUrl) {
      batchResult = db.updateNewsImagesByArticleUrl(items.map(item => ({
        key: item.newsKey,
        articleUrls: [item.originalArticleUrl, item.articleUrl, canonicalNewsUrl(item.articleUrl)],
        imageUrl: item.imageUrl
      })));
    }
  } catch (error) {
    batchResult = { ok: false, processed: items.length, updated: 0, unmatchedKeys: items.map(item => item.newsKey), error: error.message };
  }

  // Une URL peut changer après une redirection ou une source peut n'avoir été
  // conservée que dans le cache JSON. Dans ce cas seulement, on fait un upsert
  // avec la newsKey originale pour ne jamais créer une seconde actualité.
  const unmatched = new Set(Array.isArray(batchResult.unmatchedKeys) ? batchResult.unmatchedKeys : []);
  const toUpsert = items.filter(item => item.newsKey && unmatched.has(item.newsKey));
  let upsertResult = { ok: true, processed: 0, inserted: 0, updated: 0 };
  if (toUpsert.length && db.upsertNewsItems) {
    try { upsertResult = db.upsertNewsItems(toUpsert); }
    catch (error) { upsertResult = { ok: false, processed: 0, inserted: 0, updated: 0, error: error.message }; }
  }

  const byUrl = new Map();
  for (const item of items) {
    for (const url of [item.originalArticleUrl, item.articleUrl, canonicalNewsUrl(item.articleUrl)]) {
      if (url) byUrl.set(canonicalNewsUrl(url) || url, item.imageUrl);
    }
  }
  const state = readNewsV2RefreshState();
  if (Array.isArray(state.items)) {
    let changed = false;
    state.items = state.items.map(item => {
      const key = canonicalNewsUrl(item.articleUrl) || item.articleUrl;
      const imageUrl = byUrl.get(key);
      if (!imageUrl || item.imageUrl === imageUrl) return item;
      changed = true;
      return { ...item, imageUrl };
    });
    if (changed) writeNewsV2RefreshState(state);
  }

  return {
    ok: batchResult.ok !== false && upsertResult.ok !== false,
    processed: items.length,
    updated: Number(batchResult.updated || 0) + Number(upsertResult.updated || 0),
    inserted: Number(upsertResult.inserted || 0),
    error: [batchResult.error, upsertResult.error].filter(Boolean).join(" ; ")
  };
}

async function enrichNewsImages(items, limit = 36) {
  const targets = items.filter(item => !item.imageUrl && item.articleUrl).slice(0, limit);
  await runWithConcurrency(targets, 4, async item => {
    const img = await fetchNewsArticleImage(item.articleUrl);
    if (img) item.imageUrl = img;
  });
  return items;
}

function parseRssItems(xml) {
  const items = [];
  const source = String(xml || "");
  const blocks = [
    ...source.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...source.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)
  ];
  for (const [, block] of blocks) {
    const rawTitle = rssTag(block, "title");
    const rawDescription = rssTag(block, "description") || rssTag(block, "content:encoded") || rssTag(block, "summary");
    const cleanTitle = htmlStrip(rawTitle).slice(0, 220);
    const cleanSum = htmlStrip(rawDescription).slice(0, 420);
    if (!cleanTitle) continue;

    const articleUrl = rssTag(block, "link") || rssTag(block, "guid");
    items.push({
      title: cleanTitle,
      summary: cleanSum,
      articleUrl,
      date: rssTag(block, "pubDate") || rssTag(block, "dc:date") || rssTag(block, "published") || rssTag(block, "updated"),
      imageUrl: rssImage(decodeHtmlEntities(block), rssTag(block, "content:encoded") || rssTag(block, "content") || rawDescription, articleUrl)
    });
  }
  return items;
}


function mapJikanNewsAnime(raw, source, category) {
  const title = raw?.title_english || raw?.title || raw?.title_japanese || "";
  if (!title) return null;
  const parsedDate = parseNewsPublishedDate(raw?.aired?.from || "");
  const type = raw?.type ? ` • ${raw.type}` : "";
  const episodes = raw?.episodes ? ` • ${raw.episodes} épisode(s)` : "";
  return {
    id: `${source}-${raw?.mal_id || title}`.replace(/\s+/g, "-").slice(0, 90),
    title,
    summary: String(raw?.synopsis || `${title}${type}${episodes}`).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 420),
    articleUrl: raw?.url || (raw?.mal_id ? `https://myanimelist.net/anime/${raw.mal_id}` : ""),
    imageUrl: raw?.images?.jpg?.large_image_url || raw?.images?.jpg?.image_url || raw?.images?.webp?.large_image_url || raw?.images?.webp?.image_url || "",
    date: parsedDate.iso,
    dateStatus: parsedDate.status,
    source,
    lang: "en",
    category
  };
}

async function buildJikanNewsFallback() {
  const items = [];
  const sources = [
    { url: "https://api.jikan.moe/v4/seasons/upcoming?limit=25", source: "Jikan saisons à venir", category: "nouveaux" },
    { url: "https://api.jikan.moe/v4/seasons/now?limit=25",      source: "Jikan saison actuelle", category: "saisons" }
  ];

  for (const src of sources) {
    try {
      const json = await fetchJikanJson(src.url, { attempts: 3, timeoutMs: 12000 });
      for (const raw of (json?.data || []).slice(0, 25)) {
        const item = mapJikanNewsAnime(raw, src.source, src.category);
        if (item) items.push(item);
      }
    } catch (error) {
      console.warn("[RSS fallback]", src.source, error.message);
    }
    await sleep(420);
  }

  return items;
}

function metadataItemToNews(item) {
  if (!item?.title) return null;
  const parsedDate = parseNewsPublishedDate(item.startDate || "");
  const type = item.type ? ` • ${item.type}` : "";
  const episodes = item.episodes ? ` • ${item.episodes} épisode(s)` : "";
  const titleText = `${item.titleEn || item.title || item.titleRomaji}`;
  const categoryText = normalizeAdvancedTitle(titleText + " " + (item.synopsis || ""));
  const category = /season|saison|2nd|3rd|4th|5th|sequel|part\s*[2-9]|cour\s*[2-9]/.test(categoryText) ? "saisons" : "nouveaux";
  return {
    id: `metadata-${item.malId || titleText}`.replace(/\s+/g, "-").slice(0, 90),
    title: titleText,
    summary: htmlStrip(item.synopsis || `${titleText}${type}${episodes}`).slice(0, 420),
    articleUrl: item.malId ? `https://myanimelist.net/anime/${item.malId}` : "",
    imageUrl: item.imageUrl || "",
    date: parsedDate.iso,
    dateStatus: parsedDate.status,
    source: "Metadata locale",
    lang: "fr",
    category
  };
}

function buildLocalMetadataNewsFallback(limit = 60) {
  try {
    if (!db?.listMetadataForNews) return [];
    return db.listMetadataForNews(limit).map(metadataItemToNews).filter(Boolean);
  } catch (error) {
    console.warn("[RSS fallback] metadata locale", error.message);
    return [];
  }
}

function detectCategory(item) {
  const text = normalizeAdvancedTitle((item.title || "") + " " + (item.summary || ""));
  if (/\b(saison|season|temporada|staffel)\s*\d|\bcour\s*\d|\bpart\s*[2-9]|\bpartie\s*\d|\bsuite\b|\bsequel\b|\bnew season\b|nueva temporada|neue staffel|nova temporada|新シーズン|続編/.test(text)) return "saisons";
  if (/\bfilm\b|\bmovie\b|pelicula|filme|long metrage|long-metrage|映画/.test(text)) return "films";
  if (/simulcast|crunchyroll|adn\b|wakanim|netflix|disney\+|prime video|licence|edition francaise|en france|vf\b|vostfr|sortie france|diffus.*france/.test(text)) return "licences-fr";
  if (/\bjeu\b|video game|videospiel|videojuego|jogo|nintendo|playstation|\bxbox\b|mobile game|\bgacha\b|ゲーム/.test(text)) return "jeux";
  if (/\bmanga\b|manga|light novel|roman graphique|\bbd\b|comic|マンガ|漫画/.test(text)) return "manga";
  if (/annonc|nouveau|nouvelle serie|new anime|upcoming|debut|premier|teaser|trailer|visuel|visual|revele|revealed|anuncia|nuevo anime|neuer anime|angekundigt|novo anime|anunciado|新作|発表|公開/.test(text)) return "nouveaux";
  return "divers";
}



const NEWS_ARTICLE_CACHE_FILE = path.join(DATA_DIR, "cache", "news-article-cache.json");
const NEWS_ARTICLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isPrivateNewsIp(address) {
  return !!net.isIP(String(address||'').replace(/^\[|\]$/g,'')) && !require('./lib/public-network').publicIp(String(address).replace(/^\[|\]$/g,''));
}

function isBlockedNewsArticleHost(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  return !host
    || host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || isPrivateNewsIp(host);
}

async function assertPublicNewsUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || "").trim());
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Protocole de source non autorisé.");
  if (parsed.username || parsed.password || parsed.port && !["80","443"].includes(parsed.port)) throw new Error("Identifiants ou port URL non autorisés.");
  if (isBlockedNewsArticleHost(parsed.hostname)) throw new Error("Source article non autorisée.");
  if (!net.isIP(parsed.hostname)) {
    const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(entry => isPrivateNewsIp(entry.address))) throw new Error("Adresse réseau privée non autorisée.");
  }
  return parsed;
}

const fetchNewsDocumentOnce = singleFlight((url,options) => boundedTextFetch(url,{...options,validate:assertPublicNewsUrl,fetchImpl:require("./lib/public-fetch").publicFetch}));
async function fetchPublicNewsUrl(rawUrl, options = {}, maxRedirects = 4) {
  return fetchNewsDocumentOnce(String(rawUrl||"").trim(), {...options, maxRedirects});
}

function extractReadableArticleText(html) {
  let text = String(html || "");
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");

  const article = text.match(/<article\b[\s\S]*?<\/article>/i)
    || text.match(/<main\b[\s\S]*?<\/main>/i)
    || text.match(/<body\b[\s\S]*?<\/body>/i);
  text = article ? article[0] : text;
  text = text
    .replace(/<(nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "\n");

  text = htmlStrip(text)
    .replace(/\s*([.!?])\s+/g, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const lines = text.split(/\n+/).map(x => x.trim()).filter(line => {
    if (line.length < 24) return false;
    if (/^(cookies?|privacy|newsletter|publicit|advertisement|copyright|mentions legales|se connecter|login|partager|share|suivez-nous|follow us)/i.test(line)) return false;
    if (/^(?:cr[ée]dit|source|photo|image|illustration)\s*[:：]/i.test(line) && line.length < 180) return false;
    if (/^(?:facebook|x\s*\/\s*twitter|instagram|youtube|tiktok)\b/i.test(line)) return false;
    return true;
  });
  const compact = lines.join("\n\n").trim();
  return (compact || text).slice(0, 9000).trim();
}

let _newsLegacyHistoryImported = false;

function readNewsV2RefreshState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(NEWS_V2_CACHE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeNewsV2RefreshState(state) {
  try {
    fs.mkdirSync(path.dirname(NEWS_V2_CACHE_FILE), { recursive: true });
    fs.writeFileSync(NEWS_V2_CACHE_FILE, JSON.stringify(state || {}, null, 2), "utf8");
  } catch (error) {
    console.warn("[RSS] Écriture état cache impossible :", error.message);
  }
}

function mergeNewsHistoryItem(base, incoming) {
  if (!base) return incoming;
  if (!incoming) return base;
  const merged = { ...base };
  for (const field of ["title", "articleUrl", "source", "lang", "category", "date", "publishedAt", "dateStatus", "discoveredAt"]) {
    if (!merged[field] && incoming[field]) merged[field] = incoming[field];
  }
  if (String(incoming.summary || "").length > String(merged.summary || "").length) merged.summary = incoming.summary;
  if (!merged.imageUrl && incoming.imageUrl) merged.imageUrl = incoming.imageUrl;
  merged.newsKey = merged.newsKey || incoming.newsKey;
  merged.id = merged.id || incoming.id;
  return merged;
}

function dedupeNewsHistoryItems(items) {
  const byKey = new Map();
  for (const raw of (Array.isArray(items) ? items : [])) {
    const item = normalizeNewsHistoryItem(raw);
    if (!item) continue;
    byKey.set(item.newsKey, mergeNewsHistoryItem(byKey.get(item.newsKey), item));
  }
  return [...byKey.values()].sort((a, b) => {
    const ta = Date.parse(a.date || a.discoveredAt || "") || 0;
    const tb = Date.parse(b.date || b.discoveredAt || "") || 0;
    return tb - ta || String(a.title || "").localeCompare(String(b.title || ""), "fr", { sensitivity: "base" });
  });
}

async function importLegacyNewsCacheOnce() {
  if (_newsLegacyHistoryImported) return;
  _newsLegacyHistoryImported = true;
  try {
    await db.whenReady();
    if (!db.upsertNewsItems) return;
    const state = readNewsV2RefreshState();
    const items = dedupeNewsHistoryItems(state.items || []);
    if (items.length) {
      const result = db.upsertNewsItems(items);
      if (result.ok && result.inserted) console.log(`[news] Migration ancien cache : ${result.inserted} actualité(s) ajoutée(s) à SQLite.`);
    }
  } catch (error) {
    console.warn("[news] Migration ancien cache ignorée :", error.message);
  }
}

function filterNewsItemsInMemory(items, options = {}) {
  const lang = normalizeNewsLanguageCode(options.lang) || "all";
  const category = String(options.category || "all").toLowerCase();
  const from = validNewsDateInput(options.from);
  const to = validNewsDateInput(options.to);
  return dedupeNewsHistoryItems(items).filter(item => {
    if (lang !== "all" && item.lang !== lang) return false;
    if (category === "france") {
      if (item.lang !== "fr" && item.category !== "licences-fr") return false;
    } else if (category !== "all" && item.category !== category) return false;
    if (from || to) {
      if (!item.date) return false;
      const day = item.date.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
    }
    return true;
  });
}

async function collectLatestNewsBatch(options = {}) {
  const allItems = [];
  const sourceStats = [];

  await Promise.allSettled([...RSS_SOURCES].sort((a,b)=>Number(b.lang===options.preferredLang)-Number(a.lang===options.preferredLang)).map(async src => {
    const sourceItems = [];
    const startedAt = Date.now();
    try {
      const fetched = await boundedTextFetch(src.url, {
        timeoutMs: 25000, maxBytes: 5 * 1024 * 1024, validate: assertPublicNewsUrl, fetchImpl: require("./lib/public-fetch").publicFetch,
        headers: {
          "User-Agent": `AnimeLocalManager/${PRODUCT_RELEASE.technicalVersion} RSS Reader (+https://github.com/Gentil-Robot/Anime-Local-Manager)`,
          "Accept": "application/rss+xml, application/xml, text/xml, */*;q=0.5",
          "Cache-Control": "no-cache"
        }
      });
      const response = fetched.response;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = fetched.text;
      const parsedItems = parseRssItems(xml);
      let accepted = 0;
      let invalidDates = 0;

      for (const parsed of parsedItems) {
        if (!parsed.title) continue;
        if (src.animeOnly && !/動畫|漫畫|声優|聲優/.test(parsed.title + " " + parsed.summary)) continue;
        const lang = normalizeNewsLanguageCode(src.lang);
        const dateInfo = parseNewsPublishedDate(parsed.date);
        if (!dateInfo.iso) invalidDates++;
        const item = normalizeNewsHistoryItem({
          id: `${src.name}-${parsed.articleUrl || parsed.title}`.replace(/\s+/g, "-").slice(0, 180),
          title: parsed.title,
          summary: parsed.summary,
          articleUrl: parsed.articleUrl,
          imageUrl: parsed.imageUrl,
          date: dateInfo.iso,
          dateStatus: dateInfo.status,
          source: src.name,
          lang,
          category: detectCategory(parsed)
        });
        if (item) {
          allItems.push(item);
          sourceItems.push(item);
          accepted++;
        }
      }
      sourceStats.push({ source: src.name, lang: src.lang, elapsedMs: Date.now() - startedAt, ok: accepted > 0, received: parsedItems.length, accepted, invalidDates });
    } catch (error) {
      sourceStats.push({ source: src.name, lang: src.lang, elapsedMs: Date.now() - startedAt, ok: false, error: error.message });
      console.warn("[RSS]", src.name, error.message);
    } finally {
      options.onSource?.({ items: sourceItems });
    }
  }));

  let unique = dedupeNewsHistoryItems(allItems).slice(0, 500);
  let fallback = "";

  if (!unique.length && options.allowFallback !== false && !options.skipNetworkFallback) {
    const jikan = dedupeNewsHistoryItems(await buildJikanNewsFallback());
    if (jikan.length) {
      unique = jikan;
      fallback = "jikan";
    }
  }

  // Return titles first. The existing /api/v2/news/images endpoint hydrates visible cards independently.
  unique = dedupeNewsHistoryItems(unique);

  return {
    items: unique,
    sourceStats,
    fallback,
    successfulSources: sourceStats.filter(x => x.ok).length,
    failedSources: sourceStats.filter(x => !x.ok).length,
    invalidDates: sourceStats.reduce((sum, x) => sum + Number(x.invalidDates || 0), 0)
  };
}

function newsHistoryResponseMeta(options = {}) {
  const stats = db.getNewsHistoryStats ? db.getNewsHistoryStats(options) : { total: 0, dated: 0, undated: 0, availableFrom: "", availableTo: "" };
  return {
    ...stats,
    retentionDays: getNewsRetentionDays(),
    standardMaximumDays: NEWS_HISTORY_STANDARD_MAX_DAYS,
    unlimitedHistory: getNewsRetentionDays() === 0
  };
}

app.get("/api/v2/news/settings", async (req, res) => {
  try {
    await db.whenReady();
    await importLegacyNewsCacheOnce();
    res.json({ ok: true, ...newsHistoryResponseMeta() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/v2/news/settings", async (req, res) => {
  try {
    const incoming = Number(req.body?.retentionDays);
    if (!NEWS_HISTORY_ALLOWED_DAYS.has(incoming)) {
      return res.status(400).json({ error: "Durée invalide. Choix autorisés : 7, 30, 90, 180, 365, 730 jours ou 0 pour tout conserver." });
    }
    const config = readConfig();
    config.newsHistoryRetentionDays = incoming;
    writeConfig(config);
    await db.whenReady();
    await importLegacyNewsCacheOnce();
    const prune = db.pruneNewsHistory ? db.pruneNewsHistory(incoming) : { ok: false, deleted: 0 };
    if (prune.ok === false) throw Error('ALM_NEWS_PRUNE_FAILED');
    res.json({ ok: true, prune, ...newsHistoryResponseMeta() });
  } catch (error) {
    res.status(500).json({ error: "Impossible d'enregistrer la durée d'historique : " + error.message });
  }
});

const newsRefresh = require("./lib/news-refresh").createNewsRefresh({
  totalSources: RSS_SOURCES.length,
  collect: collectLatestNewsBatch,
  publish: items => db.upsertNewsItems?.(items, { save: false, strict: true }),
  finish: batch => {
      const state = readNewsV2RefreshState();
      const retentionDays = getNewsRetentionDays();
      const upsert = batch.items.length && db.upsertNewsItems
        ? db.upsertNewsItems(batch.items, { save: false, strict: true })
        : { ok: true, processed: 0, inserted: 0, updated: 0, total: (db.getNewsHistoryCount?.() || 0) };
      if (upsert.ok === false) throw Error('ALM_NEWS_WRITE_FAILED');
      // Une seule persistance disque après ajout + purge. Cela évite aussi de conserver
      // jusqu'au prochain cycle une actualité déjà plus vieille que la durée choisie.
      const prune = db.pruneNewsHistory
        ? db.pruneNewsHistory(retentionDays, { save: true })
        : { ok: false, deleted: 0 };
      if (prune.ok === false) throw Error('ALM_NEWS_PRUNE_FAILED');
      const now = new Date().toISOString();
      const stateItems = batch.items.length ? batch.items : (Array.isArray(state.items) ? state.items : []);
      writeNewsV2RefreshState({
        _at: now,
        _successAt: batch.items.length ? now : (state._successAt || ""),
        items: stateItems.slice(0, 500),
        stats: {
          sourceStats: batch.sourceStats,
          fallback: batch.fallback,
          successfulSources: batch.successfulSources,
          failedSources: batch.failedSources,
          invalidDates: batch.invalidDates,
          upsert,
          prune
        }
      });
      return {
        attempted: true,
        cached: false,
        refreshedAt: now,
        fallback: batch.fallback || "",
        successfulSources: batch.successfulSources,
        failedSources: batch.failedSources,
        invalidDates: batch.invalidDates,
        upsert,
        prune
      };
  },
  onError: error => console.warn("[RSS refresh]", error.message)
});

const maintenance=require('./lib/maintenance').createMaintenance({directory:DATA_DIR,network:()=>require('./lib/os-maintenance').networkStatus(),handlers:{
 news:async()=>{await db.whenReady();const r=await newsRefresh.start({allowFallback:false,skipNetworkFallback:true,preferredLang:readConfig().language||'fr'});return r.successfulSources>0?{ok:true}:{ok:false,error:r.error||'ALM_MAINTENANCE_RSS'};},
 seasons:async()=>{await db.whenReady();if(!readAnimes().length)return {ok:true,skipped:true,reason:'empty-library'};const active=_seasonScanJobs[_activeSeasonScanJobId];if(active&&!['done','error','cancelled'].includes(active.status))return {ok:true,skipped:true,reason:'already-running'};const previousResults=readNewsResults(),previousState=readSeasonScanState();const job=newSeasonScanJob(true);_seasonScanJobs[job.jobId]=job;_activeSeasonScanJobId=job.jobId;try{const r=await executeSeasonScan(job);if(job.status==='error'||job.status==='cancelled'||job.failed>0){writeNewsResults(previousResults);writeSeasonScanState(previousState);return {ok:false,error:'ALM_MAINTENANCE_SEASONS'};}return r;}finally{if(_activeSeasonScanJobId===job.jobId)_activeSeasonScanJobId='';}},
 catalog:async()=>{await db.whenReady();if(metadataAutonomousJob)return {ok:true,skipped:true,reason:'already-running'};const remote=isMetadataRemoteConfigured()?await almMetadataRemoteSync({startup:true,force:true}):null;if(remote?.ok&&!remote.skipped)return remote;return runMetadataAutonomousUpdate({force:true,wait:true});},
 application:async({settings})=>maintenanceUpdate(settings)
}});
if(!rescueMode.active&&process.env.ALM_RELEASE_SMOKE!=='1'&&process.env.ALM_MAINTENANCE_MODE!=='1')maintenance.start();
app.get('/api/maintenance/status',(_req,res)=>res.json(maintenance.state()));
app.post('/api/maintenance/run',(_req,res)=>{maintenance.run({force:true}).catch(error=>console.warn('[maintenance]',error.message));res.status(202).json({ok:true});});
app.put('/api/maintenance/settings',(req,res)=>{try{res.json(maintenance.configure(req.body||{}));}catch(error){res.status(409).json({error:error.message});}});


app.get("/api/v2/news", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const quickLoad = req.query.quick === "1";
  const rawNewsLang = String(req.query.lang || "").trim();
  const lang = normalizeNewsLanguageCode(rawNewsLang) || "all";
  const allowedCategories = new Set(["all", "nouveaux", "saisons", "films", "france", "licences-fr", "manga", "jeux", "divers"]);
  const requestedCategory = String(req.query.category || "all").toLowerCase();
  const category = allowedCategories.has(requestedCategory) ? requestedCategory : "all";
  const rawFrom = String(req.query.from || "").trim();
  const rawTo = String(req.query.to || "").trim();
  const from = validNewsDateInput(rawFrom);
  const to = validNewsDateInput(rawTo);
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 240, NEWS_QUERY_MAX_ITEMS));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  if (rawFrom && !from) return res.status(400).json({ error: "Date de début invalide." });
  if (rawTo && !to) return res.status(400).json({ error: "Date de fin invalide." });
  if (from && to && from > to) return res.status(400).json({ error: "La date de début doit précéder la date de fin." });

  try {
    await db.whenReady();
    await importLegacyNewsCacheOnce();

    const state = readNewsV2RefreshState();
    const lastAttemptAt = state._at || "";
    const ageMinutes = lastAttemptAt ? (Date.now() - Date.parse(lastAttemptAt)) / 60000 : Number.POSITIVE_INFINITY;
    const historyBefore = db.getNewsHistoryCount ? db.getNewsHistoryCount() : 0;
    const hasStoredItems = historyBefore > 0 || (Array.isArray(state.items) && state.items.length > 0);
    const refreshDue = forceRefresh || !Number.isFinite(ageMinutes) || ageMinutes >= NEWS_V2_TTL || (!hasStoredItems && ageMinutes >= 1) || (ageMinutes >= 5 && (state.stats?.sourceStats || []).some(source => !source.ok || !source.accepted));
    const shouldRefresh = !quickLoad && refreshDue;
    const retentionDays = getNewsRetentionDays();
    let refreshInfo = { attempted: false, cached: true, lastAttemptAt: lastAttemptAt || null };

    if (shouldRefresh) {
      const refreshPromise = newsRefresh.start({ allowFallback: !hasStoredItems, skipNetworkFallback: req.query.background === "1",preferredLang:normalizeNewsLanguageCode(req.query.preferredLang) });
      if (req.query.background !== "1") refreshInfo = await refreshPromise;
    }
    const progress = newsRefresh.snapshot();
    refreshInfo = { ...refreshInfo, pending: progress.pending, completedSources: progress.completedSources, totalSources: progress.totalSources, revision: progress.revision };

    let query = db.queryNewsHistory
      ? db.queryNewsHistory({ lang, category, from, to, limit, offset })
      : { items: [], total: 0, limit, offset };

    // Secours JSON uniquement si sql.js est indisponible. L'historique normal reste SQLite.
    if (!query.items.length && (!db.getNewsHistoryCount || db.getNewsHistoryCount() === 0)) {
      const fallbackItems = filterNewsItemsInMemory(readNewsV2RefreshState().items || [], { lang, category, from, to });
      query = {
        items: fallbackItems.slice(offset, offset + limit),
        total: fallbackItems.length,
        limit,
        offset
      };
    }

    const meta = newsHistoryResponseMeta({ lang, category });
    const latestState = readNewsV2RefreshState();
    res.json({
      ok: true,
      cached: !refreshInfo.attempted,
      items: query.items,
      count: query.items.length,
      total: query.total,
      limit: query.limit,
      offset: query.offset,
      truncated: query.offset + query.items.length < query.total,
      availableFrom: meta.availableFrom,
      availableTo: meta.availableTo,
      historyTotal: meta.total,
      datedTotal: meta.dated,
      undatedTotal: meta.undated,
      retentionDays: meta.retentionDays,
      standardMaximumDays: meta.standardMaximumDays,
      unlimitedHistory: meta.unlimitedHistory,
      lastRefreshAt: latestState._successAt || latestState._at || null,
      refresh: refreshInfo,
      sourceStats: latestState.stats?.sourceStats || [],
      refreshDue: Boolean(refreshDue)
    });
  } catch (error) {
    const state = readNewsV2RefreshState();
    const fallbackItems = filterNewsItemsInMemory(state.items || [], { lang, category, from, to });
    if (fallbackItems.length) {
      return res.json({
        ok: true,
        cached: true,
        stale: true,
        items: fallbackItems.slice(offset, offset + limit),
        total: fallbackItems.length,
        count: Math.min(limit, fallbackItems.length),
        limit,
        offset,
        warning: error.message,
        retentionDays: getNewsRetentionDays()
      });
    }
    res.status(500).json({ error: error.message });
  }
});


const newsMedia = require('./lib/news-media').createNewsMedia({directory: path.join(DATA_DIR, 'cache', 'news-images'), lookup: key => db.getNewsItemByKey(key), validate: assertPublicNewsUrl});
app.get('/api/v2/news/image', async (req, res) => {
  try { await db.whenReady(); const image = await newsMedia.get(String(req.query.key || '').slice(0, 500)); res.set({'Content-Type':image.type, 'Cache-Control':'private, max-age=86400', 'X-Content-Type-Options':'nosniff'}).send(image.bytes); }
  catch { res.status(404).set('Cache-Control','no-store').end(); }
});

app.post("/api/v2/news/images/resolve", async (req, res) => {
  try {
    await db.whenReady();
    const requested = Array.isArray(req.body?.items) ? req.body.items.slice(0, 36) : [];
    const force = req.body?.force === true;
    const unique = [];
    const seen = new Set();
    for (const raw of requested) {
      const originalArticleUrl = String(raw?.articleUrl || raw?.url || "").trim();
      const articleUrl = canonicalNewsUrl(originalArticleUrl);
      if (!articleUrl || seen.has(articleUrl)) continue;
      seen.add(articleUrl);
      unique.push({
        newsKey: String(raw?.newsKey || "").trim(),
        id: String(raw?.id || "").trim(),
        title: htmlStrip(raw?.title || "Actualité").slice(0, 500),
        originalArticleUrl,
        articleUrl,
        source: String(raw?.source || "").trim(),
        lang: String(raw?.lang || "").trim(),
        category: String(raw?.category || "divers").trim(),
        date: raw?.date || raw?.publishedAt || "",
        discoveredAt: raw?.discoveredAt || new Date().toISOString(),
        failedImageUrl:String(raw?.failedImageUrl||"").slice(0,2000)
      });
    }
    if (!unique.length) return res.json({ ok: true, items: [], resolved: 0, requested: 0 });

    const resolved = [];
    await runWithConcurrency(unique, 4, async item => {
      const imageUrl = await fetchNewsArticleImage(item.articleUrl, {force,exclude:item.failedImageUrl});
      if (imageUrl) resolved.push({ ...item, imageUrl });
    });
    const persist = persistResolvedNewsImages(resolved);
    if (persist.ok === false) throw Error('ALM_NEWS_IMAGE_WRITE_FAILED');
    res.json({
      ok: true,
      requested: unique.length,
      resolved: resolved.length,
      items: resolved.map(item => ({ newsKey: item.newsKey, articleUrl: item.articleUrl, imageUrl: item.imageUrl })),
      persisted: Number(persist?.processed || 0)
    });
  } catch (error) {
    res.status(500).json({ error: "Impossible de récupérer les vignettes : " + error.message });
  }
});

app.get("/api/v2/news/article", async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "").trim();
    if (!/^https?:\/\//i.test(rawUrl)) return res.status(400).json({ error: "URL article invalide." });
    const canonicalUrl = canonicalNewsUrl(rawUrl) || rawUrl;
    try { await assertPublicNewsUrl(canonicalUrl); }
    catch (error) { return res.status(400).json({ error: error.message || "Source article non autorisée." }); }

    const key = crypto.createHash("sha256").update(canonicalUrl).digest("hex");
    const cache = await readJsonSafe(NEWS_ARTICLE_CACHE_FILE, {});
    const cached = cache[key];
    if (cached?.text && Date.now() - new Date(cached.at || 0).getTime() < NEWS_ARTICLE_TTL_MS) {
      let cachedImageUrl = String(cached.imageUrl || "").trim();
      // Missing images are resolved by the separate visible-image workflow.
      return res.json({ ok: true, cached: true, url: canonicalUrl, text: cached.text, title: cached.title || "", imageUrl: cachedImageUrl });
    }

    const fetched = await fetchPublicNewsUrl(canonicalUrl, {
      timeoutMs: 12000,
      headers: {
        "User-Agent": `AnimeLocalManager/${PRODUCT_RELEASE.technicalVersion} Article Reader`,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5"
      }
    });
    const response = fetched.response;
    if (!response.ok) return res.status(response.status).json({ error: `Article indisponible HTTP ${response.status}` });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return res.status(415).json({ error: "La source ne renvoie pas une page HTML lisible." });
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 8 * 1024 * 1024) return res.status(413).json({ error: "La page source est trop volumineuse pour le lecteur intégré." });

    const html = fetched.text;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? htmlStrip(titleMatch[1]).slice(0, 220) : "";
    const text = extractReadableArticleText(html);
    const imageUrl = extractArticleImage(html, fetched.finalUrl || canonicalUrl);
    if (!text || text.length < 120) return res.status(422).json({ error: "Texte article trop court ou illisible." });

    cache[key] = { at: new Date().toISOString(), imageCheckedAt: new Date().toISOString(), url: canonicalUrl, finalUrl: fetched.finalUrl || canonicalUrl, title, text, imageUrl };
    const keys = Object.keys(cache).sort((a, b) => new Date(cache[b].at || 0) - new Date(cache[a].at || 0));
    for (const oldKey of keys.slice(120)) delete cache[oldKey];
    await writeJsonSafe(NEWS_ARTICLE_CACHE_FILE, cache);
    if (imageUrl) {
      _newsArticleImageCache.set(canonicalUrl, { imageUrl, checkedAt: Date.now(), expiresAt: Date.now() + NEWS_IMAGE_POSITIVE_TTL_MS });
      if (db.updateNewsImagesByArticleUrl) {
        db.updateNewsImagesByArticleUrl([{ key, articleUrls: [rawUrl, canonicalUrl], imageUrl }]);
      } else if (db.updateNewsImageByArticleUrl) {
        db.updateNewsImageByArticleUrl(canonicalUrl, imageUrl);
      }
    }

    res.json({ ok: true, cached: false, url: canonicalUrl, title, text, imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/news/cache/clear", async (req, res) => {
  try {
    await db.whenReady();
    await Promise.all([
      fsp.rm(NEWS_V2_CACHE_FILE, { force: true }),
      fsp.rm(NEWS_ARTICLE_CACHE_FILE, { force: true }),
      fsp.rm(NEWS_CACHE_FILE, { force: true })
    ]);
    _newsArticleImageCache.clear();

    const clearHistory = req.body?.clearHistory === true;
    const historyResult = clearHistory && db.clearNewsHistory
      ? db.clearNewsHistory()
      : null;
    if (historyResult?.ok === false) throw Error('ALM_NEWS_CLEAR_FAILED');
    const historyTotal = db.getNewsHistoryCount ? db.getNewsHistoryCount() : 0;
    res.json({
      ok: true,
      cleared: true,
      historyPreserved: !clearHistory,
      historyCleared: clearHistory,
      historyResult,
      historyTotal
    });
  } catch (error) {
    res.status(500).json({ error: "Impossible de vider les caches d'actualités : " + error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// V2 — PAGE RECOMMANDATIONS (par genre, auteur, seiyuu, univers)
// ═══════════════════════════════════════════════════════════════

const RECO_FULL_CACHE = path.join(DATA_DIR, "cache", "reco-full-cache.json");

// Cache générique avec TTL
function readTTLCache(file, ttlH = 24) {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if ((Date.now() - new Date(d._at||0).getTime()) / 3600000 < ttlH) return d;
  } catch {}
  return null;
}
function writeTTLCache(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...data, _at: new Date().toISOString() }, null, 2), "utf8");
  } catch {}
}

// Schéma v10 : AniList devient le chemin rapide principal ; Jikan n’est appelé
// qu’en secours. Les anciens caches v9 sont invalidés pour éviter de conserver
// des résultats lents, vides ou incomplets.
const RECO_PEOPLE_SCHEMA_VERSION = 10;
const RECO_PEOPLE_SUCCESS_TTL_HOURS = 7 * 24;
const RECO_PEOPLE_EMPTY_TTL_HOURS = 8;

function readRecoPeopleCache(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && data.schemaVersion === RECO_PEOPLE_SCHEMA_VERSION ? data : null;
  } catch {
    return null;
  }
}

function recoCacheAgeHours(data) {
  return (Date.now() - (Date.parse(data?._at || "") || 0)) / 3600000;
}

function freshRecoPeopleCache(data) {
  if (!data) return false;
  const hasUsefulResult = Array.isArray(data.items) ? data.items.length > 0 : Array.isArray(data.people) && data.people.length > 0;
  return recoCacheAgeHours(data) < (hasUsefulResult ? RECO_PEOPLE_SUCCESS_TTL_HOURS : RECO_PEOPLE_EMPTY_TTL_HOURS);
}

function writeRecoPeopleCache(file, data) {
  writeTTLCache(file, { ...data, schemaVersion: RECO_PEOPLE_SCHEMA_VERSION });
}

function settledSource(result, label) {
  if (result.status === "fulfilled") return { ok: true, label, value: result.value };
  return { ok: false, label, value: null, error: result.reason?.message || String(result.reason || "Source indisponible") };
}

async function fetchAniListReco(query, variables, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 2));
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetchAniListGraphQL(query, variables);
    } catch (error) {
      lastError = error;
      if (error?.retryable === false || [400,401,403,404,405,413].includes(error?.status)) break;
      if (attempt + 1 < attempts) await sleep(700 * (attempt + 1));
    }
  }
  throw lastError || new Error("AniList indisponible");
}

const ANILIST_CREATOR_QUERY = `
  query AnimeCreators($idMal: Int!, $page: Int!) {
    Media(idMal: $idMal, type: ANIME) {
      staff(page: $page, perPage: 25) {
        pageInfo { hasNextPage currentPage }
        edges {
          role
          node { id name { full native userPreferred } image { large medium } }
        }
      }
    }
  }
`;

const ANILIST_VOICE_QUERY = `
  query AnimeVoices($idMal: Int!, $page: Int!) {
    Media(idMal: $idMal, type: ANIME) {
      characters(page: $page, perPage: 25) {
        pageInfo { hasNextPage currentPage }
        edges {
          role
          node { name { full } }
          voiceActors(language: JAPANESE) {
            id name { full native userPreferred } image { large medium }
          }
        }
      }
    }
  }
`;

const ANILIST_STAFF_MEDIA_QUERY = aniListStaffFilmography.STAFF_MEDIA_QUERY;
const ANILIST_CHARACTER_MEDIA_QUERY = aniListStaffFilmography.CHARACTER_MEDIA_QUERY;
const ANILIST_STAFF_CHARACTERS_QUERY = aniListStaffFilmography.STAFF_CHARACTERS_QUERY;

const ANILIST_STAFF_LOOKUP_QUERY = `
  query StaffLookup($search: String!) {
    Staff(search: $search) {
      id
      name { full native userPreferred }
      image { large medium }
    }
  }
`;

const RECO_PERSON_ID_MAP_FILE = path.join(DATA_DIR, "cache", "people-id-map-v1.json");
let _recoPersonIdMap = null;

function readRecoPersonIdMap() {
  if (_recoPersonIdMap) return _recoPersonIdMap;
  try {
    const parsed = JSON.parse(fs.readFileSync(RECO_PERSON_ID_MAP_FILE, "utf8"));
    _recoPersonIdMap = parsed && typeof parsed === "object" ? parsed : { version: 1, items: {} };
  } catch {
    _recoPersonIdMap = { version: 1, items: {} };
  }
  if (!_recoPersonIdMap.items || typeof _recoPersonIdMap.items !== "object") _recoPersonIdMap.items = {};
  return _recoPersonIdMap;
}

function writeRecoPersonIdMap() {
  try {
    fs.mkdirSync(path.dirname(RECO_PERSON_ID_MAP_FILE), { recursive: true });
    fs.writeFileSync(RECO_PERSON_ID_MAP_FILE, JSON.stringify({ ...readRecoPersonIdMap(), updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch {}
}

function cachedRecoPersonIds(person) {
  const key = recoPeople.personNameKey(person?.name || person?.nativeName || "");
  const cached = key ? readRecoPersonIdMap().items[key] : null;
  return {
    ...person,
    malId: person?.malId || cached?.malId || "",
    anilistId: person?.anilistId || cached?.anilistId || ""
  };
}

function rememberRecoPersonIds(person) {
  const key = recoPeople.personNameKey(person?.name || person?.nativeName || "");
  if (!key) return person;
  const map = readRecoPersonIdMap();
  const current = map.items[key] || {};
  const next = {
    name: person?.name || current.name || "",
    nativeName: person?.nativeName || current.nativeName || "",
    malId: person?.malId || current.malId || "",
    anilistId: person?.anilistId || current.anilistId || "",
    updatedAt: new Date().toISOString()
  };
  map.items[key] = next;
  writeRecoPersonIdMap();
  return { ...person, malId: next.malId, anilistId: next.anilistId };
}

function jikanPersonNameCandidates(row) {
  const given = String(row?.given_name || "").trim();
  const family = String(row?.family_name || "").trim();
  return [
    row?.name,
    row?.aboutName,
    given && family ? `${given} ${family}` : "",
    given && family ? `${family} ${given}` : "",
    given,
    family
  ]
    .map(value => String(value || "").trim())
    .filter(Boolean);
}

function recoPersonLookupScore(wanted, candidate) {
  const wantedNormalized = recoPeople.normalizePersonName(wanted);
  const candidateNormalized = recoPeople.normalizePersonName(candidate);
  if (!wantedNormalized || !candidateNormalized) return 0;
  if (wantedNormalized === candidateNormalized) return 100;
  if (recoPeople.personNameKey(wantedNormalized) === recoPeople.personNameKey(candidateNormalized)) return 100;

  const wantedWords = new Set(wantedNormalized.split(" ").filter(Boolean));
  const candidateWords = new Set(candidateNormalized.split(" ").filter(Boolean));
  if (!wantedWords.size || !candidateWords.size) return 0;
  let common = 0;
  for (const word of wantedWords) if (candidateWords.has(word)) common += 1;
  const coverage = common / Math.max(wantedWords.size, candidateWords.size);
  const shorterCoverage = common / Math.min(wantedWords.size, candidateWords.size);
  return Math.round((coverage * 0.72 + shorterCoverage * 0.28) * 100);
}

async function lookupJikanPersonIdByName(person) {
  const queryName = String(person?.name || person?.nativeName || "").trim();
  if (!queryName) return 0;
  const json = await fetchJikanJson(`https://api.jikan.moe/v4/people?q=${encodeURIComponent(queryName)}&limit=10&order_by=favorites&sort=desc`, {
    attempts: 2,
    timeoutMs: 6500,
    throwOnError: true
  });
  const rows = Array.isArray(json?.data) ? json.data : [];
  const ranked = rows
    .map(row => ({
      row,
      score: jikanPersonNameCandidates(row).reduce(
        (best, name) => Math.max(best, recoPersonLookupScore(queryName, name)),
        0
      )
    }))
    .filter(item => Number(item.row?.mal_id || 0) > 0)
    .sort((a, b) => b.score - a.score || Number(b.row?.favorites || 0) - Number(a.row?.favorites || 0));
  // Ne jamais associer automatiquement un homonyme approximatif : une mauvaise
  // personne donnerait des recommandations totalement étrangères à l'anime.
  const selected = ranked.find(item => item.score >= 88)?.row;
  return Number(selected?.mal_id || 0) || 0;
}

async function lookupAniListPersonIdByName(person) {
  const queryName = String(person?.name || person?.nativeName || "").trim();
  if (!queryName) return 0;
  const json = await fetchAniListReco(ANILIST_STAFF_LOOKUP_QUERY, { search: queryName }, { attempts: 2 });
  const staff = json?.data?.Staff;
  if (!staff?.id) return 0;
  const returnedNames = [staff?.name?.userPreferred, staff?.name?.full, staff?.name?.native]
    .map(value => ({ value, score: recoPersonLookupScore(queryName, value) }))
    .filter(item => String(item.value || "").trim());
  return returnedNames.some(item => item.score >= 88) ? Number(staff.id) : 0;
}

async function resolveMissingRecoPersonIds(person, options = {}) {
  let resolved = cachedRecoPersonIds(person);
  // AniList est le chemin principal : un seul identifiant suffit pour obtenir
  // la filmographie. Éviter de bloquer l'interface sur Jikan quand AniList a
  // déjà résolu la personne.
  if (!aniListRecoPersonId(resolved)) {
    try {
      const id = await withTimeout(lookupAniListPersonIdByName(resolved), Number(options.aniListTimeoutMs || 5500));
      if (id) resolved.anilistId = id;
    } catch {}
  }
  if (!aniListRecoPersonId(resolved) && !jikanRecoPersonId(resolved)) {
    try {
      const id = await withTimeout(lookupJikanPersonIdByName(resolved), Number(options.jikanTimeoutMs || 7000));
      if (id) resolved.malId = id;
    } catch {}
  }
  return rememberRecoPersonIds(resolved);
}

async function fetchAniListAnimePeople(malId, kind) {
  const parser = kind === "creator" ? recoPeople.parseAniListCreators : recoPeople.parseAniListVoiceActors;
  const query = kind === "creator" ? ANILIST_CREATOR_QUERY : ANILIST_VOICE_QUERY;
  const groups = [];
  const maxPages = 2;
  for (let page = 1; page <= maxPages; page++) {
    const json = await fetchAniListReco(query, { idMal: Number(malId), page }, { attempts: 2 });
    groups.push(parser(json));
    const connection = kind === "creator" ? json?.data?.Media?.staff : json?.data?.Media?.characters;
    if (!connection || connection?.pageInfo?.hasNextPage !== true) break;
  }
  return recoPeople.mergePeople(groups, kind === "creator" ? 10 : 12);
}

async function resolveAnimePeople(malId, kind, options = {}) {
  const numericMalId = Number(malId);
  if (!Number.isFinite(numericMalId) || numericMalId < 1) return { people: [], sources: [], errors: ["Identifiant MAL invalide"] };
  const cacheFile = path.join(DATA_DIR, "cache", `${kind === "creator" ? "staff" : "seiyuu"}-v10-${numericMalId}.json`);
  const cached = readRecoPeopleCache(cacheFile);
  if (!options.force && freshRecoPeopleCache(cached)) return { ...cached, cached: true };

  const errors = [];
  // Chemin rapide : AniList fournit directement le staff/les seiyuu et répond
  // généralement en une requête. On n'attend plus Jikan en parallèle.
  try {
    const aniPeople = await withTimeout(fetchAniListAnimePeople(numericMalId, kind), Number(options.aniListTimeoutMs || 7000));
    const people = recoPeople.mergePeople([aniPeople], kind === "creator" ? 8 : 10);
    if (people.length) {
      const result = {
        schemaVersion: RECO_PEOPLE_SCHEMA_VERSION,
        people,
        sources: ["AniList"],
        errors: [],
        partial: false,
        cached: false,
        fastPath: true
      };
      writeRecoPeopleCache(cacheFile, result);
      return result;
    }
  } catch (error) {
    errors.push(`AniList: ${error?.message || error}`);
  }

  // Secours uniquement si AniList n'a rien donné. Les délais sont bornés afin
  // qu'une API ralentie ne donne plus l'impression que l'application gèle.
  try {
    const jikan = kind === "creator"
      ? await withTimeout(fetchJikanJson(`https://api.jikan.moe/v4/anime/${numericMalId}/staff`, { attempts: 2, timeoutMs: 6500, throwOnError: true }), 7500).then(recoPeople.parseJikanAnimeStaff)
      : await withTimeout(fetchJikanJson(`https://api.jikan.moe/v4/anime/${numericMalId}/characters`, { attempts: 2, timeoutMs: 6500, throwOnError: true }), 7500).then(recoPeople.parseJikanVoiceActors);
    const people = recoPeople.mergePeople([jikan], kind === "creator" ? 8 : 10);
    const result = {
      schemaVersion: RECO_PEOPLE_SCHEMA_VERSION,
      people,
      sources: ["Jikan"],
      errors,
      partial: Boolean(errors.length),
      cached: false,
      fastPath: false
    };
    if (people.length) writeRecoPeopleCache(cacheFile, result);
    else if (cached?.people?.length) return { ...cached, cached: true, stale: true, warning: "Sources temporairement indisponibles : dernier résultat connu affiché." };
    return result;
  } catch (error) {
    errors.push(`Jikan: ${error?.message || error}`);
  }

  if (cached?.people?.length) return { ...cached, cached: true, stale: true, warning: "Sources temporairement indisponibles : dernier résultat connu affiché." };
  return { schemaVersion: RECO_PEOPLE_SCHEMA_VERSION, people: [], sources: [], errors, partial: false, cached: false };
}

function enrichRecoWorkFromMetadata(work) {
  if (!work?.malId) return work;
  try {
    const meta = db?.getMetadataByMalId ? db.getMetadataByMalId(work.malId) : null;
    if (!meta) return work;
    return {
      ...work,
      title: work.title || meta.titleEn || meta.title || meta.titleRomaji || "",
      imageUrl: work.imageUrl || meta.imageUrl || "",
      type: work.type || meta.type || "",
      publicScore: work.publicScore || meta.score || "",
      genres: Array.isArray(work.genres) && work.genres.length ? work.genres : (Array.isArray(meta.genres) ? meta.genres : []),
      startDate: work.startDate || meta.startDate || ""
    };
  } catch {
    return work;
  }
}

function dedupeRecoWorks(items, limit = 18) {
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = enrichRecoWorkFromMetadata(raw);
    const key = String(item?.malId || normalizeCacheLookupKey(item?.title || ""));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function jikanRecoPersonId(person) {
  const id = Number(person?.malId || (String(person?.source || "").includes("Jikan") ? person?.id : 0));
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function aniListRecoPersonId(person) {
  const id = Number(person?.anilistId || (String(person?.source || "").includes("AniList") ? person?.id : 0));
  return Number.isFinite(id) && id > 0 ? id : 0;
}

async function fetchJikanPersonWorks(person, kind) {
  const personId = jikanRecoPersonId(person);
  if (!personId) return [];
  const defaults = kind === "creator"
    ? { creatorName: person.name, creatorRole: person.role }
    : { seiyuuName: person.name };
  const parser = kind === "creator" ? recoPeople.parseJikanPersonAnime : recoPeople.parseJikanPersonVoices;
  const endpoint = `https://api.jikan.moe/v4/people/${personId}/${kind === "creator" ? "anime" : "voices"}`;
  const errors = [];
  let specializedAnswered = false;

  // Ces collections Jikan ne sont pas paginées : un paramètre page ajouté à
  // l'URL peut être rejeté par le validateur de l'API. Une seule requête rend
  // toute la carrière ; /full reste le secours indépendant.
  try {
    const json = await fetchJikanJson(endpoint, { attempts: 2, timeoutMs: 6500, throwOnError: true });
    specializedAnswered = true;
    const items = recoPeople.mergeWorks([parser(json, defaults)], { limit: kind === "creator" ? 80 : 160 });
    if (items.length) return items;
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  try {
    const json = await fetchJikanJson(`https://api.jikan.moe/v4/people/${personId}/full`, { attempts: 1, timeoutMs: 6500, throwOnError: true });
    return recoPeople.mergeWorks([parser(json, defaults)], { limit: kind === "creator" ? 80 : 160 });
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  if (!specializedAnswered && errors.length) throw new Error([...new Set(errors)].join(" ; "));
  return [];
}

async function fetchAniListPersonWorks(person, kind) {
  const personId = aniListRecoPersonId(person);
  if (!personId) return [];
  const defaults = kind === "creator"
    ? { creatorName: person.name, creatorRole: person.role }
    : { seiyuuName: person.name };
  return aniListStaffFilmography.fetchStaffFilmography({
    request: (query, variables) => fetchAniListReco(query, variables, { attempts: 2 }),
    personId,
    kind,
    defaults
  });
}

function recoPeopleLibraryFingerprint(animes = readAnimes()) {
  const eligible = (Array.isArray(animes) ? animes : []).filter(isAnimeFeatureEligible);
  const stable = eligible
    .map(anime => `${String(anime?.malId || "").trim()}|${recoPeople.normalizePersonName(anime?.title || "")}`)
    .filter(value => value !== "|")
    .sort()
    .join("\n");
  return crypto.createHash("sha1").update(stable).digest("hex").slice(0, 20);
}

function filterRecoWorksForLibrary(items, animes = readAnimes(), limit = 18) {
  const eligible = (Array.isArray(animes) ? animes : []).filter(isAnimeFeatureEligible);
  const ownedIds = new Set(eligible.map(anime => String(anime?.malId || "")).filter(Boolean));
  const ownedTitles = new Set(eligible
    .flatMap(anime => [anime?.title, anime?.officialTitle, anime?.englishTitle])
    .map(recoPeople.normalizePersonName)
    .filter(Boolean));
  return recoPeople.mergeWorks([Array.isArray(items) ? items : []], {
    limit,
    excludeMalIds: ownedIds,
    excludeTitles: ownedTitles
  });
}

function recoRouteCacheIsFresh(cache, libraryFingerprint) {
  return freshRecoPeopleCache(cache) && String(cache?.libraryFingerprint || "") === String(libraryFingerprint || "");
}

function staleRecoRouteResult(cache, animes, libraryFingerprint, warning) {
  if (!cache || !Array.isArray(cache.items) || !cache.items.length) return null;
  return {
    ...cache,
    items: filterRecoWorksForLibrary(cache.items, animes, 18),
    libraryFingerprint,
    cached: true,
    stale: true,
    warning: warning || "Sources momentanément indisponibles : dernier résultat connu affiché."
  };
}

async function resolvePeopleRecommendations(malId, kind, options = {}) {
  const peopleResult = await resolveAnimePeople(malId, kind, options);
  // Deux créateurs ou trois voix principales donnent déjà un signal très riche.
  // Limiter ici évite 8 à 16 pages réseau inutiles pour chaque clic.
  const detectedPeople = (peopleResult.people || []).slice(0, kind === "creator" ? 2 : 3);
  const people = detectedPeople.map(cachedRecoPersonIds);
  const animes = readAnimes().filter(isAnimeFeatureEligible);
  const libraryFingerprint = recoPeopleLibraryFingerprint(animes);
  const ownedIds = new Set(animes.map(anime => String(anime.malId || "")).filter(Boolean));
  const ownedTitles = new Set(animes
    .flatMap(anime => [anime?.title, anime?.officialTitle, anime?.englishTitle, anime?.titleEn, anime?.titleRomaji, anime?.titleJapanese])
    .map(recoPeople.normalizePersonName)
    .filter(Boolean));
  const sourceStatus = [];
  const rawWorks = [];

  const hasUsefulUnownedWork = works => recoPeople.mergeWorks([works], {
    limit: 1,
    excludeMalIds: ownedIds,
    excludeTitles: ownedTitles
  }).length > 0;

  await runWithConcurrency(people, 3, async person => {
    let resolvedPerson = cachedRecoPersonIds(person);
    let personWorks = [];
    let aniListAttempted = false;
    let jikanAttempted = false;

    // 1) AniList d'abord, avec délai court et borné.
    if (!aniListRecoPersonId(resolvedPerson)) {
      resolvedPerson = await resolveMissingRecoPersonIds(resolvedPerson, { aniListTimeoutMs: 5000, jikanTimeoutMs: 0 });
    }
    if (aniListRecoPersonId(resolvedPerson)) {
      aniListAttempted = true;
      try {
        const works = await withTimeout(fetchAniListPersonWorks(resolvedPerson, kind), kind === "creator" ? 6500 : 8000);
        personWorks.push(...works);
        sourceStatus.push({ ok: true, source: `AniList · ${resolvedPerson.name}`, error: "" });
      } catch (error) {
        sourceStatus.push({ ok: false, source: `AniList · ${resolvedPerson.name}`, error: error?.message || String(error) });
      }
    }

    // 2) Jikan uniquement si le chemin rapide n'a pas produit de proposition
    // utile. Cela préserve un excellent fallback sans ralentir chaque recherche.
    if (!hasUsefulUnownedWork(personWorks)) {
      if (!jikanRecoPersonId(resolvedPerson)) {
        try {
          const id = await withTimeout(lookupJikanPersonIdByName(resolvedPerson), 6500);
          if (id) resolvedPerson.malId = id;
        } catch {}
      }
      if (jikanRecoPersonId(resolvedPerson)) {
        jikanAttempted = true;
        try {
          const works = await withTimeout(fetchJikanPersonWorks(resolvedPerson, kind), 8000);
          personWorks.push(...works);
          sourceStatus.push({ ok: true, source: `Jikan · ${resolvedPerson.name}`, error: "" });
        } catch (error) {
          sourceStatus.push({ ok: false, source: `Jikan · ${resolvedPerson.name}`, error: error?.message || String(error) });
        }
      }
    }

    resolvedPerson = rememberRecoPersonIds(resolvedPerson);
    Object.assign(person, resolvedPerson);
    rawWorks.push(...personWorks);
    if (!aniListAttempted && !jikanAttempted) {
      sourceStatus.push({ ok: false, source: `Identifiant · ${person.name}`, error: "Aucun identifiant Jikan/AniList exploitable" });
    } else if (!personWorks.length) {
      sourceStatus.push({ ok: false, source: `Filmographie · ${person.name}`, error: "Aucun autre rôle anime trouvé" });
    }
  });

  const merged = recoPeople.mergeWorks(rawWorks, {
    limit: 40,
    excludeMalIds: ownedIds,
    excludeTitles: ownedTitles
  });
  const items = dedupeRecoWorks(merged, 18);
  return {
    items,
    people,
    sources: [...new Set([
      ...(peopleResult.sources || []),
      ...sourceStatus.filter(source => source.ok).map(source => source.source.split(" · ")[0])
    ])],
    sourceStatus,
    partial: Boolean(peopleResult.partial || sourceStatus.some(source => !source.ok)),
    stale: Boolean(peopleResult.stale),
    warning: peopleResult.warning || "",
    libraryFingerprint,
    errors: [...(peopleResult.errors || []), ...sourceStatus.filter(source => !source.ok).map(source => `${source.source}: ${source.error}`)]
  };
}



const RECO_GENRE_ALIASES = {
  "shonen": ["Shounen", "Shonen"],
  "shounen": ["Shounen", "Shonen"],
  "shojo": ["Shoujo", "Shojo"],
  "shoujo": ["Shoujo", "Shojo"],
  "sci fi": ["Sci-Fi", "Science Fiction"],
  "science fiction": ["Sci-Fi", "Science Fiction"],
  "slice of life": ["Slice of Life"],
  "tranche de vie": ["Slice of Life"],
  "magical girl": ["Mahou Shoujo", "Magical Girl"],
  "mahou shoujo": ["Mahou Shoujo", "Magical Girl"],
  "reincarnation": ["Reincarnation", "Isekai"],
  "reincarnation isekai": ["Reincarnation", "Isekai"],
  "fantastique": ["Fantasy"],
  "aventure": ["Adventure"],
  "comedie": ["Comedy"],
  "drame": ["Drama"],
  "horreur": ["Horror"],
  "mystere": ["Mystery"],
  "surnaturel": ["Supernatural"],
  "sport": ["Sports"]
};

function recoGenreVariants(genre) {
  const raw = String(genre || "").trim();
  if (!raw) return [];
  const normalized = normalizeCacheLookupKey(raw);
  return [...new Set([raw, ...(RECO_GENRE_ALIASES[normalized] || [])])].filter(Boolean);
}

function metadataToRecommendationItem(item, extra = {}) {
  if (!item) return null;
  return {
    malId: item.malId || "",
    title: item.titleEn || item.title || item.titleRomaji || "",
    originalTitle: item.title || "",
    imageUrl: item.imageUrl || "",
    publicScore: item.score ? String(item.score) : "",
    type: item.type || "",
    genres: Array.isArray(item.genres) ? item.genres : [],
    synopsis: item.synopsis || "",
    startDate: item.startDate || "",
    ...extra
  };
}

function recoLibraryFingerprint(animes, genres = []) {
  const stable = [
    ...(animes || []).map(a => String(a?.malId || normalizeCacheLookupKey(a?.title || ""))).filter(Boolean).sort(),
    "::genres::",
    ...(genres || []).map(g => String(g || "")).sort()
  ].join("|");
  return crypto.createHash("sha1").update(stable).digest("hex").slice(0, 20);
}

function localRecommendationsByGenre(genre, animes, limit = 12) {
  if (!db?.listMetadataByGenre) return [];
  const ownedIds = new Set((animes || []).map(a => String(a?.malId || "")).filter(Boolean));
  const ownedTitles = new Set((animes || []).flatMap(a => [a?.title, a?.officialTitle, a?.englishTitle])
    .map(normalizeCacheLookupKey).filter(Boolean));
  const rows = [];
  const seen = new Set();

  for (const variant of recoGenreVariants(genre)) {
    // Une grosse bibliothèque peut déjà contenir plusieurs centaines de titres
    // populaires d'un genre. On parcourt donc profondément le snapshot local au
    // lieu de s'arrêter aux 50/90 premiers résultats (cause du bloc vide en RC6).
    const found = db.listMetadataByGenre(variant, 500);
    for (const row of found) {
      const id = String(row?.malId || "");
      const titleKey = normalizeCacheLookupKey(row?.titleEn || row?.title || row?.titleRomaji || "");
      const key = id || titleKey;
      if (!key || seen.has(key) || ownedIds.has(id) || ownedTitles.has(titleKey)) continue;
      const item = metadataToRecommendationItem(row, { matchedGenre: genre, recommendationSource: "metadata-locale" });
      if (!item?.title) continue;
      seen.add(key);
      rows.push(item);
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

function localSimilarRecommendations(malId, limit = 18) {
  if (!db?.listMetadataByGenre) return [];
  const animes = readAnimes();
  const source = animes.find(a => String(a?.malId || "") === String(malId || ""));
  const sourceMeta = db?.getMetadataByMalId ? db.getMetadataByMalId(malId) : null;
  const sourceGenres = [...new Set([
    ...(Array.isArray(source?.genres) ? source.genres : []),
    ...(Array.isArray(sourceMeta?.genres) ? sourceMeta.genres : [])
  ].map(g => String(g || "").trim()).filter(Boolean))];
  if (!sourceGenres.length) return [];

  const ownedIds = new Set(animes.map(a => String(a?.malId || "")).filter(Boolean));
  const ownedTitles = new Set(animes.flatMap(a => [a?.title, a?.officialTitle, a?.englishTitle])
    .map(normalizeCacheLookupKey).filter(Boolean));
  const sourceGenreKeys = new Set(sourceGenres.map(normalizeCacheLookupKey));
  const candidates = new Map();

  for (const genre of sourceGenres.slice(0, 8)) {
    for (const variant of recoGenreVariants(genre)) {
      for (const row of db.listMetadataByGenre(variant, 320)) {
        const id = String(row?.malId || "");
        const titleKey = normalizeCacheLookupKey(row?.titleEn || row?.title || row?.titleRomaji || "");
        const key = id || titleKey;
        if (!key || ownedIds.has(id) || ownedTitles.has(titleKey)) continue;
        const rowGenres = Array.isArray(row?.genres) ? row.genres : [];
        const overlap = rowGenres.filter(g => sourceGenreKeys.has(normalizeCacheLookupKey(g)));
        const existing = candidates.get(key);
        const rankScore = overlap.length * 1000 + (Number(row?.score) || 0) * 20 - Math.min(Number(row?.popularity) || 999999, 999999) / 100000;
        if (!existing || rankScore > existing.rankScore) {
          candidates.set(key, { row, overlap, rankScore });
        }
      }
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, limit)
    .map(({ row, overlap }) => metadataToRecommendationItem(row, {
      matchedGenres: overlap,
      recommendationSource: "metadata-locale"
    }))
    .filter(Boolean);
}

// ── Reco par genre : metadata locale d'abord, donc instantanée et utilisable hors ligne ──
app.get("/api/v2/reco/genres", async (req, res) => {
  const cacheFile = path.join(DATA_DIR, "cache", "reco-genres.json");
  const forceRefresh = req.query.refresh === "1";
  const quickLoad = req.query.quick === "1";
  const requestedGenre = decodeHtmlEntitiesPlain(req.query.genre || "").trim().slice(0, 80);
  try {
    await db.whenReady();
    const animes = readAnimes().filter(isAnimeFeatureEligible);
    const weights = {};
    for (const anime of animes) {
      const weight = Math.max(1, Number(anime?.score) || 1);
      for (const rawGenre of (anime?.genres || [])) {
        const genre = String(rawGenre || "").trim();
        if (genre) weights[genre] = (weights[genre] || 0) + weight;
      }
    }
    const allGenres = Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([genre]) => genre);
    const topGenres = allGenres.slice(0, 12);
    const libraryKey = recoLibraryFingerprint(animes, allGenres);
    const metadataCount = Number(db?.getMetadataStats?.()?.count || 0);

    // Le client moderne demande un seul genre à la fois. Cela évite de parcourir
    // toute la base pour des dizaines de genres alors qu'un seul est affiché.
    if (requestedGenre) {
      const items = localRecommendationsByGenre(requestedGenre, animes, 18);
      return res.json({
        ok: true,
        cached: false,
        source: "metadata-locale",
        genre: requestedGenre,
        items,
        results: { [requestedGenre]: items },
        metadataCount,
        topGenres,
        allGenres,
        message: items.length
          ? ""
          : metadataCount
            ? `Aucune suggestion disponible pour ${requestedGenre}.`
            : "La base metadata locale n'est pas encore disponible."
      });
    }

    if (!forceRefresh) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        const ageMinutes = (Date.now() - new Date(cached._at || 0).getTime()) / 60000;
        if (cached.schemaVersion === 3 && cached.libraryKey === libraryKey && Number(cached.metadataCount || 0) === metadataCount && ageMinutes < 360 && cached.results) {
          return res.json({ ok: true, cached: true, source: "metadata-locale", metadataCount, topGenres, allGenres, results: cached.results });
        }
      } catch {}
    }

    const results = {};
    // Compatibilité des anciennes interfaces : leurs boutons utilisaient les
    // genres principaux. Calculer les douze premiers suffit et reste rapide.
    for (const genre of topGenres) results[genre] = localRecommendationsByGenre(genre, animes, 12);
    const payload = {
      schemaVersion: 3,
      libraryKey,
      source: "metadata-locale",
      metadataCount,
      topGenres,
      allGenres,
      results,
      _at: new Date().toISOString()
    };
    try {
      writeJsonAtomicSync(cacheFile, payload);
    } catch {}
    res.json({ ok: true, cached: false, ...payload });
  } catch (error) {
    res.status(500).json({ error: "Recommandations par genre impossibles : " + error.message });
  }
});

// ── Reco par anime similaire (si tu as aimé X) ──
app.get("/api/v2/reco/similar/:malId", async (req, res) => {
  const malId = Number(req.params.malId);
  if (!Number.isSafeInteger(malId) || malId < 1) return res.status(400).json({error:'ALM_MAL_ID_INVALID'});
  const cacheFile = path.join(DATA_DIR, "cache", `similar-${malId}.json`);
  const cached = readTTLCache(cacheFile, 72);
  if (cached?.schemaVersion === 2 && Array.isArray(cached.items) && cached.items.length) {
    return res.json({ ok: true, cached: true, source: cached.source || "cache", items: filterRecoWorksForLibrary(cached.items) });
  }

  try {
    await db.whenReady();
    const localItems = localSimilarRecommendations(malId, 18);
    if (localItems.length >= 6) {
      const result = { schemaVersion: 2, source: "metadata-locale", items: localItems };
      writeTTLCache(cacheFile, result);
      return res.json({ ok: true, cached: false, ...result });
    }

    const animes = readAnimes().filter(isAnimeFeatureEligible);
    const ownedIds = new Set(animes.map(a => String(a.malId)).filter(Boolean));
    let remoteItems = [];
    try {
      const json = await fetchJikanJson(`https://api.jikan.moe/v4/anime/${malId}/recommendations`, { attempts: 2, timeoutMs: 9000 });
      remoteItems = (json?.data || [])
        .filter(x => !ownedIds.has(String(x.entry?.mal_id)))
        .map(x => ({
          malId: x.entry?.mal_id,
          title: x.entry?.title,
          imageUrl: x.entry?.images?.jpg?.large_image_url || x.entry?.images?.jpg?.image_url || "",
          votes: x.votes || 1,
          recommendationSource: "Jikan"
        }))
        .filter(item => item.malId && item.title)
        .sort((a, b) => b.votes - a.votes);
    } catch {}

    const merged = [];
    const seen = new Set();
    for (const item of [...remoteItems, ...localItems]) {
      const key = String(item?.malId || normalizeCacheLookupKey(item?.title || ""));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 18) break;
    }
    const result = {
      schemaVersion: 2,
      source: remoteItems.length ? "Jikan + metadata-locale" : "metadata-locale",
      items: merged
    };
    writeTTLCache(cacheFile, result);
    res.json({ ok: true, cached: false, ...result, message: merged.length ? "" : "Aucune recommandation proche n'a été trouvée." });
  } catch (error) {
    res.status(500).json({ error: "Recommandations similaires impossibles : " + error.message });
  }
});

app.get("/api/v2/reco/image/:malId", async (req, res) => {
  try {
    await db.whenReady();
    const meta = db.getMetadataByMalId ? db.getMetadataByMalId(req.params.malId) : null;
    if (!meta?.imageUrl) return res.status(404).end();
    const localPath = await cacheExternalImageStable(meta.imageUrl, meta.titleEn || meta.title || `anime-${meta.malId}`, "reco");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    if (localPath) return res.redirect(302, localPath);
    return res.redirect(302, meta.imageUrl);
  } catch {
    return res.status(404).end();
  }
});

// ── Reco par mangaka/auteur ──
app.get("/api/v2/reco/creator/:malId", async (req, res) => {
  const malId = Number(req.params.malId);
  const force = String(req.query.refresh || "") === "1";
  const cacheFile = path.join(DATA_DIR, "cache", `creator-v10-${malId}.json`);
  const animes = readAnimes().filter(isAnimeFeatureEligible);
  const libraryFingerprint = recoPeopleLibraryFingerprint(animes);
  const cached = readRecoPeopleCache(cacheFile);
  if (!force && recoRouteCacheIsFresh(cached, libraryFingerprint)) {
    return res.json({ ok: true, cached: true, ...cached });
  }

  try {
    await db.whenReady();
    const resolved = await withTimeout(resolvePeopleRecommendations(malId, "creator", { force }), 14000);
    const creators = resolved.people || [];
    const workSourceSucceeded = (resolved.sourceStatus || []).some(status => status.ok);
    const stale = !resolved.items.length && !workSourceSucceeded
      ? staleRecoRouteResult(cached, animes, libraryFingerprint, "Les sources d’œuvres sont momentanément indisponibles : dernier résultat connu affiché.")
      : null;
    if (stale) return res.json({ ok: true, ...stale });

    const result = {
      schemaVersion: RECO_PEOPLE_SCHEMA_VERSION,
      libraryFingerprint: resolved.libraryFingerprint || libraryFingerprint,
      source: resolved.sources.length ? resolved.sources.join(" + ") : "Sources indisponibles",
      items: resolved.items || [],
      creators,
      partial: resolved.partial,
      stale: resolved.stale,
      warning: resolved.warning,
      diagnostics: resolved.sourceStatus,
      message: creators.length
        ? (resolved.items.length
            ? ""
            : (workSourceSucceeded
                ? "Créateur ou équipe créative détecté(e), mais aucune autre œuvre absente de ta bibliothèque n’a été trouvée."
                : "Créateur détecté, mais ses autres œuvres n’ont pas pu être chargées. Utilise « Réessayer sans cache »."))
        : "Aucun créateur exploitable n’a été trouvé. Réessaie sans cache : Jikan ou AniList peut être temporairement indisponible."
    };

    // Ne jamais écraser un cache utile par un échec réseau. Un résultat vide est
    // mémorisé uniquement si au moins une source d'œuvres a réellement répondu.
    if (result.items.length || (creators.length && workSourceSucceeded)) writeRecoPeopleCache(cacheFile, result);
    if (!result.items.length && !resolved.sources.length) {
      const fallback = staleRecoRouteResult(cached, animes, libraryFingerprint);
      if (fallback) return res.json({ ok: true, ...fallback });
    }
    res.json({ ok: true, cached: false, ...result });
  } catch (error) {
    const fallback = staleRecoRouteResult(cached, animes, libraryFingerprint);
    if (fallback) return res.json({ ok: true, ...fallback });
    res.json({
      ok: true,
      cached: false,
      schemaVersion: RECO_PEOPLE_SCHEMA_VERSION,
      libraryFingerprint,
      source: "Sources indisponibles",
      items: [],
      creators: [],
      diagnostics: [{ ok: false, source: "Recherche créateur", error: error.message }],
      message: "Recherche du créateur momentanément indisponible. Utilise « Réessayer sans cache » dans quelques instants."
    });
  }
});

// ── Reco par seiyuu ──
app.get("/api/v2/reco/seiyuu/:malId", async (req, res) => {
  const malId = Number(req.params.malId);
  const force = String(req.query.refresh || "") === "1";
  const cacheFile = path.join(DATA_DIR, "cache", `seiyuu-works-v10-${malId}.json`);
  const animes = readAnimes().filter(isAnimeFeatureEligible);
  const libraryFingerprint = recoPeopleLibraryFingerprint(animes);
  const cached = readRecoPeopleCache(cacheFile);
  if (!force && recoRouteCacheIsFresh(cached, libraryFingerprint)) {
    return res.json({ ok: true, cached: true, ...cached });
  }

  try {
    await db.whenReady();
    const resolved = await withTimeout(resolvePeopleRecommendations(malId, "seiyuu", { force }), 14000);
    const seiyuu = resolved.people || [];
    const workSourceSucceeded = (resolved.sourceStatus || []).some(status => status.ok);
    const stale = !resolved.items.length && !workSourceSucceeded
      ? staleRecoRouteResult(cached, animes, libraryFingerprint, "Les sources de rôles sont momentanément indisponibles : dernier résultat connu affiché.")
      : null;
    if (stale) return res.json({ ok: true, ...stale });

    const result = {
      schemaVersion: RECO_PEOPLE_SCHEMA_VERSION,
      libraryFingerprint: resolved.libraryFingerprint || libraryFingerprint,
      source: resolved.sources.length ? resolved.sources.join(" + ") : "Sources indisponibles",
      items: resolved.items || [],
      seiyuu,
      partial: resolved.partial,
      stale: resolved.stale,
      warning: resolved.warning,
      diagnostics: resolved.sourceStatus,
      message: seiyuu.length
        ? (resolved.items.length
            ? ""
            : (workSourceSucceeded
                ? "Voix japonaises détectées, mais aucun autre animé absent de ta bibliothèque n’a été trouvé."
                : "Voix japonaises détectées, mais leurs autres rôles n’ont pas pu être chargés. Utilise « Réessayer sans cache »."))
        : "Aucune voix japonaise exploitable n’a été trouvée. Réessaie sans cache : Jikan ou AniList peut être temporairement indisponible."
    };

    if (result.items.length || (seiyuu.length && workSourceSucceeded)) writeRecoPeopleCache(cacheFile, result);
    if (!result.items.length && !resolved.sources.length) {
      const fallback = staleRecoRouteResult(cached, animes, libraryFingerprint);
      if (fallback) return res.json({ ok: true, ...fallback });
    }
    res.json({ ok: true, cached: false, ...result });
  } catch (error) {
    const fallback = staleRecoRouteResult(cached, animes, libraryFingerprint);
    if (fallback) return res.json({ ok: true, ...fallback });
    res.json({
      ok: true,
      cached: false,
      schemaVersion: RECO_PEOPLE_SCHEMA_VERSION,
      libraryFingerprint,
      source: "Sources indisponibles",
      items: [],
      seiyuu: [],
      diagnostics: [{ ok: false, source: "Recherche seiyuu", error: error.message }],
      message: "Recherche des voix momentanément indisponible. Utilise « Réessayer sans cache » dans quelques instants."
    });
  }
});


// ── TÉLÉCHARGER IMAGES UNIQUEMENT (sans refetch d'infos) ──
app.post("/api/bulk/images-only", async (req, res) => {
  cleanupCompletionJobs();
  if (rejectWhenCompletionJobIsActive(res)) return;
  const jobId = completionJobId("images-only");
  _completeAllJobs[jobId] = newCompletionJob("images-only");
  res.json({ ok: true, jobId, kind: "images-only" });

  (async () => {
    const job = _completeAllJobs[jobId];
    try {
      const animes = readAnimes();
      const targets = animes.filter(a => a?.title && !hasDisplayImage(a));
      job.total = targets.length;
      if (!targets.length) { finishCompletionJob(job, "done"); return; }

      await runWithConcurrency(targets, 3, async (anime) => {
        if (completionJobCancelled(job)) return;
        const idx = animes.findIndex(a => Number(a.id) === Number(anime.id));
        if (idx < 0) return;
        job.current = anime.title;
        try {
          const malId = animes[idx].malId || null;
          let imgUrl = String(animes[idx].imageUrl || "").trim();
          if (!imgUrl) imgUrl = (await findBestImageUrlForAnimeCard(anime,anime.title)).imageUrl;
          if (imgUrl) {
            animes[idx].imageUrl = imgUrl;
            try {
              const localPath = await downloadImage(imgUrl, anime.title);
              if (localPath) animes[idx].poster = localPath;
              clearAutoImageUnresolved(animes[idx]);
              job.updatedImages++;
            } catch {
              // Affichage distant disponible : on ne bloque pas l'utilisateur sur la copie locale.
              clearAutoImageUnresolved(animes[idx]);
              job.updatedImages++;
            }
          } else {
            markAutoImageUnresolved(animes[idx]);
            job.failed++;
          }
        } catch { markAutoImageUnresolved(animes[idx]); job.failed++; }
        job.done++;
        if (job.done % 10 === 0) writeCompletionAnimes(animes);
      }, () => completionJobCancelled(job));

      job.failed = countCompletionIssues(animes, targets, job.kind);
      writeCompletionAnimes(animes);
      if (completionJobCancelled(job)) finishCompletionJob(job, "cancelled");
      else finishCompletionJob(job, "done");
    } catch (err) {
      if (completionJobCancelled(job)) finishCompletionJob(job, "cancelled");
      else finishCompletionJob(job, "error", err.message);
    }
  })();
});

// ── Auto-seed metadata depuis le cache Jikan et la bibliothèque locale ──
async function autoSeedMetadataFromCache() {
  if (rescueMode.active) return rescueMode.skipped();
  try {
    await db.whenReady();
    const stats = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
    // Ne lancer que si la metadata est quasi vide
    if (Number(stats.count || 0) > 50) return;
    console.log("[metadata] Base vide — seed automatique depuis cache Jikan...");

    const rows = [];

    // 1. Depuis le cache Jikan disque (déjà fetchés)
    for (const [, entry] of Object.entries(_jikanDiskCache)) {
      if (!entry || !entry.malId || !entry.officialTitle) continue;
      rows.push({
        malId:      Number(entry.malId),
        title:      entry.officialTitle || entry.title || "",
        titleEn:    entry.englishTitle || entry.officialTitle || "",
        titleRomaji:entry.romajiTitle || "",
        synonyms:   JSON.stringify([entry.title, entry.officialTitle, entry.englishTitle].filter(Boolean)),
        genres:     JSON.stringify(Array.isArray(entry.genres) ? entry.genres : []),
        episodes:   Number(entry.episodesTotal) || null,
        score:      parseFloat(entry.publicScore) || null,
        type:       entry.type || "",
        studios:    JSON.stringify(Array.isArray(entry.studios) ? entry.studios : []),
        imageUrl:   entry.imageUrl || "",
        synopsis:   (entry.synopsis || "").slice(0, 500),
        startDate:  entry.startDate || "",
        endDate:    entry.endDate || "",
        rank:       Number(entry.rank) || null,
        popularity: Number(entry.popularity) || null,
        members:    Number(entry.members) || null
      });
    }

    // 2. Depuis la bibliothèque locale (animes avec malId)
    const animes = readAnimes();
    for (const a of animes) {
      if (!a.malId || !a.title) continue;
      const exists = rows.find(r => r.malId === Number(a.malId));
      if (exists) continue; // déjà dans le cache Jikan
      rows.push({
        malId:      Number(a.malId),
        title:      a.officialTitle || a.title || "",
        titleEn:    a.englishTitle || "",
        titleRomaji:"",
        synonyms:   JSON.stringify([a.title, a.officialTitle, a.englishTitle].filter(Boolean)),
        genres:     JSON.stringify(Array.isArray(a.genres) ? a.genres : []),
        episodes:   Number(a.episodesTotal) || null,
        score:      parseFloat(a.publicScore) || null,
        type:       a.type || "",
        studios:    JSON.stringify(Array.isArray(a.studios) ? a.studios : [a.studio].filter(Boolean)),
        imageUrl:   a.imageUrl || "",
        synopsis:   (a.synopsis || "").slice(0, 500),
        startDate:  a.startDate || "",
        endDate:    a.endDate || "",
        rank:       Number(a.rank) || null,
        popularity: Number(a.popularity) || null,
        members:    null
      });
    }

    if (!rows.length) return;
    const result = db.importMetadataRows(rows);
    console.log(`[metadata] Seed automatique : ${result.imported || 0} entrées importées (${rows.length} candidates).`);
  } catch (err) {
    console.warn("[metadata] Auto-seed échoué :", err.message);
  }
}

// Route pour forcer le re-seed depuis Jikan cache
app.post("/api/metadata/auto-seed", async (req, res) => {
  try {
    const statsBefore = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
    await autoSeedMetadataFromCache();
    const statsAfter = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
    res.json({ ok: true, before: statsBefore.count, after: statsAfter.count, added: (statsAfter.count||0) - (statsBefore.count||0) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

let metadataStartupTimer = null;
let runtimeStopping = false;
dbReady.then(async () => {
  if (runtimeStopping) return;
  const legacyImportedIds=readAnimes().filter(a=>a.betaseriesSeriesId||a.betaseriesId).map(a=>Number(a.id));
  ensureCatalogueIntegrity();
  await db.prepareMetadataTitleIndex();
  if(runtimeStopping)return;
  try{upgradeLocalCollection();}catch(error){console.warn('['+PRODUCT_RELEASE.publicVersion+'] Réparation locale différée :',error.message);}
  if (rescueMode.active) return; // No provider enrichment or startup seed in this prototype.
  if(process.env.ALM_MAINTENANCE_MODE!=='1')await startLibraryAutomation(legacyImportedIds);
  if(process.env.ALM_MAINTENANCE_MODE==='1')return;
  metadataStartupTimer = setTimeout(() => {
    metadataStartupTimer = null;
    if (runtimeStopping) return;
    try {
      const config = readConfig();
      if (config.preloadMetadataOnStart !== false) {
        almMetadataPreload({ silent: true, syncRemote: false, syncAutonomous: false }).then(() => {
          if (runtimeStopping) return;
          // Après preload, si toujours vide → auto-seed depuis cache Jikan
          const stats = db.getMetadataStats ? db.getMetadataStats() : { count: 0 };
          if (Number(stats.count || 0) < 10) autoSeedMetadataFromCache();
        }).catch(error => {
          writeMetadataPreloadStatus({ ok: false, status: "error", error: error.message });
          // Fallback : auto-seed quand même
          autoSeedMetadataFromCache();
        });
      } else {
        autoSeedMetadataFromCache();
      }
    } catch (error) {
      writeMetadataPreloadStatus({ ok: false, status: "error", error: error.message });
      autoSeedMetadataFromCache();
    }
  }, 1200);
}).catch(error => {
  writeMetadataPreloadStatus({ ok: false, status: "db-error", error: error.message });
});

if (require.main === module) {
  startServer(PORT).catch(error => {
    console.error("Impossible de lancer Anime Local Manager :", error.message);
    process.exitCode = 1;
  });
}

app.get('/api/support-diagnostic',async(_req,res)=>{res.set('Cache-Control','no-store');try{await db.whenReady();const storage=db.storageStatus(),m=maintenance.state(),integrity=storageMaintenance.integrity(),library=db.getAllAnimes(),local=require('./lib/diagnostics').diagnostics(__dirname,storage,library,RSS_SOURCES,{items:completionIssueItems(library),awaiting:completionAwaitingItems(library)});res.json({...local,services:serviceHealth.list(),version:PRODUCT_RELEASE.technicalVersion,releaseChannel:PRODUCT_RELEASE.distributionChannel,runtime:{node:process.versions.node,electron:process.versions.electron,platform:process.platform,arch:process.arch},storage:{engine:storage.engine,ready:storage.ready,mirrorPending:storage.mirrorPending,integrity:integrity.result,integrityAt:integrity.at},counts:{collection:db.getAllAnimes().length,catalogue:db.getMetadataCount()},maintenance:{enabled:m.settings.enabled,running:m.running,reason:m.reason,tasks:Object.fromEntries(Object.entries(m.tasks).map(([key,value])=>[key,{phase:value.phase,lastSuccess:value.lastSuccess}]))}});}catch{res.status(503).json({code:'ALM_DIAGNOSTIC_FAILED'});}});

app.get("/api/diagnostics", async (req, res) => {
  try {
    await db.whenReady();
    const {diagnostics} = require("./lib/diagnostics");
    res.json(diagnostics(__dirname, db.storageStatus(), db.getAllAnimes(), RSS_SOURCES, {items:completionIssueItems(),awaiting:completionAwaitingItems()}));
  } catch (error) { res.status(500).json({error:"Diagnostic unavailable", code:"ALM_DIAGNOSTIC_FAILED"}); }
});

module.exports = {
  app,
  startServer,
  PORT,
  configureBackupSecrets:store=>backupManager.configureStorage(store),
  startReleaseNotifications:callback=>rescueMode.active ? Promise.resolve(rescueMode.skipped()) : releaseWatch.start(async item=>{notificationCenter.record({...item,malId:readAnimes().find(a=>a.id===item.animeId)?.malId});if(!notificationCenter.state().muted)await callback(item);return true;}),
  testNotification:async callback=>{notificationCenter.record({title:'Anime Local Manager'},'test');return !notificationCenter.state().muted&&callback?!!await callback({title:'Anime Local Manager',episode:1,source:'ALM · Test'}):false;},
  checkUpdates:(force,channel)=>versionCheck.check(force,channel),
  maintenanceState:()=>maintenance.state(),
  configureMaintenance:input=>maintenance.configure(input),
  runMaintenance:options=>maintenance.run(options),
  configureMaintenanceUpdate:callback=>{maintenanceUpdate=callback; if (!rescueMode.active) maintenance.start();},
  prepareUpdateBackup:async()=>{await db.whenReady();const directory=path.join(DATA_DIR,'update-recovery');fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'library-'+Date.now()+'.json');require('./lib/atomic-file').atomicJson(file,createBackupPayload());return {ok:true,file};},
  closeCommunity:()=>community.close(),
  stopMaintenance:()=>maintenance.stop(),
  stopBackups:()=>{runtimeStopping=true;automation.stop();clearTimeout(automationRetryTimer);clearTimeout(metadataStartupTimer);metadataStartupTimer=null;clearTimeout(_mediaReviewAliasRefreshTimer);_mediaReviewAliasRefreshTimer=null;backupManager.stop();releaseWatch.stop();},
  __test: {
    mergeAutoInfo,
    runWithConcurrency, parseMalXml, createBackupPayload, readConfig,
    mediaReviewFindSelectedCandidateIndex, mediaReviewMergeSelectedCandidate,
    readAnimes,writeAnimes,writeCompletionAnimes,linkSeasonFamily,
    betaseriesWatchedCount,
    applyBetaSeriesProgressLogic,
    buildAnimeFromBetaSeries,
    parseCsv,
    validNewsDateInput,
    canonicalNewsUrl,
    parseNewsPublishedDate,
    normalizeNewsHistoryItem,
    filterNewsItemsInMemory,
    normalizeNewsRetentionDays,
    resolveAnimePeople,
    resolvePeopleRecommendations,
    fetchAniListPersonWorks,
    recoPersonLookupScore,
    animeInfoCompleteness,
    animeFullCompleteness,
    animeCompletionSignature,
    autoCompletionAttemptIsCurrent,
    isMinorCompletionGapForBanner,
    isBetaSeriesProvisionalSeasonForBanner,
    hasCompletionIssue,
    isAnimeFeatureEligible,
    seasonScanProgressPayload,
    mediaReviewFoundReliability,
    fetchAniListSeasonRelationsBatch,
    betaSeriesSeasonEntryFromCandidate,
    resolveProvisionalSeasonInfo,
    exactLocalCompletion,
    betaSeriesChooseDirectSequel,
    betaSeriesNextLinkedEntry,
    betaSeriesUnresolvedTargetAnime,
    betaSeriesUnresolvedOverflowAnimes,
    expandBetaSeriesProgressItems,
    repairAnimeLibrary,
    mergeImportedAnime,
    manualAddLooksLikeSeasonContinuation,
    manualAddNextSeasonNumber,
    manualAddDirectSequel,
    manualAddSeasonSearchTitle,
    mergeDuplicateAnimeRecords
  }
};
