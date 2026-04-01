-- Roll up revenue / conversions / engagement from Braze canvas/data_series (sync-braze Phase 3 + Phase 1c)
ALTER TABLE public.braze_canvases
  ADD COLUMN IF NOT EXISTS revenue_last_30d NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions_last_30d INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opens_last_30d INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_last_30d INTEGER DEFAULT 0;

COMMENT ON COLUMN public.braze_canvases.revenue_last_30d IS 'Sum of revenue fields from Braze GET canvas/data_series, last 30 days of series';
COMMENT ON COLUMN public.braze_canvases.conversions_last_30d IS 'Sum of conversion fields from canvas/data_series last 30 days';
