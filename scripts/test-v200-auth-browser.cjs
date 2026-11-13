'use strict';
// Explicit native-renderer recipe. Run with the pinned Electron executable;
// not part of npm verify because it requires a graphical/headless Electron host.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'alm-mfa-browser-'));
const output=path.join(root,'.release-work/visual-mfa');fs.mkdirSync(output,{recursive:true});
app.disableHardwareAcceleration();app.setPath('userData',profile);
let listener,window,lastFrame;
function fixture(){
 window.fixtureLanguage='fr';
 window.ALM_DESIGN_COPY={};
 window.ALM_DESIGN={language:()=>window.fixtureLanguage,icon:()=>'',escape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
 window.ALM_CAPTCHA={config:async()=>({captchaSiteKey:'fictional-public-key'}),mount:async()=>({token:()=> 'fictional-captcha',reset(){},destroy(){}})};
 const A='20000000-0000-0000-0000-000000000001',primary='20000000-0000-0000-0000-000000000002',backup='20000000-0000-0000-0000-000000000003';
 const state={logged:false,enabled:false,required:false,factors:[],calls:[],setup:null,attempt:'fixture-attempt'};window.fixtureState=state;
 function mfa(){return {available:true,enabled:state.enabled,required:state.required,factors:state.factors,backupReady:state.factors.length>1,attemptId:state.attempt};}
 function own(){return {age:{available:true,recorded:true,adult:true,excludeAdult:true},profile:window.ALM_COMMUNITY_MODEL.profile({id:A,display_name:'Recette ALM',handle:'recette_alm',discriminator:2}),items:[],summary:window.ALM_COMMUNITY_MODEL.summary([]),dna:[],activity:[]};}
 window.ALM_COMMUNITY_API=async(endpoint,_method,body={})=>{
  state.calls.push({endpoint,body});
  if(endpoint==='status')return {configured:true,connected:state.logged&&!state.required,mfaRequired:state.required,mfa:mfa(),user:state.logged?{id:A,email:'fixture@example.invalid'}:null,identity:{id:A,display_name:'Recette ALM',discriminator:2},sync:{auto:false,dirty:false},own:own(),notifications:{count:0,requests:[],recommendations:[]}};
  if(endpoint==='friends')return {userId:A,relationships:[],cards:[],libraryStats:{available:true,libraries:0,animes:0}};
  if(endpoint==='auth'){state.logged=true;state.required=state.enabled;state.attempt='fixture-'+state.calls.length;return {connected:!state.required,mfaRequired:state.required,mfa:mfa(),authAttemptId:state.attempt};}
  if(endpoint==='mfa')return mfa();
  if(endpoint==='mfa/enroll'){state.setup={id:state.factors.length?backup:primary,name:body.name};return {id:state.setup.id,uri:'otpauth://totp/ALM%3AFixture?secret=JBSWY3DPEHPK3PXP&issuer=ALM',secret:'JBSWY3DPEHPK3PXP'};}
  if(endpoint==='mfa/enroll/verify'){if(body.code!=='123456')throw Error('MFA_CODE_INVALID');state.factors.push({id:state.setup.id,name:state.setup.name,type:'totp'});state.setup=null;state.enabled=true;state.required=false;return {ok:true,mfa:mfa()};}
  if(endpoint==='mfa/enroll/cancel'){state.setup=null;return {ok:true};}
  if(endpoint==='mfa/verify'){if(body.code!=='123456'||!state.factors.some(f=>f.id===body.factorId))throw Error('MFA_CODE_INVALID');state.required=false;return {ok:true,mfa:mfa()};}
  if(endpoint==='mfa/cancel'){if(body.attemptId===state.attempt){state.logged=false;state.required=false;}return {ok:true};}
  if(endpoint==='sensitive')return {ok:true};
  if(endpoint==='logout'){state.logged=false;state.required=false;return {ok:true};}
  throw Error('Unknown browser fixture endpoint '+endpoint);
 };
}
const initialScripts=['community-security.js','community-content.js','community-age.js','community-model.js','community-copy.js','community-upgrade-copy.js','community-mfa-copy.js','community-workspace-copy.js','community-charter.js','community-qr.js','community-requests.js','community-workspace.js','community.js','community-ui-extra.js','community-mfa.js'];
const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/community.css"><link rel="stylesheet" href="/community-workspace.css"><link rel="stylesheet" href="/community-mfa.css"><style>body{margin:0;padding:24px;background:#111420;color:#eceaf4;font-family:Arial,sans-serif}button,input,select{font:inherit}main{max-width:1100px;margin:auto}.hidden{display:none}</style><script>('+fixture.toString()+')();</script>'+initialScripts.map(name=>'<script defer src="/'+name+'"></script>').join('')+'</head><body><main><section id="communityPage"></section></main></body></html>';
const js=fn=>window.webContents.executeJavaScript('('+fn.toString()+')()',true);
async function until(fn){const deadline=Date.now()+10000;while(!await js(fn)){if(Date.now()>deadline)throw Error('Browser recipe timed out: '+fn.toString());await new Promise(resolve=>setTimeout(resolve,25));}}
async function screenshot(name){window.webContents.invalidate();await new Promise(resolve=>setTimeout(resolve,150));if(lastFrame&&lastFrame.getSize().width>10)fs.writeFileSync(path.join(output,name),lastFrame.toPNG());}
async function submitPassword(withCode=false){
 await until(()=>document.querySelector('#commDialog form input[name=password]')&&!document.querySelector('#commDialog form [type=submit]').disabled);
 await js(()=>{const f=document.querySelector('#commDialog form');f.elements.password.value='Fictional-test-pass-123!';if(f.elements.code)f.elements.code.value='123456';if(f.elements.name)f.elements.name.value=f.elements.code?'Appareil de secours':'Appareil principal';f.requestSubmit();});
}
async function enroll(){await until(()=>document.querySelector('#commDialog input[name=secret]'));await screenshot('mfa-enrollment.png');await js(()=>{const f=document.querySelector('#commDialog form');f.elements.code.value='123456';f.requestSubmit();});await until(()=>!document.getElementById('commDialog').open);}
async function run(){
 await app.whenReady();assert.equal(process.versions.electron,require('../package.json').devDependencies.electron);
 const server=express();server.get('/',(_req,res)=>res.type('html').send(html));server.use(express.static(path.join(root,'public')));
 listener=server.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));const origin='http://127.0.0.1:'+listener.address().port;
 window=new BrowserWindow({width:1160,height:940,show:true,useContentSize:true,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.on('paint',(_event,_dirty,image)=>{lastFrame=image;});
 const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>callback({cancel:new URL(details.url).origin!==origin}));
 await window.loadURL(origin);window.setContentSize(1160,940);window.webContents.startPainting();await until(()=>!!window.ALM_COMMUNITY?.snapshot()&&innerWidth>=1000);
 await js(async()=>{await window.ALM_COMMUNITY.open();await window.ALM_COMMUNITY.auth('login');});
 assert(await js(()=>!!document.querySelector('#commDialog input[name=enable_mfa]')));
 await screenshot('mfa-login-option.png');
 await js(()=>{const f=document.querySelector('#commDialog form');f.elements.email.value='fixture@example.invalid';f.elements.password.value='Fictional-test-pass-123!';f.elements.enable_mfa.checked=true;f.requestSubmit();});
 await until(()=>!!document.querySelector('#commDialog [data-add-factor]'));
 await js(()=>document.querySelector('[data-add-factor]').click());await submitPassword();await enroll();
 await js(()=>window.ALM_COMMUNITY_MFA.settings());await until(()=>!!document.querySelector('[data-add-factor]'));
 await js(()=>document.querySelector('[data-add-factor]').click());await submitPassword(true);await enroll();
 assert.equal(await js(()=>window.fixtureState.factors.length),2);
 await js(()=>window.ALM_COMMUNITY_WORKSPACE.openAccount());await until(()=>!!document.querySelector('#commAccountSettings .comm-security-card'));
 await screenshot('mfa-account-desktop.png');
 await js(async()=>{document.getElementById('commDialog')?.close();await window.ALM_COMMUNITY.api('logout','POST',{});await window.ALM_COMMUNITY.open();await window.ALM_COMMUNITY.auth('login');});
 await js(()=>{const f=document.querySelector('#commDialog form');f.elements.email.value='fixture@example.invalid';f.elements.password.value='Fictional-test-pass-123!';f.requestSubmit();});
 await until(()=>!!document.querySelector('#commDialog input[name=code]')&&!document.querySelector('#commDialog input[name=password]'));
 await screenshot('mfa-challenge.png');
 await js(()=>{const f=document.querySelector('#commDialog form');f.elements.factorId.value=window.fixtureState.factors[1].id;f.elements.code.value='111111';f.requestSubmit();});
 await until(()=>document.querySelector('#commDialog [role=status]')?.textContent.includes('incorrect'));
 assert.equal(await js(()=>window.ALM_COMMUNITY.snapshot().connected),false);
 await js(()=>{const f=document.querySelector('#commDialog form');f.elements.code.value='123456';f.requestSubmit();});
 await until(()=>window.ALM_COMMUNITY.snapshot()?.connected&&!document.getElementById('commDialog').open);
 assert(await js(()=>window.fixtureState.calls.some(r=>r.endpoint==='mfa/verify'&&r.body.factorId===window.fixtureState.factors[1].id)));
 await js(()=>{void window.ALM_COMMUNITY_MFA.sensitive('revoke');});await submitPassword(true);
 await until(()=>!document.getElementById('commDialog').open);
 assert(await js(()=>window.fixtureState.calls.some(r=>r.endpoint==='sensitive'&&r.body.action==='revoke'&&r.body.code==='123456')));
 window.setSize(390,844);
 await js(()=>window.ALM_COMMUNITY_MFA.settings());await until(()=>!!document.querySelector('[data-add-factor]'));
 assert(await js(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile layout has no horizontal overflow');
 await screenshot('mfa-account-mobile.png');
 for(const language of ['fr','en','es','de','ja','pt-BR','zh-CN']){
  await window.webContents.executeJavaScript('window.fixtureLanguage='+JSON.stringify(language)+';document.documentElement.lang='+JSON.stringify(language)+';window.ALM_COMMUNITY_MFA.settings();');
  await until(()=>document.querySelector('#commDialog h2')?.textContent===window.ALM_COMMUNITY_COPY[window.fixtureLanguage].securityTitle);
 }
 const result={status:'passed',electron:process.versions.electron,node:process.versions.node,chromium:process.versions.chrome,flows:['optional-login-setup','primary-enrollment','backup-enrollment','backup-login','invalid-code-denied','sensitive-reauthentication'],languages:7,mobileWidth:390,noHorizontalOverflow:true};
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
 console.log('ALM_AUTH_BROWSER_OK '+JSON.stringify(result));
}
const timeout=setTimeout(()=>{console.error('ALM_AUTH_BROWSER_TIMEOUT');app.exit(1);},90000);
run().then(async()=>{clearTimeout(timeout);window?.destroy();await new Promise(resolve=>listener.close(resolve));fs.rmSync(profile,{recursive:true,force:true});app.quit();}).catch(async error=>{console.error(error);if(window&&!window.isDestroyed()){console.error(JSON.stringify(await js(()=>({viewport:[innerWidth,innerHeight],status:document.querySelector('#commDialog [role=status]')?.textContent,text:document.querySelector('#commDialog')?.textContent.slice(0,1500),calls:window.fixtureState?.calls.map(r=>r.endpoint)})).catch(()=>({}))));await screenshot('failure.png').catch(()=>{});}clearTimeout(timeout);window?.destroy();if(listener)await new Promise(resolve=>listener.close(resolve));fs.rmSync(profile,{recursive:true,force:true});app.exit(1);});
