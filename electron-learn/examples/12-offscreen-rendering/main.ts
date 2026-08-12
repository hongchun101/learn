// examples/12-offscreen-rendering/main.ts
// Offscreen 渲染，用于截图或生成 PDF
import { app, BrowserWindow, webContents } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
    },
  });

  await win.loadURL('app://localhost/index.html');

  const buf = await win.webContents.capturePage();
  await fs.writeFile('out.png', buf.toPNG());

  // 录制 1.5 秒
  await new Promise((resolve) => setTimeout(resolve, 1500));

  app.quit();
});
