-- CSV uploads (profile / onboarding) upsert on braze_segment_analytics and customerio_campaigns.
-- Legacy UNIQUE(segment_id, date) and UNIQUE(campaign_name, date_range) omitted client_id, so
-- two workspaces could "conflict" on the same key — Postgres then UPDATEs the other tenant's row
-- and RLS fails with: new row violates policy (USING expression).

BEGIN;

DO $$
DECLARE
  dg UUID;
BEGIN
  SELECT id INTO dg FROM public.clients WHERE slug = 'doublegood' LIMIT 1;
  IF dg IS NOT NULL THEN
    UPDATE public.braze_segment_analytics SET client_id = dg WHERE client_id IS NULL;
    UPDATE public.customerio_campaigns SET client_id = dg WHERE client_id IS NULL;
  END IF;
END $$;

-- Keep one row per workspace key (smallest id). Only dedupe rows that have the CSV key columns set.
DELETE FROM public.braze_segment_analytics a
  USING public.braze_segment_analytics b
WHERE a.segment_id IS NOT NULL
  AND a.date IS NOT NULL
  AND b.segment_id IS NOT NULL
  AND b.date IS NOT NULL
  AND a.client_id IS NOT DISTINCT FROM b.client_id
  AND a.segment_id IS NOT DISTINCT FROM b.segment_id
  AND a.date IS NOT DISTINCT FROM b.date
  AND a.id > b.id;

DELETE FROM public.customerio_campaigns a
  USING public.customerio_campaigns b
WHERE a.campaign_name IS NOT NULL
  AND a.date_range IS NOT NULL
  AND b.campaign_name IS NOT NULL
  AND b.date_range IS NOT NULL
  AND a.client_id IS NOT DISTINCT FROM b.client_id
  AND a.campaign_name IS NOT DISTINCT FROM b.campaign_name
  AND a.date_range IS NOT DISTINCT FROM b.date_range
  AND a.id > b.id;

ALTER TABLE public.braze_segment_analytics DROP CONSTRAINT IF EXISTS braze_segment_analytics_segment_id_date_key;

ALTER TABLE public.customerio_campaigns DROP CONSTRAINT IF EXISTS customerio_campaigns_unique;

ALTER TABLE public.braze_segment_analytics
  ADD CONSTRAINT braze_segment_analytics_client_segment_date_key
  UNIQUE (client_id, segment_id, date);

ALTER TABLE public.customerio_campaigns
  ADD CONSTRAINT customerio_campaigns_client_campaign_daterange_key
  UNIQUE (client_id, campaign_name, date_range);

COMMIT;
