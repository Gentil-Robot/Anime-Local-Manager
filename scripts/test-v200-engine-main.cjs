'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-engine-main-'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const app=new EventEmitter(),handlers={},engines=[],windows=[],dialogs=[],order=[];
 Object.assign(app,{getVersion:()=>require('../package.json').version,isPackaged:false,commandLine:{appendSwitch(){}},getPath:()=>directory,getLocale:()=> 'fr',requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit(){},setPath(){},exit(){}});
 class Window extends EventEmitter {
  constructor(){super();this.urls=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{focus(){},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}},setWindowOpenHandler(){},setZoomFactor(){},send(){}});windows.push(this);}
  loadFile(){return Promise.resolve();}loadURL(url){this.urls.push(url);return Promise.resolve();}isDestroyed(){return false;}isMinimized(){return false;}isMaximized(){return false;}
  isFullScreen(){return false;}setFullScreen(){}setBounds(){}unmaximize(){}maximize(){}show(){}focus(){}getBounds(){return {x:0,y:0,width:1000,height:700};}getNormalBounds(){return this.getBounds();}
 }Window.getAllWindows=()=>windows;
 function createEngine(){
  const index=engines.length,listeners=new Set();let stopped=false;
  const engine={PORT:3123,remote:true,notifications:0,backups:0,maintenance:0,
   async startServer(){order.push('start '+index);return {almPort:index?4321:3123};},
   onExit(fn){listeners.add(fn);return()=>listeners.delete(fn);},hasExited:()=>stopped,
   diagnostics:()=>({detail:'Fictional local engine failure'}),
   async terminate(){order.push('terminate '+index);stopped=true;},async settleCallbacks(){order.push('settle '+index);},
   async ping(){return {ok:true};},
   async startReleaseNotifications(){engine.notifications++;},async configureBackupSecrets(){engine.backups++;},
   async configureMaintenanceUpdate(){engine.maintenance++;},async maintenanceState(){return {settings:{enabled:false,channel:'stable'}};},
   async testNotification(){return index;},async checkUpdates(){return {};},async shutdown(){order.push('shutdown '+index);},
   kill(){stopped=true;for(const fn of listeners)fn({expected:true,code:0});},
   fail(){stopped=true;for(const fn of listeners)fn({expected:false,code:1,error:'Fictional failure'});}
  };engines.push(engine);return engine;
 }
 const screen={getAllDisplays:()=>[],getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080},scaleFactor:1}),getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080},scaleFactor:1})};
 const sandbox={
  require:name=>name==='electron'?{app,BrowserWindow:Window,Notification:{},utilityProcess:{},safeStorage:{},
   ipcMain:{removeHandler(){},handle(name,fn){handlers[name]=fn;}},
   dialog:{showErrorBox(_title,message){assert.fail(message);},async showMessageBox(...args){const options=args.at(-1);dialogs.push(options);return {response:options.buttons.indexOf('Redémarrer le moteur')};}},shell:{},screen}:
   name==='./lib/server-process'?{createServerProcess:createEngine}:
   name==='./lib/system-secrets'?{configKey:async()=>null,backupStore:async()=>({load:async()=>null,save:async()=>{}})}:
   name==='./lib/local-security'?{validIpcSender:(event,_window,origin)=>event.origin===origin}:
   name.startsWith('./')?require(path.join(root,name)):require(name),
  __dirname:root,process:{platform:'linux',env:{},argv:[]},URL,console,setTimeout,clearTimeout
 };
 try{
  vm.runInNewContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),sandbox,{filename:'main.js'});
  await pause(100);assert.equal(engines.length,1);assert.equal(windows[0].urls.at(-1),'http://127.0.0.1:3123');
  engines[0].fail();await pause(100);
  assert.equal(dialogs.length,1,'The native dialog is shown after an idle crash');
  assert.equal(engines.length,2);assert.equal(windows[0].urls.at(-1),'http://127.0.0.1:4321');
  assert(order.indexOf('terminate 0')<order.indexOf('start 1'));
  for(const engine of engines){assert.equal(engine.notifications,1);assert.equal(engine.backups,1);assert.equal(engine.maintenance,1);}
  await assert.rejects(handlers['test-notification']({origin:'http://127.0.0.1:3123'}),/Untrusted IPC/);
  assert.equal(await handlers['test-notification']({origin:'http://127.0.0.1:4321'}),1,'IPC uses the replacement engine and updated origin');
  app.emit('before-quit',{preventDefault(){}});await pause(30);engines[1].fail();await pause(20);
  assert.equal(dialogs.length,1,'Normal application shutdown never opens the recovery dialog');
  console.log('OK V2 desktop recovery: real main/supervisor integration, idle native alert, new port, backup/notification/maintenance reattachment, updated IPC origin and quiet shutdown.');
 }finally{vm.runInNewContext('engineSupervisor?.dispose();engineSupervisor=null;',sandbox);fs.rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
