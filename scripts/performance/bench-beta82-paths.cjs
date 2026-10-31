'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const project=path.resolve(process.argv[2] || path.join(__dirname,'../..'));
const animeSource=fs.readFileSync(path.join(project,'public/app.js'),'utf8');
const filterSlice=animeSource.slice(animeSource.indexOf('function filteredAnimes() {'),animeSource.indexOf('\nfunction renderStats() {'));
if(!filterSlice.startsWith('function filteredAnimes() {')||filterSlice.includes('function renderStats()'))throw Error('Snippet absent');
const statuses=['Completed','Watching','Plan to Watch','On-Hold'];
const animes=[];
const N=5000;
for(let i=0;i<N;i++){const id=i+1;const gen=['Adventure','Fantasy','Drama','Romance'][i%4];animes.push({id,title:'Anime series '+id+' Season '+((i%3)+1),canonicalTitle:'Series '+Math.floor(i/3),localizedTitles:{fr:'Anime '+id,en:'Series '+id},status:statuses[i%4],type:i%6?'TV':'Movie',genres:[gen,'Action'],tags:['Catalogue'],notes:'Episode progress '+i+' and archived viewing notes for this series with some unicode 日本語',studios:['Studio '+i%7],studio:'Studio '+i%7,episodesSeen:i%12,episodesTotal:12,score:i%11,publicScore:i%11,rank:i+1,startDate:'2022-01-01',malId:10000+i});}
const elements={search:{value:''},statusFilter:{value:''},typeFilter:{value:''},genreFilter:{value:''},yearFilter:{value:''},studioFilter:{value:''},sort:{value:'title'},unratedOnly:{checked:false}};
const ctx={animes,activePersonalScoreFilter:0,$:(id)=>elements[id],animeYear:()=> '2022',globalThis:{ALM_TITLES:{title:a=>a.title},ALM_DESIGN:{language:()=> 'fr'}}};vm.createContext(ctx);vm.runInContext(filterSlice+'\nthis.__filteredAnimes=filteredAnimes;',ctx,{filename:'app-filter.js'});
const series=require(path.join(project,'public/series-state.js'));
const repair=require(path.join(project,'lib/progress-reconciliation.js'));
const rankingContext={window:{ALM_SERIES:series}};
vm.createContext(rankingContext);
const cacheStart=animeSource.indexOf('let groupedLibraryInput = null;'),cacheEnd=animeSource.indexOf('\nfunction render() {',cacheStart);
if(cacheStart>=0&&cacheEnd>cacheStart)vm.runInContext(animeSource.slice(cacheStart,cacheEnd)+'\nthis.visible=visibleLibraryGroups;',rankingContext);
function visibleGroups(rows,order){
 if(typeof rankingContext.visible==='function')return rankingContext.visible(rows,order);
 const groups=series.groups(rows).sort((a,b)=>Math.min(...a.items.map(x=>order.get(String(x.id))??Infinity))-Math.min(...b.items.map(x=>order.get(String(x.id))??Infinity)));
 return groups.filter(g=>g.items.some(a=>order.has(String(a.id))));
}
const order=new Map(animes.map((a,i)=>[String(a.id),i]));

const dnaSource=fs.readFileSync(path.join(project,'public/alm-v2.js'),'utf8');
function extract(start,end){const from=dnaSource.indexOf(start),to=dnaSource.indexOf(end,from);if(from<0||to<=from)throw Error('DNA source block missing');return dnaSource.slice(from,to);}
const dnaContext={window:{location:{origin:'http://127.0.0.1:3123'}},URL};vm.createContext(dnaContext);
vm.runInContext(extract('function safeUrlV2(', '\nfunction openLibraryWithGenreV2(')+extract('function normalizeRecoGenreKeyV2(', '\nasync function getRecoGenrePayloadV2(')+extract('function selectDnaPortalEntriesV2(', '\nfunction buildDnaPortalPostersHtmlV2(')+'\nthis.dnaPortal=selectDnaPortalEntriesV2;',dnaContext);
for(let i=0;i<animes.length;i++)animes[i].poster=i%3===0?'https://example.invalid/poster'+i+'.jpg':'';
const dnaEntries=[['Adventure',{count:100}],['Action',{count:80}],['Fantasy',{count:60}],['Drama',{count:50}],['Romance',{count:40}],['Comedy',{count:30}]];
const progressRows=animes.map(a=>({...a,betaseriesEpisode:'S02E10',betaseriesSeriesId:'series-'+a.id,importProgressVersion:55}));for(let i=0;i<140;i++){progressRows[i*8].malId=235;progressRows[i*8].importProgressVersion=54;progressRows[i*8].betaseriesSourceRow={status:100};progressRows.push({id:5001+i,malId:'',anilistId:'',betaseriesSeriesId:'series-'+progressRows[i*8].id,tags:['saison à identifier'],episodesTotal:12});}
function measure(name,fn,repetitions=13,warm=3){const t=[];let r;for(let i=0;i<warm+repetitions;i++){const start=performance.now();r=fn();const dt=performance.now()-start;if(i>=warm)t.push(dt);}t.sort((a,b)=>a-b);const median=t[(t.length-1)>>1],p95=t[Math.min(t.length-1,Math.ceil(t.length*.95)-1)];return {name,runCount:repetitions,medianMs:+median.toFixed(3),p95Ms:+p95.toFixed(3),minMs:+t[0].toFixed(3),maxMs:+t.at(-1).toFixed(3),result:r?.length??r?.items?.length??r?.count??null};}
const tests=[];tests.push(measure('filter_no_search_5000',()=>{elements.search.value='';elements.genreFilter.value='';return ctx.__filteredAnimes();}));tests.push(measure('filter_search_5000',()=>{elements.search.value='anime series 11';elements.genreFilter.value='';return ctx.__filteredAnimes();}));tests.push(measure('filter_genre_search_5000',()=>{elements.search.value='anime series 11';elements.genreFilter.value='Fantasy';return ctx.__filteredAnimes();}));tests.push(measure('series_groups_5000',()=>series.groups(animes),9,2));
tests.push(measure('library_groups_cold_5000',()=>visibleGroups(animes.slice(),order),9,2));
tests.push(measure('library_groups_warm_5000',()=>visibleGroups(animes,order),15,4));
tests.push(measure('dna_portal_5000',()=>dnaContext.dnaPortal(animes,dnaEntries,'Adventure'),11,3));
tests.push(measure('progress_repair_5140',()=>repair.repair(progressRows),7,2));
const obj={project,node:process.version,platform:process.platform,arch:process.arch,cpus:require('node:os').cpus().length,memoryGB:+(require('node:os').totalmem()/1024**3).toFixed(1),scenario:{animeCount:N,repairRows:progressRows.length,artificial:true,environment:'Node synthetic benchmark; no browser DOM, IPC or network'},tests};console.log(JSON.stringify(obj,null,2));
