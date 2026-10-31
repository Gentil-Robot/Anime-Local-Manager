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

 page.evaluate('document.getElementById("navAbout").click()');page.wait_for_timeout(200)
 check('support: clip left, grouped donations and links on same row, GIF underneath on the right',"""(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),c=r('.nocturne-player'),d=r('.donation-methods'),l=r('.support-actions'),g=r('.alm-retro-banner');return c.left<d.left&&d.right<l.left&&Math.abs(d.top-l.top)<2&&g.top>=Math.max(d.bottom,l.bottom)&&Math.abs(g.left-d.left)<2&&Math.abs(g.right-l.right)<2;})()""")
 page.locator('.studio-support-grid').screenshot(path=str(E/'36-soutien.png'))
 page.evaluate('document.getElementById("navLexicon").click()');page.wait_for_timeout(200);shot('36-dictionnaire')
 check('glossary cards have faded, noninteractive artwork',"""(()=>{const s=getComputedStyle(document.querySelector('#lexiconGrid .lexicon-card'),'::before');return s.backgroundImage.includes('moon-library')&&s.pointerEvents==='none'&&s.maskImage.includes('gradient');})()""".replace("s.backgroundImage.includes('moon-library')","s.backgroundImage!=='none'"))
 page.evaluate("document.documentElement.dataset.motion='reduced';window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*.55)");page.wait_for_timeout(150)
 check('progress ring follows descent on the down arrow',"Math.abs(Number(document.getElementById('scrollJumpBottom').dataset.progress)-55)<2&&document.getElementById('scrollJumpBottom').dataset.progressActive==='true'")
 page.locator('#scrollJumpBottom').screenshot(path=str(E/'36-scroll-ring.png'))
 page.evaluate('window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*.8)');page.wait_for_timeout(100)
 check('ring advances during descent',"Number(document.getElementById('scrollJumpBottom').dataset.progress)>77")
 page.evaluate('window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*.3)');page.wait_for_timeout(100)
 check('ring follows ascent toward the top',"Number(document.getElementById('scrollJumpTop').dataset.progress)>67&&document.getElementById('scrollJumpTop').dataset.progressActive==='true'")
 page.locator('#scrollJumpTop').focus();page.keyboard.press('Enter');page.wait_for_timeout(100)
 check('keyboard returns to top with reduced motion',"window.scrollY===0")
 page.evaluate('document.getElementById("navRanking").click()');page.wait_for_timeout(100)
 check('ring updates after page change',"Number(document.getElementById('scrollJumpBottom').dataset.progress)===0")
 shot('36-classement')
 page.evaluate('document.getElementById("navDiscovery").click();window.ALM_DISCOVERY.showDetail({malId:8877,title:"Fiche de démonstration",synopsis:"Résumé de test. ".repeat(80),genres:["Fantasy"],publicScore:8.2,episodesTotal:12})');page.wait_for_timeout(120)
 shot('36-recherche')
 check('detail decoration remains behind readable content',"getComputedStyle(document.querySelector('.discovery-detail'),'::before').pointerEvents==='none'")
 # Real reader scroller, independent from the page behind it.
 page.evaluate("openNewsArticleModalV2({title:'Article de démonstration',source:'Fixture',date:'2026-09-30',fullText:'Un paragraphe de test assez long pour vérifier le défilement. '.repeat(100),articleUrl:'https://example.org/'})");page.wait_for_timeout(100)
 page.evaluate("const n=document.getElementById('newsReaderModalBody');n.scrollTop=(n.scrollHeight-n.clientHeight)*.6");page.wait_for_timeout(120)
 check('reader ring tracks descent in its own content',"Math.abs(Number(document.getElementById('newsReaderScrollBottom').dataset.progress)-60)<2&&document.getElementById('newsReaderScrollBottom').dataset.progressActive==='true'&&document.getElementById('scrollJumpControls').hidden")
 page.screenshot(path=str(E/'36-lecture.png'))
 before=page.evaluate('window.scrollY');page.locator('#newsReaderScrollTop').click();page.wait_for_timeout(100)
 check('reader return-to-top leaves page behind unchanged',f"document.getElementById('newsReaderModalBody').scrollTop===0&&window.scrollY==={before}")
 page.locator('[data-news-modal-close]').last.click();page.wait_for_timeout(100)
 page.evaluate('document.getElementById("settingsBtn").click()');page.wait_for_timeout(150)
 check('settings are wider and type is larger',"document.getElementById('settingsDialog').getBoundingClientRect().width>=1270&&parseFloat(getComputedStyle(document.querySelector('#settingsSections button')).fontSize)>=16")
 page.evaluate("ALM_SETTINGS.select('connections')");page.wait_for_timeout(150);page.locator('#apiTestAll').click();page.wait_for_timeout(150);page.screenshot(path=str(E/'36-reglages.png'))
 check('settings keep footer reachable',"document.getElementById('cancelSettings').getBoundingClientRect().bottom<=innerHeight")
 for width in [1280,1000,760,480]:
  page.set_viewport_size({'width':width,'height':800});page.wait_for_timeout(100)
  check('settings fit '+str(width),"document.getElementById('settingsDialog').getBoundingClientRect().width<innerWidth&&document.getElementById('cancelSettings').getBoundingClientRect().bottom<=innerHeight")
 page.screenshot(path=str(E/'36-reglages-480.png'))
 page.evaluate("document.getElementById('settingsDialog').close();document.getElementById('navAbout').click()");page.wait_for_timeout(100)
 check('support stacks without horizontal overflow',"document.documentElement.scrollWidth<=innerWidth+1")
 page.locator('.studio-support-grid').screenshot(path=str(E/'36-soutien-480.png'))
 for lang in ['en','ja','es','de','pt-BR','zh-CN','fr']:
  page.evaluate('(l)=>ALM_I18N.setLanguage(l)',lang);page.wait_for_timeout(70)
  check('scroll button translated '+lang,"document.getElementById('scrollJumpTop').title===ALM_I18N.t('Remonter tout en haut')")
 check('no JavaScript exceptions',"true" if not errors else "false")
 print(str(len(checks))+' Beta36 browser checks passed',errors,flush=True)
 b.close()
