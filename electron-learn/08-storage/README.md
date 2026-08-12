# 08 · 持久化与存储

> 桌面应用最重要的能力之一就是"用户关了应用，数据还在"。我们从 Electron 自带的 `userData`、IndexedDB、SQLite、Keychain 出发，建立一套稳健的多平台本地存储方案。

---

## 8.1 路径总览

```text
用户机器
├── ~/Library/Application Support/<AppName>/
│   ├── Preferences         ← Electron userData 持久配置（建议放这儿）
│   ├── IndexedDB/
│   ├── Cache/
│   ├── cookies / Cookies
│   ├── Local Storage/
│   ├── Session Storage/
│   └── <app name>.blob    ← sqlite by Network Process
│
├── ~/Library/Preferences/com.<id>.plist
├── ~/Library/Caches/<AppName>
├── ~/Library/Application Support/<AppName>/GPUCache
│
├── ~/Library/Application Support/<AppName>/Crashpad
│   └── pending/, completed/
│
└── ~/Library/Keychains/login.keychain-db  ← macOS Keychain
```

`app.getPath(name)` 能取出各种 OS 路径：

| name | 说明 |
|------|------|
| `home` | 用户家目录 |
| `appData` | 各用户共享的 application data |
| `userData` | 该 app 私有的 appData 子目录 |
| `temp` | 系统临时目录 |
| `desktop`, `documents`, `downloads`, `pictures`, `videos`, `music` | 系统级 |
| `cache` | 缓存专用 |
| `crashDumps` | Crashpad 写入 |
| `recent` | Windows，文件"最近"列表 |

代码：

```ts
const paths = ['home', 'appData', 'userData', 'temp', 'downloads'] as const;
for (const k of paths) console.log(k, '->', app.getPath(k));
```

---

## 8.2 Electron 默认的存储能力

### 8.2.1 Cookies

```ts
const { session } = require('electron');

const cookies = await session.defaultSession.cookies.get({ url: 'https://example.com' });
await session.defaultSession.cookies.set({
  url: 'https://example.com',
  name: 'auth',
  value: token,
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
});
await session.defaultSession.cookies.remove('https://example.com', 'auth');
```

cookie 跨窗口共享靠 `Session` 决定：同一 `Session` 下的多 window 共享 cookie。

### 8.2.2 IndexedDB

每个 origin 都有一份 IndexedDB。Electron 文件协议下推荐每个 origin 一个 Session：

```ts
const sessionName = `persist:tenant-${tenantId}`;
const s = session.fromPartition(sessionName);
const win = new BrowserWindow({
  webPreferences: { partition: sessionName },
});
```

这样访问同一 origin 的 IndexedDB 不会跨租户污染。

API 调用：

```js
const req = indexedDB.open('my-store', 1);
req.onsuccess = () => {
  const db = req.result;
  const tx = db.transaction(['cache'], 'readwrite');
  tx.objectStore('cache').put({ key: 'a', value: 1 }, 'a');
  tx.oncomplete = () => console.log('done');
};
```

### 8.2.3 Cache Storage / SW

Service Worker 仅在 HTTPS / `app://` scheme 下注册。多数应用避免使用 SW，改用本地 fetch 或 IndexedDB。

### 8.2.4 LocalStorage / SessionStorage

LocalStorage 在 Electron 中也按 origin 存，会受 CDP 改动等影响。一般不推荐放"大对象"。

### 8.2.5 WebSQL

Electron 已不支持；用 SQLite 替代。

---

## 8.3 文件系统落地

### 8.3.1 userData 的子树

```text
<userData>/
├── config.json
├── databases/
│   └── main.db
├── files/
│   └── attachments/<hash>
├── logs/
│   └── main.log
└── gpu/  （系统管理）
```

小心：Chromium 会写 GPUCache 到 `<userData>/GPUCache`，删不掉。

### 8.3.2 多窗口共享文件

```ts
import { app } from 'electron';
import path from 'node:path';

const root = path.join(app.getPath('userData'), 'databases');
fs.mkdirSync(root, { recursive: true });
```

推荐在 main 进程读写 fs，preload 暴露 API；renderer 通过 IPC 调。

### 8.3.3 大文件存储

Chromium 默认 blockmap/data 文件缓存 1GB+。`disk_cache` 也消耗。

关掉：

```ts
session.defaultSession.clearCache();
```

或设置磁盘缓存上限：

```ts
// Chromium 内部：Switch --disk-cache-size=N
app.commandLine.appendSwitch('disk-cache-size', '104857600'); // 100MB
```

### 8.3.4 文件权限

`fs.copyFile` 写到 macOS，owner 是用户；建议保持 0700 私有权限：

```ts
fs.chmodSync(targetPath, 0o700);
```

Windows 没 POSIX 权限，但 AppData 是用户私有的。

---

## 8.4 SQLite：桌面应用的事实标准

### 8.4.1 推荐方案：better-sqlite3

```ts
import Database from 'better-sqlite3';
const db = new Database(path.join(app.getPath('userData'), 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

const stmt = db.prepare('INSERT INTO messages(id, body, created_at) VALUES (?, ?, ?)');
const insert = db.transaction((rows) => {
  for (const r of rows) stmt.run(r.id, r.body, r.created_at);
});
insert(allRows);
```

优势：

- 同步 API，简单可靠。
- 单 writer，多 reader。
- 比 PG / sql.js 在桌面更合适。

### 8.4.2 napi sqlite 替代

如果不想引入原生模块，可以用 `@journeyapps/sqlcipher`、libsql 等。我个人偏好 `better-sqlite3` 同步路径。

### 8.4.3 在 Utility Process 里跑

多窗口并发读写 SQLite 会卡主线程，建议把 SQLite 引擎跑在 Utility Process 内：

```ts
// main
const { utilityProcess } = require('electron');
const sqlWorker = utilityProcess.fork('./sql.worker.js', [], {
  serviceName: 'sqlite-worker',
  stdio: 'inherit',
});

mainWindow.webContents.postMessage('sql-port', null, [port1]);
sqlWorker.postMessage({ ready: true }, [port2]);
```

### 8.4.4 加密

SQLCipher:

```ts
db.pragma(`cipher='sqlcipher'`);
db.pragma(`key='${KEY}'`);  // 32+ 字节
db.pragma('cipher_compatibility = 4');
```

KEY 应该来自 Keychain / DPAPI，不要硬编码。

---

## 8.5 系统凭据存储

### 8.5.1 macOS Keychain

```ts
import { safeStorage } from 'electron';
// or
import Keychain from 'mac-keychain';

const value = '...';
const buf = safeStorage.encryptString(value);
fs.writeFileSync('secret', buf);

const decrypted = safeStorage.decryptString(fs.readFileSync('secret'));
```

`safeStorage` 内部用 Keychain (macOS) / DPAPI (Windows) / libsecret (Linux)。Linux 需要 `gnome-keyring` 或 `kwallet` 才能用。

### 8.5.2 Windows DPAPI

DPAPI 路径：

```ts
// 直接用 @napi-rs/dpapi
import { protect } from '@napi-rs/dpapi';
const buf = Buffer.from('hello');
const enc = protect(buf, Buffer.from('entropy'));
```

### 8.5.3 Linux Secret Service

```bash
sudo apt install libsecret-1-dev libsecret-tools
# kwallet / gnome-keyring
```

`keytar` 包是基于 libsecret 的封装，已被 `safeStorage` 替代。

### 8.5.4 Token 管理

```ts
import { net } from 'electron';
// 不要把 refresh token 写到文件！用 safeStorage。
const access = await api.refresh(refreshToken);
const enc = safeStorage.encryptString(JSON.stringify({ access, refreshToken }));
fs.writeFileSync(path.join(app.getPath('userData'), 'auth.bin'), enc);
```

---

## 8.6 跨版本迁移

桌面应用跨度 5-7 年，必须有"数据迁移"机制。

### 8.6.1 迁移触发点

```ts
app.whenReady().then(async () => {
  const mark = await readMigrationStatus();
  if (mark.version < CURRENT_VERSION) {
    for (const m of migrations.filter(x => x.from > mark.version)) {
      await m.run();
    }
    await writeMigrationStatus({ version: CURRENT_VERSION, ts: Date.now() });
  }
});
```

### 8.6.2 迁移实践

- **配置**：JSON 写盘，加 `version`，改 schema 时补 JSON migration。
- **数据库**：写 SQL migration，跟踪 schema_version。
- **索引文件**：ES 风格版本号，固定 schema。
- **大文件**：把旧文件路径加 `.v1` 后缀，迁移后删旧文件。

### 8.6.3 备份/回滚

```ts
async function withBackup(fn: () => Promise<void>) {
  const bak = path.join(userData, `backup-${Date.now()}.tar.gz`);
  fs.mkdirSync(bak, { recursive: true });
  cp(files, bak);
  try {
    await fn();
  } catch (e) {
    restore(files, bak);
    throw e;
  } finally {
    rm(bak, { recursive: true });
  }
}
```

---

## 8.7 隔离与多租户

### 8.7.1 隔离 Session / Storage

```ts
for (const tenant of tenants) {
  const s = session.fromPartition(`persist:${tenant.id}`);
  await s.clearStorageData({ storages: ['cookies', 'indexdb', 'localstorage'] });
}
```

### 8.7.2 隔离 BrowserWindow

每个租户独立 BrowserWindow + preload + Session。

### 8.7.3 多账号模式

数据中心型 SaaS 的桌面客户端：每账号独立 Session。

---

## 8.8 大文件与 blob

### 8.8.1 IndexedDB 存 blob

```js
const db = await idb.openDB('blobs', 1, { upgrade(db) { db.createObjectStore('files'); }});
await db.put('files', { id: 'a', file: new Blob([...]) }, 'a');
```

数据量上限是磁盘剩余空间，单条值理论可达浏览器上限值（多数实现里 blob 是写文件，单独目录）。

### 8.8.2 自管文件系统

`fs.createWriteStream` 直接写到子目录：

```ts
const file = path.join(userData, 'files', `${hash}`);
fs.writeFileSync(file, content);
```

### 8.8.3 分布式

如果你需要多端同步业务，桌面应用通常落库后上传到云；本地 SQLite 写 WAL，云端 reconcile。

---

## 8.9 错误回放与重放

桌面应用天然可以做"事件回放"：

```ts
type Event =
  | { kind: 'msg.received'; ts: number; payload: any }
  | { kind: 'msg.send'; ts: number; payload: any };

const events: Event[] = [];
const filePath = path.join(userData, 'eventlog.bin');
const log = fs.createWriteStream(filePath, { flags: 'a' });
function record(e: Event) {
  log.write(encodeEvent(e));     // protobuf / msgpack
}
```

崩溃时上一次事件流可以从 eventlog 里逆向。

---

## 8.10 安全与隐私

| 数据 | 存哪 |
|------|------|
| 用户偏好 | JSON 配置 + AppData |
| 凭据 / token | Keychain / DPAPI / SafeStorage |
| 聊天记录 | SQLite 加密 (SQLCipher) |
| 上传图片 | AppData 私有目录，磁盘 0700 |
| Crashdump | userData/Crashpad，按法规允许可关 |
| telemetry | 远程接口 + 用户开关 |

关闭 Crashpad：

```js
app.setName('your.app');      // 重要：影响 Crashpad 标识
// 或升级 Crashpad 服务（仅上报）需要更多配置
```

---

## 8.11 性能

| 操作 | 优化 |
|------|------|
| 单条 write 1000 条 SQLite | `db.transaction` + `prepare` cache |
| 写大文件 | `fs.createWriteStream` + buffer 控制 |
| JSON 序列化大对象 | 直接走 protobuf / MessagePack |
| 网络请求缓存 | `caches.open` + Cache API |

---

## 8.12 推荐库与对比

| 用途 | 推荐库 |
|------|--------|
| 配置 | `cosmiconfig` / `@iarna/toml` |
| KV 存储 | `conf` / `electron-store` |
| SQLite | `better-sqlite3` |
| IndexedDB | `idb` / `idb-keyval` |
| 加密 | `safeStorage` (Electron) / `tweetnacl` |
| 文件系统 | `fs-extra`（含 graceful） |
| 大文件 | `stream/web` (Node) |
| 数据迁移 | `umzug` / 自己写 |

---

## 8.13 小结

- 桌面存储 = `userData` 配置 + SQLite 业务数据 + IndexedDB 缓存 + Keychain / DPAPI 凭据。
- `safeStorage` 是一站式接入系统凭据存储的便捷 API。
- 大数据量场景优先考虑 SQLite + WAL；不要把 Log 大量走 JSON.stringify。
- 数据迁移一定要写 backup + rollback。

下一章 [09 · 自动更新](./../09-auto-update/README.md)。
