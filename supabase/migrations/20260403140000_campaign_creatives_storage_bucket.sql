-- Public bucket for campaign creative images (getPublicUrl + image transformation query params).
-- Matches default in src/lib/campaignCreativeStorage.ts (override with VITE_SUPABASE_CAMPAIGN_CREATIVES_BUCKET if needed).

INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-creatives', 'campaign-creatives', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read campaign creatives"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-creatives');

CREATE POLICY "Authenticated users can upload campaign creatives"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campaign-creatives');

CREATE POLICY "Authenticated users can update campaign creatives"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'campaign-creatives')
WITH CHECK (bucket_id = 'campaign-creatives');

CREATE POLICY "Authenticated users can delete campaign creatives"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'campaign-creatives');
