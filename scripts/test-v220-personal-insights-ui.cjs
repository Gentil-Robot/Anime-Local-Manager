'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html');
for(const id of ['v220ScoreBoard','v220ScoreLanes','v220ScoreFilter'])
 assert(html.includes('id="'+id+'"'),'Missing upgrade control '+id);
assert(html.indexOf('src="/v220-personal-insights-model.js"')<html.indexOf('src="/v220-personal-insights.js"'));
assert(html.includes('id="memoryPage"')&&html.includes('id="dnaPage"'));assert(!html.includes('id="v220PersonalTimeline"'),'Original Mes souvenirs only');
const {window}=new JSDOM(html,{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true});
const library=[
 {id:1,malId:15,title:'Test Anime',score:9,status:'Completed',startDate:'2020-01-01',completedOn:'2026-08-15',watchEvents:[{id:'a',date:'2026-08-10',episodes:2}],poster:'/images/test-art.jpg'},
 {id:2,malId:16,title:'Other',score:'',status:'Watching',startDate:'2010-01-01'}
];
let opened=0,network=0;
window._almAnimes=library;
window.ALM_I18N={getLanguage:()=> 'fr'};
window.ALM_TITLES={title:a=>a.title};
window.openEdit=a=>{assert.equal(a.id,1);opened++;};
window.fetch=()=>{network++;throw Error('No internet should be accessed by personal dashboards');};
window.eval(read('public/v220-personal-insights-model.js'));
window.eval(read('public/v220-personal-insights.js'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
(async()=>{
 const doc=window.document;
 const board=doc.getElementById('v220ScoreBoard');board.open=true;board.dispatchEvent(new window.Event('toggle'));
 assert(doc.getElementById('v220ScoreSummary').textContent.includes('1 notés'),'Local score summary should be accurate');
 assert(doc.querySelectorAll('.alm-v220-score-lane').length===2,'Only rated and unrated occupied lanes display');
 const poster=doc.querySelector('.alm-v220-score-poster');
 assert(poster.getAttribute('aria-label').includes('Test Anime'));
 poster.click();assert.equal(opened,1,'Poster should open existing anime editor');
 doc.getElementById('v220ScoreFilter').value='unrated';
 doc.getElementById('v220ScoreFilter').dispatchEvent(new window.Event('change'));
 assert.equal(doc.querySelectorAll('.alm-v220-score-lane').length,1,'Score filter operates only on existing DNA');
 assert.equal(doc.querySelector('#v220ScoreLanes img').getAttribute('src'),'/api/cover-cache/16','Identified anime without poster should use local managed cache');
 assert(!doc.getElementById('v220PersonalTimeline'),'No duplicate timeline');
 assert.equal(network,0,'No browsing or third-party image fetching from user data timeline');
 assert.equal(library[0].score,9);assert.equal(library[0].completedOn,'2026-08-15');
 window.close();
 console.log('OK V2.2 UX: DNA score board, managed cover fallback, original Memories and no data writes.');
})().catch(error=>{console.error(error);window.close();process.exitCode=1;});
