/**
 * One-shot: find image URLs in braze_canvases.raw_steps — from JSON fields and from HTML in
 * messages[].html_content / messages[].body — optionally download bytes, upload to S3, rewrite in place.
 *
 * Default migratable sources: Supabase Storage URLs only.
 * Set MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN=1 or --migrate-braze-cdn to also migrate Braze CDN (braze-images.com, appboy) images.
 *
 * This is a full binary pipeline: URL → fetch → Buffer → PutObject → persist new HTTPS URL (including inside HTML strings).
 *
 * Env: same as migrate-campaign-images-s3 (SUPABASE_URL, service role, AWS bucket, etc.)
 * Optional:
 *   MIGRATE_LIFECYCLE_PAGE_SIZE — only used for the lightweight ID list pagination (default 500).
 *   Full rows are loaded one id at a time so each PostgREST response is a single raw_steps blob (avoids
 *   multi‑hundred‑MB JSON arrays that break JSON.parse with "Unterminated string").
 *   MIGRATE_LIFECYCLE_DEBUG_MAX_CANVASES — with --dry-run --debug-urls only: max canvases to load (default 600).
 *   MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN=1 — include Braze / Appboy CDN URLs in upload + DB rewrite (not only Supabase Storage).
 *
 * Run:
 *   npm run migrate:lifecycle-images-s3
 *   npm run migrate:lifecycle-images-s3 -- --dry-run
 *
 * Flags:
 *   --dry-run           Do not call S3 or UPDATE the database; only log canvases and extracted URLs.
 *   --skip-verify       Skip post-migration scan for remaining Supabase Storage URLs (live run only).
 *   --debug-urls        With --dry-run: partial scan + URL breakdown (json vs html extraction).
 *   --migrate-braze-cdn Same as MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN=1 for live migration.
 */
import dotenv from "dotenv";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { createClient } from "@supabase/supabase-js";
import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  envFirst,
  supabaseProjectHostname,
  publicS3ObjectUrl,
  fetchImageWithFallback,
  normalizeUrlString,
  classifyLifecycleImageUrl,
  type UrlGroup,
  extractUrlSetsFromRawSteps,
  collectUploadCandidateUrls,
  collectMigratableSupabaseStorageUrls,
  replaceUrlsDeep,
  lifecycleS3KeyFromSourceUrl,
} from "./lib/lifecycleCanvasImageS3Core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 400;
const FAILED_LOG = join(__dirname, "failed-lifecycle-canvas-migrations.json");
const SUMMARY_FILE = join(__dirname, "migrate-lifecycle-canvas-images-s3-summary.json");

type CanvasRow = {
  id: string;
  client_id: string;
  braze_canvas_id: string | null;
  raw_steps: unknown;
};

type FailedEntry = {
  canvasRowId: string;
  braze_canvas_id: string | null;
  error: string;
  at: string;
};

type MigrationStats = {
  mode: "live" | "dry-run";
  canvasesScanned: number;
  jsonExtractedUniqueUrls?: number;
  htmlExtractedUniqueUrls?: number;
  combinedUniqueUrls?: number;
  canvasesWithMigratableUrls: number;
  uniqueMigratableUrlsFound: number;
  migrateBrazeCdn: boolean;
  imagesDownloadedOk: number;
  imagesUploadedToS3: number;
  fetchFailures: number;
  s3Failures: number;
  dbRowsUpdated: number;
  dbRowsSkippedNoUrls: number;
  dbRowsSkippedNoMapping: number;
  dbRowsSkippedUnchanged: number;
  dbUpdateFailures: number;
  remainingMigratableUrlOccurrencesAfter?: number;
  remainingUniqueMigratableUrlsAfter?: number;
  at: string;
};

function parseFlags(argv: string[]): {
  dryRun: boolean;
  skipVerify: boolean;
  debugUrls: boolean;
  migrateBrazeCdn: boolean;
} {
  const dryRun = argv.includes("--dry-run");
  const skipVerify = argv.includes("--skip-verify");
  const debugUrls = argv.includes("--debug-urls");
  const migrateBrazeCdn =
    argv.includes("--migrate-braze-cdn") ||
    envFirst("MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN") === "1" ||
    envFirst("MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN")?.toLowerCase() === "true";
  return { dryRun, skipVerify, debugUrls, migrateBrazeCdn };
}

function logMigrationDiagnostics(params: {
  uniqueMigratable: number;
  combinedUnique: number;
  jsonCount: number;
  htmlCount: number;
  counts: Record<UrlGroup, number>;
  migrateBrazeCdn: boolean;
}): void {
  const { uniqueMigratable, combinedUnique, jsonCount, htmlCount, counts, migrateBrazeCdn } = params;

  if (uniqueMigratable > 0) {
    console.log(
      `\n[migrate:lifecycle-images-s3] ${uniqueMigratable} unique upload candidate URL(s) — a live run will fetch and upload these (substring replace in JSON + HTML fields).\n`,
    );
    return;
  }

  console.log("\n[migrate:lifecycle-images-s3] WHY MIGRATION IS 0 — checklist:\n");
  if (combinedUnique === 0 && jsonCount === 0 && htmlCount === 0) {
    console.log(
      "  • No http(s) or // URLs were extracted from JSON (excluding html blobs) or from <img>/<source> inside html_content/body.\n" +
        "    If images use only relative paths or data: URIs, they will not appear here.",
    );
  } else {
    console.log(
      `  • Extraction: json_extracted=${jsonCount} unique, html_extracted=${htmlCount} unique, total_unique=${combinedUnique}.`,
    );
    console.log(
      `  • Classification: supabase_storage=${counts.supabase_storage_urls}, s3_amazonaws=${counts.s3_amazonaws_urls}, braze_cdn=${counts.braze_cdn_urls}, stripo_cdn=${counts.stripo_cdn_urls}, other=${counts.other_urls}.`,
    );
    if (counts.supabase_storage_urls === 0) {
      console.log(
        "  (a) No Supabase Storage URLs (/storage/, /object/public/, …) — the default upload rule only migrates those unless Braze mode is on.",
      );
    }
    if (counts.braze_cdn_urls > 0 && !migrateBrazeCdn) {
      console.log(
        "  (b) Braze CDN URLs are present but not included in upload. Set MIGRATE_LIFECYCLE_MIGRATE_BRAZE_CDN=1 or --migrate-braze-cdn.\n" +
          "      Fetch must succeed (some CDNs block non-browser clients).",
      );
    }
    if (counts.s3_amazonaws_urls > 0) {
      console.log(
        "  • Some URLs already use S3 (amazonaws.com) — those are skipped as non-source URLs.",
      );
    }
  }
  console.log(
    "\n  Note: Earlier versions only scanned plain JSON strings; <img src=\"…\"> inside html_content/body is now parsed with node-html-parser.\n",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const DEFAULT_ID_PAGE_SIZE = 500;

function idPageSizeFromEnv(): number {
  const raw = envFirst("MIGRATE_LIFECYCLE_PAGE_SIZE");
  if (!raw) return DEFAULT_ID_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 1000);
  return DEFAULT_ID_PAGE_SIZE;
}

/**
 * IDs only — tiny JSON per page. Avoids selecting raw_steps for thousands of rows in one response.
 */
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
    if (lastId) {
      q = q.gt("id", lastId);
    }

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

const DEFAULT_DEBUG_MAX_CANVASES = 600;

function debugMaxCanvasesFromEnv(): number {
  const raw = envFirst("MIGRATE_LIFECYCLE_DEBUG_MAX_CANVASES");
  if (!raw) return DEFAULT_DEBUG_MAX_CANVASES;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 50_000);
  return DEFAULT_DEBUG_MAX_CANVASES;
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
    console.error(
      `[migrate:lifecycle-images-s3] SKIP canvas id=${id} (could not load raw_steps): ${error.message}`,
    );
    return null;
  }
  return data as CanvasRow;
}

/** First N canvases with raw_steps — for --debug-urls only (fast URL/host breakdown). */
async function loadCanvasRowsPartial(
  supabase: ReturnType<typeof createClient>,
  maxRows: number,
): Promise<{ rows: CanvasRow[]; totalIds: number }> {
  const ids = await loadAllCanvasIdsWithRawSteps(supabase);
  const totalIds = ids.length;
  const slice = ids.slice(0, maxRows);
  console.log(
    `[migrate:lifecycle-images-s3] [--debug-urls] loading ${slice.length} of ${totalIds} canvases (cap=${maxRows})…`,
  );

  const rows: CanvasRow[] = [];
  let n = 0;
  for (const id of slice) {
    n++;
    if (n % 100 === 0) {
      console.log(`[migrate:lifecycle-images-s3]   … ${n}/${slice.length}`);
    }
    const row = await fetchCanvasRowById(supabase, id);
    if (row) rows.push(row);
  }
  return { rows, totalIds };
}

/**
 * Load full rows one id at a time so each HTTP body is a single row’s JSON (not a 100MB+ array).
 */
async function loadAllCanvasRows(
  supabase: ReturnType<typeof createClient>,
): Promise<CanvasRow[]> {
  const ids = await loadAllCanvasIdsWithRawSteps(supabase);
  console.log(
    `[migrate:lifecycle-images-s3] fetching ${ids.length} full rows (one PostgREST request per id; avoids oversized multi-row JSON)…`,
  );

  const canvasRows: CanvasRow[] = [];
  let n = 0;
  for (const id of ids) {
    n++;
    if (n % 250 === 0) {
      console.log(`[migrate:lifecycle-images-s3]   loaded ${n}/${ids.length}…`);
    }
    const row = await fetchCanvasRowById(supabase, id);
    if (row) canvasRows.push(row);
  }

  return canvasRows;
}

/** After migration: how many Supabase Storage URLs still appear in raw_steps (should be 0). */
async function verifyRemainingSupabaseStorageUrls(
  supabase: ReturnType<typeof createClient>,
  projectHost: string | null,
): Promise<{ totalStringOccurrences: number; uniqueUrls: number }> {
  const rows = await loadAllCanvasRows(supabase);
  const unique = new Set<string>();
  let total = 0;
  for (const row of rows) {
    const set = new Set<string>();
    collectMigratableSupabaseStorageUrls(row.raw_steps, set, projectHost);
    for (const u of set) {
      unique.add(u);
      total += 1;
    }
  }
  return { totalStringOccurrences: total, uniqueUrls: unique.size };
}

async function validateS3Bucket(s3: S3Client, bucket: string, region: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `S3 HeadBucket failed for bucket "${bucket}" (region ${region}): ${msg}\n` +
        "Check AWS credentials, region, and bucket name. IAM needs s3:HeadBucket (and PutObject for upload).",
    );
  }
}

async function main(): Promise<void> {
  const { dryRun, skipVerify, debugUrls, migrateBrazeCdn } = parseFlags(process.argv);
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
    console.warn("[migrate:lifecycle-images-s3] AWS_REGION unset — using us-east-1");
  }

  const bucket = envFirst("S3_BUCKET_NAME", "AWS_S3_CAMPAIGN_BUCKET");
  if (!dryRun && !bucket) throw new Error("Set S3_BUCKET_NAME or AWS_S3_CAMPAIGN_BUCKET");

  console.log(
    `[migrate:lifecycle-images-s3] mode=${dryRun ? "DRY-RUN (no S3, no DB updates)" : "LIVE"}` +
      (projectHost ? ` | Supabase host from env: ${projectHost}` : "") +
      ` | migrateBrazeCdn=${migrateBrazeCdn}`,
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let canvasRows: CanvasRow[];
  if (dryRun && debugUrls) {
    const cap = debugMaxCanvasesFromEnv();
    const { rows, totalIds } = await loadCanvasRowsPartial(supabase, cap);
    canvasRows = rows;
    console.warn(
      `[--debug-urls] Partial scan: ${rows.length} canvas row(s) loaded (first ${cap} ids). ` +
        `Total canvases with raw_steps in DB: ${totalIds}. Omit --debug-urls for a full scan.`,
    );
  } else {
    canvasRows = await loadAllCanvasRows(supabase);
  }

  const unionJson = new Set<string>();
  const unionHtml = new Set<string>();
  const unionCombined = new Set<string>();
  for (const row of canvasRows) {
    const { jsonUrls, htmlUrls, combined } = extractUrlSetsFromRawSteps(row.raw_steps);
    for (const u of jsonUrls) unionJson.add(u);
    for (const u of htmlUrls) unionHtml.add(u);
    for (const u of combined) unionCombined.add(u);
  }

  const stats: MigrationStats = {
    mode: dryRun ? "dry-run" : "live",
    canvasesScanned: canvasRows.length,
    jsonExtractedUniqueUrls: unionJson.size,
    htmlExtractedUniqueUrls: unionHtml.size,
    combinedUniqueUrls: unionCombined.size,
    canvasesWithMigratableUrls: 0,
    uniqueMigratableUrlsFound: 0,
    migrateBrazeCdn,
    imagesDownloadedOk: 0,
    imagesUploadedToS3: 0,
    fetchFailures: 0,
    s3Failures: 0,
    dbRowsUpdated: 0,
    dbRowsSkippedNoUrls: 0,
    dbRowsSkippedNoMapping: 0,
    dbRowsSkippedUnchanged: 0,
    dbUpdateFailures: 0,
    at: new Date().toISOString(),
  };

  const countsAll: Record<UrlGroup, number> = {
    supabase_storage_urls: 0,
    s3_amazonaws_urls: 0,
    braze_cdn_urls: 0,
    stripo_cdn_urls: 0,
    other_urls: 0,
  };
  const samplesAll: Record<UrlGroup, string[]> = {
    supabase_storage_urls: [],
    s3_amazonaws_urls: [],
    braze_cdn_urls: [],
    stripo_cdn_urls: [],
    other_urls: [],
  };
  for (const u of unionCombined) {
    const g = classifyLifecycleImageUrl(u, projectHost);
    countsAll[g]++;
    if (samplesAll[g].length < 10) samplesAll[g].push(u);
  }

  for (const row of canvasRows) {
    const s = new Set<string>();
    collectUploadCandidateUrls(row.raw_steps, projectHost, migrateOpts, s);
    if (s.size > 0) stats.canvasesWithMigratableUrls++;
  }

  const allUrls = new Set<string>();
  for (const row of canvasRows) {
    collectUploadCandidateUrls(row.raw_steps, projectHost, migrateOpts, allUrls);
  }
  const uniqueList = Array.from(allUrls);
  stats.uniqueMigratableUrlsFound = uniqueList.length;

  console.log(`[migrate:lifecycle-images-s3] canvases scanned: ${stats.canvasesScanned}`);
  console.log(
    `[migrate:lifecycle-images-s3] extraction (unique across scan): json_string_urls=${unionJson.size}, html_parsed_urls=${unionHtml.size}, total_unique=${unionCombined.size}`,
  );
  console.log(
    `[migrate:lifecycle-images-s3] classification (unique combined): ${JSON.stringify(countsAll)}`,
  );
  console.log(
    `[migrate:lifecycle-images-s3] canvases with ≥1 upload candidate URL: ${stats.canvasesWithMigratableUrls}`,
  );
  console.log(
    `[migrate:lifecycle-images-s3] unique upload candidate URLs (Supabase Storage${migrateBrazeCdn ? " + Braze CDN" : ""}): ${uniqueList.length}`,
  );

  if (uniqueList.length === 0) {
    console.warn("[migrate:lifecycle-images-s3] WARNING: No upload candidate URLs for this run.");
  }

  logMigrationDiagnostics({
    uniqueMigratable: uniqueList.length,
    combinedUnique: unionCombined.size,
    jsonCount: unionJson.size,
    htmlCount: unionHtml.size,
    counts: countsAll,
    migrateBrazeCdn,
  });

  if (dryRun && debugUrls) {
    console.log("\n[--debug-urls] Sample URLs by category (up to 10 each):");
    for (const kind of Object.keys(samplesAll) as UrlGroup[]) {
      if (samplesAll[kind].length === 0) continue;
      console.log(`  ${kind}:`);
      for (const s of samplesAll[kind]) {
        console.log(`    ${s.length > 220 ? `${s.slice(0, 220)}…` : s}`);
      }
    }
    if (unionCombined.size === 0) {
      console.log(
        "[--debug-urls] No URLs extracted in this scan. Try raising MIGRATE_LIFECYCLE_DEBUG_MAX_CANVASES, " +
          "or run without --debug-urls to scan all rows.",
      );
    }
    console.log("");
  }

  if (dryRun) {
    console.log(
      "\n--- DRY-RUN: per-canvas upload candidate URLs (id, braze_canvas_id, urls) — empty if none ---\n",
    );
    for (const row of canvasRows) {
      const set = new Set<string>();
      collectUploadCandidateUrls(row.raw_steps, projectHost, migrateOpts, set);
      if (set.size === 0) continue;
      console.log(`canvas_row_id=${row.id} braze_canvas_id=${row.braze_canvas_id ?? "null"}`);
      for (const u of set) console.log(`  ${u}`);
    }
    console.log("\n--- DRY-RUN end ---\n");
    stats.at = new Date().toISOString();
    await writeFile(SUMMARY_FILE, JSON.stringify(stats, null, 2));
    console.log("Summary (dry-run):", stats);
    return;
  }

  const s3 = new S3Client({
    region,
    ...(hasExplicitKeys
      ? { credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } }
      : { credentials: defaultProvider() }),
  });

  await validateS3Bucket(s3, bucket!, region);
  console.log(`[migrate:lifecycle-images-s3] S3 HeadBucket OK: ${bucket} (${region})`);

  const urlToS3 = new Map<string, string>();
  const failures: FailedEntry[] = [];

  for (let i = 0; i < uniqueList.length; i += BATCH_SIZE) {
    const batch = uniqueList.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (sourceUrl) => {
        try {
          const host = new URL(normalizeUrlString(sourceUrl)).hostname;
          if (
            host === `${bucket}.s3.${region}.amazonaws.com` ||
            host === `${bucket}.s3.amazonaws.com`
          ) {
            urlToS3.set(sourceUrl, sourceUrl);
            return;
          }
        } catch {
          /* fall through */
        }

        console.log(`[migrate:lifecycle-images-s3] downloading: ${sourceUrl.slice(0, 96)}${sourceUrl.length > 96 ? "…" : ""}`);
        const fetched = await fetchImageWithFallback(sourceUrl);
        if (!fetched.ok) {
          stats.fetchFailures++;
          failures.push({
            canvasRowId: "_url_",
            braze_canvas_id: null,
            error: `${sourceUrl.slice(0, 120)}… → ${fetched.error}`,
            at: new Date().toISOString(),
          });
          await writeFile(FAILED_LOG, JSON.stringify(failures, null, 2));
          console.error(`[migrate:lifecycle-images-s3] FAIL fetch: ${fetched.error}`);
          return;
        }
        stats.imagesDownloadedOk++;
        console.log(
          `[migrate:lifecycle-images-s3] downloaded OK: ${fetched.buf.length} bytes, Content-Type: ${fetched.contentType}`,
        );

        const key = lifecycleS3KeyFromSourceUrl(sourceUrl, fetched.contentType);

        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket!,
              Key: key,
              Body: fetched.buf,
              ContentType: fetched.contentType,
              CacheControl: "public, max-age=31536000, immutable",
            }),
          );
        } catch (e) {
          stats.s3Failures++;
          const msg = e instanceof Error ? e.message : String(e);
          failures.push({
            canvasRowId: "_url_",
            braze_canvas_id: null,
            error: `${sourceUrl.slice(0, 60)}… S3: ${msg}`,
            at: new Date().toISOString(),
          });
          await writeFile(FAILED_LOG, JSON.stringify(failures, null, 2));
          console.error(`[migrate:lifecycle-images-s3] FAIL S3 PutObject: ${msg}`);
          return;
        }

        stats.imagesUploadedToS3++;
        const newUrl = publicS3ObjectUrl(bucket!, region, key);
        urlToS3.set(sourceUrl, newUrl);
        console.log(`[migrate:lifecycle-images-s3] uploaded to S3: ${newUrl}`);
      }),
    );
    if (i + BATCH_SIZE < uniqueList.length) await sleep(BATCH_DELAY_MS);
  }

  for (const row of canvasRows) {
    const urlsInRow = new Set<string>();
    collectUploadCandidateUrls(row.raw_steps, projectHost, migrateOpts, urlsInRow);
    if (urlsInRow.size === 0) {
      stats.dbRowsSkippedNoUrls++;
      continue;
    }

    const map = new Map<string, string>();
    for (const u of urlsInRow) {
      const to = urlToS3.get(u);
      if (to) map.set(u, to);
    }
    if (map.size === 0) {
      stats.dbRowsSkippedNoMapping++;
      continue;
    }

    const next = replaceUrlsDeep(row.raw_steps, map) as unknown;
    if (JSON.stringify(next) === JSON.stringify(row.raw_steps)) {
      stats.dbRowsSkippedUnchanged++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("braze_canvases")
      .update({ raw_steps: next })
      .eq("id", row.id);

    if (upErr) {
      stats.dbUpdateFailures++;
      failures.push({
        canvasRowId: row.id,
        braze_canvas_id: row.braze_canvas_id,
        error: upErr.message,
        at: new Date().toISOString(),
      });
      await writeFile(FAILED_LOG, JSON.stringify(failures, null, 2));
      console.error(`[migrate:lifecycle-images-s3] FAIL DB row ${row.id}: ${upErr.message}`);
    } else {
      stats.dbRowsUpdated++;
      console.log(`[migrate:lifecycle-images-s3] DB updated canvas row ${row.id}`);
    }
  }

  if (!skipVerify) {
    const rem = await verifyRemainingSupabaseStorageUrls(supabase, projectHost);
    stats.remainingMigratableUrlOccurrencesAfter = rem.totalStringOccurrences;
    stats.remainingUniqueMigratableUrlsAfter = rem.uniqueUrls;
    console.log(
      `[migrate:lifecycle-images-s3] verify: remaining migratable Supabase Storage URL occurrences in raw_steps: ${rem.totalStringOccurrences} (unique: ${rem.uniqueUrls})`,
    );
    if (rem.uniqueUrls > 0) {
      console.warn(
        "[migrate:lifecycle-images-s3] Some Supabase Storage URLs remain (failed fetch/S3 or unmatched rows). Check failed log and re-run.",
      );
    }
  }

  stats.at = new Date().toISOString();
  await writeFile(SUMMARY_FILE, JSON.stringify(stats, null, 2));
  console.log("[migrate:lifecycle-images-s3] Done:", stats);
  console.log(
    "\nManual SQL to spot any remaining /storage/ strings in raw_steps (Supabase SQL editor):\n" +
      `  SELECT id, name FROM braze_canvases\n` +
      `  WHERE raw_steps::text LIKE '%/storage/%'\n` +
      `    AND raw_steps::text NOT LIKE '%.s3.%amazonaws.com%'\n` +
      `  LIMIT 100;\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
