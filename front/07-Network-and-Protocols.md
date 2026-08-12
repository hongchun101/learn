# 07 · 网络与协议

> 前端的"端"是浏览器,但"前"的数据全在网络上。理解 HTTP/TCP/TLS 让你能解决"为什么慢"、"为什么失败"、"为什么泄漏"。

## 📌 心智模型

```
前端开发者面对的网络层级:
  HTTP/HTTPS  ← 应用层
  TCP / UDP   ← 传输层
  TLS         ← 安全层
  IP          ← 网络层

核心优化思路:
  减少请求数 → HTTP/2 多路复用、合并、雪碧图
  减小体积   → 压缩、minify、图片优化
  缓存复用   → ETag、Cache-Control、Service Worker
  就近访问   → CDN、边缘计算
  并发预取   → preload、prefetch、preconnect
```

## 7.1 HTTP 演进

### 7.1.1 HTTP/1.0 (1996)
- 短连接,每个请求都建立 TCP
- 无 Host 头,虚拟主机麻烦

### 7.1.2 HTTP/1.1 (1997,主流 25+ 年)
- **持久连接** (Keep-Alive): 复用 TCP
- **管线化** (Pipelining): 客户端可并发发送(理论)
- **Transfer-Encoding: chunked**: 流式响应
- **Host 头** 必填

**队头阻塞 (Head-of-line blocking):** 即使管线化,响应仍按顺序。**这是 1.1 最大瓶颈**。

**前端优化 6 招:**
1. 域名分片 (sharding): 浏览器对单域名并发 6 连接,多域名突破
2. 雪碧图 (Sprite): 合并图片
3. CSS Sprites / Data URI
4. 合并 JS/CSS
5. 缓存
6. 按需加载

### 7.1.3 HTTP/2 (2015,主流)
- **二进制分帧**: 帧 + 流,代替文本协议
- **多路复用**: 一个 TCP 连接,多个流并行(彻底解决队头阻塞)
- **头部压缩 (HPACK)**
- **服务器推送 (Server Push)** (已废弃)
- **流优先级**

```
HTTP/1.1: 6 个连接 × 文件 → 串行 / 6 并发
HTTP/2:   1 个连接 × 文件 → 多路复用,任意并发
```

**前端可做:**
- 资源打包到一个 TCP 连接
- 域名收拢(减少 DNS 查询)
- 资源内联
- 优先级 (priority hint `<link importance>`)

### 7.1.4 HTTP/3 (2022,QUIC)
- 基于 UDP,内嵌 TLS 1.3
- 解决 TCP 队头阻塞(独立流)
- 0-RTT 握手
- 连接迁移(网络切换不断开)
- 前端基本透明,服务器端启用

## 7.2 HTTP 报文

### 7.2.1 请求行
```http
GET /api/users?id=1 HTTP/1.1
Host: api.example.com
User-Agent: Mozilla/5.0
Accept: application/json
Accept-Encoding: gzip, br
Accept-Language: zh-CN,zh;q=0.9
Authorization: Bearer xxx
Cookie: session=xxx
Content-Type: application/json
Content-Length: 42

{ "name": "test" }
```

### 7.2.2 响应
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Encoding: gzip
Cache-Control: max-age=3600, public
ETag: "abc123"
Last-Modified: Wed, 15 Jan 2026 12:00:00 GMT
Set-Cookie: session=xxx; HttpOnly; Secure; SameSite=Strict

{"id":1,"name":"A"}
```

## 7.3 缓存策略

### 7.3.1 强缓存
```http
Cache-Control: max-age=3600           # 相对时间
Cache-Control: public                # 任何缓存都可
Cache-Control: private               # 仅浏览器
Cache-Control: no-cache              # 不强缓存,需协商
Cache-Control: no-store              # 不缓存
Cache-Control: s-maxage=3600         # CDN 缓存时间
Cache-Control: immutable             # 不变,长期缓存(Chrome)
```

### 7.3.2 协商缓存
```http
# 请求
If-None-Match: "abc123"
If-Modified-Since: Wed, 15 Jan 2026 12:00:00 GMT

# 响应
HTTP/1.1 304 Not Modified
ETag: "abc123"
```

### 7.3.3 缓存策略选择
| 资源类型 | 策略 |
|----------|------|
| 带 hash 的静态资源 (`app.a1b2c.js`) | `max-age=31536000, immutable` |
| HTML | `no-cache` |
| API GET (变化少) | `private, max-age=60` + `stale-while-revalidate=600` |
| API GET (经常变) | `no-cache` |
| 用户敏感数据 | `no-store` |

### 7.3.4 stale-while-revalidate
```http
Cache-Control: max-age=60, stale-while-revalidate=600
# 0-60s: 命中缓存
# 60-660s: 返回过期缓存,后台异步更新
# >660s: 强制过期
```

## 7.4 CDN

### 7.4.1 工作原理
```
用户 → DNS 解析 → 调度到最近节点 → 边缘缓存返回
```

### 7.4.2 关键概念
- **回源**: 边缘节点未命中,回源站取
- **预热**: 主动推送到边缘
- **刷新**: 强制边缘更新
- **命中率**: 越高越好(目标 >95%)
- **边缘计算**: Cloudflare Workers、Vercel Edge、Lambda@Edge

### 7.4.3 缓存控制
```
CDN 配置:
  • 后缀过滤 /path/* 缓存
  • 不缓存带 cookie 的请求
  • 参数忽略(去除 querystring 影响缓存命中)
  • 自定义回源 HTTP 头
```

## 7.5 DNS

### 7.5.1 解析过程
```
浏览器缓存 → 系统 hosts → 系统 DNS → 路由器 → ISP DNS → 根 → 顶级域 → 权威 DNS
```

### 7.5.2 优化
```html
<link rel="preconnect" href="https://api.example.com">
<link rel="dns-prefetch" href="//cdn.example.com">

<!-- 或者 (现代) -->
<link rel="preconnect" href="https://api.example.com" crossorigin>
```

### 7.5.3 TTL
```bash
dig +short api.example.com
# DNS 记录的缓存时间,过长则更新慢,过短则查询多
```

## 7.6 TCP 与 TLS

### 7.6.1 TCP 三次握手
```
Client → SYN → Server
Client ← SYN+ACK ← Server
Client → ACK → Server
[连接建立]
```

### 7.6.2 TLS 1.3 握手 (0-RTT)
```
Client → ClientHello + key_share →
Server → ServerHello + key_share + Certificate + Finished →
Client → Finished →
[握手完成,后续加密]
```

### 7.6.3 前端优化
- TLS 1.3 比 1.2 少 1 RTT
- 启用 OCSP Stapling(服务端预取证书状态)
- Session Resumption(复用会话)

## 7.7 HTTP 客户端

### 7.7.1 fetch
```javascript
// GET
const res = await fetch('/api/users', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` },
  credentials: 'include',  // 'omit' | 'same-origin' | 'include'
  cache: 'no-cache',       // 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache'
});

// POST
await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'A' }),
});

// 中止
const ctrl = new AbortController();
fetch(url, { signal: ctrl.signal });
ctrl.abort();

// 超时(自实现)
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}
```

### 7.7.2 请求拦截(AbortController)
```javascript
const controller = new AbortController();
const signal = controller.signal;

fetch('/api/a', { signal });
fetch('/api/b', { signal });

// 全部取消
controller.abort();

// 与 addEventListener 集成
el.addEventListener('click', handler, { signal });
```

### 7.7.3 Axios
```javascript
// 拦截器
axios.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${getToken()}`;
  return config;
});
axios.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) redirectToLogin();
    return Promise.reject(err);
  }
);

// 取消
const source = axios.CancelToken.source();
axios.get('/api', { cancelToken: source.token });
source.cancel('User navigated away');
```

### 7.7.4 数据获取库
```javascript
// React Query / SWR
const { data, isLoading, error } = useQuery({
  queryKey: ['users', id],
  queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
  staleTime: 5 * 60 * 1000,
  cacheTime: 30 * 60 * 1000,
});

// TanStack Query 高级
const mutation = useMutation({
  mutationFn: (newUser) => axios.post('/api/users', newUser),
  onSuccess: () => queryClient.invalidateQueries(['users']),
});
```

## 7.8 请求方法与状态码

### 7.8.1 方法语义
```
GET     安全、幂等、可缓存
POST    非幂等,创建资源
PUT     幂等,完整替换
PATCH   非幂等,部分更新
DELETE  幂等,删除
HEAD    同 GET 但无响应体
OPTIONS 预检
```

### 7.8.2 状态码速查
```
1xx: 信息
  100 Continue
  103 Early Hints

2xx: 成功
  200 OK
  201 Created
  204 No Content
  206 Partial Content

3xx: 重定向
  301 Moved Permanently(GET,缓存)
  302 Found(临时,方法可能改变)
  303 See Other(强制 GET)
  304 Not Modified
  307 Temporary Redirect(保留方法)
  308 Permanent Redirect(保留方法)

4xx: 客户端错误
  400 Bad Request
  401 Unauthorized
  403 Forbidden
  404 Not Found
  405 Method Not Allowed
  409 Conflict
  410 Gone
  413 Payload Too Large
  418 I'm a teapot 🎃
  422 Unprocessable Entity
  429 Too Many Requests
  431 Request Header Fields Too Large

5xx: 服务端错误
  500 Internal Server Error
  502 Bad Gateway
  503 Service Unavailable
  504 Gateway Timeout
  507 Insufficient Storage
```

## 7.9 RESTful API 设计

### 7.9.1 资源命名
```
GET    /users              # 列表
GET    /users/1            # 单个
POST   /users              # 创建
PUT    /users/1            # 完整更新
PATCH  /users/1            # 部分更新
DELETE /users/1            # 删除

# 子资源
GET    /users/1/posts
POST   /users/1/posts

# 操作(动词当子资源)
POST   /users/1/login
POST   /orders/1/cancel

# 查询参数
GET /users?role=admin&sort=-createdAt&page=1&limit=20
```

### 7.9.2 GraphQL 简介
```graphql
query {
  user(id: 1) {
    name
    posts(first: 5) {
      title
      likes
    }
  }
}
```
**优势**: 按需取数据,无多余字段
**劣势**: 复杂度高、缓存失效、N+1 问题

### 7.9.3 BFF (Backend For Frontend)
```
Web BFF → 后端服务
Mobile BFF → 后端服务

按端定制 API,聚合多个服务
```

## 7.10 WebSocket

### 7.10.1 协议
- HTTP Upgrade 升级
- 全双工,长连接
- 帧格式: opcode + payload length + payload

### 7.10.2 客户端
```javascript
const ws = new WebSocket('wss://api.example.com/realtime');

ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
ws.onmessage = e => console.log(JSON.parse(e.data));
ws.onclose = () => console.log('closed');
ws.onerror = err => console.error(err);

// 心跳
setInterval(() => ws.readyState === 1 && ws.send('ping'), 30000);

// 重连
function connect() {
  ws = new WebSocket(url);
  ws.onclose = () => setTimeout(connect, 1000);
}
```

### 7.10.3 Server-Sent Events (SSE)
```javascript
// 单向(服务器 → 客户端),适合通知
const es = new EventSource('/api/events');
es.onmessage = e => console.log(e.data);
es.addEventListener('custom', e => {});

// 服务端
res.setHeader('Content-Type', 'text/event-stream');
res.write('data: ' + JSON.stringify(payload) + '\n\n');
```

## 7.11 性能优化:加载层面

### 7.11.1 关键路径
```
HTML → 关键 CSS → 关键 JS → 渲染
```

### 7.11.2 资源优先级
```html
<!-- 最高:关键资源 -->
<link rel="stylesheet" href="critical.css">
<link rel="preload" href="hero.jpg" as="image">
<link rel="preload" href="font.woff2" as="font" crossorigin>

<!-- 高:首屏需要的 -->
<script src="main.js" defer></script>

<!-- 低:延迟加载 -->
<script src="analytics.js" async></script>
<link rel="prefetch" href="next-page.html">
<iframe src="ad.html" loading="lazy">

<!-- 最低:按需 -->
import('./module.js');  // 动态导入
```

### 7.11.3 图片优化
```
格式选择:
  AVIF > WebP > JPEG/PNG
  透明 → PNG 或 WebP
  动画 → WebP/AVIF 或 video

尺寸:
  srcset + sizes(响应式)
  压缩(mozjpeg、oxipng)
  渐进式 JPEG

加载:
  loading="lazy"
  decoding="async"
  fetchpriority="high"  // LCP 图
```

### 7.11.4 字体优化
```html
<!-- 预加载 -->
<link rel="preload" href="font.woff2" as="font" type="font/woff2" crossorigin>

<!-- 字体显示策略 -->
@font-face {
  font-family: 'Inter';
  src: url('Inter.woff2') format('woff2');
  font-display: swap;  /* 立即用 fallback,字体好了切换 */
  /* optional: 仅当 < 100ms 内加载完才用 */
  /* block: 隐藏文字 3s,最大可访问性问题 */
  /* swap: 立即显示 fallback,字体好切换 ✅ */
  /* fallback: 100ms 内隐藏,3s 后切换 */
  /* avoid: 字体没来,就一直隐藏 */
}
```

### 7.11.5 JS 加载策略
```html
<!-- 阻塞:无 -->
<script src="critical.js"></script>  <!-- ❌ 解析时执行,阻塞渲染 -->

<!-- 延迟:DOM 解析完成后执行(顺序)
<script defer src="app.js"></script>

<!-- 异步:下载完立即执行(无序)
<script async src="analytics.js"></script>

<!-- 模块:默认 defer
<script type="module" src="app.js"></script>
```

### 7.11.6 代码分割
```javascript
// 路由分割
const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));

// 组件分割
const HeavyChart = lazy(() => import('./HeavyChart'));

// 厂商分割(React/Vue 单独 chunk)
```

## 7.12 性能指标

### 7.12.1 Core Web Vitals
```
LCP (Largest Contentful Paint)  < 2.5s  (好)
INP (Interaction to Next Paint) < 200ms (好)  // 替代 FID
CLS (Cumulative Layout Shift)   < 0.1   (好)
```

### 7.12.2 其他指标
```
FCP  < 1.8s
TTFB < 800ms
TBT  < 200ms (Total Blocking Time)
SI   < 3.4s (Speed Index)
TTI  < 3.8s
```

### 7.12.3 监控上报
```javascript
// Web Vitals 库
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

onLCP(metric => {
  navigator.sendBeacon('/analytics', JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    rating: metric.rating,
  }));
});
```

## 7.13 安全实践

### 7.13.1 HTTPS 强制
```javascript
// HTTP → HTTPS 重定向
// Strict-Transport-Security 头
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 7.13.2 Cookie 安全
```http
Set-Cookie: session=xxx;
  Path=/;
  Domain=.example.com;
  Expires=...
  Max-Age=...
  HttpOnly          // 防 XSS 读取
  Secure            // 仅 HTTPS
  SameSite=Strict   // 防 CSRF (Lax 较常用)
  Priority=High
  Partitioned       // CHIPS(第三方 cookie)
```

### 7.13.3 头部安全
```http
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=()
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

## 7.14 调试工具

### 7.14.1 Network 面板
```
筛选: XHR, JS, CSS, Img, Media, Font, Doc, WS
查看: 状态、大小、时间线、Waterfall
右键: Copy as cURL, Block request URL, Clear cache
```

### 7.14.2 Chrome DevTools 高级
```
• Throttling: Slow 3G、4G 模拟
• Disable cache
• Block request domains
• Override User-Agent
• Request blocking: 自定义规则
• HAR 导出
```

### 7.14.3 curl 实战
```bash
# GET
curl -X GET https://api.example.com/users

# POST + Headers + Body
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer xxx" \
  -d '{"name":"A"}'

# 详细模式
curl -v https://api.example.com/users 2>&1 | head -50

# 跟随重定向
curl -L https://example.com

# 仅头部
curl -I https://example.com

# 测速
curl -o /dev/null -w "Time: %{time_total}s\n" https://example.com
```

## 7.15 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 不设 Cache-Control | 反复请求 | 强缓存 + 协商 |
| GET 带敏感数据 | URL 日志暴露 | 用 POST + Body |
| Cookie 没 HttpOnly | XSS 可读 | 全设 HttpOnly |
| API 跨域无 CORS | 失败 | 配服务端 CORS |
| WebSocket 不重连 | 网络断了 | 自动重连 |
| 上传不限制大小 | 服务端炸 | 客户端预检 |
| HTTPS 页面请求 HTTP | Mixed Content | 全 HTTPS |
| DNS 域名太多 | 解析慢 | 收敛 + 预解析 |
| 不用 CDN | 慢 | 边缘节点 |
| WS 不心跳 | 断开不知 | 心跳 + 重连 |

## 7.16 实战项目

### 🎯 项目 1: 完整 REST 客户端 SDK
要求:
- 完整的 TypeScript 类型
- 请求/响应拦截器
- 重试 + 退避
- 取消(AbortController)
- 错误归一化
- 缓存层
- 单元测试

### 🎯 项目 2: WebSocket 实时客户端
要求:
- 自动重连(指数退避)
- 心跳
- 消息队列(断开时缓存)
- 类型化协议
- React Hook 封装

### 🎯 项目 3: 图片懒加载 + 渐进式
要求:
- IntersectionObserver 触发
- srcset 响应式
- 渐进式 JPEG / LQIP(低质量占位)
- 缓存持久化

## ✅ 本章检查清单

- [ ] HTTP/1.1 vs HTTP/2 vs HTTP/3 差异能讲清
- [ ] 强缓存/协商缓存能配
- [ ] CSP、Cookie 安全策略会写
- [ ] CDN / DNS / 预连接会用
- [ ] WebSocket / SSE / 长轮询 选型
- [ ] Core Web Vitals 监控能做
- [ ] 完成 3 个实战项目

**下一章:** → [08-TypeScript-Mastery.md](./08-TypeScript-Mastery.md)