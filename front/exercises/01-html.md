# HTML 练习

## ⭐ 入门:完整简历页面

### 任务
用纯 HTML 写一个个人简历页面,包含所有必要部分。

### 要求
- [ ] 完整的 `<!DOCTYPE html>` 文档
- [ ] 包含: 头部(姓名、照片)、联系方式、技能、项目经验、教育背景、兴趣爱好
- [ ] 所有图片有 alt
- [ ] 所有交互元素(链接、按钮)语义正确
- [ ] 添加 Open Graph 标签
- [ ] 添加 Schema.org Person 结构化数据
- [ ] 加 favicon
- [ ] 加 canonical link
- [ ] 视口 meta 标签正确
- [ ] lang 属性正确

### 验收
用 Google Lighthouse 检测:
- SEO 100 分
- Best Practices 100 分
- Accessibility ≥ 95 分

### 提交
- 完整 HTML 文件
- Lighthouse 报告截图

---

## ⭐⭐ 进阶:可访问性博客文章

### 任务
写一篇博客文章(随便什么主题),完整可访问性。

### 要求
- [ ] `<article>` 包裹
- [ ] 正确的标题层级(H1 一, H2 三, H3 至少一)
- [ ] 至少 2 张图片(一个信息图,一个装饰图)
- [ ] 信息图有 figcaption
- [ ] 装饰图空 alt
- [ ] 至少一个 blockquote,带 cite 属性
- [ ] 至少一个 figure with table(图标信息)
- [ ] 内嵌代码 + 长代码块
- [ ] 加 Date/time 标签
- [ ] 加作者信息
- [ ] 加 BreadcrumbList Schema
- [ ] 加 Article Schema
- [ ] "返回顶部" 链接

### 验收
- Lighthouse Accessibility 100
- 屏幕阅读器测试(用 VoiceOver/NVDA/Narrator)
- 键盘导航能 Tab 完整走一遍

### 提交
- HTML 文件
- 测试视频/截图

---

## ⭐⭐⭐ 专家:可访问性组件库

### 任务
用纯 HTML + ARIA 实现一个手风琴菜单 + 选项卡组件。

### 要求
- 手风琴(Accordion)
  - [ ] 多按钮 + 多 panel
  - [ ] aria-expanded 状态
  - [ ] aria-controls 关联
  - [ ] aria-labelledby 关联 panel
  - [ ] 键盘支持(Enter/Space)
  - [ ] 方向键导航(可选)

- 选项卡(Tabs)
  - [ ] role="tablist"
  - [ ] role="tab" / aria-selected
  - [ ] role="tabpanel" / aria-labelledby
  - [ ] 方向键导航(← → Home End)
  - [ ] 自动激活 vs 手动激活
  - [ ] ARIA Authoring Practices 完整实现

### 验收
- 屏幕阅读器读出来完整
- 键盘测试完美
- axe-core 0 问题

### 提交
- HTML 文件 + CSS(可选)
- 键盘演示视频
- 屏幕阅读器测试记录