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
   if(u.pathname==='/api/animes'&&options.method==='POST'){const body=JSON.parse(options.body),existing=window.ALM_COLLECTION.find(body,fixtures['/api/animes']);data=existing?{...existing,_addOutcome:{status:'existing'}}:{...body,id:500,_addOutcome:{status:'added'}};if(!existing)fixtures['/api/animes'].push(data);}
   else if(u.pathname==='/api/services')data={services:[['jikan','Jikan / MyAnimeList'],['anilist','AniList'],['kitsu','Kitsu'],['tvmaze','TVMaze'],['betaseries','BetaSeries'],['mymemory','MyMemory'],...Array.from({length:15},(_,i)=>['rss-'+i,'Flux de démonstration '+(i+1)])].map(([id,name])=>({id,name,group:id.startsWith('rss')?'news':id==='mymemory'?'translation':'metadata',configured:id!=='betaseries',lang:id.startsWith('rss')?'fr':undefined}))};
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

 page.evaluate('document.getElementById("navRanking").click()');page.wait_for_timeout(150)
 page.locator('#rankingNext').click();page.locator('.ranking-card').first.click();page.wait_for_timeout(70)
 page.evaluate('window.scrollTo(0,180)');before=page.evaluate('window.scrollY')
 page.locator('#rankingAdd').click();page.wait_for_function('!!document.getElementById("rankingOpen")')
 check('ranking addition keeps the ranking and hides library cards',"document.body.dataset.studioView==='rankingPage'&&document.getElementById('animeGrid').classList.contains('hidden')&&document.getElementById('rankingPageNumber').textContent==='2 / 5'")
 check('ranking addition saves once with planned status',"window._almAnimes.filter(a=>a.malId===121).length===1&&window._almAnimes.find(a=>a.malId===121).status==='Plan to Watch'")
 page.evaluate("ALM_DISCOVERY.showDetail({malId:121,title:'A different translated title'})")
 check('existing anime offers an entry instead of duplicate addition',"!document.getElementById('discoveryAdd')&&!!document.getElementById('discoveryOpen')")
 page.evaluate("document.getElementById('navDiscovery').click();window.__fetch35=window.fetch;window.fetch=async(raw,options)=>{const u=new URL(raw,'http://alm.test');if(u.pathname==='/api/discover')return {ok:true,json:async()=>({items:[{malId:801,title:'Zeta',publicScore:7,startDate:'2020-01-01',episodesTotal:12},{malId:802,title:'Alpha',publicScore:9,startDate:'2024-01-01',episodesTotal:24},{malId:803,title:'Beta',publicScore:8,startDate:'2021-01-01'}],source:'online'})};return window.__fetch35(raw,options);};")
 page.locator('#discoveryQuery').fill('Example');page.locator('#discoveryForm').evaluate('(f)=>f.requestSubmit()');page.wait_for_function('document.querySelectorAll(".discovery-result").length===3')
 page.locator('#discoverySort').select_option('score');check('score sort changes order without a new request',"document.querySelector('.discovery-result strong').textContent==='Alpha'")
 page.locator('#discoverySort').select_option('alphabetical');check('alphabetical sort stable',"Array.from(document.querySelectorAll('.discovery-result strong')).map(n=>n.textContent).join(',')==='Alpha,Beta,Zeta'")
 page.locator('.discovery-result').first.click();page.locator('#discoveryStatus').wait_for()
 status=page.locator('#discoveryStatus')
 page.locator('#discoveryStatus').evaluate('(n)=>n.dataset.test="ready"')
 # A visible custom dropdown commits with the keyboard and keeps the native form value.
 trigger=page.locator('#discoveryDetail .alm-select-trigger');trigger.click();trigger.press('End');trigger.press('ArrowUp');trigger.press('ArrowUp');trigger.press('Enter')
 check('dark dropdown keyboard selects Completed',"document.getElementById('discoveryStatus').tagName==='P'&&document.querySelector('#discoveryDetail select').value==='Completed'")
 page.locator('#discoveryAdd').click();page.wait_for_function('!!document.getElementById("discoveryOpen")')
 check('completed anime is added directly with its known total',"window._almAnimes.find(a=>a.malId===802).status==='Completed'&&window._almAnimes.find(a=>a.malId===802).episodesSeen==='24'")
 check('search results, query, selection and view remain',"document.body.dataset.studioView==='discoveryPage'&&document.getElementById('discoveryQuery').value==='Example'&&document.querySelectorAll('.discovery-result').length===3&&document.querySelector('#discoveryDetail h2').textContent==='Alpha'&&document.getElementById('animeGrid').classList.contains('hidden')")
 shot('35-recherche')
 page.locator('.discovery-result').nth(1).click();page.locator('#discoveryDetail select').select_option('Dropped');page.locator('#discoveryAdd').click();page.wait_for_function('window._almAnimes.some(a=>a.malId===803)')
 check('dropped with unknown progression does not invent episode count',"window._almAnimes.find(a=>a.malId===803).episodesSeen===''")
 page.evaluate('document.getElementById("navDna").click()');page.wait_for_timeout(500)
 check('French genre localization preserves original identity',"ALM_CONTENT_LANGUAGE.genre('Adventure')==='Aventure'&&window._dnaBubbles.some(b=>b.genre==='Adventure')")
 shot('35-dna')
 page.evaluate('document.getElementById("navLexicon").click()');page.wait_for_timeout(250);shot('35-dictionnaire')
 page.evaluate('document.getElementById("navAudit").click()');page.wait_for_timeout(150);shot('35-controle')
 page.evaluate('document.getElementById("navRanking").click()');page.wait_for_timeout(150);shot('35-classement')
 page.evaluate('document.getElementById("navAbout").click()');page.wait_for_timeout(200);page.locator('.studio-support-grid').screenshot(path=str(E/'35-soutien.png'))
 check('two donation methods share a panel, contribution links remain separate',"document.querySelectorAll('.donation-methods .donation-card').length===2&&document.querySelectorAll('.support-actions a').length===3")
 # Native options remain synchronized after dynamic changes and localization.
 page.evaluate('document.getElementById("navDiscovery").click()');page.locator('#discoverySort').evaluate('(s)=>{s.options[1].text="TEST SCORE";}');page.wait_for_timeout(50)
 page.locator('#discoverySort').locator('..').locator('button').click();check('updated options appear in dark menu',"document.querySelector('.alm-select-menu').textContent.includes('TEST SCORE')")
 page.screenshot(path=str(E/'35-menu.png'));page.keyboard.press('Escape');check('Escape closes menu and restores focus',"!document.querySelector('.alm-select-menu')&&document.activeElement.matches('.alm-select-trigger')")
 page.set_viewport_size({'width':700,'height':900});page.wait_for_timeout(150);check('search fits narrow viewport',"document.documentElement.scrollWidth<=innerWidth+2")
 page.set_viewport_size({'width':1672,'height':1000})
 page.evaluate("""()=>{window.__newsImage=window.__requests.length;window.__readerCalls=0;window.__resolutions=0;const old=window.fetch;window.fetch=async(raw,options={})=>{const u=new URL(raw,'http://alm.test');if(u.pathname==='/api/v2/news')return {ok:true,json:async()=>({items:[{newsKey:'cold-news',id:'cold-news',title:'Article de contrôle sans vignette dans le flux',summary:'Une actualité issue du jeu de test. '.repeat(20),lang:'fr',source:'Source de test',date:'2026-09-22T10:00:00Z',articleUrl:'https://news.example.org/cold',imageUrl:''}],refreshDue:false,refresh:{pending:false},sourceStats:[{source:'Source de test',lang:'fr',ok:true}]})};if(u.pathname==='/api/v2/news/images/resolve')window.__resolutions++;if(u.pathname==='/api/v2/news/images/resolve')return {ok:true,json:async()=>({items:[{newsKey:'cold-news',articleUrl:'https://news.example.org/cold',imageUrl:document.querySelector('.studio-sidebar-logo img')?.src||document.querySelector('img').src}]})};if(u.pathname==='/api/v2/news/article')window.__readerCalls++;return old(raw,options);};showV2Page('newsV2Page','navNewsV2');loadNews(true);}""")
 page.wait_for_function("document.querySelector('#newsV2Container img')?.naturalWidth>0")
 check('cold news resolves and displays an image before Lire',"window.__resolutions>0&&document.querySelector('#newsV2Container img').naturalWidth>0")
 page.evaluate("openNewsArticleModalV2({title:'Lecture calme — article de démonstration',source:'Source de test',date:'2026-09-22',summary:'Un espace de lecture calme et lisible. '.repeat(90),articleUrl:'https://example.org/reader'})")
 page.wait_for_timeout(100);page.screenshot(path=str(E/'35-lecture.png'))
 check('reader decoration is subtle and noninteractive',"getComputedStyle(document.querySelector('.news-reader-modal-box'),'::before').pointerEvents==='none'&&Number(getComputedStyle(document.querySelector('.news-reader-modal-box'),'::before').opacity)<=.15")
 page.locator('.news-reader-modal-close').click()
 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate('(l)=>ALM_I18N.setLanguage(l)',lang);page.wait_for_timeout(70)
  check('new controls translated: '+lang,"ALM_RETOUCHES.t('sort')!=='sort'&&ALM_RETOUCHES.t('completed')!=='completed'")
 page.evaluate('ALM_I18N.setLanguage("fr")');page.wait_for_timeout(80)
 check('no uncaught JavaScript errors' ,json.dumps(not errors))
 (E/'beta35-interactions.json').write_text(json.dumps({'checks':checks,'errors':errors,'apiMode':'controlled fixtures'},ensure_ascii=False,indent=2));b.close()
print(len(checks),'interaction checks',errors)
