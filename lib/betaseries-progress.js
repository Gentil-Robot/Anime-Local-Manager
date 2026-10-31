"use strict";

/**
 * Pure helpers for reconciling a BetaSeries SxxEyy marker with anime seasons
 * stored as separate records (MAL/AniList style).
 */

function positiveInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function parseBetaSeriesEpisode(value) {
  const match = String(value || "").match(/S(\d+)E(\d+)/i);
  if (!match) return { season: 0, episode: 0 };
  return {
    season: positiveInt(match[1], 0),
    episode: positiveInt(match[2], 0)
  };
}

function normalizedSeasonEntry(entry, index) {
  return {
    ...(entry || {}),
    chainIndex: index,
    episodesTotal: positiveInt(entry?.episodesTotal ?? entry?.episodes ?? 0, 0)
  };
}

function targetStatus(seen, total, completed) {
  if (completed) return "Completed";
  if (total > 0 && seen >= total) return "Completed";
  if (seen > 0) return "Watching";
  return "Plan to Watch";
}

/**
 * Build a progress plan.
 *
 * Rules:
 * - S02E02 means season-record #1 is completed and season-record #2 is 2 eps in.
 * - S01E24 with 12 + 12 episode records is distributed as 12/12 + 12/12.
 * - Progress is never allowed to exceed a record's episode total.
 * - When the relation chain is incomplete, the unresolved part is reported
 *   instead of fabricating a wrong anime record.
 */
function buildSeasonProgressPlan(marker, seasonEntries, options = {}) {
  if((seasonEntries||[]).some(entry=>entry?.sourceSeason))return buildGroupedSeasonProgressPlan(marker,seasonEntries,options);
  const parsed = typeof marker === "string" ? parseBetaSeriesEpisode(marker) : {
    season: positiveInt(marker?.season, 0),
    episode: positiveInt(marker?.episode, 0)
  };
  const seasonNumber = parsed.season || 1;
  const episodeNumber = parsed.episode || 0;
  const seriesCompleted = options.completed === true;
  const seasons = (Array.isArray(seasonEntries) ? seasonEntries : [])
    .filter(Boolean)
    .map(normalizedSeasonEntry);

  const result = {
    seasonNumber,
    episodeNumber,
    seriesCompleted,
    records: [],
    complete: true,
    missingSeasonSlots: 0,
    remainingUnallocatedEpisodes: 0
  };

  if (!seasons.length) {
    result.complete = false;
    result.missingSeasonSlots = Math.max(1, seasonNumber);
    result.remainingUnallocatedEpisodes = episodeNumber;
    return result;
  }

  // BetaSeries season > 1: each preceding anime-season record is completed,
  // then the episode number is applied only to the target season.
  if (seasonNumber > 1) {
    const targetIndex = seasonNumber - 1;
    const availableTargetIndex = Math.min(targetIndex, seasons.length - 1);

    for (let index = 0; index <= availableTargetIndex; index += 1) {
      const season = seasons[index];
      const total = season.episodesTotal;
      const beforeTarget = index < targetIndex;
      let seen = 0;
      let status = "Plan to Watch";

      if (beforeTarget) {
        seen = total || 0;
        status = "Completed";
      } else if (index === targetIndex) {
        seen = total > 0 ? Math.min(episodeNumber, total) : episodeNumber;
        if (seriesCompleted && total > 0) seen = total;
        status = targetStatus(seen, total, seriesCompleted);
      }

      result.records.push({ ...season, episodesSeen: seen, status, target: index === targetIndex });
    }

    if (targetIndex >= seasons.length) {
      result.complete = false;
      result.missingSeasonSlots = targetIndex - seasons.length + 1;
    }
    return result;
  }

  // BetaSeries S01Eyy can still span several MAL records (split cour / Part 2).
  let remaining = episodeNumber;
  let touched = false;
  for (let index = 0; index < seasons.length; index += 1) {
    const season = seasons[index];
    const total = season.episodesTotal;
    if (remaining <= 0 && !seriesCompleted) break;

    let seen = 0;
    let status = "Plan to Watch";
    if (total > 0) {
      seen = Math.min(remaining, total);
      remaining = Math.max(0, remaining - seen);
      if (seriesCompleted && remaining <= 0 && index === 0 && episodeNumber <= total) seen = total;
      status = targetStatus(seen, total, seriesCompleted && remaining <= 0 && seen > 0);
    } else if (!touched) {
      seen = remaining;
      remaining = 0;
      status = targetStatus(seen, 0, seriesCompleted);
    }

    if (seen > 0 || status === "Completed") {
      touched = true;
      result.records.push({ ...season, episodesSeen: seen, status, target: remaining <= 0 });
    }
    if (remaining <= 0) break;
  }

  if (remaining > 0) {
    result.complete = false;
    result.remainingUnallocatedEpisodes = remaining;
  }
  return result;
}

function buildGroupedSeasonProgressPlan(marker,entries,options={}){
 const parsed=typeof marker==='string'?parseBetaSeriesEpisode(marker):marker;
 const seasonNumber=positiveInt(parsed.season,1),episodeNumber=positiveInt(parsed.episode);
 const result={seasonNumber,episodeNumber,seriesCompleted:options.completed===true,records:[],complete:true,missingSeasonSlots:0,remainingUnallocatedEpisodes:0};
 let remaining=episodeNumber;
 const target=entries.filter(e=>seasonNumber===1||Number(e.sourceSeason)===seasonNumber);
 if(!target.length){result.complete=false;result.missingSeasonSlots=Math.max(1,seasonNumber-Math.max(...entries.map(e=>Number(e.sourceSeason)||1)));}
 for(let index=0;index<entries.length;index++){
  const entry=normalizedSeasonEntry(entries[index],index),before=seasonNumber>1&&Number(entry.sourceSeason)<seasonNumber;
  if(before){result.records.push({...entry,episodesSeen:entry.episodesTotal,status:'Completed',target:false});continue;}
  if(!target.includes(entries[index]))continue;
  if(!remaining&&result.records.length)break;
  const seen=entry.episodesTotal?Math.min(remaining,entry.episodesTotal):remaining;
  remaining-=seen;
  result.records.push({...entry,episodesSeen:seen,status:targetStatus(seen,entry.episodesTotal,false),target:remaining===0});
 }
 if(remaining>0){result.complete=false;result.remainingUnallocatedEpisodes=remaining;}
 return result;
}

module.exports = {
  buildGroupedSeasonProgressPlan,
  parseBetaSeriesEpisode,
  buildSeasonProgressPlan
};
