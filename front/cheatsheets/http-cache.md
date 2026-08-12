# HTTP 缓存速查

## 缓存类型

### 强缓存 (不请求)
```
Cache-Control: max-age=3600        # 1 小时
Cache-Control: public              # 任何缓存可存
Cache-Control: private             # 仅浏览器
Cache-Control: no-cache            # 不强缓存,需协商
Cache-Control: no-store            # 不缓存
Cache-Control: s-maxage=3600       # CDN 缓存时间
Cache-Control: immutable           # 不变,Chrome 长期缓存
Cache-Control: must-revalidate     # 过期必须回源
Cache-Control: stale-while-revalidate=600   # 过期后用旧 + 后台更新
```

### 协商缓存 (请求,可能 304)
```
# 请求
If-None-Match: "abc123"
If-Modified-Since: Wed, 15 Jan 2026 12:00:00 GMT

# 响应(命中)
HTTP/1.1 304 Not Modified
ETag: "abc123"
```

## 资源策略

| 资源 | Cache-Control |
|------|---------------|
| 带 hash 静态资源 `app.a1b2c.js` | `public, max-age=31536000, immutable` |
| HTML | `no-cache` |
| API GET (变化少) | `private, max-age=60, stale-while-revalidate=600` |
| API GET (经常变) | `no-cache` |
| 用户敏感数据 | `no-store` |
| 图片 | `public, max-age=2592000` |
| 字体 | `public, max-age=31536000, immutable` |

## Vary
```
Vary: Accept-Encoding    # 按编码分缓存(gzip vs br)
Vary: Origin             # 按 origin 分(跨域)
Vary: User-Agent         # 移动端/桌面分缓存(慎用,爆炸)
```

## ETag 生成
```
# 强 ETag
ETag: "abc123"

# 弱 ETag (字节级别不等,语义等价)
ETag: W/"abc123"

# Apache 默认: 文件大小 + 修改时间
# Nginx 默认: 文件最后修改时间
```

## CDN 缓存控制

```
回源策略:
  • 不缓存带 cookie 的请求
  • 忽略 query string(避免缓存爆炸)
  • 配置可缓存路径白名单

预热: 主动推送资源到边缘节点
刷新: 强制边缘更新(目录刷新 / URL 刷新)
命中率: > 95% 为良好
```

## Service Worker 缓存

```javascript
const CACHE = 'app-v1';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/'])));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
```

## 调试

```bash
# 查看响应头
curl -I https://example.com/app.js

# 强制不缓存
curl -H 'Cache-Control: no-cache' https://example.com

# 模拟条件请求
curl -H 'If-None-Match: "abc123"' https://example.com
curl -H 'If-Modified-Since: Wed, 15 Jan 2026 12:00:00 GMT' https://example.com
```

## 实战模式

### 静态资源
```
app.[contenthash].js → max-age=31536000, immutable
```

### HTML
```
index.html → no-cache (确保更新立即生效)
```

### API
```http
GET /api/users/1
Cache-Control: private, max-age=60, stale-while-revalidate=600

GET /api/feed
Cache-Control: no-cache (经常变)

POST /api/users
Cache-Control: no-store
```

## 命中优先级

```
1. Service Worker 缓存
2. 内存缓存 (memory cache)
3. 磁盘缓存 (disk cache)
4. HTTP 强缓存
5. HTTP 协商缓存
6. 请求网络
```