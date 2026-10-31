'use strict';
const crypto = require('node:crypto');

function validDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(text+'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===text ? text : '';
}
function positive(value) { const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<=100000?n:0; }
function completeEpisodes(anime, metadata) {
  if (anime.status!=='Completed') return {...anime};
  const total=positive(anime.episodesTotal)||positive(metadata?.episodes)||positive(metadata?.episodesTotal)||positive(anime.episodesSeen);
  return total?{...anime,episodesTotal:String(total),episodesSeen:String(total),completionNeedsEpisodes:false}:{...anime,completionNeedsEpisodes:true};
}
function recordViewing(previous, next, input={}) {
  const out={...next,watchEvents:Array.isArray(previous?.watchEvents)?previous.watchEvents:[]};
  out.completedOn=previous?.completedOn||'';
  if (Object.hasOwn(input,'completedOn')) {
    if (input.completedOn && !validDate(input.completedOn)) throw new Error('ALM_INVALID_WATCH_DATE');
    out.completedOn=validDate(input.completedOn);
  }
  const date=validDate(input.watchedOn);
  if (input.watchedOn && !date) throw new Error('ALM_INVALID_WATCH_DATE');
  // Only a deliberately dated viewing action enters the heatmap. Imports and metadata do not.
  const delta=Math.max(0,Number(next.episodesSeen||0)-Number(previous?.episodesSeen||0));
  if (date && Number.isSafeInteger(delta) && delta>0) out.watchEvents=[...out.watchEvents,{id:crypto.randomUUID(),date,episodes:delta}];
  if (out.status!=='Completed') out.completedOn='';
  return out;
}
function viewingData(animes,year) {
  const selected=Number(year);
  if (!Number.isSafeInteger(selected)||selected<1900||selected>9998) throw new Error('ALM_INVALID_YEAR');
  const daily=new Map(),years=new Set(),completed=[],undated=[];
  for (const anime of animes) {
    const date=validDate(anime.completedOn);
    if (anime.status==='Completed') {
      if (date) { years.add(Number(date.slice(0,4)));if(Number(date.slice(0,4))===selected)completed.push(anime); }
      else undated.push(anime);
    }
    for (const event of Array.isArray(anime.watchEvents)?anime.watchEvents:[]) {
      const d=validDate(event?.date),count=positive(event?.episodes);
      if(!d||!count)continue;
      years.add(Number(d.slice(0,4)));
      if(Number(d.slice(0,4))!==selected)continue;
      const day=daily.get(d)||{date:d,episodes:0,animeIds:[]};day.episodes+=count;
      if(!day.animeIds.includes(anime.id))day.animeIds.push(anime.id);
      daily.set(d,day);
    }
  }
  completed.sort((a,b)=>b.completedOn.localeCompare(a.completedOn)||a.title.localeCompare(b.title));
  return {year:selected,years:[...years].sort((a,b)=>b-a),days:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),completed,undated};
}
module.exports={validDate,positive,completeEpisodes,recordViewing,viewingData};
