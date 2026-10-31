'use strict';
// Optional end-to-end UI check: real Express/SQLite/API/assets, isolated fictional profile.
// Only community account responses are simulated. All external traffic is blocked;
// recommendation forms are opened but never submitted.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.ALM_PLAYWRIGHT_MODULE||'playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm82-ux-browser-'));
const output=path.resolve(process.env.ALM_UI_EVIDENCE||path.join(__dirname,'../test-artifacts/ux82'));
fs.mkdirSync(output,{recursive:true});
process.env.ALM_DATA_DIR=directory;process.env.ALM_IMAGES_DIR=path.join(directory,'images');process.env.ALM_AUTOMATION_STARTUP='0';
fs.mkdirSync(process.env.ALM_IMAGES_DIR);
fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({preloadMetadataOnStart:false,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;
global.fetch=(url,options)=>{let parsed;try{parsed=new URL(typeof url==='string'?url:url.url);}catch{return Promise.reject(Error('Offline fixture'));}return parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'?nativeFetch(url,options):Promise.reject(Error('External providers disabled in browser fixture'));};
const checks=[],errors=[],communityRequests=[],blockedExternal=[];
let host,browser,page;const keepAlive=setInterval(()=>{},1000);
const ownerId='00000000-0000-0000-0000-000000000001',friendId='00000000-0000-0000-0000-000000000002';

(async()=>{
 const server=require('../server'),db=require('../db'),M=require('../public/community-model');await db.whenReady();
 const rows=Array.from({length:70},(_,i)=>({id:i+1,malId:i<6?[1,5,6,20,21,16498][i]:981000+i,title:'Carnet de test '+String(i+1).padStart(2,'0'),type:'TV',status:i%2?'Completed':'Watching',episodesSeen:'7',episodesTotal:'12',notes:'Souvenir personnel numéro '+(i+1),startDate:'2020-04-01',genres:['Fantasy'],studios:['Studio de test'],imageUrl:'/assets/design/aster-portrait.webp',malUrl:'https://myanimelist.net/anime/'+(i<6?[1,5,6,20,21,16498][i]:981000+i),seriesSeparate:true,personalJournal:{episodes:[],awards:[]}}));
 Object.assign(rows[0],{title:'Aurore du carnet',studios:['Studio de la recette unique'],startDate:'2018-04-01',notes:'Une scène tendre.\nUne émotion à conserver. <script>texte personnel</script>',personalJournal:{episodes:[{number:7,title:'Un souvenir marquant',text:'Le ciel violet de cette scène.',score:9}],awards:[{year:2024,kind:'anime',text:'Mon choix personnel, distinct de son année de sortie.'}]}});
 Object.assign(rows[1],{title:'Brouillon automatique',notes:'Ajouté depuis Recommandations.'});
 Object.assign(rows[2],{title:'Chapitre de saison',notes:'Saison 1\nSaison 2'});
 Object.assign(rows[3],{title:'Source de la suite',notes:'Ma première découverte.'});
 Object.assign(rows[4],{title:'Suite des étoiles',notes:'Suite détectée depuis : Source de la suite • Sequel',tags:['nouvelle saison']});
 Object.assign(rows[5],{title:'Mémoire mixte',status:'On-Hold',notes:'Ajouté depuis Recommandations.\nUne vraie émotion.'});
 // Controlled local catalogue records make detail lookups deterministic and offline.
 db.importMetadataRows(rows.map(row=>({malId:row.malId,title:row.title,type:row.type,episodes:12,score:8.3,rank:row.id,startDate:row.startDate,imageUrl:row.imageUrl,genres:row.genres,studios:row.studios,synopsis:'Synopsis fictif de recette.'})));
 db.writeAllAnimes(rows);
 host=await new Promise(resolve=>{const listener=server.app.listen(0,'127.0.0.1',()=>resolve(listener));});
 const origin='http://127.0.0.1:'+host.address().port;
 const initial=await nativeFetch(origin+'/api/notebook').then(r=>r.json());
 const preserved=initial.items.map(row=>({id:row.id,notes:row.notes,personalJournal:row.personalJournal}));
 assert.equal(preserved.length,70,'All fictional notebook fixtures reached the real API');
 const ownItems=M.items(rows),ownProfile=M.profile({id:ownerId,display_name:'GentilRobot',discriminator:4,visibility:'friends',share_library:true,share_favorites:true,share_watching:true,share_dna:true,featured:[1]}),friendProfile=M.profile({id:friendId,display_name:'AmiRecette',discriminator:8,visibility:'friends',share_library:true,featured:[1]});
 const own={profile:ownProfile,items:ownItems,summary:M.summary(ownItems),dna:M.dna(ownItems),activity:[],age:{recorded:true,adult:true,excludeAdult:true}};
 const friendItems=M.items([rows[0],rows[2],rows[3],{malId:19,title:'Une autre histoire',status:'Completed',score:'9',episodesTotal:'26'}]);
 const foreign={profile:friendProfile,items:friendItems,summary:M.summary(friendItems),dna:M.dna(friendItems),activity:[],comparison:M.compare(ownItems,friendItems)};
 const state={configured:true,connected:true,user:{id:ownerId,email:'fixture@example.test'},identity:ownProfile,own,sync:{dirty:false,publishedAt:'2026-10-20T00:00:00Z',auto:false},notifications:{count:0}};
 const friends={userId:ownerId,relationships:[{id:'00000000-0000-0000-0000-000000000003',requester:ownerId,recipient:friendId,status:'accepted',accepted_at:'2026-10-20T00:00:00Z'}],cards:[friendProfile],libraryStats:{available:true,libraries:1,animes:friendItems.length}};
 browser=await chromium.launch({headless:true,executablePath:process.env.ALM_CHROMIUM||process.env.ALM_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('alm-language','fr');localStorage.setItem('alm.visual.motion','reduced');});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){blockedExternal.push(url.origin);return route.abort();}
  if(!url.pathname.startsWith('/api/community/'))return route.continue();
  const name=url.pathname.slice('/api/community/'.length);communityRequests.push({name,method:request.method()});
  const result=name==='status'?state:name==='friends'?friends:name==='profiles/'+friendId?foreign:name==='recommendations'?{items:[]}:name==='sessions'?{items:[]}:null;
  if(request.method()!=='GET'||!result)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'UNEXPECTED_FIXTURE_ACTION'})});
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 // Poll from the runner: Playwright's in-page waitForFunction uses eval,
 // correctly forbidden by ALM's production CSP. Do not weaken that CSP.
 async function waitFor(predicate){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await page.evaluate(predicate))return;await page.waitForTimeout(80);}const state=await page.evaluate(()=>({rows:window._almAnimes?.length,catalog:!!window.ALM_CATALOG,memories:!!window.ALM_MEMORIES_PAGE,connected:window.ALM_COMMUNITY?.snapshot()?.connected,friends:window.ALM_COMMUNITY?.context()?.friends?.cards?.length}));throw Error('Timed out waiting for application state: '+JSON.stringify({state,communityRequests}));}
 async function check(name,fn){await settle();await fn();checks.push(name);console.log('OK '+name);}
 async function resetMemories(){await page.locator('#memoryPageReset').click();await settle();}
 async function library(){await page.locator('.nav-item[data-filter=""]').click();await page.waitForSelector('#animeGrid .card');}
 async function memory(){await page.locator('#navMemories').click();await page.waitForSelector('#memoryPageEntries .memory-card');await waitFor(()=>document.getElementById('memoryPageEntries').getAttribute('aria-busy')==='false');}
 const shown=locator=>locator.evaluate(node=>!node.hidden&&getComputedStyle(node).display!=='none'&&node.getClientRects().length>0);
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await waitFor(()=>window._almAnimes?.length===70&&window.ALM_CATALOG&&window.ALM_MEMORIES_PAGE&&window.ALM_COMMUNITY?.snapshot()?.connected&&window.ALM_COMMUNITY.context().friends?.cards.length===1);
 await page.waitForSelector('#animeGrid .card');
 if(process.argv.includes('--layout-only')){
  await memory();await page.locator('#memoryPageReleaseYear').selectOption('2018');await page.locator('#memoryPageYear').selectOption('2024');await resetMemories();
  const resetLabels=await page.evaluate(()=>['memoryPageReleaseYear','memoryPageYear'].map(id=>{const n=document.getElementById(id);return {id,value:n.value,selected:n.selectedOptions[0]?.textContent,visible:n.parentElement.querySelector('.alm-select-trigger')?.textContent};}));
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await settle();await page.screenshot({path:path.join(output,'memories-top-desktop.png')});
  await library();await page.setViewportSize({width:390,height:844});await settle();
  const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.right>innerWidth+1&&s.display!=='none'&&s.visibility!=='hidden';}).slice(0,20).map(n=>({tag:n.tagName,id:n.id,class:n.className,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width,text:(n.textContent||'').trim().slice(0,80)}))}));
  await page.screenshot({path:path.join(output,'library-mobile.png')});await page.locator('#animeGrid .card').first().scrollIntoViewIfNeeded();await settle();await page.screenshot({path:path.join(output,'library-cards-mobile.png')});
  await page.locator('#studioMenuButton').click();await memory();await page.screenshot({path:path.join(output,'memories-mobile.png')});await page.locator('#memoryPageEntries .memory-card').first().scrollIntoViewIfNeeded();await settle();await page.screenshot({path:path.join(output,'memories-cards-mobile.png')});
  const memories=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cardWidth:document.querySelector('#memoryPageEntries .memory-card')?.getBoundingClientRect().width}));
  const report={resetLabels,overflow,memories,errors};fs.writeFileSync(path.join(output,'layout-checks.json'),JSON.stringify(report,null,2)+'\n');console.log('LAYOUT',JSON.stringify(report));return;
 }
 await check('Real app loads 70 local records with bounded library DOM',async()=>{assert.equal(await page.locator('#animeGrid .card').count(),60);assert.equal(await page.locator('#libraryPagesTop').getAttribute('data-total'),'70');});
 await check('Footer uses the connected identity once and has no old version signature',async()=>{assert.equal(await page.locator('#commProfileName').textContent(),'GentilRobot');assert.equal(await page.locator('#commProfileState').textContent(),'GentilRobot#0004');assert.equal(await page.locator('#commProfileEntry').count(),1);assert.equal(await page.locator('.studio-sidebar-footer').count(),0);assert(await page.locator('#commProfileEntry').evaluate(n=>n.parentElement.matches('.sidebar')));});
 await check('Recommendation stays before Delete, visible and within three action rows',async()=>{const card=page.locator('#animeGrid [data-anime-id="1"].card');assert(await shown(card.locator('[data-action="recommend"]')));const layout=await card.locator('.actions').evaluate(node=>{const actions=[...node.children].filter(n=>!n.hidden&&getComputedStyle(n).display!=='none');return {actions:actions.map(n=>n.dataset.action||n.dataset.notebookAction||n.tagName),lines:new Set(actions.map(n=>Math.round(n.getBoundingClientRect().top))).size};});assert(layout.actions.indexOf('recommend')<layout.actions.indexOf('delete'));assert(layout.lines<=3,'Action layout uses '+layout.lines+' lines');});
 await page.locator('#animeGrid [data-anime-id="1"].card [data-action="recommend"]').click();
 await page.waitForSelector('#commDialog select[name="recipient"]');
 await check('Recommendation opens the friend chooser without sending a message',async()=>{assert.equal(await page.locator('#commDialog select[name="recipient"] option').count(),2);assert.equal(communityRequests.filter(r=>r.method!=='GET').length,0);});
 await page.locator('#commDialog [data-close]').click();
 await page.locator('#studioTools summary').click();
 await check('Library tools do not contain New seasons; its sidebar page remains',async()=>{assert.equal(await page.locator('#studioTools #seasonNewsBtn').count(),0);assert.equal(await page.locator('#navSeasonNews').count(),1);});
 await page.locator('#studioTools summary').click();
 await page.screenshot({path:path.join(output,'library-desktop.png')});
 await page.locator('#importXmlBtn').click();
 await page.waitForSelector('#importDialog[open] .xml-import-showcase img');
 await check('XML import keeps the GIF without its caption',async()=>{assert.equal(await page.locator('#importDialog .xml-import-showcase figcaption').count(),0);assert(await page.locator('#importDialog .xml-import-showcase img').evaluate(n=>n.complete&&n.naturalWidth>0));});
 await page.screenshot({path:path.join(output,'xml-import-desktop.png')});
 await page.keyboard.press('Escape');
 await memory();
 await check('Memories use real API rows and one bounded page without library leftovers',async()=>{assert.equal(await page.locator('#memoryPageEntries .memory-card').count(),24);assert.equal(await shown(page.locator('#libraryPagesTop')),false);assert.equal(await shown(page.locator('#libraryPagesBottom')),false);assert.equal(await shown(page.locator('#memoryPagePagination')),true);});
 await page.locator('#memoryPageNotebook').selectOption('2');
 await check('Exact automatic annotation is hidden until explicitly requested',async()=>{assert.equal(await page.locator('#memoryPageEntries .memory-card').count(),0);assert.equal(await shown(page.locator('#memoryPagePagination')),false);});
 await page.locator('#memoryPageAutomatic').check();
 await check('Automatic-only notebook can be restored with one reversible checkbox',async()=>{assert.equal(await page.locator('#memoryPageEntries [data-memory-id="2"]').count(),1);assert.match(await page.locator('#memoryPageEntries').textContent(),/Ajouté depuis Recommandations\./);});
 await resetMemories();await page.locator('#memoryPageNotebook').selectOption('3');
 await check('Ambiguous Saison 1 / Saison 2 notes remain personal memories',async()=>{assert.match(await page.locator('#memoryPageEntries').textContent(),/Saison 1\s+Saison 2/);});
 await resetMemories();await page.locator('#memoryPageNotebook').selectOption('5');
 await check('Proven sequel-source annotation is filtered without changing the notebook',async()=>{assert.equal(await page.locator('#memoryPageEntries .memory-card').count(),0);});
 await resetMemories();await page.locator('#memoryPageStatus').selectOption('On-Hold');
 await check('Status filter preserves the personal part of a mixed note',async()=>{assert.equal(await page.locator('#memoryPageEntries .memory-card').count(),1);const text=await page.locator('#memoryPageEntries .memory-card-note').textContent();assert.equal(text,'Une vraie émotion.');});
 await resetMemories();await page.locator('#memoryPageReleaseYear').selectOption('2018');await page.locator('#memoryPageYear').selectOption('2024');
 await check('Broadcast year and annual-choice year combine independently',async()=>{assert.equal(await page.locator('#memoryPageEntries .memory-card').count(),1);assert.equal(await page.locator('#memoryPageEntries .memory-card').getAttribute('data-memory-id'),'1');});
 await page.locator('#memoryPageSearch').fill('émotion');
 await check('Text search and active filters combine without showing an irrelevant pager',async()=>{assert.equal(await page.locator('#memoryPageEntries .memory-card').count(),1);assert.equal(await shown(page.locator('#memoryPagePagination')),false);});
 await check('Memory cover loads and note markup stays escaped',async()=>{assert(await page.locator('[data-memory-id="1"] .memory-card-cover img').evaluate(n=>n.complete&&n.naturalWidth>0));assert.equal(await page.locator('#memoryPageEntries script').count(),0);assert.match(await page.locator('#memoryPageEntries').textContent(),/<script>texte personnel<\/script>/);});
 await page.locator('[data-memory-id="1"] .memory-card-cover').click();await page.waitForSelector('#animePeekDialog[open]');
 await check('Memory cover opens the shared anime detail dialog',async()=>{assert.equal(await page.locator('#animePeekTitle').textContent(),'Aurore du carnet');assert.equal(await page.locator('#notebookDialog[open]').count(),0);});
 await page.locator('#animePeekClose').click();await page.locator('[data-memory-id="1"] .memory-card-title').click();await page.waitForSelector('#animePeekDialog[open]');
 await check('Memory title opens the same shared anime detail',async()=>{assert.equal(await page.locator('#animePeekTitle').textContent(),'Aurore du carnet');});
 await page.locator('#animePeekClose').click();await page.locator('[data-memory-open="1"]').click();await page.waitForSelector('#notebookDialog[open]');
 await check('Open notebook retains the complete original private note',async()=>{assert.equal(await page.locator('#notebookDialog [name="notes"]').inputValue(),preserved.find(row=>row.id===1).notes);});
 await page.locator('#notebookDialog [data-notebook-action="close"]').click();await resetMemories();
 await check('Reset synchronizes the visible select labels with the cleared values',async()=>{assert(await page.evaluate(()=>[...document.querySelectorAll('#memoryPage select')].every(n=>n.parentElement.querySelector('.alm-select-trigger')?.textContent===n.selectedOptions[0]?.textContent)));});
 await page.screenshot({path:path.join(output,'memories-desktop.png')});
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await settle();
 await page.screenshot({path:path.join(output,'memories-top-desktop.png')});
 await page.locator('#navFriends').click();await page.waitForSelector('[data-comm-action="visit"]');await page.locator('.comm-friend-profile[data-comm-action="visit"]').click();await page.waitForSelector('.comm-common-open');
 await check('Friend profile exposes a keyboard-accessible common counter without a duplicate action',async()=>{assert.equal(await page.locator('.comm-common-open').count(),1);assert.equal(await page.locator('.comm-common-count').textContent(),'3');assert.equal(await page.getByText('Voir tous nos animés en commun',{exact:true}).count(),0);assert.equal(await page.locator('.comm-common-open').evaluate(n=>getComputedStyle(n).cursor),'pointer');});
 const normal=await page.locator('.comm-common-open').evaluate(n=>getComputedStyle(n).backgroundColor);await page.locator('.comm-common-open').hover();await page.waitForTimeout(200);
 await check('Common counter changes appearance on hover',async()=>{assert.notEqual(await page.locator('.comm-common-open').evaluate(n=>getComputedStyle(n).backgroundColor),normal);});
 await page.locator('.comm-common-open').focus();await page.keyboard.press('Enter');await page.waitForSelector('#commLibraryResults .comm-card');
 await check('Common counter opens the exact shared list, with no one-page arrows',async()=>{assert.equal(await page.locator('#commLibraryResults .comm-card').count(),3);assert.equal(await shown(page.locator('.comm-pagination')),false);assert.equal(await shown(page.locator('#libraryPagesTop')),false);});
 await page.screenshot({path:path.join(output,'common-desktop.png')});
 await page.locator('#navFriendLibrary').click();await page.waitForSelector('#commFriendChoice');await page.locator('#commFriendChoice').fill('AmiRecette#0008');await page.locator('#commChooseFriend button[type="submit"]').click();await page.waitForSelector('#commLibraryResults .comm-card');
 await page.locator('[data-comm-common]').click();
 await check('Friend library common statistic uses the same three-record scope',async()=>{assert.equal(await page.locator('[data-comm-common]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#commLibraryResults .comm-card').count(),3);});
 await library();
 await check('Returning from friend library restores only the library pagination',async()=>{assert.equal(await page.locator('#libraryPagesTop').getAttribute('data-page'),'1');assert.equal(await shown(page.locator('#libraryPagesTop')),true);assert.equal(await page.locator('#libraryPagesTop').count(),1);});
 await page.locator('#navDiscovery').click();await page.locator('#discoveryQuery').fill('Aurore du carnet');await page.locator('#discoveryForm button[type="submit"]').click();await page.waitForSelector('#discoveryResults .catalog-card');
 await waitFor(()=>document.querySelectorAll('#discoveryResults .catalog-card').length===1);
 await check('Catalogue single result hides only its pager and keeps source information',async()=>{assert.equal(await shown(page.locator('.catalog-page-center')),false);assert(await shown(page.locator('#catalogFreshness')));});
 await page.locator('#navRanking').click();await page.waitForSelector('#rankingStudio option[value="Studio de la recette unique"]',{state:'attached'});await page.locator('#rankingStudio').selectOption('Studio de la recette unique');
 await waitFor(()=>document.querySelectorAll('#rankingResults .ranking-card').length===1);
 await check('Single-result studio ranking has no paging arrows',async()=>{assert.equal(await shown(page.locator('.ranking-pagination')),false);});
 await page.locator('#navLexicon').click();await page.locator('#lexiconSearch').fill('no-such-glossary-entry-ux');await page.waitForSelector('#lexiconGrid .lexicon-empty');
 await check('Empty dictionary filter hides both synchronized pager positions',async()=>{assert.equal(await shown(page.locator('#studioLexiconPagerTop')),false);assert.equal(await shown(page.locator('#studioLexiconPagerBottom')),false);});
 await library();
 await page.setViewportSize({width:390,height:844});
 await check('Narrow library has no horizontal page overflow',async()=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));});
 await check('Narrow library keeps readable full-width cards and three action rows',async()=>{const card=page.locator('#animeGrid [data-anime-id="1"].card');assert(await card.evaluate(n=>n.getBoundingClientRect().width>250));const lines=await card.locator('.actions').evaluate(node=>new Set([...node.children].filter(n=>!n.hidden&&getComputedStyle(n).display!=='none').map(n=>Math.round(n.getBoundingClientRect().top))).size);assert(lines<=3,'Narrow action layout uses '+lines+' lines');});
 await page.screenshot({path:path.join(output,'library-mobile.png')});
 await page.locator('#animeGrid .card').first().scrollIntoViewIfNeeded();await settle();
 await page.screenshot({path:path.join(output,'library-cards-mobile.png')});
 await page.locator('#studioMenuButton').click();await memory();
 await check('Narrow memories keep filters and cards within the viewport',async()=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('#memoryPageEntries .memory-card').first().evaluate(n=>n.getBoundingClientRect().width>=260));});
 await page.screenshot({path:path.join(output,'memories-mobile.png')});
 await page.locator('#memoryPageEntries .memory-card').first().scrollIntoViewIfNeeded();await settle();
 await page.screenshot({path:path.join(output,'memories-cards-mobile.png')});
 const after=await nativeFetch(origin+'/api/notebook').then(r=>r.json());
 await check('Entire UI journey keeps every original note and journal unchanged',async()=>{assert.deepEqual(after.items.map(row=>({id:row.id,notes:row.notes,personalJournal:row.personalJournal})),preserved);assert.equal(communityRequests.filter(r=>r.method!=='GET').length,0);assert.deepEqual(errors,[]);});
 fs.writeFileSync(path.join(output,'ux-checks.json'),JSON.stringify({browser:await browser.version(),checks,errors,communityRequests,blockedExternalOrigins:[...new Set(blockedExternal)],scope:'Real local Express/SQLite/notebook API and shipped frontend; only community account responses are mocked; no messages sent; no native Windows installer run'},null,2)+'\n');
 console.log(checks.length+' full-app browser UX checks passed.');
})().catch(async error=>{console.error(error);console.error('BROWSER_ERRORS',errors);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();global.fetch=nativeFetch;await require('./runtime-cleanup').cleanupRuntime(directory,host);clearInterval(keepAlive);process.exit(process.exitCode||0);});
