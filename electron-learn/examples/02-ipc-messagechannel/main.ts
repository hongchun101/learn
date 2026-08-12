// examples/02-ipc-messagechannel/main.ts
import { app, BrowserWindow, utilityProcess, MessageChannelMain } from 'electron';
import path from 'node:path';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.once('ready-to-show', () => win.show());

  // 主进程启动 utility 进程
  const child = utilityProcess.fork(path.join(__dirname, 'utility.js'), [], {
    serviceName: 'image-conv',
    stdio: 'inherit',
  });

  // 创建 MessageChannel
  const { port1, port2 } = new MessageChannelMain();

  // 当 utility 启动后把 port2 传给它，把 port1 传给 renderer
  child.on('spawn', () => {
    child.postMessage({ kind: 'attach' }, [port2]);
    win.webContents.postMessage('utility-port', null, [port1]);
  });

  await win.loadURL('app://localhost/index.html');
});
