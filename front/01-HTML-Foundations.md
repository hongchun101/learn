# 01 · HTML 基础与语义化

> HTML 不是"标签的拼凑",它是**文档的结构合同**。专家级 HTML = 正确的语义 + 可访问性 + SEO 友好 + 机器可读。

## 📌 核心心智模型

```
HTML 是给 3 类"读者"看的:
  1. 浏览器 (解析、渲染)
  2. 搜索引擎 (爬虫、索引)
  3. 辅助技术 (屏幕阅读器、盲文显示器)

任何时候,语义 > 视觉。
```

## 1.1 文档骨架与元数据

### 1.1.1 DOCTYPE 与字符集
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="页面描述,150 字以内,SEO 关键">
  <meta name="robots" content="index, follow">
  <title>页面标题 - 站点名</title>
  <link rel="canonical" href="https://example.com/page">
  <link rel="icon" href="/favicon.ico">
  <link rel="alternate" hreflang="en" href="https://example.com/en/page">
</head>
<body>
  <!-- 内容 -->
</body>
</html>
```

**专家陷阱:**
- 没有 `<!DOCTYPE html>` 会进入**怪异模式 (Quirks Mode)**,CSS 盒模型行为变化
- `lang` 属性影响屏幕阅读器发音、字体回退、SEO
- `viewport` 不写 → 移动端体验崩坏

### 1.1.2 Open Graph 与社交分享
```html
<meta property="og:title" content="标题">
<meta property="og:description" content="描述">
<meta property="og:image" content="https://example.com/og.jpg">
<meta property="og:url" content="https://example.com/page">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
```

## 1.2 语义化标签体系

### 1.2.1 文档级语义
```html
<body>
  <header>          <!-- 页面/区块的头部(可多个) -->
    <nav>           <!-- 主导航 -->
      <ul>
        <li><a href="/">Home</a></li>
      </ul>
    </nav>
  </header>

  <main>            <!-- 页面主体,一个页面只一个 -->
    <article>       <!-- 独立可分发的内容 -->
      <header>
        <h1>文章标题</h1>
        <time datetime="2026-01-15">2026-01-15</time>
      </header>
      <section>     <!-- 主题分组 -->
        <h2>章节 1</h2>
        <p>...</p>
      </section>
      <aside>       <!-- 侧边栏/相关补充 -->
        <h3>相关阅读</h3>
      </aside>
    </article>
  </main>

  <footer>          <!-- 页面底部 -->
    <address>联系信息</address>
  </footer>
</body>
```

### 1.2.2 文本级语义
```html
<p>这是 <strong>非常重要</strong> 的内容,不是 <b>视觉上的粗体</b>。</p>
<p>水的化学式是 H<sub>2</sub>O,E = mc<sup>2</sup>。</p>
<p>他说的: <q>你好世界</q>,引自某处。</p>
<blockquote cite="https://example.com">
  块级引用,长文本。
</blockquote>
<p><abbr title="HyperText Markup Language">HTML</abbr> 是...</p>
<p><code>const x = 1;</code> 是代码。</p>
<pre><code>多行
代码</code></pre>
<figure>
  <img src="chart.png" alt="数据图表">
  <figcaption>图 1: 2025 年数据</figcaption>
</figure>
```

**`<strong>` vs `<b>`、`<em>` vs `<i>`**
| 标签 | 语义 | 视觉默认 | 屏幕阅读器 |
|------|------|----------|------------|
| `<strong>` | 重要性 | 粗体 | 重读 |
| `<b>` | 视觉提示 | 粗体 | 不重读 |
| `<em>` | 强调 | 斜体 | 加重语气 |
| `<i>` | 外来语/船名等 | 斜体 | 不重读 |

### 1.2.3 标题层级 (H1-H6)
```html
<h1>页面主标题(每页唯一)</h1>
  <h2>章节</h2>
    <h3>子章节</h3>
      <h4>小节</h4>
  <h2>下一章节</h2>
```

**专家陷阱:**
- 跳级会破坏文档大纲(屏幕阅读器按层级跳转)
- 不要为了 CSS 样式选错层级
- SEO 权重:H1 > H2 > H3

## 1.3 表单 (Forms) 专家级

### 1.3.1 完整表单示例
```html
<form action="/api/submit" method="POST" novalidate>
  <fieldset>
    <legend>个人信息</legend>

    <label for="name">姓名 <span aria-hidden="true">*</span></label>
    <input
      type="text"
      id="name"
      name="name"
      required
      minlength="2"
      maxlength="50"
      autocomplete="name"
      placeholder="请输入姓名"
      aria-describedby="name-hint"
    >
    <small id="name-hint">请输入 2-50 个字符</small>

    <label for="email">邮箱</label>
    <input
      type="email"
      id="email"
      name="email"
      required
      autocomplete="email"
      pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
    >

    <label for="age">年龄</label>
    <input type="number" id="age" name="age" min="0" max="150" step="1">

    <label for="birth">生日</label>
    <input type="date" id="birth" name="birth">

    <label for="bio">简介</label>
    <textarea id="bio" name="bio" rows="4" maxlength="500"></textarea>

    <fieldset>
      <legend>性别</legend>
      <label><input type="radio" name="gender" value="m"> 男</label>
      <label><input type="radio" name="gender" value="f"> 女</label>
    </fieldset>

    <label>
      <input type="checkbox" name="agree" required>
      我同意 <a href="/terms">服务条款</a>
    </label>

    <button type="submit">提交</button>
    <button type="reset">重置</button>
  </fieldset>
</form>
```

### 1.3.2 input 类型全集
```
text, password, email, url, tel, search, number, range
date, time, datetime-local, month, week
color, file, hidden
checkbox, radio
submit, reset, button, image
```

### 1.3.3 验证 API (Constraint Validation)
```javascript
const input = document.querySelector('#email');

input.checkValidity();      // boolean
input.validity.valid;       // 整体是否通过
input.validity.typeMismatch;// 类型不匹配
input.validity.valueMissing;// 必填未填
input.validity.tooShort;    // 太短
input.validity.patternMismatch; // 正则不匹配
input.setCustomValidity('邮箱已被注册'); // 自定义错误
input.reportValidity();     // 触发浏览器原生错误提示
```

**专家技巧:** `novalidate` 关掉原生验证 → 自己实现可定制 UX。

## 1.4 链接、图片、媒体

### 1.4.1 链接
```html
<!-- 外部链接,加 rel 防安全风险 -->
<a href="https://example.com" target="_blank" rel="noopener noreferrer">
  外部链接
</a>

<!-- 下载链接 -->
<a href="/file.pdf" download="文件名.pdf">下载 PDF</a>

<!-- 邮件/电话 -->
<a href="mailto:hi@example.com?subject=Hello">发邮件</a>
<a href="tel:+8613800000000">打电话</a>

<!-- 锚点 -->
<a href="#section-2">跳转到章节 2</a>

<!-- 跳转后页面焦点管理(可访问性) -->
<a href="#main" onclick="document.getElementById('main').focus()">
  跳到主内容
</a>
```

### 1.4.2 图片
```html
<!-- 必须: alt 描述图片内容或功能 -->
<img src="cat.jpg" alt="橘猫在窗台上晒太阳" width="800" height="600">

<!-- 装饰性图片,空 alt 让屏幕阅读器跳过 -->
<img src="decorative-line.png" alt="">

<!-- 复杂图片(图标类) -->
<img src="chart.png" alt="数据图表" role="img" aria-labelledby="chart-title">
<p id="chart-title">2025 年 Q1 销售额增长 20%</p>

<!-- 响应式图片 -->
<img
  srcset="small.jpg 480w, medium.jpg 800w, large.jpg 1200w"
  sizes="(max-width: 600px) 480px, (max-width: 1200px) 800px, 1200px"
  src="medium.jpg"
  alt="..."
  loading="lazy"
  decoding="async"
>
```

**现代图片格式:**
```html
<picture>
  <source srcset="img.avif" type="image/avif">
  <source srcset="img.webp" type="image/webp">
  <img src="img.jpg" alt="...">
</picture>
```

### 1.4.3 视频与音频
```html
<video controls preload="metadata" poster="poster.jpg" width="800">
  <source src="video.mp4" type="video/mp4">
  <source src="video.webm" type="video/webm">
  <track kind="subtitles" src="subs.zh.vtt" srclang="zh" label="中文" default>
  <track kind="captions" src="captions.en.vtt" srclang="en" label="English">
  您的浏览器不支持视频标签。
</video>

<audio controls>
  <source src="audio.mp3" type="audio/mpeg">
</audio>
```

## 1.5 微数据与结构化数据 (Schema.org)

让搜索引擎理解页面内容 → 搜索结果富文本(星级、价格、菜谱等)。

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "前端专家教程",
  "author": {
    "@type": "Person",
    "name": "Your Name"
  },
  "datePublished": "2026-01-15",
  "image": "https://example.com/cover.jpg",
  "publisher": {
    "@type": "Organization",
    "name": "Example Inc",
    "logo": "https://example.com/logo.png"
  }
}
</script>
```

**常见类型:** Article、Product、Recipe、Event、Organization、Person、FAQ、BreadcrumbList、HowTo。

## 1.6 可访问性 (a11y) 基础

### 1.6.1 ARIA 角色与属性
```html
<!-- 角色 -->
<div role="button" tabindex="0" aria-pressed="false">自定义按钮</div>
<div role="navigation" aria-label="主导航">...</div>
<div role="alert">操作成功!</div>

<!-- 状态 -->
<button aria-expanded="false" aria-controls="menu">菜单</button>
<ul id="menu" hidden>...</ul>

<input aria-invalid="true" aria-errormessage="email-error">
<span id="email-error" role="alert">邮箱格式错误</span>

<!-- 标签关联 -->
<button aria-label="关闭" aria-labelledby="close-text">
  <span id="close-text">×</span>
</button>

<!-- 实时区域 -->
<div aria-live="polite" aria-atomic="true">
  <!-- 内容更新时,屏幕阅读器会播报 -->
</div>
```

**ARIA 5 规则:**
1. 不要用 ARIA 重新发明原生语义
2. 优先使用原生 HTML
3. `role` 改了,键盘交互也要跟着改
4. 所有交互元素必须键盘可达
5. 可见标签 > aria-label

### 1.6.2 键盘导航
| 键 | 行为 |
|---|------|
| Tab | 下一个可聚焦元素 |
| Shift+Tab | 上一个 |
| Enter | 激活按钮/链接 |
| Space | 激活按钮/复选框 |
| Esc | 关闭对话框/菜单 |
| 方向键 | 在组件内移动 |

```css
/* 永远不要: */
:focus { outline: none; } /* ❌ */

/* 正确: */
:focus-visible {
  outline: 2px solid #4A90E2;
  outline-offset: 2px;
}
```

## 1.7 性能与最佳实践

### 1.7.1 资源提示 (Resource Hints)
```html
<!-- 预连接,提前建立 TCP/TLS -->
<link rel="preconnect" href="https://api.example.com">
<link rel="dns-prefetch" href="//cdn.example.com">

<!-- 预加载关键资源 -->
<link rel="preload" href="/critical.css" as="style">
<link rel="preload" href="/font.woff2" as="font" crossorigin>

<!-- 预取下一页 -->
<link rel="prefetch" href="/next-page.html">

<!-- 预渲染 -->
<link rel="prerender" href="/likely-next-page">
```

### 1.7.2 加载策略
```html
<!-- 关键 CSS 内联 -->
<style>/* critical CSS */</style>

<!-- 非关键 CSS 异步 -->
<link rel="stylesheet" href="/main.css" media="print" onload="this.media='all'">

<!-- JS 延迟加载 -->
<script src="/app.js" defer></script>
<script src="/widget.js" async></script>
```

### 1.7.3 完整性校验 (SRI)
```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous"
></script>
```

## 1.8 现代 HTML 特性

### 1.8.1 原生 HTML 对话框
```html
<dialog id="myDialog">
  <h2>确认操作</h2>
  <p>您确定要删除吗?</p>
  <button>取消</button>
  <button autofocus>确认</button>
</dialog>

<button onclick="document.getElementById('myDialog').showModal()">
  打开对话框
</button>
```

### 1.8.2 详情/摘要
```html
<details>
  <summary>点击展开</summary>
  <p>隐藏的内容</p>
</details>
```

### 1.8.3 进度条/计量器
```html
<progress value="70" max="100">70%</progress>
<meter value="6" min="0" max="10">6 of 10</meter>
```

### 1.8.4 模板 (Template)
```html
<template id="card-template">
  <article class="card">
    <h3 class="card-title"></h3>
    <p class="card-body"></p>
  </article>
</template>

<script>
  const template = document.getElementById('card-template');
  const clone = template.content.cloneNode(true);
  clone.querySelector('.card-title').textContent = '标题';
  document.body.appendChild(clone);
</script>
```

## 1.9 专家级陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 用 `<div>` + JS 模拟 `<button>` | 键盘不可达,屏幕阅读器无语义 | 用 `<button>` |
| `target="_blank"` 不加 `rel="noopener"` | 性能 + 安全漏洞 | 永远加 `rel="noopener noreferrer"` |
| 表单 `<input>` 不包 `<label>` | 屏幕阅读器读不出字段名 | 始终 `<label for>` 关联 |
| 图片无 `alt` | SEO 受损,a11y 失败 | 装饰图用 `alt=""` |
| `<a href="#">` | 点击跳顶部,JS 报错 | 用 `<button>` 或 `href="javascript:void(0)"` 也不要 |
| `<table>` 做布局 | 语义错误,响应式灾难 | 用 CSS Grid/Flex |
| `<br>` 做间距 | 语义错,样式难改 | 用 `margin/padding` |
| 内联 JS/CSS 太多 | 无法缓存,首屏阻塞 | 外链 + 关键资源内联 |
| 标题跳级 | 屏幕阅读器导航混乱 | H1→H2→H3 严格递进 |
| 没设 `lang` | 屏幕阅读器发音错误 | 根元素必有 `lang` |

## 1.10 实战项目

### 🎯 项目 1: 个人简历页面 (单文件 HTML)
要求:
- 完整的语义化结构(头部、导航、关于、技能、项目、联系)
- 响应式
- WCAG AA 可访问性
- 内嵌 Schema.org 结构化数据
- Open Graph 标签
- 验证: Google Lighthouse a11y/SEO 100 分

### 🎯 项目 2: 博客文章页 (HTML + 微数据)
要求:
- 完整的 `<article>` 结构
- 面包屑导航(BreadcrumbList)
- FAQ 部分用 FAQPage Schema
- 相关阅读用 aside
- 阅读时间估算

## ✅ 本章检查清单

完成前自检:
- [ ] 能在不看提示下写出正确的 HTML5 骨架
- [ ] 区分 `strong/em` 与 `b/i`,知道何时用谁
- [ ] 表单能用原生验证 + ARIA 错误提示
- [ ] 链接/图片所有 a11y 属性正确
- [ ] 看过 Schema.org 文档,能写 Article/Product JSON-LD
- [ ] 看过 WCAG 2.1 AA 速查表
- [ ] 完成 2 个实战项目

**下一章:** → [02-CSS-Core-and-Layout.md](./02-CSS-Core-and-Layout.md)