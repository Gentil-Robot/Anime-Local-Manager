import base64,json,mimetypes,re,sys,time,os,subprocess,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
E=Path(os.environ.get('ALM_UI_EVIDENCE',str(R/'test-artifacts/nocturne')));E.mkdir(parents=True,exist_ok=True)
if not shutil.which('ffmpeg'): raise SystemExit('This optional browser test requires FFmpeg for compact media fixtures.')
for target,source,args in [('browser-complete.webm','alm-clip-complet-1080p.mp4',['-vf','scale=640:-2','-c:a','libopus','-b:a','48k','-c:v','libvpx-vp9','-crf','38','-b:v','0','-deadline','realtime','-cpu-used','8'])]:
 if not (E/target).exists(): subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(R/'public/assets'/source),*args,str(E/target)],check=True)
assets={'/'+str(f.relative_to(R/'public')):'/'+str(f.relative_to(R/'public')) for f in (R/'public/assets').rglob('*') if f.is_file()}

fixture=[{'id':i+1,'title':name,'malId':i+101,'status':status,'episodesSeen':str(seen),'episodesTotal':'12','score':str(score),'genres':genres,'poster':poster,'notes':'Ma note reste exactement ici.'} for i,(name,status,seen,score,genres,poster) in enumerate([
 ('Collection de test - A','Completed',12,9,['Action','Adventure','Fantasy'],'/assets/design/clip-poster.jpg'),
 ('Collection de test - B','Watching',7,8,['Drama','Romance'],'/assets/design/aster-portrait.webp'),
 ('Collection de test - C','Plan to Watch',0,0,['Mystery','Fantasy'],''),
 ('Collection de test - D','Completed',12,10,['Sci-Fi','Action'],''),
 ('Collection de test - E','Watching',5,7,['Comedy','Slice of Life'],''),
 ('Collection de test - F','On-Hold',3,0,['Fantasy','Adventure'],'')])]
fixture[1]['imageUrl']=fixture[1]['poster'];fixture[1]['poster']=''
fixture[0]['studios']=['Studio A'];fixture[1]['studios']=['Studio B'];fixture[2]['studios']=['Studio A']
fixture[0]['startDate']='2001-07-20';fixture[1]['startDate']='2012-04-01';fixture[2]['startDate']='2012-01-01';fixture[0]['completedOn']='2024-02-29';fixture[0]['watchEvents']=[{'id':'event1','date':'2026-10-04','episodes':2}]
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
  video=(E/'browser-complete.webm').read_bytes();requested=route.request.headers.get('range','');match=re.match(r'bytes=(\d+)-(\d*)',requested)
  if match:
   start=int(match.group(1));end=min(len(video)-1,int(match.group(2)) if match.group(2) else len(video)-1)
   route.fulfill(status=206,body=video[start:end+1],headers={'Content-Type':'video/webm','Content-Range':f'bytes {start}-{end}/{len(video)}','Accept-Ranges':'bytes'})
  else:route.fulfill(body=video,headers={'Content-Type':'video/webm','Accept-Ranges':'bytes'})
 page.route('http://alm.test/assets/**',serve_asset)
 page.set_content('<base href="http://alm.test/">'+html)
 for name in ['style.css','design.css','nocturne.css','beta37.css','beta38.css','beta39.css','beta40.css','beta41.css']:
  css=(R/'public'/name).read_text()
  page.add_style_tag(content=css)
 font_root=os.environ.get('ALM_QA_FONTS')
 if font_root:
  for family in ['noto-sans-jp','noto-sans-sc','noto-emoji']:
   base=Path(font_root)/('@fontsource/'+family)
   css=(base/'400.css').read_text()+((base/'700.css').read_text() if (base/'700.css').exists() else '')
   css=re.sub(r"url\(\./(files/[^)]+)\)",lambda m:'url(data:font/woff2;base64,'+base64.b64encode((base/m.group(1)).read_bytes()).decode()+')',css)
   page.add_style_tag(content=css)
  page.add_style_tag(content="body{font-family:'Segoe UI','DejaVu Sans','Noto Sans JP','Noto Sans SC','Noto Emoji',system-ui,sans-serif}")
 page.evaluate('''({fixtures,assets})=>{
  window.__almFixtures=fixtures;const store=new Map([['alm-language','fr']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
  window.__backup={enabled:false,unlocked:false,secretStorage:'session',directory:'',intervalHours:24,retention:7};window.__airing={enabled:false,chosen:false,unlinked:0,items:[{animeId:2,episode:8,airingAt:1791133200,title:'Collection de test - B'}],source:'AniList',error:''};const fixtureRows=()=>fixtures['/api/animes'];window.__notices={muted:false,unread:0,items:[]};window.__requests=[];window.fetch=async(raw,options={})=>{const u=new URL(raw,'http://alm.test');window.__requests.push(u.pathname);let data=fixtures[u.pathname];
   if(u.pathname.startsWith('/api/notifications')){const body=options.body?JSON.parse(options.body):{};if(u.pathname.endsWith('/test')){window.__notices.items.unshift({id:String(Date.now()),type:'test',title:'Anime Local Manager',createdAt:Date.now(),read:false});window.__notices.unread++;}if(u.pathname.endsWith('/read'))window.__notices.unread=0;if(u.pathname.endsWith('/clear')){window.__notices.items=[];window.__notices.unread=0;}if(u.pathname.endsWith('/settings'))window.__notices.muted=body.muted;data=window.__notices;}else if(u.pathname==='/api/titles')data={titles:{199:{fr:'Le Voyage de Chihiro',en:'Spirited Away'}}};else if(u.pathname==='/api/library/completion-issues')data={items:window.__completionIssues||[]};else if(u.pathname==='/api/bulk/titles')data={jobId:'titles-fixture'};else if(u.pathname==='/api/bulk/complete-all/progress/titles-fixture')data={kind:'titles',status:'done',total:6,done:6,updatedInfos:1,updatedImages:0,failed:0,elapsed:1};else if(u.pathname.startsWith('/api/calendar')){data=window.__calendar;}else if(u.pathname==='/api/viewing'){
    const year=Number(u.searchParams.get('year')),completed=fixtureRows().filter(a=>a.status==='Completed'&&a.completedOn?.startsWith(year+'-')),daily=new Map();for(const a of fixtureRows())for(const v of a.watchEvents||[]){if(v.date.startsWith(year+'-')){const d=daily.get(v.date)||{date:v.date,episodes:0,animeIds:[]};d.episodes+=v.episodes;d.animeIds.push(a.id);daily.set(v.date,d);}}data={year,years:[2026,2024],completed,undated:fixtureRows().filter(a=>a.status==='Completed'&&!a.completedOn),days:[...daily.values()]};
   }else if(u.pathname==='/api/completion')data={episodes:25};
   else if(u.pathname==='/api/discover')data={items:[{title:'Re:Zero wrong special',malId:990006,type:'Special',episodesTotal:1,publicScore:7},{title:'Re:Zero correct TV',malId:990005,type:'TV',episodesTotal:25,poster:'/assets/design/clip-poster.jpg',publicScore:8}],source:'fixture'};
   else if(u.pathname.startsWith('/api/animes/')&&options.method==='PUT'){const id=Number(u.pathname.split('/').pop()),a=fixtureRows().find(x=>x.id===id),body=JSON.parse(options.body),delta=Number(body.episodesSeen)-Number(a.episodesSeen);data={...a,...body};if(body.watchedOn&&delta>0)data.watchEvents=[...(a.watchEvents||[]),{id:'increment',date:body.watchedOn,episodes:delta}];Object.assign(a,data);}
   else if(u.pathname==='/api/backup/encrypted/restore'){window.__restoreCalls=(window.__restoreCalls||0)+1;window.__restorePassword=options.body.get('password');data={ok:true};}
   else if(u.pathname==='/api/backup/encrypted/status')data=window.__backup;
   else if(u.pathname==='/api/backup/encrypted/settings'){window.__backup={...window.__backup,...JSON.parse(options.body),unlocked:true};window.__backupPayload=JSON.parse(options.body);delete window.__backup.password;data=window.__backup;}
   else if(u.pathname.startsWith('/api/airing'))data=u.pathname.endsWith('/notifications')?{items:[]}:u.pathname.endsWith('/settings')?(window.__airing={...window.__airing,...JSON.parse(options.body),chosen:true}):window.__airing;
   else if(u.pathname.startsWith('/api/updates'))data={current:'2.0.0-beta.39',available:true,latest:'2.0.0-beta.40',releaseUrl:'https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/2.0.0-beta.40',error:''};
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
 page.evaluate("""()=>{const rows=window.__almFixtures['/api/animes'];window.__calendar={checkedAt:new Date().toISOString(),running:false,error:'',events:[{key:'w',anime:rows[1],title:rows[1].title,episode:8,airingAt:Date.parse('2026-10-04T19:00:00Z')/1000,category:'watching',source:'AniList'},{key:'p',anime:rows[2],title:rows[2].title,episode:1,airingAt:Date.parse('2026-10-05T19:00:00Z')/1000,category:'planned',source:'AniList'},{key:'m',anime:{malId:999901,title:'Film de test',type:'Movie',synopsis:'A movie synopsis.',poster:'/assets/design/clip-poster.jpg'},title:'Film de test',date:'2026-10-06',allDay:true,category:'movie',source:'MyAnimeList / Jikan'},{key:'n',anime:{malId:999902,title:'Nouvel anime de test',type:'TV',synopsis:'A new series.',episodesTotal:12},title:'Nouvel anime de test',date:'2026-10-07',allDay:true,category:'premiere',source:'MyAnimeList / Jikan'},{key:'e',anime:{malId:999903,title:'Autre épisode'},title:'Autre épisode',episode:3,airingAt:Date.parse('2026-10-08T19:00:00Z')/1000,category:'episode',source:'AniList'}]};window.animeManager={updateState:async()=>({phase:'idle',supported:true}),onUpdate:cb=>{window.__updateListener=cb;},updateDownload:async()=>({phase:'ready',supported:true,progress:100}),updateInstall:async()=>({phase:'installing',supported:true}),updateCancel:async()=>{},onEpisode:()=>{}};}""")
 for name in scripts:
  print('Loading',name,flush=True);page.add_script_tag(content=(R/'public'/name.lstrip('/')).read_text())
 page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
 page.wait_for_function('window.ALM_DESIGN && window._almAnimes?.length===6')
 page.wait_for_timeout(500);page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 def check(label,expr):
  value=page.evaluate(expr)
  if not value:
   raise AssertionError(label+' '+str(value))
  checks.append(label);print('OK',label,flush=True)
 def shot(name):
  page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(150);page.screenshot(path=str(E/(name+'.png')),full_page=True);page.screenshot(path=str(E/(name+'-viewport.png')))

 page.evaluate('document.querySelector(\'.nav-item[data-filter="Watching"]\').click()');page.wait_for_timeout(150)
 check('Watching keeps only the notification preference',"document.querySelector('#airingPanel').textContent.trim()===window.ALM_DESIGN.t('airingEnabled')&&!document.querySelector('#airingEntries')")
 check('Calendar is between Seasons and Rankings',"document.querySelector('#navSeasonNews').nextElementSibling.id==='navCalendar'&&document.querySelector('#navCalendar').nextElementSibling.id==='navRanking'")
 page.check('#airingEnabled');page.wait_for_timeout(150)
 check('Initial notification opt-in disappears after one choice',"getComputedStyle(document.querySelector('#airingPanel')).display==='none'&&window.__airing.enabled&&document.querySelector('#notificationEnabled').checked")
 page.click('#navCalendar');page.wait_for_timeout(200)
 check('Calendar navigation and breadcrumb',"document.body.dataset.studioView==='calendarPage'&&document.querySelector('#studioBreadcrumb').textContent.includes('Calendrier')")
 check('Month displays 42 date cells and all five category colors',"document.querySelectorAll('.calendar-day').length===42&&new Set([...document.querySelectorAll('.calendar-event')].map(b=>getComputedStyle(b).borderLeftColor)).size===5")
 check('Calendar provides both scroll controls',"!document.querySelector('#scrollJumpTop').hidden&&!document.querySelector('#scrollJumpBottom').hidden")
 shot('41-calendrier')
 page.click('[data-key=m]');page.wait_for_timeout(120)
 check('Film opens a detailed popup with MAL and status choices',"document.querySelector('#calendarPopup').open&&document.querySelector('#calendarDetail h2').textContent==='Film de test'&&document.querySelector('#calendarAddStatus').options.length===5&&document.querySelector('#calendarDetail a').href.includes('/anime/999901')")
 page.select_option('#calendarAddStatus','Watching');page.click('#calendarAdd');page.wait_for_timeout(150)
 check('Calendar addition stays in Calendar and blocks duplicate',"document.body.dataset.studioView==='calendarPage'&&!document.querySelector('#calendarAdd')&&document.querySelector('#calendarOpen')")
 page.click('[data-close-calendar=calendarPopup]');page.click('[data-calendar-tab=history]');page.wait_for_timeout(100)
 check('Calendar timeline uses release years, not personal completion dates',"document.querySelector('[data-year=\"2001\"]')&&document.querySelector('[data-year=\"2012\"]')&&!document.querySelector('[data-year=\"2024\"]')")
 page.select_option('#releaseHistoryYear','2001');page.wait_for_timeout(100)
 check('Year filter uses the same release year as Library',"document.querySelectorAll('.release-era').length===1&&document.querySelector('.release-poster strong').textContent==='Collection de test - A'")
 page.select_option('#releaseHistoryYear','2012');page.wait_for_timeout(120)
 check('History displays imageUrl-only library posters',"[...document.querySelectorAll('.release-poster img')].some(i=>i.complete&&i.naturalWidth>0)")
 page.evaluate("window._almAnimes.push(...Array.from({length:45},(_,i)=>({id:1000+i,title:'Dense year '+i,startDate:'1999-01-01'})));window.ALM_RELEASE_HISTORY.render()")
 page.select_option('#releaseHistoryYear','1999');page.wait_for_timeout(80)
 check('Large year starts with twenty posters',"document.querySelectorAll('.release-poster').length===20")
 page.click('.release-more');check('Large year expands in a bounded batch',"document.querySelectorAll('.release-poster').length===40")
 page.click('.release-more');check('Last poster batch hides its more button',"document.querySelectorAll('.release-poster').length===45&&document.querySelector('.release-more').hidden")
 page.evaluate("window._almAnimes=window._almAnimes.filter(a=>a.id<1000)");page.select_option('#releaseHistoryYear','all');shot('41-historique')
 check('History provides both scroll controls',"!document.querySelector('#scrollJumpTop').hidden&&!document.querySelector('#scrollJumpBottom').hidden")
 page.click('#navRanking');page.wait_for_timeout(150)
 check('Rankings provide both scroll controls',"!document.querySelector('#scrollJumpTop').hidden&&!document.querySelector('#scrollJumpBottom').hidden")
 page.click('#navDna');page.wait_for_timeout(150)
 check('DNA does not expose duplicate history tabs',"!document.querySelector('#dnaPage .viewing-tabs')&&!document.querySelector('#viewingTab-calendar')&&!document.querySelector('#viewingTab-years')")
 check('Returning to DNA restores its visible profile',"!document.querySelector('#dnaProfileContent').hidden&&document.querySelector('#viewingPanel').parentElement.id==='dnaPage'")
 page.evaluate('document.querySelector(\'.nav-item[data-filter=""]\').click()');page.wait_for_timeout(120)
 page.select_option('#studioFilter','Studio A');page.wait_for_timeout(80)
 check('Library studio filter uses exact metadata studio names',"document.querySelectorAll('#animeGrid .card').length===2")
 page.select_option('#sort','studio');page.wait_for_timeout(60)
 check('Studio filter and sorting are dark custom controls',"document.querySelector('#studioFilter').closest('.alm-select')&&document.querySelector('#sort').value==='studio'")
 shot('41-studios')
 page.click('#navReco');page.wait_for_timeout(250)
 check('Recommendations expose watching/completed status choices',"[...document.querySelector('.reco-add-status').options].some(o=>o.value==='Watching')&&[...document.querySelector('.reco-add-status').options].some(o=>o.value==='Completed')")
 page.select_option('.reco-add-status >> nth=0','Watching');check('Recommendation action follows Watching status',"document.querySelector('.reco-card-add').textContent===window.ALM_DESIGN.t('addWatching')");page.click('.reco-card-add >> nth=0');page.wait_for_timeout(100)
 check('Recommendation status is saved without leaving the page',"document.body.dataset.studioView==='recoPage'&&window._almAnimes.some(a=>a.malId==1111&&a.status==='Watching')")
 check('Recommendations keep a subtle poster fade',"getComputedStyle(document.querySelector('.reco-card-thumb')).maskImage.includes('87%')")
 page.evaluate("window.__almFixtures['/api/discover/1112/record']={malId:1112,title:'Suggestion de test 2',episodesTotal:12}")
 page.select_option('.reco-add-status >> nth=1','Completed');check('Recommendation action follows Completed status',"document.querySelectorAll('.reco-card-add')[1].textContent===window.ALM_DESIGN.t('addCompleted')");page.click('.reco-card-add >> nth=1');page.wait_for_timeout(120)
 check('Recommendation Completed records exact episode totals and stays in Recommendations',"document.body.dataset.studioView==='recoPage'&&window._almAnimes.some(a=>a.malId===1112&&a.status==='Completed'&&String(a.episodesSeen)==='12')")
 page.click('#navSettings');page.click('#settingsTab-updates');page.wait_for_timeout(2500)
 check('Updates have their own section immediately below Maintenance',"document.querySelector('#settingsTab-maintenance').nextElementSibling.id==='settingsTab-updates'&&!document.querySelector('#settingsPanel-updates').hidden&&document.querySelector('#almUpdateCheck').closest('#settingsPanel-updates')")
 page.click('#almUpdateDownload');page.wait_for_timeout(100)
 check('Verified update exposes install/restart action',"!document.querySelector('#almUpdateInstall').hidden&&document.querySelector('#almUpdateStatus').textContent===window.ALM_DESIGN.t('updateReady')")
 shot('41-mises-a-jour');page.evaluate("document.querySelector('#settingsDialog').close()")
 page.evaluate('window.showAboutView()');page.wait_for_timeout(200)
 check('Four wallpapers each offer aligned FHD/QHD/4K downloads',"document.querySelectorAll('.wallpaper-card').length===4&&document.querySelectorAll('.wallpaper-size-links a[download]').length===12&&[...document.querySelectorAll('.wallpaper-size-links')].every(n=>getComputedStyle(n).display==='grid')")
 check('Wallpaper size buttons share the same baseline across all four cards',"Math.max(...[...document.querySelectorAll('.wallpaper-size-links')].map(n=>n.getBoundingClientRect().top))-Math.min(...[...document.querySelectorAll('.wallpaper-size-links')].map(n=>n.getBoundingClientRect().top))<2")
 check('About top cards occupy one complete row',"new Set([...document.querySelector('.about-studio-grid').children].map(n=>Math.round(n.getBoundingClientRect().top))).size===1")
 check('About has wallpapers above GIF with no removed cards',"document.querySelector('.about-studio-grid>.donation-methods')&&document.querySelector('.about-studio-grid>.support-actions')&&!document.querySelector('.feature-hub')&&!document.querySelector('.about-local-summary')&&document.querySelector('.about-media-aside>.alm-wallpapers')&&document.querySelector('.about-media-aside>.alm-retro-banner')&&getComputedStyle(document.querySelector('.wallpaper-grid')).gridTemplateColumns.split(' ').length===4")
 check('Wallpapers and GIF align with video edges',"(()=>{const a=document.querySelector('.about-media-aside').getBoundingClientRect(),v=document.querySelector('.nocturne-player').getBoundingClientRect();return Math.abs(a.top-v.top)<2&&Math.abs(a.bottom-v.bottom)<2;})()")
 page.locator('.studio-support-grid').screenshot(path=str(E/'41-media-layout.png'))
 shot('41-wallpapers')
 check('Opening title is centered',"(()=>{const a=document.querySelector('.karaoke-opening-title').getBoundingClientRect(),v=document.querySelector('.donation-karaoke-stage').getBoundingClientRect();return Math.abs(a.left+a.width/2-v.left-v.width/2)<2;})()")
 page.evaluate("const v=document.getElementById('donationKaraokeClip');v.currentTime=29;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(200)
 check('Bouncing ball is removed visually',"getComputedStyle(document.getElementById('donationKaraokeBall')).display==='none'")
 check('Word gradients are clipped to glyphs with no rectangular background',"[...document.querySelectorAll('.karaoke-original-unit,.karaoke-romaji-unit')].every(n=>getComputedStyle(n).backgroundClip==='text')")
 check('Romaji gradient is visible through transparent glyph fill',"[...document.querySelectorAll('.karaoke-romaji-unit')].every(n=>getComputedStyle(n).webkitTextFillColor==='rgba(0, 0, 0, 0)')")
 check('Both Japanese and romaji have progressive gradient fill',"getComputedStyle(document.querySelector('.karaoke-original-unit')).backgroundImage.includes('linear-gradient')&&getComputedStyle(document.querySelector('.karaoke-romaji-unit')).backgroundImage.includes('linear-gradient')")
 check('Romaji is larger than Japanese',"parseFloat(getComputedStyle(document.getElementById('donationKaraokeJaLine')).fontSize)>parseFloat(getComputedStyle(document.getElementById('donationKaraokeOriginalLine')).fontSize)")
 page.evaluate("document.getElementById('donationKaraokeMode').click()");page.wait_for_timeout(200)
 check('Expanded video has close button in top right',"(()=>{const b=document.getElementById('karaokeClose').getBoundingClientRect();return b.top>=0&&b.top<80&&b.right>innerWidth-200;})()")
 check('Topbar cannot overlay the expanded player',"document.querySelector('.nocturne-player').parentElement===document.body&&getComputedStyle(document.querySelector('.topbar')).visibility==='hidden'&&document.elementFromPoint(innerWidth-60,25).closest('.nocturne-player')")
 check('Translation has one fixed ink color',"[...document.querySelectorAll('.karaoke-fr-unit')].every(n=>getComputedStyle(n).backgroundImage==='none'&&getComputedStyle(n).color==='rgb(244, 242, 237)'&&!n.style.getPropertyValue('--karaoke-progress'))")
 check('Romaji has separate synchronized sung phrase spans',"document.querySelectorAll('.karaoke-romaji-unit').length>1&&document.querySelectorAll('.karaoke-romaji-unit').length===document.querySelectorAll('.karaoke-original-unit').length")
 check('Japanese and romaji progress is driven by the current lyric clock',"[...document.querySelectorAll('.karaoke-original-unit,.karaoke-romaji-unit')].some(n=>parseFloat(n.style.getPropertyValue('--karaoke-progress'))>0)")
 page.evaluate("const l=window.__almFixtures['/karaoke/song.json'].sections.flatMap(s=>s.lines).find(l=>String(l.ja).toLowerCase()==='anime local manager');const v=document.getElementById('donationKaraokeClip');v.currentTime=(l.start+l.end)/2;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(80)
 check('ALM alone is enlarged',"parseFloat(getComputedStyle(document.querySelector('#donationKaraokeOriginalLine')).fontSize)>40")
 check('ALM chorus name appears once',"document.querySelector('.nocturne-player').classList.contains('karaoke-brand-line')&&getComputedStyle(document.querySelector('#donationKaraokeJaLine')).display==='none'&&getComputedStyle(document.querySelector('#donationKaraokeFrLine')).display==='none'&&getComputedStyle(document.querySelector('#donationKaraokeOriginalLine')).display!=='none'")
 page.evaluate("const v=document.getElementById('donationKaraokeClip');v.currentTime=29;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(80)
 (E/'karaoke-computed-style.json').write_text(json.dumps(page.evaluate("[...document.querySelectorAll('.karaoke-original-unit,.karaoke-romaji-unit,.karaoke-opening-title strong')].map(n=>{const s=getComputedStyle(n);return {text:n.textContent,color:s.color,fill:s.webkitTextFillColor,stroke:s.webkitTextStroke,shadow:s.textShadow,background:s.backgroundImage,font:s.font,opacity:s.opacity}})"),ensure_ascii=False,indent=2))
 page.evaluate('document.fonts.ready');
 shot('41-karaoke')
 page.evaluate("document.getElementById('donationKaraokeSeek').focus();const v=document.getElementById('donationKaraokeClip');v.currentTime=40;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(100)
 check('Seek follows playback even while focused',"Math.abs(Number(document.getElementById('donationKaraokeSeek').value)-document.getElementById('donationKaraokeClip').currentTime)<.1")
 page.wait_for_function("Number.isFinite(document.getElementById('donationKaraokeClip').duration)")
 page.evaluate("const v=document.getElementById('donationKaraokeClip');v.currentTime=v.duration-.01;v.dispatchEvent(new Event('timeupdate'))");page.wait_for_timeout(100)
 check('End card contains ALM, song title and chosen-language translation',"document.querySelector('.nocturne-player').classList.contains('karaoke-outro')&&document.querySelector('.karaoke-opening-title').textContent.includes('Le lieu où les histoires prennent vie')&&Number(document.querySelector('#donationKaraokeSeek').value)/Number(document.querySelector('#donationKaraokeSeek').max)>.99")
 check('End card is light and centered on black',"getComputedStyle(document.querySelector('.karaoke-opening-title strong')).color==='rgb(255, 241, 200)'&&Math.abs(document.querySelector('.karaoke-opening-title').getBoundingClientRect().left+document.querySelector('.karaoke-opening-title').getBoundingClientRect().width/2-document.querySelector('.donation-karaoke-stage').getBoundingClientRect().left-document.querySelector('.donation-karaoke-stage').getBoundingClientRect().width/2)<2")
 page.click('#karaokeClose');page.wait_for_timeout(100);page.click('#notificationBell');page.wait_for_timeout(80);page.locator('#notificationCenter').screenshot(path=str(E/'41-notifications.png'));page.click('#notificationClose');page.evaluate('document.getElementById("donationKaraokeMode").click()');page.wait_for_timeout(150)
 shot('41-fin-clip')
 page.click('#karaokeClose');page.wait_for_timeout(80)
 check('Close pauses, restores player and header',"document.getElementById('donationKaraokeClip').paused&&document.querySelector('.nocturne-player').parentElement.classList.contains('studio-support-grid')&&getComputedStyle(document.querySelector('.topbar')).visibility!=='hidden'")
 page.click('#backupBtn');page.wait_for_timeout(120)
 check('Header orders Import then Backup and opens backup settings',"document.querySelector('#importXmlBtn').nextElementSibling.id==='backupBtn'&&!document.querySelector('#settingsPanel-backup').hidden&&document.querySelector('#settingsDialog').open")
 page.fill('#encryptedBackupPassword','example-phrase-40');check('Secret field gives feedback and enables recovery actions',"document.querySelector('#backupPhraseStatus').textContent===window.ALM_DESIGN.t('backupSecretReady')&&!document.querySelector('#backupRecoverySave').disabled")
 with page.expect_download() as dl:page.click('#backupRecoverySave')
 recovery=dl.value;recovery.save_as(str(E/'fixture-recovery.txt'))
 assert 'example-phrase-40' in (E/'fixture-recovery.txt').read_text();(E/'fixture-recovery.txt').unlink();checks.append('Recovery download contains only the explicitly entered test phrase')
 page.evaluate("window.__printCalls=0;window.__printValue='';Object.defineProperty(window.HTMLIFrameElement.prototype,'contentWindow',{get(){return {focus(){},print(){window.__printCalls++;window.__printValue=document.querySelector('.recovery-print-frame').contentDocument.querySelector('pre').textContent;}}},configurable:true})")
 page.click('#backupRecoveryPrint');check('Recovery print uses text content and removes the temporary sheet',"window.__printCalls===1&&window.__printValue.includes('example-phrase-40')&&!document.querySelector('.recovery-print-frame')")
 page.click('#encryptedBackupSave');page.wait_for_timeout(100);check('Saving clears input but leaves a useful secret status',"document.querySelector('#encryptedBackupPassword').value===''&&document.querySelector('#backupPhraseStatus').textContent.trim().length>0&&document.querySelector('#backupRecoverySave').disabled")
 page.set_input_files('#encryptedBackupFile',{'name':'fixture.alm-backup','mimeType':'application/octet-stream','buffer':b'fixture'})
 page.click('#encryptedBackupRestore');check('Restoration prompts independently of the settings passphrase',"document.querySelector('.backup-restore-dialog').open&&document.activeElement.id==='backupRestorePassword'")
 page.locator('.backup-restore-dialog button').first.click();check('Cancelling restore never posts a file or retains its secret',"!window.__restoreCalls&&!document.querySelector('#backupRestorePassword')")
 page.click('#encryptedBackupRestore');page.fill('#backupRestorePassword','example-restore-40');page.locator('.backup-restore-dialog button[type=submit]').click();page.wait_for_timeout(100)
 check('Confirmed restore sends the popup phrase and clears file',"window.__restoreCalls===1&&window.__restorePassword==='example-restore-40'&&!document.querySelector('#backupRestorePassword')&&!document.querySelector('#encryptedBackupFile').value")
 page.click('#settingsTab-appearance');page.uncheck('#notificationEnabled');page.wait_for_timeout(100)
 check('Notification can be disabled later in Settings without returning the initial prompt',"!window.__airing.enabled&&window.__airing.chosen&&getComputedStyle(document.querySelector('#airingPanel')).display==='none'")
 page.evaluate('delete window.animeManager.testNotification');page.click('#notificationTest');page.wait_for_timeout(80);check('Web notification test is recorded in ALM',"document.querySelector('#notificationTestStatus').textContent===window.ALM_DESIGN.t('notificationStored')")
 page.evaluate("()=>{window.animeManager.testNotification=async()=>{window.__nativeTests=(window.__nativeTests||0)+1;window.__notices.items.unshift({id:'native-test',type:'test',title:'Anime Local Manager',createdAt:Date.now(),read:false});window.__notices.unread++;return true;};}");page.click('#notificationTest');page.wait_for_timeout(80)
 check('Native notification test is recorded in ALM too',"document.querySelector('#notificationTestStatus').textContent===window.ALM_DESIGN.t('notificationStored')&&window.__nativeTests===1")
 page.evaluate("()=>{window.__testNative=window.animeManager.testNotification;window.animeManager.testNotification=async()=>{throw Error('Test failure');};}");page.click('#notificationTest');page.wait_for_timeout(80);check('Notification failure is not reported as stored',"document.querySelector('#notificationTestStatus').textContent===window.ALM_DESIGN.t('notificationError')&&!document.querySelector('#notificationTest').disabled");page.evaluate("()=>{window.animeManager.testNotification=window.__testNative;}")

 check('Language settings precede appearance with their own panel',"document.querySelector('#settingsTab-language').nextElementSibling.id==='settingsTab-appearance'&&document.querySelector('#almLanguageSettings').closest('#settingsPanel-language')")
 page.click('#settingsTab-language');check('Language tab is visible alone',"!document.querySelector('#settingsPanel-language').hidden&&document.querySelector('#settingsPanel-appearance').hidden")
 page.evaluate("document.querySelector('#settingsDialog').close()")
 check('Notification bell follows Backup',"document.querySelector('#backupBtn').nextElementSibling.id==='notificationBell'")
 page.click('#notificationBell');page.wait_for_timeout(80)
 check('Bell opens persisted notification tests',"!document.querySelector('#notificationCenter').hidden&&document.querySelectorAll('.notification-entry').length===window.__notices.items.length&&window.__notices.items.length===2")
 page.locator('#notificationCenter').screenshot(path=str(E/'41-notifications.png'))
 page.click('#notificationQuiet');page.wait_for_timeout(80)
 check('Quiet mode changes bell to sleep and retains history',"document.querySelector('#notificationBell').dataset.muted==='true'&&document.querySelector('#notificationQuiet').getAttribute('aria-pressed')==='true'&&document.querySelectorAll('.notification-entry').length===window.__notices.items.length&&window.__notices.items.length===2")
 page.click('#notificationClear');page.wait_for_timeout(80);check('Clearing leaves quiet mode enabled',"document.querySelectorAll('.notification-entry').length===0&&document.querySelector('#notificationBell').dataset.muted==='true'")
 page.keyboard.press('Escape');check('Escape closes notification center and restores bell focus',"document.querySelector('#notificationCenter').hidden&&document.activeElement.id==='notificationBell'")
 page.evaluate("document.getElementById('settingsDialog').close();window.showV2Page('discoveryPage','navDiscovery');window.ALM_DISCOVERY.showDetail({malId:999909,title:'Movie fixture',type:'Movie',episodesTotal:1})");page.wait_for_timeout(80)
 page.select_option('#discoveryAddStatus','Completed');check('Search action follows Completed',"document.querySelector('#discoveryAdd').textContent===window.ALM_DESIGN.t('addCompleted')")
 page.evaluate("window.dispatchEvent(new Event('alm:collection-changed'))");page.wait_for_timeout(80)
 check('Detail re-render retains selected Completed status and action',"document.querySelector('#discoveryAddStatus').value==='Completed'&&document.querySelector('#discoveryAdd').textContent===window.ALM_DESIGN.t('addCompleted')")
 page.click('#discoveryAdd');page.wait_for_timeout(100)
 check('Search Completed adds movie as finished and stays on Search',"document.body.dataset.studioView==='discoveryPage'&&window._almAnimes.some(a=>a.malId===999909&&a.status==='Completed'&&String(a.episodesSeen)==='1')")
 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate("lang=>{window.ALM_I18N.setLanguage(lang);window.dispatchEvent(new Event('alm:language-changed'));}",lang);page.wait_for_timeout(80)
  check('Calendar and update labels translated '+lang,"document.querySelector('#navCalendar span').textContent===window.ALM_DESIGN.t('calendarPage')&&document.querySelector('#almUpdateInstall').textContent===window.ALM_DESIGN.t('updateInstall')&&document.querySelector('#studioFilter').options[0].textContent===window.ALM_DESIGN.t('allStudios')&&document.querySelector('#backupBtn').textContent===window.ALM_DESIGN.t('backupMenu')&&document.querySelector('#notificationTest').textContent===window.ALM_DESIGN.t('notificationTest')&&document.querySelector('#backupRecoverySave').textContent===window.ALM_DESIGN.t('backupRecoverySave')&&document.querySelector('#settingsTab-language').textContent===window.ALM_DESIGN.t('languageInterface')&&document.querySelector('#notificationCenterHeading').textContent===window.ALM_DESIGN.t('notificationCenter')&&document.querySelector('#formatLibraryTitles').textContent===window.ALM_DESIGN.t('formatTitles')")
 page.evaluate("window.ALM_I18N.setLanguage('fr');document.getElementById('navCalendar').click()")
 for width in [480,760,1000,1280]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100)
  check('Calendar avoids horizontal page overflow '+str(width),'document.documentElement.scrollWidth<=innerWidth+1')
  page.evaluate('window.showAboutView()');page.wait_for_timeout(60);check('About avoids horizontal page overflow '+str(width),'document.documentElement.scrollWidth<=innerWidth+1')
  page.evaluate('document.getElementById("navCalendar").click()')

 page.evaluate("window.ALM_I18N.setLanguage('fr');document.querySelector('#studioTools').open=true")
 page.click('#formatLibraryTitles');check('Title tool asks before renaming library entries',"document.querySelector('#appConfirmDialog').open&&document.querySelector('#appConfirmTitle').textContent===window.ALM_DESIGN.t('formatTitles')")
 page.click('#appConfirmOk');page.wait_for_function("window.__requests.includes('/api/bulk/titles')&&!window.__almBulkJobRunning")
 check('Title tool shows actual finished progress',"document.querySelector('#completionProgressPercent').textContent.includes('100')&&document.querySelector('#completionProgressCurrent').textContent.trim().length>0")
 page.evaluate("window.__completionIssues=[{id:1,title:'Collection de test - A',missing:['synopsis','image']}];document.querySelector('#navAudit').click()")
 page.wait_for_function("!document.querySelector('#completionIssuesPanel').hidden")
 check('Missing metadata appears separately in Audit',"document.querySelector('#completionIssuesList').textContent.includes(window.ALM_DESIGN.t('missingSynopsis'))&&document.querySelector('#completionIssuesList').textContent.includes(window.ALM_DESIGN.t('missingImage'))")
 page.click('#completionIssuesList button');check('Missing metadata entry opens its existing edit form',"document.querySelector('#formDialog').open&&document.querySelector('#title').value==='Collection de test - A'")
 page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
 if errors: raise AssertionError('Browser errors: '+json.dumps(errors))
 check('No browser runtime errors','true')
 (E/'beta41-browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'providers':'fixtures','nativeInstallationTested':False},ensure_ascii=False,indent=2))
 print(str(len(checks))+' Beta41 browser checks passed',flush=True)
 page.unroute_all(behavior='wait')
 b.close()
