/**
 * Download Braze preview image → campaign-creatives bucket → persist braze_campaigns.image_url.
 * Used by sync-braze after campaign upserts. Failures are logged only (sync must succeed).
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.89.0";
import { extractPreviewImageUrl, isSupabaseStoragePublicObjectUrl } from "./campaignPreviewImage.ts";
import { isS3CampaignCreativeConfigured, uploadCampaignCreativeToS3 } from "./s3CampaignCreative.ts";

const DEFAULT_BUCKET = "campaign-creatives";

const GET_PUBLIC_URL_IMAGE_TRANSFORM = {
  width: 600,
  quality: 80,
  format: "origin" as const,
};
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

function getCampaignCreativesBucket(): string {
  const b = Deno.env.get("CAMPAIGN_CREATIVES_BUCKET")?.trim();
  return b || DEFAULT_BUCKET;
}

function extFromContentType(ct: string | null): string | undefined {
  const c = (ct ?? "").toLowerCase();
  if (c.includes("png")) return "png";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  if (c.includes("webp")) return "webp";
  if (c.includes("gif")) return "gif";
  if (c.includes("svg")) return "svg";
  return undefined;
}

function extFromUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("//") ? `https:${url}` : url);
    const m = u.pathname.match(/\.([a-z0-9]+)$/i);
    if (m?.[1]) {
      const e = m[1].toLowerCase();
      if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(e)) {
        return e === "jpeg" ? "jpg" : e;
      }
    }
  } catch {
    /* ignore */
  }
  return "jpg";
}

type CampaignRowForMigrate = {
  id: string;
  client_id: string;
  braze_campaign_id: string;
  image_url: string | null;
  raw_details: unknown;
};

async function maybeMigrateOneRow(
  supabase: SupabaseClient,
  row: CampaignRowForMigrate,
): Promise<void> {
  try {
    const existing = row.image_url != null ? String(row.image_url).trim() : "";
    if (existing !== "") return;

    const raw = row.raw_details;
    if (raw == null || typeof raw !== "object") return;

    const previewUrl = extractPreviewImageUrl(raw as Record<string, unknown>);
    if (!previewUrl) return;

    const abs = previewUrl.startsWith("//") ? `https:${previewUrl}` : previewUrl;
    if (!abs.startsWith("http://") && !abs.startsWith("https://")) return;
    if (isSupabaseStoragePublicObjectUrl(abs)) return;

    const res = await fetch(abs, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(
        `[Braze Sync] campaign creative fetch failed braze_campaign_id=${row.braze_campaign_id} status=${res.status}`,
      );
      return;
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) {
      console.warn(
        `[Braze Sync] campaign creative skip (size) braze_campaign_id=${row.braze_campaign_id} bytes=${buf.byteLength}`,
      );
      return;
    }

    const ct = res.headers.get("content-type");
    const ctLower = (ct ?? "").toLowerCase();
    if (
      ctLower &&
      !ctLower.startsWith("image/") &&
      !ctLower.includes("octet-stream") &&
      !ctLower.includes("binary")
    ) {
      console.warn(
        `[Braze Sync] campaign creative skip (unlikely MIME) braze_campaign_id=${row.braze_campaign_id} ct=${ct}`,
      );
      return;
    }

    const ext = extFromContentType(ct) ?? extFromUrl(abs);
    const storagePath = `${row.client_id}/${row.braze_campaign_id}.${ext}`;
    const bucket = getCampaignCreativesBucket();
    const mime = ct?.split(";")[0]?.trim() || `image/${ext === "jpg" ? "jpeg" : ext}`;

    const bytes = new Uint8Array(buf);
    let publicUrl: string | undefined;

    if (isS3CampaignCreativeConfigured()) {
      const s3 = await uploadCampaignCreativeToS3({
        key: storagePath,
        body: bytes,
        contentType: mime,
      });
      if (s3.ok) {
        publicUrl = s3.publicUrl;
      } else {
        console.warn(
          `[Braze Sync] S3 campaign creative upload failed braze_campaign_id=${row.braze_campaign_id}:`,
          s3.message,
        );
      }
    }

    if (!publicUrl) {
      const blob = new Blob([buf], { type: mime });
      const { data: uploaded, error: upErr } = await supabase.storage.from(bucket).upload(storagePath, blob, {
        upsert: true,
        contentType: mime,
      });

      if (upErr || !uploaded?.path) {
        console.warn(
          `[Braze Sync] campaign creative upload failed braze_campaign_id=${row.braze_campaign_id}:`,
          upErr?.message ?? "no path",
        );
        return;
      }

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(uploaded.path, {
        transform: GET_PUBLIC_URL_IMAGE_TRANSFORM,
      });
      publicUrl = pub.publicUrl;
      if (!publicUrl) {
        console.warn(
          `[Braze Sync] campaign creative getPublicUrl empty braze_campaign_id=${row.braze_campaign_id}`,
        );
        return;
      }
    }

    if (!publicUrl) return;

    const { error: dbErr } = await supabase
      .from("braze_campaigns")
      .update({ image_url: publicUrl })
      .eq("id", row.id);

    if (dbErr) {
      console.warn(
        `[Braze Sync] campaign creative image_url update failed braze_campaign_id=${row.braze_campaign_id}:`,
        dbErr.message,
      );
    }
  } catch (e) {
    console.warn(
      `[Braze Sync] campaign creative migrate error braze_campaign_id=${row.braze_campaign_id}:`,
      e,
    );
  }
}

/**
 * After braze_campaigns upsert(s), load fresh rows and migrate external preview images to Storage when image_url is null.
 * Runs migrations in parallel; errors are logged only.
 */
export async function migrateCampaignCreativesAfterCampaignUpsert(
  supabase: SupabaseClient,
  clientId: string,
  brazeCampaignIds: string[],
): Promise<void> {
  if (brazeCampaignIds.length === 0) return;
  const unique = [...new Set(brazeCampaignIds.filter(Boolean))];
  if (unique.length === 0) return;

  try {
    const { data: rows, error } = await supabase
      .from("braze_campaigns")
      .select("id, client_id, braze_campaign_id, image_url, raw_details")
      .eq("client_id", clientId)
      .in("braze_campaign_id", unique);

    if (error) {
      console.warn("[Braze Sync] campaign creative migration: select failed:", error.message);
      return;
    }

    await Promise.allSettled((rows ?? []).map((r) => maybeMigrateOneRow(supabase, r as CampaignRowForMigrate)));
  } catch (e) {
    console.warn("[Braze Sync] campaign creative migration batch error:", e);
  }
}
