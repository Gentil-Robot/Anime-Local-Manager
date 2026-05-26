const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
let serverModule = null;

function prepareWritableDataFolders() {
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  const imagesDir = path.join(userData, "images");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  process.env.ALM_DATA_DIR = dataDir;
  process.env.ALM_IMAGES_DIR = imagesDir;
}

prepareWritableDataFolders();
serverModule = require("./server");
const { startServer, PORT } = serverModule;

let mainWindow;
let server;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "Anime Local Manager",
    icon: path.join(__dirname, "public", "assets", "anime-local-manager.ico"),
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  server = startServer(PORT);
  createWindow();

  ipcMain.handle("pick-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Choisir un dossier"
    });

    if (result.canceled || !result.filePaths.length) return "";
    return result.filePaths[0];
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (server) server.close();
});

app.on("window-all-closed", () => {
  if (server) server.close();
  if (process.platform !== "darwin") app.quit();
});
