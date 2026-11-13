'use strict';
// Real Electron renderer + sandboxed preload; OS delivery itself is tested through its adapter.
const {app,BrowserWindow,ipcMain}=require('electron'),{EventEmitter}=require('node:events');
const assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),profile=process.env.ALM_NATIVE_TEST_DIRECTORY||fs.mkdtempSync(path.join(os.tmpdir(),'alm-update-browser-'));
app.disableHardwareAcceleration();app.setPath('userData',profile);
let listener,window;
function fixture(){
 window.fixtureLanguage='fr';window.updateSelections=0;
 window.ALM_DESIGN_COPY=Object.fromEntries(['fr','en','ja','es','de','pt-BR','zh-CN'].map(l=>[l,{}]));
 window.ALM_DESIGN={language:()=>window.fixtureLanguage,icon:()=>'',t:(key,values={})=>(window.ALM_DESIGN_COPY[window.fixtureLanguage]?.[key]||key).replace(/\{(\w+)\}/g,(_,key)=>values[key]??''),applyText(){},storage:{get(){},set(){}}};
 window.ALM_SETTINGS={select:()=>{window.updateSelections++;}};
 addEventListener('DOMContentLoaded',()=>{document.getElementById('settingsBtn').onclick=()=>document.getElementById('settingsDialog').showModal();});
}
const scripts=['update-notification-copy.js','release-copy.js','notification-center.js','release-watch.js'];
const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="/beta41.css"><style>body{background:#121625;color:#eee;font:16px Arial}.notification-center{max-width:calc(100vw - 32px)}dialog{max-width:calc(100vw - 32px)}button{white-space:normal}</style><script>('+fixture.toString()+')();</script>'+scripts.map(name=>'<script defer src="/'+name+'"></script>').join('')+'</head><body><button id="backupBtn">Sauvegarde</button><button id="settingsBtn">Réglages</button><dialog id="settingsDialog"><section id="settingsPanel-appearance"></section><section id="settingsPanel-updates"></section></dialog><section id="animeGrid"></section></body></html>';
const js=fn=>window.webContents.executeJavaScript('('+fn.toString()+')()',true);
async function until(fn){const limit=Date.now()+10000;while(!await js(fn)){if(Date.now()>limit)throw Error('Update browser timeout: '+fn.toString());await new Promise(resolve=>setTimeout(resolve,25));}}
async function run(){
 await app.whenReady();ipcMain.handle('update-state',()=>({supported:true,phase:'idle'}));
 const server=express();server.use(express.json());server.get('/',(_req,res)=>res.type('html').send(html));
 const entry={id:'fixture-update',type:'update',version:'2.2.0',prerelease:true,createdAt:Date.now(),read:false};let unread=1,offline=false;
 server.get('/api/notifications',(_req,res)=>res.json({items:[entry],unread,muted:false}));server.post('/api/notifications/read',(_req,res)=>{unread=0;res.json({items:[entry],unread,muted:false});});
 server.get('/api/airing',(_req,res)=>res.json({enabled:false}));server.post('/api/updates/check',(_req,res)=>res.json(offline?{available:false,error:'ALM_UPDATE_SOURCE'}:{available:true,latest:'v2.2.0',releaseUrl:'https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.2.0'}));
 server.use(express.static(path.join(root,'public')));listener=server.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));const origin='http://127.0.0.1:'+listener.address().port;
 window=new BrowserWindow({width:1000,height:800,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(root,'preload.js')}});
 window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>callback({cancel:new URL(details.url).origin!==origin}));
 await window.loadURL(origin);await until(()=>!!window.ALM_UPDATES&&!!document.querySelector('.notification-update'));
 await js(()=>document.getElementById('notificationBell').click());await until(()=>!document.getElementById('notificationCenter').hidden&&document.getElementById('notificationBell').getAttribute('aria-expanded')==='true');
 for(const language of ['fr','en','ja','es','de','pt-BR','zh-CN']){await window.webContents.executeJavaScript('window.fixtureLanguage='+JSON.stringify(language)+';dispatchEvent(new Event("alm:language-changed"));');assert(await js(()=>document.querySelector('.notification-update').textContent.includes(window.ALM_UPDATE_COPY.text('beta',window.fixtureLanguage))));}
 window.setSize(390,844);assert(await js(()=>document.documentElement.scrollWidth<=innerWidth+1),'Update inbox fits a narrow window');
 await js(()=>document.querySelector('.notification-update').click());await until(()=>document.getElementById('settingsDialog').open&&window.updateSelections===1);
 await js(()=>document.getElementById('settingsDialog').close());let native;class Notification extends EventEmitter{static isSupported(){return true;}constructor(options){super();native=this;this.options=options;}show(){this.emit('show');}}
 const notify=require('../lib/desktop-update-notification').createDesktopUpdateNotification({Notification,language:()=> 'fr',open:()=>window.webContents.send('alm-update-open')});assert.equal(await notify(entry),true);native.emit('click');await until(()=>document.getElementById('settingsDialog').open&&window.updateSelections===2);
 offline=true;await js(()=>document.getElementById('almUpdateCheck').click());await until(()=>document.getElementById('almUpdateStatus').textContent===window.ALM_DESIGN.t('updateError'));assert(await js(()=>document.getElementById('almUpdateDownload').hidden&&document.getElementById('almUpdateNotice').hidden));
 console.log('ALM_UPDATE_BROWSER_OK '+JSON.stringify({status:'passed',electron:process.versions.electron,languages:7,inbox:true,sandboxedPreloadClick:true,narrowWidth:390,networkError:true}));
}
const timeout=setTimeout(()=>app.exit(1),90000);
run().then(async()=>{clearTimeout(timeout);window?.destroy();if(listener)await new Promise(resolve=>listener.close(resolve));app.quit();}).catch(async error=>{console.error(error);clearTimeout(timeout);window?.destroy();if(listener)await new Promise(resolve=>listener.close(resolve));app.exit(1);});
