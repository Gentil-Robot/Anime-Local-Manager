const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("animeManager", {
  onUpdateOpen:callback=>{const listener=()=>callback();ipcRenderer.on('alm-update-open',listener);return ()=>ipcRenderer.removeListener('alm-update-open',listener);},
  onEpisode:callback=>{const listener=(_event,id)=>{if(Number.isSafeInteger(id)&&id>0)callback(id);};ipcRenderer.on('alm-episode-open',listener);return ()=>ipcRenderer.removeListener('alm-episode-open',listener);},
  onNavigation: callback=>{const listener=(_event,direction)=>{if(direction==='back'||direction==='forward')callback(direction);};ipcRenderer.on('alm-navigation',listener);return ()=>ipcRenderer.removeListener('alm-navigation',listener);},
  testNotification:()=>ipcRenderer.invoke('test-notification'),
  maintenanceState:()=>ipcRenderer.invoke('maintenance-state'),
  maintenanceConfigure:settings=>ipcRenderer.invoke('maintenance-config',settings),
  updateState:()=>ipcRenderer.invoke('update-state'),
  updateDownload:()=>ipcRenderer.invoke('update-download'),
  updateInstall:()=>ipcRenderer.invoke('update-install'),
  updateCancel:()=>ipcRenderer.invoke('update-cancel'),
  onUpdate:callback=>{const listener=(_event,state)=>{if(state&&typeof state.phase==='string')callback(state);};ipcRenderer.on('alm-update-state',listener);return ()=>ipcRenderer.removeListener('alm-update-state',listener);},
  closeWindow:()=>ipcRenderer.invoke('window-close'),
  minimizeWindow:()=>ipcRenderer.invoke('window-minimize'),
  toggleMaximize:()=>ipcRenderer.invoke('window-toggle-maximize'),
  getWindowState:()=>ipcRenderer.invoke('window-state'),
  onWindowState:callback=>{const listener=(_event,state)=>{if(state&&['fullscreen','maximized','minimized'].every(key=>typeof state[key]==='boolean'))callback(state);};ipcRenderer.on('alm-window-state',listener);return ()=>ipcRenderer.removeListener('alm-window-state',listener);},
  exitFullscreen:()=>ipcRenderer.invoke('window-exit-fullscreen'),
  getDisplayPreferences:()=>ipcRenderer.invoke('display-get'),
  setDisplayPreferences:preferences=>ipcRenderer.invoke('display-set',preferences),
  writeClipboard: value => ipcRenderer.invoke("clipboard-write", value),
  restoreInputFocus: () => ipcRenderer.invoke("input-focus"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  getLanguage: () => ipcRenderer.invoke("get-language"),
  setLanguage: language => ipcRenderer.invoke("set-language", language),
  getSystemLocale: () => ipcRenderer.invoke("get-system-locale")
});
