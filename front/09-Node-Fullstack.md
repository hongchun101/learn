# 09 · Node.js 全栈

> 现代前端工程师 = 前端 + Node.js 全栈。SSR、BFF、构建脚本、CLI 工具、Serverless…… 都依赖 Node。

## 📌 心智模型

```
Node.js = Chrome V8 + libuv + 内置 API

核心能力:
  • 异步 I/O (事件驱动)
  • 单进程 (Worker Threads 处理 CPU 密集)
  • CommonJS / ESM 模块
  • npm 生态

前端用 Node 的场景:
  • 构建工具 (Vite/Webpack)
  • SSR / SSG
  • BFF 层
  • Serverless
  • CLI 工具
  • 自动化脚本
```

## 9.1 事件循环深度

### 9.1.1 libuv 线程池
```
主线程 (V8):
  执行同步 JS

工作线程池 (libuv 默认 4):
  I/O (文件、DNS)
  CPU 密集 (crypto、zlib)

事件循环阶段 (6 个):
  1. timers (setTimeout, setInterval)
  2. pending callbacks
  3. idle, prepare
  4. poll (I/O 回调)
  5. check (setImmediate)
  6. close callbacks

每阶段之间: 清空 process.nextTick 队列 → 清空 microtasks
```

### 9.1.2 process.nextTick vs setImmediate vs queueMicrotask
```javascript
process.nextTick(() => console.log('nextTick'));   // 当前操作后立即
Promise.resolve().then(() => console.log('promise'));// 当前操作后立即
setImmediate(() => console.log('immediate'));       // check 阶段
setTimeout(() => console.log('timeout'), 0);        // timers 阶段

// 输出顺序: nextTick → promise → timeout → immediate (通常)
```

## 9.2 模块系统

### 9.2.1 CommonJS
```javascript
// 导出
module.exports = { foo: 1 };
module.exports.bar = function() {};
exports.foo = 1;  // 等同 module.exports.foo,不能改 exports 指向

// 导入
const { foo, bar } = require('./module');
const module = require('./module');
```

### 9.2.2 ESM
```javascript
// 导出
export const foo = 1;
export default function() {};

// 导入
import bar, { foo } from './module.mjs';

// 动态导入
const mod = await import('./module.mjs');
```

### 9.2.3 CJS / ESM 互操作
```json
// package.json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }
}
```

### 9.2.4 顶层 await (ESM)
```javascript
const data = await fetch('https://api.example.com');
const json = await data.json();
export { json };
```

## 9.3 内置模块

### 9.3.1 fs / fs/promises
```javascript
import { readFile, writeFile } from 'fs/promises';

const data = await readFile('./file.txt', 'utf-8');
await writeFile('./out.txt', 'content');

// 流
import { createReadStream, createWriteStream } from 'fs';
const rs = createReadStream('in.txt');
const ws = createWriteStream('out.txt');
rs.pipe(ws);
```

### 9.3.2 path
```javascript
import { join, resolve, basename, dirname, extname } from 'path';

join('/foo', 'bar', 'baz');   // /foo/bar/baz
resolve('./src', 'index.js'); // 绝对路径
basename('/foo/bar.js');      // bar.js
```

### 9.3.3 url
```javascript
const u = new URL('https://example.com/path?q=1#hash');
u.pathname; u.searchParams.get('q');
```

### 9.3.4 events
```javascript
import { EventEmitter } from 'events';

class MyEmitter extends EventEmitter {}
const e = new MyEmitter();
e.on('foo', (data) => console.log(data));
e.emit('foo', { msg: 'hi' });
e.once('foo', () => console.log('once'));
e.removeAllListeners('foo');
```

### 9.3.5 stream
```javascript
import { Readable, Writable, Transform } from 'stream';

// Transform: 大文件处理
const upper = new Transform({
  transform(chunk, encoding, cb) {
    cb(null, chunk.toString().toUpperCase());
  }
});
process.stdin.pipe(upper).pipe(process.stdout);
```

### 9.3.6 Buffer
```javascript
const buf = Buffer.from('hello', 'utf-8');
buf.toString('base64');
buf.length;          // 5
buf.readUInt32BE(0); // 大端读 4 字节
Buffer.concat([buf1, buf2]);
```

### 9.3.7 worker_threads
```javascript
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

if (isMainThread) {
  const worker = new Worker('./worker.js', { workerData: { n: 100000 } });
  worker.on('message', m => console.log('Result:', m));
} else {
  let result = 0;
  for (let i = 0; i < workerData.n; i++) result += i;
  parentPort.postMessage(result);
}
```

### 9.3.8 child_process
```javascript
import { spawn, exec, fork } from 'child_process';

// spawn: 流式
const ls = spawn('ls', ['-lh']);
ls.stdout.on('data', d => process.stdout.write(d));

// exec: shell + buffer
exec('ls -lh', (err, stdout) => console.log(stdout));

// fork: Node 子进程(用于 IPC)
const child = fork('./child.js');
child.send({ msg: 'hello' });
child.on('message', m => console.log(m));
```

## 9.4 HTTP 服务端

### 9.4.1 原生 http
```javascript
import http from 'http';

const server = http.createServer((req, res) => {
  if (req.url === '/api/users') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([{ id: 1, name: 'A' }]));
  } else if (req.url === '/') {
    res.end('<h1>Hello</h1>');
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(3000);
```

### 9.4.2 Express
```javascript
import express from 'express';
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});

app.get('/api/users', (req, res) => {
  res.json([{ id: 1, name: 'A' }]);
});

app.post('/api/users', (req, res) => {
  const user = req.body;
  res.status(201).json({ id: Date.now(), ...user });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server Error' });
});

app.listen(3000);
```

### 9.4.3 Fastify (性能更好)
```javascript
import Fastify from 'fastify';
const app = Fastify({ logger: true });

app.get('/api/users', async () => ({ users: [] }));
app.post<{ Body: { name: string } }>('/api/users', async (req) => {
  return { id: Date.now(), name: req.body.name };
});

app.listen({ port: 3000 });
```

### 9.4.4 Hono (跨平台 Web 标准)
```typescript
import { Hono } from 'hono';
const app = new Hono();

app.get('/api/users', (c) => c.json([{ id: 1, name: 'A' }]));

export default app;  // 同一个 app 跑 Node/Bun/Workers/Edge
```

## 9.5 数据库

### 9.5.1 Prisma (现代 ORM)
```typescript
// schema.prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id     Int  @id @default(autoincrement())
  title  String
  author User @relation(fields: [authorId], references: [id])
  authorId Int
}
```

```typescript
// 查询
const users = await prisma.user.findMany({
  include: { posts: true },
  where: { email: { contains: '@example.com' } },
  orderBy: { id: 'desc' },
  take: 10,
});

// 事务
await prisma.$transaction([
  prisma.user.create({ data: { email: 'a@b.c' } }),
  prisma.post.create({ data: { title: 'hi', authorId: 1 } }),
]);
```

### 9.5.2 Drizzle (更轻量)
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

const db = drizzle(pool);
const allUsers = await db.select().from(users).where(eq(users.id, 1));
```

## 9.6 缓存与队列

### 9.6.1 Redis (ioredis)
```javascript
import Redis from 'ioredis';
const redis = new Redis();

await redis.set('key', 'value', 'EX', 60);  // 60s 过期
await redis.get('key');

// 缓存穿透防护
const data = await redis.get(`user:${id}`);
if (!data) {
  const fresh = await db.users.findById(id);
  if (!fresh) {
    await redis.set(`user:${id}`, 'NULL', 'EX', 60);  // 缓存空值
    return null;
  }
  await redis.set(`user:${id}`, JSON.stringify(fresh), 'EX', 300);
  return fresh;
}
return JSON.parse(data);
```

### 9.6.2 BullMQ (任务队列)
```javascript
import { Queue, Worker } from 'bullmq';

const emailQueue = new Queue('email', { connection: redis });

await emailQueue.add('send', { to: 'a@b.c' }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
});

new Worker('email', async (job) => {
  await sendEmail(job.data);
}, { connection: redis });
```

## 9.7 认证与授权

### 9.7.1 JWT
```javascript
import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: 1, role: 'admin' }, SECRET, { expiresIn: '7d' });
const decoded = jwt.verify(token, SECRET);

// Express 中间件
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
```

### 9.7.2 OAuth 2.0
```
授权码模式:
  1. 客户端重定向到授权服务器
  2. 用户登录并授权
  3. 回调到 redirect_uri 携带 code
  4. 后端用 code 换 access_token
  5. 后端用 access_token 调 API
```

### 9.7.3 Session
```javascript
import session from 'express-session';
import RedisStore from 'connect-redis';
import Redis from 'ioredis';

const redis = new Redis();
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  },
}));
```

## 9.8 日志与监控

### 9.8.1 结构化日志 (Pino)
```javascript
import pino from 'pino';
const logger = pino({ level: 'info' });

logger.info({ userId: 1 }, 'user logged in');
logger.error({ err }, 'failed to fetch');
```

### 9.8.2 OpenTelemetry
```javascript
import { trace, SpanStatusCode } from '@opentelemetry/api';
const tracer = trace.getTracer('myapp');

async function handle(req) {
  return tracer.startActiveSpan('handle', async (span) => {
    try {
      const result = await doWork();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

## 9.9 测试

### 9.9.1 Vitest (现代)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('user service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches user', async () => {
    const result = await userService.getById(1);
    expect(result).toMatchObject({ id: 1 });
  });

  it('handles error', async () => {
    await expect(userService.getById(-1)).rejects.toThrow('Not Found');
  });
});
```

### 9.9.2 API 测试 (Supertest)
```javascript
import request from 'supertest';
import { app } from './app';

test('GET /api/users', async () => {
  const res = await request(app).get('/api/users');
  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Array);
});
```

## 9.10 SSR 基础

### 9.10.1 React SSR
```javascript
import { renderToString } from 'react-dom/server';

app.get('*', (req, res) => {
  const html = renderToString(<App />);
  res.send(`
    <!DOCTYPE html>
    <html><body><div id="root">${html}</div></body></html>
  `);
});
```

### 9.10.2 完整 SSR (Next.js)
```typescript
// app/page.tsx (Server Component)
export default async function Page() {
  const data = await fetch('https://api.example.com/data');
  const json = await data.json();
  return <div>{json.title}</div>;
}
```

### 9.10.3 流式 SSR
```javascript
import { renderToPipeableStream } from 'react-dom/server';

app.get('*', (req, res) => {
  const stream = renderToPipeableStream(<App />, {
    onShellReady() {
      res.setHeader('Content-Type', 'text/html');
      stream.pipe(res);
    }
  });
});
```

## 9.11 Serverless

### 9.11.1 Vercel Functions
```typescript
// api/users.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  res.json([{ id: 1, name: 'A' }]);
}
```

### 9.11.2 Cloudflare Workers
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return Response.json({ msg: 'Hello from Edge' });
  }
};
```

### 9.11.3 冷启动优化
- 减少依赖
- 用 ESM
- Lazy import
- 避免顶层 await
- 选用轻量框架(Hono、SvelteKit)

## 9.12 构建工具与 Node

### 9.12.1 Node 性能优化
```bash
# 使用最新 LTS (Node 20+)
node --version

# 内存限制
node --max-old-space-size=4096 server.js

# 性能分析
node --prof app.js
node --prof-process isolate-*.log > processed.txt

# 火焰图
0x -P 'node --perf-basic-prof-only-functions app.js' --output-dir ./flame
```

### 9.12.2 集群模式
```javascript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
  cluster.on('exit', () => cluster.fork());
} else {
  import('./server.js');
}
```

### 9.12.3 PM2 部署
```bash
npm install -g pm2
pm2 start app.js -i max  # 集群模式
pm2 save
pm2 startup
```

## 9.13 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 同步 fs | 阻塞事件循环 | 用 fs.promises |
| 错误未捕获 | 进程崩溃 | unhandledRejection + try/catch |
| 内存泄漏 | OOM | 监控 heap、避免大对象闭包 |
| 路由同步执行 | 慢 | 异步处理 |
| N+1 查询 | 慢 | 用 include / 批量查询 |
| 无超时 | 慢请求堆积 | 加 timeout 中间件 |
| 日志打印大对象 | 内存峰值 | 脱敏 + 采样 |
| 硬编码密钥 | 泄露 | env + 密钥管理 |
| 同步阻塞循环 | 卡 UI | Worker Threads |
| 跨域未配 | 请求失败 | CORS 中间件 |

## 9.14 实战项目

### 🎯 项目 1: REST API 服务 (Express + Prisma + JWT)
要求:
- 用户注册/登录(密码 bcrypt)
- JWT 认证中间件
- CRUD 接口
- 数据校验 (Zod)
- 错误归一化
- 日志 (Pino)
- 单元测试 + API 测试

### 🎯 项目 2: 实时聊天 (WebSocket + Redis)
要求:
- 多用户实时消息
- 房间管理
- 消息持久化
- 在线状态
- 历史记录

### 🎯 项目 3: SSR + ISR 框架 (迷你 Next.js)
要求:
- 文件路由
- 服务端渲染
- 客户端水合
- 数据获取
- 部署到 Vercel

## ✅ 本章检查清单

- [ ] Node 事件循环 6 阶段能画
- [ ] CJS / ESM 互操作会做
- [ ] fs/path/stream/buffer 流式 API 熟练
- [ ] Worker Threads / child_process 知道何时用
- [ ] Express/Fastify 能写中间件
- [ ] Prisma/Redis/JWT 集成用过
- [ ] 部署到 Serverless / PM2
- [ ] 完成 3 个实战项目

**下一章:** → [10-Build-Toolchain.md](./10-Build-Toolchain.md)