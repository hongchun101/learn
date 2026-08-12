# 16 · 专家级项目实战

> 本章是整个教程的"毕业设计"。完成这 5 个项目,你就具备**专家级前端工程师**的能力。

## 🎯 项目总览

| # | 项目 | 学到 | 预估时间 |
|---|------|------|----------|
| 1 | [微前端电商平台](#项目-1-微前端电商) | Module Federation / Qiankun / 跨团队协作 | 2 周 |
| 2 | [可视化搭建平台](#项目-2-可视化搭建平台低代码) | Schema 驱动 / 拖拽 / 协议设计 | 2 周 |
| 3 | [实时协作绘图工具](#项目-3-实时协作绘图工具) | CRDT / WebSocket / Canvas | 1.5 周 |
| 4 | [前端监控系统](#项目-4-前端监控系统) | 错误捕获 / 性能监控 / 数据上报 | 1 周 |
| 5 | [完整个人项目](#项目-5-完整个人项目作品集) | 全栈能力展示 / 简历加分 | 1 周 |

---

## 项目 1: 微前端电商平台

### 1.1 目标
构建一个由 4 个独立团队开发的微前端电商平台:
- 主应用(Shell)
- 商品列表微应用
- 购物车微应用
- 用户中心微应用

### 1.2 技术栈
```
• Module Federation (Webpack 5 / Vite)
  或 qiankun (基于 single-spa)
• React 18
• TypeScript
• Vite + esbuild
• pnpm workspace (Monorepo)
```

### 1.3 架构图
```
┌──────────────────────────────────────────────────┐
│                Shell (主应用)                     │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐ │
│  │  Header│ │Sidebar │ │ 路由   │ │ 跨应用通信 │ │
│  └────────┘ └────────┘ └────────┘ └────────────┘ │
└──────────────────┬───────────────────────────────┘
                   │
        ┌──────────┼──────────┬────────────┐
        │          │          │            │
   ┌────▼───┐ ┌────▼───┐ ┌────▼────┐ ┌────▼────┐
   │ Product│ │  Cart  │ │  User   │ │  Order  │
   │  Team  │ │  Team  │ │  Team   │ │  Team   │
   └────────┘ └────────┘ └─────────┘ └─────────┘
   独立部署     独立部署    独立部署     独立部署
```

### 1.4 Module Federation 配置示例

**Shell (主应用):**
```typescript
// vite.config.ts (Shell)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        product: 'http://localhost:5001/assets/remoteEntry.js',
        cart: 'http://localhost:5002/assets/remoteEntry.js',
        user: 'http://localhost:5003/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', 'react-router-dom'],
    }),
  ],
});
```

**Product (子应用):**
```typescript
// vite.config.ts (Product)
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'product',
      filename: 'remoteEntry.js',
      exposes: {
        './ProductList': './src/ProductList.tsx',
        './ProductDetail': './src/ProductDetail.tsx',
      },
      shared: ['react', 'react-dom', 'react-router-dom'],
    }),
  ],
});
```

**Shell 中使用:**
```tsx
import { lazy, Suspense } from 'react';

const RemoteProductList = lazy(() => import('product/ProductList'));
const RemoteCart = lazy(() => import('cart/Cart'));

function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/products" element={
          <Suspense fallback={<Loading />}>
            <RemoteProductList />
          </Suspense>
        } />
        <Route path="/cart" element={
          <Suspense fallback={<Loading />}>
            <RemoteCart />
          </Suspense>
        } />
      </Routes>
    </>
  );
}
```

### 1.5 跨应用通信
```typescript
// event-bus.ts (共享库)
import mitt from 'mitt';
export const bus = mitt();

export type AppEvents = {
  'cart:item-added': { id: number; qty: number };
  'user:login': { userId: number };
  'product:selected': { id: number };
};
```

```tsx
// 在 Product 应用中
import { bus } from '@shared/event-bus';

function ProductList() {
  const select = (id) => bus.emit('product:selected', { id });
}

// 在 Cart 应用中
useEffect(() => {
  bus.on('product:selected', ({ id }) => addToCart(id));
  return () => bus.off('product:selected');
}, []);
```

### 1.6 路由协调
```typescript
// 主应用控制整体路由
// 子应用内部使用 memoryRouter
// 子应用导出 mount/unmount 给主应用

// 子应用代码
export async function mount(props) {
  ReactDOM.render(<App />, props.container);
  props.onGlobalStateChange((state) => {
    // 同步状态
  });
}

export async function unmount(props) {
  ReactDOM.unmountComponentAtNode(props.container);
}
```

### 1.7 验收标准
```
✅ 4 个独立仓库,可独立 npm run dev / build
✅ 主应用能加载所有子应用
✅ 子应用独立部署不影响主应用
✅ 路由跨应用跳转正常
✅ 全局状态在子应用间共享
✅ 性能: 主应用首屏 < 2s
✅ 类型: 子应用导出有完整 TS 类型
✅ 错误隔离: 单个子应用崩溃不影响其他
```

---

## 项目 2: 可视化搭建平台(低代码)

### 2.1 目标
构建一个"拖拽生成页面"的低代码平台,支持:
- 拖拽组件
- 配置属性
- 预览 / 发布
- 生成 JSON Schema

### 2.2 技术栈
```
• React 18
• TypeScript
• DnD Kit (拖拽)
• Zustand (状态)
• Tailwind / CSS Modules
• 自定义渲染引擎
```

### 2.3 架构
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  组件库      │  │  画布        │  │  属性面板     │
│ (Material)  │  │ (DnD)        │  │  (Form)     │
└─────────────┘  └─────────────┘  └─────────────┘
       │                │                │
       └────────────────┴────────────────┘
                        │
              ┌─────────▼─────────┐
              │   单一数据源       │
              │   (Zustand)        │
              │   Schema           │
              └───────────────────┘
```

### 2.4 数据结构
```typescript
// 组件描述
interface ComponentSchema {
  id: string;          // 唯一 ID
  type: string;        // 'button' | 'input' | 'container' | ...
  props: Record<string, any>;
  style: Record<string, string | number>;
  children?: ComponentSchema[];
  events?: Record<string, string>;  // { onClick: 'handler1' }
}

// 页面 Schema
interface PageSchema {
  id: string;
  title: string;
  components: ComponentSchema[];
  dataSources: Record<string, any>;
  actions: Record<string, Function>;
}
```

### 2.5 组件注册
```typescript
// registry.ts
export interface ComponentDefinition {
  type: string;
  name: string;
  icon: string;
  category: string;
  defaultProps: Record<string, any>;
  propsSchema: PropSchema[];
  component: React.FC<any>;
}

export const registry = new Map<string, ComponentDefinition>();

registry.set('button', {
  type: 'button',
  name: '按钮',
  icon: '🔘',
  category: '基础',
  defaultProps: { children: '按钮', variant: 'primary' },
  propsSchema: [
    { key: 'children', label: '文字', type: 'string' },
    { key: 'variant', label: '类型', type: 'select', options: ['primary', 'secondary'] },
  ],
  component: ButtonRenderer,
});
```

### 2.6 渲染引擎
```tsx
// Renderer.tsx
function Renderer({ schema }: { schema: ComponentSchema }) {
  const def = registry.get(schema.type);
  if (!def) return <div>未知组件: {schema.type}</div>;

  const Component = def.component;
  const props = { ...def.defaultProps, ...schema.props };

  return (
    <Component {...props} style={schema.style}>
      {schema.children?.map(child => (
        <Renderer key={child.id} schema={child} />
      ))}
    </Component>
  );
}

export function PageRenderer({ schema }: { schema: PageSchema }) {
  return (
    <>
      {schema.components.map(c => (
        <Renderer key={c.id} schema={c} />
      ))}
    </>
  );
}
```

### 2.7 拖拽实现
```tsx
// Canvas.tsx
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';

function DraggableComponent({ def }: { def: ComponentDefinition }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `palette-${def.type}`,
    data: { type: def.type, source: 'palette' },
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      {def.name}
    </div>
  );
}

function Canvas() {
  const { setNodeRef } = useDroppable({ id: 'canvas' });
  const components = useStore(s => s.components);
  const addComponent = useStore(s => s.addComponent);

  const handleDragEnd = (e) => {
    if (e.over?.id === 'canvas' && e.active.data.current?.source === 'palette') {
      const type = e.active.data.current.type;
      addComponent(type, { x: e.delta.x, y: e.delta.y });
    }
  };

  return (
    <div ref={setNodeRef} onDragEnd={handleDragEnd}>
      {components.map(c => <Renderer key={c.id} schema={c} />)}
    </div>
  );
}
```

### 2.8 属性面板
```tsx
// PropertiesPanel.tsx
function PropertiesPanel({ schema }: { schema: ComponentSchema }) {
  const def = registry.get(schema.type);
  const updateProps = useStore(s => s.updateProps);

  return (
    <div>
      <h3>属性 - {def?.name}</h3>
      {def?.propsSchema.map(prop => (
        <PropertyEditor
          key={prop.key}
          schema={prop}
          value={schema.props[prop.key]}
          onChange={(v) => updateProps(schema.id, prop.key, v)}
        />
      ))}
    </div>
  );
}

function PropertyEditor({ schema, value, onChange }) {
  switch (schema.type) {
    case 'string': return <input value={value} onChange={e => onChange(e.target.value)} />;
    case 'number': return <input type="number" value={value} onChange={e => onChange(+e.target.value)} />;
    case 'boolean': return <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />;
    case 'select': return <select value={value} onChange={e => onChange(e.target.value)}>...</select>;
    case 'color': return <input type="color" value={value} onChange={e => onChange(e.target.value)} />;
  }
}
```

### 2.9 序列化与反序列化
```tsx
// 保存
const save = () => {
  const json = JSON.stringify(schema, null, 2);
  localStorage.setItem('page', json);
};

// 加载
const load = () => {
  const json = localStorage.getItem('page');
  if (json) setSchema(JSON.parse(json));
};

// 发布为 HTML
const publish = () => {
  const html = `
<!DOCTYPE html>
<html><head>${renderStyles(components)}</head>
<body>${renderToHTML(components)}</body></html>`;
  return html;
};
```

### 2.10 验收标准
```
✅ 拖拽组件到画布生成实例
✅ 选中组件显示属性面板
✅ 修改属性实时反映在画布
✅ 支持嵌套(容器 + 子组件)
✅ 支持撤销/重做
✅ JSON 序列化 / 反序列化
✅ 一键预览 / 发布
✅ 至少 10 种内置组件
✅ 完整的 TypeScript 类型
✅ 单元测试 + E2E 测试
```

---

## 项目 3: 实时协作绘图工具

### 3.1 目标
构建一个支持多人实时协作的绘图工具,类似 Figma / Miro。

### 3.2 技术栈
```
• React 18 + TypeScript
• Canvas / Konva.js
• Y.js (CRDT 库)
• y-websocket (服务端同步)
• WebSocket
• 自建 WebSocket 服务 (Node.js)
```

### 3.3 CRDT 原理
```
CRDT = Conflict-free Replicated Data Type

特点:
  • 无需中心协调
  • 自动合并冲突
  • 最终一致
  • 支持离线操作

Yjs 是主流 CRDT 实现。
每个操作都基于 Lamport 时钟 + 节点 ID,
任意顺序应用都能得到相同结果。
```

### 3.4 数据模型
```typescript
// Y.Doc 共享文档
const ydoc = new Y.Doc();

// Shape 类型
interface Shape {
  id: string;
  type: 'rect' | 'circle' | 'line' | 'pen';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  points?: number[];  // pen 工具
}

// shapes: Y.Array<Shape>
const yShapes = ydoc.getArray<Shape>('shapes');

// 操作
yShapes.push([newShape]);
yShapes.delete(index, 1);
```

### 3.5 Canvas 渲染
```tsx
// Canvas.tsx
import Konva from 'konva';

function Canvas({ ydoc, roomId }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);

  // 订阅 Y.js 变化
  useEffect(() => {
    const yShapes = ydoc.getArray<Shape>('shapes');
    const observer = () => setShapes(yShapes.toArray());
    yShapes.observe(observer);
    setShapes(yShapes.toArray());
    return () => yShapes.unobserve(observer);
  }, [ydoc]);

  // 渲染
  return (
    <Stage width={800} height={600} ref={stageRef}>
      <Layer>
        {shapes.map(shape => <ShapeNode key={shape.id} shape={shape} />)}
      </Layer>
    </Stage>
  );
}
```

### 3.6 WebSocket 服务
```typescript
// server.ts
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const wss = new WebSocketServer({ port: 1234 });
wss.on('connection', (conn, req) => {
  const roomId = req.url?.slice(1) || 'default';
  setupWSConnection(conn, req, { docName: roomId });
});
```

### 3.7 客户端连接
```tsx
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

function useCollaboration(roomId: string) {
  const [ydoc] = useState(() => new Y.Doc());
  const [provider] = useState(() =>
    new WebsocketProvider('ws://localhost:1234', roomId, ydoc)
  );

  useEffect(() => {
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, []);

  return { ydoc, provider };
}
```

### 3.8 多人状态显示
```tsx
function Awareness({ provider }: Props) {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    const update = () => setUsers(Array.from(awareness.getStates().values()));
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [provider]);

  return (
    <div className="users">
      {users.map(u => (
        <span key={u.clientId} style={{ color: u.color }}>
          {u.name}
        </span>
      ))}
    </div>
  );
}
```

### 3.9 历史(撤销/重做)
```typescript
// Y.UndoManager
const yShapes = ydoc.getArray('shapes');
const undoManager = new Y.UndoManager(yShapes, {
  captureTimeout: 500,
});

// 撤销/重做
undoManager.undo();
undoManager.redo();

// 监听变化
undoManager.on('stack-item-added', () => updateUndoButtons());
```

### 3.10 验收标准
```
✅ 多浏览器实时同步
✅ 离线后重新连接自动同步
✅ 撤销/重做
✅ 显示其他用户的光标
✅ 多人不冲突
✅ 至少 5 种绘图工具
✅ 性能: 1000 个 shape 流畅
✅ 数据持久化(IndexedDB)
✅ 完整的 TypeScript 类型
✅ 单元测试 + E2E 测试
```

---

## 项目 4: 前端监控系统

### 4.1 目标
构建一个生产级的前端监控系统:
- JS 错误捕获
- 性能监控(Core Web Vitals)
- 用户行为回放
- 实时告警

### 4.2 技术栈
```
• 客户端 SDK (TypeScript, < 20KB)
• 数据上报服务 (Node.js / Edge Functions)
• 数据存储 (ClickHouse / TimescaleDB / Loki)
• 可视化大盘 (Grafana / 自建)
```

### 4.3 SDK 架构
```
┌─────────────────┐
│  init()          │  入口
├─────────────────┤
│  ErrorTracker   │  JS 错误、Promise、未捕获
│  PerfMonitor    │  Web Vitals、资源、长任务
│  BehaviorTrack  │  点击、滚动、路由
│  SessionRecord │  rrweb 录屏
├─────────────────┤
│  Reporter        │  上报(批量、采样、压缩)
└─────────────────┘
```

### 4.4 错误捕获
```typescript
// ErrorTracker.ts
export class ErrorTracker {
  init(options: { reportUrl: string; appId: string }) {
    // 1. JS 错误
    window.addEventListener('error', (e) => {
      this.report({
        type: 'js_error',
        message: e.message,
        stack: e.error?.stack,
        filename: e.filename,
        line: e.lineno,
        col: e.colno,
      });
    });

    // 2. Promise 拒绝
    window.addEventListener('unhandledrejection', (e) => {
      this.report({
        type: 'unhandled_rejection',
        reason: String(e.reason),
      });
    });

    // 3. 资源加载错误
    window.addEventListener('error', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK') {
        this.report({
          type: 'resource_error',
          tagName: target.tagName,
          src: (target as any).src || (target as any).href,
        });
      }
    }, true);

    // 4. React 错误边界
    window.addEventListener('react-error', (e: any) => {
      this.report({
        type: 'react_error',
        componentStack: e.componentStack,
        error: e.error?.stack,
      });
    });
  }

  // Vue 错误捕获
  captureVueError(app: any) {
    app.config.errorHandler = (err, instance, info) => {
      this.report({
        type: 'vue_error',
        message: String(err),
        info,
      });
    };
  }

  // 主动捕获
  captureError(err: Error, context?: Record<string, any>) {
    this.report({ type: 'manual_error', ...context, message: err.message, stack: err.stack });
  }
}
```

### 4.5 性能监控
```typescript
// PerfMonitor.ts
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

export class PerfMonitor {
  init() {
    onLCP(metric => this.report('web_vital', metric));
    onINP(metric => this.report('web_vital', metric));
    onCLS(metric => this.report('web_vital', metric));
    onFCP(metric => this.report('web_vital', metric));
    onTTFB(metric => this.report('web_vital', metric));

    // 长任务
    this.observeLongTasks();
    // 资源
    this.observeResources();
  }

  private observeLongTasks() {
    const obs = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        if (entry.duration > 50) {
          this.report('long_task', { duration: entry.duration });
        }
      });
    });
    obs.observe({ entryTypes: ['longtask'] });
  }

  private observeResources() {
    const obs = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        this.report('resource', {
          name: entry.name,
          type: entry.initiatorType,
          duration: entry.duration,
          size: entry.transferSize,
        });
      });
    });
    obs.observe({ entryTypes: ['resource'] });
  }

  private report(type: string, data: any) {
    Reporter.send({ type, ...data });
  }
}
```

### 4.6 行为回放 (rrweb)
```typescript
// SessionRecord.ts
import { record } from 'rrweb';

export class SessionRecorder {
  private stopFn: (() => void) | null = null;

  start() {
    this.stopFn = record({
      emit(event) {
        Reporter.send({ type: 'rrweb', event });
      },
      // 排除隐私敏感元素
      maskInputOptions: { password: true, email: true },
      // 采样 10% 用户
      sampling: { mousemove: false, mouseInteraction: true, scroll: 150 },
    });
  }

  stop() {
    this.stopFn?.();
  }
}
```

### 4.7 上报器
```typescript
// Reporter.ts
class Reporter {
  private queue: any[] = [];
  private timer: number | null = null;

  static send(data: any) {
    this.queue.push({ ...data, ts: Date.now(), sessionId: getSessionId(), userId: getUserId() });

    if (this.queue.length >= 10) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 5000);
    }
  }

  static flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.queue.length) return;

    // 采样 10%
    if (Math.random() > 0.1) {
      this.queue.length = 0;
      return;
    }

    const body = JSON.stringify(this.queue);
    this.queue.length = 0;

    // sendBeacon 优先,异步非阻塞
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/monitor', body);
    } else {
      fetch('/api/monitor', { method: 'POST', body, keepalive: true });
    }
  }
}
```

### 4.8 接收服务
```typescript
// api/monitor.ts
export default defineEventHandler(async (event) => {
  const data = await readBody(event);
  // 写入时序数据库
  await tsdb.insert(data);
});
```

### 4.9 可视化大盘
```typescript
// dashboard
// 用 Grafana + ClickHouse,或自建

// 关键指标
// 1. 错误率(JS 错误 / PV)
// 2. Web Vitals 分布
// 3. 慢页面排行
// 4. 错误堆栈聚合
// 5. 用户回放
```

### 4.10 验收标准
```
✅ SDK < 20KB,gzip < 8KB
✅ JS 错误捕获率 95%+
✅ Web Vitals 完整上报
✅ rrweb 用户回放
✅ 批量 + 采样 + 重试
✅ 数据可视化大盘
✅ 实时告警(错误率突增)
✅ 隐私保护(密码脱敏、敏感 URL)
✅ 完整文档
```

---

## 项目 5: 完整个人项目(作品集)

### 5.1 目标
将前面所有能力整合到一个**完整作品集网站**,展示你的全栈能力。

### 5.2 技术栈
```
• Next.js 14 (App Router)
• React 18
• TypeScript
• Tailwind CSS
• MDX (博客)
• Prisma + PostgreSQL
• NextAuth (认证)
• Stripe (支付)
• Vercel (部署)
```

### 5.3 核心功能
```
✅ 主页(展示技能、项目、博客)
✅ 博客系统 (MDX)
✅ 项目展示
✅ 联系表单
✅ 评论系统
✅ 暗色主题
✅ 多语言(中/英)
✅ SEO 优化
✅ RSS / Sitemap
✅ 性能 Lighthouse 95+
```

### 5.4 项目结构
```
my-portfolio/
├── app/
│   ├── layout.tsx
│   ├── page.tsx           # 主页
│   ├── about/
│   ├── blog/
│   │   ├── page.tsx       # 列表
│   │   └── [slug]/page.tsx
│   ├── projects/
│   ├── contact/
│   └── api/
├── components/
├── content/
│   └── blog/*.mdx
├── lib/
├── prisma/
├── public/
└── styles/
```

### 5.5 关键技术点

**SSG + ISR:**
```typescript
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map(p => ({ slug: p.slug }));
}

export default async function Post({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  return <MDX content={post.content} />;
}

export const metadata = {
  title: 'Post Title',
  description: '...',
};
```

**MDX:**
```mdx
---
title: My First Post
date: 2026-01-15
tags: [react, typescript]
---

# Hello

This is content.

<CodeBlock language="ts">
{`const x: number = 1;`}
</CodeBlock>
```

**SEO:**
```typescript
// app/layout.tsx
export const metadata = {
  metadataBase: new URL('https://mysite.com'),
  title: { default: 'My Site', template: '%s | My Site' },
  description: '...',
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: 'https://mysite.com',
    siteName: 'My Site',
  },
};
```

**Web Vitals:**
```typescript
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals(metric => {
    navigator.sendBeacon('/api/analytics', JSON.stringify(metric));
  });
  return null;
}
```

### 5.6 部署
```
1. GitHub 仓库
2. Vercel 自动部署
3. PostgreSQL (Neon / Supabase)
4. 自定义域名
5. CI/CD 自动化测试
6. 监控接入
```

### 5.7 验收标准
```
✅ Lighthouse: Performance 95+, SEO 100, A11y 100
✅ 加载速度 < 2s
✅ 多语言支持
✅ 完整的博客系统
✅ 暗色主题
✅ 响应式
✅ SEO 优化(Schema.org、sitemap、robots)
✅ 部署上线
✅ 自定义域名 + HTTPS
```

---

## 🎓 总结:从专家到领袖

完成所有章节和项目后,你已经具备:

### 硬技能 ✅
```
• HTML/CSS/JS 深度掌握
• React 18 + 并发模式
• Vue3 + 响应式原理
• TypeScript 高级
• Node.js 全栈
• 性能优化专家级
• 测试与质量保障
• 可访问性、安全、国际化
• 微前端、低代码、可视化、CRDT
```

### 软技能 ✅
```
• 架构设计能力
• 跨团队协作(微前端)
• 文档与分享
• 代码评审能力
• 技术选型决策
• 性能意识
• 安全意识
• 业务理解
```

### 行动建议
```
1. 把这 5 个项目做完,部署上线,放入简历
2. 写 5 篇技术博客(每个项目一篇)
3. 找一个开源项目提 PR
4. 持续学习(关注: github trending / Hacker News / Smashing Mag)
5. 加入社区(React/Vue/Node 官方 Discord / 知乎 / 掘金)
6. 分享(内部培训 / 技术大会 / 视频)
```

### 后续成长方向
```
• 资深专家 (P7+) : 深耕某方向(性能/架构/可视化)
• 前端架构师 : 跨团队技术规划
• 技术 Leader : 带团队、做决策
• 独立开发者 / 创业
• 开源贡献者 : 提交 PR 到核心项目
• 技术写作者 : 写书、专栏、课程
```

---

## ✅ 全部章节检查清单

完成后,恭喜你!你已经具备**前端专家**的所有能力。

- [ ] 16 章教程全部学习
- [ ] 5 个专家级项目完成
- [ ] 至少 3 篇技术博客
- [ ] 至少 1 个开源贡献
- [ ] 作品集上线
- [ ] 简历更新
- [ ] 准备面试(下一份 [Interview-Prep.md](./Interview-Prep.md))

🎉 **恭喜,你已经是前端专家了!**

> 真正的专家不是"知道所有答案",而是"能持续学习、解决未知问题"。
> 保持好奇,持续精进。