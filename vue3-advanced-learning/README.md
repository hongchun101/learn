# Vue 3 高级学习项目

> 高质量、类型严格、覆盖 Vue 3 全部高级知识点的学习项目。

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-1.4-6e9f18)](https://vitest.dev/)
[![Pinia](https://img.shields.io/badge/Pinia-2.1-f7d336)](https://pinia.vuejs.org/)

## 项目目标

实现一个**单页 Vue 3 学习项目**，每一类高级知识点都对应一个独立可交互的演示页（带测试），以最佳实践风格编写。

## 涵盖知识点

| 分类 | 知识点 | 演示页 |
| --- | --- | --- |
| 响应式 | `ref` / `reactive` / `computed` / `toRef` / `toRefs` / `toRaw` | `/reactivity` |
| 响应式 | `watch`（deep / immediate / flush / once）+ `watchEffect` | `/reactivity` |
| 响应式 | `effectScope` / `getCurrentScope` / `onScopeDispose` | `/reactivity` |
| 响应式 | `customRef`（debounce / async）| `/reactivity` |
| 响应式 | `shallowRef` / `triggerRef` / `markRaw` | `/reactivity`, `/performance` |
| 组合式 | `useMouse` / `useEventListener` / `useElementSize` | `/composables` |
| 组合式 | `useLocalStorage`（跨标签页同步）| `/composables` |
| 组合式 | `useDebounceRef` / `useThrottle` / `useTimeoutFn` / `useIntervalFn` | `/composables` |
| 组合式 | `useFetch`（超时/取消/刷新触发）| `/composables` |
| 组合式 | `useAsyncState` / `usePrevious` / `useCounter` / `useToggle` / `useTitle` / `useMounted` | `/composables` |
| 组件 | 动态组件 `<component :is>` | `/components` |
| 组件 | 异步组件 `defineAsyncComponent` | `/components` |
| 组件 | 递归组件（自引用 + name 推断）| `/components` |
| 组件 | 插槽：默认 / 具名 / 作用域 / 动态 | `/components` |
| 组件 | `<Teleport>` + `<Transition>` + `<KeepAlive>` + `<Suspense>` | `/components` |
| 组件 | `defineExpose` + 父组件通过 `ref` 访问 | `/components` |
| 组件 | `<script setup generic>` 泛型组件 | `/components` |
| 组件 | `onErrorCaptured` 错误边界 | `/components`, `/patterns` |
| 宏 | `defineProps`（类型 / withDefaults / 校验）| `/macros` |
| 宏 | `defineEmits`（元组语法）| `/macros` |
| 宏 | `defineModel`（单值 / 命名 / 修饰符）| `/macros` |
| 宏 | `defineExpose` | `/macros` |
| 宏 | `defineSlots` | `/macros` |
| 宏 | `defineOptions` | `/macros` |
| 指令 | `v-permission` / `v-tooltip` / `v-lazy` / `v-debounce` / `v-copy` / `v-ripple` | `/directives` |
| 渲染 | `h()` 渲染函数 | `/render-functions` |
| 渲染 | JSX / TSX 组件 | `/render-functions` |
| 渲染 | Functional Component（无状态函数式组件）| `/render-functions` |
| 模式 | `provide` / `inject` + InjectionKey + 响应式上下文 | `/components`, `/patterns` |
| 模式 | 自定义插件（i18n / error-emitter）| `src/plugins/` |
| 模式 | 全局 `errorHandler` / `warnHandler` | `src/main.ts` |
| 模式 | 复杂 `v-model`（reactive 嵌套对象 + 标签数组）| `/patterns` |
| 路由 | 嵌套路由 + 懒加载 + 滚动行为 + 路由守卫 + meta | `src/router/` |
| Pinia | Setup-style store + `$patch` + `$subscribe` + `storeToRefs` | `/store-demo` |
| 性能 | `v-memo` / `v-once` / `shallowRef` + `markRaw` | `/performance` |

## 项目结构

```
vue3-advanced-learning/
├── src/
│   ├── components/            # 可复用组件（含泛型、JSX、函数式、递归）
│   ├── composables/           # 组合式函数库（15 个 useXxx）
│   ├── directives/            # 6 个自定义指令
│   ├── plugins/               # i18n / error-handler 插件
│   ├── router/                # vue-router 配置 + 守卫
│   ├── stores/                # Pinia setup-style stores
│   ├── styles/                # 全局 SCSS
│   ├── utils/                 # 类型与 Promise 工具
│   ├── views/                 # 每个演示页对应一个 view
│   ├── App.vue
│   ├── main.ts
│   └── env.d.ts
├── env.d.ts
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── eslint.config.js
├── .prettierrc.json
└── package.json
```

## 快速开始

```bash
# 安装依赖（Node >= 20）
npm install

# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 测试
npm test

# 覆盖率
npm run test:coverage

# Lint
npm run lint

# 生产构建
npm run build
```

## 质量保证

- **TypeScript strict** 全开
- **ESLint** (vue + @typescript-eslint) flat config
- **Prettier** 统一格式
- **26 个 Vitest 单元测试** 全部通过（composables / components / stores / utils）
- **生产构建** 通过
- **代码分割**：vue-vendor 单独 chunk + 路由级懒加载

## 关键设计决策

- 所有 `<script setup>` 启用 TypeScript；泛型组件使用 `<script setup generic>` 而非 `defineComponent`
- 自定义 composable 全部使用 `effectScope` 友好的同步 API；副作用用 lifecycle hooks 注册
- 自定义指令使用对象形式以利用 `mounted` / `updated` / `unmounted` 钩子
- 错误边界使用 `onErrorCaptured` 配合 `return false` 阻断传播
- 性能演示使用 `v-memo` 配合大量列表 + `shallowRef` + `markRaw` 组合
- 所有 `Promise` 工具使用 `Promise.withResolvers()` 而非 `new Promise((resolve, reject) => ...)`
- 所有 reactive 工具用 `Record` 表示静态表，用 `Set/Map` 表示动态集合
- 顶层使用 `import type` 声明所有类型依赖

## 演示页面截图说明

- `/reactivity`：todo + watch 副作用 + customRef 防抖 + shallowRef/markRaw
- `/composables`：每个 composable 单独的可视化卡片
- `/components`：动态/异步/递归/插槽/Teleport/Suspense/KeepAlive 完整演示
- `/macros`：所有 `defineXxx` 宏 + 多 v-model 绑定
- `/directives`：6 个自定义指令 + IntersectionObserver + 复制到剪贴板 + 涟漪
- `/render-functions`：`h()` + JSX + 函数式组件
- `/patterns`：复杂表单 + provide/inject + 错误边界
- `/store-demo`：`$patch` + `$subscribe` + `storeToRefs`
- `/performance`：2000 列表 + `v-memo` + 性能对比

## License

MIT
