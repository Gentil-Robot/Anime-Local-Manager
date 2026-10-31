'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JSDOM}=require(process.env.ALM_JSDOM_MODULE||'jsdom');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm64-diagnostic-')),root=path.join(__dirname,'..');
process.env.ALM_DATA_DIR=path.join(directory,'data');process.env.ALM_IMAGES_DIR=path.join(directory,'images');process.env.ALM_RELEASE_SMOKE='1';process.env.ALM_AUTOMATION_STARTUP='0';process.env.ALM_MAINTENANCE_MODE='1';
const configPath=require.resolve('../community-config.json');require.cache[configPath]={id:configPath,filename:configPath,loaded:true,exports:{url:'',publishableKey:''}};
let listener,dom;
(async()=>{
 const api=require('../server'),db=require('../db');await db.whenReady();
 const complete={id:1,title:'Known fixture',malId:'1',status:'Completed',type:'TV',startDate:'2020-01-01',episodesSeen:'12',episodesTotal:'12',synopsis:'An identified anime with complete local information.',genres:['Fantasy'],imageUrl:'https://cdn.myanimelist.net/images/anime/fixture.jpg',needsSequelCheck:true};
 const pending={...complete,id:2,title:'Unidentified fixture — Saison 2',malId:'',manualSeasonNumber:2,needsSequelCheck:true,tags:['saison à identifier']};
 db.writeAllAnimes([complete,pending]);listener=await api.startServer(0);const origin='http://127.0.0.1:'+listener.almPort;
 const get=async path=>{const r=await fetch(origin+path);assert(r.ok);return r.json();};
 const [local,report,issues]=await Promise.all(['/api/diagnostics','/api/support-diagnostic','/api/library/completion-issues'].map(get));
 const seasonIds=issues.items.filter(i=>i.kind==='season').map(i=>i.id);assert.deepEqual(seasonIds,[2]);assert.equal(local.library.provisionalSeasons,1);assert.deepEqual(local.library.provisionalIds,seasonIds);assert.equal(report.library.provisionalSeasons,1);assert(report.dependencies.installed.express);assert(report.locales.fr.total>0);assert(report.services.length>0);
 db.writeAllAnimes([complete]);assert.equal((await get('/api/diagnostics')).library.provisionalSeasons,0,'An obsolete flag on an identified record is not a pending season');
 dom=new JSDOM('<html lang="fr"><body><section id="settingsPanel-storage"><div class="storage-actions"></div></section><section id="almDiagnostics"><div class="settings-disclosure-body"></div></section><button data-alm-diagnostic></button></body></html>',{runScripts:'outside-only',url:origin});const w=dom.window;
 await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
 let account=null;const opened=[];w.ALM_COMMUNITY_T=key=>key;w.ALM_DESIGN={VERSION:require('../package.json').version,language:()=> 'fr'};w.ALM_COMMUNITY={snapshot:()=>account};w.ALM_PUBLIC_FORMS={open:async(_type,_category,{diagnostic})=>opened.push(diagnostic)};
 w.fetch=async()=>({ok:true,json:async()=>({...report,secret:'PRIVATE-SECRET',hostname:'PRIVATE-HOST',library:{...report.library,titles:['PRIVATE-TITLE']},services:[{id:'mal',group:'metadata',configured:true,name:'PRIVATE-NAME',key:'PRIVATE-KEY',url:'https://private.invalid',last:{state:'available',httpStatus:200,latencyMs:12}}]})});
 w.eval(fs.readFileSync(path.join(root,'public/support-diagnostics.js'),'utf8'));
 const first=await w.ALM_SUPPORT.build();assert.equal(first.version,require('../package.json').version);assert.equal(first.sectionsVersion,2);assert(first.locales.fr.total>0&&first.dependencies.installed.express);assert.equal(first.services[0].state,'available');assert(!('community' in first));
 for(const button of w.document.querySelectorAll('[data-alm-diagnostic]')){button.click();await new Promise(r=>setTimeout(r,20));}
 assert.equal(opened.length,3);for(const report of opened)assert.deepEqual(JSON.parse(JSON.stringify({...report,generatedAt:null})),JSON.parse(JSON.stringify({...first,generatedAt:null})), 'Every diagnostic button uses the same builder');
 account={connected:true,confirmed:true,user:{email:'PRIVATE-EMAIL'},own:{profile:{visibility:'friends',display_name:'PRIVATE-NAME'}},sync:{auto:true,dirty:false},notifications:{requests:[],recommendations:[]}};
 const connected=await w.ALM_SUPPORT.build();assert(connected.community.connected);assert.equal(connected.community.pendingRequests,0);
 for(const text of ['PRIVATE-SECRET','PRIVATE-HOST','PRIVATE-TITLE','PRIVATE-NAME','PRIVATE-KEY','PRIVATE-EMAIL','private.invalid'])assert(!JSON.stringify(connected).includes(text));assert(!('provisionalIds' in connected.library));
 console.log('OK Beta64 diagnostics: actual control/diagnostic parity, obsolete flags, complete technical sections, identical buttons, optional connected account and strict redaction.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{dom?.window.close();const api=require('../server');await api.stopMaintenance();await api.closeCommunity();await require('./runtime-cleanup').cleanupRuntime(directory,listener);});
