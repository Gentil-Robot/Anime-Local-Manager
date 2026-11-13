const { app, BrowserWindow, ipcMain, dialog, shell, screen, safeStorage, Notification, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");
const { validIpcSender } = require("./lib/local-security");
const releaseSmoke = require("./lib/release-smoke").prepareReleaseSmoke(app);

// Electron 30 sélectionne automatiquement X11 ou Wayland. Le décor côté Wayland
// est activé quand le bureau le prend en charge, sans imposer un backend précis.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  app.commandLine.appendSwitch("enable-features", "WaylandWindowDecorations");
}

// Opt-in test profile. Default userData/appId/icon stay unchanged.
if (!releaseSmoke && process.env.ALM_TEST_PROFILE === "1") {
  const testProfile = path.join(app.getPath("appData"), "anime-local-manager-audit-beta29");
  fs.mkdirSync(testProfile, {recursive: true});
  app.setPath("userData", testProfile);
  app.setPath("sessionData", testProfile);
}

app.commandLine.appendSwitch('disk-cache-size','134217728');
let maintenanceMode=(process.argv||[]).includes('--maintenance');
const removeMaintenance=(process.argv||[]).includes('--remove-maintenance');
const gotSingleInstanceLock = removeMaintenance||app.requestSingleInstanceLock();
let appUpdater=null,scheduler=null,updateInProgress=false;
let mainWindow = null;
let server = null;
let activeServerOrigin = null;
let serverModule = null;
let startServer = null;
let defaultPort = 3123;
let engineSupervisor = null;

const SUPPORTED_APP_LANGUAGES = new Set(["fr", "en", "ja", "es", "de", "pt-BR", "zh-CN"]);

function normalizeAppLanguage(value) {
  const raw = String(value || "").trim().replace(/_/g, "-").toLowerCase();
  if (raw === "pt" || raw.startsWith("pt-br")) return "pt-BR";
  if (raw.startsWith("fr")) return "fr";
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("ja")) return "ja";
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("de")) return "de";
  if (raw === "zh" || raw.startsWith("zh-cn") || raw.startsWith("zh-hans")) return "zh-CN";
  return "en";
}

function appLanguageFile() {
  return path.join(app.getPath("userData"), "app-language.txt");
}

function readAppLanguage() {
  try {
    const value = fs.readFileSync(appLanguageFile(), "utf8").trim();
    return SUPPORTED_APP_LANGUAGES.has(value) ? value : "";
  } catch {
    return "";
  }
}

function writeAppLanguage(value) {
  const normalized = normalizeAppLanguage(value);
  if (!SUPPORTED_APP_LANGUAGES.has(normalized)) return "";
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(appLanguageFile(), normalized, "utf8");
    return normalized;
  } catch {
    return "";
  }
}

function prepareWritableDataFolders() {
  // Conserver le même nom d'application et donc le même dossier userData que les
  // versions précédentes : aucune migration risquée de la bibliothèque locale.
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  const imagesDir = path.join(userData, "images");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  process.env.ALM_DATA_DIR = dataDir;
  process.env.ALM_IMAGES_DIR = imagesDir;
}

function readWindowState() {
  try {
    const file = path.join(app.getPath("userData"), "window-state.json");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeWindowState(bounds) {
  try {
    const file = path.join(app.getPath("userData"), "window-state.json");
    fs.writeFileSync(file, JSON.stringify(bounds || {}, null, 2), "utf8");
  } catch {}
}

function visibleWindowState(saved) {
  const candidate = {
    width: Math.max(1000, Number(saved.width) || 1400),
    height: Math.max(700, Number(saved.height) || 900),
    x: Number.isFinite(Number(saved.x)) ? Number(saved.x) : undefined,
    y: Number.isFinite(Number(saved.y)) ? Number(saved.y) : undefined
  };
  if (candidate.x === undefined || candidate.y === undefined) return candidate;
  const visible = screen.getAllDisplays().some(display => {
    const area = display.workArea;
    return candidate.x < area.x + area.width - 80
      && candidate.x + candidate.width > area.x + 80
      && candidate.y < area.y + area.height - 60
      && candidate.y + candidate.height > area.y + 60;
  });
  if (!visible) {
    delete candidate.x;
    delete candidate.y;
  }
  return candidate;
}

function appIconPath() {
  const file = process.platform === "win32" ? "anime-local-manager.ico" : "anime-local-manager-logo.png";
  return path.join(__dirname, "public", "assets", file);
}

function openSafeExternal(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") shell.openExternal(parsed.toString());
  } catch {}
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.focus();
}

const displayPreferences=require('./lib/display-preferences');
function windowState(){return {fullscreen:mainWindow?.isFullScreen?.()===true,maximized:mainWindow?.isMaximized?.()===true,minimized:mainWindow?.isMinimized?.()===true};}
let displayRevision=0,displayExit=null;
function readDisplayPreferences(){try{return displayPreferences.normalize(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'display-settings.json'),'utf8')));}catch{return displayPreferences.normalize();}}
function applyDisplayPreferences(input,persist=false){
 const preference=displayPreferences.normalize(input);
 if(!mainWindow||mainWindow.isDestroyed())return preference;
 const win=mainWindow,revision=++displayRevision;
 const apply=()=>{
  if(win!==mainWindow||win.isDestroyed()||revision!==displayRevision)return readDisplayPreferences();
  const display=screen.getDisplayMatching(win.getBounds());
  if(preference.mode!=='fullscreen'||!win.isFullScreen?.()){
   win.unmaximize();win.setBounds(displayPreferences.bounds(preference,display,readWindowState()||{}));
   if(preference.mode==='maximized')win.maximize();
   if(preference.mode==='fullscreen')win.setFullScreen(true);
  }
  win.webContents.setZoomFactor(preference.size==='large'?1.15:1);
  if(persist)require('./lib/atomic-file').atomicJson(path.join(app.getPath('userData'),'display-settings.json'),preference);
  return preference;
 };
 if(displayExit?.win===win)return displayExit.promise.then(apply);
 if(preference.mode==='fullscreen'||!win.isFullScreen?.())return apply();
 // Windows/macOS may ignore bounds changed before the native fullscreen exit.
 const pending={win,promise:null};displayExit=pending;
 const result=new Promise((resolve,reject)=>{
  let timer,finished=false;
  const cleanup=()=>{clearTimeout(timer);win.removeListener('leave-full-screen',leave);win.removeListener('closed',closed);if(displayExit===pending)displayExit=null;};
  const leave=()=>{if(finished)return;finished=true;cleanup();try{resolve(apply());}catch(error){reject(error);}};
  const closed=()=>{if(finished)return;finished=true;cleanup();resolve(preference);};
  win.once('leave-full-screen',leave);win.once('closed',closed);
  timer=setTimeout(()=>{if(!win.isFullScreen?.())leave();else{finished=true;cleanup();reject(new Error('Fullscreen exit did not complete'));}},3000);
  try{win.setFullScreen(false);}catch(error){finished=true;cleanup();reject(error);}
 });
 pending.promise=result;return result;
}

function createWindow(serverPort = null) {
  const bounds = visibleWindowState(readWindowState());
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(720,screen.getPrimaryDisplay().workArea.width),
    minHeight: Math.min(480,screen.getPrimaryDisplay().workArea.height),
    title: require('./release-version.json').publicName,
    icon: appIconPath(),
    backgroundColor: "#0f1117",
    show: !releaseSmoke,
    autoHideMenuBar: true,
    frame: false,
    fullscreen: readDisplayPreferences().mode === "fullscreen",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  applyDisplayPreferences(readDisplayPreferences());
  if(releaseSmoke)mainWindow.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{let allowed=false;try{allowed=new URL(details.url).origin===activeServerOrigin;}catch{}callback({cancel:!allowed});});
  mainWindow.webContents.on("did-finish-load",()=>mainWindow?.webContents.setZoomFactor(readDisplayPreferences().size==='large'?1.15:1));
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.on("will-attach-webview", event => event.preventDefault());
  mainWindow.on('app-command',(_event,command)=>{if(command==='browser-backward'||command==='browser-forward')mainWindow?.webContents.send('alm-navigation',command==='browser-backward'?'back':'forward');});
  for(const event of ['maximize','unmaximize','enter-full-screen','leave-full-screen','minimize','restore'])mainWindow.on(event,()=>mainWindow?.webContents.send('alm-window-state',windowState()));
  mainWindow.webContents.on('before-input-event',(event,input)=>{if(input.type!=='keyDown'||input.isAutoRepeat||input.key!=='F11')return;event.preventDefault();const current=readDisplayPreferences();Promise.resolve(applyDisplayPreferences({...current,mode:mainWindow.isFullScreen?.()?'windowed':'fullscreen'},true)).catch(error=>console.error('[display]',error.message));});
  mainWindow.once("ready-to-show", () => { if(!releaseSmoke)mainWindow?.show(); });
  if (serverPort !== null) {
    activeServerOrigin = `http://127.0.0.1:${serverPort}`;
    mainWindow.almLoading = mainWindow.loadURL(activeServerOrigin);
  } else {
    mainWindow.almLoading = mainWindow.loadFile(path.join(__dirname, "public", "startup.html"), {query:{lang:readAppLanguage() || normalizeAppLanguage(app.getLocale())}});
  }
  mainWindow.on("close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) writeWindowState(mainWindow.getNormalBounds());
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const destination = new URL(url);
      if (destination.origin === activeServerOrigin) return;
    } catch {}
    event.preventDefault();
    openSafeExternal(url);
  });
}

async function startApplication() {
  if(releaseSmoke)require('./lib/release-smoke').checkpoint(releaseSmoke,'window-start');
  // Paint a visible window before synchronous initialization of the bundled database.
  if(!maintenanceMode){createWindow();await mainWindow.almLoading;}
  await new Promise(resolve => setTimeout(resolve, 40));
  if (!maintenanceMode && (!mainWindow || mainWindow.isDestroyed())) return;
  prepareWritableDataFolders();
  if(releaseSmoke)require('./lib/release-smoke').checkpoint(releaseSmoke,'engine-start');
  if(maintenanceMode){process.env.ALM_MAINTENANCE_MODE='1';process.env.ALM_AUTOMATION_STARTUP='0';}
  const systemSecrets=require('./lib/system-secrets');
  const configKey=await systemSecrets.configKey(safeStorage,app.getPath('userData'));
  if(configKey)process.env.ALM_CONFIG_KEY=configKey;
  process.env.ALM_SESSION_TOKEN = require("node:crypto").randomBytes(32).toString("hex");
  const utility = require("electron").utilityProcess;
  serverModule = utility ? require("./lib/server-process").createServerProcess(utility) : require("./server");
  startServer = serverModule.startServer;
  defaultPort = serverModule.PORT;
  server = await startServer(defaultPort);
  if(releaseSmoke)require('./lib/release-smoke').checkpoint(releaseSmoke,'engine-ready');
  const serverPort = Number(server?.almPort || server?.address?.()?.port || defaultPort);
  activeServerOrigin = `http://127.0.0.1:${serverPort}`;
  if(process.platform==='win32')app.setAppUserModelId?.('fr.gentilrobot.animelocalmanager');
  const activeNotifications=new Set();
  const showEpisodeNotification=async item=>{
    if(!Notification?.isSupported?.())return false;
    const language=readAppLanguage()||normalizeAppLanguage(app.getLocale());
    const phrases={fr:`Épisode ${item.episode} diffusé · ${item.source||'AniList'}`,en:`Episode ${item.episode} aired · ${item.source||'AniList'}`,ja:`第${item.episode}話が放送されました · ${item.source||'AniList'}`,es:`Episodio ${item.episode} emitido · ${item.source||'AniList'}`,de:`Folge ${item.episode} ausgestrahlt · ${item.source||'AniList'}`,'pt-BR':`Episódio ${item.episode} exibido · ${item.source||'AniList'}`,'zh-CN':`第 ${item.episode} 集已播出 · ${item.source||'AniList'}`};
    return new Promise(resolve=>{const n=new Notification({title:item.title,body:phrases[language]||phrases.en,icon:path.join(__dirname,'public/assets/anime-local-manager.ico'),silent:true});activeNotifications.add(n);if(activeNotifications.size>64)activeNotifications.delete(activeNotifications.values().next().value);let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timeout);resolve(value);};const timeout=setTimeout(()=>finish(false),5000);n.once('show',()=>finish(true));n.once('failed',()=>{activeNotifications.delete(n);finish(false);});n.once('close',()=>activeNotifications.delete(n));n.on('click',()=>{focusMainWindow();mainWindow?.webContents.send('alm-episode-open',item.animeId);});n.show();});
  };
  const showUpdateNotification=require('./lib/desktop-update-notification').createDesktopUpdateNotification({Notification,
    language:()=>readAppLanguage()||normalizeAppLanguage(app.getLocale()),icon:path.join(__dirname,'public/assets/anime-local-manager.ico'),
    open:()=>{focusMainWindow();mainWindow?.webContents.send('alm-update-open');}});
  if(!releaseSmoke&&!maintenanceMode){
    await serverModule.startReleaseNotifications?.(showEpisodeNotification);
    await serverModule.configureUpdateNotifications?.(showUpdateNotification);
  }

  const backupSecrets=await systemSecrets.backupStore(safeStorage,app.getPath('userData'));
  if(backupSecrets)await serverModule.configureBackupSecrets?.(backupSecrets);

  for (const channel of ["pick-folder", "get-language", "set-language", "get-system-locale", "clipboard-write"]) {
    ipcMain.removeHandler(channel);
  }
  const portable=process.platform==='win32'?!!process.env.PORTABLE_EXECUTABLE_FILE:!!process.env.APPIMAGE;
  const updateTarget=process.env.PORTABLE_EXECUTABLE_FILE||process.env.APPIMAGE||process.execPath;
  const updater=require('./lib/integrated-updater').createIntegratedUpdater({current:app.getVersion(),platform:process.platform,arch:process.arch,packaged:app.isPackaged,portable,target:updateTarget,directory:path.join(app.getPath('userData'),'updates'),getRelease:async force=>serverModule.checkUpdates(force,(await serverModule.maintenanceState()).settings.channel),quit:()=>{closeLocalServer();app.quit();},onChange:state=>mainWindow?.webContents.send('alm-update-state',state)});
  appUpdater=updater;
  scheduler=require('./lib/os-maintenance').createScheduler({exe:process.env.APPIMAGE||process.execPath,packaged:app.isPackaged,userData:app.getPath('userData')});
  const maintenanceUpdateFor=engine=>async()=>{
    if(!updater.state().supported)return {ok:true,skipped:true,reason:'package-manager'};
    if(updater.state().phase==='ready')return {ok:true};
    const prefs=(await engine.maintenanceState()).settings;
    const release=await engine.checkUpdates(true,prefs.channel);
    if(release.error)return {ok:false,error:release.error};
    if(!release.available)return {ok:true};
    // Do not hold a utility RPC callback for the duration of a large download.
    updater.download().catch(error=>console.warn('[update]',error.message));
    return {ok:true,skipped:true,reason:'downloading'};
  };
  await serverModule.configureMaintenanceUpdate(maintenanceUpdateFor(serverModule));
  const savedMaintenance=await serverModule.maintenanceState();
  const registerStartupSchedule=()=>{if(savedMaintenance.settings.enabled&&scheduler.supported&&!releaseSmoke)scheduler.configure(true,{preserveDisabled:true}).catch(error=>console.warn('[schedule]',error.code||'ALM_SCHEDULE_FAILED'));};
  const trusted = event => {
    if (!validIpcSender(event, mainWindow, activeServerOrigin)) throw new Error("Untrusted IPC sender");
  };
  for(const channel of ['update-state','update-download','update-install','update-cancel'])ipcMain.removeHandler(channel);
  ipcMain.removeHandler('display-get');ipcMain.removeHandler('display-set');
  for(const channel of ['window-close','window-exit-fullscreen','window-minimize','window-toggle-maximize','window-state'])ipcMain.removeHandler(channel);
  for(const channel of ['maintenance-state','maintenance-config'])ipcMain.removeHandler(channel);
  ipcMain.handle('maintenance-state',async event=>{trusted(event);return {...await serverModule.maintenanceState(),schedulerSupported:scheduler.supported,schedulerState:await scheduler.status()};});
  ipcMain.handle('maintenance-config',async(event,input)=>{
    trusted(event);const normalized=require('./lib/maintenance').normalize(input),previous=(await serverModule.maintenanceState()).settings;
    if(scheduler.supported){try{await scheduler.configure(normalized.enabled);try{return {...await serverModule.configureMaintenance(normalized),schedulerSupported:true,schedulerState:await scheduler.status()};}catch(error){await scheduler.configure(previous.enabled);throw error;}}catch(error){const failure=require('./lib/os-maintenance').schedulerError(error);return {...await serverModule.maintenanceState(),ok:false,code:failure.code,hresult:failure.hresult,schedulerSupported:true,schedulerState:await scheduler.status()};}}
    // In source mode, automatic work runs only while the application is open.
    return {...await serverModule.configureMaintenance(normalized),schedulerSupported:false};
  });
  registerStartupSchedule();
  ipcMain.handle('window-close',event=>{trusted(event);mainWindow?.close();return true;});
  ipcMain.handle('window-exit-fullscreen',event=>{trusted(event);return applyDisplayPreferences({...readDisplayPreferences(),mode:'windowed'},true);});
  ipcMain.handle('window-minimize',event=>{trusted(event);if(mainWindow&&!mainWindow.isDestroyed())mainWindow.minimize();return windowState();});
  ipcMain.handle('window-state',event=>{trusted(event);return windowState();});
  ipcMain.handle('window-toggle-maximize',async event=>{trusted(event);const mode=mainWindow?.isFullScreen?.()||mainWindow?.isMaximized?.()?'windowed':'maximized';await applyDisplayPreferences({...readDisplayPreferences(),mode},true);return windowState();});
  ipcMain.handle('display-get',event=>{trusted(event);return readDisplayPreferences();});
  ipcMain.handle('display-set',(event,input)=>{trusted(event);return applyDisplayPreferences(input,true);});
  ipcMain.removeHandler('test-notification');
  ipcMain.handle('test-notification',async event=>{trusted(event);return serverModule.testNotification?serverModule.testNotification(showEpisodeNotification):showEpisodeNotification({title:'Anime Local Manager',episode:1,source:'ALM · Test'});});
  ipcMain.handle('update-state',event=>{trusted(event);return updater.state();});
  ipcMain.handle('update-download',event=>{trusted(event);return updater.download();});
  ipcMain.handle('update-install',event=>{trusted(event);return serverModule.prepareUpdateBackup().then(()=>updater.install());});
  ipcMain.handle('update-cancel',event=>{trusted(event);updater.cancel();return updater.state();});
  ipcMain.handle('clipboard-write', (event, value) => {
    trusted(event);
    if (typeof value !== 'string' || value.length > 100000) throw Error('INVALID_INPUT');
    clipboard.writeText(value);
    return true;
  });
  ipcMain.handle("get-language", event => { trusted(event); return readAppLanguage(); });
  ipcMain.handle("set-language", (event, value) => { trusted(event); return writeAppLanguage(value); });
  ipcMain.handle("get-system-locale", event => { trusted(event); return normalizeAppLanguage(app.getLocale()); });
  ipcMain.handle('input-focus',event=>{trusted(event);if(mainWindow&&!mainWindow.isDestroyed()&&mainWindow.isVisible()&&!mainWindow.isMinimized()){mainWindow.focus();mainWindow.webContents.focus();}return true;});
  ipcMain.handle("pick-folder", async event => {
    trusted(event);
    let result;try{result = await dialog.showOpenDialog(mainWindow || undefined, {
      properties: ["openDirectory"],
      title: "Choisir un dossier"
    });}finally{if(mainWindow&&!mainWindow.isDestroyed())focusMainWindow();}
    if (result.canceled || !result.filePaths.length) return "";
    return result.filePaths[0];
  });
  if(maintenanceMode){const outcome=await serverModule.runMaintenance();while(updater.state().phase==='downloading'||updater.state().phase==='checking')await new Promise(resolve=>setTimeout(resolve,500));if(maintenanceMode){if(!outcome||typeof outcome.tasks!=='object'||!outcome.reason&&Object.values(outcome.tasks).some(task=>task.phase==='error'&&task.lastAttempt>=outcome.lastRun)){await closeLocalServer();app.exit(1);}else app.quit();}}
  if(serverModule.remote&&!maintenanceMode&&!releaseSmoke){
    engineSupervisor=require('./lib/engine-supervisor').createEngineSupervisor({
      initial:serverModule,
      create:()=>{
        process.env.ALM_SESSION_TOKEN=require('node:crypto').randomBytes(32).toString('hex');
        return require('./lib/server-process').createServerProcess(utility);
      },
      reconnect:async engine=>{
        const replacement=await engine.startServer(defaultPort);
        if(backupSecrets)await engine.configureBackupSecrets(backupSecrets);
        await engine.startReleaseNotifications(showEpisodeNotification);
        await engine.configureUpdateNotifications?.(showUpdateNotification);
        await engine.configureMaintenanceUpdate(maintenanceUpdateFor(engine));
        serverModule=engine;startServer=engine.startServer;server=replacement;shutdownPromise=null;
        activeServerOrigin=`http://127.0.0.1:${Number(replacement.almPort)}`;
        if(mainWindow&&!mainWindow.isDestroyed()){await mainWindow.loadURL(activeServerOrigin);focusMainWindow();}
        return replacement;
      },
      onFailure:async(information,controls)=>{
        const nativeMessage=options=>mainWindow&&!mainWindow.isDestroyed()?dialog.showMessageBox(mainWindow,options):dialog.showMessageBox(options);
        let failure=information;
        while(engineSupervisor){
          const words=require('./lib/engine-recovery-copy').copy(readAppLanguage()||normalizeAppLanguage(app.getLocale()));
          const state=controls.snapshot(),choices=[];
          if(failure.reason==='unresponsive')choices.push('wait');
          if(state.canRestart)choices.push('restart');
          choices.push('diagnostic','close');
          const chosen=await nativeMessage({type:'warning',title:words.title,
            message:words[failure.reason==='unresponsive'?'unresponsive':failure.reason==='restart-failed'?'failed':'stopped'],
            detail:words.notice+(state.canRestart?'':'\n\n'+words.limit),
            buttons:choices.map(key=>words[key]),defaultId:Math.max(0,choices.indexOf('restart')),cancelId:choices.indexOf('close'),noLink:true});
          if(!engineSupervisor)return;
          const action=choices[chosen.response];
          if(action==='wait'){controls.resume();return;}
          if(action==='diagnostic'){
            const current=controls.snapshot().diagnostics;
            await nativeMessage({type:'info',title:words.title,message:words.diagnostic,
              detail:String(current?.detail||failure.error||'ALM_ENGINE_STOPPED').slice(-16000),buttons:[words.back],noLink:true});
            continue;
          }
          if(action==='restart'){
            try{await controls.restart();return;}
            catch(error){failure={reason:'restart-failed',error:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'ALM_ENGINE_RESTART_FAILED'};continue;}
          }
          engineSupervisor.dispose();engineSupervisor=null;
          try{await controls.terminate();}catch{app.exit(1);return;}
          server=null;quitReady=true;app.quit();return;
        }
      }
    });
  }
  if(!maintenanceMode&&!mainWindow)createWindow();
  if (!maintenanceMode&&mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(activeServerOrigin);
    focusMainWindow();
  }
}

let shutdownPromise=null, quitReady=false;
function closeLocalServer() {
  engineSupervisor?.dispose();engineSupervisor=null;
  if(serverModule?.remote){if(!shutdownPromise)shutdownPromise=serverModule.shutdown().then(()=>{serverModule.kill();server=null;});return shutdownPromise;}
  if (!server) return;
  if (!shutdownPromise) shutdownPromise = (async () => {
    await serverModule?.stopMaintenance?.();
    await serverModule?.closeCommunity?.();
    serverModule?.stopBackups?.();
    if (server.listening) await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections?.();
    });
    const db = require("./db");
    await db.whenReady();
    db.close();
    server = null;
  })();
  return shutdownPromise;
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance',async(_event,argv=[])=>{
    if(argv.includes('--maintenance'))return;
    if(maintenanceMode){maintenanceMode=false;if(activeServerOrigin){createWindow();await mainWindow.loadURL(activeServerOrigin);focusMainWindow();}}
    else focusMainWindow();
  });

  app.whenReady().then(async () => {
    if(releaseSmoke)require('./lib/release-smoke').checkpoint(releaseSmoke,'electron-ready');
    if (process.platform === "win32") app.setAppUserModelId("fr.gentilrobot.animelocalmanager");
    if(removeMaintenance){const removal=require('./lib/os-maintenance').createScheduler({exe:process.env.APPIMAGE||process.execPath,packaged:app.isPackaged,userData:app.getPath('userData')});await removal.configure(false);app.quit();return;}
    await startApplication();
    if(releaseSmoke){await require('./lib/release-smoke').executeReleaseSmoke({context:releaseSmoke,app,window:mainWindow,close:closeLocalServer});return;}

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const serverPort = Number(server?.almPort || server?.address?.()?.port || defaultPort);
        createWindow(serverPort);
      } else {
        focusMainWindow();
      }
    });
  }).catch(error => {
    if(releaseSmoke){require('./lib/atomic-file').atomicJson(releaseSmoke.result,{schema:1,status:'failed',nonce:releaseSmoke.nonce,phase:releaseSmoke.phase,stage:releaseSmoke.stage,error:error.message});app.exit(1);return;}
    console.error("Démarrage impossible :", error);
    if(!maintenanceMode&&!removeMaintenance)dialog.showErrorBox("Anime Local Manager", `Impossible de démarrer l'application : ${error.message || error}`);
    if(maintenanceMode||removeMaintenance){closeLocalServer().finally(()=>app.exit(1));}else app.quit();
  });

  app.on("before-quit", event=>{
    if(appUpdater?.state().phase==='ready'&&!updateInProgress){
      const saved=require('./lib/maintenance').normalize((()=>{try{return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'data','maintenance-settings.json'),'utf8'));}catch{return {};}})());
      if(saved.enabled&&saved.installOnExit&&(saved.channel==='beta'||(!appUpdater.state().prerelease&&!require('./lib/version-check').version(appUpdater.state().version)?.pre.length))){event.preventDefault();updateInProgress=true;serverModule.prepareUpdateBackup().then(()=>appUpdater.install()).catch(error=>{console.error('[update]',error.message);if(!maintenanceMode)dialog.showErrorBox('Anime Local Manager',error.message);app.quit();});return;}
    }

    if(server&&!quitReady){event.preventDefault();closeLocalServer().then(()=>{quitReady=true;app.quit();}).catch(error=>{dialog.showErrorBox("Anime Local Manager", "Enregistrement final impossible : "+error.message);shutdownPromise=null;});}
    else closeLocalServer();
  });
  app.on("window-all-closed", () => {
    // Sur macOS, l'application reste active ; le serveur est conservé jusqu'à la
    // fermeture réelle. Sous Windows/Linux, tout est arrêté proprement.
    if (process.platform !== "darwin") {
      closeLocalServer();
      app.quit();
    }
  });
}
