# 22 · IPC 类型生成器与端到端类型安全

> 上一章我们用 `IpcContract` interface 完成 IPC 调用层面的类型安全。但它还停留在**手动维护**——契约改一次，preload 同步改一次，主进程改一次，渲染层改一次。**人工迟早会出错**。这一章我们讲"如何用 codegen 自动生成 IPC 契约"，让所有层从同一个 schema 自动产出。

**阅读目标**：

- 看到任何 Electron 项目的 IPC，都能想到"它能不能 codegen"。
- 在你的项目里实现一次"PR 改 schema，**所有 layer 自动类型安全**"。

---

## 22.1 为什么需要 codegen

### 22.1.1 人工维护 IPC 契约的痛苦

```ts
// ❌ 人工维护
type IPCContract = {
  'note.create': (req: NoteCreateReq) => Promise<UUID>;
  'note.delete': (req: { id: UUID }) => Promise<boolean>;
};

// 手动 sync:
ipcMain.handle('note.create', (e, req: NoteCreateReq) => ...)
contextBridge.exposeInMainWorld({ invoke('note.create', req): ... })
```

每次加一个 channel：
- preload contextBridge 加一行；
- main 加 zod schema + handler;
- 契约 interface 加一行；
- 渲染层要 import 对应 type。

**我们怎样让它最少出错的**？

### 22.1.2 codegen 思路

```text
1 个 schema 文件（YAML / TS / Zod）
   ↓
↓
↓
main:    一份 IPC handlers 骨架（zod schema）
preload: 一份 contextBridge
rendere: 一份类型化 wrapper
所有 layer 唯一来源 (SSoT) = schema 文件
```

---

## 22.2 用 Zod 作为唯一来源

### 22.2.1 `ipc-schema.ts`

```ts
import { z } from 'zod';

export const IpcSchemas = {
  'notes.list': {
    request: z.object({ q: z.string().optional(), limit: z.number().int().optional() }),
    response: z.array(z.any()),   // 真实用 NoteSchema
  },
  'notes.create': {
    request: z.object({ title: z.string().min(1).max(256), content: z.string().optional() }),
    response: z.string().uuid(),
  },
  // ...
} as const;

export type IpcChannel = keyof typeof IpcSchemas;
```

### 22.2.2 自动生成 IPC contract 类型

```ts
import type { z } from 'zod';
import type { IpcSchemas } from './ipc-schema';

type InferReq<S extends { request: z.ZodTypeAny }> = z.infer<S['request']>;
type InferRes<S extends { response: z.ZodTypeAny }> = z.infer<S['response']>;

export type IpcRequestMap = {
  [C in keyof typeof IpcSchemas]: InferReq<(typeof IpcSchemas)[C]>;
};

export type IpcResponseMap = {
  [C in keyof typeof IpcSchemas]: InferRes<(typeof IpcSchemas)[C]>;
};

export type IpcRequest<C extends keyof IpcRequestMap> = IpcRequestMap[C];
export type IpcResponse<C extends keyof IpcResponseMap> = IpcResponseMap[C];
```

> `z.infer` 让所有类型"自动"从 schema 来，不需手维护。

### 22.2.3 在 main 用 schema 直接注册

```ts
import { IpcSchemas, type IpcChannel } from '@core/ipc-schema';

const handlers: {
  [C in IpcChannel]: (req: z.infer<(typeof IpcSchemas)[C]['request']>) =>
    Promise<z.infer<(typeof IpcSchemas)[C]['response']>>;
} = {
  'notes.list': async (req) => repos.notes.list(req.q),
  'notes.create': async (req) => repos.notes.create(req),
};

export function setupIpc() {
  for (const ch of Object.keys(IpcSchemas) as IpcChannel[]) {
    ipcMain.handle(ch, async (event, raw) => {
      // schema 校验 - 自动
      const parsed = IpcSchemas[ch].request.parse(raw);
      return handlers[ch](parsed as never);
    });
  }
}
```

### 22.2.4 在 preload 生成类型化 API

```ts
import type { IpcRequest, IpcResponse } from '@core/ipc-schema';

async function invoke<C extends keyof IpcRequest>(
  ch: C,
  req: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(ch, req);
}

contextBridge.exposeInMainWorld('api', { invoke });
```

### 22.2.5 在 renderer 用类型化 invoke

```ts
const list = await window.api.invoke('notes.list', { q: 'abc' });
// list 类型 = Note[]
const id = await window.api.invoke('notes.create', { title: 'hi' });
// id 类型 = string
```

---

## 22.3 Trpc-electron 风格的实现

### 22.3.1 `trpc.ts`

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { IpcSchemas } from '@core/ipc-schema';

const t = initTRPC.create();

const noteRouter = t.router({
  list: t.procedure
    .input(IpcSchemas['notes.list'].request)
    .output(IpcSchemas['notes.list'].response)
    .query(({ input }) => repos.notes.list(input.q ?? '')),

  create: t.procedure
    .input(IpcSchemas['notes.create'].request)
    .output(IpcSchemas['notes.create'].response)
    .mutation(({ input }) => repos.notes.create(input)),
});

const appRouter = t.router({
  note: noteRouter,
});
type AppRouter = typeof appRouter;

export { appRouter, AppRouter };
```

### 22.3.2 main 进程加载 trpc

```ts
import { createIPCHandler } from 'electron-trpc/main';

app.whenReady().then(async () => {
  createIPCHandler({ router: appRouter, createContext: () => null });
});
```

### 22.3.3 preload 暴露 trpc client

```ts
import { createTRPCClient } from 'electron-trpc/client';

contextBridge.exposeInMainWorld('api', createTRPCClient<AppRouter>());
```

### 22.3.4 renderer 用法

```tsx
import { createTRPCReact } from '@trpc/react-query';

const trpc = createTRPCReact<AppRouter>();

function Notes() {
  const notes = trpc.note.list.useQuery({ q: '' });
  const create = trpc.note.create.useMutation();

  return (
    <>
      <button onClick={() => create.mutate({ title: 'hi' })}>create</button>
      <pre>{JSON.stringify(notes.data, null, 2)}</pre>
    </>
  );
}
```

> 这是 trpc：**端到端类型安全、运行时校验、自动推断**。

---

## 22.4 自定义 schema 文件

### 22.4.1 YAML schema

```yaml
# ipc-schema.yml
channels:
  notes.list:
    request:
      type: object
      properties:
        q: { type: string }
        limit: { type: integer }
    response:
      type: array
      items: { $ref: '#/definitions/Note' }

  notes.create:
    request:
      type: object
      required: [title]
      properties:
        title: { type: string, minLength: 1, maxLength: 256 }
    response: { type: string, format: uuid }

definitions:
  Note:
    type: object
    required: [id, title, createdAt]
    properties:
      id: { type: string, format: uuid }
      title: { type: string }
      content: { type: string, default: '' }
      tags:
        type: array
        items: { type: string, maxLength: 64 }
      createdAt: { type: string, format: date-time }
      updatedAt: { type: string, format: date-time }
```

### 22.4.2 codegen 工具 `tsx scripts/generate-ipc.ts`

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const schema = yaml.load(fs.readFileSync('ipc-schema.yml', 'utf-8'));
const channels = schema.channels;

// 1) 生成 zod schemas
const zodOut = `import { z } from 'zod';\n\nexport const IpcSchemas = {\n${
  Object.entries(channels)
    .map(([ch, def]) => {
      const req = def.request
        ? `z.object({ ${Object.entries(def.request.properties ?? {})
            .map(([k, v]: any) => `${k}: ${tsToZod(v)}`)
            .join(', ')} })`
        : `z.void()`;
      const res = tsToZod(def.response);
      return `  '${ch}': { request: ${req}, response: ${res} },`;
    })
    .join('\n')
}} as const;\n`;

fs.writeFileSync('packages/core/src/generated/ipc-schema.ts', zodOut);

// 2) 生成 types
const typesOut = `export type IpcChannel = keyof typeof IpcSchemas;\n\n${
  Object.keys(channels)
    .map((ch) => `export type Ipc${camel(ch)}Request = z.infer<typeof IpcSchemas['${ch}']['request']>;`)
    .join('\n')
}`;

fs.writeFileSync('packages/core/src/generated/ipc-types.ts', typesOut);
```

### 22.4.3 pre-build 钩子

```json
{
  "scripts": {
    "generate": "tsx scripts/generate-ipc.ts",
    "prebuild": "pnpm generate"
  }
}
```

---

## 22.5 不同 codegen 工具

| 工具 | 优势 | 劣势 |
|------|------|------|
| 手写 zod | 简单、TS 一手 | 大规模会乱 |
| `trpc-electron` | 完全类型安全 | bundle 体积大 |
| `typed-ipc` | 轻量 | 老 API |
| `electron-trpc/cli` | 代码生成 | 仍在演进 |
| `@electron/remote` | 远程对象 | 仅 main↔renderer |

推荐：手写 zod + 类型反向推断（22.2 节）。

---

## 22.6 实战：手写 codegen

### 22.6.1 `scripts/gen.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'ipc-schemas.ts';
const OUT_TYPES = 'packages/core/src/generated/types.ts';
const OUT_HANDLERS = 'apps/desktop/src/main/generated/handlers.ts';

const src = fs.readFileSync(SRC, 'utf-8');
const exports = src.match(/export const IpcSchemas = \{[\s\S]*?\} as const;/m)?.[0];
if (!exports) throw new Error('no IpcSchemas in source');

const chanNames = [...exports.matchAll(/'(.*?)':/g)].map((m) => m[1]);

// 1) types
const types = chanNames
  .map((ch) => {
    const req = `z.infer<typeof IpcSchemas['${ch}']['request']>`;
    return `export type ${capitalize(camel(ch))}Req = ${req};
export type ${capitalize(camel(ch))}Res = z.infer<typeof IpcSchemas['${ch}']['response']>;`;
  })
  .join('\n');
fs.writeFileSync(OUT_TYPES, `import { z } from 'zod';\n${types}\n`);

// 2) handlers stub
const handlers = chanNames
  .map((ch) => `ipcMain.handle('${ch}', async (e, raw) => {
  const parsed = IpcSchemas['${ch}'].request.parse(raw);
  // TODO: implement
  return IpcSchemas['${ch}'].response.parse(undefined);
});`)
  .join('\n');

fs.writeFileSync(OUT_HANDLERS, `import { ipcMain } from 'electron';
import { IpcSchemas } from '@core/ipc-schema';
${handlers}`);
```

### 22.6.2 watcher

```bash
pnpm i -D chokidar
```

`scripts/watcher.ts`：

```ts
import * as chokidar from 'chokidar';

chokidar
  .watch(['ipc-schemas.ts', 'packages/core/src/domain/**/*.ts'], { persistent: true })
  .on('change', (path) => {
    console.log('schema changed, regenerating IPC...');
    execSync('tsx scripts/gen.ts', { stdio: 'inherit' });
    console.log('done.');
  });
```

`package.json`：

```json
"scripts": {
  "dev:ipc": "tsx scripts/watcher.ts",
  "predev": "pnpm dev:ipc &"
}
```

---

## 22.7 端到端实战：100 个 IPC 的项目

### 22.7.1 第一次建表

YAML / TS / 手写都 OK。保持**单一文件**。

### 22.7.2 改 schema

```ts
// 之前
'notes.create': {
  request: z.object({ title: z.string() }),
  response: z.string(),
};

// 之后
'notes.create': {
  request: z.object({
    title: z.string().min(1).max(256),
    content: z.string().max(1_000_000).optional(),
    tags: z.array(z.string()).max(32).optional(),
  }),
  response: z.string(),
};
```

### 22.7.3 自动

1. 运行 `pnpm codegen`，重新生成 types + handlers。
2. `preload/index.d.ts` 同步。
3. renderer `window.api.invoke('notes.create', ...)` 类型会变。
4. 在 TS 严格模式下编译会报错，告诉你"哪里还没更新"。

> 这是 TS + zod 让 IPC 的"改 schema 不出错"奇迹般的"傻瓜式"。

---

## 22.8 验证清单

```markdown
### IPC codegen 验证

- [ ] 改 schema -> codegen 自动更新所有 layer
- [ ] TS 严格模式下，旧调用会报错
- [ ] 运行时 zod schema 校验
- [ ] main 端不需要手写 zod 校验
- [ ] preload 仅暴露一个 invoke 函数
- [ ] renderer 端类型安全（IDE 自动补全）
```

---

## 22.9 总结

IPC 类型生成是"工程级类型安全"的标准动作。如果你的 Electron 项目超过 30 个 IPC channel，这章 100% 适用。

这套机制让你**一次定义、永远同步**——这是大型 Electron 工程能持续维护的根本原因。

---

下一章 [23 · 完整可跑 monorepo 启动指南](./../23-monorepo-launch-guide/README.md)。
