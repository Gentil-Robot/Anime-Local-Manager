/**
 * db.js — Couche SQLite portable pour Anime Local Manager v2.0
 *
 * Version rebuild complet : suppression de la dépendance SQLite native.
 * Utilise sql.js, SQLite compilé en WebAssembly, donc aucune compilation native,
 * aucun node-gyp, aucun Visual Studio/MSVC requis pour npm install.
 *
 * Le fichier SQLite est persisté dans data/animes.sqlite.
 * Un animes.json est aussi conservé comme sauvegarde lisible/compatible.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { atomicWrite, atomicJson } = require("./lib/atomic-file");

let SQL = null;
let _db = null;
let _dbPath = null;
let _jsonFile = null;
let _jsonCache = null;
let _jsonCacheStamp = "";
let _newsJsonFile = null;
let _newsJsonCache = null;
let _ready = null;
let _useJson = false;
let _dbSaveTimer = null;
let _mirrorTimer = null, _storageError = "", _hasSearchIndex = false;
let titleIndex=null,titleIndexRevision=0,titleIndexPending=null,titleIndexWorker=null;
const titleSearchCache=new Map();
function invalidateMetadataTitleIndex(){titleIndexRevision++;titleIndex=null;titleSearchCache.clear();}
function getMetadataRevision(){return titleIndexRevision;}
function getMetadataTitleSignature(){return titleIndex?.signature||'';}
async function prepareMetadataTitleIndex(){
 await whenReady();
 if(_useJson||!_db)return false;
 if(titleIndex)return true;
 if(titleIndexPending){await titleIndexPending;return !!titleIndex;}
 const revision=titleIndexRevision;
 const rows=_all('SELECT * FROM metadata').map(_rowToMetadata).filter(Boolean);
 titleIndexPending=new Promise(resolve=>{
  const worker=new (require('node:worker_threads').Worker)(path.join(__dirname,'lib/catalogue-index-worker.js'),{workerData:{rows}});titleIndexWorker=worker;
  let settled=false;const finish=value=>{if(settled)return;settled=true;titleIndexWorker=null;resolve(value);};
  worker.once('message',value=>{if(revision===titleIndexRevision)titleIndex={...value,rows};finish(!!titleIndex);});
  worker.once('error',()=>finish(false));worker.once('exit',()=>finish(!!titleIndex));
 });
 try{return await titleIndexPending;}finally{titleIndexPending=null;}
}
function indexedTitleSearch(q,limit,tokens){
 if(!titleIndex)return null;
 const key=JSON.stringify([q,limit,tokens]);if(titleSearchCache.has(key))return titleSearchCache.get(key);
 const rows=require('./lib/catalogue-title-index').search(titleIndex,q,limit,tokens);
 if(titleSearchCache.size>=1500)titleSearchCache.delete(titleSearchCache.keys().next().value);
 titleSearchCache.set(key,rows);return rows;
}

function _sqlJsDistCandidates() {
  const candidates = [];
  const add = (dir) => {
    if (dir && !candidates.includes(dir)) candidates.push(dir);
  };

  try { add(path.dirname(require.resolve("sql.js/dist/sql-wasm.wasm"))); } catch {}
  try { add(path.dirname(require.resolve("sql.js/dist/sql-wasm.js"))); } catch {}
  try { add(path.join(path.dirname(require.resolve("sql.js")), "dist")); } catch {}

  add(path.join(__dirname, "node_modules", "sql.js", "dist"));

  if (process.resourcesPath) {
    add(path.join(process.resourcesPath, "app", "node_modules", "sql.js", "dist"));
    add(path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sql.js", "dist"));
    add(path.join(process.resourcesPath, "node_modules", "sql.js", "dist"));
  }

  return candidates;
}

function _locateSqlJsFile(file) {
  for (const dir of _sqlJsDistCandidates()) {
    const candidate = path.join(dir, file);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return file;
}

function initDb(dataDir) {
  if (_ready) return _ready;
  _jsonFile = path.join(dataDir, "animes.json");
  _newsJsonFile = path.join(dataDir, "news-history.json");
  _dbPath = path.join(dataDir, "animes.sqlite");
  fs.mkdirSync(dataDir, { recursive: true });

  _ready = (async () => {
    // Refuse to start from an invalid JSON library, even if SQLite is present:
    // do not create a new empty SQL file and later overwrite recovery evidence.
    let initial = null;
    if (fs.existsSync(_jsonFile)) {
      initial = JSON.parse(fs.readFileSync(_jsonFile, "utf8"));
      validateLibraryJson(initial);
    }
    let nativeRequested=false;
    try {
      if (process.env.ALM_SQLJS_ONLY !== '1') {
        try { require('node:sqlite'); } catch { process.env.ALM_SQLJS_ONLY = '1'; }
      }
      if (process.env.ALM_SQLJS_ONLY !== '1') {
        nativeRequested=true;
        _db = new (require('./lib/sqlite-disk').DiskDatabase)(dataDir);
        _dbPath = _db.file;
      } else {
        const initSqlJs = require("sql.js");
        SQL = await initSqlJs({locateFile: file => _locateSqlJsFile(file)});
        _db = fs.existsSync(_dbPath) ? new SQL.Database(fs.readFileSync(_dbPath)) : new SQL.Database();
      }

      _createSchema();

      // Important : l'import metadata embarqué peut être volumineux.
      // S'il échoue, on ne doit jamais faire tomber toute la couche SQLite
      // en mode JSON, sinon l'application perd le cache SQL et devient très lente.
      try {
        _seedMetadataFromBundledSql();
      } catch (seedErr) {
        console.warn("[db] Metadata seed ignoré, SQLite reste actif :", seedErr.message);
      }

      // Les actions interactives peuvent persister immédiatement animes.json et
      // différer l'export SQL.js volumineux. Après un arrêt brutal, ce JSON plus
      // récent devient la source de vérité au prochain démarrage.
      if (!_db.disk || _db.migrated || !fs.existsSync(_jsonFile + ".revision.json")) _syncAnimesFromJsonIfNewer();
      _migrateFromJson();
      _buildCatalogIndexes();
      if (_db.disk) {
        const current = getAllAnimes();
        if (!fs.existsSync(_jsonFile + ".revision.json") || JSON.stringify(initial) !== JSON.stringify(current)) {
          try { _writeJson(current); _storageError = ''; }
          catch (error) { _storageError = String(error.code || error.message); console.warn('[db] Recovery mirror unavailable:', error.message); }
        }
      }
      _saveDb();
      console.log("[db] SQLite initialisé :", _dbPath);
    } catch (err) {
      console.warn("[db] sql.js non disponible — mode JSON de secours activé :", err.message);
      if (nativeRequested || _db?.disk) {
        try { _db?.close(); } finally { _db = null; }
        throw err;
      }
      _useJson = true;
    }
  })();
  return _ready;
}

function whenReady() { return _ready || Promise.resolve(); }
function isReady() { return _useJson || !!_db; }

function _buildCatalogIndexes(){
 if(!_db?.disk)return;
 const native=_db.native;
 const auxiliaryReady=getMetadataSyncValue('auxiliaryIndexVersion')==='1';
 native.exec('BEGIN IMMEDIATE');
 try {
 for(const field of ['genres','studios']){
   const exists=native.prepare("SELECT 1 FROM catalog.sqlite_master WHERE name=?").get('metadata_'+field);
  native.exec(`CREATE TABLE IF NOT EXISTS catalog.metadata_${field}(malId INTEGER NOT NULL,name TEXT NOT NULL,PRIMARY KEY(name,malId));
   CREATE INDEX IF NOT EXISTS catalog.idx_${field}_anime ON metadata_${field}(malId);
   CREATE TRIGGER IF NOT EXISTS catalog.meta_${field}_insert AFTER INSERT ON metadata BEGIN INSERT OR IGNORE INTO metadata_${field} SELECT NEW.malId,value FROM json_each(NEW.${field}) WHERE type='text'; END;
   CREATE TRIGGER IF NOT EXISTS catalog.meta_${field}_update AFTER UPDATE OF ${field} ON metadata BEGIN DELETE FROM metadata_${field} WHERE malId=OLD.malId; INSERT OR IGNORE INTO metadata_${field} SELECT NEW.malId,value FROM json_each(NEW.${field}) WHERE type='text'; END;
   CREATE TRIGGER IF NOT EXISTS catalog.meta_${field}_delete AFTER DELETE ON metadata BEGIN DELETE FROM metadata_${field} WHERE malId=OLD.malId; END;`);
   if(!exists||!auxiliaryReady)native.exec(`DELETE FROM catalog.metadata_${field}; INSERT OR IGNORE INTO catalog.metadata_${field} SELECT m.malId,j.value FROM catalog.metadata m,json_each(m.${field}) j WHERE j.type='text'`);
 }
  native.exec("CREATE INDEX IF NOT EXISTS catalog.idx_meta_year ON metadata(substr(startDate,1,4),malId)");
  _run("INSERT OR REPLACE INTO metadata_sync(key,value) VALUES(?,?)",["auxiliaryIndexVersion","1"]);
  native.exec("COMMIT");
 }catch(error){try{native.exec("ROLLBACK");}catch{}throw error;}
  try{
   native.exec("BEGIN IMMEDIATE");
   const searchExists=native.prepare("SELECT 1 FROM catalog.sqlite_master WHERE name='metadata_search'").get();
  native.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS catalog.metadata_search USING fts5(title,titleEn,titleRomaji,synonyms,content='metadata',content_rowid='malId',tokenize='trigram');
   CREATE TRIGGER IF NOT EXISTS catalog.meta_search_insert AFTER INSERT ON metadata BEGIN INSERT INTO metadata_search(rowid,title,titleEn,titleRomaji,synonyms) VALUES(NEW.malId,NEW.title,NEW.titleEn,NEW.titleRomaji,NEW.synonyms); END;
   CREATE TRIGGER IF NOT EXISTS catalog.meta_search_delete AFTER DELETE ON metadata BEGIN INSERT INTO metadata_search(metadata_search,rowid,title,titleEn,titleRomaji,synonyms) VALUES('delete',OLD.malId,OLD.title,OLD.titleEn,OLD.titleRomaji,OLD.synonyms); END;
   CREATE TRIGGER IF NOT EXISTS catalog.meta_search_update AFTER UPDATE ON metadata BEGIN INSERT INTO metadata_search(metadata_search,rowid,title,titleEn,titleRomaji,synonyms) VALUES('delete',OLD.malId,OLD.title,OLD.titleEn,OLD.titleRomaji,OLD.synonyms); INSERT INTO metadata_search(rowid,title,titleEn,titleRomaji,synonyms) VALUES(NEW.malId,NEW.title,NEW.titleEn,NEW.titleRomaji,NEW.synonyms); END;`);
   if(!searchExists||getMetadataSyncValue('ftsIndexVersion')!=='1')native.exec("INSERT INTO catalog.metadata_search(metadata_search) VALUES('rebuild')");
   _run("INSERT OR REPLACE INTO metadata_sync(key,value) VALUES(?,?)",["ftsIndexVersion","1"]);
   native.exec("COMMIT");
  _hasSearchIndex=true;
  }catch(error){try{native.exec('ROLLBACK');}catch{} _hasSearchIndex=false;console.warn('[db] Search index unavailable; bounded LIKE fallback:',error.message);}
}

function _createSchema() {
  if (!_db) return;
  _db.run(`
    CREATE TABLE IF NOT EXISTS animes (
      id      INTEGER PRIMARY KEY,
      title   TEXT    NOT NULL DEFAULT '',
      status  TEXT    NOT NULL DEFAULT '',
      score   REAL    DEFAULT NULL,
      malId   TEXT    DEFAULT '',
      data    TEXT    NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_status ON animes(status);
    CREATE INDEX IF NOT EXISTS idx_title  ON animes(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_malId  ON animes(malId);
    CREATE INDEX IF NOT EXISTS idx_malId_integer ON animes(CAST(malId AS INTEGER));

    CREATE TABLE IF NOT EXISTS metadata (
      malId       INTEGER PRIMARY KEY,
      title       TEXT,
      titleEn     TEXT,
      titleRomaji TEXT,
      synonyms    TEXT NOT NULL DEFAULT '[]',
      genres      TEXT NOT NULL DEFAULT '[]',
      episodes    INTEGER,
      score       REAL,
      type        TEXT,
      studios     TEXT NOT NULL DEFAULT '[]',
      imageUrl    TEXT NOT NULL DEFAULT '',
      synopsis    TEXT NOT NULL DEFAULT '',
      startDate   TEXT NOT NULL DEFAULT '',
      endDate     TEXT NOT NULL DEFAULT '',
      rank        INTEGER,
      popularity  INTEGER,
      members     INTEGER,
      rating      TEXT NOT NULL DEFAULT '',
      duration    TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_meta_title        ON metadata(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_meta_titleEn      ON metadata(titleEn COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_meta_titleRomaji  ON metadata(titleRomaji COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_meta_catalog_popular ON metadata(members DESC, score DESC, malId);
    CREATE INDEX IF NOT EXISTS idx_meta_catalog_score ON metadata(score DESC, members DESC, malId);
    CREATE INDEX IF NOT EXISTS idx_meta_catalog_recent ON metadata(startDate DESC, malId);

    CREATE TABLE IF NOT EXISTS metadata_sync (
      key       TEXT PRIMARY KEY,
      value     TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS news_history (
      newsKey      TEXT PRIMARY KEY,
      externalId   TEXT NOT NULL DEFAULT '',
      title        TEXT NOT NULL DEFAULT '',
      summary      TEXT NOT NULL DEFAULT '',
      articleUrl   TEXT NOT NULL DEFAULT '',
      imageUrl     TEXT NOT NULL DEFAULT '',
      publishedAt  TEXT DEFAULT NULL,
      discoveredAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source       TEXT NOT NULL DEFAULT '',
      lang         TEXT NOT NULL DEFAULT '',
      category     TEXT NOT NULL DEFAULT 'divers',
      dateStatus   TEXT NOT NULL DEFAULT 'unknown'
    );
    CREATE INDEX IF NOT EXISTS idx_news_published ON news_history(publishedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_news_discovered ON news_history(discoveredAt DESC);
    CREATE INDEX IF NOT EXISTS idx_news_lang ON news_history(lang);
    CREATE INDEX IF NOT EXISTS idx_news_category ON news_history(category);
    CREATE INDEX IF NOT EXISTS idx_news_source ON news_history(source COLLATE NOCASE);
  `);

  // Les anciennes bases locales pouvaient déjà contenir metadata avec le schéma v1.
  // CREATE TABLE IF NOT EXISTS n'ajoute pas les nouvelles colonnes : on les ajoute
  // en douceur pour que les snapshots v2 embarqués s'importent sans manipulation.
  const metadataExtraColumns = [
    ["imageUrl",   "ALTER TABLE metadata ADD COLUMN imageUrl TEXT NOT NULL DEFAULT ''"],
    ["synopsis",   "ALTER TABLE metadata ADD COLUMN synopsis TEXT NOT NULL DEFAULT ''"],
    ["startDate",  "ALTER TABLE metadata ADD COLUMN startDate TEXT NOT NULL DEFAULT ''"],
    ["endDate",    "ALTER TABLE metadata ADD COLUMN endDate TEXT NOT NULL DEFAULT ''"],
    ["rank",       "ALTER TABLE metadata ADD COLUMN rank INTEGER"],
    ["popularity", "ALTER TABLE metadata ADD COLUMN popularity INTEGER"],
    ["members",    "ALTER TABLE metadata ADD COLUMN members INTEGER"],
    ["rating",     "ALTER TABLE metadata ADD COLUMN rating TEXT NOT NULL DEFAULT ''"],
    ["duration",   "ALTER TABLE metadata ADD COLUMN duration TEXT NOT NULL DEFAULT ''"]
  ];

  for (const [name, sql] of metadataExtraColumns) {
    try { _run(sql); }
    catch (error) {
      if (!/duplicate column/i.test(String(error.message || ""))) {
        console.warn(`[db] Colonne metadata ${name} non ajoutée :`, error.message);
      }
    }
  }
}

function _syncAnimesFromJsonIfNewer() {
  if (!_db || !_jsonFile || !fs.existsSync(_jsonFile)) return false;
  try {
    const jsonStat = fs.statSync(_jsonFile);
    const dbStat = _dbPath && fs.existsSync(_dbPath) ? fs.statSync(_dbPath) : null;
    if (_db.disk && !_db.migrated && dbStat) return false;
    if (dbStat && jsonStat.mtimeMs < (_db.disk ? _db.legacyStamp : dbStat.mtimeMs)) return false;
    const raw = JSON.parse(fs.readFileSync(_jsonFile, "utf8"));
    if (!Array.isArray(raw)) return false;
    _db.run("BEGIN TRANSACTION");
    _run("DELETE FROM animes");
    for (const anime of raw) _upsertRow(anime);
    _db.run("COMMIT");
    console.log(`[db] Synchronisation JSON récente -> SQLite : ${raw.length} animés.`);
    return true;
  } catch (err) {
    try { _db.run("ROLLBACK"); } catch {}
    console.warn("[db] Synchronisation JSON récente ignorée :", err.message);
    return false;
  }
}

function _migrateFromJson() {
  if (!_db || (_db.disk && _db.libraryInitialized)) return;
  const count = _get("SELECT COUNT(*) AS n FROM animes").n || 0;
  if (count > 0 || !fs.existsSync(_jsonFile)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(_jsonFile, "utf8"));
    const items = Array.isArray(raw) ? raw : [];
    if (!items.length) return;
    _db.run("BEGIN TRANSACTION");
    for (const anime of items) _upsertRow(anime);
    _db.run("COMMIT");
    console.log(`[db] Migration JSON -> SQLite : ${items.length} animés importés.`);
  } catch (err) {
    try { _db.run("ROLLBACK"); } catch {}
    console.error("[db] Erreur migration JSON -> SQLite :", err.message);
  }
}

function _animeToRow(anime) {
  return {
    id: Number(anime.id) || null,
    title: String(anime.title || ""),
    status: String(anime.status || ""),
    score: anime.score !== "" && anime.score != null ? Number(anime.score) || null : null,
    malId: String(anime.malId || ""),
    data: JSON.stringify(anime || {})
  };
}

function _rowToAnime(row) {
  try { return JSON.parse(row.data || "{}"); }
  catch { return { id: row.id, title: row.title, status: row.status }; }
}

function _get(sql, params = []) {
  const stmt = _db.prepare(sql);
  try {
    stmt.bind(params);
    if (!stmt.step()) return {};
    return stmt.getAsObject();
  } finally { stmt.free(); }
}

function _all(sql, params = []) {
  const stmt = _db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}

function _run(sql, params = []) {
  const stmt = _db.prepare(sql);
  try { stmt.run(params); }
  finally { stmt.free(); }
}

function _upsertRow(anime) {
  const r = _animeToRow(anime);
  _run(
    `INSERT OR REPLACE INTO animes (id, title, status, score, malId, data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [r.id, r.title, r.status, r.score, r.malId, r.data]
  );
}

function _saveDb() {
  if (!_db || _useJson) return;
  if (_dbSaveTimer) { clearTimeout(_dbSaveTimer); _dbSaveTimer = null; }
  try {
    if (_db.disk) { _db.flush(); return; }
    atomicWrite(_dbPath, Buffer.from(_db.export()));
    _storageError = "";
  } catch (err) {
    _storageError = String(err.code || err.message);
    console.error("[db] sauvegarde SQLite :", err.message);
    throw err;
  }
}

function _scheduleDbSave(delayMs = 12000) {
  if (!_db || _useJson) return;
  if (_dbSaveTimer) clearTimeout(_dbSaveTimer);
  _dbSaveTimer = setTimeout(() => {
    _dbSaveTimer = null;
    // _saveDb records and logs the failure. A timer has no caller to receive
    // the exception; keep the durable JSON mirror and allow a later flush.
    try { _saveDb(); } catch {}
  }, Math.max(500, Number(delayMs) || 12000));
  _dbSaveTimer.unref?.();
}

function getAllAnimes() {
  if (_useJson || !_db) return _readJson();
  try { return _all("SELECT data FROM animes ORDER BY id").map(_rowToAnime); }
  catch { throw Error('ALM_LIBRARY_READ_FAILED'); }
}

function getAnimeById(id) {
  if (_useJson || !_db) return _readJson().find(a => Number(a.id) === Number(id)) || null;
  const row = _get("SELECT data FROM animes WHERE id = ?", [Number(id)]);
  return row && row.data ? _rowToAnime(row) : null;
}

function getAnimesByStatus(status) {
  if (_useJson || !_db) return _readJson().filter(a => a.status === status);
  return _all("SELECT data FROM animes WHERE status = ? ORDER BY title COLLATE NOCASE", [status]).map(_rowToAnime);
}

function searchAnimesByTitle(q) {
  const query = String(q || "").trim();
  if (!query) return getAllAnimes();
  if (_useJson || !_db) return _readJson().filter(a => normalizeT(a.title).includes(normalizeT(query)));
  return _all("SELECT data FROM animes WHERE title LIKE ? ORDER BY title COLLATE NOCASE LIMIT 100", [`%${query}%`]).map(_rowToAnime);
}

function persistLibraryMutation(change, options = {}) {
  _db.run("BEGIN TRANSACTION");
  let committed = false, result;
  try {
    result = change();
    if (!_db.disk) _writeJson(getAllAnimes());
    _db.run("COMMIT"); committed = true;
    if (_db.disk) {
      clearTimeout(_mirrorTimer);
      if(options.save!=='deferred'&&options.save!==false){_writeJson(getAllAnimes());_storageError='';return result;}
      _mirrorTimer = setTimeout(() => { _mirrorTimer=null; try { _writeJson(getAllAnimes()); _storageError=''; } catch(error){_storageError=String(error.code||error.message);console.error('[db] JSON recovery mirror:',error.message);} }, 2000);
      _mirrorTimer.unref?.();
    } else if (options.save === "memory") { /* Durable JSON mirror; skip the WASM export. */ }
    else if (options.save === "deferred" || options.save === false) _scheduleDbSave(options.delayMs);
    else _saveDb();
    return result;
  } catch (error) {
    if (!committed) try { _db.run("ROLLBACK"); } catch {}
    _storageError = String(error.code || error.message);
    if(committed&&_db.disk){console.error("[db] Durable SQL committed; recovery mirror degraded:",error.message);return result;}
    throw error;
  }
}

function insertAnime(anime, options = {}) {
  if (_useJson || !_db) {
    const arr = _readJson();
    if (!anime.id) anime.id = arr.reduce((m,a)=>Math.max(m,Number(a.id)||0),0)+1;
    arr.push(anime); _writeJson(arr); return anime;
  }
  return persistLibraryMutation(() => {
    if (!anime.id) anime.id = (_get("SELECT MAX(id) AS m FROM animes").m || 0)+1;
    _upsertRow(anime); return anime;
  }, options);
}
function updateAnime(id, anime, options = {}) {
  const current=getAnimeById(id);
  if (!current) throw new Error("Anime not found");
  const merged={...current,...anime,id:Number(id)};
  if (_useJson || !_db) {
    const arr=_readJson();const i=arr.findIndex(a=>Number(a.id)===Number(id));
    arr[i]=merged;_writeJson(arr);return merged;
  }
  return persistLibraryMutation(()=>{_upsertRow(merged);return merged;},options);
}
function deleteAnime(id, options = {}) {
  if (_useJson || !_db) { _writeJson(_readJson().filter(a=>Number(a.id)!==Number(id))); return true; }
  return persistLibraryMutation(()=>{_run("DELETE FROM animes WHERE id = ?",[Number(id)]);return true;},options);
}
function writeAllAnimes(animes) {
  if (!Array.isArray(animes)) throw new TypeError("Library must be an array");
  if (_useJson || !_db) { _writeJson(animes); return; }
  const previous = new Map(getAllAnimes().map(a=>[Number(a.id),a]));
  return persistLibraryMutation(()=>{
    const kept=new Set();
    for(const anime of animes){const id=Number(anime.id);kept.add(id);if(JSON.stringify(previous.get(id))!==JSON.stringify(anime))_upsertRow(anime);}
    for(const id of previous.keys())if(!kept.has(id))_run("DELETE FROM animes WHERE id=?",[id]);
  });
}

function getQuickStats() {
  if (_useJson || !_db) {
    const all = _readJson();
    return {
      total: all.length,
      completed: all.filter(a => a.status === "Completed").length,
      watching: all.filter(a => a.status === "Watching").length,
      plan: all.filter(a => a.status === "Plan to Watch").length
    };
  }
  try {
    const rows = _all("SELECT status, COUNT(*) AS n FROM animes GROUP BY status");
    const m = Object.fromEntries(rows.map(r => [r.status, Number(r.n) || 0]));
    const total = Number(_get("SELECT COUNT(*) AS n FROM animes").n) || 0;
    return { total, completed: m.Completed || 0, watching: m.Watching || 0, plan: m["Plan to Watch"] || 0 };
  } catch { return { total: 0, completed: 0, watching: 0, plan: 0 }; }
}


function _metadataSeedCandidates() {
  const files = [];
  const add = (file) => { if (file && !files.includes(file)) files.push(file); };

  const roots = [path.join(__dirname, "data", "database")];
  if (_dbPath) roots.push(path.join(path.dirname(_dbPath), "database"));

  const namesByPriority = [
    "metadata-full.sql.gz",
    "metadata-full.sql",
    "metadata-snapshot.sql.gz",
    "metadata-snapshot.sql",
    "metadata-seed.sql.gz",
    "metadata-seed.sql",
    "metadata.json.gz",
    "metadata.json"
  ];

  for (const name of namesByPriority) {
    for (const root of roots) add(path.join(root, name));
  }

  return files;
}

function _metadataManifestCandidates() {
  const files = [];
  const add = (file) => { if (file && !files.includes(file)) files.push(file); };
  const roots = [path.join(__dirname, "data", "database")];
  if (_dbPath) roots.push(path.join(path.dirname(_dbPath), "database"));
  for (const root of roots) add(path.join(root, "metadata-manifest.json"));
  return files;
}

function _readBundledMetadataManifest() {
  for (const file of _metadataManifestCandidates()) {
    try {
      if (!fs.existsSync(file)) continue;
      const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      const version = String(manifest?.version || "").trim();
      const rows = Math.max(0, Number(manifest?.full?.rows || 0));
      const relativeSnapshot = String(manifest?.full?.url || "").trim();
      const snapshotFile = relativeSnapshot ? path.resolve(path.dirname(file), relativeSnapshot) : "";
      return { file, manifest, version, rows, snapshotFile };
    } catch (error) {
      console.warn("[db] Manifest metadata ignoré :", error.message);
    }
  }
  return null;
}

function _readMaybeGzip(filePath) {
  const buffer = fs.readFileSync(filePath);
  const isGzip = filePath.toLowerCase().endsWith(".gz") || (buffer[0] === 0x1f && buffer[1] === 0x8b);
  return (isGzip ? zlib.gunzipSync(buffer) : buffer).toString("utf8").replace(/^\uFEFF/, "");
}

function _seedMetadataFromBundledSql() {
  if (!_db || _useJson) return;
  try {
    const currentCount = getMetadataCount();
    const bundled = _readBundledMetadataManifest();
    const expectedRows = Math.max(0, Number(bundled?.rows || 0));
    const bundledVersion = String(bundled?.version || "").trim();
    const installedVersion = getMetadataSyncValue("bundledMetadataVersion", "");

    // Les anciennes versions arrêtaient l'import dès qu'une seule fiche metadata
    // existait. Une base partielle de quelques centaines de lignes empêchait donc
    // le snapshot complet (30k+) d'être installé lors d'une mise à jour, ce qui
    // rendait notamment les recommandations par genre vides.
    const versionAlreadyInstalled = Boolean(
      bundledVersion && installedVersion === bundledVersion &&
      (!expectedRows || currentCount >= expectedRows)
    );
    if (versionAlreadyInstalled) return;

    // Première exécution avec une base déjà complète mais sans marqueur de version :
    // ne pas refaire inutilement l'import, seulement mémoriser le snapshot présent.
    if (!installedVersion && expectedRows > 0 && currentCount >= expectedRows) {
      setMetadataSyncValues({
        bundledMetadataVersion: bundledVersion || `rows-${expectedRows}`,
        bundledMetadataRows: String(expectedRows),
        bundledMetadataImportedAt: new Date().toISOString()
      }, { save: false });
      return;
    }

    if (!bundled && currentCount > 0) return;
    const file = (bundled?.snapshotFile && fs.existsSync(bundled.snapshotFile))
      ? bundled.snapshotFile
      : _metadataSeedCandidates().find(f => fs.existsSync(f));
    if (!file) return;

    if (/\.sql(\.gz)?$/i.test(file)) {
      const result = importMetadataSql(_readMaybeGzip(file), { save: false });
      if (result?.ok) {
        setMetadataSyncValues({
          bundledMetadataVersion: bundledVersion || path.basename(file),
          bundledMetadataRows: String(expectedRows || result.after || 0),
          bundledMetadataImportedAt: new Date().toISOString()
        }, { save: false });
        console.log(`[db] Metadata seed SQL importé/mis à niveau : ${result.after} fiches.`);
      }
      return;
    }

    if (/\.json(\.gz)?$/i.test(file)) {
      const payload = JSON.parse(_readMaybeGzip(file));
      const rows = Array.isArray(payload) ? payload : (Array.isArray(payload.items) ? payload.items : payload.data);
      const result = importMetadataRows(rows, { save: false });
      if (result?.ok) {
        setMetadataSyncValues({
          bundledMetadataVersion: bundledVersion || path.basename(file),
          bundledMetadataRows: String(expectedRows || result.after || 0),
          bundledMetadataImportedAt: new Date().toISOString()
        }, { save: false });
        console.log(`[db] Metadata seed JSON importé/mis à niveau : ${result.after} fiches.`);
      }
    }
  } catch (err) {
    console.warn("[db] Metadata seed ignoré :", err.message);
  }
}

function _jsonArrayValueToString(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.name || value.title || value.english || value.romaji || value.node?.name || value.node?.title || "").trim();
  }
  return String(value || "").trim();
}

function _jsonArrayText(value, splitStrings = false) {
  if (value == null || value === "") return "[]";

  if (Array.isArray(value)) {
    return JSON.stringify(Array.from(new Set(value.map(_jsonArrayValueToString).filter(Boolean))));
  }

  if (typeof value === "object") {
    const single = _jsonArrayValueToString(value);
    return single ? JSON.stringify([single]) : JSON.stringify(value);
  }

  const text = String(value || "").trim();
  if (!text) return "[]";

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return _jsonArrayText(parsed);
      return JSON.stringify(parsed);
    } catch {}
  }

  if (splitStrings) {
    const parts = text.split(/[,;|]/g).map(v => v.trim()).filter(Boolean);
    return JSON.stringify(parts.length ? Array.from(new Set(parts)) : [text]);
  }

  return JSON.stringify([text]);
}

function _parseJsonArrayText(text) {
  if (Array.isArray(text)) return text;
  try {
    const parsed = JSON.parse(text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _metadataInputToRow(input) {
  const row = input || {};
  const malId = Number(row.malId ?? row.mal_id ?? row.malID ?? row.id);
  if (!Number.isFinite(malId) || malId <= 0) return null;

  const title = String(row.title ?? row.name ?? row.canonicalTitle ?? "").trim();
  const titleEn = String(row.titleEn ?? row.title_en ?? row.englishTitle ?? row.title_english ?? row.titleEnglish ?? "").trim();
  const titleRomaji = String(row.titleRomaji ?? row.title_romaji ?? row.romajiTitle ?? row.titleRomajiEn ?? "").trim();

  const images = row.images || row.image || {};
  const imageUrl = String(
    row.imageUrl ?? row.image_url ?? row.poster ?? row.coverImage ??
    images?.jpg?.large_image_url ?? images?.jpg?.image_url ?? images?.webp?.large_image_url ?? images?.webp?.image_url ??
    images?.large ?? images?.medium ?? images?.original ?? ""
  ).trim();
  const startDate = String(row.startDate ?? row.start_date ?? row.aired?.from ?? row.airedFrom ?? "").slice(0, 10);
  const endDate = String(row.endDate ?? row.end_date ?? row.aired?.to ?? row.airedTo ?? "").slice(0, 10);

  return {
    malId,
    title: title || titleEn || titleRomaji,
    titleEn,
    titleRomaji,
    synonyms: _jsonArrayText(row.synonyms ?? row.aliases ?? row.titles ?? row.titleSynonyms ?? row.title_synonyms),
    genres: _jsonArrayText(row.genres, true),
    episodes: row.episodes === "" || row.episodes == null ? null : (Number(row.episodes) || null),
    score: row.score === "" || row.score == null ? null : (Number(row.score) || null),
    type: String(row.type || row.mediaType || "").trim(),
    studios: _jsonArrayText(row.studios, true),
    imageUrl,
    synopsis: String(row.synopsis ?? row.description ?? row.summary ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    startDate,
    endDate,
    rank: row.rank === "" || row.rank == null ? null : (Number(row.rank) || null),
    popularity: row.popularity === "" || row.popularity == null ? null : (Number(row.popularity) || null),
    members: row.members === "" || row.members == null ? null : (Number(row.members) || null),
    rating: String(row.rating || "").trim(),
    duration: String(row.duration || "").trim()
  };
}

function _rowToMetadata(row) {
  if (!row || !Number.isSafeInteger(Number(row.malId)) || Number(row.malId) < 1) return null;
  return {
    malId: Number(row.malId) || null,
    title: row.title || "",
    titleEn: row.titleEn || "",
    titleRomaji: row.titleRomaji || "",
    synonyms: _parseJsonArrayText(row.synonyms),
    genres: _parseJsonArrayText(row.genres),
    episodes: row.episodes == null ? null : Number(row.episodes),
    score: row.score == null ? null : Number(row.score),
    type: row.type || "",
    studios: _parseJsonArrayText(row.studios),
    imageUrl: row.imageUrl || "",
    synopsis: row.synopsis || "",
    startDate: row.startDate || "",
    endDate: row.endDate || "",
    rank: row.rank == null ? null : Number(row.rank),
    popularity: row.popularity == null ? null : Number(row.popularity),
    members: row.members == null ? null : Number(row.members),
    rating: row.rating || "",
    duration: row.duration || ""
  };
}

function getMetadataCount() {
  if (_useJson || !_db) return 0;
  try { return Number(_get("SELECT COUNT(*) AS n FROM metadata").n) || 0; }
  catch { return 0; }
}

function getMetadataStats() {
  const seedFiles = _metadataSeedCandidates().filter(f => fs.existsSync(f));
  const count = getMetadataCount();
  let withImages = 0;
  let withSynopsis = 0;
  let withStartDate = 0;
  if (!_useJson && _db && count > 0) {
    try { withImages = Number(_get("SELECT COUNT(*) AS n FROM metadata WHERE imageUrl IS NOT NULL AND imageUrl <> ''").n) || 0; } catch {}
    try { withSynopsis = Number(_get("SELECT COUNT(*) AS n FROM metadata WHERE synopsis IS NOT NULL AND synopsis <> ''").n) || 0; } catch {}
    try { withStartDate = Number(_get("SELECT COUNT(*) AS n FROM metadata WHERE startDate IS NOT NULL AND startDate <> ''").n) || 0; } catch {}
  }
  return {
    ok: !_useJson && !!_db,
    count,
    withImages,
    withSynopsis,
    withStartDate,
    dbPath: _dbPath,
    seedFiles: seedFiles.map(f => path.basename(f)),
    seedPathExists: seedFiles.length > 0,
    sync: getMetadataSyncState()
  };
}

function getMetadataSyncValue(key, fallback = "") {
  if (_useJson || !_db) return fallback;
  const k = String(key || "").trim();
  if (!k) return fallback;
  try {
    const row = _get("SELECT value FROM metadata_sync WHERE key = ?", [k]);
    return row && row.value != null ? String(row.value) : fallback;
  } catch {
    return fallback;
  }
}

function setMetadataSyncValue(key, value, options = {}) {
  if (_useJson || !_db) return { ok: false, error: "SQLite indisponible" };
  const k = String(key || "").trim();
  if (!k) return { ok: false, error: "Clé metadata_sync vide" };
  try {
    _run(
      `INSERT OR REPLACE INTO metadata_sync (key, value, updatedAt) VALUES (?, ?, datetime('now'))`,
      [k, value == null ? "" : String(value)]
    );
    if (options.save !== false) _saveDb();
    return { ok: true, key: k };
  } catch (err) {
    return { ok: false, error: err.message, key: k };
  }
}

function setMetadataSyncValues(values, options = {}) {
  if (_useJson || !_db) return { ok: false, error: "SQLite indisponible" };
  const entries = Object.entries(values || {}).filter(([k]) => String(k || "").trim());
  try {
    _db.run("BEGIN TRANSACTION");
    for (const [key, value] of entries) {
      _run(
        `INSERT OR REPLACE INTO metadata_sync (key, value, updatedAt) VALUES (?, ?, datetime('now'))`,
        [String(key), value == null ? "" : String(value)]
      );
    }
    _db.run("COMMIT");
    if (options.save !== false) _saveDb();
    return { ok: true, updated: entries.length };
  } catch (err) {
    try { _db.run("ROLLBACK"); } catch {}
    return { ok: false, error: err.message, updated: 0 };
  }
}

function getMetadataSyncState() {
  if (_useJson || !_db) return {};
  try {
    const rows = _all("SELECT key, value, updatedAt FROM metadata_sync ORDER BY key COLLATE NOCASE");
    const state = {};
    for (const row of rows) {
      state[row.key] = row.value;
      state[`${row.key}UpdatedAt`] = row.updatedAt;
    }
    return state;
  } catch {
    return {};
  }
}

function importMetadataSql(sqlText, options = {}) {
  if (_useJson || !_db) return { ok: false, error: "SQLite indisponible" };
  const before = getMetadataCount();
  try {
    const {readMetadataSqlRows} = require('./lib/metadata-sql-data');
    // Validate completely before replacing anything; stream the second pass so
    // startup never retains a duplicate in-memory copy of the whole catalogue.
    for (const row of readMetadataSqlRows(sqlText)) { /* validation only */ }
    return importMetadataRows(() => readMetadataSqlRows(sqlText), options);
  } catch (error) {
    return {ok:false,error:error.message,before,after:getMetadataCount(),imported:0};
  }
}

function importMetadataRows(rows, options = {}) {
  if (_useJson || !_db) return { ok: false, error: "SQLite indisponible" };
  const rowFactory = typeof rows === 'function' ? rows : null;
  const items = rowFactory ? rowFactory() : Array.isArray(rows) ? rows : [];
  const before = getMetadataCount();
  let imported = 0;
  let skipped = 0;
  let stmt = null;
  let indexChanged=options.clear===true;const indexUpdates=[];

  try {
    if (options.clear === true && !rowFactory && (!items.length || items.some(raw => {const row=_metadataInputToRow(raw);return !row || !Number.isSafeInteger(row.malId) || !row.title;}))) throw Error("ALM_METADATA_INVALID_REPLACEMENT");
    _db.run("BEGIN TRANSACTION");
    if (options.clear === true) _db.run("DELETE FROM metadata");

    stmt = _db.prepare(`
      INSERT OR REPLACE INTO metadata
        (malId, title, titleEn, titleRomaji, synonyms, genres, episodes, score, type, studios,
         imageUrl, synopsis, startDate, endDate, rank, popularity, members, rating, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const raw of items) {
      const row = _metadataInputToRow(raw);
      if (!row || !row.title) { skipped++; continue; }
      const previous=_get('SELECT title,titleEn,titleRomaji,synonyms,type,episodes,startDate FROM metadata WHERE malId=?',[row.malId]);
      if(!previous||['title','titleEn','titleRomaji','synonyms','type','episodes','startDate'].some(key=>String(previous[key]??'')!==String(row[key]??'')))indexChanged=true;
      stmt.run([
        row.malId,
        row.title,
        row.titleEn,
        row.titleRomaji,
        row.synonyms,
        row.genres,
        row.episodes,
        row.score,
        row.type,
        row.studios,
        row.imageUrl,
        row.synopsis,
        row.startDate,
        row.endDate,
        row.rank,
        row.popularity,
        row.members,
        row.rating,
        row.duration
      ]);
      imported++;
      if (!indexChanged) indexUpdates.push(_rowToMetadata(row));
    }

    _db.run("COMMIT");
    const after = getMetadataCount();
    if(indexChanged)invalidateMetadataTitleIndex();else{
      if(titleIndex){const updates=new Map(indexUpdates.map(a=>[Number(a.malId),a]));titleIndex.rows=titleIndex.rows.map(row=>updates.get(Number(row.malId))||row);}
      titleSearchCache.clear();
    }
    if (options.save !== false) _saveDb();
    return { ok: true, before, after, imported, skipped };
  } catch (err) {
    try { _db.run("ROLLBACK"); } catch {}
    return { ok: false, error: err.message, before, after: getMetadataCount(), imported:0, skipped };
  } finally {
    if (stmt) stmt.free();
  }
}


// Bounded catalogue queries: only the current page enters the renderer.
function browseMetadata(options = {}) {
  if (_useJson || !_db) return {items:[],total:0,page:1,pageSize:48};
  const clauses=["m.title IS NOT NULL AND m.title <> ''"], params=[];
  const escapeLike=v=>String(v).replace(/[\\%_]/g, '\\$&');
  const q=String(options.q||'').trim().slice(0,160);
  if(q){
    const aliases=(options.aliasIds||[]).filter(v=>Number.isSafeInteger(Number(v))&&Number(v)>0).slice(0,200);
    if(_hasSearchIndex&&[...q].length>=3&&!aliases.length&&/^[\p{L}\p{N} ._-]+$/u.test(q)) {clauses.push('m.malId IN (SELECT rowid FROM metadata_search WHERE metadata_search MATCH ?)');params.push('\"'+q.replace(/\"/g,'\"\"')+'\"');}
    const hay="(COALESCE(m.title,'')||' '||COALESCE(m.titleEn,'')||' '||COALESCE(m.titleRomaji,'')||' '||COALESCE(m.synonyms,''))";
    clauses.push('('+hay+" LIKE ? ESCAPE '\\' COLLATE NOCASE"+(aliases.length?' OR m.malId IN ('+aliases.map(()=>'?').join(',')+')':'')+')');
    params.push('%'+escapeLike(q)+'%',...aliases);
  }
  if(/^\d{4}$/.test(String(options.year||''))){clauses.push('substr(m.startDate,1,4)=?');params.push(String(options.year));}
  if(/^\d{4}$/.test(String(options.decade||''))){const year=Number(options.decade);clauses.push('CAST(substr(m.startDate,1,4) AS INTEGER) BETWEEN ? AND ?');params.push(year,year+9);}
  for(const [key,column]of [['genre','genres'],['studio','studios']])if(options[key]){if(_db.disk){clauses.push(`EXISTS (SELECT 1 FROM metadata_${column} f WHERE f.malId=m.malId AND f.name=?)`);params.push(String(options[key]).slice(0,160));}else{clauses.push(`m.${column} LIKE ? ESCAPE '\\' COLLATE NOCASE`);params.push('%'+escapeLike(JSON.stringify(String(options[key]).slice(0,160)))+'%');}}
  if(options.type){clauses.push('m.type=?');params.push(String(options.type).slice(0,30));}
  if(options.hideOwned){clauses.push(`NOT EXISTS (SELECT 1 FROM animes a WHERE CAST(a.malId AS INTEGER)=m.malId) AND NOT EXISTS (SELECT 1 FROM animes a WHERE a.malId='' AND (a.title=m.title COLLATE NOCASE OR a.title=m.titleEn COLLATE NOCASE OR a.title=m.titleRomaji COLLATE NOCASE))`);}
  const orders={score:'m.score DESC, m.members DESC',recent:'m.startDate DESC',alphabetical:'m.title COLLATE NOCASE ASC',relevance:'m.members DESC, m.score DESC'};
  const where=clauses.join(' AND '), total=Number(_all('SELECT COUNT(*) AS n FROM metadata m WHERE '+where,params)[0]?.n)||0;
  const pageSize=48,page=Math.max(1,Math.min(Math.ceil(total/pageSize)||1,Math.floor(Number(options.page)||1)));
  const rows=_all('SELECT m.* FROM metadata m WHERE '+where+' ORDER BY '+(orders[options.sort]||orders.relevance)+', m.malId ASC LIMIT ? OFFSET ?',[...params,pageSize,(page-1)*pageSize]);
  return {items:rows.map(_rowToMetadata).filter(Boolean),total,page,pageSize};
}
let catalogFacetsCache=null;
function catalogFacets(){
  if(_useJson||!_db)return {years:[],genres:[],studios:[],types:[]};
  const count=getMetadataCount();if(catalogFacetsCache?.count===count&&catalogFacetsCache.until>Date.now())return catalogFacetsCache.value;
  const value={years:[],genres:[],studios:[],types:[]};
  value.years=_all("SELECT DISTINCT substr(startDate,1,4) AS year FROM metadata WHERE startDate GLOB '[12][0-9][0-9][0-9]-*' ORDER BY year DESC").map(r=>r.year);
  value.types=_all("SELECT DISTINCT type FROM metadata WHERE type<>'' AND type IS NOT NULL ORDER BY type").map(r=>r.type);
  for(const field of ['genres','studios']){const set=new Set();for(const row of _all('SELECT DISTINCT '+field+' AS valuesJson FROM metadata')){try{for(const v of JSON.parse(row.valuesJson))if(typeof v==='string'&&v.trim())set.add(v);}catch{}}value[field]=[...set].sort();}
  catalogFacetsCache={count,until:Date.now()+300000,value};return value;
}

function searchMetadataByTitle(q, limit = 20) {
  const query = String(q || "").trim();
  if (_useJson || !_db || !query) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const indexed=indexedTitleSearch(query,safeLimit,false);if(indexed)return indexed;
  const like = `%${query}%`;
  const prefix = `${query}%`;

  try {
    return _all(`
      SELECT malId, title, titleEn, titleRomaji, synonyms, genres, episodes, score, type, studios, imageUrl, synopsis, startDate, endDate, rank, popularity, members, rating, duration
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
          WHEN titleEn LIKE ? COLLATE NOCASE THEN 4
          WHEN titleRomaji LIKE ? COLLATE NOCASE THEN 5
          ELSE 6
        END,
        score DESC,
        title COLLATE NOCASE
      LIMIT ?
    `, [like, like, like, like, query, query, query, prefix, prefix, prefix, safeLimit]).map(_rowToMetadata).filter(Boolean);
  } catch {
    return [];
  }
}

function searchMetadataByTitleTokens(q, limit = 80) {
  const query = String(q || "").trim();
  if (_useJson || !_db || !query) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 160));
  const indexed=indexedTitleSearch(query,safeLimit,true);if(indexed)return indexed;
  const stop = new Set([
    "the","a","an","of","to","and","or","in","on","for","from","with","by","at","as","is","was","were","be","been","being",
    "that","this","these","those","it","its","my","your","his","her","their","our","i","you","he","she","they","we",
    "le","la","les","un","une","des","de","du","d","l","et","ou","dans","sur","pour","par","avec","est","sont","ete","etre",
    "anime","tv","movie","film","season","saison","part","partie","cour","episode","episodes"
  ]);
  const tokens = Array.from(new Set(query
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(v => v.trim())
    .filter(v => v.length >= 3 && !stop.has(v))))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, 8);

  if (tokens.length < 2) return [];

  try {
    const haystack = "(COALESCE(title,'') || ' ' || COALESCE(titleEn,'') || ' ' || COALESCE(titleRomaji,'') || ' ' || COALESCE(synonyms,''))";
    const clauses = tokens.map(() => `${haystack} LIKE ? COLLATE NOCASE`);
    const scoreExpr = tokens.map(() => `CASE WHEN ${haystack} LIKE ? COLLATE NOCASE THEN 1 ELSE 0 END`).join(" + ");
    const likeParams = tokens.map(token => `%${token}%`);
    const params = [...likeParams, ...likeParams, safeLimit];
    return _all(`
      SELECT malId, title, titleEn, titleRomaji, synonyms, genres, episodes, score, type, studios, imageUrl, synopsis, startDate, endDate, rank, popularity, members, rating, duration,
             (${scoreExpr}) AS tokenHits
      FROM metadata
      WHERE ${clauses.join(" OR ")}
      ORDER BY tokenHits DESC,
               CASE WHEN score IS NULL THEN 1 ELSE 0 END,
               score DESC,
               COALESCE(popularity, 999999999) ASC,
               title COLLATE NOCASE
      LIMIT ?
    `, params).map(_rowToMetadata).filter(Boolean);
  } catch {
    return [];
  }
}

function listMetadataByGenre(genre, limit = 120) {
  const query = String(genre || "").trim();
  if (_useJson || !_db || !query) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 120, 500));
  const exactJsonToken = `%"${query}"%`;

  try {
    return _all(`
      SELECT malId, title, titleEn, titleRomaji, synonyms, genres, episodes, score, type, studios, imageUrl, synopsis, startDate, endDate, rank, popularity, members, rating, duration
      FROM metadata
      WHERE genres LIKE ? COLLATE NOCASE
        AND title IS NOT NULL
        AND title <> ''
        AND (type IS NULL OR type = '' OR type IN ('TV', 'Movie', 'ONA', 'OVA', 'Special'))
      ORDER BY
        CASE WHEN score IS NULL THEN 1 ELSE 0 END,
        score DESC,
        COALESCE(popularity, 999999999) ASC,
        COALESCE(members, 0) DESC,
        title COLLATE NOCASE
      LIMIT ?
    `, [exactJsonToken, safeLimit]).map(_rowToMetadata).filter(Boolean);
  } catch {
    return [];
  }
}

// Offline ranking is explicitly labelled as a saved selection in the UI.
function getTopMetadata(limit = 100) {
  if (_useJson || !_db) return [];
  try { return _all(`SELECT * FROM metadata WHERE rank > 0 AND score > 0 AND title <> ''
    ORDER BY rank ASC, score DESC, malId ASC LIMIT ?`, [Math.max(1, Math.min(100, Number(limit) || 100))]).map(_rowToMetadata).filter(Boolean); }
  catch { return []; }
}

function listMetadataStudios(){
 if(_useJson||!_db)return [];
 const counts=new Map();for(const row of _all("SELECT studios FROM metadata WHERE score > 0 AND title <> ''")){
  const names=_parseJsonArrayText(row.studios);
  for(const name of new Set(names.filter(x=>typeof x==='string'&&x.trim())))counts.set(name,(counts.get(name)||0)+1);
 }
 return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name));
}
function getStudioMetadata(name){
 if(_useJson||!_db)return [];
 // Filter parsed studio identities, not substrings or licensing/producer credits.
 if(_db.disk)return _all("SELECT m.* FROM metadata m JOIN metadata_studios s ON s.malId=m.malId WHERE s.name=? AND m.score>0 AND m.title<>'' ORDER BY m.score DESC,m.rank ASC,m.malId ASC LIMIT 100",[name]).map(_rowToMetadata);
 return _all("SELECT * FROM metadata WHERE score > 0 AND studios LIKE ? ORDER BY score DESC, rank ASC, malId ASC",['%'+JSON.stringify(name).replace(/[%_]/g,'')+'%']).map(_rowToMetadata).filter(row=>row?.studios?.includes(name)).slice(0,100);
}

function listMetadataForCalendar(){if(_useJson||!_db)return [];return _all("SELECT * FROM metadata WHERE startDate >= ? AND startDate <= ? ORDER BY startDate LIMIT 1500",[new Date(Date.now()-120*86400000).toISOString().slice(0,10),new Date(Date.now()+365*86400000).toISOString().slice(0,10)]).map(_rowToMetadata).filter(Boolean);}

function getMetadataByMalId(malId) {
  if (_useJson || !_db) return null;
  const id = Number(malId);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    return _rowToMetadata(_get(`
      SELECT malId, title, titleEn, titleRomaji, synonyms, genres, episodes, score, type, studios, imageUrl, synopsis, startDate, endDate, rank, popularity, members, rating, duration
      FROM metadata WHERE malId = ?
    `, [id]));
  } catch {
    return null;
  }
}

function listMetadataForNews(limit = 60) {
  if (_useJson || !_db) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 60, 120));
  try {
    return _all(`
      SELECT malId, title, titleEn, titleRomaji, synonyms, genres, episodes, score, type, studios, imageUrl, synopsis, startDate, endDate, rank, popularity, members, rating, duration
      FROM metadata
      WHERE title IS NOT NULL AND title <> ''
      ORDER BY
        CASE
          WHEN startDate IS NOT NULL AND startDate <> '' AND date(startDate) >= date('now') THEN 0
          WHEN startDate IS NOT NULL AND startDate <> '' THEN 1
          ELSE 2
        END,
        CASE WHEN startDate IS NOT NULL AND startDate <> '' AND date(startDate) >= date('now') THEN date(startDate) END ASC,
        CASE WHEN startDate IS NOT NULL AND startDate <> '' THEN date(startDate) END DESC,
        COALESCE(popularity, 999999999) ASC,
        score DESC,
        title COLLATE NOCASE
      LIMIT ?
    `, [safeLimit]).map(_rowToMetadata).filter(Boolean);
  } catch {
    return [];
  }
}

function _newsIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function _newsKey(item) {
  const explicit = String(item?.newsKey || item?.key || "").trim();
  if (explicit) return explicit.slice(0, 180);
  const stable = String(item?.articleUrl || item?.id || "").trim()
    || `${String(item?.source || "").trim()}|${String(item?.title || "").trim()}|${String(item?.date || item?.publishedAt || "").slice(0, 10)}`;
  return crypto.createHash("sha256").update(stable || JSON.stringify(item || {})).digest("hex");
}

function _normalizeNewsLanguage(value) {
  const raw = String(value || "").trim();
  const low = raw.toLowerCase();
  if (low === "pt" || low === "pt-br") return "pt-BR";
  if (/^zh(?:-|$)/i.test(low)) return "zh-CN";
  return ["fr", "en", "ja", "es", "de"].includes(low) ? low : "";
}

function _newsInputToRow(item) {
  const now = new Date().toISOString();
  const publishedAt = _newsIsoDate(item?.publishedAt || item?.date);
  const discoveredAt = _newsIsoDate(item?.discoveredAt) || now;
  const updatedAt = _newsIsoDate(item?.updatedAt) || now;
  const title = String(item?.title || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!title) return null;
  return {
    newsKey: _newsKey(item),
    externalId: String(item?.id || item?.externalId || "").trim().slice(0, 500),
    title,
    summary: String(item?.summary || "").replace(/\s+/g, " ").trim().slice(0, 6000),
    articleUrl: String(item?.articleUrl || "").trim().slice(0, 3000),
    imageUrl: String(item?.imageUrl || "").trim().slice(0, 3000),
    publishedAt: publishedAt || null,
    discoveredAt,
    updatedAt,
    source: String(item?.source || "").replace(/\s+/g, " ").trim().slice(0, 240),
    lang: _normalizeNewsLanguage(item?.lang),
    category: String(item?.category || "divers").trim().slice(0, 80) || "divers",
    dateStatus: publishedAt ? "valid" : String(item?.dateStatus || "unknown").trim().slice(0, 40) || "unknown"
  };
}

function _rowToNewsItem(row) {
  if (!row) return null;
  return {
    newsKey: row.newsKey || "",
    id: row.externalId || row.newsKey || "",
    title: row.title || "",
    summary: row.summary || "",
    articleUrl: row.articleUrl || "",
    imageUrl: row.imageUrl || "",
    date: row.publishedAt || "",
    publishedAt: row.publishedAt || "",
    discoveredAt: row.discoveredAt || "",
    updatedAt: row.updatedAt || "",
    source: row.source || "",
    lang: row.lang || "",
    category: row.category || "divers",
    dateStatus: row.dateStatus || (row.publishedAt ? "valid" : "unknown"),
    dateIsEstimated: !row.publishedAt
  };
}

function _readNewsJson() {
  if (Array.isArray(_newsJsonCache)) return _newsJsonCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(_newsJsonFile, "utf8"));
    if (!Array.isArray(parsed)) throw Error('ALM_NEWS_JSON_FORMAT');
    const rows = parsed.map(_newsInputToRow);
    if (rows.some(row => !row)) throw Error('ALM_NEWS_JSON_FORMAT');
    _newsJsonCache = rows;
  } catch (error) {
    if (error.code !== 'ENOENT') throw Error('ALM_NEWS_JSON_READ_FAILED');
    _newsJsonCache = [];
  }
  return _newsJsonCache;
}

function _writeNewsJson(rows) {
  const next = Array.isArray(rows) ? rows : [];
  if (_newsJsonFile) atomicJson(_newsJsonFile, next);
  _newsJsonCache = next;
}

function _mergeNewsJsonRow(current, incoming) {
  if (!current) return incoming;
  const merged = { ...current };
  for (const field of ["externalId", "title", "articleUrl", "source", "lang", "category"]) {
    if (incoming[field]) merged[field] = incoming[field];
  }
  if (String(incoming.summary || "").length > String(current.summary || "").length) merged.summary = incoming.summary;
  if (incoming.imageUrl) merged.imageUrl = incoming.imageUrl;
  if (incoming.publishedAt) merged.publishedAt = incoming.publishedAt;
  merged.discoveredAt = current.discoveredAt || incoming.discoveredAt;
  merged.updatedAt = incoming.updatedAt || new Date().toISOString();
  merged.dateStatus = merged.publishedAt ? "valid" : (incoming.dateStatus || current.dateStatus || "unknown");
  return merged;
}

function _filterNewsJsonRows(rows, options = {}) {
  const lang = _normalizeNewsLanguage(options.lang) || "all";
  const category = String(options.category || "all").toLowerCase();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(options.from || "")) ? String(options.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(options.to || "")) ? String(options.to) : "";
  return rows.filter(row => {
    if (lang !== "all" && row.lang !== lang) return false;
    if (category === "france") {
      if (row.lang !== "fr" && row.category !== "licences-fr") return false;
    } else if (category !== "all" && category && row.category !== category) return false;
    if (from || to) {
      if (!row.publishedAt) return false;
      const day = String(row.publishedAt).slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
    }
    return true;
  });
}

function getNewsHistoryCount() {
  if (_useJson || !_db) return _readNewsJson().length;
  try { return Number(_get("SELECT COUNT(*) AS n FROM news_history").n) || 0; }
  catch { return 0; }
}

function upsertNewsItems(items, options = {}) {
  const rows = (Array.isArray(items) ? items : []).map(_newsInputToRow).filter(Boolean);
  if (options.strict && (!Array.isArray(items) || rows.length !== items.length
    || new Set(rows.map(row => row.newsKey)).size !== rows.length)) {
    return { ok: false, error: "ALM_BACKUP_FORMAT", processed: 0, inserted: 0, updated: 0, total: getNewsHistoryCount() };
  }
  if (_useJson || !_db) {
    const current = options.replace ? [] : _readNewsJson();
    const byKey = new Map(current.map(row => [row.newsKey, row]));
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      if (byKey.has(row.newsKey)) {
        byKey.set(row.newsKey, _mergeNewsJsonRow(byKey.get(row.newsKey), row));
        updated++;
      } else {
        byKey.set(row.newsKey, row);
        inserted++;
      }
    }
    const next = [...byKey.values()];
    if (options.save !== false) _writeNewsJson(next);
    else _newsJsonCache = next;
    return { ok: true, processed: rows.length, inserted, updated, total: _newsJsonCache.length, storage: "json" };
  }
  if (!rows.length && !options.replace) return { ok: true, processed: 0, inserted: 0, updated: 0, total: getNewsHistoryCount() };

  const before = getNewsHistoryCount();
  let stmt = null;
  let processed = 0;
  try {
    _db.run("BEGIN TRANSACTION");
    if (options.replace) _run("DELETE FROM news_history");
    stmt = _db.prepare(`
      INSERT INTO news_history
        (newsKey, externalId, title, summary, articleUrl, imageUrl, publishedAt, discoveredAt, updatedAt, source, lang, category, dateStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(newsKey) DO UPDATE SET
        externalId = CASE WHEN excluded.externalId <> '' THEN excluded.externalId ELSE news_history.externalId END,
        title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE news_history.title END,
        summary = CASE
          WHEN length(excluded.summary) > length(news_history.summary) THEN excluded.summary
          ELSE news_history.summary
        END,
        articleUrl = CASE WHEN excluded.articleUrl <> '' THEN excluded.articleUrl ELSE news_history.articleUrl END,
        imageUrl = CASE WHEN excluded.imageUrl <> '' THEN excluded.imageUrl ELSE news_history.imageUrl END,
        publishedAt = COALESCE(excluded.publishedAt, news_history.publishedAt),
        updatedAt = excluded.updatedAt,
        source = CASE WHEN excluded.source <> '' THEN excluded.source ELSE news_history.source END,
        lang = CASE WHEN excluded.lang <> '' THEN excluded.lang ELSE news_history.lang END,
        category = CASE WHEN excluded.category <> '' THEN excluded.category ELSE news_history.category END,
        dateStatus = CASE
          WHEN COALESCE(excluded.publishedAt, news_history.publishedAt) IS NOT NULL THEN 'valid'
          WHEN excluded.dateStatus <> '' THEN excluded.dateStatus
          ELSE news_history.dateStatus
        END
    `);

    for (const row of rows) {
      stmt.run([
        row.newsKey,
        row.externalId,
        row.title,
        row.summary,
        row.articleUrl,
        row.imageUrl,
        row.publishedAt,
        row.discoveredAt,
        row.updatedAt,
        row.source,
        row.lang,
        row.category,
        row.dateStatus
      ]);
      processed++;
    }
    _db.run("COMMIT");
    const total = getNewsHistoryCount();
    const inserted = options.replace ? total : Math.max(0, total - before);
    if (options.save !== false) _saveDb();
    return { ok: true, processed, inserted, updated: Math.max(0, processed - inserted), total };
  } catch (err) {
    try { _db.run("ROLLBACK"); } catch {}
    return { ok: false, error: err.message, processed, inserted: 0, updated: 0, total: getNewsHistoryCount() };
  } finally {
    if (stmt) stmt.free();
  }
}

function _newsFilterSql(options = {}) {
  const where = [];
  const params = [];
  const lang = _normalizeNewsLanguage(options.lang) || "all";
  const category = String(options.category || "all").toLowerCase();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(options.from || "")) ? String(options.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(options.to || "")) ? String(options.to) : "";

  if (lang !== "all") {
    where.push("lang = ?");
    params.push(lang);
  }
  if (category === "france") {
    where.push("(lang = 'fr' OR category = 'licences-fr')");
  } else if (category !== "all" && category) {
    where.push("category = ?");
    params.push(category);
  }
  if (from) {
    where.push("publishedAt IS NOT NULL AND date(publishedAt) >= date(?)");
    params.push(from);
  }
  if (to) {
    where.push("publishedAt IS NOT NULL AND date(publishedAt) <= date(?)");
    params.push(to);
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

function queryNewsHistory(options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 200, 1000));
  const offset = Math.max(0, Number(options.offset) || 0);
  if (_useJson || !_db) {
    const rows = _filterNewsJsonRows(_readNewsJson(), options).sort((a, b) => {
      const ta = Date.parse(a.publishedAt || a.discoveredAt || "") || 0;
      const tb = Date.parse(b.publishedAt || b.discoveredAt || "") || 0;
      return tb - ta || String(a.title || "").localeCompare(String(b.title || ""), "fr", { sensitivity: "base" });
    });
    return { items: rows.slice(offset, offset + limit).map(_rowToNewsItem).filter(Boolean), total: rows.length, limit, offset, storage: "json" };
  }
  const filter = _newsFilterSql(options);
  try {
    const total = Number(_get(`SELECT COUNT(*) AS n FROM news_history ${filter.clause}`, filter.params).n) || 0;
    const rows = _all(`
      SELECT newsKey, externalId, title, summary, articleUrl, imageUrl, publishedAt, discoveredAt, updatedAt, source, lang, category, dateStatus
      FROM news_history
      ${filter.clause}
      ORDER BY COALESCE(publishedAt, discoveredAt) DESC, discoveredAt DESC, title COLLATE NOCASE
      LIMIT ? OFFSET ?
    `, [...filter.params, limit, offset]);
    return { items: rows.map(_rowToNewsItem).filter(Boolean), total, limit, offset };
  } catch {
    return { items: [], total: 0, limit, offset };
  }
}

function getNewsHistoryStats(options = {}) {
  if (_useJson || !_db) {
    const rows = _filterNewsJsonRows(_readNewsJson(), { lang: options.lang, category: options.category });
    const dates = rows.map(row => String(row.publishedAt || "").slice(0, 10)).filter(Boolean).sort();
    return {
      total: rows.length,
      dated: dates.length,
      undated: rows.length - dates.length,
      availableFrom: dates[0] || "",
      availableTo: dates[dates.length - 1] || "",
      storage: "json"
    };
  }
  const filter = _newsFilterSql({ lang: options.lang, category: options.category });
  try {
    const row = _get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN publishedAt IS NOT NULL THEN 1 ELSE 0 END) AS dated,
        SUM(CASE WHEN publishedAt IS NULL THEN 1 ELSE 0 END) AS undated,
        MIN(CASE WHEN publishedAt IS NOT NULL THEN date(publishedAt) END) AS availableFrom,
        MAX(CASE WHEN publishedAt IS NOT NULL THEN date(publishedAt) END) AS availableTo
      FROM news_history
      ${filter.clause}
    `, filter.params);
    return {
      total: Number(row.total) || 0,
      dated: Number(row.dated) || 0,
      undated: Number(row.undated) || 0,
      availableFrom: row.availableFrom || "",
      availableTo: row.availableTo || ""
    };
  } catch {
    return { total: 0, dated: 0, undated: 0, availableFrom: "", availableTo: "" };
  }
}

function pruneNewsHistory(retentionDays, options = {}) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) {
    if ((_useJson || !_db) && options.save === true) _writeNewsJson(_readNewsJson());
    else if (_db && options.save === true) _saveDb();
    return { ok: true, skipped: true, deleted: 0, total: getNewsHistoryCount() };
  }
  const safeDays = Math.max(1, Math.min(Math.floor(days), 36500));
  if (_useJson || !_db) {
    const beforeRows = _readNewsJson();
    const threshold = Date.now() - safeDays * 24 * 60 * 60 * 1000;
    const kept = beforeRows.filter(row => {
      const time = Date.parse(row.publishedAt || row.discoveredAt || "");
      return !Number.isFinite(time) || time >= threshold;
    });
    if (options.save !== false) _writeNewsJson(kept);
    else _newsJsonCache = kept;
    return { ok: true, deleted: beforeRows.length - kept.length, total: kept.length, retentionDays: safeDays, storage: "json" };
  }
  try {
    const before = getNewsHistoryCount();
    _run(`DELETE FROM news_history WHERE datetime(COALESCE(publishedAt, discoveredAt)) < datetime('now', ?)`, [`-${safeDays} days`]);
    const total = getNewsHistoryCount();
    if (options.save === true || (options.save !== false && total !== before)) _saveDb();
    return { ok: true, deleted: Math.max(0, before - total), total, retentionDays: safeDays };
  } catch (err) {
    return { ok: false, error: err.message, deleted: 0, total: getNewsHistoryCount(), retentionDays: safeDays };
  }
}

function updateNewsImageByArticleUrl(articleUrl, imageUrl, options = {}) {
  const url = String(articleUrl || "").trim();
  const image = String(imageUrl || "").trim();
  if (!url || !image) return { ok: false, updated: 0 };
  if (_useJson || !_db) {
    let changed = 0;
    const rows = _readNewsJson().map(row => {
      if (row.articleUrl === url && !row.imageUrl) {
        changed++;
        return { ...row, imageUrl: image, updatedAt: new Date().toISOString() };
      }
      return row;
    });
    if (changed && options.save !== false) _writeNewsJson(rows);
    else _newsJsonCache = rows;
    return { ok: true, updated: changed, storage: "json" };
  }
  try {
    _run("UPDATE news_history SET imageUrl = ?, updatedAt = ? WHERE articleUrl = ? AND (imageUrl IS NULL OR imageUrl = '')", [image, new Date().toISOString(), url]);
    const changed = Number(_db.getRowsModified?.() || 0);
    if (changed && options.save !== false) _saveDb();
    return { ok: true, updated: changed };
  } catch (err) {
    return { ok: false, error: err.message, updated: 0 };
  }
}

/**
 * Met à jour plusieurs vignettes d'actualités avec une seule écriture disque.
 * Chaque entrée peut fournir plusieurs variantes d'URL (URL RSS originale et
 * URL canonique après suppression des paramètres de suivi). Le résultat expose
 * les clés non trouvées afin que l'appelant puisse, si nécessaire, effectuer un
 * upsert complet sans créer de doublon silencieux.
 */
function updateNewsImagesByArticleUrl(entries, options = {}) {
  const normalized = (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const imageUrl = String(entry?.imageUrl || "").trim();
    const urls = [...new Set([
      ...(Array.isArray(entry?.articleUrls) ? entry.articleUrls : []),
      entry?.articleUrl,
      entry?.originalArticleUrl
    ].map(value => String(value || "").trim()).filter(Boolean))];
    return {
      key: String(entry?.key || entry?.newsKey || index),
      imageUrl,
      urls
    };
  }).filter(entry => entry.imageUrl && entry.urls.length);

  if (!normalized.length) {
    return { ok: true, processed: 0, updated: 0, matchedKeys: [], unmatchedKeys: [] };
  }

  const matchedKeys = new Set();
  let updated = 0;
  const now = new Date().toISOString();

  if (_useJson || !_db) {
    const rows = _readNewsJson().map(row => {
      const match = normalized.find(entry => entry.urls.includes(String(row.articleUrl || "")));
      if (!match) return row;
      // Une ligne existante est considérée comme trouvée même si elle possède
      // déjà une image. Cela évite un upsert de secours et donc tout risque de
      // dupliquer l'actualité sous une autre clé.
      matchedKeys.add(match.key);
      if (row.imageUrl && options.overwrite !== true) return row;
      if (row.imageUrl === match.imageUrl) return row;
      updated++;
      return { ...row, imageUrl: match.imageUrl, updatedAt: now };
    });
    if (updated && options.save !== false) _writeNewsJson(rows);
    else _newsJsonCache = rows;
    return {
      ok: true,
      processed: normalized.length,
      updated,
      matchedKeys: [...matchedKeys],
      unmatchedKeys: normalized.map(entry => entry.key).filter(key => !matchedKeys.has(key)),
      storage: "json"
    };
  }

  let statement = null;
  try {
    _db.run("BEGIN TRANSACTION");
    statement = _db.prepare(options.overwrite === true
      ? "UPDATE news_history SET imageUrl = ?, updatedAt = ? WHERE articleUrl = ?"
      : "UPDATE news_history SET imageUrl = ?, updatedAt = ? WHERE articleUrl = ? AND (imageUrl IS NULL OR imageUrl = '')");

    for (const entry of normalized) {
      for (const url of entry.urls) {
        const existing = _get("SELECT imageUrl FROM news_history WHERE articleUrl = ? LIMIT 1", [url]);
        if (!existing || !Object.prototype.hasOwnProperty.call(existing, "imageUrl")) continue;
        matchedKeys.add(entry.key);
        if (options.overwrite === true || !String(existing.imageUrl || "").trim()) {
          statement.run([entry.imageUrl, now, url]);
          updated += Number(_db.getRowsModified?.() || 0);
        }
        break;
      }
    }
    _db.run("COMMIT");
    if (updated && options.save !== false) _saveDb();
    return {
      ok: true,
      processed: normalized.length,
      updated,
      matchedKeys: [...matchedKeys],
      unmatchedKeys: normalized.map(entry => entry.key).filter(key => !matchedKeys.has(key))
    };
  } catch (err) {
    try { _db.run("ROLLBACK"); } catch {}
    return {
      ok: false,
      error: err.message,
      processed: normalized.length,
      updated: 0,
      matchedKeys: [],
      unmatchedKeys: normalized.map(entry => entry.key)
    };
  } finally {
    if (statement) statement.free();
  }
}

function getNewsItemByKey(key) {
  if (_useJson || !_db) return _rowToNewsItem(_readNewsJson().find(row => row.newsKey === String(key))) || null;
  try { return _all('SELECT * FROM news_history WHERE newsKey = ? LIMIT 1', [String(key)]).map(_rowToNewsItem)[0] || null; } catch { return null; }
}

function exportNewsHistory() {
  if (_useJson || !_db) {
    return _readNewsJson().slice().sort((a, b) => {
      const ta = Date.parse(a.publishedAt || a.discoveredAt || "") || 0;
      const tb = Date.parse(b.publishedAt || b.discoveredAt || "") || 0;
      return tb - ta;
    }).map(_rowToNewsItem).filter(Boolean);
  }
  try {
    return _all(`
      SELECT newsKey, externalId, title, summary, articleUrl, imageUrl, publishedAt, discoveredAt, updatedAt, source, lang, category, dateStatus
      FROM news_history
      ORDER BY COALESCE(publishedAt, discoveredAt) DESC, discoveredAt DESC
    `).map(_rowToNewsItem).filter(Boolean);
  } catch {
    throw Error('ALM_NEWS_EXPORT_FAILED');
  }
}

function clearNewsHistory(options = {}) {
  if (_useJson || !_db) {
    const before = _readNewsJson().length;
    if (options.save !== false) _writeNewsJson([]);
    else _newsJsonCache = [];
    return { ok: true, deleted: before, total: 0, storage: "json" };
  }
  try {
    const before = getNewsHistoryCount();
    _run("DELETE FROM news_history");
    if (options.save !== false) _saveDb();
    return { ok: true, deleted: before, total: 0 };
  } catch (err) {
    return { ok: false, error: err.message, deleted: 0 };
  }
}

function clearMetadata() {
  if (_useJson || !_db) return { ok: false, error: "SQLite indisponible" };
  try {
    const before = getMetadataCount();
    _run("DELETE FROM metadata");
    invalidateMetadataTitleIndex();
    _saveDb();
    return { ok: true, before, after: 0, deleted: before };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function validateLibraryJson(items) {
  if (!Array.isArray(items)) throw Error('Invalid library JSON: expected an array; original preserved');
  const ids = new Set();
  for (const item of items) {
    const id = Number(item?.id);
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.title !== 'string'
      || !Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw Error('Invalid library JSON records; original preserved');
    ids.add(id);
  }
  return items;
}

function _readJson() {
  if (!fs.existsSync(_jsonFile)) { _jsonCache = null; _jsonCacheStamp = ""; return []; }
  const stat = fs.statSync(_jsonFile);
  const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  if (_jsonCache && stamp === _jsonCacheStamp) return JSON.parse(JSON.stringify(_jsonCache));
  // Corruption must be reported, not treated as an empty library and overwritten.
  const parsed = JSON.parse(fs.readFileSync(_jsonFile, "utf8"));
  validateLibraryJson(parsed);
  _jsonCache = parsed;
  _jsonCacheStamp = stamp;
  return JSON.parse(JSON.stringify(parsed));
}

function _writeJson(arr) {
  if (!Array.isArray(arr)) throw new TypeError("Library must be an array");
  const next = JSON.parse(JSON.stringify(arr));
  if (fs.existsSync(_jsonFile)) {
    const previous = fs.readFileSync(_jsonFile, "utf8");
    const parsed = JSON.parse(previous);
    if (!Array.isArray(parsed)) throw new Error("Previous library is invalid; refusing to overwrite");
    atomicWrite(_jsonFile + ".bak", previous);
  }
  atomicJson(_jsonFile, next);
  atomicJson(_jsonFile + ".revision.json", {version:45,sha256:crypto.createHash("sha256").update(JSON.stringify(next)).digest("hex"),savedAt:new Date().toISOString()});
  _jsonCache = next;
  const stat = fs.statSync(_jsonFile);
  _jsonCacheStamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
}

function checkIntegrity(){if(!_db||_useJson)return {ok:false,mode:'json'};if(_db.disk){const checks=Object.fromEntries(['main','catalog','cache'].map(schema=>[schema,Object.values(_db.native.prepare('PRAGMA '+schema+'.quick_check').get())[0]]));return {ok:Object.values(checks).every(v=>v==='ok'),checks};}return {ok:_get('PRAGMA quick_check').quick_check==='ok'};}
function storageStatus() { return {mode:_useJson || !_db ? "json" : "sqlite", engine:_db?.disk?"sqlite-disk":"sql.js", ready:isReady(), mirrorPending:!!_mirrorTimer, error:_storageError}; }
function flush() { if (_mirrorTimer || (_db?.disk && _storageError)) {clearTimeout(_mirrorTimer);_mirrorTimer=null;_writeJson(getAllAnimes());_storageError="";} _saveDb(); }

// Call after HTTP requests and background writers have stopped. Even a failed
// recovery-mirror write must release all three SQLite file handles.
function close() {
  titleIndexWorker?.terminate();titleIndexWorker=null;titleIndex=null;
  let failure;
  try { flush(); } catch (error) { failure = error; }
  finally {
    if (_dbSaveTimer) { clearTimeout(_dbSaveTimer); _dbSaveTimer = null; }
    if (_mirrorTimer) { clearTimeout(_mirrorTimer); _mirrorTimer = null; }
    if (_db) {
      try { _db.close(); } catch (error) { failure ||= error; }
      _db = null;
    }
    _useJson = false;
  }
  if (failure) throw failure;
}

async function readAnimesAsync() { await whenReady(); return getAllAnimes(); }
async function writeAnimesAsync(arr) { await whenReady(); writeAllAnimes(arr); }
function normalizeT(t) { return String(t || "").toLowerCase().trim(); }

function getMetadataIntegrityCandidates(){
 if(_useJson||!_db)return [];
 return _all("SELECT * FROM metadata WHERE title LIKE '%Saison %' OR titleRomaji LIKE '%Saison %' OR synonyms LIKE '%Saison %'").map(_rowToMetadata).filter(Boolean);
}
module.exports = {
  prepareMetadataTitleIndex,
  getMetadataRevision,
  getMetadataTitleSignature,
  getMetadataIntegrityCandidates,
  checkIntegrity,
  storageStatus,
  close,
  flush,
  initDb,
  whenReady,
  getAllAnimes,
  getAnimeById,
  getAnimesByStatus,
  searchAnimesByTitle,
  insertAnime,
  updateAnime,
  deleteAnime,
  writeAllAnimes,
  readAnimesAsync,
  writeAnimesAsync,
  getQuickStats,
  isReady,
  getMetadataStats,
  getMetadataCount,
  browseMetadata,
  catalogFacets,
  searchMetadataByTitle,
  searchMetadataByTitleTokens,
  listMetadataByGenre,
  getMetadataByMalId,
  getTopMetadata,
  listMetadataStudios,
  listMetadataForCalendar,
  getStudioMetadata,
  listMetadataForNews,
  getNewsHistoryCount,
  getNewsHistoryStats,
  queryNewsHistory,
  upsertNewsItems,
  pruneNewsHistory,
  updateNewsImageByArticleUrl,
  updateNewsImagesByArticleUrl,
  exportNewsHistory,
  getNewsItemByKey,
  clearNewsHistory,
  importMetadataRows,
  importMetadataSql,
  clearMetadata,
  getMetadataSyncValue,
  setMetadataSyncValue,
  setMetadataSyncValues,
  getMetadataSyncState
};
