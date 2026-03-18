-- Allow authenticated users to INSERT into braze_campaign_analytics (CSV upload from onboarding)
-- SELECT still requires approved profile; full manage still requires admin.

DROP POLICY IF EXISTS "Authenticated users can insert braze_campaign_analytics" ON public.braze_campaign_analytics;
CREATE POLICY "Authenticated users can insert braze_campaign_analytics"
  ON public.braze_campaign_analytics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
