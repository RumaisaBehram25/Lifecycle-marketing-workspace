import { campaignImageDisplayUrl, isSupabaseStoragePublicObjectUrl } from '@/lib/campaignCreativeImageUrl';

/**
 * Normalize Braze `channel` strings for Campaigns UI (badges, gradients, icons).
 * Braze returns values like `email`, `android_push`, `web_push`, `sms`, `in_app_message`.
 */
export type CampaignChannelUi = 'email' | 'push' | 'inapp' | 'sms';

const PREVIEW_FALLBACK = 'No preview available';

export function normalizeCampaignChannel(raw: string | null | undefined): CampaignChannelUi {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return 'email';
  if (s === 'email' || s.includes('email')) return 'email';
  if (s === 'sms' || s.includes('sms')) return 'sms';
  if (
    s.includes('in_app') ||
    s.includes('in-app') ||
    s === 'content_card' ||
    s === 'inapp'
  )
    return 'inapp';
  if (s.includes('push') || s.includes('android') || s.includes('ios') || s.includes('web_push')) return 'push';
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

/** True if Braze / Liquid-style `{% … %}` or `{{ … }}` appears in the string. */
export function containsBrazeLiquidSyntax(input: string | null | undefined): boolean {
  if (input == null || typeof input !== 'string') return false;
  return /\{%/.test(input) || /\{\{/.test(input);
}

const LIQUID_TAG_RE = /\{%[\s\S]*?%\}/g;

/**
 * Find the index of the first `}` in the closing `}}` for a `{{ … }}` tag at `openIdx`,
 * where `openIdx` points at the first `{` of `{{`. Handles `}` inside `${ … }` (Braze
 * `{{custom_attribute.${username}}}`), which a naive `*?\}\}` regex breaks on.
 */
function findClosingDoubleBraceLiquid(html: string, openIdx: number): number {
  if (html[openIdx] !== '{' || html[openIdx + 1] !== '{') return -1;
  let i = openIdx + 2;
  let depth = 0;
  while (i < html.length - 1) {
    if (html[i] === '$' && html[i + 1] === '{') {
      depth++;
      i += 2;
      continue;
    }
    if (depth > 0 && html[i] === '}') {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && html[i] === '}' && html[i + 1] === '}') {
      return i;
    }
    i++;
  }
  return -1;
}

function replaceLiquidDoubleBraceTags(html: string, replaceTag: (fullTag: string) => string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const j = html.indexOf('{{', i);
    if (j === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, j);
    const close = findClosingDoubleBraceLiquid(html, j);
    if (close === -1) {
      out += html.slice(j);
      break;
    }
    const fullTag = html.slice(j, close + 2);
    out += replaceTag(fullTag);
    i = close + 2;
  }
  return out;
}

const LIQUID_DEFAULT_RE = /\|\s*default:\s*(['"])([\s\S]*?)\1/i;

function escapeHtmlPreviewText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Turn one `{{ … }}` tag into safe preview text (Braze / Liquid). Used for iframe HTML only.
 */
function replaceBrazeLiquidVariableTagForPreview(fullTag: string): string {
  const inner = fullTag
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '')
    .trim();

  const defaultM = inner.match(LIQUID_DEFAULT_RE);
  if (defaultM?.[2] != null) {
    return escapeHtmlPreviewText(defaultM[2].trim());
  }

  if (/content_blocks\./i.test(inner)) return '';
  if (/\$\{\s*email_footer\s*\}/i.test(inner)) return '';
  if (/custom_attribute\.\$\{/i.test(inner) && /\busername\b/i.test(inner)) {
    return 'there';
  }

  return '\u2026';
}

/**
 * Remove Liquid `{% … %}` and replace `{{ … }}` in email HTML so iframe previews do not show raw Braze syntax
 * (e.g. `{{custom_attribute.${username}}}`, `{{content_blocks.${Email-Footer-Global}}}`).
 */
export function stripBrazeLiquidFromEmailHtmlForPreview(html: string): string {
  let s = html.replace(LIQUID_TAG_RE, '');
  s = replaceLiquidDoubleBraceTags(s, replaceBrazeLiquidVariableTagForPreview);
  // Safety: if any legacy partial tag leaked "…}" next to an ellipsis, strip the stray brace
  s = s.replace(/\u2026\s*\}/g, '\u2026');
  return s;
}

/**
 * Option A: prefer the `{% else %} … {% endif %}` branch (common Braze localization),
 * then strip remaining `{% … %}` and `{{ … }}` so UI shows readable copy.
 */
export function stripBrazeLiquidForDisplay(input: string): string {
  let s = input;
  const elseMatch = s.match(/\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/i);
  if (elseMatch) {
    s = elseMatch[1].trim();
  }
  s = s.replace(LIQUID_TAG_RE, ' ');
  s = replaceLiquidDoubleBraceTags(s, () => ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
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
 * (zero-width spaces, word joiners, bidi marks, odd Unicode spaces), then Braze Liquid
 * so subject/preheader and previews show readable text instead of raw `{% … %}` / `{{ … }}`.
 */
export function sanitizeCampaignDisplayWithMeta(input: string | null | undefined): {
  text: string;
  hadLiquid: boolean;
} {
  if (input == null || typeof input !== 'string') return { text: '', hadLiquid: false };
  const hadLiquid = containsBrazeLiquidSyntax(input);
  // Some Braze payloads contain full HTML/doctype; strip tags/scripts/styles for UI safety/readability.
  let s = input
    .replace(/<!doctype[\s\S]*?>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD\u034F\u061C]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = stripBrazeLiquidForDisplay(s);
  return { text: s, hadLiquid };
}

export function sanitizeCampaignDisplayText(input: string | null | undefined): string {
  return sanitizeCampaignDisplayWithMeta(input).text;
}

export function normalizeImageUrlString(u: string): string | undefined {
  const t = u.trim();
  if (!t) return undefined;
  if (t.startsWith('//')) return `https:${t}`;
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  return undefined;
}

/**
 * Grid guard: URL path/query suggests a logo / wordmark / icon / brand mark (not a campaign hero).
 */
export function isLikelyLogo(url: string): boolean {
  const raw = url.trim().toLowerCase();
  if (!raw) return false;
  let path = raw;
  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const u = new URL(abs);
    path = `${u.pathname}${u.search}`.toLowerCase();
  } catch {
    path = raw.toLowerCase();
  }
  return /(logo|wordmark|icon|brand)/.test(path);
}

/**
 * Linktree / link-in-bio assets: same brand often uses linktr.ee, linktree.com, lnk.bio, or a generic CDN
 * whose **path** still contains `linktr` / wordmark segments — expand beyond a single hostname substring.
 */
function isLinktreeHostname(url: string): boolean {
  try {
    const abs = url.trim().startsWith('//') ? `https:${url.trim()}` : url.trim();
    const u = new URL(abs);
    const h = u.hostname.toLowerCase();
    if (/(^|\.)linktr(?:ee)?\.|(^|\.)linktree\.|(^|\.)lnk\.bio|(^|\.)linkin\.bio/i.test(h)) {
      return true;
    }
    const pathQ = `${u.pathname}${u.search}`.toLowerCase();
    if (
      /(^|[/._-])linktr(?:ee)?([/._-]|[.][a-z]{2,4}(\?|#|$))|linktree[-_]?(logo|wordmark|brand|header|nav)/i.test(
        pathQ,
      )
    ) {
      return true;
    }
    return false;
  } catch {
    return /linktr|linktree|lnk\.bio/i.test(url);
  }
}

/** Stripo email CDN — Linktree (and many brands) host header wordmarks + heroes under `*.stripocdn.email`. */
function isStripoEmailCdnHostname(url: string): boolean {
  try {
    const abs = url.trim().startsWith('//') ? `https:${url.trim()}` : url.trim();
    const h = new URL(abs).hostname.toLowerCase();
    return h === 'stripocdn.email' || h.endsWith('.stripocdn.email');
  } catch {
    return /stripocdn\.email/i.test(url);
  }
}

/**
 * Header logos / social badges / tracking pixels — bad grid thumbnails.
 * Linktree: block logo/icon paths, not the whole CDN (campaign heroes can live on the same hosts).
 */
export function isLikelyNonHeroImageUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw || raw.startsWith('data:')) return true;

  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(abs);
    const host = parsed.hostname.toLowerCase();
    const full = (parsed.pathname + parsed.search).toLowerCase();
    // Wordmark file segments on any CDN (cropped “linktr” art often still named like this)
    if (
      /(^|[/._-])linktr(?:ee)?([/._-]|[.][a-z]{2,4}(\?|#|$))|linktree[-_]?(logo|wordmark|brand|header|nav)/i.test(
        full,
      )
    ) {
      return true;
    }
    if (/linktr|linktree/.test(host)) {
      if (
        /(logo|wordmark|lt-?logo|linktree[-_]?logo|favicon|icon|avatar|badge|social|brand-mark|brand_assets|word-mark|mark\.svg)/i.test(
          full,
        ) ||
        /\/icons?\/|\/avatar|\/profile-image|\/header-/i.test(full)
      ) {
        return true;
      }
      // Nav wordmark assets (cropped “linktr” / brand strip) — path often omits “logo”
      if (
        /(^|[/_-])linktr(?:ee)?([/_-]|[.][a-z]{2,4}(\?|$))/i.test(full) ||
        /(email[-_]?header|header[-_]?image|nav[-_]?brand|brand[-_]?lockup)/i.test(full)
      ) {
        return true;
      }
    }
  } catch {
    /* fall through */
  }

  const u = raw.toLowerCase();
  if (
    /ct\.pinterest|facebook\.com\/tr|google-analytics|googletagmanager|doubleclick\.net\/.*(pixel|track)/i.test(u)
  ) {
    return true;
  }
  if (/\/favicon|apple-touch-icon|\/icons?\//i.test(u)) return true;
  if (/(?:^|[/._-])(logo|wordmark|header|footer|social|badge|icon)[^/]*\.(png|gif|jpg|jpeg|webp|svg)(\?|$)/i.test(u)) {
    return true;
  }
  if (/[?&]s=\d{1,2}(?:&|$)/.test(u)) return true;
  if (/1x1|spacer|blank\.(gif|png)|pixel\.gif|tracking/i.test(u)) return true;
  // Path/query hints (first `<img>` in many emails is logo/header/spacer — not only Linktree)
  if (
    /(?:^|[/._-])(?:logo|wordmark|favicon|spacer|pixel|tracking|avatar)(?:[/._-]|[.?]|$)/i.test(u) ||
    /(?:^|[/._-])icon(?:[/._-]|[.](?:png|gif|svg|webp|ico))(\?|$)/i.test(u) ||
    /\/icons?(?:\/|$)/i.test(u)
  ) {
    return true;
  }
  if (/\.gif(\?|$)/i.test(u) && /(spacer|pixel|blank|1x1|transparent|tracking)/i.test(u)) return true;
  return false;
}

/** Parsed from `<img>` tags or URL paths for scoring / logo detection. */
export interface ImageTagMeta {
  widthHint: number;
  heightHint: number;
  alt?: string;
  className?: string;
  /** Order of this `<img>` in the HTML (later often = main hero below header). */
  index: number;
}

/** e.g. `photo-1200x630.jpg` or `?w=800&h=600` */
function parseDimensionHintsFromUrl(url: string): { w: number; h: number } {
  const pathM = url.match(/(\d{2,4})x(\d{2,4})/);
  if (pathM) {
    const w = parseInt(pathM[1], 10);
    const h = parseInt(pathM[2], 10);
    if (w >= 16 && h >= 16 && w <= 8192 && h <= 8192) return { w, h };
  }
  try {
    const u = url.trim().startsWith('//') ? `https:${url.trim()}` : url.trim();
    const q = new URL(u).searchParams;
    const w = parseInt(q.get('w') || q.get('width') || '', 10);
    const h = parseInt(q.get('h') || q.get('height') || '', 10);
    if (w > 0 && h > 0) return { w, h };
    const ow = parseInt(q.get('ow') || '', 10);
    const oh = parseInt(q.get('oh') || '', 10);
    if (ow > 0 && oh > 0) return { w: ow, h: oh };
  } catch {
    /* ignore */
  }
  return { w: 0, h: 0 };
}

/**
 * Logos, header bars, nav marks, social icons, tiny branding — skip when picking a campaign hero.
 * Uses URL shape, optional `width`/`height`/`alt`/`class` from the tag, and size hints from the URL.
 */
export function isLikelyLogoHeaderOrBranding(url: string, meta?: Partial<ImageTagMeta>): boolean {
  const raw = url.trim();
  if (!raw || raw.startsWith('data:')) return true;

  let w = meta?.widthHint ?? 0;
  let h = meta?.heightHint ?? 0;
  const fromPath = parseDimensionHintsFromUrl(raw);
  if (w <= 0 && fromPath.w > 0) w = fromPath.w;
  if (h <= 0 && fromPath.h > 0) h = fromPath.h;

  const alt = (meta?.alt ?? '').toLowerCase();
  const cls = (meta?.className ?? '').toLowerCase();
  const textBlob = `${alt} ${cls}`;
  if (
    /\b(logo|wordmark|navbar|nav-bar|masthead|social|footer|sponsor|powered|monogram|brand-icon|site-logo)\b/i.test(textBlob)
  ) {
    return true;
  }
  if (/\blinktree\b|\blink\s*in\s*bio\b|\blinktr\b/i.test(textBlob)) {
    return true;
  }

  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(abs);
    const full = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
    if (
      /(logo|wordmark|brand-mark|brand_mark|monogram|favicon|site-icon|site_icon|apple-touch|mstile|navbar|nav-icon|nav_icon|header-|\/header\/|masthead|social[-_]?icon|email[-_]?sig|signature|powered[-_]?by|partner[-_]?badge|sponsor)/i.test(
        full,
      )
    ) {
      return true;
    }
  } catch {
    const u = raw.toLowerCase();
    if (/(logo|wordmark|navbar|masthead|header-|social-icon|brand-mark)/i.test(u)) return true;
  }

  if (w > 0 && h > 0) {
    const area = w * h;
    const minSide = Math.min(w, h);
    const maxSide = Math.max(w, h);
    const ratio = maxSide / Math.max(minSide, 1);
    if (area < 2_000) return true;
    if (minSide <= 28 && maxSide >= 40) return true;
    if (ratio >= 5.5) return true;
    if (h <= 22 && w >= 120) return true;
    if (w <= 22 && h >= 120) return true;
    // Linktree / Stripo: first-slot header is usually a short wordmark strip or small square mark
    const brandCdn0 =
      (isLinktreeHostname(raw) || isStripoEmailCdnHostname(raw)) &&
      typeof meta?.index === 'number' &&
      meta.index === 0;
    if (brandCdn0) {
      if (h <= 72 && w >= 80 && w <= 520) return true;
      if (w <= 200 && h <= 200 && area < 45_000) return true;
      if (h <= 110 && w >= 160 && w / Math.max(h, 1) >= 3.2) return true;
    }
  } else {
    if (/[?&]s=(?:1[0-9]?|2[0-9]?|[1-9])(?:&|$)/i.test(raw)) return true;
    // No dimensions: Linktree first <img> is almost always the nav wordmark in these templates
    if (isLinktreeHostname(raw) && typeof meta?.index === 'number' && meta.index === 0) {
      return true;
    }
  }

  return false;
}

function contentImageMeritScore(url: string, meta?: Partial<ImageTagMeta>): number {
  let w = meta?.widthHint ?? 0;
  let h = meta?.heightHint ?? 0;
  const fromPath = parseDimensionHintsFromUrl(url);
  if (w <= 0 && fromPath.w > 0) w = fromPath.w;
  if (h <= 0 && fromPath.h > 0) h = fromPath.h;

  let area = w > 0 && h > 0 ? w * h : w > 0 ? w * w : h > 0 ? h * h : 0;
  if (area <= 0) area = 40_000;

  let score = area;
  const u = url.toLowerCase();
  const alt = (meta?.alt ?? '').toLowerCase();
  const cls = (meta?.className ?? '').toLowerCase();
  const blob = `${u} ${alt} ${cls}`;

  if (/hero|banner|main|content|body|email|campaign|product|feature|screenshot|mockup|full[-_]?bleed|fullwidth|full-width|primary|lead|story|photo|gallery|device|ui|ux|design|graphic|illustration/i.test(blob)) {
    score += 120_000;
  }
  if ((isLinktreeHostname(url) || isStripoEmailCdnHostname(url)) && area > 0 && area < 14_000) {
    score -= 80_000;
  }
  if (typeof meta?.index === 'number') score += meta.index * 50;
  // Heroes are usually landscape or wide; portrait/small squares read as icons/logos
  if (w > 0 && h > 0) {
    if (w > h) score += 35_000;
    if (w >= 300) score += 25_000;
    if (h > w && Math.max(w, h) < 220) score -= 45_000;
    if (w <= h && w < 140 && h < 420) score -= 30_000;
  }
  return score;
}

/** True when string is suitable for an HTML iframe (not plain-text email copy). */
export function emailLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  return /<(?:[a-z][\w-]*|\/[a-z][\w-]*|!doctype)/i.test(t);
}

/** Braze `/campaigns/details` sometimes nests email copy under `messages.{id}.email` (body / html_body). */
function pushEmailBodiesFromMessageVariant(m: Record<string, unknown>, push: (v: unknown) => void) {
  push(m.html_body);
  push(m.html_content);
  push(m.html);
  push(m.amp_body);
  if (typeof m.body === 'string' && m.body.trim()) {
    const b = m.body.trim();
    if (emailLooksLikeHtml(b)) push(m.body);
  }
  const nested = m.email;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const e = nested as Record<string, unknown>;
    push(e.html_body);
    push(e.html_content);
    push(e.html);
    if (typeof e.body === 'string' && e.body.trim()) {
      const b = e.body.trim();
      if (emailLooksLikeHtml(b)) push(e.body);
    }
  }
}

function collectEmailHtmlSourceStrings(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  push(raw.email_html_preview);
  push(raw.html_body);
  push(raw.html_content);
  push(raw.html);

  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === 'object') {
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== 'object') continue;
      const m = msg as Record<string, unknown>;
      if (brazeMessageIsNonEmail(String(m.channel ?? ''))) continue;
      pushEmailBodiesFromMessageVariant(m, push);
    }
  }
  return out;
}

/** True when `raw_details` has no keys (or null) — Braze details not loaded yet. */
export function isRawDetailsEmpty(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw !== 'object' || Array.isArray(raw)) return true;
  return Object.keys(raw as Record<string, unknown>).length === 0;
}

/**
 * Longest HTML fragment suitable for iframe preview / &lt;img&gt; extraction.
 * Ignores plain-text `body` (common Braze shape) so the modal does not render a wall of text.
 */
export function pickBestEmailHtmlString(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const all = collectEmailHtmlSourceStrings(raw);
  const htmlOnly = all.filter(emailLooksLikeHtml);
  if (htmlOnly.length === 0) return undefined;
  return htmlOnly.sort((a, b) => b.length - a.length)[0];
}

/**
 * When strict {@link emailLooksLikeHtml} finds nothing, prefer the longest fragment that still looks like
 * ESP markup (table/div/body) so the modal can show a full HTML preview instead of a header logo image.
 */
function pickLongestRelaxedEmailMarkupFragment(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const all = collectEmailHtmlSourceStrings(raw);
  const relaxed = all.filter((s) => {
    const t = s.trim();
    if (t.length < 60) return false;
    return /<(?:table|tbody|tr|td|div|center|html|body|style|img|!doctype)/i.test(t);
  });
  if (relaxed.length === 0) return undefined;
  return relaxed.sort((a, b) => b.length - a.length)[0];
}

/**
 * Longest usable HTML blob for **grid** hero extraction: strict → relaxed → short `email_html_preview` with an `<img>`.
 */
export function pickEmailHtmlForGridHeroExtraction(
  raw: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const fromStrict = pickBestEmailHtmlString(raw);
  if (fromStrict) return fromStrict;
  const relaxed = pickLongestRelaxedEmailMarkupFragment(raw);
  if (relaxed) return relaxed;
  const ep = raw.email_html_preview;
  if (typeof ep === 'string') {
    const t = ep.trim();
    if (t.length >= 20 && /<img\b/i.test(t)) return t;
  }
  return undefined;
}

/** True when we can render `srcDoc` in the campaign modal iframe (strict or relaxed markup). */
function isUsableEmailModalHtml(s: string | undefined): boolean {
  if (!s?.trim()) return false;
  const t = s.trim();
  if (emailLooksLikeHtml(t)) return true;
  return t.length >= 60 && /<(?:table|tbody|tr|td|div|center|html|body|style|img|!doctype)/i.test(t);
}

/** Aligns with sync-braze `brazeMessageIsNonEmail` — empty channel is treated as eligible for email HTML/image. */
function brazeMessageIsNonEmail(ch: string): boolean {
  if (!ch) return false;
  const c = ch.toLowerCase();
  if (c === 'email' || c.includes('email')) return false;
  return (
    c.includes('push') ||
    c.includes('in_app') ||
    c.includes('in-app') ||
    c === 'content_card' ||
    c === 'webhook' ||
    c === 'sms' ||
    c === 'whatsapp'
  );
}

/** Ordered fields — we may skip early entries when they’re logos (handled by caller). */
function imageUrlCandidatesFromMessage(m: Record<string, unknown>): string[] {
  const keys: (keyof Record<string, unknown>)[] = [
    'big_image',
    'banner_image',
    'hero_image',
    'large_image',
    'image_url',
    'hero_image_url',
    'preview_image_url',
    'thumbnail_url',
    'inline_image',
    'url',
  ];
  const out: string[] = [];
  for (const k of keys) {
    const c = m[k];
    if (typeof c === 'string') {
      const n = normalizeImageUrlString(c);
      if (n) out.push(n);
    }
  }
  return out;
}

/** Braze `/campaigns/details` often nests email assets under `messages.{id}.email`. */
function imageUrlCandidatesFromMessageDeep(m: Record<string, unknown>): string[] {
  const out = imageUrlCandidatesFromMessage(m);
  const nested = m.email;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const u of imageUrlCandidatesFromMessage(nested as Record<string, unknown>)) {
      out.push(u);
    }
  }
  return out;
}

/** @deprecated Prefer {@link extractBestImageUrlFromHtml} — no longer “first &lt;img&gt;” (avoids header logos). */
export function extractFirstImageUrlFromHtml(html: string | undefined): string | undefined {
  return extractBestImageUrlFromHtml(html);
}

function largestUrlFromSrcset(srcset: string): { url: string; widthHint: number } | undefined {
  let bestUrl: string | undefined;
  let bestW = 0;
  for (const part of srcset.split(',')) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length < 1) continue;
    const candidate = bits[0];
    const desc = bits[1] || '';
    const wM = desc.match(/^(\d+)w$/i);
    const w = wM ? parseInt(wM[1], 10) : 0;
    const xM = desc.match(/^([\d.]+)x$/i);
    const scale = xM ? parseFloat(xM[1]) : 0;
    const score = w > 0 ? w : scale > 1 ? Math.round(scale * 1000) : 0;
    if (score >= bestW) {
      bestW = score;
      bestUrl = candidate;
    }
  }
  if (!bestUrl) return undefined;
  const n = normalizeImageUrlString(bestUrl.trim());
  if (!n) return undefined;
  return { url: n, widthHint: bestW };
}

function collectUrlsFromImgTag(tag: string): {
  url: string;
  widthHint: number;
  heightHint: number;
  alt?: string;
  className?: string;
}[] {
  const out: {
    url: string;
    widthHint: number;
    heightHint: number;
    alt?: string;
    className?: string;
  }[] = [];
  const wM = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
  const hM = tag.match(/\bheight\s*=\s*["']?(\d+)/i);
  const w = wM ? parseInt(wM[1], 10) : 0;
  const h = hM ? parseInt(hM[1], 10) : 0;
  const altM = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
  const classM = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i);
  const alt = altM?.[1]?.trim();
  const className = classM?.[1]?.trim();

  const seen = new Set<string>();
  const pushUrl = (raw: string) => {
    const n = normalizeImageUrlString(raw.trim());
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push({ url: n, widthHint: w, heightHint: h, alt, className });
    }
  };

  /**
   * Lazy-loaded email HTML often puts the real asset on `data-src` / `data-original` and a 1×1 or spacer on `src`.
   * Read lazy attrs before `src` so grid thumbnails resolve a real URL.
   */
  for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-original-src', 'src']) {
    const re = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
    const m = tag.match(re);
    if (m?.[1]) pushUrl(m[1]);
  }

  const setM = tag.match(/srcset\s*=\s*["']([^"']+)["']/i);
  if (setM?.[1]) {
    const lg = largestUrlFromSrcset(setM[1]);
    if (lg && !seen.has(lg.url)) {
      out.push({ url: lg.url, widthHint: lg.widthHint, heightHint: 0, alt, className });
      seen.add(lg.url);
    }
  }
  return out;
}

const HERO_SECTION_CTX =
  /\b(?:class|id)\s*=\s*["'][^"']*?(hero|banner|feature|header-image|main-image)/i;

/** Tight `src` URL heuristic (logo-ish path segments); separate from {@link isLikelyLogo}. */
function imgSrcLooksLikeLogoPath(url: string): boolean {
  return /(logo|wordmark|header|icon|avatar)/i.test(url.trim());
}

function parsePxFromImgStyle(style: string | undefined, prop: 'width' | 'height'): number {
  if (!style) return 0;
  const re = prop === 'width' ? /width\s*:\s*(\d+)\s*px/i : /height\s*:\s*(\d+)\s*px/i;
  const m = style.match(re);
  return m ? parseInt(m[1], 10) : 0;
}

function tagPixelDimensions(tag: string): { w: number; h: number } {
  const wM = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
  const hM = tag.match(/\bheight\s*=\s*["']?(\d+)/i);
  let w = wM ? parseInt(wM[1], 10) : 0;
  let h = hM ? parseInt(hM[1], 10) : 0;
  const styleM = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  const style = styleM?.[1];
  if (style) {
    if (w <= 0) w = parsePxFromImgStyle(style, 'width');
    if (h <= 0) h = parsePxFromImgStyle(style, 'height');
  }
  return { w, h };
}

function isTinyImgTagDims(w: number, h: number): boolean {
  if (w <= 0 && h <= 0) return false;
  if (w > 0 && h > 0) return Math.max(w, h) <= 80;
  if (w > 0) return w <= 80;
  if (h > 0) return h <= 80;
  return false;
}

function hasHeroRegionContextBefore(html: string, tagIndex: number): boolean {
  if (tagIndex < 0) return false;
  const prefix = html.slice(Math.max(0, tagIndex - 900), tagIndex);
  return HERO_SECTION_CTX.test(prefix);
}

/**
 * Best **grid** hero URL from email HTML — skips wordmarks, tiny (≤80px) images, and logo-like `src` paths;
 * prefers large dimensions and `class`/`id` context matching hero/banner/feature regions.
 */
export function extractHeroImageFromHtml(html: string): string | null {
  if (!html || typeof html !== 'string') return null;

  const tags = html.match(/<img\b[^>]*>/gi);
  if (!tags?.length) return null;

  let best: { url: string; score: number } | undefined;
  let scanIdx = 0;

  for (const tag of tags) {
    const tagIndex = html.indexOf(tag, scanIdx);
    scanIdx = tagIndex >= 0 ? tagIndex + 1 : scanIdx + 1;
    const { w: tw, h: th } = tagPixelDimensions(tag);
    const heroCtx = hasHeroRegionContextBefore(html, tagIndex);

    for (const part of collectUrlsFromImgTag(tag)) {
      const rawUrl = part.url;
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) continue;
      if (isEmailPreviewFallbackHardReject(rawUrl)) continue;
      if (isLikelyLogo(rawUrl) || imgSrcLooksLikeLogoPath(rawUrl)) continue;

      const w = Math.max(tw, part.widthHint || 0);
      const h = Math.max(th, part.heightHint || 0);
      if (isTinyImgTagDims(w, h)) continue;

      let score = Math.max(w, h, 1);
      if (w > 0 && h > 0) score = w * h;
      if (heroCtx) score += 250_000;
      const metaBlob = `${part.alt ?? ''} ${part.className ?? ''}`;
      if (/hero|banner|feature|main-image|header-image/i.test(metaBlob)) score += 120_000;

      if (!best || score > best.score) best = { url: rawUrl, score };
    }
  }

  return best?.url ?? null;
}

/**
 * Braze canvas step message: same **card** intent as the campaigns grid — prefer a real hero from
 * email (or HTML-like) body, and only use `image_url` when its path is not logo-like.
 */
export function resolveLifecycleMessageCardImageUrl(
  message: { html_content?: string; image_url?: string; body?: string } | null | undefined,
): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const raw: Record<string, unknown> = {};
  const hc = typeof message.html_content === 'string' ? message.html_content.trim() : '';
  const bd = typeof message.body === 'string' ? message.body.trim() : '';
  if (hc) raw.html_content = hc;
  if (
    bd &&
    (emailLooksLikeHtml(bd) ||
      (bd.length >= 48 && /<(?:table|tbody|tr|td|div|center|html|body|img)\b/i.test(bd)))
  ) {
    raw.html_body = bd;
  }
  const htmlBlob = pickEmailHtmlForGridHeroExtraction(raw);
  const hero = htmlBlob ? extractHeroImageFromHtml(htmlBlob) : null;
  const rawImg = typeof message.image_url === 'string' ? message.image_url.trim() : '';
  const guarded = rawImg && !isLikelyLogo(rawImg) ? normalizeImageUrlString(rawImg) : undefined;
  return (hero ?? guarded) || undefined;
}

function collectBackgroundImageUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /url\(\s*["']?([^"')\s>]+)["']?\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = m[1]?.trim();
    if (t && !t.startsWith('data:')) urls.push(t);
  }
  return urls;
}

function takeBetterPreviewCandidate(
  best: { url: string; score: number } | undefined,
  url: string,
  meta?: Partial<ImageTagMeta>,
): { url: string; score: number } | undefined {
  const n = normalizeImageUrlString(url);
  if (!n || isLikelyNonHeroImageUrl(n)) return best;
  if (isLikelyLogoHeaderOrBranding(n, meta)) return best;
  const score = contentImageMeritScore(n, meta);
  if (!best || score > best.score) return { url: n, score };
  return best;
}

/**
 * True when Braze `raw_details` indicates an email campaign (hero pick + header-logo fallback apply here only).
 */
export function rawDetailsIsEmailCampaign(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw || typeof raw !== 'object') return false;
  if (typeof raw.email_html_preview === 'string' && raw.email_html_preview.trim()) return true;

  const ch = raw.channels;
  if (Array.isArray(ch) && ch.some((c) => String(c).toLowerCase().includes('email'))) return true;
  if (typeof raw.channel === 'string' && raw.channel.toLowerCase().includes('email')) return true;

  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === 'object' && !Array.isArray(messages)) {
    for (const key of Object.keys(messages)) {
      if (key.toLowerCase().includes('email')) return true;
    }
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== 'object') continue;
      const c = String((msg as Record<string, unknown>).channel ?? '').toLowerCase();
      if (c === 'email' || c.includes('email')) return true;
    }
  }
  return false;
}

/**
 * Reject only obvious junk for email header/logo fallback — does not treat “logo” paths as non-hero.
 */
function isEmailPreviewFallbackHardReject(url: string): boolean {
  const raw = url.trim();
  if (!raw || raw.startsWith('data:')) return true;
  const u = raw.toLowerCase();
  if (
    /ct\.pinterest|facebook\.com\/tr|google-analytics|googletagmanager|doubleclick\.net\/.*(pixel|track)/i.test(u)
  ) {
    return true;
  }
  if (/1x1|spacer|blank\.(gif|png)|pixel\.gif|\/tracking\b/i.test(u)) return true;
  if (/\/favicon|apple-touch-icon/i.test(u)) return true;
  if (/[?&]s=(?:1[0-9]?|2[0-9]?|[1-9])(?:&|$)/i.test(raw)) return true;
  return false;
}

export type PickBestImageUrlFromHtmlOptions = {
  /**
   * When no hero qualifies, use the best available &lt;img&gt; (e.g. header/logo) for email campaigns only.
   */
  emailHeaderLogoFallback?: boolean;
};

/**
 * If hero scoring found nothing, pick a header/logo-style &lt;img&gt; (largest area hint wins; tie → earlier in HTML).
 */
function pickEmailHeaderLogoFallbackFromHtml(
  html: string | undefined,
): { url: string; score: number } | undefined {
  if (!html || typeof html !== 'string') return undefined;
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  let bestUrl: string | undefined;
  let bestArea = -1;
  let bestOrder = Number.MAX_SAFE_INTEGER;
  let order = 0;
  for (const tag of tags) {
    const parts = collectUrlsFromImgTag(tag);
    for (const p of parts) {
      const n = normalizeImageUrlString(p.url);
      if (!n || isEmailPreviewFallbackHardReject(n)) continue;
      if (!n.startsWith('http://') && !n.startsWith('https://')) continue;
      const w = p.widthHint;
      const h = p.heightHint;
      const area = w > 0 && h > 0 ? w * h : w > 0 ? w * w : h > 0 ? h * h : 0;
      const better =
        bestUrl === undefined ||
        area > bestArea ||
        (area === bestArea && order < bestOrder);
      if (better) {
        bestUrl = n;
        bestArea = area;
        bestOrder = order;
      }
      order++;
    }
  }
  if (!bestUrl) return undefined;
  return { url: bestUrl, score: 0 };
}

/** True when any &lt;img&gt; resolves to an http(s) URL (after lazy-attr extraction). */
function htmlHasImgWithHttpSrc(html: string): boolean {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    for (const p of collectUrlsFromImgTag(tag)) {
      const n = normalizeImageUrlString(p.url);
      if (n && (n.startsWith('http://') || n.startsWith('https://'))) return true;
    }
  }
  return false;
}

/**
 * Best &lt;img&gt; / CSS background URL from email HTML: skips logos and small branding, prefers larger
 * content/UI-style images; later &lt;img&gt; tags get a tie-break bonus (hero often below the header).
 */
export function pickBestImageUrlFromHtml(
  html: string | undefined,
  options?: PickBestImageUrlFromHtmlOptions,
): { url: string; score: number } | undefined {
  if (!html || typeof html !== 'string') return undefined;

  let best: { url: string; score: number } | undefined;
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  const hasMultipleImgTags = tags.length >= 2;
  let imgTagIndex = 0;
  for (const tag of tags) {
    const parts = collectUrlsFromImgTag(tag);
    for (const p of parts) {
      if (isLikelyNonHeroImageUrl(p.url)) continue;
      const w = p.widthHint;
      const h = p.heightHint;
      const area = w > 0 && h > 0 ? w * h : w > 0 ? w * w : h > 0 ? h * h : 0;
      if (
        (isLinktreeHostname(p.url) || isStripoEmailCdnHostname(p.url)) &&
        area > 0 &&
        area < 14_000
      ) {
        continue;
      }
      // Linktree marketing mail: first <img> is almost always the nav wordmark — skip even when it is the only <img>
      // (hero is often a background `url()` or we show no thumbnail rather than the logo).
      if (imgTagIndex === 0 && isLinktreeHostname(p.url)) continue;
      // Stripo-hosted Linktree templates: same pattern, but only skip when another <img> exists (single-image emails may be the hero only).
      if (hasMultipleImgTags && imgTagIndex === 0 && isStripoEmailCdnHostname(p.url)) continue;
      const meta: Partial<ImageTagMeta> = {
        widthHint: w,
        heightHint: h,
        alt: p.alt,
        className: p.className,
        index: imgTagIndex,
      };
      if (isLikelyLogoHeaderOrBranding(p.url, meta)) continue;
      best = takeBetterPreviewCandidate(best, p.url, meta);
    }
    imgTagIndex++;
  }

  let bgIdx = 0;
  for (const u of collectBackgroundImageUrls(html)) {
    const n = normalizeImageUrlString(u);
    if (!n || isLikelyNonHeroImageUrl(n)) continue;
    const meta: Partial<ImageTagMeta> = {
      widthHint: 400,
      heightHint: 300,
      index: imgTagIndex + bgIdx,
    };
    bgIdx++;
    if (isLikelyLogoHeaderOrBranding(n, meta)) continue;
    best = takeBetterPreviewCandidate(best, n, meta);
  }

  if (best) return best;
  if (options?.emailHeaderLogoFallback) {
    return pickEmailHeaderLogoFallbackFromHtml(html);
  }
  return undefined;
}

/** @see {@link pickBestImageUrlFromHtml} */
export function extractBestImageUrlFromHtml(html: string | undefined): string | undefined {
  return pickBestImageUrlFromHtml(html)?.url;
}

/**
 * Best-effort preview image URL from Braze `raw_details` / campaign JSON.
 * Mirrors enrichment in `sync-braze` (messages.*, top-level).
 */
export function extractPreviewImageUrl(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const uploaded =
    typeof raw.preview_image_url === 'string'
      ? raw.preview_image_url.trim()
      : typeof raw.image_url === 'string'
        ? raw.image_url.trim()
        : '';
  if (uploaded && isSupabaseStoragePublicObjectUrl(uploaded)) {
    return uploaded;
  }

  const htmlBlob = pickBestEmailHtmlString(raw);
  if (htmlBlob) {
    const fromHtml = pickBestImageUrlFromHtml(htmlBlob, {
      emailHeaderLogoFallback: rawDetailsIsEmailCampaign(raw) && htmlHasImgWithHttpSrc(htmlBlob),
    });
    if (fromHtml?.url) {
      // Real HTML present: Braze `preview_image_url` / message fields usually duplicate the first `<img>` (Linktree logo).
      return fromHtml.url;
    }
  }

  let best: { url: string; score: number } | undefined;
  let order = 0;

  const direct = raw.preview_image_url ?? raw.image_url ?? raw.thumbnail_url;
  if (typeof direct === 'string') {
    best = takeBetterPreviewCandidate(best, direct, { index: order });
    order++;
  }

  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === 'object') {
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== 'object') continue;
      const m = msg as Record<string, unknown>;
      for (const candidate of imageUrlCandidatesFromMessage(m)) {
        best = takeBetterPreviewCandidate(best, candidate, { index: order });
        order++;
      }
    }
  }

  return best?.url;
}

/**
 * **Grid / list card thumbnails only** — more permissive than {@link extractPreviewImageUrl} (which skips
 * many Braze/partner URLs and small first-&lt;img&gt; cases so the email modal is not a header logo).
 * Rejects only obvious tracking/spacers via {@link isEmailPreviewFallbackHardReject}.
 */
export function extractPermissiveCardPreviewImageUrl(
  raw: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const isCardSuitableUrl = (n: string, meta?: Partial<ImageTagMeta>): boolean => {
    if (!n || isEmailPreviewFallbackHardReject(n)) return false;
    if (isLikelyNonHeroImageUrl(n)) return false;
    if (isLikelyLogoHeaderOrBranding(n, meta)) return false;
    return true;
  };

  for (const key of ['preview_image_url', 'image_url', 'thumbnail_url'] as const) {
    const v = raw[key];
    if (typeof v !== 'string') continue;
    const n = normalizeImageUrlString(v.trim());
    if (n && isCardSuitableUrl(n)) return n;
  }

  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === 'object') {
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== 'object') continue;
      for (const candidate of imageUrlCandidatesFromMessageDeep(msg as Record<string, unknown>)) {
        const n = normalizeImageUrlString(candidate);
        if (n && isCardSuitableUrl(n)) return n;
      }
    }
  }

  let htmlBlob =
    pickBestEmailHtmlString(raw) ?? pickLongestRelaxedEmailMarkupFragment(raw) ?? undefined;
  if (!htmlBlob && typeof raw.email_html_preview === 'string') {
    const ep = raw.email_html_preview.trim();
    // Short sync snippets can still contain the hero `<img>` (strict/relaxed picks require longer blobs).
    if (ep.length >= 20 && /<img\b/i.test(ep)) htmlBlob = ep;
  }
  if (!htmlBlob) return undefined;

  // Card surface: never use header-logo fallback (that is what surfaces Linktree wordmarks on the grid).
  const fromHero = pickBestImageUrlFromHtml(htmlBlob, { emailHeaderLogoFallback: false });
  if (fromHero?.url && isCardSuitableUrl(fromHero.url)) return fromHero.url;

  const allImgTags = htmlBlob.match(/<img\b[^>]*>/gi) ?? [];
  const hasMultipleImgTags = allImgTags.length >= 2;
  let imgTagIndex = 0;
  let bestCard: { url: string; score: number } | undefined;
  for (const tag of allImgTags) {
    const wM = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const hM = tag.match(/\bheight\s*=\s*["']?(\d+)/i);
    const w = wM ? parseInt(wM[1], 10) : 0;
    const h = hM ? parseInt(hM[1], 10) : 0;
    const altM = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    const classM = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i);
    const alt = altM?.[1]?.trim();
    const className = classM?.[1]?.trim();
    for (const p of collectUrlsFromImgTag(tag)) {
      const n = normalizeImageUrlString(p.url);
      if (!n || !(n.startsWith('http://') || n.startsWith('https://'))) continue;
      if (isEmailPreviewFallbackHardReject(n)) continue;
      const meta: Partial<ImageTagMeta> = {
        widthHint: w,
        heightHint: h,
        alt,
        className,
        index: imgTagIndex,
      };
      if (isLikelyNonHeroImageUrl(n)) continue;
      if (isLikelyLogoHeaderOrBranding(n, meta)) continue;
      if (imgTagIndex === 0 && isLinktreeHostname(n)) continue;
      if (hasMultipleImgTags && imgTagIndex === 0 && isStripoEmailCdnHostname(n)) continue;
      const score = contentImageMeritScore(n, meta);
      if (!bestCard || score > bestCard.score) bestCard = { url: n, score };
    }
    imgTagIndex++;
  }
  if (bestCard) return bestCard.url;

  let bgIdx = 0;
  for (const u of collectBackgroundImageUrls(htmlBlob)) {
    const n = normalizeImageUrlString(u);
    if (!n || isEmailPreviewFallbackHardReject(n)) continue;
    const meta: Partial<ImageTagMeta> = { widthHint: 400, heightHint: 300, index: allImgTags.length + bgIdx };
    bgIdx++;
    if (isLikelyNonHeroImageUrl(n)) continue;
    if (isLikelyLogoHeaderOrBranding(n, meta)) continue;
    if (isLinktreeHostname(n)) continue;
    const score = contentImageMeritScore(n, meta);
    if (!bestCard || score > bestCard.score) bestCard = { url: n, score };
  }
  if (bestCard) return bestCard.url;

  return undefined;
}

/**
 * Prefer the campaign view-model URL; if missing, re-parse `raw_details` (e.g. after sync shape changes).
 */
export function resolveCampaignPreviewImageUrl(
  campaign: { preview_image_url?: string | null } | null | undefined,
  rawRow?: { raw_details?: unknown; image_url?: string | null } | null,
): string | undefined {
  const fromUpload = typeof rawRow?.image_url === 'string' ? rawRow.image_url.trim() : '';
  if (fromUpload) return fromUpload;
  if (rawRow?.raw_details != null && typeof rawRow.raw_details === 'object') {
    const rd = rawRow.raw_details as Record<string, unknown>;
    const permissive = extractPermissiveCardPreviewImageUrl(rd);
    if (permissive) return permissive;
    const fromParsed = extractPreviewImageUrl(rd);
    if (fromParsed) return fromParsed;
  }
  const trimmed = typeof campaign?.preview_image_url === 'string' ? campaign.preview_image_url.trim() : '';
  if (trimmed && !isLikelyNonHeroImageUrl(trimmed) && !isLikelyLogoHeaderOrBranding(trimmed)) {
    return trimmed;
  }
  return undefined;
}

/** Modal preview: large hero / HTML iframe / direct image URL (large UI only). */
export type EmailModalPreviewType = 'hero' | 'html' | 'imageUrl';

export interface EmailModalPreviewResolution {
  /** Which surface to show first for fast display */
  previewType: EmailModalPreviewType;
  /** Chosen image URL (hero or fallback imageUrl); use with displayUrl for <img src> */
  url?: string;
  /** Prefer this for <img src> when set (e.g. CDN-resized); otherwise use url */
  displayUrl?: string;
  /** HTML for iframe when previewType is html, or as fallback after image error */
  html?: string;
}

/**
 * True when URL is big enough for a modal hero (not thin wordmarks / icons).
 * Uses path/query dimension hints; without hints, allows known large-asset hosts only.
 */
export function isQualifyingModalHeroUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw || raw.startsWith('data:')) return false;
  if (isSupabaseStoragePublicObjectUrl(raw)) return true;
  if (isLikelyNonHeroImageUrl(raw) || isLikelyLogoHeaderOrBranding(raw)) return false;

  const { w, h } = parseDimensionHintsFromUrl(raw);
  if (w > 0 && h > 0) {
    const area = w * h;
    const minSide = Math.min(w, h);
    const maxSide = Math.max(w, h);
    if (area < 28_000 && maxSide < 320) return false;
    if (minSide <= 32 && maxSide >= 80) return false;
    if (area >= 35_000) return true;
    if (w >= 280 && h >= 100) return true;
    if (w >= 400 && h >= 80) return true;
    return false;
  }

  try {
    const u = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    const host = u.hostname.toLowerCase();
    // Migrated campaign previews on S3 (sync uploads full-size assets; no dimension hints in URL).
    if (host.includes('.s3.') && host.endsWith('.amazonaws.com')) return true;
    if (/braze-images\.com$/i.test(host) && /\/images\//i.test(u.pathname)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Optional smaller URL for modal (faster load). Safe transforms only — unknown CDNs return unchanged.
 */
export function getModalOptimizedImageUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  const supabaseDisplay = campaignImageDisplayUrl(t, 'detail');
  if (supabaseDisplay && supabaseDisplay !== t) return supabaseDisplay;
  try {
    const abs = t.startsWith('//') ? `https:${t}` : t;
    const u = new URL(abs);
    if (u.hostname.endsWith('imgix.net')) {
      u.searchParams.set('w', '640');
      u.searchParams.set('auto', 'format,compress');
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return t;
}

/**
 * Email modal preview resolution: valid HTML iframe first → else hero image → else direct imageUrl.
 * Does not fetch resources; caller passes merged `raw_details` (+ optional live overrides).
 *
 * When both HTML and a qualifying hero URL exist, we prefer **iframe-only**. The hero URL is often
 * scraped from the same HTML (header wordmark, store badge, or `emailHeaderLogoFallback`) and showing
 * it as a stacked `<img>` on top of the iframe duplicates branding and looks like an unwanted logo overlay.
 */
export function resolveEmailModalPreview(
  raw: Record<string, unknown> | null | undefined,
): EmailModalPreviewResolution {
  const html = extractEmailHtmlPreview(raw ?? undefined);
  if (html && isUsableEmailModalHtml(html)) {
    return { previewType: 'html', html };
  }

  const extracted = extractPreviewImageUrl(raw ?? undefined);
  if (
    extracted &&
    isQualifyingModalHeroUrl(extracted) &&
    !isLikelyNonHeroImageUrl(extracted) &&
    !isLikelyLogoHeaderOrBranding(extracted)
  ) {
    const displayUrl = getModalOptimizedImageUrl(extracted);
    return {
      previewType: 'hero',
      url: extracted,
      displayUrl,
      html: undefined,
    };
  }

  const direct =
    typeof raw?.preview_image_url === 'string'
      ? raw.preview_image_url.trim()
      : typeof raw?.image_url === 'string'
        ? raw.image_url.trim()
        : typeof raw?.thumbnail_url === 'string'
          ? raw.thumbnail_url.trim()
          : '';

  if (direct && isQualifyingModalHeroUrl(direct) && !isLikelyNonHeroImageUrl(direct) && !isLikelyLogoHeaderOrBranding(direct)) {
    const displayUrl = getModalOptimizedImageUrl(direct);
    return {
      previewType: 'imageUrl',
      url: direct,
      displayUrl,
      html: undefined,
    };
  }

  return { previewType: 'html', html: undefined };
}

/**
 * Email HTML for modal preview: `email_html_preview`, top-level `html_body` / `html`, and
 * `messages.*` including nested `messages.*.email` (`html_body`, `body`, etc.). Plain-text-only
 * `body` is ignored unless it looks like markup. Returns `undefined` when no HTML is found — use
 * {@link resolveEmailModalPreview} to fall back to image URLs.
 */
export function extractEmailHtmlPreview(raw: Record<string, unknown> | null | undefined): string | undefined {
  return pickBestEmailHtmlString(raw) ?? pickLongestRelaxedEmailMarkupFragment(raw);
}

/**
 * Default HTML zoom inside the iframe document. The modal may pass {@link WrapHtmlForIframePreviewOptions.htmlZoom}
 * (e.g. `1` when the UI already applies outer scale).
 */
export const IFRAME_HTML_PREVIEW_ZOOM = 0.88;

function iframePreviewZoomStyle(htmlZoom: number): string {
  return `html{zoom:${htmlZoom};overflow:visible}`;
}

/**
 * Many ESP templates set a large fixed width on the first hero `<img>`; without this, the iframe
 * viewport can expand vertically and dominate the modal. Inline logos next to copy also behave
 * better with explicit width bounds.
 */
const IFRAME_EMAIL_CONTENT_WIDTH_RESET =
  'img,svg,video{max-width:100%!important;height:auto!important;vertical-align:middle}table{max-width:100%!important}';

export type WrapHtmlForIframePreviewOptions = {
  /**
   * Zoom applied inside the iframe document. Use `1` when the outer UI already applies
   * CSS `zoom` / `transform: scale()` so the email is not shrunk twice.
   */
  htmlZoom?: number;
};

/** Wrap fragment or full document HTML for a sandboxed iframe `srcDoc`. */
export function wrapHtmlForIframePreview(html: string, options?: WrapHtmlForIframePreviewOptions): string {
  const htmlZoom = options?.htmlZoom ?? IFRAME_HTML_PREVIEW_ZOOM;
  const IFRAME_PREVIEW_ZOOM_STYLE = iframePreviewZoomStyle(htmlZoom);
  const previewInjectStyles = `${IFRAME_PREVIEW_ZOOM_STYLE}${IFRAME_EMAIL_CONTENT_WIDTH_RESET}`;
  const t = stripBrazeLiquidFromEmailHtmlForPreview(html).trim();
  if (/^<!doctype/i.test(t) || /<html[\s>]/i.test(t)) {
    const zoomInject = `<style type="text/css" data-email-preview-zoom>${previewInjectStyles}</style>`;
    const headMatch = t.match(/<head[^>]*>/i);
    if (headMatch && headMatch.index !== undefined) {
      const i = headMatch.index + headMatch[0].length;
      return `${t.slice(0, i)}${zoomInject}${t.slice(i)}`;
    }
    return `${zoomInject}${t}`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#fff}${previewInjectStyles}body{padding:10px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12.5px;line-height:1.42;overflow:visible;overflow-x:hidden;box-sizing:border-box}</style></head><body>${t}</body></html>`;
}
