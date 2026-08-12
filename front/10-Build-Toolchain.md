# 10 · 现代构建工具链

> 构建工具是前端的"工程化骨架"。专家级前端必须理解工具原理,才能优化性能、调试问题、定制流程。

## 📌 心智模型

```
构建工具的核心任务:
  1. 模块解析 (依赖图)
  2. 转译 (Babel/SWC/esbuild)
  3. 打包 (合并 + 代码分割)
  4. 优化 (压缩、Tree-shaking、压缩)
  5. 输出 (静态资源、Source Map)

工具谱系:
  旧 → Webpack(万能但慢)
  新 → Vite(开发快,生产用 Rollup)
  最新 → Turbopack/Rspack(Rust 重写 Webpack)
  库 → Rollup、tsup、unbuild
```

## 10.1 模块解析

### 10.1.1 CommonJS 解析
```
node_modules/foo/package.json:
  "main": "index.js"  → /node_modules/foo/index.js

解析算法:
  require('foo')
  → node_modules/foo/package.json
  → 看 main 字段
  → 看 module 字段 (ESM 优先)
  → 看 exports 字段 (现代)
```

### 10.1.2 ESM 解析
```
Node ESM 必须带扩展名或 package.json imports map
现代打包器(Vite/Webpack)默认处理
```

### 10.1.3 package.json exports 字段
```json
{
  "name": "foo",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "browser": "./dist/browser.mjs"
    },
    "./utils": "./dist/utils.mjs",
    "./package.json": "./package.json"
  }
}
```

## 10.2 Webpack 原理

### 10.2.1 核心概念
```
Entry → Module → Chunk → Bundle

依赖图:
  app.js → react, lodash, utils, styles.css, logo.png
  打包器递归构建依赖图

Loader: 处理非 JS 文件 (CSS、JSON、图片)
Plugin: 扩展功能 (HtmlWebpackPlugin、MiniCssExtractPlugin)
```

### 10.2.2 完整 webpack.config.js
```javascript
import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';

export default {
  mode: 'production',
  entry: { app: './src/index.tsx' },
  output: {
    path: path.resolve('dist'),
    filename: '[name].[contenthash:8].js',
    chunkFilename: '[name].[contenthash:8].chunk.js',
    assetModuleFilename: 'assets/[hash][ext][query]',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve('src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: 'swc-loader',  // 或 'babel-loader'
      },
      {
        test: /\.module\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              modules: true,
            },
          },
          'postcss-loader',
        ],
      },
      {
        test: /\.(png|jpg|webp|svg)$/,
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: 8 * 1024 } },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      inject: 'body',
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash:8].css',
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /node_modules/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
    runtimeChunk: 'single',
  },
  devServer: {
    port: 5173,
    hot: true,
    historyApiFallback: true,
  },
  cache: { type: 'filesystem' },
};
```

### 10.2.3 关键优化
- 缓存: filesystem / persistent
- 多核: thread-loader
- 减少 loader 范围: exclude / include
- 生产 source map: 'hidden-source-map' (不暴露)

## 10.3 Vite 原理

### 10.3.1 核心:基于 ESM 的开发服务器
```
浏览器请求 /src/App.tsx
  → Vite 服务: 仅处理这一个文件,转译 (esbuild)
  → 返回浏览器
  → 浏览器 import 子模块
  → 重复

特点: 启动快、按需编译、HMR 极快
```

### 10.3.2 生产:用 Rollup
```
依赖预构建: esbuild 把 CJS → ESM
源码: Rollup 打包(代码分割友好)
```

### 10.3.3 vite.config.ts
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    svgr({ exportAsDefault: true }),
    visualizer({ open: true, gzipSize: true }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
    preprocessorOptions: {
      scss: { additionalData: `@import "@/styles/variables.scss";` },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'ws://localhost:3000', ws: true },
    },
  },
  optimizeDeps: {
    include: ['react', 'lodash-es'],
  },
});
```

### 10.3.4 插件机制
```typescript
import type { Plugin } from 'vite';

function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    enforce: 'pre',  // 'pre' | 'post'
    // 钩子
    configResolved(config) { /* 读取配置 */ },
    transform(code, id) {
      if (id.endsWith('.svg')) {
        return `export default ${JSON.stringify(code)}`;
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/health') {
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }
        next();
      });
    },
  };
}
```

### 10.3.5 自定义插件示例:API Mock
```typescript
function mockPlugin(mockMap: Record<string, any>): Plugin {
  return {
    name: 'mock-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => {
        const key = `${req.method}:${req.url?.split('?')[0]}`;
        if (mockMap[key]) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(mockMap[key]));
          return;
        }
        next();
      });
    },
  };
}
```

## 10.4 Rollup / tsup / unbuild

### 10.4.1 Rollup (库打包)
```javascript
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: [
    { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    { file: 'dist/index.mjs', format: 'esm', sourcemap: true },
    { file: 'dist/index.umd.js', format: 'umd', name: 'MyLib', sourcemap: true },
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript(),
    terser(),
  ],
};
```

### 10.4.2 tsup (零配置库打包)
```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,  // 自动生成类型声明
  splitting: false,
  sourcemap: true,
  clean: true,
});
```

## 10.5 esbuild / SWC / Babel

### 10.5.1 esbuild
- Go 编写,极快
- 用作 Vite 依赖预构建、TypeScript 转译、压缩
- 配置简单

```javascript
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outfile: 'dist/bundle.js',
  minify: true,
  sourcemap: true,
  target: ['es2022'],
  loader: { '.png': 'file' },
  plugins: [/* 自定义 */],
  watch: true,  // 开发模式
});
```

### 10.5.2 SWC (Rust 写的 Babel)
```json
// .swcrc
{
  "jsc": {
    "parser": { "syntax": "typescript", "tsx": true },
    "target": "es2022",
    "transform": {
      "react": { "runtime": "automatic" }
    }
  },
  "module": { "type": "es6" }
}
```

### 10.5.3 Babel
```json
// babel.config.json
{
  "presets": [
    ["@babel/preset-env", { "targets": "> 0.5%, last 2 versions" }],
    ["@babel/preset-typescript"],
    ["@babel/preset-react", { "runtime": "automatic" }]
  ],
  "plugins": [
    ["@babel/plugin-proposal-decorators", { "version": "2022-03" }]
  ]
}
```

## 10.6 代码分割策略

### 10.6.1 三种分割
```javascript
// 1. 路由级
const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));

// 2. 组件级
const HeavyChart = lazy(() => import('./components/HeavyChart'));

// 3. 库级
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules/react')) return 'react';
        if (id.includes('node_modules/lodash')) return 'lodash';
      }
    }
  }
}
```

### 10.6.2 预取
```javascript
// 路由 prefetch
<Link to="/about" onMouseEnter={() => import('./pages/About')}>
  About
</Link>

// 框架内置: Next.js (next/link 自动)、Vue Router (lazy)
```

## 10.7 优化策略

### 10.7.1 Tree Shaking
```javascript
// 必须: ES Module + sideEffects: false
// package.json
{
  "sideEffects": false  // 或 ["*.css"]
}

// ❌ 不可 tree-shake
import _ from 'lodash';

// ✅ 可 tree-shake
import { debounce } from 'lodash-es';
```

### 10.7.2 压缩
```javascript
// Terser (JS)
// CssMinimizer / esbuild minify (CSS)
// Svgo (SVG)
// Sharp / Imagemin (图片)
// Woff2 (字体)
```

### 10.7.3 图片优化 (Vite)
```javascript
// vite-plugin-imagemin / unplugin-imagemin
import { imagemin } from 'vite-plugin-imagemin';

export default defineConfig({
  plugins: [imagemin({
    gifsicle: { optimizationLevel: 7 },
    mozjpeg: { quality: 80 },
    pngquant: { quality: [0.65, 0.8] },
    svgo: { plugins: [{ removeViewBox: false }] },
    webp: { quality: 80 },
  })],
});
```

### 10.7.4 关键 CSS 内联
```javascript
// vite-plugin-html
// 或手动 critical 包
import critical from 'critical';

await critical.generate({
  base: 'dist/',
  src: 'index.html',
  css: ['dist/main.css'],
  target: { html: 'index-critical.html', css: 'critical.css' },
  inline: true,
});
```

### 10.7.5 资源哈希化
```
app.[contenthash].js   → 内容变化文件名变
main.[contenthash].css → 永久缓存

contenthash: 内容哈希(推荐)
chunkhash: chunk 哈希
hash: 编译哈希(每次不同)
```

## 10.8 Source Map

### 10.8.1 类型
```
eval              单行映射,开发用,快
eval-source-map   eval + 完整映射,开发推荐
inline-source-map 内联 base64,产物大
source-map        独立 .map 文件,生产推荐
hidden-source-map 独立 .map 但不引用,生产推荐(不暴露)
```

### 10.8.2 上传到 Sentry
```javascript
import * as Sentry from '@sentry/browser';
Sentry.init({
  dsn: '...',
  release: 'myapp@1.0.0',
});

const event = new EventSource('/sourcemaps/upload');  // 实际用 sentry-cli 上传
```

## 10.9 Monorepo 构建

### 10.9.1 pnpm workspace
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 10.9.2 Turborepo
```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false
    }
  }
}
```

### 10.9.3 Nx
```json
{
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "cache": true
    }
  }
}
```

## 10.10 CI/CD 构建

### 10.10.1 GitHub Actions
```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist
```

### 10.10.2 Docker 多阶段构建
```dockerfile
# 前端
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

## 10.11 调试构建问题

### 10.11.1 Bundle 分析
```bash
# Webpack
webpack --json > stats.json
npx webpack-bundle-analyzer stats.json

# Vite
npx rollup-plugin-visualizer (插件生成 stats.html)

# source-map-explorer
npx source-map-explorer dist/*.js
```

### 10.11.2 常见问题排查
| 问题 | 原因 | 解决 |
|------|------|------|
| 产物过大 | 没 tree-shake / 没用代码分割 | 检查 sideEffects |
| 启动慢 | loader 范围太大 | 缩小 test,加缓存 |
| HMR 失效 | 监听太多 | ignore 文件 |
| 资源 404 | publicPath 错 | 配 base |
| 循环依赖 | import 闭环 | 重构 |
| 类型不工作 | tsconfig 缺 | 加 jsx, types |

## 10.12 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 用了 moment | 250KB | 改 dayjs / date-fns |
| 全局 lodash import | 全部加载 | 用 lodash-es 按需 |
| 没拆 vendor | 改业务代码也重下载 | manualChunks 拆 |
| 没开缓存 | 构建 10 分钟 | 开 filesystem cache |
| 图标全部 inline | 包大 | SVG sprite |
| 没分析 bundle | 盲目优化 | 装 analyzer |
| 生产 source map 暴露 | 代码泄露 | hidden-source-map |
| 没 CDN 指纹策略 | 缓存混乱 | contenthash + immutable |
| Webpack alias 缺 | 路径乱 | 配 tsconfig + 构建 |
| 用了全局 polyfill | 没用的浏览器也下载 | 按需加载 |

## 10.13 实战项目

### 🎯 项目 1: Vite 自定义插件 (按需加载)
要求:
- 检测 import 的组件
- 自动拆分到独立 chunk
- 生成 manifest.json
- 配 HMR

### 🎯 项目 2: 库打包工具链 (tsup + dts + 双格式)
要求:
- 输出 ESM + CJS + UMD
- 类型声明
- Source map
- 自动 changelog (changesets)
- 发版到 npm

### 🎯 项目 3: Monorepo (Turborepo + pnpm)
要求:
- 多个 app 共享 packages
- 缓存生效
- 跨包引用类型正确
- CI 加速

## ✅ 本章检查清单

- [ ] 理解 Webpack 依赖图、loader、plugin
- [ ] Vite 基于 ESM 的原理能讲清
- [ ] 能写 Vite 插件
- [ ] esbuild / SWC / Babel 区别知道
- [ ] Tree-shaking 条件能讲
- [ ] Bundle 分析工具用过
- [ ] 完成 3 个实战项目

**下一章:** → [11-React-Mastery.md](./11-React-Mastery.md)