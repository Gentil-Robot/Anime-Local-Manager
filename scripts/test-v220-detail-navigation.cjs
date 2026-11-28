'use strict';
// Independent DOM fixtures for the precise navigation paths requested in VM feedback.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('public/alm-v2.js'),lexicon=read('public/lexicon.js');
const segment=(s,start,end)=>{const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert(a>=0&&b>a);return s.slice(a,b);};
const {window:w}=new JSDOM('<div id="genres"><div class="reco-card"><img class="reco-card-thumb"></div><div class="reco-card"><div class="reco-card-thumb-ph">?</div></div></div><div id="other"><img class="reco-card-thumb"></div><div id="lexicon" data-lexicon-example-ids="52,53"></div>',{url:'http://127.0.0.1:3123/',runScripts:'outside-only'});
const d=w.document,opens=[];
w.ALM_CATALOG={openRecords:(rows,index,source)=>opens.push({rows,index,source})};
try{
 w.eval(segment(app,'function wireGenreDetailsV220(container,items){','function wireAdd(container){'));
 const rows=[{malId:52,title:'First',imageUrl:'/images/first.jpg'},{malId:53,title:'Second'}];
 w.wireGenreDetailsV220(d.getElementById('genres'),rows);
 const buttons=d.querySelectorAll('#genres button');assert.equal(buttons.length,2);
 buttons[1].click();assert.equal(opens[0].rows[opens[0].index].malId,53);assert.equal(opens[0].rows[0].poster,'/images/first.jpg');assert.equal(opens[0].rows[1].poster,'/api/v2/reco/image/53');
 assert.equal(d.querySelectorAll('#other button').length,0);assert.equal((app.match(/wireGenreDetailsV220\(resultsEl,items\)/g)||[]).length,1);
 w.lexiconExampleCache=new Map([[52,{malId:52,title:'First',imagePath:'/images/first.jpg',year:2026,type:'TV',malUrl:'https://myanimelist.net/anime/52'}],[53,{malId:53,title:'Second',year:2025,type:'TV'}]]);
 w.designText=k=>k;w.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 w.eval(segment(lexicon,'function renderLexiconExampleContainer(container) {','async function fetchLexiconExampleBatch(ids)'));
 w.renderLexiconExampleContainer(d.getElementById('lexicon'));
 assert.equal(d.querySelectorAll('#lexicon a').length,0);assert.equal(d.querySelectorAll('#lexicon button').length,2);
 d.querySelector('#lexicon [data-example-id="52"]').click();assert.equal(opens[1].rows[opens[1].index].malId,52);assert.equal(opens[1].rows[0].poster,'/images/first.jpg');
 const calendar=read('public/beta39.js'),detail=read('public/discovery.js');
 assert(calendar.includes("forgetDetail?.('calendarDetail')"));assert(calendar.includes("poster:item.anime?.poster||item.anime?.imageUrl||item.poster||''"));
 assert(detail.includes("'/api/cover-cache/'+malId"));assert(detail.includes("'/api/v2/lexicon/example-image/'+malId"));
 console.log('OK genre-only and dictionary internal detail navigation, exact record gallery, and calendar detail cleanup.');
}finally{w.close();}
