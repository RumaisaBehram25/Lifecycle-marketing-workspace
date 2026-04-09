ALTER TABLE public.braze_campaigns
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.braze_campaigns.image_url IS
  'Full public Supabase Storage URL for an uploaded campaign creative (not a storage path).';
