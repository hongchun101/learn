// examples/05-auto-updater/main.ts
import { app, BrowserWindow, autoUpdater, dialog } from 'electron';
import log from 'electron-log';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 720, show: false });
  win.once('ready-to-show', () => win.show());

  // 1. 配置日志
  autoUpdater.logger = log;
  (log.transports.file as any).level = 'info';

  // 2. 设置更新源
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://updates.example.com/app',
    channel: process.env.UPDATE_CHANNEL ?? 'stable',
  });

  // 3. 关键安全设置
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // 4. 监听事件
  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Available',
      message: `Found update ${info.version}`,
      buttons: ['Download now', 'Later'],
    });
    if (response === 0) autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Ready',
      message: 'Restart now to install update?',
      buttons: ['Restart now', 'On next launch'],
      defaultId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // 5. 启动时检测
  await autoUpdater.checkForUpdates();
});
