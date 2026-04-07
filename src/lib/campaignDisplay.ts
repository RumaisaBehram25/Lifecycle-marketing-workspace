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
const LIQUID_VAR_RE = /\{\{[\s\S]*?\}\}/g;

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
  s = s.replace(LIQUID_TAG_RE, ' ').replace(LIQUID_VAR_RE, ' ');
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

function normalizeImageUrlString(u: string): string | undefined {
  const t = u.trim();
  if (!t) return undefined;
  if (t.startsWith('//')) return `https:${t}`;
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  return undefined;
}

/** Linktree / Link-in-bio CDNs often host both nav logos and real campaign art — only flag logo-like paths. */
function isLinktreeHostname(url: string): boolean {
  try {
    const abs = url.trim().startsWith('//') ? `https:${url.trim()}` : url.trim();
    return /linktr|linktree/i.test(new URL(abs).hostname);
  } catch {
    return /linktr|linktree/i.test(url);
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
    if (/linktr|linktree/.test(host)) {
      if (
        /(logo|wordmark|lt-?logo|linktree[-_]?logo|favicon|icon|avatar|badge|social|brand-mark|brand_assets|word-mark|mark\.svg)/i.test(
          full,
        ) ||
        /\/icons?\/|\/avatar|\/profile-image|\/header-/i.test(full)
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
  } else {
    if (/[?&]s=(?:1[0-9]?|2[0-9]?|[1-9])(?:&|$)/i.test(raw)) return true;
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
  if (isLinktreeHostname(url) && area > 0 && area < 14_000) score -= 80_000;
  if (typeof meta?.index === 'number') score += meta.index * 50;
  return score;
}

/** True when string is suitable for an HTML iframe (not plain-text email copy). */
export function emailLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  return /<(?:[a-z][\w-]*|\/[a-z][\w-]*|!doctype)/i.test(t);
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
      push(m.html_body);
      push(m.html_content);
      push(m.html);
      push(m.amp_body);
      if (typeof m.body === 'string' && m.body.trim()) {
        const b = m.body.trim();
        if (emailLooksLikeHtml(b)) push(m.body);
      }
    }
  }
  return out;
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

/** First http(s) URL from an <img src="..."> in HTML (legacy — prefer {@link extractBestImageUrlFromHtml}). */
export function extractFirstImageUrlFromHtml(html: string | undefined): string | undefined {
  if (!html || typeof html !== 'string') return undefined;
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["']/i;
  const m = html.match(re);
  if (!m?.[1]) return undefined;
  return normalizeImageUrlString(m[1].trim());
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
 * Best &lt;img&gt; / CSS background URL from email HTML: skips logos and small branding, prefers larger
 * content/UI-style images; later &lt;img&gt; tags get a tie-break bonus (hero often below the header).
 */
export function pickBestImageUrlFromHtml(html: string | undefined): { url: string; score: number } | undefined {
  if (!html || typeof html !== 'string') return undefined;

  let best: { url: string; score: number } | undefined;
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  let imgTagIndex = 0;
  for (const tag of tags) {
    const parts = collectUrlsFromImgTag(tag);
    for (const p of parts) {
      if (isLikelyNonHeroImageUrl(p.url)) continue;
      const w = p.widthHint;
      const h = p.heightHint;
      const area = w > 0 && h > 0 ? w * h : w > 0 ? w * w : h > 0 ? h * h : 0;
      if (isLinktreeHostname(p.url) && area > 0 && area < 14_000) continue;
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

  return best;
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

  const htmlBlob = pickBestEmailHtmlString(raw);
  if (htmlBlob) {
    const fromHtml = pickBestImageUrlFromHtml(htmlBlob);
    if (fromHtml && (!best || fromHtml.score > best.score)) best = fromHtml;
  }

  return best?.url;
}

/**
 * Prefer the campaign view-model URL; if missing, re-parse `raw_details` (e.g. after sync shape changes).
 */
export function resolveCampaignPreviewImageUrl(
  campaign: { preview_image_url?: string | null } | null | undefined,
  rawRow?: { raw_details?: unknown } | null,
): string | undefined {
  const trimmed = typeof campaign?.preview_image_url === 'string' ? campaign.preview_image_url.trim() : '';
  if (trimmed && !isLikelyNonHeroImageUrl(trimmed) && !isLikelyLogoHeaderOrBranding(trimmed)) {
    return trimmed;
  }
  if (rawRow?.raw_details != null && typeof rawRow.raw_details === 'object') {
    return extractPreviewImageUrl(rawRow.raw_details as Record<string, unknown>);
  }
  return undefined;
}

/**
 * Email HTML for modal preview — prefers real HTML; never uses plain-text `body` as iframe content.
 */
export function extractEmailHtmlPreview(raw: Record<string, unknown> | null | undefined): string | undefined {
  return pickBestEmailHtmlString(raw);
}

/** Wrap fragment or full document HTML for a sandboxed iframe `srcDoc`. */
export function wrapHtmlForIframePreview(html: string): string {
  const t = html.trim();
  if (/^<!doctype/i.test(t) || /<html[\s>]/i.test(t)) return t;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#fff}body{padding:12px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.45;overflow:auto;box-sizing:border-box;min-height:100%}</style></head><body>${t}</body></html>`;
}
