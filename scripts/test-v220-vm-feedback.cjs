'use strict';
// Regression against reported filenames and all five status choices. Fixtures only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const {guessEpisode}=require('../lib/local-media-index'),root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const names=['[EroGaKi-Team]_Ayakashi_04_[5B8549C1].avi','[Kyuu-F] Mugen no Juunin 07 vostfr .avi','[MFF-T]_Malice_Doll_OAV.avi'];
const records=[{malId:101,title:'Ayakashi',type:'TV',startDate:'2006-01-01',episodes:12},{malId:102,title:'Ayakashi',type:'TV',startDate:'2007-01-01',episodes:12},{malId:103,title:'Mugen no Juunin',type:'TV',episodes:13},{malId:104,title:'Malice@Doll',type:'OVA',episodes:3}];
const fixture=Object.fromEntries([['Ayakashi',records.slice(0,2)],['Mugen no Juunin',[records[2]]],['Malice Doll',[records[3]]],['Malice',[records[3]]]]);
const {window:w}=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true});
const d=w.document,$=id=>d.getElementById(id),flush=(ms=60)=>new Promise(resolve=>setTimeout(resolve,ms));
const adds=[],links=[];let requestCount=0,lookupResolve=null;
w._almAnimes=records.map((a,i)=>({...a,id:i+1,status:'Watching'}));
w.ALM_DESIGN={language:()=> 'fr'};w.confirm=()=>true;w.notifyApp=()=>{};
w.ALM_BETA38={preparePayload:async payload=>payload};
w.ALM_ADD_LABEL=status=>'Ajouter · '+w.ALM_WATCH_STATUS.label(status);
const statuses=['Watching','Completed','On-Hold','Dropped','Plan to Watch'];
const sequels=statuses.map((status,i)=>({malId:201+i,title:'Suite '+i,sourceTitle:'Origine '+i,episodes:12}));
w.fetch=async(url,opts)=>{
 if(url==='/api/v220/media-candidates'){
  const body=JSON.parse(opts.body);assert.deepEqual(Object.keys(body),['titles']);
  assert(body.titles.every(t=>!t.includes('.avi')&&!t.includes('\\')&&!t.includes('[EroGaKi')));
  requestCount++;
  if(body.titles.includes('Malice'))await new Promise(resolve=>lookupResolve=resolve);
  return {ok:true,json:async()=>({items:Object.fromEntries(body.titles.map(t=>[t,fixture[t]||[]]))})};
 }
 if(url==='/api/v220/sequels')return {ok:true,json:async()=>({items:sequels})};
 if(url==='/api/animes'){const body=JSON.parse(opts.body);adds.push(body);return {ok:true,json:async()=>({anime:body})};}
 throw Error('Unexpected request '+url);
};
w.reloadAnimeLibrary=async()=>{const latest=adds.at(-1);if(latest&&!w._almAnimes.some(a=>a.malId===latest.malId))w._almAnimes.push({...latest,id:300+adds.length});};
w.animeManager={
 mediaSelectAndScan:async()=>({root:'X:\\Fixture',scanId:'fixture-scan',summary:{videoFiles:3},files:names.map((name,index)=>({index,filename:name,relativePath:name,sizeBytes:100,...guessEpisode(name)}))}),
 mediaAssociate:async(index,malId,correction)=>{links.push({index,malId,correction:{...correction}});return {key:'fixture'};},
 mediaSummary:async()=>[],mediaSaved:async()=>[],mediaDissociate:async()=>true
};
w.eval(read('public/watch-status.js'));w.eval(read('public/v220-media-match.js'));w.eval(read('public/v220-features.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
(async()=>{
 $('v220MediaChoose').click();await flush();
 let cards=()=>[...$('v220MediaRows').querySelectorAll('.alm-v220-media-card')];
 assert.equal(cards().length,3);assert.equal(links.length,0);assert(requestCount>0);
 const [a,b,c]=cards(),button=x=>x.querySelector('.alm-v220-action');
 assert(button(a).disabled,'Ambiguous Ayakashi adaptations must not be selected');
 assert.deepEqual([...a.querySelector('select').options].map(o=>o.value),['','101','102']);
 assert.equal(a.querySelectorAll('input[type=number]')[1].value,'4');
 assert.equal(b.querySelectorAll('input[type=number]')[1].value,'7');assert.equal(b.querySelector('select').value,'103');
 assert(button(c).disabled,'No invented OAV episode');
 const search=c.querySelector('input[type=search]');search.value='Malice';search.dispatchEvent(new w.Event('input',{bubbles:true}));
 await flush(280);assert(lookupResolve,'Debounced local lookup');
 c.querySelector('select').value='104';c.querySelector('select').dispatchEvent(new w.Event('change',{bubbles:true}));lookupResolve();await flush();
 assert.equal(c.querySelector('select').value,'104','Asynchronous lookup must preserve the user choice');
 const whole=c.querySelector('input[type=checkbox]');whole.checked=true;whole.dispatchEvent(new w.Event('change',{bubbles:true}));assert(!button(c).disabled);
 button(c).click();await flush();assert.equal(links.length,1);
 assert.equal(links[0].malId,104);assert.deepEqual(links[0].correction,{season:0,episode:0,wholeWork:true,scanId:'fixture-scan'});
 const first=cards()[0];first.querySelector('select').value='102';first.querySelector('select').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert(!button(first).disabled);button(first).click();await flush();assert.equal(links[1].malId,102);assert.equal(links[1].correction.episode,4);
 const second=cards()[1];assert(!button(second).disabled);button(second).click();await flush();assert.equal(links[2].correction.episode,7);
 assert.equal(adds.length,0,'Linking existing anime never creates a duplicate');
 $('navCockpit').click();await flush();
 for(let i=0;i<statuses.length;i++){
  const card=[...$('v220SequelRows').querySelectorAll('.alm-v220-sequel')].find(e=>e.textContent.includes('Suite '+i));assert(card);
  const select=card.querySelector('.alm-v220-sequel-status');assert.equal(select.value,'Plan to Watch');
  select.value=statuses[i];select.dispatchEvent(new w.Event('change',{bubbles:true}));card.querySelector('.alm-v220-sequel-add').click();await flush();
  assert.equal(adds[i].status,statuses[i]);assert.equal(adds[i].episodesSeen,statuses[i]==='Completed'?'12':'0');
 }
 assert.equal(new Set(adds.map(a=>a.malId)).size,5);
 assert.equal($('v220SequelRows').querySelectorAll('.alm-v220-sequel').length,0);
 console.log('OK V2.2 VM feedback: reported filenames, ambiguous identity, async manual selection, OAV whole-file link, scan token, all statuses and deduplication.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>w.close());
