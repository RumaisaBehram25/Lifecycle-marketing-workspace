/**
 * One-shot: copy braze_campaigns preview images from Supabase Storage URLs to S3,
 * then set image_url to the public S3 HTTPS URL.
 *
 * Env (.env in project root):
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
 *   AWS: S3_BUCKET_NAME or AWS_S3_CAMPAIGN_BUCKET; AWS_REGION or AWS_DEFAULT_REGION (defaults to us-east-1 if unset)
 *   Credentials — either both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env, or omit both and use
 *   the default chain (e.g. `aws configure`, ~/.aws/credentials, AWS_PROFILE, IAM role).
 *
 * Run (from repo root; loads `.env` via dotenv):
 *   npm run migrate:campaign-images-s3
 *
 * Writes: `scripts/failed_uploads.json` (only if any row fails),
 * `scripts/migrate-campaign-images-s3-summary.json` (always).
 */
import dotenv from "dotenv";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { createClient } from "@supabase/supabase-js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 400;
const FAILED_LOG = join(__dirname, "failed_uploads.json");
const SUMMARY_FILE = join(__dirname, "migrate-campaign-images-s3-summary.json");

type FailedRow = {
  id: string;
  braze_campaign_id: string;
  image_url: string | null;
  error: string;
  at: string;
};

/** First non-empty value among env keys (order matters). */
function envFirst(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Match Edge `publicS3ObjectUrl` in supabase/functions/_shared/s3CampaignCreative.ts */
function publicS3ObjectUrl(bucket: string, region: string, key: string): string {
  const encodedKey = key.split("/").map((p) => encodeURIComponent(p)).join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

/**
 * Supabase `/storage/v1/render/image/public/...` (image transforms) often returns HTTP 400 for
 * server-side fetch. The same file is available without transforms at `/storage/v1/object/public/...`.
 */
function preferredStorageFetchUrl(imageUrl: string): string {
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
    /* keep original */
  }
  return imageUrl;
}

async function fetchImageWithFallback(sourceUrl: string): Promise<
  | { ok: true; buf: Buffer; contentType: string }
  | { ok: false; error: string }
> {
  const primary = preferredStorageFetchUrl(sourceUrl);
  const urls = primary === sourceUrl ? [sourceUrl] : [primary, sourceUrl];

  let lastDetail = "";
  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "follow",
        headers: { Accept: "*/*" },
      });
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        return { ok: false, error: "empty body" };
      }
      const ct =
        res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
      return { ok: true, buf, contentType: ct };
    }
    const errBody = (await res.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
    lastDetail = `HTTP ${res.status} ${res.statusText}${errBody ? ` — ${errBody}` : ""}`;
  }
  return { ok: false, error: lastDetail || "fetch failed" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllRows(
  supabase: ReturnType<typeof createClient>,
): Promise<{ id: string; braze_campaign_id: string; image_url: string | null }[]> {
  const pageSize = 1000;
  const out: { id: string; braze_campaign_id: string; image_url: string | null }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("braze_campaigns")
      .select("id, braze_campaign_id, image_url")
      .not("image_url", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function writeFailuresFile(failures: FailedRow[]): Promise<void> {
  await writeFile(FAILED_LOG, JSON.stringify(failures, null, 2));
}

async function processRow(params: {
  supabase: ReturnType<typeof createClient>;
  s3: S3Client;
  bucket: string;
  region: string;
  row: { id: string; braze_campaign_id: string; image_url: string | null };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, s3, bucket, region, row } = params;
  const sourceUrl = row.image_url;
  if (!sourceUrl) return { ok: false, error: "empty image_url" };

  try {
    const host = new URL(sourceUrl).hostname;
    if (host === `${bucket}.s3.${region}.amazonaws.com` || host === `${bucket}.s3.amazonaws.com`) {
      return { ok: false, error: "skip: already on target S3 bucket" };
    }
  } catch {
    return { ok: false, error: "invalid image_url" };
  }

  const fetched = await fetchImageWithFallback(sourceUrl);
  if (!fetched.ok) {
    return { ok: false, error: `fetch ${fetched.error}` };
  }
  const { buf, contentType: ct } = fetched;

  const key = `campaign-creatives/${row.braze_campaign_id}.png`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentType: ct,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch (e) {
    return { ok: false, error: `S3: ${e instanceof Error ? e.message : String(e)}` };
  }

  const newUrl = publicS3ObjectUrl(bucket, region, key);
  const { error: upErr } = await supabase
    .from("braze_campaigns")
    .update({ image_url: newUrl })
    .eq("id", row.id);

  if (upErr) {
    return { ok: false, error: `DB update: ${upErr.message}` };
  }

  return { ok: true };
}

async function main(): Promise<void> {
  const supabaseUrl = envFirst("SUPABASE_URL", "VITE_SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("Set SUPABASE_URL or VITE_SUPABASE_URL (see .env.example)");
  }
  const serviceKey = envFirst("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    throw new Error("Set SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }
  const accessKeyId = envFirst("AWS_ACCESS_KEY_ID");
  const secretAccessKey = envFirst("AWS_SECRET_ACCESS_KEY");
  const hasExplicitKeys = Boolean(accessKeyId && secretAccessKey);
  const onlyOneKey = Boolean(accessKeyId || secretAccessKey) && !hasExplicitKeys;
  if (onlyOneKey) {
    throw new Error(
      "Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or omit both and rely on ~/.aws/credentials / aws configure / AWS_PROFILE.",
    );
  }

  let region = envFirst("AWS_REGION", "AWS_DEFAULT_REGION");
  if (!region) {
    region = "us-east-1";
    console.warn(
      "[migrate:campaign-images-s3] AWS_REGION unset — using us-east-1. Set AWS_REGION if your bucket is in another region.",
    );
  }

  const bucket = envFirst("S3_BUCKET_NAME", "AWS_S3_CAMPAIGN_BUCKET");
  if (!bucket) {
    throw new Error("Set S3_BUCKET_NAME or AWS_S3_CAMPAIGN_BUCKET");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const s3 = new S3Client({
    region,
    ...(hasExplicitKeys
      ? {
          credentials: {
            accessKeyId: accessKeyId!,
            secretAccessKey: secretAccessKey!,
          },
        }
      : { credentials: defaultProvider() }),
  });
  if (!hasExplicitKeys) {
    console.log(
      "[migrate:campaign-images-s3] Using AWS default credential provider (env keys not set).",
    );
  }

  const rows = await fetchAllRows(supabase);
  console.log(`Rows with image_url set: ${rows.length}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failures: FailedRow[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((row) =>
        processRow({ supabase, s3, bucket, region, row }).then((r) => ({ row, r })),
      ),
    );

    for (const { row, r } of results) {
      if (r.ok) {
        ok++;
        console.log(`OK ${row.braze_campaign_id}`);
        continue;
      }
      if (r.error.startsWith("skip:")) {
        skipped++;
        console.log(`Skip ${row.braze_campaign_id}: ${r.error}`);
        continue;
      }
      failed++;
      const entry: FailedRow = {
        id: row.id,
        braze_campaign_id: row.braze_campaign_id,
        image_url: row.image_url,
        error: r.error,
        at: new Date().toISOString(),
      };
      failures.push(entry);
      await writeFailuresFile(failures);
      console.error(`FAIL ${row.braze_campaign_id}: ${r.error}`);
    }

    if (i + BATCH_SIZE < rows.length) await sleep(BATCH_DELAY_MS);
  }

  const summary = { ok, skipped, failed, total: rows.length, at: new Date().toISOString() };
  await writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log("Done:", summary);
  if (failed > 0) {
    console.log(`Wrote ${failed} failure(s) to ${FAILED_LOG}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
