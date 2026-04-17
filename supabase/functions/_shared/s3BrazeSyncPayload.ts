/**
 * Optional mirror of large Braze sync payloads (campaign raw_details, canvas raw_steps) to S3.
 * Offloads cold storage / CDN reads from Postgres JSONB when enabled; DB remains source of truth for the app.
 *
 * Secrets (Supabase Edge):
 * - BRAZE_SYNC_PAYLOADS_TO_S3=true
 * - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (default us-east-1)
 * - AWS_S3_BRAZE_SYNC_BUCKET (preferred) or AWS_S3_CAMPAIGN_BUCKET
 *
 * Objects: braze-sync/{clientId}/{kind}/{brazeId}.json.gz (gzip, application/json + Content-Encoding gzip)
 */
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.700.0";

export function isS3BrazeSyncPayloadEnabled(): boolean {
  const on = Deno.env.get("BRAZE_SYNC_PAYLOADS_TO_S3")?.trim().toLowerCase();
  if (on !== "true" && on !== "1" && on !== "yes") return false;
  return Boolean(
    Deno.env.get("AWS_ACCESS_KEY_ID")?.trim() &&
      Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim() &&
      (Deno.env.get("AWS_S3_BRAZE_SYNC_BUCKET")?.trim() || Deno.env.get("AWS_S3_CAMPAIGN_BUCKET")?.trim()),
  );
}

function syncPayloadBucket(): string {
  const b = Deno.env.get("AWS_S3_BRAZE_SYNC_BUCKET")?.trim() || Deno.env.get("AWS_S3_CAMPAIGN_BUCKET")?.trim();
  if (!b) throw new Error("Missing S3 bucket for Braze sync payloads");
  return b;
}

/** Virtual-hosted–style public URL (same shape as s3CampaignCreative). */
function publicS3ObjectUrl(bucket: string, region: string, key: string): string {
  const encodedKey = key.split("/").map((p) => encodeURIComponent(p)).join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

async function gzipUtf8(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new CompressionStream("gzip"));
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const MAX_PAYLOAD_JSON_CHARS = 45_000_000;

export type BrazeSyncS3PayloadKind = "campaign" | "canvas_touchpoints" | "canvas_detail";

export async function uploadBrazeSyncPayload(params: {
  clientId: string;
  kind: BrazeSyncS3PayloadKind;
  brazeId: string;
  payload: unknown;
}): Promise<{ ok: true; key: string; publicUrl: string } | { ok: false; message: string }> {
  try {
    const json = JSON.stringify(params.payload);
    if (json.length > MAX_PAYLOAD_JSON_CHARS) {
      return {
        ok: false,
        message: `payload too large for S3 mirror (${json.length} chars > ${MAX_PAYLOAD_JSON_CHARS})`,
      };
    }
    const raw = new TextEncoder().encode(json);
    const body = await gzipUtf8(raw);
    const key = `braze-sync/${params.clientId}/${params.kind}/${params.brazeId}.json.gz`;

    const bucket = syncPayloadBucket();
    const region = (Deno.env.get("AWS_REGION") ?? "us-east-1").trim();
    const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")!.trim();
    const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")!.trim();

    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        ContentEncoding: "gzip",
        CacheControl: "public, max-age=3600",
      }),
    );
    return { ok: true, key, publicUrl: publicS3ObjectUrl(bucket, region, key) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}
