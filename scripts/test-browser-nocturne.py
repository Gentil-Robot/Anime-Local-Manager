import base64,json,mimetypes,re,sys,time,os,subprocess,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
E=Path(os.environ.get('ALM_UI_EVIDENCE',str(R/'test-artifacts/nocturne')));E.mkdir(parents=True,exist_ok=True)
if not shutil.which('ffmpeg'): raise SystemExit('This optional browser test requires FFmpeg for compact media fixtures.')
for target,source,args in [('browser-audio.wav','threads-of-stories.wav',['-ar','16000','-ac','1','-c:a','pcm_s16le']),('browser-clip.mp4','threads-of-stories-clip.mp4',['-vf','scale=480:-2','-an','-c:v','libx264','-crf','34','-preset','ultrafast','-movflags','+faststart'])]:
 if not (E/target).exists(): subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(R/'public/assets'/source),*args,str(E/target)],check=True)
assets={}
for f in (R/'public/assets').rglob('*'):
 if f.suffix.lower() in ['.png','.jpg','.webp','.ico','.gif']:
  assets['/'+str(f.relative_to(R/'public'))]='data:'+str(mimetypes.guess_type(str(f))[0] or 'image/png')+';base64,'+base64.b64encode(f.read_bytes()).decode()
assets['/assets/threads-of-stories.wav']='data:audio/wav;base64,'+base64.b64encode((E/'browser-audio.wav').read_bytes()).decode()
assets['/assets/threads-of-stories-clip.mp4']='data:video/mp4;base64,'+base64.b64encode((E/'browser-clip.mp4').read_bytes()).decode()
fixture=[{'id':i+1,'title':name,'malId':i+101,'status':status,'episodesSeen':str(seen),'episodesTotal':'12','score':str(score),'genres':genres,'poster':poster,'notes':'Ma note reste exactement ici.'} for i,(name,status,seen,score,genres,poster) in enumerate([
 ('Collection de test - A','Completed',12,9,['Action','Adventure','Fantasy'],'/assets/design/clip-poster.jpg'),
 ('Collection de test - B','Watching',7,8,['Drama','Romance'],'/assets/design/aster-portrait.webp'),
 ('Collection de test - C','Plan to Watch',0,0,['Mystery','Fantasy'],''),
 ('Collection de test - D','Completed',12,10,['Sci-Fi','Action'],''),
 ('Collection de test - E','Watching',5,7,['Comedy','Slice of Life'],''),
 ('Collection de test - F','On-Hold',3,0,['Fantasy','Adventure'],'')])]
fixtures={'/api/animes':fixture,'/api/config':{},'/api/v2/stats':{'totalAnimes':6,'totalEpisodes':39,'totalDays':0,'totalHours':15,'averageScore':8.5,'favoriteGenre':'Fantasy','favoriteYear':'2026'},'/api/v2/profile':{'patterns':{}},'/karaoke/song.json':json.loads((R/'public/karaoke/song.json').read_text())}
fixtures['/api/news/results']={'news':[{'title':'Suite de démonstration','sourceTitle':'Série de démonstration','seasonClass':'direct_sequel','defaultSelected':True}],'completedAt':'2026-09-13T09:00:00Z'}
for f in (R/'public/locales').glob('*.json'):fixtures['/locales/'+f.name]=json.loads(f.read_text())
for f in (R/'public').glob('*.json'):fixtures['/'+f.name]=json.loads(f.read_text())
raw=(R/'public/index.html').read_text();scripts=re.findall(r'<script[^>]*src="([^"]+)"',raw);html=re.sub(r'<script\b[^>]*src=[^>]*></script>','',raw);html=re.sub(r'<link\b[^>]*>','',html)
checks=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('ALM_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1672,'height':1000},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('http://alm.test/assets/**',lambda route:route.fulfill(path=str(R/'public'/route.request.url.split('http://alm.test/')[1])))
 page.set_content('<base href="http://alm.test/">'+html)
 for name in ['style.css','design.css','nocturne.css']:
  css=(R/'public'/name).read_text()
  for path,data in assets.items():
   if not path.endswith(('.mp4','.wav')):
    css=css.replace("url('"+path+"')","url('"+data+"')").replace('url("'+path+'")','url("'+data+'")')
  page.add_style_tag(content=css)
 font_root=os.environ.get('ALM_QA_FONTS')
 if font_root:
  for family in ['noto-sans-jp','noto-sans-sc','noto-emoji']:
   base=Path(font_root)/('@fontsource/'+family)
   css=(base/'400.css').read_text()
   css=re.sub(r"url\(\./(files/[^)]+)\)",lambda m:'url(data:font/woff2;base64,'+base64.b64encode((base/m.group(1)).read_bytes()).decode()+')',css)
   page.add_style_tag(content=css)
  page.add_style_tag(content="body{font-family:'Segoe UI','DejaVu Sans','Noto Sans JP','Noto Sans SC','Noto Emoji',system-ui,sans-serif}")
 page.evaluate('''({fixtures,assets})=>{
  const store=new Map([['alm-language','fr']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
  window.__requests=[];window.fetch=async(raw,options={})=>{const u=new URL(raw,'http://alm.test');window.__requests.push(u.pathname);let data=fixtures[u.pathname];
   if(u.pathname==='/api/services')data={services:[['jikan','Jikan / MyAnimeList'],['anilist','AniList'],['kitsu','Kitsu'],['tvmaze','TVMaze'],['betaseries','BetaSeries'],['mymemory','MyMemory'],...Array.from({length:16},(_,i)=>['rss-'+i,'Flux de démonstration '+(i+1)])].map(([id,name])=>({id,name,group:id.startsWith('rss')?'news':id==='mymemory'?'translation':'metadata',configured:id!=='betaseries',lang:id.startsWith('rss')?'fr':undefined}))};
   else if(u.pathname.startsWith('/api/services/')){const id=u.pathname.split('/')[3];data={id,state:id==='betaseries'?'unconfigured':id==='rss-2'?'timeout':'available',latencyMs:id==='betaseries'?null:143,httpStatus:id==='betaseries'||id==='rss-2'?null:200,checkedAt:'2026-09-17T10:30:00Z'};}
   else if(u.pathname.startsWith('/api/rankings'))data={items:Array.from({length:100},(_,i)=>({malId:101+i,title:'Animé de démonstration '+(i+1),rank:i+1,publicScore:9.5-i/100,poster:assets['/assets/design/clip-poster.jpg'],synopsis:'Public example synopsis',genres:['Adventure','Fantasy'],studios:['Studio de démonstration'],startDate:'2026-01-01',type:'TV',episodesTotal:12,members:250000,popularity:25})),source:'jikan',updatedAt:'2026-09-17T10:00:00Z',refreshing:false};
   else if(u.pathname.includes('/reco/genres'))data={ok:true,source:'metadata-locale',metadataCount:30430,items:Array.from({length:18},(_,i)=>({malId:1111+i,title:'Suggestion de test '+(i+1),imageUrl:assets['/assets/design/clip-poster.jpg']}))};
   else if(u.pathname.includes('/reco/similar/'))data={ok:true,items:[{malId:1112,title:'Autre suggestion de test',imageUrl:assets['/assets/design/aster-portrait.webp']}]};
   else if(u.pathname==='/api/v2/news')data={ok:true,items:[{id:'n1',newsKey:'n1',title:'Exemple de mise en page : article local',summary:'Cette actualite est une donnee de test, pas un article reel. Le titre et le resume restent dans la langue de la source.',lang:'fr',source:'Fixture locale',date:'2026-09-12T08:00:00Z',articleUrl:'https://example.org/a',imageUrl:assets['/assets/design/clip-poster.jpg'],category:'divers'}],meta:{total:1,historyTotal:1,retentionDays:365}};
   else if(u.pathname==='/api/v2/news/article')data={ok:true,text:'Texte local de controle. '.repeat(25),title:'Article de test'};
   return {ok:true,status:200,json:async()=>structuredClone(data||{ok:true,items:[],results:[],count:0,needsCompletion:false}),text:async()=>''};};
  const hydrate=()=>{document.querySelectorAll('img').forEach(i=>{const k=i.getAttribute('src');if(assets[k])i.src=assets[k];});document.querySelectorAll('video[poster]').forEach(v=>{const k=v.getAttribute('poster');if(assets[k])v.poster=assets[k];});};
  new MutationObserver(hydrate).observe(document.body,{childList:true,subtree:true});hydrate();
  const native=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');Object.defineProperty(HTMLMediaElement.prototype,'src',{get:native.get,set(value){native.set.call(this,assets[value]||value);},configurable:true});
 }''',{'fixtures':fixtures,'assets':assets})
 for name in scripts:page.add_script_tag(content=(R/'public'/name.lstrip('/')).read_text())
 page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
 page.wait_for_function('window.ALM_DESIGN && window._almAnimes?.length===6')
 page.wait_for_timeout(500);page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 def check(label,expr):
  value=page.evaluate(expr)
  if not value: raise AssertionError(label+' '+str(value))
  checks.append(label);print('OK',label,flush=True)
 def shot(name):
  page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(150);page.screenshot(path=str(E/(name+'.png')),full_page=True);page.screenshot(path=str(E/(name+'-viewport.png')))
 check('sidebar labels are at least 16px',"parseFloat(getComputedStyle(document.querySelector('.studio-nav-label')).fontSize)>=16")
 check('sidebar is actually painted above page backdrop',"document.elementFromPoint(120,160)?.closest('.sidebar')!==null")
 page.evaluate("window.__originalQACollection=animes;animes=Array.from({length:113},(_,i)=>({...animes[i%6],id:i+1,title:(i<3?'Selected ':'Remaining ')+i}));window._almAnimes=animes;document.getElementById('search').value='Selected';render()")
 page.wait_for_timeout(350)
 check('sparse decoration uses 3 displayed titles out of 113',"document.querySelectorAll('#animeGrid .card').length===3 && !document.querySelector('.nocturne-collection-guide') && Number(document.querySelector('.main-area').style.getPropertyValue('--collection-art-opacity'))>0")
 shot('01-library')
 page.set_viewport_size({'width':2560,'height':1100})
 page.evaluate("document.getElementById('search').value='';animes.forEach((a,i)=>{a.tags=i%3===0?['Court','Un tag beaucoup plus long','Troisième tag','Quatrième','Cinquième']:[];if(i%4===0)a.title+=' : un titre très long qui occupe plusieurs lignes';});render()")
 page.wait_for_timeout(150)
 check('library rows align with varied tags and title lengths',"(()=>{const rows=new Map();for(const c of document.querySelectorAll('#animeGrid .card')){const r=c.getBoundingClientRect(),key=Math.round(r.top);if(rows.has(key)&&Math.abs(rows.get(key)-r.bottom)>2)return false;rows.set(key,r.bottom);}return rows.size>1})()")
 page.screenshot(path=str(E/'01-library-full-viewport.png'))
 page.set_viewport_size({'width':1672,'height':1000})
 page.evaluate("animes=window.__originalQACollection;window._almAnimes=animes;document.getElementById('search').value='';render()")

 page.evaluate("window.__restoredCollection=animes;animes=[];window._almAnimes=animes;render()");page.wait_for_timeout(150)
 check('empty library invitation is visible without an empty grid spacer',"(()=>{const e=document.getElementById('studioEmptyState').getBoundingClientRect();return e.top<innerHeight-100&&e.height>0&&getComputedStyle(document.querySelector('.main-area'),'::after').opacity!=='0'})()")
 shot('01-library-empty')
 page.evaluate("animes=window.__restoredCollection;window._almAnimes=animes;render()")
 page.evaluate('showAboutView()');page.wait_for_timeout(300);shot('02-about-support')
 check('banner occupies its own row below the grouped support cards',"(()=>{const b=document.querySelector('.alm-retro-banner').getBoundingClientRect(),p=document.querySelector('.paypal-card').getBoundingClientRect(),c=document.querySelector('.nocturne-player').getBoundingClientRect();return b.top>=p.bottom&&b.top>=c.bottom&&b.width>p.width*1.8&&b.right<=innerWidth})()")
 check('data services are thanked in the main acknowledgements',"document.querySelectorAll('.about-thanks .about-data-links a').length===6")
 check('library is not shown under about',"getComputedStyle(document.getElementById('animeGrid')).display==='none' && getComputedStyle(document.getElementById('studioLibraryHero')).display==='none'")
 check('merged about/support page visible',"!document.getElementById('aboutPage').classList.contains('hidden') && !document.getElementById('donationsPage').classList.contains('hidden')")
 check('acknowledgements follow local-data block',"!!(document.getElementById('localDataSection').compareDocumentPosition(document.querySelector('.about-thanks')) & Node.DOCUMENT_POSITION_FOLLOWING)")
 page.evaluate("document.getElementById('navLexicon').click()");page.wait_for_timeout(300);shot('03-glossary')
 check('term list has no repeated raster thumbnails',"document.querySelectorAll('#lexiconGrid .nocturne-art').length===0 && document.querySelectorAll('.nocturne-universe-grid .nocturne-art').length===6")
 check('161 glossary definitions','window.__ALM_LEXICON_ENTRIES.length===161')
 page.locator('.studio-term-favourite').first.click();check('favourite is persisted',"JSON.parse(localStorage.getItem('alm.glossary.favourites.v1')).length===1")
 page.locator('.studio-term-detail > summary').first.click();page.wait_for_timeout(100);check('recent entries work','ALM_LEXICON_VIEW.getRecent().length===1')
 page.locator('[data-show-favourites="1"]').click();check('favourite filter','document.querySelectorAll(".lexicon-card").length===1')
 page.locator('[data-show-favourites="0"]').click()
 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate('(l)=>ALM_I18N.setLanguage(l)',lang);page.wait_for_timeout(160)
  check('new UI localized '+lang,"Array.from(document.querySelectorAll('[data-design-text]')).every(n=>n.textContent===ALM_DESIGN.t(n.dataset.designText))")
  check('glossary definition localized '+lang,"Array.from(document.querySelectorAll('.lexicon-card')).every(c=>c.querySelector('.lexicon-definition').textContent===ALM_GLOSSARY_COPY[ALM_I18N.getLanguage()][c.dataset.term])")
  check('no glossary overflow '+lang,'document.documentElement.scrollWidth<=innerWidth')
  if lang in ['ja','zh-CN']:shot('03-glossary-'+lang)
 page.evaluate('ALM_I18N.setLanguage("fr")');page.evaluate('showV2Page("recoPage","navReco");initRecommendations()');page.wait_for_timeout(300)
 page.locator('.reco-genre-pill[data-genre]').first.click();page.wait_for_timeout(200)
 check('18 genre recommendations occupy the full content width',"(()=>{const r=document.getElementById('recoGenreResults').getBoundingClientRect(),p=document.getElementById('recoContainer').getBoundingClientRect();return document.querySelectorAll('#recoGenreResults .reco-card').length===18&&r.width>p.width*.9})()")
 check('18 recommendations have no incomplete last row at desktop width',"(()=>{const g=document.getElementById('recoGenreResults'),columns=getComputedStyle(g).gridTemplateColumns.split(' ').length;return 18%columns===0})()")
 check('one anime explorer panel visible',"document.querySelectorAll('.nocturne-reco-explorer [role=tabpanel]:not([hidden])').length===1")
 page.locator('#nocturne-reco-tab-1').click()
 check('creator recommendations accessible through tab',"document.getElementById('recoCreatorPicker').getBoundingClientRect().height>0&&document.getElementById('recoAnimePicker').getBoundingClientRect().height===0")
 page.locator('#nocturne-reco-tab-1').press('ArrowRight')
 check('recommendation tabs support keyboard navigation',"document.activeElement.id==='nocturne-reco-tab-2'&&document.getElementById('recoSeiyuuPicker').getBoundingClientRect().height>0")
 page.locator('#nocturne-reco-tab-0').click();shot('04-recommendations')
 page.locator('[data-hero-action="blend"]').click();page.wait_for_timeout(100);check('recommendation mix works',"!!document.querySelector('#recoHeroBlock .reco-card')")
 page.evaluate('showV2Page("dnaPage","navDna");renderDNA()');page.wait_for_timeout(300);shot('05-dna')
 check('DNA canvas keeps its native aspect ratio',"(()=>{const c=document.getElementById('dnaCanvas'),r=c.getBoundingClientRect();return Math.abs(c.width/c.height-r.width/r.height)<.01})()")
 coords=page.evaluate("(()=>{const c=document.getElementById('dnaCanvas'),r=c.getBoundingClientRect(),b=window._dnaBubbles[0];return {x:r.x+b.x,y:r.y+b.y,genre:b.genre}})()")
 page.mouse.move(coords['x'],coords['y']);page.wait_for_timeout(100)
 check('DNA tooltip stays within the affinity panel',"(()=>{const t=document.getElementById('dnaTooltip').getBoundingClientRect(),r=document.querySelector('.dna-canvas-wrap').getBoundingClientRect();return t.width>0&&t.left>=r.left&&t.right<=r.right})()")
 page.mouse.click(coords['x'],coords['y']);page.wait_for_timeout(200)
 check('clicking a visible DNA bubble opens the matching library filter',"!document.getElementById('animeGrid').classList.contains('hidden') && document.getElementById('genreFilter').value==="+json.dumps(coords['genre']))
 page.evaluate('showV2Page("dnaPage","navDna");renderDNA()');page.wait_for_timeout(150)
 check('DNA insights immediately follow the signature',"document.getElementById('dnaInsights').previousElementSibling?.classList.contains('dna-signature-panel')")
 check('two complementary cats' ,"document.querySelectorAll('#dnaBubbleLeftRail img,#dnaBubbleRightRail img').length===2")
 for width in [3200,2560,1920,1440,1024,768,480]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(300)
  check('DNA no overflow '+str(width),'document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1672,'height':1000});page.evaluate('document.getElementById("navNewsV2").click()');page.wait_for_timeout(300);shot('06-news')
 page.evaluate('window.__newsRequestsBefore=window.__requests.filter(u=>u==="/api/v2/news").length;ALM_NEWS_LANGUAGE.set("ja");ALM_NEWS_LANGUAGE.set("fr")');page.wait_for_timeout(150)
 check('news language changes reuse the loaded cache',"window.__requests.filter(u=>u==='/api/v2/news').length===window.__newsRequestsBefore")
 page.evaluate("""async()=>{
   const native=window.fetch;let calls=0;window.__progressiveObserved=false;
   window.fetch=async(url,opts)=>{if(!String(url).startsWith('/api/v2/news?'))return native(url,opts);calls++;const pending=calls<3;const items=calls===1?[]:[{id:'progress-test',title:'Article arrivé avant la source lente',summary:'Fixture',lang:'fr',source:'Test',date:'2026-09-13T08:00:00Z',category:'divers'}];if(calls===3)window.__progressiveObserved=document.getElementById('newsV2Container').textContent.includes('Article arrivé');return {ok:true,json:async()=>({ok:true,items,refreshDue:false,refresh:{pending,completedSources:calls,totalSources:3}})};};
   try{await loadNews(true);}finally{window.fetch=native;}
 }""")
 check('news reader shows an early article before refresh completion','window.__progressiveObserved===true')
 page.evaluate("""async()=>{
   const native=window.fetch;let release,calls=0;
   window.fetch=async(url,opts)=>{if(!String(url).startsWith('/api/v2/news?'))return native(url,opts);calls++;const first=calls===1;if(first)await new Promise(r=>release=r);return {ok:true,json:async()=>({ok:true,refreshDue:false,items:[{id:first?'old':'current',title:first?'Ancienne réponse':'Réponse actuelle',lang:'fr',source:'Test',date:'2026-09-13T08:00:00Z'}]})};};
   try{const old=loadNews(true);await loadNews(true);release();await old;}finally{window.fetch=native;}
 }""")
 check('late news response cannot overwrite the current reader',"document.getElementById('newsV2Container').textContent.includes('Réponse actuelle')&&!document.getElementById('newsV2Container').textContent.includes('Ancienne réponse')")
 page.evaluate('document.getElementById("navSeasonNews").click()');page.wait_for_timeout(400)
 page.evaluate('_seasonNewsData=[];renderSeasonNewsPage()');page.wait_for_timeout(100)
 check('empty seasons use the subtle page background',"document.body.classList.contains('nocturne-season-view')&&getComputedStyle(document.querySelector('.main-area'),'::after').opacity!=='0'")
 shot('07-seasons-empty')
 page.evaluate("_seasonNewsData=Array.from({length:4},(_,i)=>({title:'Suite de démonstration '+(i+1),sourceTitle:'Série de ma bibliothèque '+(i+1),imageUrl:'/assets/design/clip-poster.jpg',type:'TV',seasonClass:i%2?'related':'direct_sequel',defaultSelected:i%2===0,startDate:'2026-10-01',episodesTotal:'12',genres:['Fantasy','Adventure'],synopsis:'Exemple fictif pour vérifier la disposition des affiches, des informations et des trois actions.'}));renderSeasonNewsPage()")
 page.wait_for_timeout(150);shot('07-seasons')
 check('season cards use both columns',"(()=>{const a=Array.from(document.querySelectorAll('.snews-card')).map(e=>e.getBoundingClientRect());return a.length===4&&Math.abs(a[0].top-a[1].top)<4&&a[1].left>a[0].right})()")
 page.locator('[data-hide-one="0"]').click();page.wait_for_timeout(120)
 check('neutral season action removes just one result',"document.querySelectorAll('.snews-card').length===3")

 print('OPEN AUDIT',flush=True);page.evaluate('document.getElementById("navAudit").click()');page.wait_for_timeout(400);print('CAPTURE AUDIT',flush=True);shot('08-audit')
 check('audit does not repeat the large empty-state illustration',"Array.from(document.querySelectorAll('.audit-empty')).every(e=>!getComputedStyle(e).backgroundImage.includes('url(')&&e.getBoundingClientRect().height<240)")
 page.evaluate('document.getElementById("settingsBtn").click()');page.wait_for_timeout(200);shot('09-settings')
 check('settings footer remains visible',"(()=>{const r=document.getElementById('cancelSettings').getBoundingClientRect();return r.top>0&&r.bottom<=innerHeight})()")
 check('settings show one category at a time',"document.querySelectorAll('.settings-tab-panel:not([hidden])').length===1&&document.querySelectorAll('#settingsSections [role=tab]').length===5")
 page.locator('#settingsTab-appearance').press('ArrowDown')
 check('language options belong to appearance only',"document.getElementById('almLanguageSettings').closest('[role=tabpanel]').id==='settingsPanel-appearance'&&document.getElementById('almLanguageSettings').getBoundingClientRect().height===0")
 check('settings navigation supports keyboard',"document.activeElement.id==='settingsTab-library'&&!document.getElementById('settingsPanel-library').hidden")
 page.locator('#settingsTab-connections').click();page.wait_for_timeout(100)
 check('opening API settings does not call external tests',"window.__requests.filter(p=>p.startsWith('/api/services/')&&p.endsWith('/test')).length===0")
 page.locator('#apiTestAll').click();page.wait_for_function('!document.getElementById("apiTestAll").disabled');shot('14-api-diagnostics')
 check('all 22 source checks return a result',"document.querySelectorAll('.service-row').length===22&&document.querySelectorAll('.service-badge[data-state=available]').length===20&&document.querySelectorAll('.service-badge[data-state=unconfigured]').length===1&&document.querySelectorAll('.service-badge[data-state=timeout]').length===1")
 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate('(l)=>ALM_I18N.setLanguage(l)',lang);page.wait_for_timeout(70)
  check('API and settings translated '+lang,"document.getElementById('apiTestAll').textContent===ALM_DESIGN.t('apiTestAll')&&document.querySelector('.service-badge').textContent===ALM_DESIGN.t('apiAvailable')")
 page.evaluate('ALM_I18N.setLanguage("fr")');page.set_viewport_size({'width':480,'height':800});page.wait_for_timeout(100);shot('14-settings-mobile')
 check('mobile settings keep close button visible',"document.getElementById('cancelSettings').getBoundingClientRect().bottom<=innerHeight&&document.getElementById('settingsDialog').getBoundingClientRect().width<innerWidth")
 page.set_viewport_size({'width':1672,'height':1000})
 page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 page.evaluate('showAboutView()');page.wait_for_timeout(200)
 page.evaluate("document.getElementById('importXmlBtn').click()");page.wait_for_timeout(150);shot('09-import-xml')
 check('XML import uses an illustrated header',"getComputedStyle(document.querySelector('#importDialog .nocturne-dialog-hero')).backgroundImage.includes('data:image')")
 page.locator('[data-tab="csvImportPanel"]').click();page.wait_for_timeout(150);shot('09-import-csv')
 check('CSV import tab exposes preview controls',"document.getElementById('csvFile').getBoundingClientRect().width>0 && document.getElementById('xmlFile').getBoundingClientRect().width===0")
 page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 # Actual Chromium audio/video decoders, transcoded fixtures from the user's media. No vocal alignment assertion.
 page.wait_for_function('document.getElementById("donationKaraokeAudio").readyState>=2',timeout=20000)
 page.evaluate('''()=>{const a=document.getElementById('donationKaraokeAudio');a.currentTime=43.3;a.dispatchEvent(new Event('timeupdate'));}''');page.wait_for_timeout(200)
 page.locator('.donation-karaoke').scroll_into_view_if_needed();shot('10-karaoke')
 check('four confirmed lines have no review brackets',"!document.getElementById('donationKaraokeJaLine').textContent.includes('?')")
 page.evaluate("()=>{document.getElementById('donationKaraokeAudio').play().catch(e=>window.__audioErr=String(e));}");page.wait_for_timeout(1500)
 print('MEDIA', page.evaluate("({audioError:window.__audioErr,audio:document.getElementById('donationKaraokeAudio').currentTime,video:document.getElementById('donationKaraokeClip').currentTime,paused:document.getElementById('donationKaraokeAudio').paused,ready:document.getElementById('donationKaraokeClip').readyState})"),flush=True)
 check('video is muted',"document.getElementById('donationKaraokeClip').muted")
 check('video follows real audio clock',"(()=>{const v=document.getElementById('donationKaraokeClip'),a=document.getElementById('donationKaraokeAudio');const d=Math.abs(v.currentTime-a.currentTime%v.duration);return Math.min(d,v.duration-d)<.35})()")
 page.evaluate("document.getElementById('donationKaraokeAudio').pause()");page.wait_for_timeout(100)
 check('video pauses with audio',"document.getElementById('donationKaraokeClip').paused")
 page.evaluate("document.getElementById('donationKaraokeAudio').currentTime=75.9");page.wait_for_timeout(200)
 check('ball group and highlight agree',"document.getElementById('donationKaraokeBall').dataset.group===document.querySelector('.romaji-active')?.dataset.unit")
 page.evaluate("document.getElementById('donationKaraokeMode').click()");page.wait_for_timeout(250)
 check('translation gradient is not obscured by inherited text shadow',"getComputedStyle(document.querySelector('.karaoke-fr-unit')).textShadow==='none'")
 check('lyrics have no rectangular background',"getComputedStyle(document.querySelector('.donation-karaoke-active')).backgroundColor==='rgba(0, 0, 0, 0)'")
 check('close control is separated from scroll arrows',"document.getElementById('donationKaraokeMode').getBoundingClientRect().top<80&&getComputedStyle(document.getElementById('scrollJumpTop')).display==='none'")
 check('same player expands without restarting',"document.querySelectorAll('#donationKaraokeAudio').length===1 && document.querySelector('.nocturne-player').classList.contains('karaoke-focus-mode') && Math.abs(document.getElementById('donationKaraokeAudio').currentTime-75.9)<.1")
 check('lyrics stay in the upper-left video area',"(()=>{const s=document.querySelector('.donation-karaoke-stage').getBoundingClientRect(),a=document.querySelector('.donation-karaoke-active').getBoundingClientRect();return a.left>=s.left&&a.right<s.left+s.width*.45&&a.top>=s.top&&a.bottom<s.top+s.height*.55})()")
 check('ball follows the Japanese group',"document.getElementById('donationKaraokeBall').dataset.group===document.querySelector('.original-active')?.dataset.unit")
 page.screenshot(path=str(E/'10-karaoke-fullscreen.png'))
 page.evaluate("document.getElementById('donationKaraokeAudio').currentTime=43.3");page.wait_for_timeout(120)
 page.screenshot(path=str(E/'10-karaoke-fullscreen-43s.png'))
 page.evaluate("document.getElementById('donationKaraokeMode').click()");page.wait_for_timeout(150)
 check('fullscreen exit restores compact player',"!document.querySelector('.nocturne-player').classList.contains('karaoke-focus-mode') && document.querySelector('.nocturne-player').getBoundingClientRect().width<innerWidth/2")
 page.evaluate("document.getElementById('donationKaraokeAudio').currentTime=75.9");page.wait_for_timeout(100)
 page.evaluate('ALM_I18N.setLanguage("de")');page.wait_for_timeout(150)
 check('language change preserves playback position' ,"Math.abs(document.getElementById('donationKaraokeAudio').currentTime-75.9)<.05")
 page.evaluate("document.getElementById('donationKaraokeAudio').currentTime=99");page.wait_for_timeout(100)
 check('silence does not show next lyric',"getComputedStyle(document.getElementById('donationKaraokeJaLine')).visibility==='hidden'")
 page.evaluate('ALM_I18N.setLanguage("fr")');page.wait_for_timeout(100)
 for width in [1024,768,480]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(200)
  check('about/support no overflow '+str(width),'document.documentElement.scrollWidth<=innerWidth')
  if width==480:shot('11-about-mobile')
 # Beta33: the actual search controller, form and navigation.
 page.set_viewport_size({'width':1672,'height':1000})
 page.evaluate("""()=>{
  window.__fetchBeforeDiscovery=window.fetch;
  window.fetch=async(raw,options={})=>{const u=new URL(raw,'http://alm.test');
   if(u.pathname==='/api/discover')return {ok:true,json:async()=>({ok:true,source:'local',items:[{malId:999991,title:'Voyage sous les étoiles — démonstration',titleEn:'A journey under the stars — demo',titleJa:'星の旅 — デモ',poster:'/assets/design/clip-poster.jpg',synopsis:'A public demonstration synopsis.',publicScore:8.7,episodesTotal:12,startDate:'2026-01-01',genres:['Adventure','Fantasy'],studios:['Studio de démonstration'],rank:12,popularity:100,members:125000,duration:'24 min per ep',synonyms:['Autre titre de démonstration']}]})};
   if(u.pathname==='/api/discover/999991/synopsis'){const lang=u.searchParams.get('lang');const text={fr:'Une voyageuse suit la lumière des étoiles pour retrouver une bibliothèque oubliée. Résumé de démonstration.',ja:'星の光をたどり、忘れられた図書館へ向かう旅。デモ用のあらすじ。',es:'Un viaje entre las estrellas. Sinopsis de demostración.',de:'Eine Reise unter den Sternen. Beispielzusammenfassung.','pt-BR':'Uma viagem entre as estrelas. Sinopse de demonstração.','zh-CN':'沿着星光寻找被遗忘的图书馆。演示简介。'};return {ok:true,json:async()=>({text:text[lang],language:lang,translated:true})};}
   return window.__fetchBeforeDiscovery(raw,options);};
 }""")
 page.evaluate('document.getElementById("navDiscovery").click()');page.locator('#discoveryQuery').fill('Voyage');page.locator('#discoveryForm').evaluate('(f)=>f.requestSubmit()');page.wait_for_timeout(200)
 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate('ALM_I18N.setLanguage('+json.dumps(lang)+')');page.wait_for_timeout(100)
  check('search controls follow '+lang,"document.getElementById('discoveryAdd').textContent===ALM_DESIGN.t('searchAdd')")
  check('search details localized '+lang,"document.getElementById('discoverySynopsis').textContent.length>10 && document.querySelector('.discovery-facts').textContent.includes(ALM_DESIGN.t('searchScore')) && document.documentElement.scrollWidth<=innerWidth")
 page.evaluate('ALM_I18N.setLanguage("fr")');page.wait_for_timeout(100);shot('12-search')
 check('search has one submit button and a canonical MAL link',"document.querySelectorAll('#discoveryForm button').length===1&&document.querySelector('#discoveryDetail .discovery-mal-link').href==='https://myanimelist.net/anime/999991'")
 check('search details include studio and public ranking',"document.querySelector('#discoveryDetail .discovery-metadata').textContent.includes('Studio de démonstration')&&document.querySelector('#discoveryDetail .discovery-metadata').textContent.includes('#12')")
 page.evaluate("window.__collectionBeforeMember=window._almAnimes;window._almAnimes=[...window._almAnimes,{malId:999991,title:'Voyage traduit',status:'Completed'}];window.dispatchEvent(new Event('alm:collection-changed'))")
 check('search disables an existing anime regardless of displayed title',"!document.getElementById('discoveryAdd')&&!!document.getElementById('discoveryOpen')&&document.querySelector('#discoveryDetail .collection-confirmation').textContent.includes(ALM_DESIGN.t('collectionCompleted'))")
 page.evaluate("window._almAnimes=window.__collectionBeforeMember;window.dispatchEvent(new Event('alm:collection-changed'))")
 check('new search uses the common background',"parseFloat(getComputedStyle(document.querySelector('.main-area'),'::after').opacity)>=.2")
 page.evaluate('window.fetch=window.__fetchBeforeDiscovery')
 page.evaluate('openAdd()');page.locator('#manualMode').check();page.locator('#title').fill('Mon animé créé sans API');page.locator('#manualSynopsis').fill('Une description saisie à la main, conservée sur cet ordinateur.');page.locator('#manualPublicScore').fill('8.5');page.locator('#manualRank').fill('120')
 page.locator('#manualPosterFile').set_input_files(str(R/'public/assets/design/clip-poster.jpg'));page.wait_for_timeout(100);shot('13-manual')
 check('manual mode disables automatic enrichment',"document.getElementById('autoInfo').disabled&&!document.getElementById('autoInfo').checked&&!document.getElementById('manualFields').hidden")
 check('manual save button remains visible',"document.querySelector('#animeForm button[type=submit]').getBoundingClientRect().bottom<=innerHeight")
 check('manual local poster is previewed',"document.getElementById('manualPosterPreview').src.startsWith('blob:')&&!document.getElementById('manualPosterPreview').hidden")
 page.evaluate('document.getElementById("formDialog").close()')
 page.evaluate('showV2Page("dnaPage","navDna");renderDNA()');page.wait_for_timeout(150)
 check('rating histogram has readable bars',"Array.from(document.querySelectorAll('.dna-score-column-track')).every(e=>e.getBoundingClientRect().height>=238&&e.getBoundingClientRect().width>=26)")
 page.evaluate('window.scrollTo(0,450)');page.wait_for_timeout(150);page.evaluate('window.__dnaY=scrollY;document.querySelector(".dna-score-column:not([disabled])").click()');page.wait_for_timeout(180)
 check('rating action opens the library',"document.body.dataset.studioView==='library'")
 page.evaluate('history.back()');page.wait_for_timeout(300)
 check('Back restores DNA at the prior position',"document.body.dataset.studioView==='dnaPage'&&Math.abs(scrollY-window.__dnaY)<3")
 page.evaluate('history.forward()');page.wait_for_timeout(250)
 check('Forward restores the library',"document.body.dataset.studioView==='library'")
 page.evaluate('document.getElementById("studioScene").value="bright";document.getElementById("studioScene").dispatchEvent(new Event("change"))');page.wait_for_timeout(150)
 check('background preference applies and persists',"ALM_DESIGN.storage.get('alm.visual.scene')==='bright'&&Number(document.querySelector('.main-area').style.getPropertyValue('--collection-art-opacity'))>=.3")

 # New ranking page and membership propagation.
 page.evaluate('document.getElementById("navRanking").click()');page.wait_for_timeout(160);shot('15-ranking')
 check('ranking is directly below new seasons',"document.getElementById('navSeasonNews').nextElementSibling.id==='navRanking'")
 check('ranking is the only visible content page',"document.body.dataset.studioView==='rankingPage'&&getComputedStyle(document.getElementById('animeGrid')).display==='none'")
 check('ranking displays 100 entries with 20 per page',"document.getElementById('rankingCount').textContent.includes('100')&&document.querySelectorAll('.ranking-card').length===20&&document.getElementById('rankingPageNumber').textContent==='1 / 5'")
 check('ranking recognizes watched collection entries',"!document.getElementById('rankingAdd')&&!!document.getElementById('rankingOpen')&&document.querySelector('#rankingDetail .collection-confirmation').textContent.includes(ALM_DESIGN.t('collectionCompleted'))")
 page.locator('#rankingNext').click();page.wait_for_timeout(70)
 check('ranking pagination reaches rank 21',"document.querySelector('.ranking-place').textContent==='21'")
 page.locator('.ranking-card').first.click();page.wait_for_timeout(80)
 check('ranking detail provides a MAL link and add action',"document.querySelector('#rankingDetail .discovery-mal-link').href==='https://myanimelist.net/anime/121'&&!document.getElementById('rankingAdd').disabled")
 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate('(l)=>ALM_I18N.setLanguage(l)',lang);page.wait_for_timeout(70)
  check('ranking localized '+lang,"document.querySelector('#rankingPage h1').textContent===ALM_DESIGN.t('rankingTitle')&&document.getElementById('rankingAdd').textContent===ALM_DESIGN.t('searchAdd')")
 page.evaluate('ALM_I18N.setLanguage("fr")')
 for width in [2560,1024,480]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100)
  check('ranking no overflow '+str(width),'document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1672,'height':1000})
 page.evaluate("showV2Page('recoPage','navReco');document.getElementById('recoGenreResults').innerHTML=recoCard({malId:101,title:'Autre titre'},'Fixture');wireAdd(document.getElementById('recoGenreResults'))")
 check('recommendations disable titles already in collection',"document.querySelector('#recoGenreResults .reco-card-add').disabled")
 page.evaluate('showAboutView()');page.wait_for_timeout(100)
 check('Ko-fi exact link and original QR are present',"document.querySelector('.kofi-card a').href==='https://ko-fi.com/G0E726UXV3'&&document.querySelector('.kofi-card img').naturalWidth>100")
 page.evaluate("ALM_DESIGN.storage.set('alm.visual.motion','reduced');ALM_DESIGN.applyPreferences()")
 check('reduced motion uses still banner',"document.getElementById('almRetroBanner').src.includes('png')||document.getElementById('almRetroBanner').src.startsWith('data:image/png')")
 page.evaluate("ALM_DESIGN.storage.set('alm.visual.motion','full');ALM_DESIGN.applyPreferences()")
 check('animated banner is loaded',"document.getElementById('almRetroBanner').src.includes('gif')||document.getElementById('almRetroBanner').src.startsWith('data:image/gif')")
 check('language options have strong text contrast',"(()=>{const o=document.getElementById('studioLanguage').parentElement.querySelector('.alm-select-trigger'),s=getComputedStyle(o);return s.color==='rgb(238, 234, 255)'&&s.backgroundColor==='rgb(23, 27, 50)'})()")
 page.evaluate('document.getElementById("navLexicon").click()');page.wait_for_timeout(100)
 check('universe thumbnails preserve aspect ratio',"Array.from(document.querySelectorAll('.universe-picture')).length===6&&Array.from(document.querySelectorAll('.universe-picture')).every(s=>Math.abs(s.getScreenCTM().a-s.getScreenCTM().d)<.01)")
 page.set_viewport_size({'width':2560,'height':1000});page.wait_for_timeout(100);shot('16-glossary-wide')
 check('wide glossary banner fills its width without a flat empty column',"getComputedStyle(document.querySelector('.lexicon-hero')).backgroundSize.includes('cover')")
 page.set_viewport_size({'width':1672,'height':1000})
 check('no uncaught JS errors',json.dumps(not errors))
 (E/'nocturne-browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'scripts':scripts,'apiMode':'offline fixtures','mediaMode':'actual decoders / downsampled copies of source audio-video','vocalAlignment':'NOT validated'},ensure_ascii=False,indent=2))
 b.close()
print(len(checks),'checks',errors)
