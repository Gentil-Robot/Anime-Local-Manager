'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('public/index.html');
for(const id of ['v220WatchRails','v220RecentRail','v220RecentTitle','v220RecentRows','v220RecentEmpty','v220RecentRefresh','v220ResumeRail','v220ResumeRows','v220ResumeEmpty']){
 assert(html.includes('id="'+id+'"'),'Watch rail markup missing: '+id);
}
assert(html.indexOf('src="/v220-watch-model.js"')<html.indexOf('src="/v220-watch-rails.js"'),'The selector module must load before the UI');
assert(!html.includes('id="cockpitPage"'),'Do not introduce a duplicate dashboard');
assert(read('public/v220.css').includes('body.alm-v2-active .alm-watch-rails'),'Rails must hide on existing subpages');
const {window}=new JSDOM(html,{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true});
window.ALM_DESIGN={language:()=> 'fr'};
window.ALM_TITLES={title:a=>a.title};
window.matchMedia=()=>({matches:false});
const watched=[
 {id:7,malId:321,title:'Série d’essai',poster:'https://s4.anilist.co/file.jpg',status:'Watching',episodesSeen:'4',episodesTotal:'12'},
 {id:9,title:'Pas encore commencé',status:'Watching',episodesSeen:'0',episodesTotal:24},
 {id:10,title:'Terminé',status:'Completed',episodesSeen:'12',episodesTotal:12}
];
window._almAnimes=watched;
let selected=null,requests=0,explicitChecks=0;
window.openEdit=anime=>{selected=anime;};
window.fetch=async (url,options)=>{if(url==='/api/airing/check'){assert.equal(options?.method,'POST');explicitChecks++;}else assert.equal(url,'/api/airing');requests++;return {ok:true,json:async()=>({checkedAt:new Date().toISOString(),items:[
 {animeId:7,episode:5,airingAt:Math.floor(Date.now()/1000)-40,source:'AniList'},
 {animeId:7,episode:6,airingAt:Math.floor(Date.now()/1000)-20,source:'AniList'},
 {animeId:7,episode:7,airingAt:Math.floor(Date.now()/1000)+100,source:'AniList'}
]})};};
window.eval(read('public/v220-watch-model.js'));
window.eval(read('public/v220-watch-rails.js'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
const flush=()=>new Promise(resolve=>setTimeout(resolve,35));
(async()=>{
 await flush();
 const rails=window.document.getElementById('v220WatchRails');
 assert(!rails.hidden,'Display rails inside existing library');
 assert.equal(window.document.querySelectorAll('#v220RecentRows .alm-watch-card').length,1);
 assert.equal(window.document.querySelectorAll('#v220ResumeRows .alm-watch-card').length,1);
 assert(window.document.getElementById('v220RecentRows').textContent.includes('NOUVEAU +2'),'Badge must count only aired and unviewed episodes');
 assert(window.document.getElementById('v220ResumeRows').textContent.includes('Épisode 5'));
 const img=window.document.querySelector('#v220ResumeRows img');
 assert(img&&img.getAttribute('src')==='/api/cover-cache/321','Reuse ALM existing on-demand cover cache');
 watched[0].poster='/images/offline-cover.jpg';
 window.dispatchEvent(new window.CustomEvent('alm:library-rendered',{detail:{view:'Watching'}}));
 assert.equal(window.document.querySelector('#v220ResumeRows img').getAttribute('src'),'/images/offline-cover.jpg','Existing offline ALM image files must display');
 watched[0].poster='https://s4.anilist.co/file.jpg';
 window.dispatchEvent(new window.CustomEvent('alm:library-rendered',{detail:{view:'Watching'}}));
 window.document.querySelector('#v220ResumeRows .alm-watch-card').click();
 assert.strictEqual(selected,watched[0],'Click should open existing ALM record without marking it seen');
 assert.equal(watched[0].episodesSeen,'4');
 assert(requests>=1&&requests<=2,'Automatic display reads existing cached airing data');
 window.document.getElementById('v220RecentRefresh').click();await flush();
 assert.equal(explicitChecks,1,'Only an explicit refresh should call the existing online airing check');
 window.dispatchEvent(new window.CustomEvent('alm:library-rendered',{detail:{view:'Plan to Watch'}}));
 assert(rails.hidden,'Do not duplicate rails in To Watch');
 window.dispatchEvent(new window.CustomEvent('alm:library-rendered',{detail:{view:'Watching'}}));
 assert(!rails.hidden,'Existing In Progress page must show rails');
 window.document.body.classList.add('alm-v2-active');
 window.document.getElementById('navAbout').click();
 assert(rails.hidden,'Other services should not display library rails');
 window.close();
 console.log('OK V2.2 watch rails: 7 languages asset, real episode counts, private cache images, En cours navigation and non-mutating cards.');
})().catch(e=>{console.error(e);window.close();process.exitCode=1;});
