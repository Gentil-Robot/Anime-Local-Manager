"use strict";
const roman = {II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10};
function norm(value) {
  return String(value || "").normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[\u2019']/g, "").replace(/[^\p{L}\p{N}]+/gu," ").trim();
}
function titleSlot(value) {
  let text = String(value || "").normalize("NFKC").trim();
  const part = text.match(/\b(?:part|partie|cour)\s*(\d{1,2})\b/i);
  const season = text.match(/\b(?:saison|season|staffel|temporada|s)\s*(\d{1,2})\b/i)
    || text.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i)
    || text.match(/\u7b2c\s*(\d{1,2})\s*[\u671f\u5b63]/);
  // A Roman numeral only counts as a suffix (or before a subtitle/part).
  // Do not interpret arbitrary Roman-looking words inside a title as seasons.
  const r = text.match(/\s+(VIII|VII|III|VI|IV|IX|II|V|X)(?=\s*$|\s*[:\u2014\u2013]|\s+(?:part|cour)\b)/i);
  const n = season ? Number(season[1]) : r ? roman[r[1].toUpperCase()] : 0;
  text = text.replace(/\b(?:part|partie|cour)\s*\d{1,2}\b.*$/i, "")
    .replace(/\b(?:saison|season|staffel|temporada|s)\s*\d{1,2}\b.*$/i, "")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b.*$/i, "")
    .replace(/\u7b2c\s*\d{1,2}\s*[\u671f\u5b63].*$/, "");
  if (r) text = text.slice(0, r.index);
  return {season:n, part:part ? Number(part[1]) : 0, root:norm(text)};
}
function slot(anime) {
  const parsed = titleSlot(anime?.title);
  return {season:Number(anime?.manualSeasonNumber || anime?.betaseriesSeason) || parsed.season,
    part:Number(anime?.partNumber || anime?.courNumber) || parsed.part,
    root:norm(anime?.seriesRootTitle) || parsed.root};
}
function officialConflict(a,b) {
  if (a?.catalogueId || b?.catalogueId) return !a?.catalogueId || a.catalogueId !== b?.catalogueId;
  return ["malId","anilistId"].some(key => a?.[key] && b?.[key] && String(a[key]) !== String(b[key]));
}
function sameSeason(a,b) {
  const x=slot(a), y=slot(b);
  if (officialConflict(a,b)) return false;
  if (x.season && y.season && x.season !== y.season) return false;
  if (x.part !== y.part && (x.part || y.part)) return false;
  if (a?.catalogueId && b?.catalogueId) return a.catalogueId === b.catalogueId;
  if (a?.malId && b?.malId) return String(a.malId) === String(b.malId);
  if (a?.anilistId && b?.anilistId) return String(a.anilistId) === String(b.anilistId);
  // A franchise is NOT a season identity. Only use explicit, matching slots.
  if (!x.season || !y.season) return norm(a?.title) === norm(b?.title) && !!norm(a?.title);
  const ax=String(a?.betaseriesSeriesId || a?.betaseriesId || "");
  const bx=String(b?.betaseriesSeriesId || b?.betaseriesId || "");
  if (ax && bx && ax === bx) return true;
  return !!x.root && x.root === y.root;
}
module.exports = {norm, titleSlot, slot, sameSeason, officialConflict};
