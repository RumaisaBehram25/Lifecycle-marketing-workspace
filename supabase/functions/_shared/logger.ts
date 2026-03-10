/**
 * Structured server-side logger for edge functions.
 * Redacts sensitive fields from logged data to prevent credential leaks in function logs.
 */

const SENSITIVE_KEYS = new Set([
  'api_key', 'api_secret', 'apiKey', 'apiSecret',
  'api_key_encrypted', 'api_secret_encrypted',
  'authorization', 'token', 'password', 'secret',
  'SUPABASE_SERVICE_ROLE_KEY', 'PERPLEXITY_API_KEY',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[nested]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' && value.length > 200) {
    return value.slice(0, 50) + '...[redacted]';
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  if (typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      redacted[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return redacted;
  }
  return value;
}

function formatArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return { message: arg.message, name: arg.name };
    }
    if (typeof arg === 'object' && arg !== null) {
      return redact(arg);
    }
    return arg;
  });
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => console.debug(msg, ...formatArgs(args)),
  info: (msg: string, ...args: unknown[]) => console.info(msg, ...formatArgs(args)),
  warn: (msg: string, ...args: unknown[]) => console.warn(msg, ...formatArgs(args)),
  error: (msg: string, ...args: unknown[]) => console.error(msg, ...formatArgs(args)),
};
