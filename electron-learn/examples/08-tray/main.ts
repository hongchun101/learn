// examples/08-tray/main.ts
import { app, Tray, Menu, BrowserWindow, nativeImage, globalShortcut } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  const resized = icon.resize({ width: 16, height: 16 });

  tray = new Tray(resized);
  tray.setToolTip('DeepElectronApp — click to open');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Window', click: () => { mainWindow?.show(); } },
    { label: 'Settings', click: () => { /* TODO */ } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else mainWindow?.show();
  });
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  createTray();

  // Global shortcut
  globalShortcut.register('CommandOrControl+Shift+Y', () => mainWindow?.show());
  globalShortcut.register('CommandOrControl+Shift+H', () => mainWindow?.hide());
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 不退出，让 tray 接管
    if (process.env.EXIT_ON_CLOSE) app.quit();
  }
});
