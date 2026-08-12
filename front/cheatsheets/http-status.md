# HTTP 状态码速查

## 1xx 信息
```
100 Continue           继续发送请求体
101 Switching Protocols 协议切换(WS)
102 Processing         WebDAV
103 Early Hints        提前提示资源
```

## 2xx 成功
```
200 OK                  请求成功
201 Created             已创建(POST)
202 Accepted            已接受(异步)
203 Non-Authoritative   非权威信息
204 No Content          无内容(成功但不返回)
205 Reset Content       重置内容
206 Partial Content     部分内容(分块)
207 Multi-Status        WebDAV
```

## 3xx 重定向
```
300 Multiple Choices    多重选择
301 Moved Permanently   永久移动(GET,缓存)
302 Found               临时移动(方法可能改变)
303 See Other           强制 GET
304 Not Modified        未修改(缓存命中)
305 Use Proxy           已废弃
307 Temporary Redirect  临时重定向(保留方法)
308 Permanent Redirect 永久重定向(保留方法)
```

## 4xx 客户端错误
```
400 Bad Request             请求错误
401 Unauthorized            未认证
402 Payment Required        已废弃
403 Forbidden               禁止访问
404 Not Found                未找到
405 Method Not Allowed       方法不允许
406 Not Acceptable          不可接受
407 Proxy Authentication    代理认证
408 Request Timeout          请求超时
409 Conflict                 冲突
410 Gone                     永久消失
411 Length Required          需要 Content-Length
412 Precondition Failed      前提条件失败
413 Payload Too Large        请求体过大
414 URI Too Long             URL 过长
415 Unsupported Media Type   不支持的媒体类型
416 Range Not Satisfiable    范围不满足
417 Expectation Failed       期望失败
418 I'm a teapot ☕           彩蛋
421 Misdirected Request      错向请求
422 Unprocessable Entity     不可处理实体
423 Locked                   已锁定
424 Failed Dependency        依赖失败
425 Too Early                太早
426 Upgrade Required         需要升级
428 Precondition Required    需要前提条件
429 Too Many Requests        请求过多(限流)
431 Request Header Fields    请求头过大
451 Unavailable For Legal    法律原因不可用
```

## 5xx 服务端错误
```
500 Internal Server Error   服务器内部错误
501 Not Implemented          未实现
502 Bad Gateway              网关错误
503 Service Unavailable      服务不可用
504 Gateway Timeout          网关超时
505 HTTP Version Not Supported 不支持版本
506 Variant Also Negotiates  变体协商
507 Insufficient Storage     存储不足(WebDAV)
508 Loop Detected            检测到循环
510 Not Extended             未扩展
511 Network Authentication    网络认证
```

## 前端常用关注

### 必处理
```
200  成功
204  无内容成功
301  永久重定向(更新 URL)
302  临时重定向
304  缓存命中
400  参数错误
401  未认证 → 跳转登录
403  无权限
404  资源不存在
409  冲突
422  验证失败
429  限流 → 退避重试
500  服务器错误 → 提示
502  网关错误
503  服务不可用
504  超时
```

### 前后端约定
```typescript
// 推荐: 用 HTTP 状态码表达语义,不用 200 + body
const res = await fetch('/api/users');
if (res.status === 200) {
  const data = await res.json();
} else if (res.status === 401) {
  redirectToLogin();
} else if (res.status === 429) {
  retryWithBackoff();
} else {
  toast('请求失败');
}
```

### 业务状态码 (可叠加)
```json
{
  "code": 0,
  "message": "OK",
  "data": { ... }
}
// code = 0 成功,其他失败
```

### 重定向 vs HSTS
```
301 永久: 浏览器缓存,以后访问直接走新地址
302 临时: 每次都问服务器
307/308 保留原 HTTP 方法的重定向
```