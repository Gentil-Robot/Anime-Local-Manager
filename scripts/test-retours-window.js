'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-window-retours-')),pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const app=new EventEmitter(),handlers={},windows=[];Object.assign(app,{getVersion:()=>require('../package.json').version,isPackaged:false,commandLine:{appendSwitch(){}},getPath:()=>dir,getLocale:()=> 'fr-FR',requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit(){},setPath(){}});
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.calls=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{focus(){this.focused=true;},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}},setWindowOpenHandler(){},setZoomFactor(value){this.zoom=value;},send(){}});windows.push(this);}
  loadFile(){return Promise.resolve();}loadURL(){return Promise.resolve();}isDestroyed(){return false;}isMinimized(){return !!this.minimized;}isMaximized(){return !!this.maximized;}minimize(){this.minimized=true;this.emit('minimize');}restore(){this.minimized=false;this.emit('restore');}show(){}focus(){}getBounds(){return {x:0,y:0,width:1920,height:1080};}getNormalBounds(){return this.getBounds();}
  isFullScreen(){return !!this.fullScreen;}setFullScreen(value){if(value){this.fullScreen=true;return;}setTimeout(()=>{this.fullScreen=false;this.emit('leave-full-screen');},20);}
  unmaximize(){this.calls.push('unmaximize');this.maximized=false;this.emit('unmaximize');}setBounds(value){assert(!this.fullScreen,'bounds must wait for leave-full-screen');this.calls.push('bounds');this.bounds=value;}maximize(){this.maximized=true;this.emit('maximize');}close(){}
 }Window.getAllWindows=()=>windows;
 const screen={getAllDisplays:()=>[],getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080},scaleFactor:1}),getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080},scaleFactor:1})};
 const server={PORT:3123,configureMaintenanceUpdate:async()=>{},maintenanceState:async()=>({settings:{enabled:false,channel:'stable'}}),stopMaintenance:async()=>{},closeCommunity:async()=>{},prepareUpdateBackup:async()=>({ok:true}),startServer:async()=>({almPort:4321}),startReleaseNotifications(){}};
 const sandbox={require:name=>name==='electron'?{app,BrowserWindow:Window,Notification:{},ipcMain:{removeHandler(){},handle(channel,fn){handlers[channel]=fn;}},dialog:{showErrorBox(){assert.fail('launch failed');}},shell:{},screen}:name==='./server'?server:name==='./lib/local-security'?{validIpcSender:event=>event?.trusted===true}:name.startsWith('./')?require(path.join(root,name)):require(name),__dirname:root,process:{platform:'linux',env:{}},URL,console,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),sandbox);await pause(80);const win=windows[0];assert(win.fullScreen);win.calls=[];
 const exit=handlers['window-exit-fullscreen']({trusted:true});assert(exit instanceof Promise||typeof exit.then==='function');assert(win.fullScreen);assert.equal(win.calls.length,0);
 const preference=await exit;assert.equal(preference.mode,'windowed');assert(!win.fullScreen);assert.equal(win.maximized,false);assert(win.bounds.width<1920&&win.bounds.height<1080);assert.equal(handlers['display-get']({trusted:true}).mode,'windowed');
 console.log('OK window: resize waits for native fullscreen exit, restores a smaller unmaximized window and persists windowed mode');
 assert.throws(()=>handlers['window-exit-fullscreen']({trusted:false}),/Untrusted IPC/);
 win.webContents.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'F11'});assert(win.fullScreen);win.webContents.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'F11'});await pause(40);assert(!win.fullScreen);assert.equal(handlers['display-get']({trusted:true}).mode,'windowed');
 console.log('OK window: trusted IPC and F11 follow the same return-to-window behavior');
 await handlers['display-set']({trusted:true},{mode:'fullscreen'});const leaving=handlers['window-exit-fullscreen']({trusted:true});const latest=handlers['display-set']({trusted:true},{mode:'fullscreen'});await Promise.all([leaving,latest]);assert(win.fullScreen);assert.equal(handlers['display-get']({trusted:true}).mode,'fullscreen');console.log('OK window: a rapid new preference wins without racing native exit or leaving a mismatched saved mode');
 for(const channel of ['window-state','window-minimize','window-toggle-maximize']){let rejected=false;try{await handlers[channel]({trusted:false});}catch(error){assert.match(error.message,/Untrusted IPC/);rejected=true;}assert(rejected,channel);}
 const minimized=handlers['window-minimize']({trusted:true});assert(minimized.minimized);assert.equal(handlers['display-get']({trusted:true}).mode,'fullscreen');win.restore();assert(!handlers['window-state']({trusted:true}).minimized);
 const restored=await handlers['window-toggle-maximize']({trusted:true});assert(!restored.fullscreen&&!restored.maximized);assert.equal(handlers['display-get']({trusted:true}).mode,'windowed');
 const maximized=await handlers['window-toggle-maximize']({trusted:true});assert(maximized.maximized&&!maximized.fullscreen);assert.equal(handlers['display-get']({trusted:true}).mode,'maximized');
 const normal=await handlers['window-toggle-maximize']({trusted:true});assert(!normal.maximized&&!normal.fullscreen);assert.equal(handlers['display-get']({trusted:true}).mode,'windowed');
 console.log('OK window: standard minimize, maximize and restore preserve display preferences and reject foreign IPC');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));

