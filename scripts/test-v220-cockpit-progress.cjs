'use strict';
// Run the real shared catalogue component and the Cockpit renderer with local
// fixture records; only the HTTP transport and unrelated catalogue init are mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {window:w}=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true});
const d=w.document,$=id=>d.getElementById(id),frame=()=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
const record={id:7,malId:321,title:'Fictional series',status:'Watching',episodesSeen:'1',episodesTotal:'2',poster:'/images/fixture.jpg'};
const second={id:9,malId:322,title:'Unknown total',status:'Watching',episodesSeen:'0',episodesTotal:''};
let state=[record,second].map(a=>({...a})),writes=[],opens=0,failed=false,release=null,undoBefore=null;
const text={minusEpisode:'Retirer un épisode vu',plusEpisode:'Ajouter un épisode vu',searchEpisodes:'Épisodes',finishAnime:'Marquer comme terminé',undo:'Annuler'};
w.ALM_DESIGN={t:(key)=>text[key]||key,escape:String,language:()=> 'fr',syncView(){}};
w.ALM_TITLES={title:a=>a.title};w.ALM_COUNTDOWN={start:()=>({stop(){},pause(){},resume(){}})};
w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.notifyApp=()=>{};
w.showV2Page=page=>{d.querySelectorAll('.v2-page').forEach(el=>el.classList.add('hidden'));$(page)?.classList.remove('hidden');};
// The full shared module exposes its component before unrelated discovery init.
const add=d.addEventListener.bind(d);const ready=Object.getOwnPropertyDescriptor(d,'readyState');
Object.defineProperty(d,'readyState',{configurable:true,value:'loading'});
d.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')add(type,...args);};
w.eval(read('public/catalog.js'));d.addEventListener=add;
if(ready)Object.defineProperty(d,'readyState',ready);else delete d.readyState;
const undo=d.createElement('div');undo.id='catalogUndo';undo.hidden=true;d.body.append(undo);
const dialog=d.createElement('dialog');dialog.id='animePeekDialog';d.body.append(dialog);
w.ALM_CATALOG.openRecords=()=>{opens++;};
const other=d.createElement('div');other.id='otherStepper';d.body.append(other);
function paintOther(){other.replaceChildren();const first=state.find(a=>a.id===7);if(first?.status==='Watching')other.append(w.ALM_CATALOG.createEpisodeStepper(first));}
w.load=async()=>{w._almAnimes=state.map(a=>({...a}));paintOther();w.dispatchEvent(new w.Event('alm:collection-changed'));};
w._almAnimes=state.map(a=>({...a}));paintOther();
w.fetch=async(url,opts)=>{
 if(url==='/api/airing')return {ok:true,json:async()=>({items:[]})};
 if(url==='/api/library/undo'){assert.equal(JSON.parse(opts.body).token,'fixture-undo');state=undoBefore.map(a=>({...a}));return {ok:true,json:async()=>({undone:1,skipped:0})};}
 const match=/^\/api\/library\/(\d+)\/(episode|complete)$/.exec(url);assert(match,'Unexpected request '+url);assert.equal(opts.method,'POST');
 const item=state.find(a=>a.id===Number(match[1]));assert(item);
 const body=match[2]==='episode'?JSON.parse(opts.body):{};
 writes.push({id:item.id,type:match[2],...body});
 if(release===null&&writes.length===1)await new Promise(resolve=>release=resolve);
 if(failed){failed=false;return {ok:false,json:async()=>({error:'fixture failure'})};}
 undoBefore=state.map(a=>({...a}));
 if(match[2]==='complete')item.status='Completed';else{assert([-1,1].includes(body.delta));assert(/^\d{4}-\d{2}-\d{2}$/.test(body.watchedOn));item.episodesSeen=String(Number(item.episodesSeen)+body.delta);item.completionPending=Number(item.episodesTotal)>0&&item.episodesSeen===item.episodesTotal;}
 return {ok:true,json:async()=>({anime:{...item},lastEpisode:item.completionPending,undoToken:'fixture-undo'})};
};
w.eval(read('public/v220-watch-model.js'));w.eval(read('public/v220-watch-rails.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
const step=(id)=>d.querySelector('#v220ResumeRows .episode-stepper[data-episode-id="'+id+'"]');
const delta=(node,n)=>node.querySelector('[data-episode-delta="'+n+'"]');
(async()=>{try{
 $('navCockpit').click();await frame();
 assert(step(7)&&step(9));assert(!d.querySelector('#v220RecentRows .episode-stepper'));assert(delta(step(9),-1).disabled);
 const original=step(7),plus=delta(original,1);plus.click();assert.equal(writes.length,1);
 assert(delta(original,-1).disabled&&delta(other,1).disabled,'Both views locked during the same write');
 delta(other,1).click();assert.equal(writes.length,1);assert(release);release();await frame();
 assert.equal(state[0].episodesSeen,'2');assert.equal(state[0].status,'Watching');assert(delta(step(7),1).disabled);assert(step(7).querySelector('.episode-finish'));assert(!delta(step(7),-1).disabled);
 assert.equal(opens,0,'Changing progression never opens the detail card');
 assert(step(7).querySelector('span').textContent.startsWith('2 / 2'));
 delta(step(7),-1).click();await frame();assert.equal(state[0].episodesSeen,'1');assert(!step(7).querySelector('.episode-finish'));
 const failedCount=writes.length;failed=true;delta(step(7),1).click();await frame();assert.equal(writes.length,failedCount+1);assert.equal(state[0].episodesSeen,'1');assert(!delta(step(7),1).disabled,'Retry allowed after a failed write');
 delta(step(7),1).click();await frame();step(7).querySelector('.episode-finish').click();await frame();
 assert.equal(state[0].status,'Completed');assert(!step(7),'Completed anime leaves Watching gallery');
 undo.querySelector('.primary').click();await frame();assert.equal(state[0].status,'Watching');assert(step(7),'Undo restores the record in Cockpit');
 delta(step(9),1).click();await frame();assert.equal(state[1].episodesSeen,'1');assert(!delta(step(9),1).disabled,'Unknown total remains editable');
 step(9).parentElement.querySelector('.alm-watch-card').click();assert.equal(opens,1);
 console.log('OK shared Cockpit progress: same endpoint, cross-view lock, known/unknown limits, error recovery, completion, undo, no implicit playback.');
 }finally{w.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
