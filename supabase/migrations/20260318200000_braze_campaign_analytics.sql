-- Braze Campaign Analytics (CSV import: campaign_id + date + variation_api_id per row)
-- Enables upsert with ON CONFLICT (client_id, campaign_id, date, variation_api_id)

CREATE TABLE IF NOT EXISTS public.braze_campaign_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  variation_api_id TEXT NOT NULL,
  channel TEXT,
  date DATE NOT NULL,
  sent INT DEFAULT 0,
  delivered INT DEFAULT 0,
  opens INT DEFAULT 0,
  unique_opens INT DEFAULT 0,
  clicks INT DEFAULT 0,
  unique_clicks INT DEFAULT 0,
  unsubscribes INT DEFAULT 0,
  bounces INT DEFAULT 0,
  reported_spam INT DEFAULT 0,
  unique_recipients INT DEFAULT 0,
  conversions INT DEFAULT 0,
  conversions_by_send_time INT DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, campaign_id, date, variation_api_id)
);

CREATE INDEX IF NOT EXISTS idx_braze_campaign_analytics_client ON public.braze_campaign_analytics(client_id);
CREATE INDEX IF NOT EXISTS idx_braze_campaign_analytics_client_date ON public.braze_campaign_analytics(client_id, date);

ALTER TABLE public.braze_campaign_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view braze_campaign_analytics"
  ON public.braze_campaign_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "Admins can manage braze_campaign_analytics"
  ON public.braze_campaign_analytics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );
