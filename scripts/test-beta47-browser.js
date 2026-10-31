'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {_electron}=require(process.env.ALM_PLAYWRIGHT_PATH||'playwright');
const song=require('../public/karaoke/song.json'),lines=song.sections.flatMap(section=>section.lines);
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'alm47-ui-'));
const evidence=process.env.ALM_UI_EVIDENCE||path.join(root,'verification/beta47/browser');
fs.mkdirSync(evidence,{recursive:true});let app,page;const errors=[],checks=[];
const checked=(label)=>{checks.push(label);console.log('OK UI:',label);};
const shot=(name)=>page.screenshot({path:path.join(evidence,name+'.png')});
async function seek(time){
 await page.evaluate(async value=>{const media=document.querySelector('#donationKaraokeClip');media.pause();media.currentTime=value;if(media.seeking)await new Promise(resolve=>media.addEventListener('seeked',resolve,{once:true}));media.dispatchEvent(new Event('seeked'));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},time);
}
(async()=>{
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox','--ozone-platform=headless','--disable-gpu',path.join(root,'scripts/test-beta47-electron-profile.js')],cwd:root,env:{...process.env,ALM_UI_PROFILE:profile},timeout:45000});
 page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
 await app.context().route('**/*',route=>/^(http:\/\/127\.0\.0\.1:|data:|file:)/.test(route.request().url())?route.continue():route.abort());
 await page.waitForURL('http://127.0.0.1:*/',{timeout:45000});await page.setViewportSize({width:1672,height:1000});
 await page.waitForFunction(()=>window._almAnimes?.some(a=>a.id===747)&&!!document.querySelector('#appMinimize'));
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()));
 assert.deepEqual(await page.locator('.window-actions button').evaluateAll(nodes=>nodes.map(node=>node.id)),['appMinimize','appExitFullscreen','appQuit']);
 assert(await page.locator('.window-actions button').evaluateAll(nodes=>nodes.every(node=>node.querySelector('svg')&&node.getAttribute('aria-label')&&getComputedStyle(node).webkitAppRegion==='no-drag')));
 checked('three SVG window controls have the standard order, accessible labels and non-drag buttons');await shot('window-controls');
 const before=await page.evaluate(()=>window.animeManager.getDisplayPreferences());
 await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0],original=window.minimize.bind(window);global.__almMinimizeCalls=0;window.minimize=()=>{global.__almMinimizeCalls++;return original();};});
 await page.locator('#appMinimize').click();await page.waitForFunction(()=>!document.querySelector('#appMinimize').disabled);
 assert.equal(await app.evaluate(()=>global.__almMinimizeCalls),1);assert.deepEqual(await page.evaluate(()=>window.animeManager.getDisplayPreferences()),before);
 await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.restore();window.show();});
 checked('minimize invokes the real native method and preserves display preferences');
 const actual=await page.evaluate(()=>window.animeManager.getWindowState()),expected=actual.fullscreen||actual.maximized?'windowed':'maximized';
 await page.locator('#appExitFullscreen').click();await page.waitForFunction(async mode=>!document.querySelector('#appExitFullscreen').disabled&&(await window.animeManager.getDisplayPreferences()).mode===mode,expected);
 checked('maximize/restore follows actual native state through trusted IPC');
 await page.locator('#navCalendar').click();
 await page.waitForFunction(async()=>{const data=await(await fetch('/api/calendar')).json();return !data.running&&data.events.some(event=>event.animeId===747&&event.episode===16);},{},{timeout:60000});
 await page.waitForFunction(()=>!!document.querySelector('.calendar-day[data-date="2026-10-15"] .calendar-event'));
 const state=await page.evaluate(async()=>({calendar:await(await fetch('/api/calendar')).json(),anime:window._almAnimes.find(a=>a.id===747)}));
 const episode=state.calendar.events.find(event=>event.animeId===747&&event.episode===16);
 assert.equal(episode.source,'TVmaze');assert.equal(new Date(episode.airingAt*1000).toISOString(),'2026-10-15T15:26:00.000Z');assert.equal(episode.category,'watching');
 assert.equal(state.anime.episodesSeen,'15');assert.equal(state.anime.notes,'Progression et notes à conserver');
 checked('actual utility process, API and SQLite display episode 16 on October 15 without altering progress 15');
 await page.locator('#calendarGrid').scrollIntoViewIfNeeded();
 assert(await page.locator('.calendar-day').evaluateAll(cells=>cells.every(cell=>cell.querySelector('.calendar-event')?!cell.querySelector('.calendar-companion'):cell.querySelector('.calendar-companion[aria-hidden="true"] img'))));
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.calendar-companion img')).filter(image=>image.getBoundingClientRect().top<innerHeight&&image.getBoundingClientRect().bottom>0).every(image=>image.complete&&image.naturalWidth>0));
 assert.equal(await page.locator('.calendar-companion').evaluateAll(nodes=>new Set(nodes.map(node=>node.dataset.character)).size),8);
 checked('empty calendar cells render eight original vector characters, while occupied cells remain readable');await shot('calendar-companions');
 await page.locator('.calendar-day[data-date="2026-10-15"] .calendar-event').click();await page.waitForFunction(()=>document.querySelector('#calendarPopup').open&&!!document.querySelector('#calendarOpen'));
 assert.equal(await page.locator('#calendarEventInfo a').getAttribute('href'),'https://www.tvmaze.com/episodes/3766557');
 assert((await page.locator('#calendarEventInfo').textContent()).includes('Épisode 16'));checked('calendar popup identifies episode 16 and links to the precise episode source');await shot('calendar-episode16');await page.keyboard.press('Escape');
 await page.setViewportSize({width:700,height:860});await page.locator('#calendarGrid').scrollIntoViewIfNeeded();
 assert(await page.locator('.calendar-companion').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().width===44&&node.getBoundingClientRect().height===52)));
 checked('calendar companions shrink to fit narrower calendar cells');await shot('calendar-narrow');await page.setViewportSize({width:1672,height:1000});
 await page.locator('#navAbout').click();await page.locator('#donationKaraokePlay').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>!document.querySelector('#donationKaraokeLoading')&&document.querySelector('#donationKaraokeClip').readyState>=1);
 let wordCount=0;
 for(const line of lines){
  await seek(line.start+.01);
  const text=await page.evaluate(()=>({ja:document.querySelector('#donationKaraokeOriginalLine').textContent,roman:document.querySelector('#donationKaraokeJaLine').textContent,words:document.querySelectorAll('.karaoke-original-unit').length}));
  assert.equal(text.ja,line.ja,line.id+' Japanese');assert.equal(text.roman,line.romaji,line.id+' romaji');assert.equal(text.words,line.jaUnits.length,line.id+' segmentation');wordCount+=text.words;
 }
 assert.equal(wordCount,270);checked('all 48 lyric lines render their original text with 270 paired Japanese/romaji words');
 const samples=[60.2,102.35,192.5,13.8,72.2,102.1,138,74.9,224,90];
 for(const time of samples){
  await seek(time);
  const result=await page.evaluate(({time,lines})=>{
   const requested=time;time=document.querySelector('#donationKaraokeClip').currentTime;const line=lines.find(row=>time>=row.start&&time<row.end),clock=window.ALM_KARAOKE_CLOCK;
   if(!line)return {noActive:!document.querySelector('.karaoke-original-unit.original-active,.karaoke-romaji-unit.romaji-active')};
   const jp=clock.unitState(line.jaUnits,time),roman=clock.unitState(line.romajiUnits,time);
   const nodes=Array.from(document.querySelectorAll('.karaoke-original-unit'));
   const romanNodes=Array.from(document.querySelectorAll('.karaoke-romaji-unit'));
   const inspect=(items,state)=>items.every((node,index)=>{
    const phase=index<state.pastCount?'past':index===state.index?'active':'future';if(node.dataset.phase!==phase)return false;
    let progress=index<state.pastCount?1:index===state.index?state.progress:0;const positions=node._glyphProgress;
    if(index===state.index&&positions?.length>1){const at=progress*(positions.length-1),low=Math.min(positions.length-2,Math.floor(at));progress=positions[low]+(positions[low+1]-positions[low])*(at-low);}
    return Math.abs(parseFloat(node.style.getPropertyValue('--karaoke-progress'))-progress*100)<.11;
   });
   return {time,requested,line:line.id,ja:jp.index,roman:roman.index,noActive:true,correct:inspect(nodes,jp)&&inspect(romanNodes,roman),metrics:nodes.concat(romanNodes).filter(node=>node.getBoundingClientRect().width>.5).every(node=>node._glyphProgress?.length>1),sameWord:jp.index===roman.index};
  },{time,lines});
  assert(result.noActive&&result.correct!==false&&result.metrics!==false&&result.sameWord!==false,'timing and glyphs at '+time+' '+JSON.stringify(result));if(result.time!==undefined)assert(Math.abs(result.time-time)<.002);
 }
 assert(await page.locator('.karaoke-original-unit').first().evaluate(node=>getComputedStyle(node).webkitTextStrokeWidth==='0px'&&getComputedStyle(node).filter.includes('drop-shadow')));assert(await page.locator('#karaokeMute').evaluate(node=>!!node.querySelector('svg')&&!!node.getAttribute('aria-label')));checked('forward/backward seeks match acoustic curves, real glyph widths and inter-word pauses');
 await seek(60.2);
 const fixedColour=await page.locator('.karaoke-fr-unit').first().evaluate(node=>getComputedStyle(node).color);
 for(const lang of ['fr','en','ja','es','de','pt-BR','zh-CN']){
  await page.evaluate(async language=>{await window.ALM_I18N.setLanguage(language,{persistChoice:false});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},lang);
  const result=await page.evaluate(()=>({language:document.querySelector('#donationKaraokeFrLine').lang,colour:getComputedStyle(document.querySelector('.karaoke-fr-unit')).color,text:document.querySelector('#donationKaraokeFrLine').textContent,labels:Array.from(document.querySelectorAll('.window-actions button')).every(button=>button.getAttribute('aria-label'))}));
  assert.equal(result.language,lang);assert.equal(result.colour,fixedColour);assert(result.text&&result.labels);
 }
 await page.evaluate(()=>window.ALM_I18N.setLanguage('fr',{persistChoice:false}));checked('all seven languages retain translated lyrics, fixed translation colour and window labels');
 await seek(60.05);await page.locator('#donationKaraokePlay').click();
 await page.waitForFunction(()=>!document.querySelector('#donationKaraokeClip').paused&&document.querySelector('#donationKaraokeClip').currentTime>60.4);
 await page.locator('#donationKaraokePlay').click();
 const pausedTime=await page.locator('#donationKaraokeClip').evaluate(media=>media.currentTime);
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,180)));
 assert.equal(await page.locator('#donationKaraokeClip').evaluate(media=>media.currentTime),pausedTime);
 checked('actual video playback advances the lyrics, and pause freezes the media clock');
 await seek(100.5);await page.locator('.donation-karaoke').scrollIntoViewIfNeeded();await shot('karaoke-normal');
 await page.locator('#donationKaraokeMode').click();assert(await page.locator('.donation-karaoke').evaluate(node=>node.classList.contains('karaoke-focus-mode')));
 await seek(192.5);await shot('karaoke-focus');await page.setViewportSize({width:700,height:860});
 assert(await page.locator('.karaoke-playback').evaluate(node=>{const rect=node.getBoundingClientRect();return rect.width>100&&rect.right<=innerWidth&&rect.left>=0;}));await shot('karaoke-narrow');
 checked('normal and focus layouts preserve visible adjacent playback/volume controls at smaller sizes');
 assert.deepEqual(errors,[]);fs.rmSync(path.join(evidence,'failed.png'),{force:true});
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({checks,scriptErrors:errors,lyricLines:48,pairedWords:270,transport:'captured public TVmaze responses replayed through actual utility process/SQLite',limitations:['Native Linux headless window surface; no native Windows desktop.','Phonetic timings remain approximate for sung syllables.']},null,2));
 console.log(checks.length+' actual Electron Beta47 UI checks passed.');
})().catch(async error=>{console.error(error);if(page)await shot('failed').catch(()=>{});process.exitCode=1;}).finally(async()=>{if(app)await app.close().catch(()=>{});fs.rmSync(profile,{recursive:true,force:true});});
