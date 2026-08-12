// packages/utils/src/log.ts
// 一个简单的 logger，主进程 / 渲染进程都能用
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogMeta extends Record<string, unknown> {
  timestamp?: string;
  pid?: number;
  level?: LogLevel;
}

export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
  fatal(msg: string, meta?: LogMeta): never;
  child(meta: LogMeta): Logger;
}

function fmt(level: LogLevel, msg: string, meta?: LogMeta) {
  const log = {
    timestamp: new Date().toISOString(),
    level,
    ...meta,
    msg,
  };
  return JSON.stringify(log);
}

function makeLogger(base: LogMeta = {}): Logger {
  const log = (level: LogLevel) => (msg: string, meta?: LogMeta) => {
    const combined = { ...base, ...meta, level };
    const line = fmt(level, msg, combined);
    if (level === 'error' || level === 'fatal') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };
  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    fatal: (msg, meta) => {
      log('fatal')(msg, meta);
      throw new Error(msg);
    },
    child: (meta) => makeLogger({ ...base, ...meta }),
  };
}

export const logger: Logger = makeLogger({ pid: process.pid });
