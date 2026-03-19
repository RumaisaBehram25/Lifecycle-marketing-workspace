/** Serialize any thrown value for logs and safe client-facing messages (trimmed). */
export function serializeUnknownError(error: unknown, maxLen = 600): string {
  if (error == null) return 'Unknown error (null/undefined)';
  if (error instanceof Error) {
    const m = error.message?.trim();
    return m || error.name || 'Error';
  }
  if (typeof error === 'string') return error.slice(0, maxLen);
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const parts = [o.message, o.msg, o.error, o.code, o.details]
      .filter((v) => v != null && v !== '')
      .map(String);
    if (parts.length) return parts.join(' — ').slice(0, maxLen);
    try {
      return JSON.stringify(error).slice(0, maxLen);
    } catch {
      return String(error).slice(0, maxLen);
    }
  }
  return String(error).slice(0, maxLen);
}
