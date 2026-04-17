/** Extract Google Drive folder ID from a raw ID or share URL (same rules as app `driveFolderLinks`). */
export function extractGoogleDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed;
  }

  try {
    const u = new URL(trimmed);
    const fromPath = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (fromPath) return fromPath[1];
    const idParam = u.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) return idParam;
  } catch {
    /* not a valid URL */
  }

  const fallback = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fallback) return fallback[1];

  return null;
}

export function maskGoogleDriveApiKey(key: string): string {
  const t = key.trim();
  if (!t) return '';
  if (t.length <= 8) return '****';
  return `${t.slice(0, 4)}****${t.slice(-4)}`;
}
