# React 练习

## ⭐ 入门:useState + useEffect 表单

### 任务
构建一个受控表单组件。

### 要求
- [ ] 输入:邮箱、密码、确认密码
- [ ] 实时校验
- [ ] 错误提示
- [ ] 提交按钮在表单有效前禁用
- [ ] 提交时模拟 API(2s 后响应)
- [ ] 成功后显示成功消息
- [ ] 失败后显示错误
- [ ] 完整 TypeScript 类型

### 提交
- Form.tsx
- Form.test.tsx (Vitest + RTL)

---

## ⭐⭐ 进阶:useReducer TODO

### 任务
用 useReducer 构建一个 TODO 应用。

### 要求
- [ ] 添加 / 删除 / 标记完成
- [ ] 编辑(双击)
- [ ] 全部/活跃/已完成筛选
- [ ] 清除已完成
- [ ] 计数显示
- [ ] 持久化到 localStorage
- [ ] 撤销/重做(用额外 reducer)

### 测试
- 所有操作测试
- 边界条件(空列表、超长文本)

### 提交
- App.tsx + reducer.ts
- 完整测试
- Storybook story

---

## ⭐⭐⭐ 专家:自定义 Hook 库

### 任务
实现 5 个有用的自定义 Hook,每个完整测试 + Storybook。

### 目标 Hook
1. **useLocalStorage** - 同步状态到 localStorage
2. **useDebounce** - 防抖值
3. **useToggle** - 布尔切换(支持 setOn/setOff/toggle)
4. **usePrevious** - 上次值
5. **useIntersection** - 元素进入视口回调

### 要求
- 每个 Hook:
  - [ ] TypeScript 类型
  - [ ] 完整单元测试(边界条件)
  - [ ] Storybook 演示
  - [ ] README + JSDoc

### 提交
- hooks/ 目录
- 完整测试
- Storybook 在线
- README

---

## ⭐⭐⭐ 专家:虚拟列表组件

### 任务
实现一个高性能虚拟列表,支持 10万 行流畅滚动。

### 要求
- [ ] 动态高度(每行可能不同)
- [ ] 横向滚动支持
- [ ] 滚动到指定 index
- [ ] 缓冲区(buffer)
- [ ] sticky header
- [ ] 复用节点
- [ ] 滚动性能 60fps
- [ ] TypeScript 泛型

### 验收
- DevTools Performance 录制无长任务
- 滚动 fps ≥ 58
- 内存 < 100MB

### 提交
- VirtualList.tsx
- 性能测试报告
- 演示页