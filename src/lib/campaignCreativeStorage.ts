import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'campaign-creatives';

export function getCampaignCreativesBucket(): string {
  const fromEnv = import.meta.env.VITE_SUPABASE_CAMPAIGN_CREATIVES_BUCKET?.trim();
  return fromEnv || DEFAULT_BUCKET;
}

/**
 * Public URL for an object in the campaign creatives bucket (bucket is expected to be public — use getPublicUrl, not signed URLs).
 */
export function getCampaignCreativePublicUrl(supabase: SupabaseClient, storagePath: string): string {
  const bucket = getCampaignCreativesBucket();
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

export interface UploadCampaignCreativeParams {
  path: string;
  file: File | Blob;
  /** `braze_campaigns.id` */
  campaignRowId: string;
  upsert?: boolean;
}

/**
 * Uploads to the campaign creatives bucket, resolves the full public URL via getPublicUrl, and persists it on `braze_campaigns.image_url`.
 */
export async function uploadCampaignCreativeAndPersistImageUrl(
  supabase: SupabaseClient,
  params: UploadCampaignCreativeParams,
): Promise<{ publicUrl: string; path: string }> {
  const bucket = getCampaignCreativesBucket();
  const { data, error } = await supabase.storage.from(bucket).upload(params.path, params.file, {
    upsert: params.upsert ?? true,
  });
  if (error) throw error;

  const publicUrl = getCampaignCreativePublicUrl(supabase, data.path);

  const { error: dbErr } = await supabase
    .from('braze_campaigns')
    .update({ image_url: publicUrl })
    .eq('id', params.campaignRowId);

  if (dbErr) throw dbErr;

  return { publicUrl, path: data.path };
}
