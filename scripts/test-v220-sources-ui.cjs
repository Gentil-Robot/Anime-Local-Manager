'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {window:w}=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true}),d=w.document,$=id=>d.getElementById(id);
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
const wait=()=>new Promise(resolve=>setTimeout(resolve,25));
const anime={id:7,malId:42,title:'First',status:'Watching',episodesSeen:3,episodesTotal:12},other={id:8,malId:43,title:'Second',status:'Plan to Watch'};
w._almAnimes=[anime,other];let lang='fr',display='always',favorite=null,overviewReads=0,localReads=0,network=0,opened=[],series=null,selected=[];
w.ALM_DESIGN={language:()=>lang};w.ALM_TITLES={title:a=>a.title};w.ALM_SERIES_UI={open:key=>series=key};w.confirm=()=>true;w.fetch=()=>{network++;throw Error('No network');};
const localKey='a'.repeat(64),streamKey='b'.repeat(32);
const local=[{malId:42,key:localKey,episodeGuess:4,seasonGuess:1,filename:'ep4.mkv',folder:'Fixture'}],streams=[{malId:42,key:streamKey,episode:0,label:'Example',url:'https://example.com/show'}];
w.animeManager={
 sourceOverview:async()=>{overviewReads++;return {display,groups:[{malId:42,localCount:local.length,streamCount:streams.length,favorite}]}},
 sourceDisplaySet:async mode=>{display=mode;return true;},
 sourceOpenFavorite:async(id,ep,kind,key)=>{assert.equal(id,42);assert.equal(ep,4);assert.equal(kind,'stream');assert.equal(key,streamKey);opened.push({kind,id,key});return {ok:true};},
 sourceFavoriteSet:async(id,kind,key)=>{assert.equal(id,42);favorite=kind?{kind,key,episode:kind==='stream'?streams[0].episode:local[0].episodeGuess,end:kind==='stream'?streams[0].episode:local[0].episodeGuess,wholeWork:kind==='stream'&&streams[0].episode===0}:null;return true;},
 mediaSavedFor:async id=>{localReads++;return local.filter(row=>row.malId===id);},streamList:async id=>streams.filter(row=>row.malId===id),
 mediaSelectOne:async(id,ep,season)=>{selected.push({id,ep,season});return {canceled:true};},
 mediaRelabelKey:async(id,key,ep,season)=>{assert.equal(key,localKey);local[0].episodeGuess=ep;local[0].seasonGuess=season;return {ok:true};},
 mediaOpenKey:async(id,key)=>{opened.push({kind:'local',id,key});return {ok:true};},
 mediaRemoveKey:async()=>true,streamPut:async input=>{assert.equal(input.malId,42);return {key:streamKey};},streamRemove:async()=>true,
 streamOpen:async(id,key)=>{opened.push({kind:'stream',id,key});return {ok:true};}
};
$('animeGrid').innerHTML='<article class="card" data-anime-id="7"><div class="actions"><button data-action="edit">Edit</button><button data-action="delete">Delete</button></div></article><article class="card" data-anime-id="8" data-series-key="series:8" data-source-mal-ids="42,43"><div class="actions"><button data-action="delete">Delete</button></div></article>';
w.eval(read('public/v220-sources.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
const trigger=id=>d.querySelector('[data-anime-id="'+id+'"] .alm-source-trigger'),action=(row,key)=>row.querySelector('[data-source-action="'+key+'"]');
(async()=>{try{
 await wait();assert.equal(overviewReads,1);assert.equal(localReads,0);assert(trigger(7)&&trigger(8));
 trigger(8).click();assert.equal(series,'series:8');trigger(7).click();await wait();
 const dialog=$('almSourceDialog');assert(dialog.open);assert.equal(localReads,1);
 assert(dialog.textContent.includes('ep4.mkv'));assert(dialog.textContent.includes('Example'));
 action(dialog,'choose-local').click();await wait();assert.equal(selected[0].id,42);assert.equal(selected[0].ep,4);assert.equal(anime.episodesSeen,3);
 let streamRow=dialog.querySelector('[data-source-key="'+streamKey+'"]');action(streamRow,'favorite').click();await wait();assert.equal(favorite.kind,'stream');
 assert(action(dialog,'open-favorite'));action(dialog,'open-favorite').click();await wait();assert.equal(opened.at(-1).key,streamKey);
 const quick=w.ALM_SOURCES.createFavoriteButton(anime,4);assert(quick);quick.click();await wait();assert.equal(opened.at(-1).kind,'stream');assert.equal(anime.episodesSeen,3);
 dialog.close();const before=overviewReads,stableTrigger=trigger(7);for(let i=0;i<5;i++)w.dispatchEvent(new w.CustomEvent('alm:library-rendered'));assert.equal(overviewReads,before,'Card rendering does not read sources from disk');assert.strictEqual(trigger(7),stableTrigger,'Keep the action node and keyboard focus');assert.equal(d.querySelectorAll('#animeGrid .alm-source-trigger').length,2);
 const radio=mode=>d.querySelector('input[data-source-display="'+mode+'"]');
 radio('details').click();await wait();assert(trigger(7).hidden);assert(!w.ALM_SOURCES.createButton(anime).hidden);
 radio('off').click();await wait();assert(w.ALM_SOURCES.createButton(anime).hidden);assert.equal(w.ALM_SOURCES.createFavoriteButton(anime,4),null);
 radio('associated').click();await wait();assert(!trigger(7).hidden);assert(!trigger(8).hidden,'Grouped seasons count associated titles');
 radio('always').click();await wait();
 const labels={fr:'Sources',en:'Sources',es:'Fuentes',de:'Quellen',ja:'視聴元','pt-BR':'Fontes','zh-CN':'来源'};
 for(const [language,expected] of Object.entries(labels)){lang=language;w.dispatchEvent(new w.Event('alm:language-changed'));assert.equal(trigger(7).textContent,expected);assert($('v220SourcesSearch').placeholder);}
 lang='fr';w.dispatchEvent(new w.Event('alm:language-changed'));
 $('importDialog').showModal();$('v220SourcesPanel').hidden=false;w.dispatchEvent(new w.CustomEvent('alm:import-tab-changed',{detail:{panel:'v220SourcesPanel'}}));await wait();assert.equal($('v220SourcesList').querySelectorAll('[data-mal-id]').length,1);
 $('v220SourcesSearch').value='not found';$('v220SourcesSearch').dispatchEvent(new w.Event('input'));assert.equal($('v220SourcesList').querySelectorAll('[data-mal-id]').length,0);
 assert.equal(network,0);assert.equal(anime.episodesSeen,3);console.log('OK sources UI: cards, grouped seasons, explicit open, favorite, display settings, central search, translations, no automatic network or progress writes.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
