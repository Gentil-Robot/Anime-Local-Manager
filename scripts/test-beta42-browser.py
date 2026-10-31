"""Actual application in Chromium and actual isolated SQLite/HTTP APIs. See validation for launch command."""
import json,os,time,subprocess,atexit,tempfile,shutil,re
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
E=Path(os.environ.get('ALM_UI_EVIDENCE',str(R/'verification/beta42/browser')));E.mkdir(parents=True,exist_ok=True)
base=os.environ.get('ALM_TEST_ORIGIN');checks=[];errors=[]
if not base:
 profile=tempfile.mkdtemp(prefix='alm42-ui-');env={**os.environ,'ALM_UI_PROFILE':profile}
 server=subprocess.Popen(['node',str(R/'scripts/test-beta42-browser-server.js')],env=env,stdout=subprocess.PIPE,text=True)
 def cleanup():
  server.terminate()
  try:server.wait(timeout=10)
  except subprocess.TimeoutExpired:server.kill()
  shutil.rmtree(profile,ignore_errors=True)
 atexit.register(cleanup)
 while True:
  line=server.stdout.readline()
  if line.startswith('Browser server ready'):base='http://127.0.0.1:'+line.split()[-1];break
  if not line:raise RuntimeError('Browser test server failed')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('ALM_CHROMIUM'),headless=True,args=['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1672,'height':1000},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base) or route.request.url.startswith('data:') else route.abort())
 media_fixture=os.environ.get('ALM_MEDIA_FIXTURE')
 if media_fixture:
  video=Path(media_fixture).read_bytes()
  def serve_video(route):
   import re
   match=re.match(r'bytes=(\d+)-(\d*)',route.request.headers.get('range',''))
   if match:
    start=int(match.group(1));end=min(len(video)-1,int(match.group(2)) if match.group(2) else len(video)-1)
    route.fulfill(status=206,body=video[start:end+1],headers={'Content-Type':'video/webm','Content-Range':f'bytes {start}-{end}/{len(video)}','Accept-Ranges':'bytes'})
   else:route.fulfill(body=video,headers={'Content-Type':'video/webm','Accept-Ranges':'bytes'})
  page.route('**/assets/alm-clip-complet-1080p.mp4',serve_video)

 def wait(expression,**kwargs):return page.wait_for_function(expression if re.match(r'^\(?[\w\s,]*\)?\s*=>',expression) else '()=>('+expression+')',**kwargs)
 page.add_init_script("localStorage.setItem('alm-language','fr')")
 page.goto(base);wait('window._almAnimes?.length===6');page.wait_for_timeout(700)
 page.evaluate('document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 def check(label,expression):
  value=page.evaluate(expression)
  if not value:
   page.screenshot(path=str(E/'failed.png'))
   print(page.evaluate("(()=>{const d=document.querySelector('#animePeekDialog');return {open:d.open,rect:d.getBoundingClientRect().toJSON(),innerWidth,innerHeight,ids:[...d.querySelectorAll('[id]')].map(n=>n.id),text:d.textContent.slice(0,400),body:document.body.className}})()"),flush=True)
  assert value,(label,value,errors)
  checks.append(label);print('OK',label,flush=True)
 def shot(name):page.screenshot(path=str(E/(name+'.png')))
 check('startup has no JavaScript errors','true' if not errors else 'false')
 page.locator('#animeGrid .card[data-anime-id="1"] .poster').click();wait("document.querySelector('#peekSynopsis')");page.wait_for_timeout(500)
 check('library opens one centred bounded detail dialog',"(()=>{const d=document.querySelector('#animePeekDialog'),r=d.getBoundingClientRect();return d.open&&Math.abs(r.x+r.width/2-innerWidth/2)<2&&r.height<innerHeight&&!!document.querySelector('#peekSynopsis')})()")
 check('library detail retains personal notes and MAL identity',"document.querySelector('#animePeekPersonal').textContent.includes('My personal note')&&document.querySelector('#animePeekDetail a').href.includes('myanimelist.net/anime/199')")
 shot('library-detail')
 before=page.locator('#animePeekTitle').inner_text();page.locator('#animePeekNext').click();assert page.locator('#animePeekTitle').inner_text()!=before;page.keyboard.press('ArrowLeft');assert page.locator('#animePeekTitle').inner_text()==before
 page.keyboard.press('Escape');check('previous/next/Escape preserve the library context',"!document.querySelector('#animePeekDialog').open&&!document.querySelector('#animeGrid').classList.contains('hidden')")
 page.locator('.nav-item[data-filter="Watching"]').click();page.wait_for_timeout(100)
 page.locator('.episode-stepper button').last.click();wait("document.querySelector('.episode-stepper>span')?.textContent.startsWith('4 / 4')")
 check('final episode remains Watching and offers completion',"window._almAnimes.find(a=>a.id===2).status==='Watching'&&!!document.querySelector('.episode-finish')")
 page.locator('#catalogUndo .primary').click();wait("window._almAnimes.find(a=>a.id===2).episodesSeen==='3'")
 check('episode Undo restores saved progression','true')
 page.locator('#catalogUndo button').last.click()
 page.locator('#navDiscovery').click();wait("document.querySelectorAll('.catalog-card').length===48")
 check('catalogue renders exactly 48 bounded lazy covers',"document.querySelectorAll('.catalog-card').length===48&&[...document.querySelectorAll('.catalog-cover img')].every(i=>i.loading==='lazy')")
 shot('catalogue')
 page.locator('#catalogNext').click();wait("document.querySelector('#catalogPageNumber').textContent.startsWith('2 /')")
 check('pagination replaces cards rather than accumulating DOM',"document.querySelectorAll('.catalog-card').length===48")
 page.evaluate("document.querySelector('#catalogFilter-decade').value='2000';document.querySelector('#catalogFilter-decade').dispatchEvent(new Event('change',{bubbles:true}))")
 wait("document.querySelector('#catalogPageNumber').textContent.startsWith('1 /')&&document.querySelector('#discoveryForm').getAttribute('aria-busy')==='false'")
 check('decade filter queries genuine years',"[...document.querySelectorAll('.catalog-card-copy small')].every(n=>n.textContent.match(/200[0-9]/))")
 page.locator('.catalog-cover').first.click();page.wait_for_timeout(200);check('gallery detail uses the shared popup with status choices',"document.querySelector('#animePeekDialog').open&&!!document.querySelector('#peekAddStatus')")
 shot('catalogue-detail');page.keyboard.press('Escape')
 page.locator('.catalog-select input').first.check();page.locator('.catalog-select input').nth(1).check();check('bulk bar follows deliberate checkbox selection',"!document.querySelector('#catalogBatch').hidden&&document.querySelector('#catalogSelectionCount').textContent.includes('2')")
 page.locator('#catalogBatchAdd').click();wait("window._almAnimes.length===8");check('bulk addition keeps Recherche open',"!document.querySelector('#discoveryPage').classList.contains('hidden')")
 page.locator('#catalogUndo .primary').click();wait('window._almAnimes.length===6');page.locator('#catalogUndo button').last.click()
 check('bulk Undo removes only those two additions','true')
 page.evaluate("document.querySelector('#catalogFilter-decade').value='';document.querySelector('#catalogFilter-decade').dispatchEvent(new Event('change',{bubbles:true}))")
 wait("document.querySelector('#discoveryForm').getAttribute('aria-busy')==='false'")
 for n in range(2,9):
  page.locator('#catalogNext').click();wait('(n)=>document.querySelector("#catalogPageNumber").textContent.startsWith(n+" /")&&document.querySelector("#discoveryForm").getAttribute("aria-busy")=="false"',arg=n)
  assert page.locator('.catalog-card').count()==48
 check('384 browsed records retain only the current 48 cards',"document.querySelectorAll('.catalog-card').length===48")
 page.evaluate("document.querySelector('#discoveryQuery').value='Naruto';window.ALM_CATALOG.refresh();document.querySelector('#discoveryQuery').value='Chihiro';window.ALM_CATALOG.refresh()")
 wait("document.querySelector('#discoveryForm').getAttribute('aria-busy')==='false'")
 check('new query replaces obsolete results',"[...document.querySelectorAll('.catalog-title')].every(n=>n.textContent.includes('Chihiro'))")

 page.locator('#navSettings').click();wait("document.querySelector('#settingsDialog').open")
 check('Restoration follows Backup and owns both file selectors',"document.querySelector('#settingsTab-backup').nextElementSibling.id==='settingsTab-restoration'&&document.querySelector('#settingsPanel-restoration #restoreBackupFile')&&document.querySelector('#settingsPanel-restoration #encryptedBackupFile')&&!document.querySelector('#settingsPanel-backup #restoreBackupFile')")
 page.locator('#settingsTab-appearance').click();check('display preferences distinguish window modes and sizes',"document.querySelector('#displayMode').options.length===3&&document.querySelector('#displayResolution').options.length===4&&document.querySelector('#displaySize').options.length===2")
 shot('settings-display')
 page.evaluate("document.querySelector('#displaySize').value='large'");page.locator('#displayApply').click();page.wait_for_timeout(150)
 check('large interface can be applied and reversed',"document.documentElement.style.zoom==='1.15'")
 page.evaluate("document.querySelector('#displaySize').value='normal'");page.locator('#displayApply').click()

 for key in ['backup','connections','restoration']:
  page.locator('#settingsTab-'+key).click();page.wait_for_timeout(150);check(key+' owns progress arrows',"!document.querySelector('#settingsScrollControls').hidden")
 page.locator('#settingsTab-restoration').click();backup={'app':'Anime Local Manager','createdAt':'2026-01-01T10:00:00Z','data':{'animes':[{'id':88,'title':'Do not restore without approval','status':'Completed','notes':'Keep cancel safe'}]}}
 page.locator('#restoreBackupFile').set_input_files({'name':'fixture.json','mimeType':'application/json','buffer':json.dumps(backup).encode()});page.locator('#restoreBackup').click();wait("document.querySelector('#restorePreviewDialog').open")
 check('restore preview describes counts before replacement',"document.querySelector('#restorePreviewContents').textContent.includes('1 anim')&&window._almAnimes.length===6")
 page.locator('#restorePreviewCancel').click();check('cancel preserves current library','window._almAnimes.length===6')
 page.evaluate('document.querySelector("#settingsDialog").close()');page.locator('#navAbout').click();page.wait_for_timeout(300)
 check('GIF immediately follows wallpapers and precedes partner contact',"document.querySelector('.about-media-aside').children[0].classList.contains('alm-wallpapers')&&document.querySelector('.about-media-aside').children[1].classList.contains('alm-retro-banner')&&document.querySelector('.about-media-aside').children[2].classList.contains('alm-partner-banner')")
 shot('about')
 page.locator('.alm-partner-banner').scroll_into_view_if_needed();shot('about-wallpapers-partner')
 if media_fixture:
  page.locator('#donationKaraokeClip').scroll_into_view_if_needed();page.evaluate('document.querySelector("#donationKaraokeClip").load()');wait('document.querySelector("#donationKaraokeClip").readyState>=2')
  for point in [0,18,96,178,207,225.1]:
   page.evaluate('(point)=>{const v=document.querySelector("#donationKaraokeClip");v.pause();v.currentTime=point}',point);page.wait_for_timeout(250)
   check('karaoke '+str(point)+'s keeps a fixed translation and shared progress',"getComputedStyle(document.querySelector('.karaoke-fr-unit')).color==='rgb(86, 36, 99)'&&getComputedStyle(document.querySelector('.karaoke-romaji-unit')).backgroundImage.includes('142, 77, 158')")
  page.evaluate('document.querySelector("#donationKaraokeClip").currentTime=18');page.wait_for_timeout(250);shot('karaoke-prune')
  before_progress=page.evaluate('document.querySelector(".karaoke-romaji-unit").style.getPropertyValue("--karaoke-progress")');page.evaluate('document.querySelector("#donationKaraokeClip").play()');page.wait_for_timeout(350);page.evaluate('document.querySelector("#donationKaraokeClip").pause()')
  check('karaoke pause and resume updates the actual media clock','document.querySelector("#donationKaraokeClip").currentTime>18.1')


 for lang in ['fr','en','ja','es','de','pt-BR','zh-CN']:
  page.evaluate('(lang)=>window.ALM_I18N.setLanguage(lang)',lang);page.wait_for_timeout(100)
  check(lang+' has translated new UI',"document.querySelector('#settingsTab-restoration').textContent.trim()===window.ALM_DESIGN.t('restoration')&&document.querySelector('.alm-partner-banner h3').textContent===window.ALM_DESIGN.t('partnerTitle')")
 page.set_viewport_size({'width':800,'height':600});page.locator('#navDiscovery').evaluate('(n)=>n.click()');page.wait_for_timeout(250);check('small viewport avoids horizontal overflow','document.documentElement.scrollWidth<=innerWidth+1');shot('catalogue-small')
 page.evaluate("window.showV2Page(null,null);document.querySelector('#search').value='NoMatchingFixture123';window.render()");page.wait_for_timeout(150)
 check('short-page footer reaches the available viewport bottom',"document.querySelector('.site-footer').getBoundingClientRect().bottom>=innerHeight-1")
 assert not errors,errors
 (E/'beta42-browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2));b.close()
 print(str(len(checks))+' actual-browser checks passed.',flush=True)
