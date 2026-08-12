# npm/pnpm 速查

## 基础
```bash
npm init              # 初始化 package.json
npm init -y           # 全部默认
npm install           # 安装所有依赖
npm install <pkg>     # 安装包
npm install -D <pkg>  # 开发依赖
npm install -g <pkg>  # 全局
npm uninstall <pkg>
npm update
npm outdated          # 检查过期
```

## 版本
```bash
npm install <pkg>@1.2.3     # 指定版本
npm install <pkg>@latest    # 最新
npm install <pkg>@next      # 下一个版本

# 语义版本
^1.2.3   # 兼容次版本(>=1.2.3 <2.0.0)
~1.2.3   # 兼容补丁(>=1.2.3 <1.3.0)
1.2.3    # 精确
*        # 最新
```

## 脚本
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "coverage": "vitest --coverage",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test",
    "prepare": "husky install"
  }
}
```

## npx
```bash
npx <pkg>          # 临时执行包
npx <pkg> --args   # 传参
npx create-vite    # 创建项目
npx http-server    # 临时启动服务
```

## pnpm (推荐)
```bash
pnpm install        # 安装
pnpm add <pkg>      # 添加
pnpm add -D <pkg>   # 开发依赖
pnpm remove <pkg>
pnpm update
pnpm dlx <pkg>      # 类似 npx
pnpm why <pkg>      # 为什么装
pnpm list           # 列出
pnpm store prune    # 清理 store
pnpm cache clean    # 清理缓存

# 工作区
pnpm -r run build           # 所有包
pnpm --filter <pkg> build    # 指定包
```

## 审计
```bash
npm audit                  # 漏洞扫描
npm audit fix              # 自动修复
npm audit fix --force      # 强制
```

## 信息
```bash
npm info <pkg>             # 包信息
npm view <pkg> versions    # 所有版本
npm config list            # 配置列表
npm config get registry    # 源
npm config set registry <url>  # 换源
```

## 镜像
```bash
# 淘宝
npm config set registry https://registry.npmmirror.com

# nvm
npm config get registry
```

## 锁文件
```bash
package-lock.json  # npm
pnpm-lock.yaml     # pnpm
yarn.lock          # yarn

# CI 用
npm ci              # 必须有 lockfile, 严格按版本
```

## 发布
```bash
# 登录
npm login

# 确认 npm 配置
npm whoami

# 发布
npm version patch    # 0.0.x
npm version minor    # 0.x.0
npm version major    # x.0.0
npm publish
npm publish --access public   # scoped 包

# 弃用
npm deprecate <pkg>@<version> "msg"

# 撤销(24h 内)
npm unpublish <pkg>@<version>
```

## package.json 字段
```json
{
  "name": "my-pkg",
  "version": "1.0.0",
  "description": "",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {},
  "dependencies": {},
  "devDependencies": {},
  "peerDependencies": {},
  "engines": {
    "node": ">=20"
  },
  "keywords": [],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": ""
  },
  "bugs": "",
  "homepage": ""
}
```

## monorepo
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```