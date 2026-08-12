// examples/01-secure-window/main.ts
// 一个最小受信 BrowserWindow 演示
import { app, BrowserWindow, shell, session } from 'electron';
import path from 'node:path';

const isDev = process.env.NODE_ENV === 'development';

function createMain() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#0f1116',
    title: 'Secure Window Demo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.loadURL(isDev ? 'http://localhost:5173' : 'app://localhost/index.html');

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('app://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://localhost')) {
      event.preventDefault();
    }
  });

  return win;
}

// 启动前：注册 CSP
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://api.example.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
        ],
      },
    });
  });

  createMain();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
