/**
 * Shared URL extraction + S3 key helpers for lifecycle canvas image migrations.
 */
import { createHash } from "node:crypto";
import { parse as parseHtml } from "node-html-parser";

export function envFirst(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function supabaseProjectHostname(): string | null {
  const base = envFirst("SUPABASE_URL", "VITE_SUPABASE_URL");
  if (!base) return null;
  try {
    return new URL(base).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function publicS3ObjectUrl(bucket: string, region: string, key: string): string {
  const encodedKey = key.split("/").map((p) => encodeURIComponent(p)).join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export function preferredStorageFetchUrl(imageUrl: string): string {
  try {
    const u = new URL(imageUrl);
    const marker = "/storage/v1/render/image/public/";
    const i = u.pathname.indexOf(marker);
    if (i !== -1) {
      const rest = u.pathname.slice(i + marker.length);
      u.pathname = `/storage/v1/object/public/${rest}`;
      u.search = "";
      return u.href;
    }
  } catch {
    /* ignore */
  }
  return imageUrl;
}

export function sniffImageContentType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function normalizeImageContentType(claimed: string, buf: Buffer): string {
  const sniffed = sniffImageContentType(buf);
  if (sniffed) return sniffed;
  const c = claimed.split(";")[0]?.trim().toLowerCase() || "";
  if (c.startsWith("image/")) return c;
  return "image/png";
}

export async function fetchImageWithFallback(sourceUrl: string): Promise<
  | { ok: true; buf: Buffer; contentType: string }
  | { ok: false; error: string }
> {
  sourceUrl = normalizeUrlString(sourceUrl);
  const primary = preferredStorageFetchUrl(sourceUrl);
  const urls = primary === sourceUrl ? [sourceUrl] : [primary, sourceUrl];
  let lastDetail = "";
  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow", headers: { Accept: "*/*" } });
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return { ok: false, error: "empty body" };
      const rawCt = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
      const contentType = normalizeImageContentType(rawCt, buf);
      return { ok: true, buf, contentType };
    }
    const errBody = (await res.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
    lastDetail = `HTTP ${res.status} ${res.statusText}${errBody ? ` — ${errBody}` : ""}`;
  }
  return { ok: false, error: lastDetail || "fetch failed" };
}

export function extFromContentType(ct: string): string {
  const c = ct.toLowerCase();
  if (c.includes("jpeg")) return "jpg";
  if (c.includes("png")) return "png";
  if (c.includes("webp")) return "webp";
  if (c.includes("gif")) return "gif";
  return "bin";
}

export function normalizeUrlString(s: string): string {
  const t = s.trim();
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

export function isMigratableSupabaseStorageUrl(s: string, projectHost: string | null): boolean {
  const t = normalizeUrlString(s);
  if (!t.startsWith("http")) return false;
  if (t.includes(".s3.") && t.includes("amazonaws.com")) return false;
  try {
    const u = new URL(t);
    const host = u.hostname.toLowerCase();
    const onProjectApiHost = Boolean(projectHost && host === projectHost);
    const onSupabaseCloud =
      host === "supabase.co" || host.endsWith(".supabase.co");
    if (!onSupabaseCloud && !onProjectApiHost) return false;
    const p = u.pathname;
    return (
      p.includes("/storage/") ||
      p.includes("/object/public/") ||
      p.includes("/object/sign/")
    );
  } catch {
    return false;
  }
}

export function isAlreadyAwsS3PublicUrl(s: string): boolean {
  const t = normalizeUrlString(s);
  if (!t.startsWith("http")) return false;
  return t.includes(".s3.") && t.includes("amazonaws.com");
}

export function isAlreadyOnTargetS3Bucket(s: string, bucket: string, region: string): boolean {
  try {
    const h = new URL(normalizeUrlString(s)).hostname.toLowerCase();
    return h === `${bucket}.s3.${region}.amazonaws.com` || h === `${bucket}.s3.amazonaws.com`;
  } catch {
    return false;
  }
}

/** Decode pathname segments to the raw S3 object key when the URL points at the target bucket. */
export function objectKeyFromTargetS3PublicUrl(
  s: string,
  bucket: string,
  region: string,
): string | null {
  if (!isAlreadyOnTargetS3Bucket(s, bucket, region)) return null;
  try {
    const u = new URL(normalizeUrlString(s));
    const path = u.pathname.replace(/^\/+/, "");
    if (!path) return null;
    return path
      .split("/")
      .map((seg) => {
        try {
          return decodeURIComponent(seg);
        } catch {
          return seg;
        }
      })
      .join("/");
  } catch {
    return null;
  }
}

/**
 * When JSON already uses the target bucket but not the canonical {@link publicS3ObjectUrl} form,
 * returns that canonical URL so `raw_steps` can be normalized. Otherwise null.
 */
export function canonicalPublicUrlOnTargetIfNeeded(
  s: string,
  bucket: string,
  region: string,
): string | null {
  const key = objectKeyFromTargetS3PublicUrl(s, bucket, region);
  if (key == null || key === "") return null;
  const canonical = publicS3ObjectUrl(bucket, region, key);
  const norm = normalizeUrlString(s).trim();
  if (norm === canonical) return null;
  return canonical;
}

export function isBrazeCdnUrl(url: string): boolean {
  try {
    const host = new URL(normalizeUrlString(url)).hostname.toLowerCase();
    return (
      host.endsWith("appboy-images.com") ||
      host.endsWith("braze-images.com")
    );
  } catch {
    return false;
  }
}

export function isStripoCdnUrl(url: string): boolean {
  try {
    const host = new URL(normalizeUrlString(url)).hostname.toLowerCase();
    return host.endsWith("stripocdn.email");
  } catch {
    return false;
  }
}

export type UrlGroup =
  | "supabase_storage_urls"
  | "s3_amazonaws_urls"
  | "braze_cdn_urls"
  | "stripo_cdn_urls"
  | "other_urls";

export function classifyLifecycleImageUrl(s: string, projectHost: string | null): UrlGroup {
  const t = normalizeUrlString(s);
  if (!t.startsWith("http")) return "other_urls";
  if (isAlreadyAwsS3PublicUrl(s)) return "s3_amazonaws_urls";
  if (isMigratableSupabaseStorageUrl(s, projectHost)) return "supabase_storage_urls";
  if (isStripoCdnUrl(s)) return "stripo_cdn_urls";
  if (isBrazeCdnUrl(s)) return "braze_cdn_urls";
  return "other_urls";
}

export function shouldMigrateToS3(
  s: string,
  projectHost: string | null,
  opts: { migrateBrazeCdn: boolean },
): boolean {
  if (isMigratableSupabaseStorageUrl(s, projectHost)) return true;
  if (opts.migrateBrazeCdn && isBrazeCdnUrl(s) && !isAlreadyAwsS3PublicUrl(s)) return true;
  if (isStripoCdnUrl(s) && !isAlreadyAwsS3PublicUrl(s)) return true;
  return false;
}

export function collectJsonStringUrlsExcludingHtmlFields(val: unknown, parentKey: string | null, out: Set<string>): void {
  if (typeof val === "string") {
    if (parentKey === "html_content" || parentKey === "body") return;
    const t = val.trim();
    if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("//")) {
      out.add(t);
    }
    return;
  }
  if (Array.isArray(val)) {
    for (const x of val) collectJsonStringUrlsExcludingHtmlFields(x, null, out);
    return;
  }
  if (val && typeof val === "object") {
    for (const [k, v] of Object.entries(val)) {
      collectJsonStringUrlsExcludingHtmlFields(v, k, out);
    }
  }
}

export function pushUrlIfImageLike(raw: string, out: Set<string>): void {
  const t = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!t || t.startsWith("data:") || t.startsWith("cid:")) return;
  if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("//")) {
    out.add(t);
  }
}

export function extractUrlsFromHtmlFragment(html: string | undefined | null, out: Set<string>): void {
  if (html == null || typeof html !== "string") return;
  const trimmed = html.trim();
  if (!trimmed) return;
  let root;
  try {
    root = parseHtml(trimmed, { lowerCaseTagName: true });
  } catch {
    return;
  }
  for (const img of root.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (src) pushUrlIfImageLike(src, out);
  }
  for (const el of root.querySelectorAll("source[srcset]")) {
    const ss = el.getAttribute("srcset");
    if (!ss) continue;
    const first = ss.split(",")[0]?.trim().split(/\s+/)[0];
    if (first) pushUrlIfImageLike(first, out);
  }
}

export function extractHtmlFieldUrlsFromTree(val: unknown, out: Set<string>): void {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    for (const [k, v] of Object.entries(val)) {
      if ((k === "html_content" || k === "body") && typeof v === "string") {
        extractUrlsFromHtmlFragment(v, out);
      } else {
        extractHtmlFieldUrlsFromTree(v, out);
      }
    }
    return;
  }
  if (Array.isArray(val)) {
    for (const x of val) extractHtmlFieldUrlsFromTree(x, out);
  }
}

export function extractUrlSetsFromRawSteps(rawSteps: unknown): {
  jsonUrls: Set<string>;
  htmlUrls: Set<string>;
  combined: Set<string>;
} {
  const jsonUrls = new Set<string>();
  const htmlUrls = new Set<string>();
  collectJsonStringUrlsExcludingHtmlFields(rawSteps, null, jsonUrls);
  extractHtmlFieldUrlsFromTree(rawSteps, htmlUrls);
  const combined = new Set<string>([...jsonUrls, ...htmlUrls]);
  return { jsonUrls, htmlUrls, combined };
}

export function collectUploadCandidateUrls(
  rawSteps: unknown,
  projectHost: string | null,
  opts: { migrateBrazeCdn: boolean },
  out: Set<string>,
): void {
  const { combined } = extractUrlSetsFromRawSteps(rawSteps);
  for (const u of combined) {
    if (shouldMigrateToS3(u, projectHost, opts)) out.add(u.trim());
  }
}

/** Patch run: same as upload candidates but excludes URLs already pointing at the target bucket (idempotent). */
export function collectLegacyPatchCandidateUrls(
  rawSteps: unknown,
  projectHost: string | null,
  opts: { migrateBrazeCdn: boolean },
  target: { bucket: string; region: string },
  out: Set<string>,
): void {
  const { combined } = extractUrlSetsFromRawSteps(rawSteps);
  for (const u of combined) {
    const t = u.trim();
    if (!shouldMigrateToS3(t, projectHost, opts)) continue;
    if (isAlreadyOnTargetS3Bucket(t, target.bucket, target.region)) continue;
    out.add(t);
  }
}

export function collectMigratableSupabaseStorageUrls(val: unknown, out: Set<string>, projectHost: string | null): void {
  const { combined } = extractUrlSetsFromRawSteps(val);
  for (const u of combined) {
    if (isMigratableSupabaseStorageUrl(u, projectHost)) out.add(u.trim());
  }
}

export function applyUrlReplacementsToString(s: string, map: Map<string, string>): string {
  const entries = [...map.entries()].filter(([a, b]) => a !== b);
  entries.sort((x, y) => y[0].length - x[0].length);
  let out = s;
  for (const [from, to] of entries) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

export function replaceUrlsDeep(val: unknown, map: Map<string, string>): unknown {
  if (typeof val === "string") {
    return applyUrlReplacementsToString(val, map);
  }
  if (Array.isArray(val)) {
    return val.map((x) => replaceUrlsDeep(x, map));
  }
  if (val && typeof val === "object") {
    const o = val as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = replaceUrlsDeep(v, map);
    }
    return out;
  }
  return val;
}

export function lifecycleS3KeyFromSourceUrl(sourceUrl: string, contentType: string): string {
  const hash = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24);
  const ext = extFromContentType(contentType);
  return `lifecycle-creatives/by-url/${hash}.${ext}`;
}
