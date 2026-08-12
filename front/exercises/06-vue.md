# Vue 练习

## ⭐⭐ 进阶:响应式 TODO

### 任务
用 Vue3 + Composition API 构建一个 TODO 应用。

### 要求
- [ ] `<script setup>` + TypeScript
- [ ] 添加/删除/编辑
- [ ] 筛选(全部/活跃/已完成)
- [ ] 计数
- [ ] localStorage 持久化
- [ ] 自定义 composable: useTodos
- [ ] Pinia store 替代
- [ ] 单元测试(VTU + Vitest)

### 提交
- App.vue
- composables/useTodos.ts
- stores/todo.ts
- 测试

---

## ⭐⭐⭐ 专家:可复用组件库

### 任务
实现 5 个生产级组件。

### 目标组件
1. **VButton** - 5 种 variant + 3 种 size + loading
2. **VInput** - 校验 + 错误提示 + 异步验证
3. **VModal** - Teleport + 焦点陷阱 + Esc 关闭 + a11y
4. **VSelect** - 搜索 + 异步加载 + 键盘导航
5. **VTabs** - 方向键 + 自动激活 + URL 同步

### 要求
- [ ] TypeScript 类型完整
- [ ] `<script setup>`
- [ ] 样式可定制(slot / class)
- [ ] v-model 支持
- [ ] 单元测试覆盖 90%+
- [ ] Storybook 演示
- [ ] a11y 100

### 提交
- components/ 目录
- 完整测试
- Storybook
- 文档