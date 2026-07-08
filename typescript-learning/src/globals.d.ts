/**
 * Global ambient declarations for the project.
 *
 * This file is loaded automatically because of tsconfig's `include` glob.
 * Use it for:
 *   - Augmenting global namespaces (NodeJS.ProcessEnv, etc.)
 *   - Declaring ambient modules (e.g. CSS modules, static assets)
 *   - Adding custom global values
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

// Ambient module declaration: importing JSON modules with a typed shape.
declare module '*.json' {
  const value: unknown;
  export default value;
}

// Ambient module declaration: CSS modules
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

export {};
