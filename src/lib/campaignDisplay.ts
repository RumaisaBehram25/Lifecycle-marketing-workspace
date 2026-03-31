/**
 * Normalize Braze `channel` strings for Campaigns UI (badges, gradients, icons).
 * Braze returns values like `email`, `android_push`, `web_push`, `sms`, `in_app_message`.
 */
export type CampaignChannelUi = 'email' | 'push' | 'inapp';

const PREVIEW_FALLBACK = 'No preview available';

export function normalizeCampaignChannel(raw: string | null | undefined): CampaignChannelUi {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return 'email';
  if (s === 'email' || s.includes('email')) return 'email';
  if (
    s.includes('in_app') ||
    s.includes('in-app') ||
    s === 'content_card' ||
    s === 'inapp'
  )
    return 'inapp';
  if (s.includes('push') || s === 'sms' || s.includes('android') || s.includes('ios') || s.includes('web_push'))
    return 'push';
  return 'email';
}

/**
 * Braze sync stores open_rate / click_rate as 0–1 fractions. Older rows might be 0–100.
 */
export function formatCampaignRate(value: number | string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const pct = n <= 1 && n >= 0 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

function trimText(v: unknown): string {
  if (v == null) return '';
  if (typeof v !== 'string') return '';
  return sanitizeCampaignDisplayText(v);
}

function truncateForPreview(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

export interface CampaignPreviewFields {
  subject?: string | null;
  push_title?: string | null;
  preheader?: string | null;
  push_body?: string | null;
  creative_preview?: string | null;
  description?: string | null;
  /** Campaign display name — last resort before global fallback. */
  name?: string | null;
}

/**
 * Primary preview line for cards, heroes, and modal summary.
 * Priority: subject → push_title → preheader → push_body → creative_preview → description → fallback.
 */
export function getCampaignPreviewLine(fields: CampaignPreviewFields, maxLen = 280): string {
  const subject = trimText(fields.subject);
  if (subject) return truncateForPreview(subject, maxLen);

  const pushTitle = trimText(fields.push_title);
  if (pushTitle) return truncateForPreview(pushTitle, maxLen);

  const preheader = trimText(fields.preheader);
  if (preheader) return truncateForPreview(preheader, maxLen);

  const pushBody = trimText(fields.push_body);
  if (pushBody) return truncateForPreview(pushBody, maxLen);

  const creative = trimText(fields.creative_preview);
  if (creative) return truncateForPreview(creative, maxLen);

  const description = trimText(fields.description);
  if (description) return truncateForPreview(description, maxLen);

  const name = trimText(fields.name);
  if (name) return truncateForPreview(name, maxLen);

  return PREVIEW_FALLBACK;
}

/** @deprecated Use getCampaignPreviewLine — kept for incremental refactors */
export const deriveCreativeSummary = getCampaignPreviewLine;

const SEARCH_MAX = 4000;

/** Single lowercased blob for filtering / search (memoize per row at map time). */
export function buildCampaignSearchIndex(fields: {
  name: string;
  subject?: string | null;
  push_title?: string | null;
  push_body?: string | null;
  creative_preview?: string | null;
  preheader?: string | null;
}): string {
  const parts = [
    fields.name,
    trimText(fields.subject),
    trimText(fields.push_title),
    trimText(fields.push_body),
    trimText(fields.creative_preview),
    trimText(fields.preheader),
  ].filter(Boolean);
  return parts.join('\n').toLowerCase().slice(0, SEARCH_MAX);
}

/** Structured fallbacks for modal “subject” row (email / generic). */
export function getCampaignSubjectDisplay(fields: CampaignPreviewFields): string {
  const s = trimText(fields.subject);
  if (s) return s;
  const pt = trimText(fields.push_title);
  if (pt) return pt;
  return getCampaignPreviewLine(fields, 200);
}

/** Secondary line: preheader, then push body snippet. */
export function getCampaignSecondaryLine(fields: CampaignPreviewFields): string | undefined {
  const ph = trimText(fields.preheader);
  if (ph) return ph;
  const pb = trimText(fields.push_body);
  if (pb) return truncateForPreview(pb, 240);
  return undefined;
}

/**
 * Strip invisible/formatting characters ESPs embed in subject lines and preheaders
 * (zero-width spaces, word joiners, bidi marks, odd Unicode spaces).
 */
export function sanitizeCampaignDisplayText(input: string | null | undefined): string {
  if (input == null || typeof input !== 'string') return '';
  // Some Braze payloads contain full HTML/doctype; strip tags/scripts/styles for UI safety/readability.
  let s = input
    .replace(/<!doctype[\s\S]*?>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD\u034F\u061C]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function extractPreviewImageUrl(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const direct = raw.preview_image_url ?? raw.image_url ?? raw.thumbnail_url;
  if (typeof direct === 'string' && direct.startsWith('http')) return direct;
  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === 'object') {
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== 'object') continue;
      const m = msg as Record<string, unknown>;
      const u = m.big_image ?? m.image_url ?? m.thumbnail_url ?? m.url;
      if (typeof u === 'string' && (u.startsWith('http') || u.startsWith('//'))) return u.startsWith('//') ? `https:${u}` : u;
    }
  }
  return undefined;
}
