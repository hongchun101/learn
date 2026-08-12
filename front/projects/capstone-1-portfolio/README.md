# 入门项目:HTML 语义化作品集

> 这是教程的第一个实战项目,也是基础 HTML/CSS 的最佳实践展示。

## 🎯 项目目标

构建一个完整、语义化、可访问、SEO 友好的单文件 HTML 作品集页面。

## ✅ 完成情况

- [x] 完整的 HTML5 文档结构
- [x] 语义化标签(header, nav, main, article, section, footer)
- [x] Open Graph + Twitter Card 社交分享
- [x] Schema.org 结构化数据(Course)
- [x] 完整的 a11y(skip-link, aria-*, focus-visible)
- [x] 暗色主题自动适配(prefers-color-scheme)
- [x] 流体排版(clamp)
- [x] 响应式 Grid(auto-fit + minmax)
- [x] 减少动画偏好支持(prefers-reduced-motion)
- [x] 平滑滚动 + 焦点管理

## 🚀 运行

```bash
# 启动本地服务器
npx serve .

# 浏览器打开
open http://localhost:3000
```

## 🧪 测试

```bash
# HTML 检查
npx htmlhint index.html

# Lighthouse 审计
npx lighthouse http://localhost:3000 --view
```

## 🎓 学到什么

1. 完整的 HTML5 文档骨架
2. 语义化标签的实战应用
3. SEO 元数据完整配置
4. Schema.org 结构化数据
5. CSS 自定义属性 + 暗色主题
6. 流体排版(响应式字号)
7. CSS Grid + Flex 现代布局
8. WCAG 可访问性最佳实践
9. 性能优化(preload、lazy)
10. 平滑滚动 + 焦点管理

## 📚 扩展练习

完成后,试试扩展:
- [ ] 添加更多页面(about, contact, blog)
- [ ] 集成 Contact Form(无后端用 formspree)
- [ ] 加 PWA(manifest + service worker)
- [ ] 部署到 GitHub Pages / Vercel / Netlify
- [ ] 添加 Lighthouse CI 自动化
- [ ] 集成 Web Vitals 监控