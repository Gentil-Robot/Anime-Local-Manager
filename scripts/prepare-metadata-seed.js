#!/usr/bin/env node
"use strict";
// Compatibility entry point: keep the historical offline record and SQL parsers.
// Public Jikan crawling is removed; all CLI flags use verified local maintenance.
function valueFromNamedArray(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") return String(value.name || value.title || value.title_en || value.title_english || value.node?.name || "").trim();
  return "";
}

function addText(set, value) {
  const text = valueFromNamedArray(value);
  if (text) set.add(text);
}

function pickTitleFromJikanTitles(titles, type) {
  if (!Array.isArray(titles)) return "";
  const found = titles.find(t => String(t?.type || "").toLowerCase() === type.toLowerCase());
  return String(found?.title || "").trim();
}

function normalizeJikanAnime(raw) {
  const malId = Number(raw?.mal_id || raw?.malId || 0);
  if (!Number.isFinite(malId) || malId <= 0) return null;

  const jikanTitles = Array.isArray(raw.titles) ? raw.titles : [];
  const titleDefault = String(raw.title || pickTitleFromJikanTitles(jikanTitles, "Default") || raw.title_english || "").trim();
  const titleEn = String(raw.title_english || pickTitleFromJikanTitles(jikanTitles, "English") || "").trim();
  const titleRomaji = String(raw.title || pickTitleFromJikanTitles(jikanTitles, "Default") || pickTitleFromJikanTitles(jikanTitles, "Japanese") || "").trim();

  const synonyms = new Set();
  for (const title of jikanTitles) addText(synonyms, title?.title);
  for (const title of raw.title_synonyms || []) addText(synonyms, title);
  addText(synonyms, raw.title_japanese);
  addText(synonyms, titleDefault);
  addText(synonyms, titleEn);
  addText(synonyms, titleRomaji);

  const canonicalLower = new Set([titleDefault, titleEn, titleRomaji].filter(Boolean).map(t => t.toLowerCase()));
  const synonymList = Array.from(synonyms).filter(t => !canonicalLower.has(String(t).toLowerCase()));

  const genres = new Set();
  for (const item of raw.genres || []) addText(genres, item);
  for (const item of raw.explicit_genres || []) addText(genres, item);
  for (const item of raw.themes || []) addText(genres, item);
  for (const item of raw.demographics || []) addText(genres, item);

  const studios = new Set();
  for (const item of raw.studios || []) addText(studios, item);

  const imageUrl = String(
    raw?.images?.jpg?.large_image_url || raw?.images?.jpg?.image_url ||
    raw?.images?.webp?.large_image_url || raw?.images?.webp?.image_url || ""
  ).trim();

  return {
    malId,
    title: titleDefault || titleEn || titleRomaji,
    titleEn,
    titleRomaji,
    synonyms: synonymList,
    genres: Array.from(genres),
    episodes: raw.episodes == null ? null : Number(raw.episodes) || null,
    score: raw.score == null ? null : Number(raw.score) || null,
    type: String(raw.type || "").trim(),
    studios: Array.from(studios),
    imageUrl,
    synopsis: String(raw.synopsis || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    startDate: raw.aired?.from ? String(raw.aired.from).slice(0, 10) : "",
    endDate: raw.aired?.to ? String(raw.aired.to).slice(0, 10) : "",
    rank: raw.rank == null ? null : Number(raw.rank) || null,
    popularity: raw.popularity == null ? null : Number(raw.popularity) || null,
    members: raw.members == null ? null : Number(raw.members) || null,
    rating: String(raw.rating || "").trim(),
    duration: String(raw.duration || "").trim()
  };
}

function sqlString(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "NULL";
}

function sqlInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.trunc(n)) : "NULL";
}

function metadataSchemaSql() {
  return `CREATE TABLE IF NOT EXISTS metadata (
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
CREATE INDEX IF NOT EXISTS idx_meta_title       ON metadata(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_meta_titleEn     ON metadata(titleEn COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_meta_titleRomaji ON metadata(titleRomaji COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS metadata_sync (
  key       TEXT PRIMARY KEY,
  value     TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;
}


function rowsToSql(rows) {
  const lines = [];
  lines.push("-- Anime Local Manager metadata seed");
  lines.push("-- ALM-METADATA-SCHEMA: v2");
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Rows: ${rows.length}`);
  lines.push("PRAGMA foreign_keys=OFF;");
  lines.push("BEGIN TRANSACTION;");
  lines.push(metadataSchemaSql());

  for (const row of rows) {
    lines.push(
      "INSERT OR REPLACE INTO metadata " +
      "(malId, title, titleEn, titleRomaji, synonyms, genres, episodes, score, type, studios, imageUrl, synopsis, startDate, endDate, rank, popularity, members, rating, duration) VALUES (" +
      [
        sqlInteger(row.malId),
        sqlString(row.title),
        sqlString(row.titleEn || ""),
        sqlString(row.titleRomaji || ""),
        sqlString(JSON.stringify(row.synonyms || [])),
        sqlString(JSON.stringify(row.genres || [])),
        sqlInteger(row.episodes),
        sqlNumber(row.score),
        sqlString(row.type || ""),
        sqlString(JSON.stringify(row.studios || [])),
        sqlString(row.imageUrl || ""),
        sqlString(row.synopsis || ""),
        sqlString(row.startDate || ""),
        sqlString(row.endDate || ""),
        sqlInteger(row.rank),
        sqlInteger(row.popularity),
        sqlInteger(row.members),
        sqlString(row.rating || ""),
        sqlString(row.duration || "")
      ].join(", ") +
      ");"
    );
  }

  lines.push("COMMIT;");
  lines.push("");
  return lines.join("\n");
}

function isJikanUpstreamUnavailable(status, body = "") {
  const code = Number(status || 0);
  if (![502, 503, 504].includes(code)) return false;
  const text = String(body || "");
  return /Jikan failed to connect to MyAnimeList|MyAnimeList may be down|MyAnimeList.*unavailable|refuses to connect/i.test(text);
}


async function probeJikanAvailability(){throw Object.assign(new Error("ALM_JIKAN_RETIRED"),{code:"ALM_JIKAN_RETIRED"});}
async function prepareMetadataSeed(){const result=require('./metadata-maintenance').maintain();console.log(`[metadata-local] ${result.restored?"Restauré":"Conservé"} : ${result.rows} fiches. Aucun appel réseau.`);return result;}
module.exports=async function beforePackHook(){return prepareMetadataSeed();};
Object.assign(module.exports,{prepareMetadataSeed,normalizeJikanAnime,rowsToSql,probeJikanAvailability,isJikanUpstreamUnavailable});
if(require.main===module)prepareMetadataSeed().catch(error=>{console.error('[metadata-local] '+error.message);process.exitCode=1;});
