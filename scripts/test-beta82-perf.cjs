'use strict';
// Deterministic, no-network functional equivalence checks for the measured paths.
const assert = require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const filterStart=source.indexOf('function filteredAnimes() {'),filterEnd=source.indexOf('\nfunction renderStats() {',filterStart);
assert(filterStart>=0&&filterEnd>filterStart,'Library filtering entrypoint missing');
const filterSrc=source.slice(filterStart,filterEnd);
const cacheStart=source.indexOf('let groupedLibraryInput = null;'),cacheEnd=source.indexOf('\nfunction render() {',cacheStart);
assert(cacheStart>=0&&cacheEnd>cacheStart,'Library group cache missing');
const series=require('../public/series-state');
const docs={};for(const id of ['search','statusFilter','typeFilter','genreFilter','yearFilter','studioFilter','sort'])docs[id]={value:''};docs.unratedOnly={checked:false};
const animes=Array.from({length:1200},(_,i)=>({id:i+1,malId:10001+i,title:'Fictional anime '+(i+1),canonicalTitle:'Fiction '+(i+1),localizedTitles:{fr:'Animé fictif '+(i+1),en:'Fictional anime '+(i+1)},tags:['my-tag'],notes:'Saved personal notes '+i,genres:[i%2?'Drama':'Adventure'],studio:'Studio '+(i%4),studios:['Studio '+(i%4)],type:i%3?'TV':'Movie',status:['Completed','Watching','On Hold','Plan to Watch'][i%4],episodesSeen:i%12,episodesTotal:12,score:i%11,publicScore:i%11,rank:i+1,startDate:'2024-01-01'}));
const ctx={animes,activePersonalScoreFilter:0,$:id=>docs[id],animeYear:()=> '2024',globalThis:{ALM_TITLES:{title:a=>a.title},ALM_DESIGN:{language:()=> 'fr'}},window:{ALM_SERIES:series}};
vm.createContext(ctx);vm.runInContext(filterSrc+'\nthis.getFiltered=filteredAnimes;',ctx);vm.runInContext(source.slice(cacheStart,cacheEnd)+'\nthis.visibleGroups=visibleLibraryGroups;',ctx);
function originalFilter(){const q=docs.search.value.toLowerCase(),status=docs.statusFilter.value,type=docs.typeFilter.value,genre=docs.genreFilter.value,year=docs.yearFilter.value,studio=docs.studioFilter.value,sort=docs.sort.value||'title';
 const out=animes.filter(a=>{const text=`${ctx.globalThis.ALM_TITLES.title(a)||a.title} ${a.title} ${a.canonicalTitle||''} ${a.titleEn||''} ${a.titleJa||''} ${Object.values(a.localizedTitles||{}).join(' ')} ${(a.tags||[]).join(' ')} ${(a.genres||[]).join(' ')} ${a.notes||''}`.toLowerCase();return text.includes(q)&&(!status||(a.status==='On Hold'?'On-Hold':a.status)===status)&&(!type||a.type===type)&&(!genre||(a.genres||[]).includes(genre))&&(!year||ctx.animeYear(a)===year)&&(!studio||[...(a.studios||[]),a.studio].includes(studio))&&(!docs.unratedOnly.checked||(a.status==='Completed'&&!Number(a.score)))&&(!ctx.activePersonalScoreFilter||Math.round(Number(a.score||0))===ctx.activePersonalScoreFilter);});
 out.sort((a,b)=>{if(sort==='scoreDesc')return Number(b.score||0)-Number(a.score||0);if(sort==='publicScoreDesc')return Number(b.publicScore||0)-Number(a.publicScore||0);if(sort==='rankAsc')return Number(a.rank||999999)-Number(b.rank||999999);if(sort==='progressDesc')return Number(b.episodesSeen||0)-Number(a.episodesSeen||0);if(sort==='startDateDesc')return String(b.startDate||'').localeCompare(String(a.startDate||''));if(sort==='startDateAsc')return String(a.startDate||'9999').localeCompare(String(b.startDate||'9999'));if(sort==='studio')return String(a.studios?.[0]||a.studio||'\uffff').localeCompare(String(b.studios?.[0]||b.studio||'\uffff'))||a.title.localeCompare(b.title,'fr');return a.title.localeCompare(b.title,'fr');});
 return out;}
for(const sort of ['title','studio','scoreDesc','rankAsc','progressDesc','startDateAsc'])for(const q of ['','fictional anime 12','notes 19','Anime fictif','not present'])for(const genre of ['','Adventure']){
 docs.sort.value=sort;docs.search.value=q;docs.genreFilter.value=genre;docs.statusFilter.value=q&&genre?'Watching':'';docs.studioFilter.value=q&&!genre?'Studio 2':'';docs.unratedOnly.checked=q==='not present';ctx.activePersonalScoreFilter=q==='notes 19'?9:0;
 assert.deepEqual(Array.from(ctx.getFiltered(),a=>a.id),originalFilter().map(a=>a.id),`Filter mismatch ${sort}/${q}/${genre}`);
}
// Old sort/group behavior, including group rank by first selected entry.
const getOld= (rows,order)=>series.groups(rows).sort((a,b)=>Math.min(...a.items.map(x=>order.get(String(x.id))??Infinity))-Math.min(...b.items.map(x=>order.get(String(x.id))??Infinity))).filter(g=>g.items.some(a=>order.has(String(a.id)))).map(g=>g.key);
for(const view of [animes,animes])for(const status of ['','Completed','Watching','Plan to Watch']){
 const selected=view.filter(a=>!status||a.status===status),order=new Map(selected.map((a,i)=>[String(a.id),i]));
 assert.deepEqual(Array.from(ctx.visibleGroups(view,order),g=>g.key),getOld(view,order),'Grouping/order mismatch');
}
const revised=animes.slice(0,400);assert.deepEqual(Array.from(ctx.visibleGroups(revised,new Map(revised.map((a,i)=>[String(a.id),i]))),g=>g.key),getOld(revised,new Map(revised.map((a,i)=>[String(a.id),i]))),'Cache must invalidate on library reload');
// Legacy repair: index must preserve removed item order, recovery records, and exact data.
const progress=require('../lib/progress-reconciliation'),{parseBetaSeriesEpisode}=require('../lib/betaseries-progress');
function originalRepair(input){const n=v=>Math.max(0,Number(v)||0),items=input.map(a=>({...a})),removed=[],corrected=[];
 for(const root of items){const explicitSeen=root.episodesSeenExplicit?root.episodesSeen:undefined,marker=parseBetaSeriesEpisode(root.betaseriesEpisode);if(!root.malId||!progress.continuous(root)||marker.season<2)continue;
 const family=String(root.betaseriesSeriesId||root.betaseriesId||'');const children=items.filter(a=>a!==root&&family&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&!a.malId&&!a.anilistId&&(a.tags||[]).includes('saison à identifier'));
 if(root.importProgressVersion===55&&!children.length)continue;
 const row=root.betaseriesSourceRow||{},completed=Number(String(row.status??root.betaseriesStatus??'').replace(',','.'))>=100||(String(row.remaining??'').trim()==='0');const next={betaseriesProgressScope:'season-marker',betaseriesSeason:1,manualSeasonNumber:0,importProgressVersion:55,unallocatedEpisodes:0,betaseriesOverflowEpisodes:0,needsSequelCheck:false,progressUnresolved:!completed};if(!root.seasonStatusExplicit&&completed&&n(root.episodesTotal)){next.status='Completed';next.episodesSeen=String(root.episodesTotal);next.progressWarning='';}else if(root.status!=='Completed'){next.episodesSeen='';next.progressWarning='La position '+root.betaseriesEpisode+' est conservée ; son équivalent global reste à confirmer.';}
 Object.assign(root,next);root.tags=(root.tags||[]).filter(t=>!/saison à identifier|progression à vérifier|non trouvé auto/.test(t));if(explicitSeen!==undefined)root.episodesSeen=explicitSeen;if(children.length)root.importRecoveryRecords=[...(root.importRecoveryRecords||[]),...children];removed.push(...children);corrected.push(root.id);
 }return {items:items.filter(a=>!removed.includes(a)),removed,corrected,changed:corrected.length>0};}
const fixture=[...animes.slice(0,500)].map(a=>({...a,betaseriesSeriesId:String((a.id%42)+1),betaseriesEpisode:'S02E04',betaseriesProgressScope:a.id%4===0?'season-marker':'',importProgressVersion:a.id%5===0?54:55,malId:a.id%4===0?235:a.malId,betaseriesStatus:a.id%2===0?'100':'40'}));
for(let i=1;i<=42;i++)fixture.push({id:5000+i,malId:'',tags:['saison à identifier'],betaseriesSeriesId:String(i),episodesSeen:'2'});
assert.deepEqual(progress.repair(fixture),originalRepair(fixture),'BetaSeries migration must not change any imported or recovery data');
for(const f of [[],[...animes.slice(0,3)],[...fixture,{id:9999,betaseriesSeriesId:'',tags:['saison à identifier']}]] )assert.deepEqual(progress.repair(f),originalRepair(f));
// Anime DNA: compare optimized top-five picks against the original full-sort
// algorithm (including equal scores, missing posters and invalid old values).
const dnaSrc=fs.readFileSync(path.join(root,'public/alm-v2.js'),'utf8');
function extractDna(start,end){const from=dnaSrc.indexOf(start),to=dnaSrc.indexOf(end,from);assert(from>=0&&to>from,start);return dnaSrc.slice(from,to);}
const dna={window:{location:{origin:'http://127.0.0.1:3123'}},URL};vm.createContext(dna);
vm.runInContext(extractDna('function safeUrlV2(', '\nfunction openLibraryWithGenreV2(')
  +extractDna('function normalizeRecoGenreKeyV2(', '\nasync function getRecoGenrePayloadV2(')
  +extractDna('function selectDnaPortalEntriesV2(', '\nfunction buildDnaPortalPostersHtmlV2(')
  +'\nthis.select=selectDnaPortalEntriesV2;this.safeUrl=safeUrlV2;this.norm=normalizeRecoGenreKeyV2;',dna);
function originalDna(animes,allEntries,rawFocusGenre=''){
 const all=Array.isArray(animes)?animes:[],focusKey=dna.norm(rawFocusGenre),priorityGenres=[],usedGenres=new Set();
 const pushGenre=genre=>{const value=String(genre||'').trim();if(!value)return;const key=dna.norm(value);if(!key||usedGenres.has(key))return;usedGenres.add(key);priorityGenres.push(value);};
 if(focusKey){const matchedEntry=(Array.isArray(allEntries)?allEntries:[]).find(([genre])=>dna.norm(genre)===focusKey);pushGenre(matchedEntry?.[0]||rawFocusGenre);}
 (Array.isArray(allEntries)?allEntries:[]).slice(0,6).forEach(([genre])=>pushGenre(genre));
 const picks=[],usedIds=new Set(),rank=anime=>{const own=Number(anime?.score||0),pub=Number(anime?.publicScore||0),poster=dna.safeUrl(anime?.poster||anime?.imageUrl)!=='#'?1:0;return poster*10000+own*100+pub;};
 for(const genre of priorityGenres){const key=dna.norm(genre),candidate=all.filter(anime=>!usedIds.has(Number(anime?.id||0))).filter(anime=>Array.isArray(anime?.genres)&&anime.genres.some(item=>dna.norm(item)===key)).sort((a,b)=>rank(b)-rank(a)||String(a?.title||'').localeCompare(String(b?.title||''),'fr'))[0];if(!candidate)continue;usedIds.add(Number(candidate?.id||0));picks.push({anime:candidate,genre});if(picks.length>=5)break;}
 if(picks.length<5)all.filter(anime=>!usedIds.has(Number(anime?.id||0))).sort((a,b)=>rank(b)-rank(a)||String(a?.title||'').localeCompare(String(b?.title||''),'fr')).slice(0,5-picks.length).forEach(anime=>{usedIds.add(Number(anime?.id||0));const firstGenre=Array.isArray(anime?.genres)?anime.genres.find(Boolean):'';picks.push({anime,genre:String(firstGenre||'Bibliothèque')});});
 return picks.slice(0,5);
}
const genres=['Fantasy','Adventure','Drama','Comedy','Action','Mystery','Romance'];
const dnaRows=Array.from({length:750},(_,i)=>({id:i+1,title:'Fictional animé '+(i%67),score:i%11,publicScore:i%10,poster:i%3===0?'https://example.invalid/poster-'+i+'.webp':'',genres:i%17===0?[]:[genres[i%7],genres[(i*3)%7]]}));
const dnaEntries=genres.map((genre,i)=>[genre,{count:500-i*50}]);
for(const items of [dnaRows,dnaRows.slice(0,5),[],[...dnaRows.slice(0,50),{id:1001,title:'Invalid legacy score',score:'invalid',genres:['Fantasy']}],dnaRows.map(a=>({...a,score:5,publicScore:5,poster:''}))]){
 for(const focus of ['','Fantasy','Adventure','Unmatched','Drama']){
  const expected=originalDna(items,dnaEntries,focus).map(x=>[x.anime.id,x.genre]);
  const actual=Array.from(dna.select(items,dnaEntries,focus),x=>[x.anime.id,x.genre]);
  assert.deepEqual(actual,expected,`DNA mismatch ${items.length} / ${focus}`);
 }
}
console.log('OK Beta82 performance: 60 library filter states, group ordering/cache invalidation, BetaSeries repair and 25 DNA selection scenarios exactly equivalent; no network or real user data.');
