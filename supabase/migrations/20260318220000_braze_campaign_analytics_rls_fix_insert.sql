-- Fix RLS so non-admin users can INSERT into braze_campaign_analytics (CSV upload).
-- FOR ALL policies apply USING to the new row on INSERT, so "Admins can manage" was blocking.
-- Restrict admin policy to SELECT/UPDATE/DELETE only; keep dedicated INSERT policy.

DROP POLICY IF EXISTS "Admins can manage braze_campaign_analytics" ON public.braze_campaign_analytics;

CREATE POLICY "Admins can select braze_campaign_analytics"
  ON public.braze_campaign_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

CREATE POLICY "Admins can update braze_campaign_analytics"
  ON public.braze_campaign_analytics FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete braze_campaign_analytics"
  ON public.braze_campaign_analytics FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- Ensure authenticated users can INSERT (CSV upload from onboarding).
-- WITH CHECK (true) so the new row is allowed regardless of FOR ALL behavior.
DROP POLICY IF EXISTS "Authenticated users can insert braze_campaign_analytics" ON public.braze_campaign_analytics;
CREATE POLICY "Authenticated users can insert braze_campaign_analytics"
  ON public.braze_campaign_analytics FOR INSERT
  TO authenticated
  WITH CHECK (true);
