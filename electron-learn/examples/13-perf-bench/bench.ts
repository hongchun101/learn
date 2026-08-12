// examples/13-perf-bench/bench.ts
// 一个最简的"启动期打点"示例，可以贴到你的 main.ts / preload
import { app, BrowserWindow, webContents } from 'electron';

const t0 = Date.now();
const marks: Record<string, number> = {};

function mark(name: string) {
  marks[name] = Date.now() - t0;
  console.log(`[perf] ${name} = ${marks[name]} ms`);
}

app.whenReady().then(() => mark('when-ready'));
process.nextTick(() => mark('next-tick-after-whenready'));

// Render-ready
const win = new BrowserWindow({ width: 1024, height: 768, show: false });
win.webContents.once('did-finish-load', () => mark('did-finish-load'));
win.webContents.once('render-process-gone', (event, details) => console.error('renderer gone', details));
win.once('ready-to-show', () => mark('ready-to-show'));
win.once('show', () => mark('show'));

// 渲染层
win.webContents.on('dom-ready', () => {
  win.webContents.executeJavaScript(`
    (() => {
      performance.mark('dom-content-loaded');
      window.addEventListener('load', () => {
        performance.mark('load');
        const metrics = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        const result = {
          navigationStart: metrics.startTime,
          domContentLoadedEventEnd: metrics.domContentLoadedEventEnd,
          loadEventEnd: metrics.loadEventEnd,
          firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime,
          firstContentfulPaint: fcp?.startTime,
        };
      });
    })();
  `);
});
