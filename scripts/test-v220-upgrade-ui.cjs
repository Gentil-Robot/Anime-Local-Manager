'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html');
for(const id of ['v220SavedRows','v220Connectivity','v220MissingRows','v220GoWatching','v220GoSeasons'])
 assert(html.includes('id="'+id+'"'),'Missing local-first UI: '+id);
assert(html.indexOf('/v220-media-match.js')<html.indexOf('/v220-features.js'));
assert(html.indexOf('/v220-episode-gaps.js')<html.indexOf('/v220-features.js'));
const {window}=new JSDOM(html,{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true});
const library=[
 {id:1,malId:11,title:'Frieren',status:'Watching',manualSeasonNumber:1,episodesSeen:10,episodesTotal:28},
 {id:2,malId:12,title:'Frieren',status:'Watching',manualSeasonNumber:2,episodesSeen:2,episodesTotal:12}
];
window.ALM_DESIGN={language:()=> 'fr'};
window._almAnimes=library;
window.showV2Page=(page)=>{window.document.getElementById(page)?.classList.remove('hidden');};
window.notifyApp=()=>{};
window.fetch=async url=>{if(url==='/api/v220/sequels')return {ok:true,json:async()=>({items:[]})};throw Error('unexpected network '+url);};
let openCount=0,associationCount=0;
window.animeManager={
 mediaSummary:async()=>[{malId:11,count:2,latestEpisode:13,episodes:[11,13]}],
 mediaSaved:async()=>[{key:'a'.repeat(64),malId:11,episodeGuess:11,filename:'Frieren S01E11.mkv',folder:'Series',legacy:false}],
 mediaOpenEpisode:async(id,ep)=>{assert.equal(id,11);assert.equal(ep,11);openCount++;return {ok:true,filename:'Frieren S01E11.mkv'};},
 mediaSelectAndScan:async()=>({root:'D:\\MyAnime',files:[
  {index:0,filename:'Frieren S01E11.mkv',relativePath:'Frieren S01E11.mkv',titleGuess:'Frieren',seasonGuess:1,episodeGuess:11,sizeBytes:1000},
  {index:1,filename:'Frieren - 11.mkv',relativePath:'Frieren - 11.mkv',titleGuess:'Frieren',seasonGuess:0,episodeGuess:11,sizeBytes:1000},
  {index:2,filename:'Naruto S01E03.mkv',relativePath:'Naruto S01E03.mkv',titleGuess:'Naruto',seasonGuess:1,episodeGuess:3,sizeBytes:1000}
 ],summary:{videoFiles:3}}),
 mediaAssociate:async(index,malId)=>{assert.equal(index,0);assert.equal(malId,11);associationCount++;return {key:'a'.repeat(64)};},
 mediaDissociate:async()=>true
};
window.eval(read('public/v220-media-match.js'));
window.eval(read('public/v220-episode-gaps.js'));
window.eval(read('public/v220-features.js'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
const flush=()=>new Promise(resolve=>setTimeout(resolve,35));
(async()=>{
 await flush();
 assert(window.document.querySelector('#v220SavedRows').textContent.includes('Frieren S01E11.mkv'),'Saved links should be visible without rescanning or Internet');
 assert(window.document.querySelector('#v220MissingRows').textContent.includes('12'),'Only gaps between linked 11 and 13 are reported');
 const opener=window.document.querySelector('#v220SavedRows button');
 assert(opener&&!opener.disabled);opener.click();await flush();assert.equal(openCount,1,'File open requires explicit action');
 window.document.getElementById('navLocalMedia').click();
 window.document.getElementById('v220MediaChoose').click();await flush();
 const cards=[...window.document.querySelectorAll('#v220MediaRows .alm-v220-media-card')];
 assert.equal(cards.length,3);
 const exact=cards[0].querySelector('button.alm-v220-action');
 assert(exact&&!exact.disabled,'Exact known-season match is suggested for confirmation');
 const ambiguous=cards[1].querySelector('button.alm-v220-action');
 assert(ambiguous.disabled,'A title shared by two seasons must not be preselected');
 const choices=[...cards[1].querySelector('select').options].map(o=>o.value);
 assert(choices.includes('11')&&choices.includes('12'),'Both candidate seasons are offered for review');
 const unrelated=cards[2].querySelector('button.alm-v220-action');
 assert(unrelated.disabled,'A substring title must not auto-link to a different anime');
 exact.click();await flush();assert.equal(associationCount,1);
 Object.defineProperty(window.navigator,'onLine',{value:false,configurable:true});
 window.dispatchEvent(new window.Event('offline'));
 assert(window.document.getElementById('v220Connectivity').textContent.includes('Hors connexion'));
 assert(window.document.getElementById('v220SavedRows').textContent.includes('Frieren'));
 window.close();
 console.log('OK V2.2 UX: offline persisted links, local file action, verified episode gaps, ambiguous matching and user-only associations.');
})().catch(error=>{console.error(error);window.close();process.exitCode=1;});
