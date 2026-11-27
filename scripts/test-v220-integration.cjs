'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(!html.includes('id="navLocalMedia"')&&!html.includes('id="localMediaPage"')&&html.includes('data-tab="mediaImportPanel"'),'Files belong in existing import tabs only');
assert(html.includes('id="v220SequelBlock"')&&html.includes('id="cockpitPage"'),'Missing sequels are in Cockpit');
assert(html.includes('v220-features.js')&&html.includes('v220.css'),'Preview assets must load');
assert(main.includes("ipcMain.handle('media-select-and-scan'"),'Native folder picker must own scan');
assert(main.includes("ipcMain.handle('media-associate'"),'Associations must be stored outside server');
assert(preload.includes("mediaSelectAndScan:")&&preload.includes("mediaAssociate:"),'Safe IPC bridge missing');
assert(server.includes("app.get('/api/v220/sequels'"),'Missing local sequel route');
assert(server.includes("const base=db.getMetadataByMalId(Number(row.malId))"),'Sequel source must be existing local metadata');
const store=require('../lib/media-associations');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-v220-links-'));
try{
 const file=path.join(directory,'media.json');
 assert.deepEqual(store.load(file),[]);
 const row=store.record(file,{root:directory,relativePath:'Frieren/Frieren S01E13.mkv',filename:'Frieren S01E13.mkv',malId:55,episodeGuess:13});
 assert.equal(store.summary(file)[0].latestEpisode,13);
 assert.equal(store.load(file)[0].malId,55);
 assert(store.remove(file,row.key));
 assert.deepEqual(store.summary(file),[]);
 assert.throws(()=>store.record(file,{root:'relative',relativePath:'bad',filename:'bad',malId:55}));
}finally{fs.rmSync(directory,{recursive:true,force:true});}
const {window}=new JSDOM(html,{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true});
window.ALM_DESIGN={language:()=> 'fr'};
window._almAnimes=[{id:1,malId:55,status:'Watching',title:'Frieren'}];
window.showV2Page=(page,nav)=>{window.document.getElementById(page)?.classList.remove('hidden');window.document.getElementById(nav)?.classList.add('active');};
let scans=0,links=0,adds=0;
window.animeManager={
 mediaSelectAndScan:async()=>{scans++;return {root:'X:\\Test-VM',files:[{index:0,filename:'Frieren S01E13.mkv',relativePath:'Frieren S01E13.mkv',titleGuess:'Frieren',sizeBytes:1048576,episodeGuess:13,linkedMalId:0}],summary:{videoFiles:1}};},
 mediaAssociate:async(index,id)=>{assert.equal(index,0);assert.equal(id,55);links++;return {key:'test'};},
 mediaDissociate:async()=>{},
 mediaSummary:async()=>[{malId:55,count:links,latestEpisode:13}]
};
window.confirm=()=>true;
window.reloadAnimeLibrary=async()=>{window._almAnimes.push({id:2,malId:56,title:'Frieren II',status:'Plan to Watch'});};
window.fetch=async(url,opts)=>{
 if(url==='/api/v220/sequels')return {ok:true,json:async()=>({items:[{malId:56,title:'Frieren II',sourceTitle:'Frieren'}],scanned:1})};
 if(url==='/api/animes'){assert.equal(JSON.parse(opts.body).status,'Plan to Watch');adds++;return {ok:true,json:async()=>({anime:{title:'Frieren II'}})};}
 throw Error('Unexpected request '+url);
};
window.eval(fs.readFileSync(path.join(root,'public/v220-features.js'),'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
const flush=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
 window.document.getElementById('v220MediaTab').click();
 assert(window.document.querySelector('#importDialog #mediaImportPanel'));
 window.document.getElementById('v220MediaChoose').click();await flush();
 assert.equal(scans,1);
 const row=window.document.querySelector('#v220MediaRows .alm-v220-media-card');
 assert(row&&row.textContent.includes('Frieren S01E13.mkv'));
 const associate=row.querySelector('button.alm-v220-action');assert(associate&&!associate.disabled);
 associate.click();await flush();assert.equal(links,1,'User action should link file locally');
 window.document.getElementById('navCockpit').click();await flush();
 const sequel=window.document.querySelector('#v220SequelRows .alm-v220-sequel');
 assert(sequel&&sequel.textContent.includes('Frieren II'));
 sequel.querySelector('.alm-v220-sequel-add').click();await flush();assert.equal(adds,1,'Explicit user click should add to watchlist');
 console.log('OK V2.2.0: import tab, opt-in PC/NAS scan, local association, missing sequels in Cockpit.');
 window.close();
})().catch(error=>{console.error(error);window.close();process.exitCode=1;});
