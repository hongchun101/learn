# 15 · 可访问性、安全、国际化

> 这三个是**生产级前端必备**。可访问性=尊重所有用户,安全=保护所有用户,国际化=服务全球用户。

## 📌 心智模型

```
WCAG 2.1 AA 标准 = 现代前端的基本要求
OWASP Top 10 = 前端安全的必知
i18n + l10n = 全球化产品的标配
```

## 15.1 可访问性 (Accessibility, a11y)

### 15.1.1 WCAG 4 大原则
```
1. Perceivable   (可感知) — 信息可被用户感知
2. Operable      (可操作) — 界面可操作
3. Understandable(可理解) — 信息和操作可理解
4. Robust        (健壮) — 兼容各种辅助技术
```

### 15.1.2 语义化 HTML(基础)
```html
<!-- ❌ div 一锅端 -->
<div onclick="go()">点击</div>

<!-- ✅ 语义化 -->
<button onclick="go()">点击</button>

<!-- ❌ 链接当按钮 -->
<a href="javascript:void(0)" onclick="submit()">提交</a>

<!-- ✅ button -->
<button onclick="submit()">提交</button>
```

### 15.1.3 ARIA 属性
```html
<!-- 角色 -->
<nav role="navigation" aria-label="主导航">
<div role="alert">操作成功</div>
<div role="dialog" aria-modal="true" aria-labelledby="title">
  <h2 id="title">标题</h2>
</div>

<!-- 状态 -->
<button aria-expanded="false" aria-controls="menu">菜单</button>
<input aria-invalid="true" aria-errormessage="err">
<span id="err" role="alert">错误信息</span>

<!-- 实时区域 -->
<div aria-live="polite"> <!-- 礼貌更新 -->
<div aria-live="assertive"> <!-- 立即更新 -->
<div aria-atomic="true"> <!-- 完整朗读 -->

<!-- 隐藏(屏幕阅读器不可见) -->
<span class="sr-only">仅屏幕阅读器</span>
```

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### 15.1.4 键盘导航
```
Tab          → 下一个
Shift+Tab    → 上一个
Enter        → 激活
Space        → 切换(按钮/复选框)
Esc          → 关闭
方向键        → 组件内导航
Home / End   → 头/尾

要求:
  • 所有交互 Tab 可达
  • Tab 顺序符合视觉
  • 焦点可见(:focus-visible)
  • 跳转锚点更新焦点
```

### 15.1.5 焦点管理
```javascript
// 对话框打开:焦点入内
const dialog = document.querySelector('[role="dialog"]');
const focusable = dialog.querySelectorAll(
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
);
const first = focusable[0];
const last = focusable[focusable.length - 1];

dialog.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  if (e.key === 'Escape') dialog.close();
});

dialog.showModal();
first.focus();
```

### 15.1.6 表单可访问性
```html
<label for="email">邮箱 <span aria-hidden="true">*</span></label>
<input
  type="email"
  id="email"
  name="email"
  required
  aria-required="true"
  aria-describedby="email-hint email-err"
>
<div id="email-hint">请使用常用邮箱</div>
<div id="email-err" role="alert">{errors.email}</div>
```

### 15.1.7 颜色与对比
```css
/* WCAG AA 标准:
   - 普通文本对比度 ≥ 4.5:1
   - 大文本对比度 ≥ 3:1
*/
body {
  background: #fff;
  color: #333;  /* 对比度 12.6:1 ✅ */
}

/* 不依赖颜色传达信息 */
.error {
  color: red;
  border-left: 4px solid red;  /* 同时有图标/边框 */
}

/* 不仅用 hover 显示信息 */
.tooltip {
  /* 触摸设备无 hover → 同时点击/聚焦 */
}
```

### 15.1.8 媒体替代
```html
<!-- 图片 -->
<img src="cat.jpg" alt="橘猫在窗台">

<!-- 装饰图空 alt -->
<img src="line.png" alt="">

<!-- 复杂图 -->
<img src="chart.png" alt="数据图" role="img" aria-labelledby="chart-title">
<p id="chart-title">2025 Q1 销售增长 20%</p>

<!-- 视频字幕 -->
<video>
  <source src="vid.mp4">
  <track kind="captions" src="zh.vtt" srclang="zh" default>
</video>
```

### 15.1.9 测试工具
```bash
# 自动化
npm i -D axe-core @axe-core/react  # 或 @axe-core/vue

# Chrome DevTools → Lighthouse → Accessibility
# Chrome DevTools → Elements → Accessibility 面板

# 屏幕阅读器
# - macOS: VoiceOver (cmd + F5)
# - Windows: NVDA (免费) / Narrator
# - Linux: Orca

# 仅键盘
# 拔鼠标,用 Tab/Enter 测试所有交互
```

### 15.1.10 常见 a11y 库
```tsx
// Radix UI / Headless UI (无样式 + 全 a11y)
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';

// React Aria (Adobe)
import { useButton, useDialog } from 'react-aria';

// Vue Headless UI
import { Dialog, DialogPanel } from '@headlessui/vue';
```

## 15.2 安全 (Security)

### 15.2.1 OWASP Top 10 (Web 视角)

```
A01 访问控制失效 (Broken Access Control)
A02 加密失效 (Cryptographic Failures)
A03 注入 (Injection) - XSS, SQL, LDAP
A04 不安全设计 (Insecure Design)
A05 安全配置错误 (Security Misconfiguration)
A06 脆弱组件 (Vulnerable Components)
A07 认证失效 (Auth Failures)
A08 软件数据完整性 (Software Integrity)
A09 日志监控 (Logging Failures)
A10 SSRF (服务端请求伪造)
```

### 15.2.2 XSS (跨站脚本)

**类型:**
```
反射型: URL 参数 → 立即执行
存储型: 存到 DB → 所有用户触发
DOM 型: 前端代码不当使用 DOM API
```

**防御:**
```javascript
// 1. 永远不直接用 innerHTML
// ❌
element.innerHTML = userInput;

// ✅
element.textContent = userInput;
element.innerHTML = DOMPurify.sanitize(userInput);

// 2. 模板引擎自动转义
// React JSX: 自动转义 {userInput}
// Vue: 默认转义 {{ userInput }}

// 3. URL 处理
const url = new URL(userInput);
if (url.protocol === 'https:') {
  link.href = url.toString();
}

// 4. CSP
// Content-Security-Policy: default-src 'self'; script-src 'self'
```

### 15.2.3 CSRF (跨站请求伪造)

**防御:**
```http
# 1. SameSite Cookie (现代主流)
Set-Cookie: session=xxx; SameSite=Strict  # 或 Lax

# 2. CSRF Token
<form>
  <input type="hidden" name="_csrf" value="${csrfToken}">
</form>

# 3. Origin / Referer 校验
if (request.headers.origin !== 'https://example.com') reject;

# 4. 双重提交 Cookie
# Cookie + 请求头同时带 token
```

### 15.2.4 点击劫持

```http
# X-Frame-Options (老)
X-Frame-Options: DENY  # 拒绝任何 iframe
X-Frame-Options: SAMEORIGIN

# CSP frame-ancestors (新)
Content-Security-Policy: frame-ancestors 'none'
```

### 15.2.5 CSP (内容安全策略)

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}' 'strict-dynamic';
  style-src 'self' 'unsafe-hashes' 'sha256-...';
  img-src 'self' https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
```

**Nonce 方案:**
```html
<script nonce="${nonce}">/* 受信任 */</script>
<!-- 每次渲染生成新随机 nonce -->
```

### 15.2.6 第三方依赖安全

```bash
# npm audit
npm audit

# 自动修复
npm audit fix

# Snyk
npm i -g snyk
snyk test

# Dependabot (GitHub)
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    schedule:
      interval: "weekly"
```

### 15.2.7 头部安全

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

### 15.2.8 敏感数据

```javascript
// ❌ 客户端硬编码密钥
const API_KEY = 'sk_live_xxxxxx';

// ✅ 走后端代理
// 前端调 /api/proxy, 后端转发并加密钥

// localStorage 不存敏感数据
// ❌ localStorage.setItem('token', token);  // XSS 可读
// ✅ httpOnly Cookie

// 日志脱敏
logger.info({
  userId: user.id,
  email: maskEmail(user.email),  // a***@b.com
});
```

### 15.2.9 OAuth / JWT 安全

```javascript
// JWT 在 localStorage 不安全
// 推荐: httpOnly Cookie + CSRF 防护

// JWT 必须验签
const { verify } = require('jsonwebtoken');
const decoded = verify(token, PUBLIC_KEY, {
  algorithms: ['RS256'],  // 强制算法,防 alg none 攻击
  issuer: 'example.com',
  audience: 'example-app',
});
```

### 15.2.10 常见错误

| 攻击 | 漏洞 | 防御 |
|------|------|------|
| XSS | innerHTML 拼接 | textContent + sanitize |
| CSRF | GET 改状态 + SameSite=None | Token + SameSite |
| SSRF | 前端传 URL 给后端 fetch | 白名单 |
| 点击劫持 | 页面被 iframe 嵌套 | X-Frame-Options |
| 中间人 | HTTP | HTTPS + HSTS |
| 注入 | eval/Function | 禁用 eval |
| 文件上传 | 上传到 Web 可访问目录 | 存 OSS,重命名,验 mime |

## 15.3 国际化 (i18n / l10n)

### 15.3.1 概念
```
i18n (Internationalization): 国际化 = 框架支持多语言
l10n (Localization): 本地化 = 具体到某语言的翻译/格式

涉及:
  • 文案翻译
  • 日期/数字/货币格式
  • 时区
  • 文字方向 (LTR/RTL)
  • 复数形式
  • 排序规则
```

### 15.3.2 React Intl (FormatJS)
```tsx
import { IntlProvider, FormattedMessage, useIntl } from 'react-intl';

import zh from './locales/zh.json';
import en from './locales/en.json';

<IntlProvider locale="zh" messages={zh}>
  <App />
</IntlProvider>

function App() {
  const intl = useIntl();
  return (
    <>
      <FormattedMessage id="greeting" values={{ name: 'A' }} />
      <p>{intl.formatDate(new Date(), { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p>{intl.formatNumber(1234.56, { style: 'currency', currency: 'CNY' })}</p>
      <p>{intl.formatRelativeTime(-3, 'hour')}</p>
    </>
  );
}
```

### 15.3.3 i18next
```tsx
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: require('./locales/en.json') },
    zh: { translation: require('./locales/zh.json') },
  },
  lng: 'zh',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

function App() {
  const { t, i18n } = useTranslation();
  return (
    <>
      <button onClick={() => i18n.changeLanguage('en')}>EN</button>
      <p>{t('welcome', { name: 'A' })}</p>
      <p>{t('itemCount', { count: 0 })}</p>
      <p>{t('itemCount', { count: 1 })}</p>
      <p>{t('itemCount', { count: 5 })}</p>
    </>
  );
}
```

```json
// locales/zh.json
{
  "welcome": "欢迎, {{name}}",
  "itemCount": "{{count}} 个项目",
  "itemCount_other": "{{count}} 个项目"
}
```

### 15.3.4 ICU MessageFormat
```
复杂复数:
{count, plural, 
  one {# item}
  other {# items}
}

选择:
{gender, select, 
  male {他的}
  female {她的}
  other {它的}
}

日期:
{date, date, full}      → 2026年1月15日 星期三
{date, time, short}     → 14:30

数字:
{num, number, #.##}     → 1,234.56
{price, number, currency} → ¥1,234.56
```

### 15.3.5 路由与懒加载
```tsx
// React Router + i18n
const routes = {
  en: { home: () => import('./pages/en/Home') },
  zh: { home: () => import('./pages/zh/Home') },
};

const locale = detectLocale();
const Home = lazy(routes[locale].home);
```

### 15.3.6 日期/数字 (Intl API)
```javascript
new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' })
  .format(1234.56);  // ¥1,234.56

new Intl.DateTimeFormat('en-US', { dateStyle: 'full' })
  .format(new Date());  // Wednesday, January 15, 2026

new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
  .format(-1, 'day');  // 昨天
```

### 15.3.7 RTL 支持
```css
/* 逻辑属性代替方向属性 */
.box {
  margin-inline-start: 10px;  /* LTR: left, RTL: right */
  padding-inline-end: 20px;    /* LTR: right, RTL: left */
  inset-inline-start: 0;       /* LTR: left, RTL: right */
}

/* 方向感知的图标(箭头) */
.arrow {
  transform: scaleX(1);  /* LTR: 右 */
}
[dir="rtl"] .arrow {
  transform: scaleX(-1);  /* RTL: 左 */
}
```

```html
<html lang="ar" dir="rtl">
```

### 15.3.8 时区处理
```javascript
// 后端存 UTC
// 前端按用户时区显示
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// 'Asia/Shanghai'

const date = new Date('2026-01-15T12:00:00Z');
new Intl.DateTimeFormat('zh-CN', {
  timeZone: tz,
  dateStyle: 'full',
  timeStyle: 'short',
}).format(date);
```

### 15.3.9 翻译工作流
```
1. 提取文案 (i18next-scanner / babel-plugin-i18next)
   ↓
2. 翻译(手动 / Crowdin / Lokalise / Phrase)
   ↓
3. 集成(开发时引用 key)
   ↓
4. 审核(QA 各语言版本)
   ↓
5. 部署
```

### 15.3.10 实践清单
```
✅ 用户切换语言立即生效
✅ 文案不在代码中硬编码
✅ 日期/数字用 Intl API
✅ RTL 测试
✅ 字体回退(中文/西文/阿拉伯文)
✅ 文本长度差异(德语通常比英语长 30%)
✅ emoji 和图标在不同文化含义不同
✅ 避免图片嵌入文字(翻译难)
✅ 复数形式
✅ 货币/地址格式
```

## 15.4 专家陷阱清单

### a11y
| 陷阱 | 解决 |
|------|------|
| 用 div + click 模拟按钮 | 用 <button> |
| 焦点环移除(:focus { outline: none }) | 用 :focus-visible |
| 表单无 label | 始终 label 关联 |
| 图片无 alt | 装饰空 alt,内容必填 |
| 仅靠颜色传达信息 | 多重标识(图标+文字) |
| 键盘不可达 | 全部 Tab 可达 |
| 模态框无焦点陷阱 | 焦点循环 + Esc 关闭 |

### 安全
| 陷阱 | 解决 |
|------|------|
| innerHTML 拼接 | textContent + sanitize |
| 密钥在前端代码 | 走后端代理 |
| JWT 存 localStorage | httpOnly Cookie |
| eval/Function 用户输入 | 严禁 |
| 没 CSP | 上 CSP |
| 没 SameSite | 加 SameSite=Lax |
| 第三方脚本无 SRI | 加 integrity |

### i18n
| 陷阱 | 解决 |
|------|------|
| 文案硬编码 | 用 t() |
| 日期用 toLocaleDateString | 用 Intl.DateTimeFormat |
| RTL 用 left/right | 用 margin-inline-start |
| 翻译不及时 | CI 检查 |
| 复数硬编码 | 用 ICU plural |
| 字符集错误 | 全站 UTF-8 |

## 15.5 实战项目

### 🎯 项目 1: 完整 WCAG AA 组件库
要求:
- 10+ 组件全 a11y
- axe-core 测试 0 问题
- 键盘导航完整
- 屏幕阅读器测试通过
- Storybook + a11y 插件

### 🎯 项目 2: 多语言 SaaS 应用
要求:
- 中/英/日/阿拉伯 4 语言
- 自动检测用户语言
- 日期/货币本地化
- RTL 支持
- 翻译文件管理流程

### 🎯 项目 3: 安全审计 + 加固
要求:
- 完整安全头部
- CSP nonce
- 输入脱敏
- 错误监控(Sentry)
- 漏洞扫描 (npm audit + Snyk)

## ✅ 本章检查清单

- [ ] WCAG 4 大原则能讲
- [ ] 键盘导航测试通过
- [ ] ARIA 属性会用
- [ ] OWASP Top 10 知道
- [ ] XSS/CSRF/点击劫持防御写过
- [ ] CSP 配置过
- [ ] 多语言应用做过
- [ ] RTL 适配过
- [ ] 完成 3 个实战项目

**下一章:** → [16-Expert-Mastery.md](./16-Expert-Mastery.md)