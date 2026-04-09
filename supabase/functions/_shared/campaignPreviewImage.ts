/**
 * Keep in sync with `src/lib/campaignDisplay.ts` — campaign hero image selection for sync + live creative fetch.
 */

export function normalizeCampaignImageUrl(u: string): string | undefined {
  const t = u.trim();
  if (!t) return undefined;
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return undefined;
}

function isLinktreeHostname(url: string): boolean {
  try {
    const abs = url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim();
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

/** Stripo email CDN — Linktree templates often use `*.stripocdn.email` for header + hero assets. */
function isStripoEmailCdnHostname(url: string): boolean {
  try {
    const abs = url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim();
    const h = new URL(abs).hostname.toLowerCase();
    return h === "stripocdn.email" || h.endsWith(".stripocdn.email");
  } catch {
    return /stripocdn\.email/i.test(url);
  }
}

export function isLikelyNonHeroImageUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw || raw.startsWith("data:")) return true;

  try {
    const abs = raw.startsWith("//") ? `https:${raw}` : raw;
    const parsed = new URL(abs);
    const host = parsed.hostname.toLowerCase();
    const full = (parsed.pathname + parsed.search).toLowerCase();
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

export interface ImageTagMeta {
  widthHint: number;
  heightHint: number;
  alt?: string;
  className?: string;
  index: number;
}

function parseDimensionHintsFromUrl(url: string): { w: number; h: number } {
  const pathM = url.match(/(\d{2,4})x(\d{2,4})/);
  if (pathM) {
    const w = parseInt(pathM[1], 10);
    const h = parseInt(pathM[2], 10);
    if (w >= 16 && h >= 16 && w <= 8192 && h <= 8192) return { w, h };
  }
  try {
    const u = url.trim().startsWith("//") ? `https:${url.trim()}` : url.trim();
    const q = new URL(u).searchParams;
    const w = parseInt(q.get("w") || q.get("width") || "", 10);
    const h = parseInt(q.get("h") || q.get("height") || "", 10);
    if (w > 0 && h > 0) return { w, h };
    const ow = parseInt(q.get("ow") || "", 10);
    const oh = parseInt(q.get("oh") || "", 10);
    if (ow > 0 && oh > 0) return { w: ow, h: oh };
  } catch {
    /* ignore */
  }
  return { w: 0, h: 0 };
}

export function isLikelyLogoHeaderOrBranding(url: string, meta?: Partial<ImageTagMeta>): boolean {
  const raw = url.trim();
  if (!raw || raw.startsWith("data:")) return true;

  let w = meta?.widthHint ?? 0;
  let h = meta?.heightHint ?? 0;
  const fromPath = parseDimensionHintsFromUrl(raw);
  if (w <= 0 && fromPath.w > 0) w = fromPath.w;
  if (h <= 0 && fromPath.h > 0) h = fromPath.h;

  const alt = (meta?.alt ?? "").toLowerCase();
  const cls = (meta?.className ?? "").toLowerCase();
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
    const abs = raw.startsWith("//") ? `https:${raw}` : raw;
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
    const brandCdn0 =
      (isLinktreeHostname(raw) || isStripoEmailCdnHostname(raw)) &&
      typeof meta?.index === "number" &&
      meta.index === 0;
    if (brandCdn0) {
      if (h <= 72 && w >= 80 && w <= 520) return true;
      if (w <= 200 && h <= 200 && area < 45_000) return true;
      if (h <= 110 && w >= 160 && w / Math.max(h, 1) >= 3.2) return true;
    }
  } else {
    if (/[?&]s=(?:1[0-9]?|2[0-9]?|[1-9])(?:&|$)/i.test(raw)) return true;
    if (isLinktreeHostname(raw) && typeof meta?.index === "number" && meta.index === 0) {
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
  const alt = (meta?.alt ?? "").toLowerCase();
  const cls = (meta?.className ?? "").toLowerCase();
  const blob = `${u} ${alt} ${cls}`;

  if (/hero|banner|main|content|body|email|campaign|product|feature|screenshot|mockup|full[-_]?bleed|fullwidth|full-width|primary|lead|story|photo|gallery|device|ui|ux|design|graphic|illustration/i.test(blob)) {
    score += 120_000;
  }
  if ((isLinktreeHostname(url) || isStripoEmailCdnHostname(url)) && area > 0 && area < 14_000) {
    score -= 80_000;
  }
  if (typeof meta?.index === "number") score += meta.index * 50;
  if (w > 0 && h > 0) {
    if (w > h) score += 35_000;
    if (w >= 300) score += 25_000;
    if (h > w && Math.max(w, h) < 220) score -= 45_000;
    if (w <= h && w < 140 && h < 420) score -= 30_000;
  }
  return score;
}

function largestUrlFromSrcset(srcset: string): { url: string; widthHint: number } | undefined {
  let bestUrl: string | undefined;
  let bestW = 0;
  for (const part of srcset.split(",")) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length < 1) continue;
    const candidate = bits[0];
    const desc = bits[1] || "";
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
  const n = normalizeCampaignImageUrl(bestUrl.trim());
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
    const n = normalizeCampaignImageUrl(raw.trim());
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push({ url: n, widthHint: w, heightHint: h, alt, className });
    }
  };

  for (const attr of ["data-src", "data-original", "data-lazy-src", "data-original-src", "src"]) {
    const re = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i");
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
    if (t && !t.startsWith("data:")) urls.push(t);
  }
  return urls;
}

function takeBetterPreviewCandidate(
  best: { url: string; score: number } | undefined,
  url: string,
  meta?: Partial<ImageTagMeta>,
): { url: string; score: number } | undefined {
  const n = normalizeCampaignImageUrl(url);
  if (!n || isLikelyNonHeroImageUrl(n)) return best;
  if (isLikelyLogoHeaderOrBranding(n, meta)) return best;
  const score = contentImageMeritScore(n, meta);
  if (!best || score > best.score) return { url: n, score };
  return best;
}

/** Keep aligned with `src/lib/campaignDisplay.rawDetailsIsEmailCampaign`. */
export function rawDetailsIsEmailCampaign(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw || typeof raw !== "object") return false;
  if (typeof raw.email_html_preview === "string" && raw.email_html_preview.trim()) return true;

  const ch = raw.channels;
  if (Array.isArray(ch) && ch.some((c) => String(c).toLowerCase().includes("email"))) return true;
  if (typeof raw.channel === "string" && raw.channel.toLowerCase().includes("email")) return true;

  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === "object" && !Array.isArray(messages)) {
    for (const key of Object.keys(messages)) {
      if (key.toLowerCase().includes("email")) return true;
    }
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== "object") continue;
      const c = String((msg as Record<string, unknown>).channel ?? "").toLowerCase();
      if (c === "email" || c.includes("email")) return true;
    }
  }
  return false;
}

/** Reject only obvious junk for header/logo fallback — does not treat “logo” paths as non-hero. */
function isEmailPreviewFallbackHardReject(url: string): boolean {
  const raw = url.trim();
  if (!raw || raw.startsWith("data:")) return true;
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
  /** When no hero qualifies, use the best available &lt;img&gt; (e.g. header/logo) for email campaigns only. */
  emailHeaderLogoFallback?: boolean;
};

/**
 * If hero scoring found nothing, pick a header/logo-style &lt;img&gt; (largest dimension hint wins; tie → earlier in HTML).
 */
function pickEmailHeaderLogoFallbackFromHtml(
  html: string | undefined,
): { url: string; score: number } | undefined {
  if (!html || typeof html !== "string") return undefined;
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  let bestUrl: string | undefined;
  let bestArea = -1;
  let bestOrder = Number.MAX_SAFE_INTEGER;
  let order = 0;
  for (const tag of tags) {
    const parts = collectUrlsFromImgTag(tag);
    for (const p of parts) {
      const n = normalizeCampaignImageUrl(p.url);
      if (!n || isEmailPreviewFallbackHardReject(n)) continue;
      if (!n.startsWith("http://") && !n.startsWith("https://")) continue;
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

function htmlHasImgWithHttpSrc(html: string): boolean {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    for (const p of collectUrlsFromImgTag(tag)) {
      const n = normalizeCampaignImageUrl(p.url);
      if (n && (n.startsWith("http://") || n.startsWith("https://"))) return true;
    }
  }
  return false;
}

export function pickBestImageUrlFromHtml(
  html: string | undefined,
  options?: PickBestImageUrlFromHtmlOptions,
): { url: string; score: number } | undefined {
  if (!html || typeof html !== "string") return undefined;

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
      if (imgTagIndex === 0 && isLinktreeHostname(p.url)) continue;
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
    const n = normalizeCampaignImageUrl(u);
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

/** Best URL from Braze message JSON fields (no &lt;img&gt; metadata). */
export function pickBestPreviewImageFromCandidateUrls(
  urls: string[],
): { url: string; score: number } | undefined {
  let best: { url: string; score: number } | undefined;
  let order = 0;
  for (const raw of urls) {
    best = takeBetterPreviewCandidate(best, raw, { index: order });
    order++;
  }
  return best;
}

/**
 * When email HTML exists, JSON `preview_image_url` / message fields almost always duplicate the first `<img>` (Linktree logo).
 */
export function mergePreviewImagePicks(
  jsonBest: { url: string; score: number } | undefined,
  htmlBest: { url: string; score: number } | undefined,
): string | undefined {
  if (htmlBest?.url) return htmlBest.url;
  return jsonBest?.url;
}

// --- extractPreviewImageUrl (keep aligned with src/lib/campaignDisplay.ts) ---

const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/";

export function isSupabaseStoragePublicObjectUrl(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith("data:")) return false;
  try {
    const abs = t.startsWith("//") ? `https:${t}` : t;
    const u = new URL(abs);
    return u.pathname.includes(PUBLIC_OBJECT_SEGMENT);
  } catch {
    return false;
  }
}

/** True when string is suitable for an HTML iframe (not plain-text email copy). */
export function emailLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  return /<(?:[a-z][\w-]*|\/[a-z][\w-]*|!doctype)/i.test(t);
}

/** Aligns with sync-braze `brazeMessageIsNonEmail` — empty channel is treated as eligible for email HTML/image. */
function brazeMessageIsNonEmail(ch: string): boolean {
  if (!ch) return false;
  const c = ch.toLowerCase();
  if (c === "email" || c.includes("email")) return false;
  return (
    c.includes("push") ||
    c.includes("in_app") ||
    c.includes("in-app") ||
    c === "content_card" ||
    c === "webhook" ||
    c === "sms" ||
    c === "whatsapp"
  );
}

function collectEmailHtmlSourceStrings(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  };
  push(raw.email_html_preview);
  push(raw.html_body);
  push(raw.html_content);
  push(raw.html);

  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === "object") {
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== "object") continue;
      const m = msg as Record<string, unknown>;
      if (brazeMessageIsNonEmail(String(m.channel ?? ""))) continue;
      push(m.html_body);
      push(m.html_content);
      push(m.html);
      push(m.amp_body);
      if (typeof m.body === "string" && m.body.trim()) {
        const b = m.body.trim();
        if (emailLooksLikeHtml(b)) push(m.body);
      }
    }
  }
  return out;
}

/**
 * Longest HTML fragment suitable for iframe preview / &lt;img&gt; extraction.
 * Ignores plain-text `body` (common Braze shape).
 */
export function pickBestEmailHtmlString(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const all = collectEmailHtmlSourceStrings(raw);
  const htmlOnly = all.filter(emailLooksLikeHtml);
  if (htmlOnly.length === 0) return undefined;
  return htmlOnly.sort((a, b) => b.length - a.length)[0];
}

/** Ordered fields — early entries may be logos (handled by takeBetterPreviewCandidate). */
function imageUrlCandidatesFromMessage(m: Record<string, unknown>): string[] {
  const keys: (keyof Record<string, unknown>)[] = [
    "big_image",
    "banner_image",
    "hero_image",
    "large_image",
    "image_url",
    "hero_image_url",
    "preview_image_url",
    "thumbnail_url",
    "inline_image",
    "url",
  ];
  const out: string[] = [];
  for (const k of keys) {
    const c = m[k];
    if (typeof c === "string") {
      const n = normalizeCampaignImageUrl(c);
      if (n) out.push(n);
    }
  }
  return out;
}

/**
 * Best-effort preview image URL from Braze `raw_details` / campaign JSON.
 * Mirrors `src/lib/campaignDisplay.extractPreviewImageUrl`.
 */
export function extractPreviewImageUrl(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const uploaded =
    typeof raw.preview_image_url === "string"
      ? raw.preview_image_url.trim()
      : typeof raw.image_url === "string"
        ? raw.image_url.trim()
        : "";
  if (uploaded && isSupabaseStoragePublicObjectUrl(uploaded)) {
    return uploaded;
  }

  const htmlBlob = pickBestEmailHtmlString(raw);
  if (htmlBlob) {
    const fromHtml = pickBestImageUrlFromHtml(htmlBlob, {
      emailHeaderLogoFallback: rawDetailsIsEmailCampaign(raw) && htmlHasImgWithHttpSrc(htmlBlob),
    });
    if (fromHtml?.url) {
      return fromHtml.url;
    }
  }

  let best: { url: string; score: number } | undefined;
  let order = 0;

  const direct = raw.preview_image_url ?? raw.image_url ?? raw.thumbnail_url;
  if (typeof direct === "string") {
    best = takeBetterPreviewCandidate(best, direct, { index: order });
    order++;
  }

  const messages = raw.messages as Record<string, unknown> | undefined;
  if (messages && typeof messages === "object") {
    for (const msg of Object.values(messages)) {
      if (!msg || typeof msg !== "object") continue;
      const m = msg as Record<string, unknown>;
      for (const candidate of imageUrlCandidatesFromMessage(m)) {
        best = takeBetterPreviewCandidate(best, candidate, { index: order });
        order++;
      }
    }
  }

  return best?.url;
}
