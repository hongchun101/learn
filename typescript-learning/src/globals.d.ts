/**
 * 项目的全局环境声明。
 *
 * 由于 tsconfig 的 `include` glob，此文件会被自动加载。
 * 用途：
 *   - 扩展全局命名空间（NodeJS.ProcessEnv 等）
 *   - 声明环境模块（例如 CSS modules、静态资源）
 *   - 添加自定义全局值
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly NODE_ENV: 'development' | 'test' | 'production';
      readonly DATABASE_URL: string;
      readonly LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
    }
  }

  interface GlobalThis {
    __APP_VERSION__: string;
  }
}

// 环境模块声明：导入具有指定类型结构的 JSON 模块。
declare module '*.json' {
  const value: unknown;
  export default value;
}

// 环境模块声明：CSS modules
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

export {};
