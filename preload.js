const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("animeManager", {
  pickFolder: () => ipcRenderer.invoke("pick-folder")
});
