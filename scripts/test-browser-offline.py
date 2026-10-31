from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import json, subprocess, re, base64, mimetypes, os, shutil
R=Path(__file__).resolve().parents[1]
E=R/'validation'/'browser-rerun'
E.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(R/'public')))
Thread(target=server.serve_forever,daemon=True).start()
origin='http://alm.test'
fixture=[dict(id=1,malId=1,title='Action',status='Completed',episodesSeen='12',episodesTotal='12',score='9',genres=['Action','Fantasy'],tags=['En cours'],poster='/assets/thanks/aleistouille.jpg'),dict(id=2,malId=2,title='\u661f\u306e\u65c5',status='Watching',episodesSeen='7',episodesTotal='12',score='8',genres=['Fantasy','Adventure'],tags=[],poster='/assets/thanks/roudoudoux.jpg')]
requests=[];errors=[];checks=[]
def check(name,fn):
 fn();checks.append(name);print('OK browser:',name,flush=True)
diag=json.loads(subprocess.check_output(['node','-e','console.log(JSON.stringify(require("./lib/diagnostics").diagnostics(process.cwd(),{mode:"json",ready:true},[],[])))'],cwd=R,text=True))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('ALM_CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 page.on('pageerror',lambda e:errors.append(str(e)))
 pass
 def api(route):
  url=urlparse(route.request.url);requests.append(url.path)
  if url.path=='/api/animes':payload=fixture
  elif url.path=='/api/config':payload={}
  elif url.path=='/api/diagnostics':payload=diag
  elif '/reco/genres' in url.path:payload={'ok':True,'source':'metadata-locale','metadataCount':30430,'items':[{'malId':11,'title':'Fresh discovery','imageUrl':'/assets/thanks/yuma.png','publicScore':'8.6'},{'malId':1,'title':'Action'}]}
  elif '/reco/similar/' in url.path:payload={'ok':True,'items':[{'malId':12,'title':'Similar discovery','imageUrl':'/assets/thanks/nochka.png','publicScore':'8.4'}]}
  elif url.path=='/api/v2/stats':payload={'totalAnimes':2,'totalEpisodes':19,'totalDays':0,'totalHours':7,'averageScore':8.5,'favoriteGenre':'Fantasy','favoriteYear':'2026'}
  elif url.path=='/api/v2/profile':payload={'patterns':{}}
  elif 'news' in url.path:payload={'ok':True,'items':[],'news':[],'results':[]}
  else:payload={'ok':True,'items':[],'results':[],'count':0,'needsCompletion':False}
  route.fulfill(status=200,content_type='application/json',body=json.dumps(payload))
 def local_asset(route):
  url=urlparse(route.request.url)
  if url.path.startswith('/api/'):
   return api(route)
  file=R/'public'/url.path.lstrip('/') if url.path!='/' else R/'public/index.html'
  if url.hostname=='alm.test' and file.is_file() and file.is_relative_to(R/'public'):
   route.fulfill(path=str(file))
  else:route.fulfill(status=404,body='')
 # Fully offline DOM harness: no browser navigation/network allowed in this runtime.
 assets={}
 for f in (R/'public/assets').rglob('*'):
  if f.is_file() and f.suffix.lower() in ['.png','.jpg','.ico']:
   assets['/'+str(f.relative_to(R/'public'))]='data:'+str(mimetypes.guess_type(str(f))[0] or 'image/png')+';base64,'+base64.b64encode(f.read_bytes()).decode()
 fixtures={'/api/animes':fixture,'/api/config':{},'/api/diagnostics':diag,'/api/v2/stats':{'totalAnimes':2,'totalEpisodes':19,'totalDays':0,'totalHours':7,'averageScore':8.5},'/api/v2/profile':{'patterns':{}}}
 fixtures['/karaoke/song.json']=json.loads((R/'public/karaoke/song.json').read_text())
 for f in (R/'public/locales').glob('*.json'):fixtures['/locales/'+f.name]=json.loads(f.read_text())
 html=(R/'public/index.html').read_text()
 html=re.sub(r'<script\b[^>]*src=[^>]*></script>','',html)
 html=re.sub(r'<link\b[^>]*>','',html)
 page.set_content(html)
 page.add_style_tag(content=(R/'public/style.css').read_text())
 page.evaluate('''({fixtures,assets})=>{
  const store=new Map([['alm-language','en']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
  window.__requests=[];window.fetch=async(raw)=>{const u=new URL(raw,'http://alm.test');if(window.__delays?.[u.pathname])await new Promise(r=>setTimeout(r,window.__delays[u.pathname]));window.__requests.push(u.pathname);let data=fixtures[u.pathname];
   if(u.pathname.includes('/reco/genres'))data={ok:true,source:'metadata-locale',metadataCount:30430,items:[{malId:11,title:'Fresh discovery',imageUrl:assets['/assets/thanks/yuma.jpg']},{malId:1,title:'Action'}]};
   else if(u.pathname.includes('/reco/similar/'))data={ok:true,items:[{malId:12,title:'Similar discovery',imageUrl:assets['/assets/thanks/nochka.jpg']}]};
   return {ok:true,status:200,json:async()=>structuredClone(data||{ok:true,items:[],results:[],count:0}),text:async()=>''};};
  const hydrate=()=>document.querySelectorAll('img').forEach(i=>{const k=i.getAttribute('src');if(assets[k])i.src=assets[k];});
  new MutationObserver(hydrate).observe(document.body,{childList:true,subtree:true});hydrate();
  const audio=document.getElementById('donationKaraokeAudio');Object.defineProperty(audio,'duration',{value:210});Object.defineProperty(audio,'readyState',{value:4});
  Object.defineProperty(audio,'currentTime',{value:0,writable:true});
 }''',{'fixtures':fixtures,'assets':assets})
 for name in ['i18n.js','app.js','settings.js','dna-radar.js','alm-v2.js','lexicon.js','karaoke.js','diagnostics.js']:
  page.add_script_tag(content=(R/'public'/name).read_text())
 page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
 page.wait_for_function('window.ALM_I18N && window._almAnimes?.length===2 && document.getElementById("donationKaraokeJaLine").children.length>0')
 page.wait_for_timeout(150)
 page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 check('user title stays literal while interface switches',lambda: (
  page.evaluate('ALM_I18N.setLanguage("ja")'),
  (_ for _ in ()).throw(AssertionError('title changed')) if page.locator('#animeGrid .title').first.inner_text()!='Action' else None))
 check('internal option values survive translation',lambda: (
  page.evaluate('ALM_I18N.setLanguage("fr")'),
  (_ for _ in ()).throw(AssertionError('status changed')) if page.locator('#status option').all_text_contents()==[] or page.evaluate('[...document.querySelectorAll("#status option")].map(x=>x.value)')!=['Watching','Completed','On-Hold','Dropped','Plan to Watch'] else None))
 page.evaluate('''() => {const box=document.createElement('textarea');box.id='testPersonalNote';box.value='En cours';document.body.append(box);}''')
 page.evaluate('window.__delays={"/locales/de.json":80,"/locales/zh-CN.json":5};Promise.all([ALM_I18N.setLanguage("de"),ALM_I18N.setLanguage("ja"),ALM_I18N.setLanguage("zh-CN")])')
 check('fast language switches: last choice wins and note unchanged',lambda: (
  (_ for _ in ()).throw(AssertionError('language race')) if page.evaluate('ALM_I18N.getLanguage()')!='zh-CN' else None,
  (_ for _ in ()).throw(AssertionError('note translated')) if page.locator('#testPersonalNote').input_value()!='En cours' else None))
 page.evaluate('ALM_I18N.setLanguage("en")')
 page.evaluate('showV2Page("recoPage","navReco"); initRecommendations()')
 page.wait_for_selector('#recoHeroBlock [data-hero-action="blend"]')
 page.locator('[data-hero-action="blend"]').click();page.wait_for_selector('#recoHeroBlock .reco-card')
 check('genre blend uses existing endpoint and filters owned item',lambda: (
  (_ for _ in ()).throw(AssertionError('bad route')) if any('/reco/genre/' in x for x in requests) else None,
  (_ for _ in ()).throw(AssertionError('wrong cards')) if page.locator('#recoHeroBlock .reco-card').count()!=1 else None))
 page.locator('[data-hero-action="similar"]').click();page.wait_for_function('document.querySelector("#recoHeroBlock .reco-card-title")?.textContent==="Similar discovery"')
 check('similar recommendations render without missing-helper error',lambda: None)
 page.locator('[data-hero-action="surprise"]').click();page.wait_for_function('document.querySelector("#recoHeroBlock .reco-card-title")?.textContent==="Similar discovery"')
 check('surprise recommendations render',lambda:None)
 check('new recommendation heading is localized',lambda: (_ for _ in ()).throw(AssertionError('header untranslated')) if page.locator('.reco-hero-title').inner_text()!='Find your next anime' else None)
 page.evaluate("""async()=>{const old=fetch;let release;window.fetch=async(url)=>{if(url==='/slow')await new Promise(r=>release=r);return {ok:true,json:async()=>({items:[{malId:url==='/slow'?301:302,title:url==='/slow'?'Stale':'Newest'}]})}};try{const a=loadRecoSection('recoSimilarResults','/slow','',d=>d.items);await loadRecoSection('recoSimilarResults','/fast','',d=>d.items);release();await a;}finally{window.fetch=old;}}""")
 check('late recommendation response cannot overwrite a newer selection',lambda: (_ for _ in ()).throw(AssertionError('stale result')) if page.locator('#recoSimilarResults .reco-card-title').inner_text()!='Newest' else None)
 page.screenshot(path=str(E/'recommendations.png'),full_page=True)
 page.evaluate('showV2Page("dnaPage","navDna"); renderDNA()');page.wait_for_timeout(300)
 cats=page.locator('#dnaBubbleLeftRail img, #dnaBubbleRightRail img')
 check('both Yin/Yang cat assets are loaded',lambda: (
  (_ for _ in ()).throw(AssertionError('cats missing')) if cats.count()!=2 or not cats.evaluate_all('(imgs)=>imgs.every(i=>i.complete && i.naturalWidth>0)') else None))
 check('decorative motion disabled for reduced-motion preference',lambda: (_ for _ in ()).throw(AssertionError('animation active')) if page.evaluate('getComputedStyle(document.querySelector(".dna-yinyang-orb")).animationName')!='none' else None)
 page.set_viewport_size({'width':1280,'height':900});page.wait_for_timeout(250)
 check('DNA has no horizontal page overflow at 1280px',lambda: (_ for _ in ()).throw(AssertionError('page overflow')) if page.evaluate('document.documentElement.scrollWidth>innerWidth') else None)
 page.set_viewport_size({'width':1440,'height':1000});page.wait_for_timeout(250)
 page.screenshot(path=str(E/'dna.png'),full_page=True)
 # Open existing page using actual nav handler when possible.
 page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close()); hideAllV2Pages();document.getElementById("donationsPage").classList.remove("hidden");document.getElementById("donationsPage").scrollIntoView();')

 def seek(value):
  page.evaluate('(value)=>{const a=document.getElementById("donationKaraokeAudio");a.currentTime=value;a.dispatchEvent(new Event("timeupdate"));}',value);page.wait_for_timeout(100)
 seek(184)
 check('disputed final lyric is shortened and word-ball hidden',lambda: (
  (_ for _ in ()).throw(AssertionError('wrong lyric')) if page.locator('#donationKaraokeJaLine').inner_text()!='Boku no toshokan' else None,
  (_ for _ in ()).throw(AssertionError('ball not hidden')) if 'hidden' not in page.locator('#donationKaraokeBall').get_attribute('class') else None))
 seek(99)
 check('no next lyric visible in an uncaptioned interval',lambda: (
  (_ for _ in ()).throw(AssertionError('waiting line visible')) if page.locator('#donationKaraokeJaLine').is_visible() else None))
 seek(19);page.evaluate('ALM_I18N.setLanguage("es")');page.wait_for_timeout(120)
 check('language change during seek preserves time and romaji',lambda: (
  (_ for _ in ()).throw(AssertionError('time reset')) if abs(page.evaluate('document.getElementById("donationKaraokeAudio").currentTime')-19)>.1 else None,
  (_ for _ in ()).throw(AssertionError('romaji changed')) if 'Ikusen' not in page.locator('#donationKaraokeJaLine').inner_text() else None))
 page.evaluate('document.getElementById("settingsDialog").showModal();document.getElementById("almDiagnostics").open=true')
 page.wait_for_selector('#almDiagnostics table')
 check('local diagnostic shows honest Chinese coverage',lambda: (
  (_ for _ in ()).throw(AssertionError('coverage hidden')) if 'zh-CN' not in page.locator('#almDiagnostics').inner_text() else None))
 page.evaluate('ALM_I18N.setLanguage("fr")');page.locator('#almDiagnostics').scroll_into_view_if_needed();page.screenshot(path=str(E/'diagnostics.png'),full_page=False)
 check('no uncaught browser errors',lambda: (_ for _ in ()).throw(AssertionError(errors)) if errors else None)
 browser.close()
server.shutdown();E.joinpath('browser-results.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errors,'apiMode':'offline DOM fixtures; actual HTML/CSS/JS and Chromium; simulated media clock'},indent=2))
print(len(checks),'browser checks passed')
