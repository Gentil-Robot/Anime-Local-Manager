'use strict';
// Optional real-browser regression. Uses only fictional local rows; never contacts an ALM account.
// ALM_PLAYWRIGHT_MODULE may point to an external Playwright install; no production dependency is added.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.ALM_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'public',name),'utf8');
const output=path.resolve(process.env.ALM_UI_EVIDENCE||path.join(root,'test-artifacts','navigation'));
const checks=[],errors=[];

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ALM_CHROMIUM||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent(`<!doctype html><html lang="fr"><body><main class="main-area">
    <h1>ALM · données fictives de recette</h1><div class="hero"></div><div class="filters">
    <input id="search"><select id="statusFilter"><option value=""></option></select>
    <select id="sort"><option value="title">Title</option></select><input id="seriesView" type="checkbox"></div>
    <div id="stats"></div><div id="animeGrid"></div>
    <section id="memoryPage" class="v2-page hidden"><h1>Mes souvenirs</h1><p>Aucun souvenir pour ce filtre.</p></section>
    <section id="communityPage" class="v2-page hidden"><h1>Bibliothèque d’un ami</h1><p>Un seul animé partagé.</p><nav class="comm-pagination" hidden><button>1</button></nav></section>
    </main><dialog id="notebookDialog"><div class="notebook-body"><h2>Carnet de test</h2><div id="notebookTestContent" style="height:1800px"></div></div></dialog>
    <div id="newsArticleModalV2" class="hidden" style="position:fixed;inset:0;z-index:500"><div class="news-reader-modal-box" style="position:absolute;inset:30px;background:#141c32"><div class="news-reader-modal-body" style="height:100%;overflow:auto"><h2>Lecture locale</h2><div style="height:2000px"></div></div></div></div>
    </body></html>`);
  for(const match of read('index.html').matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/([^"?]+)(?:\?[^" ]*)?"[^>]*>/g))await page.addStyleTag({content:read(match[1])});
  await page.addStyleTag({content:'body{margin:0}.main-area{margin:0!important;padding:24px!important}#notebookDialog{max-height:80vh}#notebookDialog .notebook-body{max-height:60vh;overflow:auto}'});
  await page.evaluate(()=>{
   window.$=id=>document.getElementById(id);window.testLanguage='fr';
   window.ALM_I18N={getLanguage:()=>window.testLanguage};
   window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.formatDate=()=>'';window.genreLabelFr=value=>value;window.statusLabelFr=value=>value;
   window.safeText=(id,text)=>{const node=$(id);if(node)node.textContent=text;};
   window.activePersonalScoreFilter=0;window.currentLibraryViewKey='all';window.LIBRARY_FILTER_FIELDS=['search','statusFilter','sort'];
   window.animeGrid=$('animeGrid');window.stats=$('stats');
   window.animes=Array.from({length:121},(_,i)=>({id:i+1,title:'Anime fictif '+String(i+1).padStart(3,'0'),status:'Watching',genres:[],tags:[],notes:'Note privée de test'}));
   window._almAnimes=window.animes;
   window.setV2BodyView=id=>{document.body.dataset.studioView=id||'library';document.body.classList.toggle('alm-v2-active',Boolean(id));};
  });
  await page.addScriptTag({content:read('design-copy.js')});
  await page.evaluate(()=>window.ALM_DESIGN={language:()=>window.testLanguage,t:(key,args={})=>String(window.ALM_DESIGN_COPY[window.testLanguage]?.[key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(args[name]??''))});
  await page.addScriptTag({content:read('series-state.js')});
  await page.addScriptTag({content:read('library-paging.js')});
  const app=read('app.js'),navigation=read('alm-v2.js');
  await page.addScriptTag({content:app.slice(app.indexOf('function filteredAnimes()'),app.indexOf('function formatDate(value)'))});
  await page.addScriptTag({content:navigation.slice(navigation.indexOf('const ALL_V2_PAGES ='),navigation.indexOf('// ─── DNA'))});
  await page.addScriptTag({content:read('scroll-progress.js')});
  await page.evaluate(()=>{render();ALM_SCROLL_PROGRESS.mount();ALM_SCROLL_PROGRESS.mount();});
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function check(name,expression){await settle();assert.equal(await page.evaluate(expression),true,name);checks.push(name);console.log('OK '+name);}
  const visible='node=>!!node&&!node.hidden&&getComputedStyle(node).display!=="none"&&node.getClientRects().length>0';
  await check('Long library has two separated views of one synchronized pager',`(()=>{const navs=[...document.querySelectorAll('.library-pagination')].filter(${visible});return navs.length===2&&navs[0].dataset.page===navs[1].dataset.page&&navs[1].getBoundingClientRect().top-navs[0].getBoundingClientRect().bottom>innerHeight;})()`);
  await page.locator('#libraryPagesTop [data-page-last]').click();
  await check('Short last page has one pager, no adjacent duplicate',`document.querySelectorAll('#animeGrid .card').length===1&&[...document.querySelectorAll('.library-pagination')].filter(${visible}).length===1&&libraryPagesTop.dataset.page==='3'`);
  await page.evaluate(()=>{$('search').value='no matching anime';render();});
  await check('Empty result hides both pagers despite all production display rules',"getComputedStyle(libraryPagesTop).display==='none'&&getComputedStyle(libraryPagesBottom).display==='none'");
  await page.evaluate(()=>{$('search').value='Anime fictif 121';render();});
  await check('One-page result has no paging arrows',"getComputedStyle(libraryPagesTop).display==='none'&&getComputedStyle(libraryPagesBottom).display==='none'");
  await page.evaluate(()=>{$('search').value='';render();});
  await page.locator('#libraryPagesTop [data-page-mode]').click();
  await check('Show all retains only one return-to-pages action',`document.querySelectorAll('#animeGrid .card').length===121&&getComputedStyle(libraryPagesTop.querySelector('.library-page-center')).display==='none'&&getComputedStyle(libraryPagesBottom).display==='none'&&(${visible})(libraryPagesTop.querySelector('[data-page-mode]'))`);
  await page.locator('#libraryPagesTop [data-page-mode]').click();
  await page.evaluate(()=>showV2Page('memoryPage','navMemories'));
  await check('Library to memories hides the library controls in computed layout',"getComputedStyle(libraryPagesTop).display==='none'&&getComputedStyle(libraryPagesBottom).display==='none'");
  await page.evaluate(()=>showV2Page('communityPage','commProfileEntry'));
  await check('Friend page has neither library leftovers nor one-page arrows',"getComputedStyle(libraryPagesTop).display==='none'&&getComputedStyle(libraryPagesBottom).display==='none'&&getComputedStyle(document.querySelector('.comm-pagination')).display==='none'");
  await page.evaluate(()=>{hideAllV2Pages();render();});
  await check('Returning to library restores a single model and no duplicate IDs',`document.querySelectorAll('#libraryPagesTop').length===1&&document.querySelectorAll('#libraryPagesBottom').length===1&&[...document.querySelectorAll('.library-pagination')].filter(${visible}).length===2&&libraryPagesTop.dataset.page===libraryPagesBottom.dataset.page`);
  await page.evaluate(()=>{document.querySelector('main').hidden=true;});
  await check('Hidden parent cannot leave the independent library pagers visible',"libraryPagesTop.hidden&&libraryPagesBottom.hidden");
  await page.evaluate(()=>{document.querySelector('main').hidden=false;window.scrollTo({top:0,behavior:'instant'});});
  await check('One page scroll controller shows only the useful direction at the top',`document.querySelectorAll('#scrollJumpControls').length===1&&getComputedStyle(scrollJumpControls).display!=='none'&&scrollJumpTop.hidden&&!scrollJumpBottom.hidden`);
  await page.locator('#scrollJumpBottom').click();
  await check('Scroll to bottom hides its exhausted action and offers ascent',"scrollJumpBottom.hidden&&!scrollJumpTop.hidden&&document.scrollingElement.scrollTop>=document.scrollingElement.scrollHeight-innerHeight-2");
  await page.locator('#scrollJumpTop').click();
  await page.evaluate(()=>$('notebookDialog').showModal());
  await check('Scrollable notebook has one controller and suppresses the background',`scrollJumpControls.hidden&&[...document.querySelectorAll('.scroll-jump-controls')].filter(${visible}).length===1&&getComputedStyle(document.getElementById('notebookScrollControls')).display!=='none'`);
  await page.evaluate(()=>{$('notebookTestContent').style.height='0';ALM_SCROLL_PROGRESS.refresh();});
  await check('Short notebook hides useless vertical commands',"getComputedStyle(document.getElementById('notebookScrollControls')).display==='none'");
  await page.evaluate(()=>{$('notebookDialog').close();$('newsArticleModalV2').classList.remove('hidden');});
  await check('Reader owns exactly one active controller',`scrollJumpControls.hidden&&[...document.querySelectorAll('.scroll-jump-controls')].filter(${visible}).length===1&&getComputedStyle(newsReaderScrollControls).display!=='none'`);
  await page.evaluate(()=>{$('newsArticleModalV2').classList.add('hidden');$('search').value='no matching anime';render();window.scrollTo({top:0,behavior:'instant'});});
  await check('Short empty library hides all vertical commands',"scrollJumpControls.hidden&&scrollJumpTop.hidden&&scrollJumpBottom.hidden");
  for(const code of ['fr','en','es','de','ja','pt-BR','zh-CN']){
   await page.evaluate(code=>{window.testLanguage=code;window.dispatchEvent(new Event('alm:language-changed'));},code);
   await check('Accessible scroll labels retained for '+code,"!!scrollJumpTop.getAttribute('aria-label')&&!!scrollJumpBottom.getAttribute('aria-label')");
  }
  await page.setViewportSize({width:480,height:720});
  await page.evaluate(()=>{$('search').value='Anime fictif 121';render();});
  await check('Narrow view has no duplicated pager or horizontal overflow',"getComputedStyle(libraryPagesTop).display==='none'&&document.documentElement.scrollWidth<=innerWidth");
  assert.deepEqual(errors,[],'No uncaught browser errors');
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'navigation-checks.json'),JSON.stringify({browser:await browser.version(),checks,errors,scope:'Fictional local fixtures, production CSS and navigation/card/paging/scroll modules; no live account or native Windows installer'},null,2)+'\n');
  console.log(checks.length+' real-browser navigation checks passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
