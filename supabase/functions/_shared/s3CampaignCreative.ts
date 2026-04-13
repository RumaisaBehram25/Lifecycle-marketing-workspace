/**
 * Optional AWS S3 upload for campaign preview images (faster global reads vs single-region Storage).
 * Configure via Edge Function secrets — never commit access keys.
 */
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.700.0";

export function isS3CampaignCreativeConfigured(): boolean {
  return Boolean(
    Deno.env.get("AWS_ACCESS_KEY_ID")?.trim() &&
      Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim() &&
      Deno.env.get("AWS_S3_CAMPAIGN_BUCKET")?.trim(),
  );
}

/** Virtual-hosted–style public URL (bucket must allow public GetObject via policy). */
export function publicS3ObjectUrl(bucket: string, region: string, key: string): string {
  const encodedKey = key.split("/").map((p) => encodeURIComponent(p)).join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export async function uploadCampaignCreativeToS3(params: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ ok: true; publicUrl: string } | { ok: false; message: string }> {
  const bucket = Deno.env.get("AWS_S3_CAMPAIGN_BUCKET")!.trim();
  const region = (Deno.env.get("AWS_REGION") ?? "us-east-1").trim();
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")!.trim();
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")!.trim();

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { ok: true, publicUrl: publicS3ObjectUrl(bucket, region, params.key) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}
