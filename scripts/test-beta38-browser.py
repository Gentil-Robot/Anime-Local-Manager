import base64,json,mimetypes,re,sys,time,os,subprocess,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
E=Path(os.environ.get('ALM_UI_EVIDENCE',str(R/'test-artifacts/nocturne')));E.mkdir(parents=True,exist_ok=True)
if not shutil.which('ffmpeg'): raise SystemExit('This optional browser test requires FFmpeg for compact media fixtures.')
for target,source,args in [('browser-complete.mp4','alm-clip-complet-1080p.mp4',['-vf','scale=640:-2','-c:a','aac','-b:a','48k','-c:v','libx264','-crf','32','-preset','ultrafast','-movflags','+faststart'])]:
 if not (E/target).exists(): subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(R/'public/assets'/source),*args,str(E/target)],check=True)
assets={'/'+str(f.relative_to(R/'public')):'/'+str(f.relative_to(R/'public')) for f in (R/'public/assets').rglob('*') if f.is_file()}

fixture=[{'id':i+1,'title':name,'malId':i+101,'status':status,'episodesSeen':str(seen),'episodesTotal':'12','score':str(score),'genres':genres,'poster':poster,'notes':'Ma note reste exactement ici.'} for i,(name,status,seen,score,genres,poster) in enumerate([
 ('Collection de test - A','Completed',12,9,['Action','Adventure','Fantasy'],'/assets/design/clip-poster.jpg'),
 ('Collection de test - B','Watching',7,8,['Drama','Romance'],'/assets/design/aster-portrait.webp'),
 ('Collection de test - C','Plan to Watch',0,0,['Mystery','Fantasy'],''),
 ('Collection de test - D','Completed',12,10,['Sci-Fi','Action'],''),
 ('Collection de test - E','Watching',5,7,['Comedy','Slice of Life'],''),
 ('Collection de test - F','On-Hold',3,0,['Fantasy','Adventure'],'')])]
fixture[0]['completedOn']='2024-02-29';fixture[0]['watchEvents']=[{'id':'event1','date':'2026-10-04','episodes':2}]
fixtures={'/api/animes':fixture,'/api/config':{},'/api/v2/stats':{'totalAnimes':6,'totalEpisodes':39,'totalDays':0,'totalHours':15,'averageScore':8.5,'favoriteGenre':'Fantasy','favoriteYear':'2026'},'/api/v2/profile':{'patterns':{}},'/karaoke/song.json':json.loads((R/'public/karaoke/song.json').read_text())}
fixtures['/api/news/results']={'news':[{'title':'Suite de démonstration','sourceTitle':'Série de démonstration','seasonClass':'direct_sequel','defaultSelected':True}],'completedAt':'2026-09-13T09:00:00Z'}
for f in (R/'public/locales').glob('*.json'):fixtures['/locales/'+f.name]=json.loads(f.read_text())
for f in (R/'public').glob('*.json'):fixtures['/'+f.name]=json.loads(f.read_text())
raw=(R/'public/index.html').read_text();scripts=re.findall(r'<script[^>]*src="([^"]+)"',raw);html=re.sub(r'<script\b[^>]*src=[^>]*></script>','',raw);html=re.sub(r'<link\b[^>]*>','',html)
checks=[];errors=[]
print('Loading real UI and local assets',flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('ALM_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1672,'height':1000},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 def serve_asset(route):
  if not route.request.url.endswith('alm-clip-complet-1080p.mp4'):
   route.fulfill(path=str(R/'public'/route.request.url.split('http://alm.test/')[1]));return
  video=(E/'browser-complete.mp4').read_bytes();requested=route.request.headers.get('range','');match=re.match(r'bytes=(\d+)-(\d*)',requested)
  if match:
   start=int(match.group(1));end=min(len(video)-1,int(match.group(2)) if match.group(2) else len(video)-1)
   route.fulfill(status=206,body=video[start:end+1],headers={'Content-Type':'video/mp4','Content-Range':f'bytes {start}-{end}/{len(video)}','Accept-Ranges':'bytes'})
  else:route.fulfill(body=video,headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes'})
 page.route('http://alm.test/assets/**',serve_asset)
 page.set_content('<base href="http://alm.test/">'+html)
 for name in ['style.css','design.css','nocturne.css','beta37.css','beta38.css']:
  css=(R/'public'/name).read_text()
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
  window.__backup={enabled:false,unlocked:false,secretStorage:'session',directory:'',intervalHours:24,retention:7};window.__airing={enabled:true,unlinked:0,items:[{animeId:2,episode:8,airingAt:1791133200,title:'Collection de test - B'}],source:'AniList',error:''};const fixtureRows=()=>fixtures['/api/animes'];window.__requests=[];window.fetch=async(raw,options={})=>{const u=new URL(raw,'http://alm.test');window.__requests.push(u.pathname);let data=fixtures[u.pathname];
   if(u.pathname==='/api/viewing'){
    const year=Number(u.searchParams.get('year')),completed=fixtureRows().filter(a=>a.status==='Completed'&&a.completedOn?.startsWith(year+'-')),daily=new Map();for(const a of fixtureRows())for(const v of a.watchEvents||[]){if(v.date.startsWith(year+'-')){const d=daily.get(v.date)||{date:v.date,episodes:0,animeIds:[]};d.episodes+=v.episodes;d.animeIds.push(a.id);daily.set(v.date,d);}}data={year,years:[2026,2024],completed,undated:fixtureRows().filter(a=>a.status==='Completed'&&!a.completedOn),days:[...daily.values()]};
   }else if(u.pathname==='/api/completion')data={episodes:25};
   else if(u.pathname==='/api/discover')data={items:[{title:'Re:Zero wrong special',malId:990006,type:'Special',episodesTotal:1,publicScore:7},{title:'Re:Zero correct TV',malId:990005,type:'TV',episodesTotal:25,poster:'/assets/design/clip-poster.jpg',publicScore:8}],source:'fixture'};
   else if(u.pathname.startsWith('/api/animes/')&&options.method==='PUT'){const id=Number(u.pathname.split('/').pop()),a=fixtureRows().find(x=>x.id===id),body=JSON.parse(options.body),delta=Number(body.episodesSeen)-Number(a.episodesSeen);data={...a,...body};if(body.watchedOn&&delta>0)data.watchEvents=[...(a.watchEvents||[]),{id:'increment',date:body.watchedOn,episodes:delta}];Object.assign(a,data);}
   else if(u.pathname==='/api/backup/encrypted/status')data=window.__backup;
   else if(u.pathname==='/api/backup/encrypted/settings'){window.__backup={...window.__backup,...JSON.parse(options.body),unlocked:true};window.__backupPayload=JSON.parse(options.body);delete window.__backup.password;data=window.__backup;}
   else if(u.pathname.startsWith('/api/airing'))data=u.pathname.endsWith('/notifications')?{items:[]}:u.pathname.endsWith('/settings')?{...window.__airing,...JSON.parse(options.body)}:window.__airing;
   else if(u.pathname.startsWith('/api/updates'))data={current:'2.0.0-beta.38',available:true,latest:'2.0.0-beta.39',releaseUrl:'https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/2.0.0-beta.39',error:''};
   else if(u.pathname==='/api/animes'&&options.method==='POST'){const body=JSON.parse(options.body),existing=window.ALM_COLLECTION.find(body,fixtures['/api/animes']);data=existing?{...existing,_addOutcome:{status:'existing'}}:{...body,id:500,_addOutcome:{status:'added'}};if(!existing)fixtures['/api/animes'].push(data);}
   else if(u.pathname==='/api/services')data={services:[['jikan','Jikan / MyAnimeList'],['anilist','AniList'],['kitsu','Kitsu'],['tvmaze','TVMaze'],['betaseries','BetaSeries'],['mymemory','MyMemory'],...Array.from({length:15},(_,i)=>['rss-'+i,'Flux de démonstration '+(i+1)])].map(([id,name])=>({id,name,group:id.startsWith('rss')?'news':id==='mymemory'?'translation':'metadata',configured:id!=='betaseries',lang:id.startsWith('rss')?'fr':undefined}))};
   else if(u.pathname.startsWith('/api/services/')){const id=u.pathname.split('/')[3];data={id,state:id==='betaseries'?'unconfigured':id==='rss-2'?'timeout':'available',latencyMs:id==='betaseries'?null:143,httpStatus:id==='betaseries'||id==='rss-2'?null:200,checkedAt:'2026-09-17T10:30:00Z'};}
   else if(u.pathname==='/api/rankings/studios')data={studios:[{name:'Madhouse',count:220},{name:'Kyoto Animation',count:80}]};
   else if(u.pathname.startsWith('/api/rankings/studio'))data={items:Array.from({length:25},(_,i)=>({malId:8000+i,title:'Exemple Madhouse '+(i+1),rank:240+i,publicScore:9-i/100,poster:assets['/assets/design/clip-poster.jpg'],synopsis:'A test studio synopsis.',studios:['Madhouse'],type:'TV',episodesTotal:12})),source:'jikan-studio',studio:'Madhouse',refreshing:false};
   else if(u.pathname==='/api/metadata/autonomous/sync'){window.__job=0;data={ok:true,running:true};}
   else if(u.pathname==='/api/metadata/autonomous/status'){if(window.__job!==undefined){const done=Math.min(window.__job++,4);data={running:done<4,progress:{total:4,done,rows:done*10,skippedPages:0,phase:done<3?'fetch':'save',source:'Jikan',page:done+1,status:done<4?'running':'done',merged:40,newRows:2}};}else data={running:false,progress:null};}
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
 for name in scripts:
  print('Loading',name,flush=True);page.add_script_tag(content=(R/'public'/name.lstrip('/')).read_text())
 page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
 page.wait_for_function('window.ALM_DESIGN && window._almAnimes?.length===6')
 page.wait_for_timeout(500);page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 def check(label,expr):
  value=page.evaluate(expr)
  if not value: raise AssertionError(label+' '+str(value))
  checks.append(label);print('OK',label,flush=True)
 def shot(name):
  page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(150);page.screenshot(path=str(E/(name+'.png')),full_page=True);page.screenshot(path=str(E/(name+'-viewport.png')))

 page.evaluate('document.querySelector(\'.nav-item[data-filter="Watching"]\').click()');page.wait_for_timeout(250)
 check('Watching identity survives shared navigation handlers','document.body.dataset.studioView===\'watching\'&&document.querySelector(\'.nav-item[data-filter="Watching"]\').classList.contains(\'active\')&&document.querySelectorAll(\'#animeGrid .card\').length===2')
 check('real broadcast schedule is distinct from viewing heatmap',"document.getElementById('airingPanel').checkVisibility()&&document.querySelector('.airing-entry').textContent.includes('8')&&document.getElementById('airingPanel').textContent.includes('diffusion')")
 page.locator('.viewing-increment').first.click();page.wait_for_timeout(180)
 check('next episode updates Watching without leaving the page',"document.body.dataset.studioView==='watching'&&window._almAnimes.find(a=>a.id===2).episodesSeen==='8'&&window._almAnimes.find(a=>a.id===2).watchEvents.length===1")
 shot('38-en-cours')
 page.evaluate('document.getElementById("navDna").click()');page.wait_for_timeout(300)
 page.locator('[data-viewing-tab="calendar"]').click();page.wait_for_timeout(180)
 check('viewing calendar opens with recorded days only',"document.querySelectorAll('.viewing-heatmap button').length===365&&document.querySelectorAll('.viewing-heatmap button:not([data-level=\"0\"])').length>=1&&document.getElementById('dnaProfileContent').hidden")
 shot('38-calendrier-activite')
 page.evaluate("const y=document.getElementById('viewingYear');y.value='2024';y.dispatchEvent(new Event('change',{bubbles:true}))");page.wait_for_timeout(180)
 check('leap-year calendar and no invented activity',"document.querySelectorAll('.viewing-heatmap button').length===366&&document.querySelectorAll('.viewing-heatmap button:not([data-level=\"0\"])').length===0")
 check('month headers align with their actual weeks',"[...document.querySelectorAll('.viewing-months span')].every((s,m)=>{const b=document.querySelector('[data-date=\"2024-'+String(m+1).padStart(2,'0')+'-01\"]');return Math.abs(s.getBoundingClientRect().left-b.getBoundingClientRect().left)<2})")
 shot('38-calendrier')
 page.locator('[data-viewing-tab="years"]').click();page.wait_for_timeout(180)
 check('completed year uses viewing date and changes its heading',"document.getElementById('viewingTitle').textContent==='Mes années anime'&&document.querySelectorAll('.viewing-poster').length===1&&document.querySelector('.viewing-poster').textContent.includes('Collection de test - A')")
 shot('38-annees')
 page.evaluate("const y=document.getElementById('viewingYear');y.value='unknown';y.dispatchEvent(new Event('change',{bubbles:true}))");page.wait_for_timeout(180)
 check('undated imports have their own explicit section',"document.querySelectorAll('.viewing-poster').length===1&&document.querySelector('.viewing-poster').textContent.includes('Collection de test - D')")
 page.locator('[data-viewing-tab="years"]').focus();page.keyboard.press('Home');page.keyboard.press('Enter');page.wait_for_timeout(150)
 check('tabs support keyboard and restore original DNA profile',"!document.getElementById('dnaProfileContent').hidden&&document.getElementById('viewingPanel').hidden")
 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate("lang=>{window.ALM_I18N.setLanguage(lang);window.dispatchEvent(new Event('alm:language-changed'));}",lang);page.wait_for_timeout(80)
  check('new feature labels translated in '+lang,"[...document.querySelectorAll('[data-design-text=watching],[data-design-text=viewingCalendar],[data-design-text=backupTitle],[data-design-text=airingTitle],[data-design-text=updateTitle]')].every(n=>n.textContent.length>0&&n.textContent!==n.dataset.designText)")
 page.evaluate("window.ALM_I18N.setLanguage('fr');window.dispatchEvent(new Event('alm:language-changed'))")
 page.evaluate("window.__choice=null;window.ALM_BETA38.preparePayload({title:'re zero',autoInfo:true,status:'Completed',genres:[]}).then(p=>window.__choice=p);void 0");page.wait_for_timeout(100)
 check('ambiguous title opens a real choice dialog',"document.querySelector('.anime-choice-dialog').open&&document.querySelectorAll('.anime-choice-list button').length===2")
 page.locator('.anime-choice-list button').nth(1).click();page.wait_for_timeout(100)
 check('chosen correct record keeps exact MAL id and total',"window.__choice.malId===990005&&window.__choice.episodesTotal==='25'&&window.__choice.episodesSeen==='25'&&window.__choice.autoInfo===false")
 page.evaluate("window.__cancelled=false;window.ALM_BETA38.preparePayload({title:'cancel fixture',autoInfo:true,status:'Watching'}).then(p=>window.__cancelled=p===null);void 0");page.wait_for_timeout(80);page.locator('[data-choice-cancel]').click();page.wait_for_timeout(60)
 check('cancelled choice creates no record',"window.__cancelled&&!document.querySelector('.anime-choice-dialog')")
 page.evaluate("document.getElementById('navSettings').click();window.ALM_SETTINGS.select('backup')");page.wait_for_timeout(150)
 page.locator('#encryptedBackupDirectory').fill('/fixture/nas');page.locator('#encryptedBackupPassword').fill('Mot de passe long pour fixture');page.locator('#encryptedBackupEnabled').check();page.locator('#encryptedBackupSave').click();page.wait_for_timeout(120)
 check('backup settings clear password and preserve selected folder',"window.__backupPayload.directory==='/fixture/nas'&&window.__backupPayload.enabled&&document.getElementById('encryptedBackupPassword').value===''&&document.getElementById('encryptedBackupDirectory').value==='/fixture/nas'")
 shot('38-sauvegardes')
 page.wait_for_timeout(2600)
 check('new version notice points only to official release',"!document.getElementById('almUpdateNotice').hidden&&document.getElementById('almUpdateNoticeLink').href==='https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/2.0.0-beta.39'")
 page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
 page.locator('#almUpdateLater').click()
 check('update proposal can be dismissed',"document.getElementById('almUpdateNotice').hidden")

 page.evaluate('document.getElementById("navAbout").click()');page.wait_for_timeout(250)
 check('four local wallpapers beside the GIF',"""(()=>{const links=[...document.querySelectorAll('[data-wallpaper]')],r=s=>document.querySelector(s).getBoundingClientRect(),g=r('.alm-retro-banner'),w=r('.alm-wallpapers'),d=r('.donation-methods');return links.length===4&&new Set(links.map(a=>a.getAttribute('href'))).size===4&&links.every(a=>a.hasAttribute('download'))&&g.right<w.left&&w.top>=d.bottom;})()""")
 page.locator('.studio-support-grid').screenshot(path=str(E/'38-soutien.png'))
 page.wait_for_function("document.getElementById('donationKaraokeClip').readyState>=1",timeout=30000)
 check('one audible media clock and complete duration',"""(()=>{const v=document.getElementById('donationKaraokeClip');return !document.querySelector('.donation-karaoke audio')&&!v.muted&&!v.loop&&v.duration>225&&v.duration<226;})()""")
 page.evaluate("const v=document.getElementById('donationKaraokeClip');v.currentTime=15;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(200)
 check('lyrics inside sky without panel background',"""(()=>{const v=document.getElementById('donationKaraokeClip').getBoundingClientRect(),a=document.querySelector('.donation-karaoke-active'),r=a.getBoundingClientRect();return r.left>=v.left+v.width*.25&&r.right<=v.left+v.width*.75&&r.bottom<=v.top+v.height*.17&&getComputedStyle(a).backgroundColor==='rgba(0, 0, 0, 0)';})()""")
 page.locator('.donation-karaoke-stage').screenshot(path=str(E/'38-clip-ciel.png'))
 page.evaluate("const v=document.getElementById('donationKaraokeClip');v.currentTime=29;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(150)
 check('0:29 restored phrase and dark contrast over sky',"Math.abs(document.getElementById('donationKaraokeClip').currentTime-29)<.05&&document.getElementById('donationKaraokeOriginalLine').textContent.includes('また明日')&&getComputedStyle(document.getElementById('donationKaraokeOriginalLine')).color==='rgb(23, 43, 76)'")
 check('romaji active token also contrasts against blue sky',"getComputedStyle(document.querySelector('.karaoke-romaji-unit.romaji-active')).color==='rgb(82, 33, 105)'")
 page.locator('.donation-karaoke-stage').screenshot(path=str(E/'38-clip-29s.png'))
 check('wallpaper dimensions are actual pixels',"document.querySelectorAll('.wallpaper-size').length===4&&[...document.querySelectorAll('.wallpaper-size')].every(n=>n.textContent.includes('1672')&&n.textContent.includes('941'))")
 page.evaluate("document.getElementById('donationKaraokeClip').play();document.getElementById('donationKaraokeMode').click()");page.wait_for_timeout(200)
 check('expanded player has separated reduce and close commands',"(()=>{const a=[...document.querySelectorAll('.karaoke-window-actions button')],r=a.map(n=>n.getBoundingClientRect());return a[0].checkVisibility()&&r[1].left-r[0].right>=20&&a[0].textContent==='Réduire'&&a[1].textContent==='Fermer et arrêter';})()")
 page.locator('.karaoke-window-actions button').first.click();page.wait_for_timeout(180)
 check('reducing keeps playback',"!document.getElementById('donationKaraokeClip').paused&&!document.querySelector('.karaoke-focus-mode')")
 page.evaluate("document.getElementById('donationKaraokeMode').click()");page.wait_for_timeout(180);page.locator('.karaoke-window-actions button').nth(1).click();page.wait_for_timeout(180)
 check('closing pauses playback and returns to About',"document.getElementById('donationKaraokeClip').paused&&!document.querySelector('.karaoke-focus-mode')")

 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate("lang=>{window.ALM_I18N.setLanguage(lang);window.dispatchEvent(new Event('alm:language-changed'));}",lang);page.wait_for_timeout(100)
  check('sky layout in '+lang,"""(()=>{const v=document.getElementById('donationKaraokeClip').getBoundingClientRect(),r=document.querySelector('.donation-karaoke-active').getBoundingClientRect();return r.bottom<=v.top+v.height*.17&&document.getElementById('donationKaraokeFrLine').textContent.length>0;})()""")
 page.evaluate("window.ALM_I18N.setLanguage('fr');const v=document.getElementById('donationKaraokeClip');v.currentTime=220;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(100)
 check('last lyric punctuation survives timed tokens',"document.getElementById('donationKaraokeOriginalLine').textContent.includes('……')")
 page.evaluate('document.getElementById("navRanking").click()');page.wait_for_timeout(150)
 page.evaluate("const s=document.getElementById('rankingStudio');s.value='Madhouse';s.dispatchEvent(new Event('change',{bubbles:true}))");page.wait_for_timeout(200)
 check('studio position and global MAL rank are distinct',"document.querySelector('.ranking-place').textContent==='1'&&document.getElementById('rankingDetail').textContent.includes('240')")
 page.locator('#rankingDetail').get_by_role('button',name='Ajouter à voir',exact=True).click();page.wait_for_timeout(150)
 check('add remains on selected studio',"document.body.dataset.studioView==='rankingPage'&&document.getElementById('rankingStudio').value==='Madhouse'&&window.ALM_COLLECTION.find({malId:8000})")
 page.locator('#rankingPage').screenshot(path=str(E/'38-classement-studio.png'))
 page.evaluate("document.getElementById('navSettings').click();window.ALM_SETTINGS.select('library')");page.wait_for_timeout(150)
 page.locator('#syncMetadataAutonomousNow').click();page.wait_for_timeout(150)
 check('database job progress and duplicate-start prevention',"!document.getElementById('metadataJobProgress').hidden&&document.getElementById('syncMetadataAutonomousNow').disabled")
 page.wait_for_timeout(850)
 page.locator('#metadataJobProgress').screenshot(path=str(E/'38-progression-bdd.png'))
 page.wait_for_timeout(2800)
 check('completion re-enables update',"!document.getElementById('syncMetadataAutonomousNow').disabled&&document.getElementById('metadataJobBar').value===4")
 page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close());document.getElementById("navAbout").click()')
 for width in [1280,1000,760,480]:
  page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(150)
  check('no overflow at '+str(width),"document.documentElement.scrollWidth<=innerWidth+2")
 page.locator('.studio-support-grid').screenshot(path=str(E/'38-soutien-480.png'))
 assert not errors,errors
 print(str(len(checks))+' browser checks passed; deterministic provider fixtures and compact video fixture.',flush=True)
 b.close()
