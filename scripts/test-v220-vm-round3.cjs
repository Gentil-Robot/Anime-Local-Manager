'use strict';
// Independent functional fixture: import all five statuses, no file data or providers.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {window:w}=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true});
const d=w.document,$=id=>d.getElementById(id),flush=()=>new Promise(r=>setTimeout(r,55));
const statuses=['Watching','Completed','On-Hold','Dropped','Plan to Watch'];
const records=statuses.map((status,i)=>({malId:501+i,title:'Unique title '+String.fromCharCode(65+i),type:'TV',episodes:12}));
const existing={id:99,malId:599,title:'Existing title',status:'Watching',episodesSeen:3,episodesTotal:12};
const all=[...records,existing],adds=[],links=[],detail=[],payloads=[];
w._almAnimes=[existing];
w.ALM_DESIGN={language:()=> 'fr'};w.confirm=()=>true;w.notifyApp=()=>{};
w.ALM_BETA38={preparePayload:async raw=>{payloads.push({...raw});return raw;}};
w.ALM_CATALOG={openRecords:(rows,index,source,context)=>detail.push({rows,index,context})};
w.fetch=async(url,opts)=>{
 if(url==='/api/v220/media-candidates'){const {titles}=JSON.parse(opts.body);assert(titles.every(t=>!t.includes('.avi')&&!t.includes('\\')));
 return {ok:true,json:async()=>({items:Object.fromEntries(titles.map(t=>[t,all.filter(a=>a.title===t)]))})};}
 if(url==='/api/animes'){const body=JSON.parse(opts.body);adds.push(body);return {ok:true,json:async()=>({anime:body})};}
 throw Error('Unexpected request '+url);
};
w.reloadAnimeLibrary=async()=>{const latest=adds.at(-1);if(latest&&!w._almAnimes.some(a=>a.malId===latest.malId))w._almAnimes.push({...latest,id:600+adds.length});};
w.animeManager={mediaSelectAndScan:async()=>({root:'X:\\Fixture',scanId:'round3',summary:{videoFiles:6},files:all.map((a,index)=>({index,filename:a.title+' - 04.avi',relativePath:a.title+' - 04.avi',titleGuess:a.title,episodeGuess:4,seasonGuess:0,sizeBytes:100,confidence:'review'}))}),mediaAssociate:async(index,malId,correction)=>{assert.equal(correction.scanId,'round3');links.push({index,malId,correction});return {key:'fixture'};},mediaSummary:async()=>[],mediaSaved:async()=>[]};
w.eval(read('public/watch-status.js'));w.eval(read('public/v220-media-match.js'));w.eval(read('public/v220-features.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
(async()=>{try{
 $('v220MediaChoose').click();await flush();
 const cards=()=>[...$('v220MediaRows').querySelectorAll('.alm-v220-media-card')];assert.equal(cards().length,6);
 assert(!$('v220MediaLoadCovers').hidden);
 const cover=cards()[0].querySelector('.alm-v220-media-cover'),img=cover.querySelector('img');
 assert.equal(img.getAttribute('src'),'/api/v220/media-cover/501');
 cover.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));assert.equal(detail.length,1);assert(detail[0].context.localOnly&&detail[0].context.readOnly);
 img.dispatchEvent(new w.Event('error'));$('v220MediaLoadCovers').click();assert.equal(img.getAttribute('src'),'/api/v220/media-cover/501?load=1');
 for(let i=0;i<statuses.length;i++){const card=cards()[i],select=card.querySelector('.alm-v220-media-status');assert(!select.disabled);
 assert.deepEqual([...select.options].map(o=>o.value),statuses);select.value=statuses[i];select.dispatchEvent(new w.Event('change',{bubbles:true}));
 const action=card.querySelector('button.alm-v220-action');assert(!action.disabled);action.click();await flush();
 assert.equal(adds[i].status,statuses[i]);assert.equal(adds[i].episodesSeen,statuses[i]==='Completed'?'12':'0');assert.equal(links[i].malId,records[i].malId);}
 const last=cards()[5];assert(last.querySelector('.alm-v220-media-status').disabled);last.querySelector('button.alm-v220-action').click();await flush();
 assert.equal(adds.length,5);assert.equal(links.length,6);assert.equal(payloads.length,5);assert.equal(existing.status,'Watching');assert.equal(existing.episodesSeen,3);
 const M=require('../public/v220-watch-model');const sample=Array.from({length:10},(_,i)=>({id:i+1,status:'Watching',episodesSeen:i<4?i+1:0,episodesTotal:12}));
 assert.equal(M.resumeRows(sample).length,10);assert.equal(M.resumeRows(sample).filter(r=>r.state==='start').length,6);
 const maintenance=require('../lib/maintenance');let checks=0;await maintenance.refreshSeasonAiring({ok:true},{check:async force=>{assert.equal(force,false);checks++;return {error:''};}});assert.equal(checks,1);
 assert.deepEqual(Object.keys(maintenance.DEFAULTS.tasks),['news','seasons','catalog','application']);
 console.log('OK third VM iteration: five media statuses, explicit cover fetch, local read-only details, existing progress, all Watching, scheduled airing cache.');
 }finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
