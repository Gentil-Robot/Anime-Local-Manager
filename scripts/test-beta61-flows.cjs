'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ALM_JSDOM_MODULE||'jsdom');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),tick=()=>new Promise(r=>setTimeout(r,25));
async function dom(html,url='https://animelocalmanager.com/'){const d=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});await new Promise(r=>d.window.document.addEventListener('DOMContentLoaded',r,{once:true}));d.window.HTMLElement.prototype.scrollIntoView=function(){};d.window.fixtureSessionAccess=require('../lib/community-session');d.window.fixtureSecurityModule=require('../community/auth-security');return d;}
(async()=>{
 for(const [suffix,confirmed,expected]of [['/#access_token=fixture&type=signup',true,'activationSuccess'],['/#error=access_denied&error_code=otp_expired',true,'expiredLink'],['/?error_code=otp_expired',true,'expiredLink'],['/confirmation.html',false,'expiredLink'],['/#access_token=fixture&type=recovery',true,'recovery'],['/',true,'none']]){
  const d=await dom('<section id="webLanding"></section><section id="webActivation" hidden></section><section id="webRecovery" hidden></section>','https://animelocalmanager.com'+suffix),w=d.window;
  let userReads=0;w.ALM_COMMUNITY_MODEL={};w.ALM_COMMUNITY_SECURITY={errorCode:()=> 'error'};
  w.ALM_DESIGN={language:()=> 'fr'};w.ALM_COMMUNITY_T=k=>k;w.ALM_COMMUNITY_COPY={en:{activationSuccess:'Account confirmed',expiredLink:'Link expired'}};
  w.fetch=async()=>({ok:true,json:async()=>({url:'https://duzwwoyqproxpytmfzdx.supabase.co',publishableKey:'sb_publishable_fixture'})});
  w.fixtureClient={auth:{onAuthStateChange(callback){if(expected==='recovery')setTimeout(()=>callback('PASSWORD_RECOVERY'),0);},getUser:async()=>{userReads++;return {data:{user:{id:'fixture',email_confirmed_at:confirmed?'2026-10-15':null}}};},getSession:async()=>({data:{session:{access_token:'fixture',user:{id:'fixture'}}}})}};
  w.eval(read('community/web-client.js').replace("import {createClient} from '@supabase/supabase-js';",'const createClient=()=>window.fixtureClient;').replace("import sessionAccess from '../lib/community-session.js';",'const sessionAccess=window.fixtureSessionAccess;').replace("import securityModule from './auth-security.js';",'const securityModule=window.fixtureSecurityModule;').replace("import statsModule from './library-stats.js';",'const statsModule={libraryStats:async()=>({available:true,libraries:0,animes:0})};'));
  w.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();
  const panel=w.document.getElementById('webActivation');
  if(expected==='none')assert(panel.hidden);
  else if(expected==='recovery'){assert(panel.hidden);assert(!w.document.getElementById('webRecovery').hidden);assert(w.document.getElementById('webLanding').hidden);}
  else {assert(!panel.hidden);assert(panel.textContent.startsWith(expected));assert(panel.textContent.includes(expected==='activationSuccess'?'Account confirmed':'Link expired'));}
  if(suffix.includes('error'))assert.equal(userReads,0,'Expired callback must not confirm an unrelated existing session');
  if(suffix.includes('#')||suffix.includes('?'))assert.equal(w.location.hash+w.location.search,'');d.window.close();
 }
 // Build the actual settings navigation and move between panels by mouse and keyboard.
 const d=await dom('<dialog id="settingsDialog"><form id="settingsForm"><div><div class="settings-main"></div><aside class="settings-help"></aside></div><menu><button type="submit">OK</button></menu></form></dialog>'),w=d.window;let renders=0;
 w.ALM_DESIGN={escape:String,t:k=>k,icon:()=>'',applyText(){},language:()=> 'fr'};w.ALM_COMMUNITY_WORKSPACE={renderAccount(){renders++;}};
 w.eval(read('public/settings-navigation.js'));w.ALM_SETTINGS.select('account');assert.equal(w.document.getElementById('settingsPanel-account').hidden,false);assert(w.document.getElementById('settingsPanel-language').hidden);assert.equal(renders,1);
 const tabs=w.document.querySelectorAll('[role=tab]');assert.equal(tabs[0].id,'settingsTab-account');assert.equal(tabs[1].id,'settingsTab-language');tabs[0].focus();tabs[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(w.document.activeElement.id,'settingsTab-language');assert(w.document.getElementById('settingsPanel-account').hidden);w.close();
 // Actual video controls, without network, audio output or an external browser.
 const k=await dom(read('public/index.html'),'http://127.0.0.1:3123/'),v=k.window,media=v.document.getElementById('donationKaraokeClip');let paused=true;
 Object.defineProperty(media,'paused',{get:()=>paused});Object.defineProperty(media,'duration',{get:()=>210});
 media.play=async()=>{paused=false;media.dispatchEvent(new v.Event('play'));};media.pause=()=>{paused=true;media.dispatchEvent(new v.Event('pause'));};
 v.fetch=async()=>({ok:true,json:async()=>JSON.parse(read('public/karaoke/song.json'))});v.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};v.requestAnimationFrame=()=>0;v.ALM_DESIGN={t:k=>k,language:()=> 'fr'};
 v.eval(read('public/karaoke.js'));await tick();const overlay=v.document.querySelector('.alm-playback-overlay');assert(overlay.classList.contains('visible'));assert.equal(overlay.textContent,'▶');
 const stage=v.document.querySelector('.donation-karaoke-stage');stage.dispatchEvent(new v.MouseEvent('click',{bubbles:true,detail:1}));await tick();assert.equal(paused,false);assert.equal(overlay.textContent,'Ⅱ');
 stage.dispatchEvent(new v.MouseEvent('click',{bubbles:true,detail:1}));await tick();assert.equal(paused,true);assert.equal(overlay.textContent,'▶');
 stage.dispatchEvent(new v.MouseEvent('dblclick',{bubbles:true,detail:2}));await tick();assert(v.document.querySelector('.donation-karaoke').classList.contains('karaoke-focus-mode'));v.document.getElementById('karaokeClose').click();await tick();assert(!v.document.querySelector('.donation-karaoke').classList.contains('karaoke-focus-mode'));v.close();
 console.log('OK Beta61 flows: root signup success FR/EN, expired links with existing sessions, URL cleanup, recovery isolation, real account settings navigation, paused/playing overlay, click playback and double-click expansion.');
})().catch(error=>{console.error(error);process.exitCode=1;});
