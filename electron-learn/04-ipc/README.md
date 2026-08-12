# 04 · IPC 通信

> IPC 是 Electron 工程化最薄弱的一环：错误地使用 `ipcRenderer.send`、`webContents.send`、`ipcMain.on` 会让渲染进程的任意调用直达主进程特权面。本章从内部实现到工程范式，建立一套高吞吐、可审计的 IPC 协议。

---

## 4.1 IPC 的两条线

Electron 有两类底层通道：

1. **Browser-process Channel（Chromium IPC）**：主进程与渲染进程之间、Utility Process 之间。底层是 Mojo（`IPC::Channel`）。
2. **WebContents Channel**：主进程向指定渲染进程 / 多渲染进程 broadcast。

```text
        ┌──── Renderer A ────┐       ┌──── Renderer B ────┐
        │   ipcRenderer      │       │   ipcRenderer      │
        └──────┬─────────────┘       └──────┬─────────────┘
               │                                │
               │ Channel (renderer_id=A)        │ Channel (renderer_id=B)
               ▼                                ▼
        ┌────────────────────────────────────────────────┐
        │     Main: ipcMain / BrowserWindow.webContents │
        └──────┬─────────────────────────────────────────┘
               │
               │ Channel (child_id=U)
               ▼
        ┌────────────────────────────────────────────────┐
        │                  Utility Process                │
        │   NodeBindings + parentPort messaging          │
        └────────────────────────────────────────────────┘
```

`ipcMain` / `ipcRenderer` 是 Electron 在 Mojo 之上做的 JS 抽象。

---

## 4.2 三种消息模式

| 模式 | 适用 | API | 行为 |
|------|------|-----|------|
| Fire-and-forget | 通知类（关闭、状态变化） | `ipcRenderer.send` / `ipcMain.on` | 单向 |
| Request/Response | 业务调用（读文件、查询） | `ipcRenderer.invoke` / `ipcMain.handle` | 返回 Promise |
| Bidirectional | 流式事件、订阅 | `MessageChannelMain` / `MessagePortMain` | 双向 |

### 4.2.1 Fire-and-forget

```js
// renderer
ipcRenderer.send('user:active', { id: 42 });

// main
ipcMain.on('user:active', (event, payload) => {
  console.log('from', event.sender.id, payload);
});
```

注意：没有 ack。Main 想"回话"得另开一个 channel。

### 4.2.2 Request/Response

```js
// renderer
const user = await ipcRenderer.invoke('user:get', 42);

// main
ipcMain.handle('user:get', async (event, id) => {
  if (!Number.isInteger(id)) throw new Error('bad id');
  return userRepo.find(id);
});
```

`handle` 的优势：

1. 自动追踪 request ↔ response。
2. 渲染层可以 `await`，简化前端代码。
3. 主进程能捕获异常，在浏览器 console 显出。

### 4.2.3 Bidirectional（MessageChannel）

```js
// main
const { port1, port2 } = new MessageChannelMain();
win.webContents.postMessage('port', null, [port1]);
worker.postMessage({ type: 'init' }, [port2]);

// renderer
ipcRenderer.on('port', (e) => {
  const port = e.ports[0];
  port.onmessage = (event) => console.log(event.data);
  port.postMessage('hello');
});

// utility
process.parentPort.on('message', (e) => {
  const port = e.ports[0];
  port.on('message', (m) => console.log(m.data));
  port.start();
});
```

`MessageChannelMain` 是 Chromium `MessagePipe` 的暴露。当通信双方持续有大量数据流时（IM 消息、文件 chunk、白板协作帧），它比一对 `invoke` 高效得多。

---

## 4.3 IPC 协议的工程问题

### 4.3.1 入参校验

主进程处理 IPC 入参时必须校验，没有例外。

```ts
import { z } from 'zod';

const GetUserReq = z.object({ id: z.number().int().positive() });
const SendMessageReq = z.object({
  channelId: z.string().min(1).max(64),
  body: z.string().max(4096),
  attachments: z.array(z.string().url()).max(20).optional(),
});

ipcMain.handle('chat.send', async (e, raw) => {
  const req = SendMessageReq.parse(raw);  // 抛错即拒绝
  return chatService.send(req);
});
```

把这条"在 main 加 zod 校验"定为 lint 规则：

```js
// scripts/check-ipc-handler.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const files = await glob('main/**/*.ts');
for (const f of files) {
  const t = await fs.readFile(f, 'utf8');
  if (/ipcMain\.handle\(['"]/m.test(t) && !/\.parse\(|\.safeParse\(|require.*zod|require.*ajv/.test(t)) {
    console.error(`[security] ipc handler without schema check: ${f}`);
  }
}
```

CI 上 grep 这条逻辑，发现一处报错一处。

### 4.3.2 类型化 IPC

大型项目想做端到端 TS 类型，靠 `electron/contextBridge` 手写不优雅。可以：

1. 用 [trpc-electron](https://github.com/MatrixAI/typescript-runtypes) 这类库。
2. 手写协议 `types/ipc.ts`：

```ts
// shared/ipc.ts
export type IpcContract = {
  'user.get': (id: number) => Promise<User>;
  'chat.send': (req: SendMessageReq) => Promise<Message>;
  'fs.readConfig': (key: string) => Promise<string | null>;
};

export type IpcRequest<K extends keyof IpcContract> = Parameters<IpcContract[K]>[0];
export type IpcResponse<K extends keyof IpcContract> = Awaited<ReturnType<IpcContract[K]>>;
```

再让 preload 引用：

```ts
import type { IpcContract } from '../shared/ipc';

function invoke<K extends keyof IpcContract>(ch: K, payload: Parameters<IpcContract[K]>[0]) {
  return window.electron.ipcRenderer.invoke(ch, payload);
}
```

`electron-trpc`、`@electron-toolkit/typed-ipc` 都可以引入做 CLI 生成。

### 4.3.3 防止跨窗口副作用

```ts
// main
ipcMain.handle('user:get', async (event, id) => {
  // 不要假设 event.sender 是主窗口；
  // 它可能是某个 utility、某个 webview、某个 child window
  log.info({ senderId: event.sender.id, frame: event.senderFrame }, 'user:get');
});
```

`event.sender` 是 `WebContents`，`event.senderFrame` 是具体的 frame。审计时把 senderFrame 持久化到日志。

### 4.3.4 reply / sync / blocking

尽量用 `invoke`。`event.returnValue`（同步）会阻塞 renderer 的 V8，**严格禁止**。

```ts
ipcMain.on('user:get', (event, id) => {
  event.returnValue = userRepo.find(id);   // ❌ 不要这样做
});
```

`webContents.send` 也别在主进程每帧调用，会让 Renderer 的 IPC queue 爆掉。改成节流或 Web Frame 通信。

---

## 4.4 高吞吐设计与流式消息

### 4.4.1 场景

- 拖入 4GB 大文件：renderer 读到 `Blob`，切片后向 main 请求写盘。
- 视频编辑：每秒 30 帧元数据传给 storage service 持久化。
- 协作白板：每帧 5KB-200KB 的命令队列。

### 4.4.2 切忌：`Array`/`Object` 整体 POST

```ts
// ❌
await ipcRenderer.invoke('whiteboard.append', 100_000_items);

// ✅ 改用流
const port = await openStreamPort('whiteboard.append');
for (const chunk of chunks) {
  port.postMessage(chunk);
}
port.postMessage({ done: true });
```

或者用 `SharedArrayBuffer` + `Worker` 让 Renderer 自己处理。这两条路都比 invoke 强一个量级。

### 4.4.3 MessagePortMain 的细节

- `port.start()` 之前 `postMessage` 是排队；之后是异步实时。
- `port.close()` 关 channel；MessagePort 是 transferable，可以多次 transfer。
- MessagePortMain 内部其实是 Mojo 的 `MessagePipe`，**不是** 字节流。超大数据需要主动分包。

### 4.4.4 取消请求（AbortController）

```ts
// preload
async function cancelableInvoke<K extends keyof IpcContract>(
  ch: K,
  payload: Parameters<IpcContract[K]>[0],
  signal?: AbortSignal,
) {
  const abortPort = new MessageChannelMain();
  if (signal) {
    signal.addEventListener('abort', () => {
      abortPort.port1.postMessage('abort');
    });
  }
  return ipcRenderer.invoke(ch, payload, abortPort.port2);
}

// main
ipcMain.handle('big-chunk', async (e, payload, abortPort: MessagePortMain) => {
  abortPort.on('message', () => {
    // 真正停止后台 fetch
    controller.abort();
  });
  abortPort.start();
  // …做任务
});
```

`AbortSignal` 的跨进程 abort signal 在 Electron 28 起被支持。

---

## 4.5 Renderer 之间、Renderer 与 Utility Process 的通信

### 4.5.1 Renderer → Utility

主进程代理：

```ts
// renderer 没办法直接 fork utility，必须主进程转
mainWindow.webContents.send('opened');                       // fire-and-forget
utility.postMessage({ kind: 'msg', payload });                // 走 utility 的 IPC
```

### 4.5.2 Utility → Renderer

Utility → main → renderer：

```ts
// utility
process.parentPort.postMessage({ kind: 'progress', value });

// main
utility.on('message', (e) => {
  mainWindow.webContents.send('utility.progress', e.data);
});
```

### 4.5.3 Renderer ↔ Renderer（peer to peer）

Electron 没有直接暴露。要么：

- 主进程当中转。
- 用 `chrome.runtime.connect`（仅 webview 标签）/ WebRTC。
- 给每个 renderer 暴露独立的 MessagePortMain，主进程路由。

---

## 4.6 IPC 性能观测

### 4.6.1 自带指标

```js
// 测量一次 invoke 的延迟
const t0 = Date.now();
await ipcRenderer.invoke('user:get', 42);
console.log('latency', Date.now() - t0);
```

更严格的使用 `performance.now()`。

### 4.6.2 Chrome IPC Tracing

```bash
# 用 Chromium Tracing 抓 IPC 流量
electron --enable-logging --v=1 --trace-startup-file=trace.json
# 或者把 trace 配置写到 chrome://flags:
#    chrome://tracing 录制 "IPC" channel
```

### 4.6.3 真实瓶颈来源

| 现象 | 通常原因 |
|------|----------|
| `invoke` 几百毫秒 | 主进程阻塞 / Node GC |
| renderer 卡顿 | `webContents.send` 频繁 / 巨大对象 |
| Mojo::SequencedTaskRunner 拥塞 | 主进程同步任务多 |
| 消息丢失 | postMessage 不调用 `port.start()` |

---

## 4.7 安全审计 IPC 的清单

```markdown
## IPC 审计 checklist

### 必要性
- [ ] 是否所有 IPC 调用都"必须经过 main"？多余的 IPC 是否可以本地化（前端 Worker / Service Worker）
- [ ] payload 大小是否合理？是否有可拆解的 stream？

### 校验
- [ ] handler 是否对全部入参 schema 校验？
- [ ] 是否对 sender 来源做白名单（window / webview / utility）？
- [ ] 是否对返回对象做 shape / 大小限制？

### 性能
- [ ] 是否避免在 Renderer 主线程做大量 postMessage？
- [ ] 是否避免主进程每帧 webContents.send？

### 错误处理
- [ ] handler 内异常是否会向上抛到 Renderer console？
- [ ] 是否针对 OOM / 不响应做了 fallback？

### 类型
- [ ] payload 全部有 TS 类型或运行时 schema？
- [ ] 类型与 schema 是否集中管理而不是散落在每个 handler？
```

---

## 4.8 反模式

1. **跨进程共享可变对象**（引用传递不可靠，需深拷贝或 `structuredClone`）。
2. **主进程里 `setInterval` 调 `webContents.send`** —— 这是巨型坑。
3. **主进程调 `node-fetch` 后 `webContents.send` 整个 response body** —— 把网络层放主进程并不明智。
4. **用 `ipcMain.handle` 做高并发任务** —— 并发请求会把 node thread pool 拉满。
5. **在 preload 里直接挂 `ipcRenderer`** —— 直接绕过 contextBridge。
6. **不校验 `event.senderFrame`** —— 多个 BrowserWindow 复用同一个 handler 容易被上下文混淆。

---

## 4.9 一个 IM 场景的完整 IPC 设计

### 4.9.1 路由

```text
Renderer A (main)
  ├── invoke 'chat.history'         → Main → DB → response
  ├── subscribe 'msg.new'           ← Main (broadcast)
  └── open Port 'msg.stream'        ↔ Utility (codec)

Renderer B (settings)
  └── invoke 'user.update'          → Main → DB

Utility Process (codec)
  ├── onmessage { data: blob, type }           ← Renderer A 通过 MessagePortMain
  └── postMessage { frame, ts }                 → Renderer A
```

### 4.9.2 preload

```ts
const port = await new Promise<MessagePort>(resolve => {
  const handler = (e: IpcRendererEvent) => {
    ipcRenderer.off('msg.port.ready', handler);
    resolve(e.ports[0]);
  };
  ipcRenderer.on('msg.port.ready', handler);
  ipcRenderer.send('msg.port.open');
});

contextBridge.exposeInMainWorld('msg', {
  history: (cid: string, before?: number) =>
    ipcRenderer.invoke('chat.history', { cid, before }),
  onNew: (cb: (m: Message) => void) => {
    ipcRenderer.on('msg.new', (_, payload) => cb(payload));
  },
  openStream: async () => {
    // 这个 stream port 由 main 暴露，我们直接发给 main 转发给 utility
    const { port1, port2 } = new MessageChannel();
    ipcRenderer.postMessage('msg.stream', null, [port2]);
    port1.start();
    return port1;
  },
});
```

### 4.9.3 主进程

```ts
ipcMain.handle('chat.history', async (e, req) => {
  // 校验 sender 是哪个 WebContents，决定是否允许查询
  if (!canReadChannel(e.senderFrame, req.cid)) {
    throw new Error('forbidden');
  }
  return messageRepo.find({ channel: req.cid, before: req.before, limit: 50 });
});

ipcMain.on('msg.port.open', (e) => {
  e.senderFrame; // sender
  // 把这个渲染进程的 mainWindow 与 utility 的 codec 连起来
  const { port1, port2 } = new MessageChannelMain();
  e.sender.postMessage('msg.port.ready', null, [port1]);
  codec.postMessage({ kind: 'attach' }, [port2]);
});

broadcast.on('message', (m) => {
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('msg.new', m));
});
```

### 4.9.4 Utility

```ts
process.parentPort.on('message', (e) => {
  const { data, ports } = e;
  if (data.kind === 'attach') {
    const port = ports[0];
    port.on('message', async (m) => {
      if (m.data.kind === 'send') {
        const encoded = codec.encode(m.data.payload);
        port.postMessage({ kind: 'recv', encoded });
      }
    });
    port.start();
  }
});
```

这是 **工程实践层面** 的模板：renderer 不需要知道 utility 的存在，只看到稳定 API；主进程做路由和权限。

---

## 4.10 总结

- `ipcRenderer.invoke` 是最常用、最稳健的选择。
- `MessageChannelMain` 用于高吞吐、流式场景。
- **所有 IPC 入参必须 schema 校验**，且必须做 sender 白名单。
- 协议类型应集中管理而不是散落在每个 handler。
- 不要在主进程做高代价同步任务。

下一章 [05 · Native 集成](./../05-native/README.md)。
