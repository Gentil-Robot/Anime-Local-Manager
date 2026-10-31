"use strict";
const identity = require('./season-identity');
const {parseBetaSeriesEpisode} = require('./betaseries-progress');
const number = v => Math.max(0, Number(String(v ?? '').replace(',', '.')) || 0);
function provisional(item) {
  return !!(item?.manualSeasonNumber || item?.betaseriesSeason) && (item?.tags || []).some(t => /saison à identifier|progression à vérifier/.test(t));
}
function acceptsInfo(item, found) {
  if (!found) return false;
  if (item?.malId && found.malId && String(item.malId) !== String(found.malId)) return false;
  if (item?.anilistId && found.anilistId && String(item.anilistId) !== String(found.anilistId)) return false;
  if (!item?.malId && provisional(item)) {
    const expected = identity.slot(item);
    const actual = identity.slot({...found, title: found.officialTitle || found.title});
    if(found.verifiedSeriesSeason?.season===expected.season&&Number(found.verifiedSeriesSeason.rootMalId)>0&&Number(found.malId)>0)return true;
    // Catalogues omit “Season 1” on the first official record. An exact title
    // and a verified ID can resolve S1 without claiming that a sequel is S1.
    if(expected.season===1&&!actual.season&&expected.part===actual.part&&Number(found.malId)>0&&
       [found.officialTitle||found.title,found.englishTitle,found.romajiTitle,...(Array.isArray(found.synonyms)?found.synonyms:[])].some(title=>identity.norm(title)&&identity.norm(item.title)===identity.norm(title)))return true;
    if (!actual.season || actual.season !== expected.season || actual.part !== expected.part) return false;
  }
  return true;
}
function repairLegacyImports(input) {
  const items = input.map(a => ({...a})), removed = [], roots = new Map();
  const seriesId = a => String(a.betaseriesSeriesId || a.betaseriesId || '');
  for (const a of items) if (seriesId(a) && number(a.betaseriesSeason || a.manualSeasonNumber) <= 1) roots.set(seriesId(a), a);
  const invalidRoots = new Set();
  for (const [key, root] of roots) {
    const marker = parseBetaSeriesEpisode(root.betaseriesEpisode);
    const sentinel = number(root.betaseriesOverflowEpisodes) >= 900000 || /^999999\//.test(root.betaseriesOriginalProgress || '');
    if (sentinel && marker.season === 1 && marker.episode > 0) invalidRoots.add(key);
  }
  const kept = items.filter(a => {
    const key = seriesId(a), base = roots.get(key), marker = parseBetaSeriesEpisode(a.betaseriesEpisode);
    if (!base || a === base || !provisional(a) || !invalidRoots.has(key) || marker.season !== 1 || number(a.betaseriesSeason || a.manualSeasonNumber) <= 1) return true;
    removed.push(a);
    base.importRecoveryRecords = [...(base.importRecoveryRecords || []), a];
    base.notes=require('./notebook-model').mergeNotes(base.notes,a.notes);
    if(base.personalJournal||a.personalJournal)base.personalJournal=require('./notebook-model').mergeJournal(base.personalJournal,a.personalJournal);
    if (!base.score && a.score) base.score = a.score;
    return false;
  });
  for (const key of invalidRoots) {
    const a = roots.get(key), marker = parseBetaSeriesEpisode(a.betaseriesEpisode);
    a.episodesSeen = String(number(a.episodesTotal) || marker.episode);
    a.betaseriesOverflowEpisodes = 0; a.betaseriesOverflowNextSeason = 0;
    a.betaseriesOriginalProgress = a.betaseriesEpisode;
    a.needsSequelCheck = false; a.progressWarning = '';
    a.tags = (a.tags || []).filter(t => !/suite probable|progression à vérifier|multi-saison/.test(t));
    a.importIntegrityVersion = 48;
  }
  return {items:kept, changed:!!invalidRoots.size, removed, correctedRoots:invalidRoots.size};
}
module.exports = {acceptsInfo, provisional, repairLegacyImports};
