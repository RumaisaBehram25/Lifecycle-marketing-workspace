/** Supabase Storage public object URLs include this path segment (Image Transformation query params apply). */
const PUBLIC_OBJECT_SEGMENT = '/storage/v1/object/public/';

export type CampaignImageDisplayVariant = 'thumbnail' | 'default' | 'detail';

const WIDTH_PX: Record<CampaignImageDisplayVariant, number> = {
  thumbnail: 400,
  default: 800,
  detail: 1200,
};

export function isSupabaseStoragePublicObjectUrl(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith('data:')) return false;
  try {
    const abs = t.startsWith('//') ? `https:${t}` : t;
    const u = new URL(abs);
    return u.pathname.includes(PUBLIC_OBJECT_SEGMENT);
  } catch {
    return false;
  }
}

/**
 * Appends CDN-style params for Supabase Image Transformation on public bucket URLs only.
 * External URLs (Braze, imgix, etc.) are returned unchanged.
 */
export function campaignImageDisplayUrl(
  url: string | null | undefined,
  variant: CampaignImageDisplayVariant = 'default',
): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return undefined;
  if (!isSupabaseStoragePublicObjectUrl(raw)) return raw;
  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const u = new URL(abs);
    u.searchParams.set('width', String(WIDTH_PX[variant]));
    u.searchParams.set('quality', '80');
    u.searchParams.set('format', 'webp');
    return u.toString();
  } catch {
    return raw;
  }
}
