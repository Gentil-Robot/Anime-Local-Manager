'use strict';
// Optional real-browser regression: npm product dependencies remain unchanged.
// The library/catalogue/notebook use the real local API and an ephemeral profile.
// Community, ranking and import-review data are fictional; no messages/imports/deletions.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.ALM_PLAYWRIGHT_MODULE||'playwright');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'alm82-pagination-'));
const output=path.resolve(process.env.ALM_UI_EVIDENCE||path.join(__dirname,'../test-artifacts/pagination82'));
const baseline=process.env.ALM_UI_BASELINE_PUBLIC?path.resolve(process.env.ALM_UI_BASELINE_PUBLIC):null;
fs.mkdirSync(output,{recursive:true});
Object.assign(process.env,{ALM_DATA_DIR:profile,ALM_IMAGES_DIR:path.join(profile,'images'),ALM_AUTOMATION_STARTUP:'0'});
fs.mkdirSync(process.env.ALM_IMAGES_DIR);
fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({preloadMetadataOnStart:false,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;
global.fetch=(url,options)=>{let u;try{u=new URL(typeof url==='string'?url:url.url);}catch{return Promise.reject(Error('Offline fixture'));}return u.protocol==='http:'&&u.hostname==='127.0.0.1'?nativeFetch(url,options):Promise.reject(Error('External provider disabled in pagination fixture'));};
const checks=[],errors=[],measurements=[];let host,browser,page,failure=null,version='';
const keepAlive=setInterval(()=>{},1000);
const ownerId='00000000-0000-0000-0000-000000000001',friendId='00000000-0000-0000-0000-000000000002';
let holdCatalog=false,catalogHeld=false,releaseCatalog=null;

(async()=>{
 const server=require('../server'),db=require('../db'),M=require('../public/community-model');await db.whenReady();
 const rows=Array.from({length:250},(_,i)=>({id:i+1,malId:985000+i,title:'Pagination '+String(Math.floor(i/2)+1).padStart(3,'0')+' Season '+(i%2+1),type:'TV',status:i<125?'Watching':'Plan to Watch',episodesSeen:'7',episodesTotal:'12',notes:'Note fictive à préserver '+i,startDate:'2020-04-01',genres:['Fantasy'],studios:['Studio Pagination'],imageUrl:'/assets/design/aster-portrait.webp',malUrl:'https://myanimelist.net/anime/'+(985000+i),personalJournal:{episodes:[],awards:[]}}));
 db.importMetadataRows(rows.map(r=>({malId:r.malId,title:r.title,type:r.type,episodes:12,score:8.3,rank:r.id,startDate:r.startDate,imageUrl:r.imageUrl,genres:r.genres,studios:r.studios,synopsis:'Synopsis fictif. '.repeat(100)})));
 db.writeAllAnimes(rows);
 host=await new Promise(resolve=>{const s=server.app.listen(0,'127.0.0.1',()=>resolve(s));});
 const origin='http://127.0.0.1:'+host.address().port;
 const snapshot=async()=>(await nativeFetch(origin+'/api/notebook').then(r=>r.json())).items.map(r=>({id:r.id,notes:r.notes,personalJournal:r.personalJournal}));
 const before=await snapshot();assert.equal(before.length,250);
 const items=M.items(rows),ownProfile=M.profile({id:ownerId,display_name:'GentilRobot',discriminator:4,visibility:'friends',share_library:true,share_favorites:true,share_watching:true,share_dna:true,featured:[]}),friendProfile=M.profile({id:friendId,display_name:'AmiPagination',discriminator:8,visibility:'friends',share_library:true,featured:[]});
 const own={profile:ownProfile,items,summary:M.summary(items),dna:M.dna(items),activity:[],age:{recorded:true,adult:true,excludeAdult:true}};
 const foreign={...own,profile:friendProfile,comparison:M.compare(items,items)};
 const state={configured:true,connected:true,user:{id:ownerId,email:'fixture@example.test'},identity:ownProfile,own,sync:{dirty:false,publishedAt:'2026-10-20T00:00:00Z',auto:false},notifications:{count:0}};
 const friends={userId:ownerId,relationships:[{id:'00000000-0000-0000-0000-000000000003',requester:ownerId,recipient:friendId,status:'accepted',accepted_at:'2026-10-20T00:00:00Z'}],cards:[friendProfile],libraryStats:{available:true,libraries:1,animes:items.length}};
 const ranking={items:rows.slice(0,41).map((r,i)=>({...r,poster:r.imageUrl,publicScore:8.3,rank:i+1})),source:'local',refreshing:false};
 browser=await chromium.launch({headless:true,executablePath:process.env.ALM_CHROMIUM||undefined,args:['--no-sandbox']});version=await browser.version();
 page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('alm-language','fr');localStorage.setItem('alm.visual.motion','reduced');});
 await page.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());if(u.origin!==origin)return route.abort();
  if(baseline&&!u.pathname.startsWith('/api/')){const rel=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.resolve(baseline,rel);if(file.startsWith(baseline+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){const response=await route.fetch();return route.fulfill({response,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}}
  if(u.pathname==='/api/catalog'&&holdCatalog){catalogHeld=true;await new Promise(resolve=>releaseCatalog=resolve);holdCatalog=false;}
  if(u.pathname==='/api/rankings')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(ranking)});
  if(!u.pathname.startsWith('/api/community/'))return route.continue();
  const name=u.pathname.slice('/api/community/'.length),data=name==='status'?state:name==='friends'?friends:name==='profiles/'+friendId?foreign:name==='recommendations'||name==='sessions'?{items:[]}:null;
  if(request.method()!=='GET'||!data)return route.fulfill({status:400,contentType:'application/json',body:'{"code":"UNEXPECTED_FIXTURE_ACTION"}'});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 async function waitFor(fn,label='application state'){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await page.evaluate(fn))return;await page.waitForTimeout(50);}throw Error('Timed out: '+label);}
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
 async function check(name,fn){await fn();checks.push(name);console.log('OK '+name);}
 async function atTop(name,firstSelector){await settle();await page.waitForTimeout(60);const state=await page.evaluate(selector=>{const n=selector?document.querySelector(selector):null,r=n?.getBoundingClientRect();return {y:document.scrollingElement.scrollTop,windowY:scrollY,firstTop:r?.top,firstBottom:r?.bottom,viewport:innerHeight};},firstSelector);measurements.push({name,...state});assert(state.y<=2&&state.windowY<=2,name+' did not reach the top: '+JSON.stringify(state));if(firstSelector)assert(state.firstBottom>0&&state.firstTop<state.viewport,name+' first item is not visible: '+JSON.stringify(state));}
 async function jump(selector,name,{keyboard=false,first=null,wait=null}={}){const b=page.locator(selector);await b.scrollIntoViewIfNeeded();const previous=await page.evaluate(()=>scrollY);assert(previous>100,name+' must start from a scrolled page');if(keyboard){await b.focus();await page.keyboard.press('Enter');}else await b.click();if(wait)await waitFor(wait,name);await atTop(name,first);checks.push(name);console.log('OK '+name);}
 async function library(status=''){const button=page.locator('.nav-item[data-filter="'+status+'"]'),box=await button.boundingBox();if(box&&box.x<0)await page.locator('#studioMenuButton').click();await button.click();await waitFor(()=>!document.getElementById('animeGrid').classList.contains('hidden')&&document.querySelector('#animeGrid .card'));await settle();}
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await waitFor(()=>window._almAnimes?.length===250&&window.ALM_CATALOG&&window.ALM_COMMUNITY?.snapshot()?.connected&&window.ALM_COMMUNITY.context().friends?.cards?.length===1);
 await page.locator('#seriesView').uncheck();await settle();
 await jump('#libraryPagesBottom [data-page-next]','Library bottom Next returns to page top',{first:'#animeGrid .card',wait:()=>document.getElementById('libraryPagesTop').dataset.page==='2'});
 await jump('#libraryPagesBottom [data-page-last]','Library Last reaches the short final page at its top',{first:'#animeGrid .card',wait:()=>document.getElementById('libraryPagesTop').dataset.page===document.getElementById('libraryPagesTop').dataset.pages});
 await page.locator('#libraryPagesTop [data-page-first]').scrollIntoViewIfNeeded();await page.locator('#libraryPagesTop [data-page-first]').click();await atTop('Library First after short last page','#animeGrid .card');checks.push('Library First after short last page');
 await jump('#libraryPagesBottom [data-page-next]','Library bottom Next works from the keyboard',{keyboard:true,first:'#animeGrid .card'});
 await jump('#libraryPagesBottom [data-page-previous]','Library bottom Previous returns to the page top',{first:'#animeGrid .card',wait:()=>document.getElementById('libraryPagesTop').dataset.page==='1'});
 for(const status of ['Watching','Plan to Watch']){await library(status);await jump('#libraryPagesBottom [data-page-next]',status+' paging reaches the page top',{first:'#animeGrid .card'});}
 await library();await page.locator('#seriesView').check();await settle();
 await check('Grouped seasons are actually present',async()=>assert(await page.locator('#animeGrid .series-show').count()>0));
 await jump('#libraryPagesBottom [data-page-next]','Grouped-series pagination reaches the page top',{first:'#animeGrid .card'});
 await page.evaluate(()=>window.scrollTo({top:600,behavior:'instant'}));await settle();const libraryY=await page.evaluate(()=>scrollY);
 await page.evaluate(()=>{const api=ALM_SCROLL_PROGRESS,original=api.toStart;window.__paginationRepaintProbe={calls:0,original};api.toStart=(...args)=>{window.__paginationRepaintProbe.calls++;return original(...args);};render();});await settle();
 const repaint=await page.evaluate(()=>{const result={after:scrollY,resetCalls:window.__paginationRepaintProbe.calls};ALM_SCROLL_PROGRESS.toStart=window.__paginationRepaintProbe.original;delete window.__paginationRepaintProbe;return result;});measurements.push({name:'Library repaint',before:libraryY,...repaint});
 // Chromium's existing content-visibility anchoring can move pixels on render;
 // this change must not introduce an explicit pagination reset during refresh.
 await check('A normal repaint does not request the new page-navigation reset',async()=>{assert.equal(repaint.resetCalls,0);assert(repaint.after>2);});

 await page.locator('#navMemories').click();await waitFor(()=>document.getElementById('memoryPageEntries').getAttribute('aria-busy')==='false'&&document.querySelector('#memoryPageEntries .memory-card'));
 await jump('#memoryPagePagination [data-memory-page="next"]','Memories Next returns above its filters',{first:'#memoryPage h1',wait:()=>document.getElementById('memoryPageNumber').textContent.startsWith('2 /')});
 await jump('#memoryPagePagination [data-memory-page="last"]','Memories Last returns above its filters',{first:'#memoryPage h1'});
 await jump('#memoryPagePagination [data-memory-page="first"]','Memories First returns above its filters',{first:'#memoryPage h1'});

 await page.locator('#navDiscovery').click();await waitFor(()=>document.getElementById('discoveryForm').getAttribute('aria-busy')==='false');
 await page.locator('#discoveryQuery').fill('Pagination');await page.locator('#discoverySort').selectOption(await page.locator('#discoverySort').inputValue());await page.evaluate(()=>document.getElementById('discoverySort').dispatchEvent(new Event('change')));
 await waitFor(()=>document.getElementById('discoveryForm').getAttribute('aria-busy')==='false'&&document.querySelectorAll('#discoveryResults .catalog-card').length===48);
 await jump('#catalogNext','Catalogue waits for the next page then returns to the top',{first:'#discoveryPage .discovery-heading',wait:()=>document.getElementById('catalogPageNumber').textContent.startsWith('2 /')&&document.getElementById('discoveryForm').getAttribute('aria-busy')==='false'});
 holdCatalog=true;catalogHeld=false;await page.locator('#catalogNext').click();
 for(let i=0;i<100&&!catalogHeld;i++)await page.waitForTimeout(20);assert(catalogHeld,'Delayed catalogue request was observed');
 await library();await page.evaluate(()=>window.scrollTo({top:600,behavior:'instant'}));const savedY=await page.evaluate(()=>scrollY);releaseCatalog();await page.waitForTimeout(350);await settle();
 await check('Late catalogue response does not move a different view',async()=>assert(Math.abs(await page.evaluate(()=>scrollY)-savedY)<=2));

 await page.locator('#navRanking').click();await waitFor(()=>document.querySelectorAll('#rankingResults .ranking-card').length===20);
 await jump('#rankingNext','Ranking Next returns to the page top',{first:'#rankingPage h1',wait:()=>document.getElementById('rankingPageNumber').textContent.startsWith('2 /')});
 await jump('#rankingLast','Ranking Last returns to the page top',{first:'#rankingPage h1'});
 await page.locator('#rankingFirst').click();await atTop('Ranking First after the one-record page','#rankingPage h1');checks.push('Ranking First after the one-record page');
 await page.locator('#navLexicon').click();await page.waitForSelector('#studioLexiconPagerBottom [data-lexicon-next]');
 await jump('#studioLexiconPagerBottom [data-lexicon-next]','Dictionary bottom Next returns above its filters',{first:'#lexiconPage .lexicon-hero'});
 await jump('#studioLexiconPagerBottom [data-lexicon-last]','Dictionary Last returns above its filters',{first:'#lexiconPage .lexicon-hero'});

 await page.evaluate(()=>ALM_COMMUNITY.open('', 'library'));await page.waitForSelector('#commLibraryResults .comm-card');
 await jump('.comm-pagination [data-comm-page="1"]','Own shared library returns to the page top',{first:'#communityPage h1'});
 await page.evaluate(id=>ALM_COMMUNITY.open(id,'library'),friendId);await page.waitForSelector('#commLibraryResults .comm-card');
 await jump('.comm-pagination [data-comm-page="1"]','Friend library returns to the page top',{first:'#communityPage h1'});
 await page.locator('#comm-tab-common').click();await page.waitForSelector('#commLibraryResults .comm-card');
 await jump('.comm-pagination [data-comm-page="1"]','Common-anime list returns to the page top',{first:'#communityPage h1'});

 await page.evaluate(()=>{showV2Page('auditPage','navAudit');_auditCache={ok:true,library:{suspects:[]},quarantine:{items:Array.from({length:17},(_,i)=>({key:'fixture-'+i,sourceTitle:'Quarantaine fictive '+i,classification:'review',sourceImageUrl:'/assets/design/aster-portrait.webp',found:{officialTitle:'Candidat fictif '+i,imageUrl:'/assets/design/aster-portrait.webp'},anime:{title:'Quarantaine fictive '+i,type:'TV'}}))}};_auditRenderOffset=0;auditRenderQuarantinePageV2();});
 await jump('#auditNextPageBottomBtn','Quarantine bottom Next returns to the page top',{first:'#auditPage .audit-hero'});
 await jump('#auditLastPageBottomBtn','Quarantine Last returns to the page top',{first:'#auditPage .audit-hero'});
 await page.evaluate(async()=>{await ALM_COMPLETION_ISSUES.refresh(Array.from({length:85},(_,i)=>({id:i+1,title:'Information fictive '+String(i+1).padStart(3,'0'),missing:['synopsis'],kind:'metadata'})),[]);});
 await jump('#completionIssuesList .completion-actions button:last-child','Missing-information Next returns to the page top',{first:'#auditPage .audit-hero'});

 await library();await page.evaluate(()=>window.scrollTo({top:550,behavior:'instant'}));
 await page.locator('#importXmlBtn').click();await page.locator('#importDialog [data-tab="csvImportPanel"]').click();
 await page.evaluate(()=>{csvPreviewItems=Array.from({length:125},(_,i)=>({sourceTitle:'Import fictif '+i,classification:'anime',found:{officialTitle:'Import fictif '+i,source:'Fixture'},anime:{title:'Import fictif '+i},reason:'Aucune écriture effectuée. '.repeat(4)}));csvPreviewPage=0;csvPreviewSearch='';csvPreviewFilter='all';document.getElementById('csvImportResults').classList.remove('hidden');document.getElementById('csvResultsPlaceholder').classList.add('hidden');document.getElementById('csvResultsPanel').classList.remove('is-empty');renderCsvPreviewRows();});
 await settle();
 async function csvJump(name){await page.locator('#csvPagination [data-csv-page="1"]').scrollIntoViewIfNeeded();await page.evaluate(()=>{const n=document.getElementById('csvImportResults');n.scrollTop=n.scrollHeight;const w=document.querySelector('#importDialog .csv-import-workspace');w.scrollTop=w.scrollHeight;});const background=await page.evaluate(()=>document.scrollingElement.scrollTop);await page.locator('#csvPagination [data-csv-page="1"]').click();await settle();const m=await page.evaluate(()=>({results:document.getElementById('csvImportResults').scrollTop,workspace:document.querySelector('#importDialog .csv-import-workspace').scrollTop,dialog:document.getElementById('importDialog').scrollTop,background:document.scrollingElement.scrollTop,focusInside:document.getElementById('csvImportResults').contains(document.activeElement)}));measurements.push({name,...m});assert(m.results<=2&&m.workspace<=2&&m.dialog<=2,name+': '+JSON.stringify(m));assert.equal(m.background,background,'Dialog pagination preserves background scroll');assert(m.focusInside,'Keyboard focus follows the new CSV records');checks.push(name);console.log('OK '+name);}
 await csvJump('CSV desktop resets its reading containers, preserving the background');
 await page.setViewportSize({width:1100,height:620});await settle();
 await csvJump('CSV short window resets the workspace, preserving the background');
 await page.keyboard.press('Escape');

 await page.setViewportSize({width:390,height:844});await library();await page.locator('#seriesView').uncheck();await settle();
 await jump('#libraryPagesBottom [data-page-next]','Mobile library bottom Next returns to the document top');
 await check('Mobile retains page width',async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)));
 await page.setViewportSize({width:1440,height:1000});await library();
 await page.evaluate(()=>{const valid=ALM_SCROLL_PROGRESS.toStart(document.getElementById('animeGrid')),stale=ALM_SCROLL_PROGRESS.toStart(document.getElementById('memoryPage'));if(!valid||stale)throw Error('Wrong visible/hidden scope classification');window.scrollTo({top:600,behavior:'instant'});});await atTop('Hidden stale scope cannot cancel the active page reset','#animeGrid .card');checks.push('Hidden stale scope cannot cancel the active page reset');
 await check('Account background alone is slightly transparent',async()=>{const s=await page.locator('#commProfileEntry').evaluate(n=>({background:getComputedStyle(n).backgroundImage,opacity:getComputedStyle(n).opacity,name:document.getElementById('commProfileName').textContent}));assert.equal(s.opacity,'1');assert.equal(s.name,'GentilRobot');assert.match(s.background,/rgba\([^)]*,\s*0\.78/);});
 await page.screenshot({path:path.join(output,'library-top.png')});
 await check('All notes and journals are preserved',async()=>assert.deepEqual(await snapshot(),before));
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log(checks.length+' pagination browser checks passed.');
})().catch(async e=>{failure={message:e.message,stack:e.stack};console.error(e);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{
 fs.writeFileSync(path.join(output,'pagination-checks.json'),JSON.stringify({browser:version,baselineAssets:!!baseline,status:failure?'failed':'passed',checks,measurements,errors,failure,scope:'Real local app and production CSS; ephemeral library/catalogue/notebook; fictional community/ranking/import-review fixtures; external traffic blocked; no real account, import, deletion or native Windows installer'},null,2)+'\n');
 releaseCatalog?.();await browser?.close();global.fetch=nativeFetch;await require('./runtime-cleanup').cleanupRuntime(profile,host);clearInterval(keepAlive);process.exit(process.exitCode||0);
});
