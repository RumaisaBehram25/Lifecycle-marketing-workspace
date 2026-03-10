type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const isDev = import.meta.env.DEV;

function log(level: LogLevel, message: string, ...args: unknown[]) {
  if (isDev) {
    console[level](message, ...args);
  }
  // In production: optionally send to error tracking service
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
  info: (msg: string, ...args: unknown[]) => log('info', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('warn', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),
};
