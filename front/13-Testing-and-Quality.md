# 13 · 测试与质量保障

> 测试不是"找 bug",而是**用代码验证行为、保护设计、加速迭代**。专家级前端的代码从第一天起就伴随测试。

## 📌 心智模型

```
测试金字塔:
       /\
      /E2E\        慢、贵、脆(Playwright)
     /------\
    /集成测试\     中速、稳定(RTL/Vue Test Utils)
   /----------\
  /  单元测试  \   快、纯、覆盖函数逻辑(Vitest)
 /--------------\

原则:
  • 测试行为,不测试实现
  • 黑盒优先,白盒补充
  • 真实度优先(mock 仅必要时)
  • 100% 覆盖 ≠ 0 bug,关键路径覆盖才算
```

## 13.1 测试类型与定位

### 13.1.1 单元测试 (Unit)
- 一个函数 / 一个类
- 快速(<10ms)
- 无依赖(mock 一切)

### 13.1.2 集成测试 (Integration)
- 多个模块协作
- 中等速度
- 部分真实 + 部分 mock

### 13.1.3 端到端 (E2E)
- 完整用户流程
- 真实浏览器
- 慢、脆、维护成本高

### 13.1.4 视觉回归 (Visual)
- UI 是否意外变化
- Storybook + Chromatic / Percy

## 13.2 Vitest (现代测试运行器)

### 13.2.1 配置
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',  // 'node' | 'happy-dom' | 'jsdom'
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.config.*', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
```

### 13.2.2 测试结构
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Calculator', () => {
  let calc: Calculator;

  beforeEach(() => {
    calc = new Calculator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('add', () => {
    it('adds two positive numbers', () => {
      expect(calc.add(2, 3)).toBe(5);
    });

    it('handles negative numbers', () => {
      expect(calc.add(-1, 1)).toBe(0);
    });
  });
});
```

### 13.2.3 Mock 与 Spy
```typescript
// 函数 mock
const fn = vi.fn();
fn('hello');
expect(fn).toHaveBeenCalledWith('hello');
expect(fn).toHaveBeenCalledTimes(1);

// 返回值 mock
const fn = vi.fn().mockReturnValue(42);
const asyncFn = vi.fn().mockResolvedValue({ id: 1 });

// 模块 mock
vi.mock('./api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'A' }),
}));

// 部分 mock
vi.spyOn(console, 'log').mockImplementation(() => {});

// 时间 mock
vi.useFakeTimers();
vi.advanceTimersByTime(1000);

// 真实计时器
vi.useRealTimers();
```

### 13.2.4 异步测试
```typescript
it('fetches user', async () => {
  const user = await fetchUser(1);
  expect(user.name).toBe('A');
});

it('handles error', async () => {
  await expect(fetchUser(-1)).rejects.toThrow('Not Found');
});

it('resolves with delay', async () => {
  vi.useFakeTimers();
  const promise = delayedResolve(1000);
  vi.advanceTimersByTime(1000);
  await expect(promise).resolves.toBe('done');
});
```

## 13.3 React Testing Library

### 13.3.1 核心原则
```
• 测试用户看到的,不测试实现
• 用 getByRole / getByLabelText 优先
• 不存 DOM 选择器(className)
• 不存组件状态
```

### 13.3.2 基础查询
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('LoginForm', () => {
  it('submits credentials', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'a@b.c');
    await user.type(screen.getByLabelText(/password/i), 'pass');
    await user.click(screen.getByRole('button', { name: /login/i }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pass' });
  });
});
```

### 13.3.3 查询优先级
```
1. getByRole          ⭐ 最可访问
2. getByLabelText
3. getByPlaceholderText
4. getByText
5. getByDisplayValue
6. getByAltText
7. getByTitle
8. getByTestId        ⚠️ 最后兜底
```

### 13.3.4 异步查询
```typescript
// 等待元素出现
await screen.findByText(/success/i);

// 等待条件成立
await waitFor(() => {
  expect(screen.getByText(/success/i)).toBeInTheDocument();
});

// 超时配置
await waitFor(() => {...}, { timeout: 3000 });
```

### 13.3.5 上下文 Provider
```typescript
const wrapper = ({ children }) => (
  <ThemeProvider value="light">
    <UserProvider user={mockUser}>
      {children}
    </UserProvider>
  </ThemeProvider>
);

render(<Profile />, { wrapper });
```

## 13.4 Vue Test Utils

### 13.4.1 基础
```typescript
import { mount, shallowMount } from '@vue/test-utils';
import Counter from './Counter.vue';

describe('Counter', () => {
  it('renders count', () => {
    const wrapper = mount(Counter, { props: { initial: 5 } });
    expect(wrapper.text()).toContain('5');
  });

  it('increments on click', async () => {
    const wrapper = mount(Counter);
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('1');
  });
});

// shallowMount: 子组件占位(测试当前组件)
const wrapper = shallowMount(Parent);
```

### 13.4.2 组件桩
```typescript
import { config } from '@vue/test-utils';

config.global.stubs = {
  RouterLink: true,
  HeavyChild: true,
};
```

### 13.4.3 Pinia 测试
```typescript
import { createPinia, setActivePinia } from 'pinia';

beforeEach(() => setActivePinia(createPinia()));

it('updates user', () => {
  const userStore = useUserStore();
  userStore.setUser({ id: 1 });
  expect(userStore.user).toEqual({ id: 1 });
});
```

## 13.5 组件测试策略

### 13.5.1 行为驱动
```
每个组件测试回答:
  1. 它渲染了什么(输出)
  2. 它响应了什么(交互)
  3. 它对外通知了什么(回调/事件)
```

### 13.5.2 测试状态机组件
```typescript
describe('Toggle', () => {
  it('starts off', () => {
    render(<Toggle>{({ on }) => <span>{on ? 'on' : 'off'}</span>}</Toggle>);
    expect(screen.getByText('off')).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    const user = userEvent.setup();
    render(<Toggle>{({ on, toggle }) => (
      <button onClick={toggle}>{on ? 'on' : 'off'}</button>
    )}</Toggle>);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('on')).toBeInTheDocument();
  });
});
```

### 13.5.3 表单测试
```typescript
describe('Form', () => {
  it('validates email', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.type(screen.getByLabelText(/email/i), 'invalid');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });

  it('submits valid data', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Form onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.c');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

### 13.5.4 Hook 测试
```typescript
import { renderHook, act } from '@testing-library/react';

describe('useCounter', () => {
  it('increments', () => {
    const { result } = renderHook(() => useCounter());
    act(() => result.current.inc());
    expect(result.current.count).toBe(1);
  });
});
```

## 13.6 E2E 测试 (Playwright)

### 13.6.1 配置
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### 13.6.2 测试用例
```typescript
import { test, expect } from '@playwright/test';

test('user login flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /login/i }).click();
  await page.getByLabel(/email/i).fill('a@b.c');
  await page.getByLabel(/password/i).fill('password');
  await page.getByRole('button', { name: /submit/i }).click();
  await expect(page.getByText(/welcome/i)).toBeVisible();
});

test('adds to cart', async ({ page }) => {
  await page.goto('/products/1');
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.goto('/cart');
  await expect(page.getByText(/1 item/i)).toBeVisible();
});
```

### 13.6.3 Page Object 模式
```typescript
// pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /submit/i }).click();
  }
}

// e2e/login.spec.ts
test('logs in', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await page.goto('/login');
  await loginPage.login('a@b.c', 'password');
  await expect(page).toHaveURL('/dashboard');
});
```

### 13.6.4 视觉回归
```typescript
test('home page snapshot', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot();
});
```

## 13.7 覆盖率

### 13.7.1 配置
```json
{
  "coverage": {
    "provider": "v8",
    "reporter": ["text", "html", "json-summary"],
    "thresholds": {
      "lines": 80,
      "functions": 80,
      "branches": 75,
      "statements": 80
    },
    "exclude": [
      "**/*.test.*",
      "**/*.config.*",
      "**/types/**"
    ]
  }
}
```

### 13.7.2 覆盖率指标
```
Lines:      语句覆盖率
Branches:   分支(if/else)
Functions:  函数
Statements: 声明
```

**专家观点:**
- 100% 覆盖 ≠ 0 bug
- 关注**关键路径**和**边界**
- 排除生成的代码、配置文件

## 13.8 Mock Service Worker (MSW)

### 13.8.1 网络层 mock
```typescript
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([{ id: 1, name: 'A' }]);
  }),
  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: Date.now(), ...body }, { status: 201 });
  }),
  http.get('/api/users/:id', ({ params }) => {
    if (params.id === '999') return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ id: params.id, name: 'A' });
  }),
];

// mocks/browser.ts (开发用)
// mocks/server.ts (测试用)
```

### 13.8.2 测试中使用
```typescript
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## 13.9 测试驱动开发 (TDD)

```
Red  → 写失败的测试
Green → 写最简代码通过
Refactor → 优化代码
```

### 13.9.1 实战
```typescript
// 1. 先写测试
describe('formatMoney', () => {
  it('formats CNY', () => {
    expect(formatMoney(1234.5, 'CNY')).toBe('¥1,234.50');
  });
});

// 2. 实现
export function formatMoney(amount: number, currency = 'CNY'): string {
  return new Intl.Number('zh-CN', { style: 'currency', currency }).format(amount);
}

// 3. 添加更多用例
it('handles USD', () => {
  expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
});
```

## 13.10 持续集成 / 持续部署 (CI/CD)

### 13.10.1 流水线
```
Lint (ESLint)
  ↓
Type Check (TypeScript)
  ↓
Unit Test (Vitest)
  ↓
Build (Vite)
  ↓
E2E Test (Playwright)
  ↓
Deploy (Vercel/Netlify/自托管)
```

### 13.10.2 GitHub Actions
```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage

  e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report
```

### 13.10.3 预提交钩子 (Husky)
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "commit-msg": "commitlint -E $HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,vue}": ["eslint --fix", "prettier --write"],
    "*.css": ["stylelint --fix"]
  }
}
```

## 13.11 静态分析

### 13.11.1 TypeScript
```json
// tsconfig.json (严格)
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true
}
```

### 13.11.2 ESLint
```js
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',
    'eqeqeq': 'error',
  },
};
```

### 13.11.3 Prettier
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

### 13.11.4 Stylelint
```json
{
  "extends": ["stylelint-config-standard"],
  "rules": {
    "selector-class-pattern": "^[a-z][a-zA-Z0-9]+$"
  }
}
```

## 13.12 可观测性

### 13.12.1 错误监控 (Sentry)
```typescript
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'https://...@sentry.io/...',
  environment: process.env.NODE_ENV,
  release: `myapp@${VERSION}`,
  tracesSampleRate: 0.2,
  beforeSend: (event) => {
    // 过滤掉不重要的
    if (event.exception?.values?.[0]?.type === 'ChunkLoadError') {
      return null;
    }
    return event;
  },
});
```

### 13.12.2 性能监控 (Web Vitals)
```typescript
import { onLCP, onINP, onCLS } from 'web-vitals';

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);

function sendToAnalytics(metric: Metric) {
  const data = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
  };
  navigator.sendBeacon('/api/analytics', JSON.stringify(data));
}
```

## 13.13 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 测试实现细节 | 重构即失败 | 测试行为 |
| 过度 mock | 测试失真 | 用 MSW + 真实 API |
| 脆 E2E | 维护噩梦 | Page Object + 稳定选择器 |
| 覆盖率军备 | 数字好看但没价值 | 关键路径覆盖 |
| 跳过测试 CI | 部署即爆炸 | 强制 CI 检查 |
| 不测试错误路径 | 异常崩溃 | try/catch + 错误用例 |
| 数据快照过度 | 不可读 | 用具体断言 |
| 异步测试不 wait | 误判 | waitFor / findBy |
| 共享状态污染 | 测试互相影响 | beforeEach 重置 |
| 只测快乐路径 | 边界 bug | 写负向用例 |

## 13.14 实战项目

### 🎯 项目 1: 测试覆盖率 90%+ 的工具库
要求:
- Vitest 完整测试
- 单元测试 + 属性测试 (fast-check)
- Mock 网络层
- 覆盖率 CI 阈值

### 🎯 项目 2: 组件库全套测试
要求:
- 每个组件 RTL/VTU 测试
- 视觉回归 (Chromatic)
- Storybook + a11y 插件
- CI 全套

### 🎯 项目 3: E2E 测试套件
要求:
- Playwright 配置
- Page Object 模式
- 关键流程覆盖
- 失败截图/录像
- 集成到 CI

## ✅ 本章检查清单

- [ ] 测试金字塔 3 层能用
- [ ] Vitest 配置 + Mock 熟练
- [ ] RTL/VTU 写过组件测试
- [ ] Playwright E2E 配过
- [ ] MSW 处理网络 mock
- [ ] CI 流水线配置过
- [ ] 错误监控接入
- [ ] 完成 3 个实战项目

**下一章:** → [14-Performance-Optimization.md](./14-Performance-Optimization.md)