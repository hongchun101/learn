// examples/10-deep-link/main.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';

const PROTOCOL = 'deepapp';

// 注册 deep-link 协议
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', (_, argv) => {
    const url = argv.find(a => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
  });

  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1024, height: 720, show: false });
    win.once('ready-to-show', () => win.show());

    win.on('closed', () => { /* cleanup */ });

    // ipc 渲染内部逻辑
    ipcMain.handle('system:openPath', async (_e, target: string) => {
      if (typeof target !== 'string' || !target.startsWith('/tmp')) {
        throw new Error('bad path');
      }
      return target;
    });

    // macOS 唤起
    app.on('open-url', (event, url) => {
      event.preventDefault();
      handleDeepLink(url);
    });

    await win.loadURL('app://localhost/index.html');
  });
}

const ALLOWED = new Set(['open', 'settings']);

function handleDeepLink(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== `${PROTOCOL}:`) return;
    const action = u.hostname;
    const params = Object.fromEntries(u.searchParams);
    if (!ALLOWED.has(action)) {
      dialog.showErrorBox('Deep link rejected', `Action ${action} is not allowed`);
      return;
    }
    // 派发给渲染层
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('deep-link', { action, params });
    });
  } catch (e) {
    dialog.showErrorBox('Deep link error', String(e));
  }
}
