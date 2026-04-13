/**
 * PATCH migration: only braze_canvases rows that still contain legacy image URLs (per SQL predicate),
 * without re-scanning/uploading URLs already on the target S3 bucket.
 *
 * Prerequisites:
 *   - Apply migration 20260413200000_braze_canvas_legacy_http_rpc.sql (RPC), or use slow --force-full-scan.
 *
 * Run:
 *   npm run patch:lifecycle-images-s3
 *   npm run patch:lifecycle-images-s3 -- --dry-run
 *
 * Env: same as migrate:lifecycle-images-s3 (Supabase service role, AWS, S3 bucket).
 *   MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN=1 or --migrate-braze-cdn
 */
import dotenv from "dotenv";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { createClient } from "@supabase/supabase-js";
import { HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  envFirst,
  supabaseProjectHostname,
  publicS3ObjectUrl,
  fetchImageWithFallback,
  collectLegacyPatchCandidateUrls,
  collectUploadCandidateUrls,
  replaceUrlsDeep,
  lifecycleS3KeyFromSourceUrl,
  extractUrlSetsFromRawSteps,
  canonicalPublicUrlOnTargetIfNeeded,
  classifyLifecycleImageUrl,
  type UrlGroup,
} from "./lib/lifecycleCanvasImageS3Core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 400;
const SUMMARY_FILE = join(__dirname, "patch-lifecycle-canvas-images-s3-summary.json");

type CanvasRow = {
  id: string;
  client_id: string;
  braze_canvas_id: string | null;
  raw_steps: unknown;
};

type PatchSummary = {
  patched_rows_count: number;
  newly_migrated_urls_count: number;
  skipped_s3_head_existing: number;
  still_remaining_legacy_after_run: number;
  canvas_ids_considered: number;
  dryRun: boolean;
  migrateBrazeCdn: boolean;
  at: string;
};

function parseFlags(argv: string[]): { dryRun: boolean; migrateBrazeCdn: boolean; forceFullScan: boolean } {
  const dryRun = argv.includes("--dry-run");
  const migrateBrazeCdn =
    argv.includes("--migrate-braze-cdn") ||
    envFirst("MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN") === "1" ||
    envFirst("MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN")?.toLowerCase() === "true";
  const forceFullScan = argv.includes("--force-full-scan");
  return { dryRun, migrateBrazeCdn, forceFullScan };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rawStepsMatchesLegacySqlPredicate(raw: unknown): boolean {
  const text = JSON.stringify(raw);
  if (!/(http|https):\/\//i.test(text)) return false;
  if (/amazonaws\.com/i.test(text)) return false;
  if (/\.s3\./i.test(text)) return false;
  if (/s3-/i.test(text)) return false;
  return true;
}

const DEFAULT_ID_PAGE_SIZE = 500;

function idPageSizeFromEnv(): number {
  const raw = envFirst("MIGRATE_LIFECYCLE_PAGE_SIZE");
  if (!raw) return DEFAULT_ID_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 1000);
  return DEFAULT_ID_PAGE_SIZE;
}

async function loadAllCanvasIdsWithRawSteps(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const pageSize = idPageSizeFromEnv();
  const ids: string[] = [];
  let lastId: string | null = null;
  for (;;) {
    let q = supabase
      .from("braze_canvases")
      .select("id")
      .not("raw_steps", "is", null)
      .order("id", { ascending: true })
      .limit(pageSize);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = (data ?? []) as { id: string }[];
    if (chunk.length === 0) break;
    ids.push(...chunk.map((r) => r.id));
    lastId = chunk[chunk.length - 1]!.id;
    if (chunk.length < pageSize) break;
  }
  return ids;
}

async function fetchCanvasRowById(
  supabase: ReturnType<typeof createClient>,
  id: string,
): Promise<CanvasRow | null> {
  const { data, error } = await supabase
    .from("braze_canvases")
    .select("id, client_id, braze_canvas_id, raw_steps")
    .eq("id", id)
    .single();
  if (error) {
    console.error(`[patch:lifecycle-images-s3] SKIP id=${id}: ${error.message}`);
    return null;
  }
  return data as CanvasRow;
}

function isRpcNotDeployedError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    err.code === "PGRST202"
  );
}

async function resolveLegacyCanvasIds(
  supabase: ReturnType<typeof createClient>,
  forceFullScan: boolean,
): Promise<string[]> {
  if (!forceFullScan) {
    const { data, error } = await supabase.rpc("braze_canvas_ids_legacy_http_not_in_s3_text");
    if (!error && data != null && Array.isArray(data)) {
      const ids = (data ?? []).map((row: { id: string } | string) =>
        typeof row === "string" ? row : row.id,
      );
      return ids;
    }
    if (error && isRpcNotDeployedError(error)) {
      console.warn(
        "[patch:lifecycle-images-s3] RPC not in database — auto-falling back to full scan (slow).\n" +
          "  Deploy supabase/migrations/20260413200000_braze_canvas_legacy_http_rpc.sql in Supabase SQL to skip this next time.\n" +
          "  Or pass --force-full-scan explicitly to skip the RPC attempt.",
      );
      return resolveLegacyCanvasIds(supabase, true);
    }
    throw new Error(
      `[patch:lifecycle-images-s3] RPC braze_canvas_ids_legacy_http_not_in_s3_text failed: ${error?.message ?? "no data"}`,
    );
  }

  console.log("[patch:lifecycle-images-s3] Full scan (slow): filtering rows by legacy text predicate…");
  const allIds = await loadAllCanvasIdsWithRawSteps(supabase);
  const out: string[] = [];
  let n = 0;
  for (const id of allIds) {
    n++;
    if (n % 250 === 0) console.log(`[patch:lifecycle-images-s3]   … scanned ${n}/${allIds.length} ids`);
    const row = await fetchCanvasRowById(supabase, id);
    if (!row) continue;
    if (rawStepsMatchesLegacySqlPredicate(row.raw_steps)) out.push(id);
  }
  return out;
}

async function countRemainingLegacyRows(
  supabase: ReturnType<typeof createClient>,
  forceFullScan: boolean,
): Promise<number> {
  try {
    const ids = await resolveLegacyCanvasIds(supabase, forceFullScan);
    return ids.length;
  } catch {
    return -1;
  }
}

async function headObjectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

/**
 * Fetch once to get Content-Type for {@link lifecycleS3KeyFromSourceUrl}, then HeadObject / PutObject
 * and record `sourceUrl → public S3 URL` (same logic as the global batch).
 */
async function ensureSourceToDestForMigratableUrl(
  s3: S3Client,
  bucket: string,
  region: string,
  sourceUrl: string,
  sourceToDest: Map<string, string>,
): Promise<{ ok: boolean; headSkip: boolean; uploaded: boolean }> {
  if (sourceToDest.has(sourceUrl)) {
    return { ok: true, headSkip: false, uploaded: false };
  }
  const fetched = await fetchImageWithFallback(sourceUrl);
  if (!fetched.ok) {
    console.error(
      `[patch:lifecycle-images-s3] FAIL fetch (backfill mapping) ${sourceUrl.slice(0, 80)}… ${fetched.error}`,
    );
    return { ok: false, headSkip: false, uploaded: false };
  }

  const key = lifecycleS3KeyFromSourceUrl(sourceUrl, fetched.contentType);
  const exists = await headObjectExists(s3, bucket, key);
  const newUrl = publicS3ObjectUrl(bucket, region, key);

  if (exists) {
    sourceToDest.set(sourceUrl, newUrl);
    console.log(`[patch:lifecycle-images-s3] backfill map (HeadObject): ${sourceUrl.slice(0, 96)}…`);
    return { ok: true, headSkip: true, uploaded: false };
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fetched.buf,
      ContentType: fetched.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  sourceToDest.set(sourceUrl, newUrl);
  console.log(`[patch:lifecycle-images-s3] backfill upload: ${newUrl}`);
  return { ok: true, headSkip: false, uploaded: true };
}

async function main(): Promise<void> {
  const { dryRun, migrateBrazeCdn, forceFullScan } = parseFlags(process.argv);
  const projectHost = supabaseProjectHostname();
  const migrateOpts = { migrateBrazeCdn };

  const supabaseUrl = envFirst("SUPABASE_URL", "VITE_SUPABASE_URL");
  if (!supabaseUrl) throw new Error("Set SUPABASE_URL or VITE_SUPABASE_URL");
  const serviceKey = envFirst("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) throw new Error("Set SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY");

  const accessKeyId = envFirst("AWS_ACCESS_KEY_ID");
  const secretAccessKey = envFirst("AWS_SECRET_ACCESS_KEY");
  const hasExplicitKeys = Boolean(accessKeyId && secretAccessKey);
  const onlyOneKey = Boolean(accessKeyId || secretAccessKey) && !hasExplicitKeys;
  if (!dryRun && onlyOneKey) {
    throw new Error("Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or omit both for default chain.");
  }

  let region = envFirst("AWS_REGION", "AWS_DEFAULT_REGION");
  if (!region) {
    region = "us-east-1";
    console.warn("[patch:lifecycle-images-s3] AWS_REGION unset — using us-east-1");
  }

  const bucket = envFirst("S3_BUCKET_NAME", "AWS_S3_CAMPAIGN_BUCKET");
  if (!bucket) throw new Error("Set S3_BUCKET_NAME or AWS_S3_CAMPAIGN_BUCKET");

  const target = { bucket, region };
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("patch:migration:start");
  console.log(
    `[patch:lifecycle-images-s3] dryRun=${dryRun} migrateBrazeCdn=${migrateBrazeCdn} forceFullScan=${forceFullScan}`,
  );

  const legacyIds = await resolveLegacyCanvasIds(supabase, forceFullScan);
  console.log(`[patch:lifecycle-images-s3] legacy candidate canvas ids: ${legacyIds.length}`);

  const rows: CanvasRow[] = [];
  for (const id of legacyIds) {
    const row = await fetchCanvasRowById(supabase, id);
    if (row) rows.push(row);
  }

  const globalLegacy = new Set<string>();
  for (const row of rows) {
    const s = new Set<string>();
    collectLegacyPatchCandidateUrls(row.raw_steps, projectHost, migrateOpts, target, s);
    for (const u of s) globalLegacy.add(u);
  }

  console.log(
    `[patch:lifecycle-images-s3] unique legacy upload URLs (not yet on target bucket): ${globalLegacy.size}`,
  );

  if (rows.length > 0 && globalLegacy.size === 0) {
    const sample = new Set<string>();
    for (const row of rows) {
      const { combined } = extractUrlSetsFromRawSteps(row.raw_steps);
      for (const u of combined) {
        sample.add(u);
        if (sample.size >= 24) break;
      }
      if (sample.size >= 24) break;
    }
    const byGroup: Record<UrlGroup, number> = {
      supabase_storage_urls: 0,
      s3_amazonaws_urls: 0,
      braze_cdn_urls: 0,
      stripo_cdn_urls: 0,
      other_urls: 0,
    };
    const allFromFirstRows = new Set<string>();
    for (const row of rows.slice(0, 50)) {
      const { combined } = extractUrlSetsFromRawSteps(row.raw_steps);
      for (const u of combined) {
        allFromFirstRows.add(u);
        byGroup[classifyLifecycleImageUrl(u, projectHost)]++;
      }
    }
    console.log(
      "\n[patch:lifecycle-images-s3] WHY 0 upload URLs (RPC matched rows by loose text; patch only migrates Supabase Storage + optional Braze hosts):",
    );
    console.log(
      `[patch:lifecycle-images-s3] URL classification across first 50 legacy rows (occurrences, may double-count same URL in multiple rows): ${JSON.stringify(byGroup)}`,
    );
    if (sample.size > 0) {
      console.log("[patch:lifecycle-images-s3] Sample extracted URLs (up to 8):");
      for (const u of [...sample].slice(0, 8)) {
        console.log(
          `  [${classifyLifecycleImageUrl(u, projectHost)}] ${u.length > 160 ? `${u.slice(0, 160)}…` : u}`,
        );
      }
    } else {
      console.log(
        "[patch:lifecycle-images-s3] Extractor found no http(s)// strings in JSON/HTML — legacy RPC match may be from unrelated text (e.g. partial 'https:' in data).",
      );
    }
    console.log(
      "\n  If most URLs are `other_urls` (e.g. CloudFront, custom domain, non-Braze CDN): extend isBrazeCdnUrl / migration rules in scripts/lib/lifecycleCanvasImageS3Core.ts,\n" +
        "  or those hosts are already “final” and only the RPC filter is stale.\n",
    );
  }

  const sourceToDest = new Map<string, string>();
  let newlyMigrated = 0;
  let skippedHead = 0;

  const s3 = !dryRun
    ? new S3Client({
        region,
        ...(hasExplicitKeys
          ? { credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } }
          : { credentials: defaultProvider() }),
      })
    : null;

  if (!dryRun && s3) {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  }

  const sortedUrls = Array.from(globalLegacy).sort();

  if (!dryRun && s3) {
    for (let i = 0; i < sortedUrls.length; i += BATCH_SIZE) {
      const batch = sortedUrls.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (sourceUrl) => {
          const fetched = await fetchImageWithFallback(sourceUrl);
          if (!fetched.ok) {
            console.error(`[patch:lifecycle-images-s3] FAIL fetch ${sourceUrl.slice(0, 80)}… ${fetched.error}`);
            return;
          }

          const key = lifecycleS3KeyFromSourceUrl(sourceUrl, fetched.contentType);
          const exists = await headObjectExists(s3, bucket!, key);
          if (exists) {
            skippedHead++;
            const newUrl = publicS3ObjectUrl(bucket!, region, key);
            sourceToDest.set(sourceUrl, newUrl);
            console.log(`patch:migration:skip:already_migrated_url ${sourceUrl.slice(0, 96)}…`);
            return;
          }

          await s3.send(
            new PutObjectCommand({
              Bucket: bucket!,
              Key: key,
              Body: fetched.buf,
              ContentType: fetched.contentType,
              CacheControl: "public, max-age=31536000, immutable",
            }),
          );
          newlyMigrated++;
          const newUrl = publicS3ObjectUrl(bucket!, region, key);
          sourceToDest.set(sourceUrl, newUrl);
          console.log(`[patch:lifecycle-images-s3] uploaded: ${newUrl}`);
        }),
      );
      if (i + BATCH_SIZE < sortedUrls.length) await sleep(BATCH_DELAY_MS);
    }
  } else if (dryRun) {
    for (const u of sortedUrls) {
      console.log(`[patch:lifecycle-images-s3] DRY-RUN would process: ${u.slice(0, 120)}…`);
    }
  }

  let patchedRows = 0;

  if (!dryRun && s3) {
    for (const row of rows) {
      console.log(`patch:migration:canvas:${row.id}`);
      const rowNeed = new Set<string>();
      collectLegacyPatchCandidateUrls(row.raw_steps, projectHost, migrateOpts, target, rowNeed);

      if (rowNeed.size === 0) {
        const rowMigratable = new Set<string>();
        collectUploadCandidateUrls(row.raw_steps, projectHost, migrateOpts, rowMigratable);
        let backfillFailed = false;
        for (const u of rowMigratable) {
          if (sourceToDest.has(u)) continue;
          const r = await ensureSourceToDestForMigratableUrl(s3, bucket!, region, u, sourceToDest);
          if (!r.ok) {
            backfillFailed = true;
            break;
          }
          if (r.headSkip) skippedHead++;
          if (r.uploaded) newlyMigrated++;
        }
        if (backfillFailed) {
          console.warn(
            `[patch:lifecycle-images-s3] skip DB update for ${row.id}: backfill mapping failed for one or more migratable URLs`,
          );
          continue;
        }
      }

      let unresolved = false;
      for (const u of rowNeed) {
        if (!sourceToDest.has(u)) {
          unresolved = true;
          break;
        }
      }
      if (unresolved) {
        console.warn(
          `[patch:lifecycle-images-s3] skip DB update for ${row.id}: one or more source URLs failed to fetch/upload`,
        );
        continue;
      }

      const { combined } = extractUrlSetsFromRawSteps(row.raw_steps);
      const map = new Map<string, string>();
      for (const u of combined) {
        const t = u.trim();
        if (!t) continue;
        const fromBatch = sourceToDest.get(t);
        if (fromBatch) {
          map.set(t, fromBatch);
          continue;
        }
        const canon = canonicalPublicUrlOnTargetIfNeeded(t, bucket!, region);
        if (canon) map.set(t, canon);
      }
      if (map.size === 0) continue;

      const next = replaceUrlsDeep(row.raw_steps, map) as unknown;
      if (JSON.stringify(next) === JSON.stringify(row.raw_steps)) {
        continue;
      }

      const { error: upErr } = await supabase.from("braze_canvases").update({ raw_steps: next }).eq("id", row.id);
      if (upErr) {
        console.error(`[patch:lifecycle-images-s3] DB FAIL ${row.id}: ${upErr.message}`);
      } else {
        patchedRows++;
        console.log(`[patch:lifecycle-images-s3] DB updated ${row.id}`);
      }
    }
  }

  let stillRemaining = 0;
  if (!dryRun) {
    stillRemaining = await countRemainingLegacyRows(supabase, forceFullScan);
  }

  console.log("patch:migration:done");

  const summary: PatchSummary = {
    patched_rows_count: dryRun ? 0 : patchedRows,
    newly_migrated_urls_count: dryRun ? 0 : newlyMigrated,
    skipped_s3_head_existing: dryRun ? 0 : skippedHead,
    still_remaining_legacy_after_run: dryRun ? -1 : stillRemaining,
    canvas_ids_considered: rows.length,
    dryRun,
    migrateBrazeCdn,
    at: new Date().toISOString(),
  };

  await writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log("[patch:lifecycle-images-s3] summary:", summary);
}

main().catch((e) => {
  console.error(e);
  // Defer exit so pending handles can close (reduces occasional Windows libuv assertion after errors).
  setTimeout(() => process.exit(1), 32);
});
