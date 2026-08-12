# 进阶项目:React + TypeScript 全套脚手架

> 这个项目展示了教程中学到的所有 React 现代开发能力。

## 🎯 项目目标

搭建一个完整的、生产级的 React 项目骨架,涵盖:
- TypeScript 严格模式
- Vite 极速开发
- React Router v6
- React Query 数据获取
- Zustand 状态管理
- Zod 类型校验
- Vitest + RTL 单元测试
- Playwright E2E 测试
- ESLint + Prettier
- Storybook 组件文档

## 🚀 启动

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev

# 打开 http://localhost:5173
```

## 🧪 测试

```bash
pnpm test           # 单元测试
pnpm test:ui        # 单元测试 UI
pnpm coverage       # 覆盖率
pnpm typecheck      # TypeScript 类型检查
pnpm lint           # 代码风格
pnpm format         # 代码格式化
pnpm storybook      # 组件文档(端口 6006)
```

## 📦 构建

```bash
pnpm build          # 生产构建
pnpm preview        # 预览构建结果
```

## 📂 目录结构

```
src/
├── main.tsx           # 入口
├── App.tsx            # 根组件
├── components/        # 通用组件
├── pages/             # 路由页面
├── hooks/             # 自定义 hooks
├── stores/            # Zustand stores
├── api/               # React Query queries/mutations
├── utils/             # 工具函数
├── types/             # 全局类型
└── styles/            # 全局样式

tests/
├── unit/              # 单元测试
└── e2e/               # 端到端测试
```

## 🎓 学到什么

1. **TypeScript 严格模式** - 编译时消除 90% 错误
2. **Vite 极速 HMR** - 毫秒级反馈
3. **代码分割** - 路由 + 库拆分
4. **类型安全的 API 调用** - React Query + Zod
5. **现代状态管理** - Zustand 替代 Redux
6. **完整测试栈** - 单元 + 集成 + E2E
7. **组件文档化** - Storybook 自动生成

## 🛠️ 后续添加

按教程章节完善:
- [ ] 路由 + 懒加载
- [ ] 状态管理
- [ ] 数据获取
- [ ] 表单
- [ ] 主题切换(暗色)
- [ ] i18n
- [ ] 错误边界
- [ ] 性能监控
- [ ] Storybook stories