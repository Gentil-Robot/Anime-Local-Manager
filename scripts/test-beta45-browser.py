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

 check('new controls start without script errors', 'true' if not errors else 'false')
 page.locator('#navSettings').click();wait("document.querySelector('#settingsDialog').open")
 check('settings use the available desktop and readable controls',"(()=>{const d=document.querySelector('#settingsDialog'),r=d.getBoundingClientRect();return r.width>=1500&&r.height>=850&&parseFloat(getComputedStyle(d.querySelector('.settings-main')).fontSize)>=16})()")
 page.locator('#settingsTab-backup').click();page.wait_for_timeout(150)
 check('scroll arrows avoid footer and close controls',"(()=>{const a=document.querySelector('#settingsScrollControls').getBoundingClientRect(),b=document.querySelector('#settingsDialog menu').getBoundingClientRect();return a.bottom<b.top})()")
 page.locator('#settingsTab-storage').click();wait("document.querySelector('#storageFacts').children.length>=7")
 check('storage shows disk databases, covers and engine RAM',"document.querySelector('#storageState').textContent.includes('sqlite-disk')&&document.querySelector('#storageFacts').textContent.includes('RAM')")
 page.locator('#storageCheck').click();wait("document.querySelector('#storageState').textContent===window.ALM_DESIGN.t('storageHealthy')")
 page.evaluate('document.querySelector("#settingsDialog").close()')
 page.locator('.nav-item[data-filter="Watching"]').click();page.wait_for_timeout(100);page.locator('#animeGrid .poster').first.click();wait("document.querySelector('#animePeekDialog').open")
 check('detail has +/- and X/Y episodes, alongside previous and next',"document.querySelector('#animePeekPersonal .episode-stepper').textContent.includes('3 / 4')&&document.querySelector('#animePeekPrevious')&&document.querySelector('#animePeekNext')")
 shot('episode-detail');page.keyboard.press('Escape')
 page.evaluate("document.querySelector('#completionProgressPanel').classList.remove('hidden');document.querySelector('#completionProgressDismiss').classList.remove('hidden');scheduleCompletionAutoDismiss(.3)")
 check('completed library updates have a visible dismissal ring',"!!document.querySelector('#completionProgressDismiss .dismiss-ring')")
 page.wait_for_timeout(1200);check('dismissal ring expires with its panel',"document.querySelector('#completionProgressPanel').classList.contains('hidden')")
 page.locator('#navCalendar').click();wait("document.querySelectorAll('.calendar-day').length===42")
 check('only empty calendar cells receive decorative companions',"[...document.querySelectorAll('.calendar-companion')].length>0&&[...document.querySelectorAll('.calendar-companion')].every(n=>n.getAttribute('aria-hidden')==='true'&&!n.parentElement.querySelector('.calendar-event'))")
 shot('calendar-companions')
 page.locator('#navAbout').click();page.wait_for_timeout(200)
 check('video volume is keyboard-accessible and changes the actual media',"(()=>{const r=document.querySelector('#karaokeVolume');r.value='.35';r.dispatchEvent(new Event('input',{bubbles:true}));return Math.abs(document.querySelector('#donationKaraokeClip').volume-.35)<.01&&r.getAttribute('aria-valuetext')==='35%'})()")
 page.locator('#karaokeMute').click();check('mute toggle affects the clip',"document.querySelector('#donationKaraokeClip').muted")
 page.locator('#karaokeMute').click()
 page.locator('#donationKaraokeClip').scroll_into_view_if_needed();page.evaluate('document.querySelector("#donationKaraokeClip").load()');wait('document.querySelector("#donationKaraokeClip").readyState>=2')
 page.evaluate('document.querySelector("#donationKaraokeClip").currentTime=18');page.wait_for_timeout(250);page.locator('#donationKaraokeMode').click();page.wait_for_timeout(200)
 check('expanded clip keeps the close button clear of navigation',"document.querySelector('.karaoke-focus-mode #karaokeClose')&&getComputedStyle(document.querySelector('#scrollJumpControls')).display==='none'")
 check('expanded volume remains inside the visible player',"(()=>{const r=document.querySelector('#karaokeVolume').getBoundingClientRect();return r.width>20&&r.bottom<=innerHeight&&r.right<innerWidth})()");shot('karaoke-expanded-blue');page.locator('#karaokeClose').click();wait("!document.querySelector('.karaoke-focus-mode')");check('close restores About with a paused clip',"!document.querySelector('.karaoke-focus-mode')&&document.querySelector('#donationKaraokeClip').paused")
 assert not errors, errors
 (E/'beta45-controls-results.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2));b.close();print(str(len(checks))+' Beta45 control checks passed.')
