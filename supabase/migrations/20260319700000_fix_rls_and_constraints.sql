-- Fix RLS for braze_campaign_analytics
CREATE POLICY "update_braze_campaign_analytics"
ON braze_campaign_analytics FOR UPDATE
TO authenticated
USING (true);

-- Fix unique constraint for customerio_campaigns
ALTER TABLE customerio_campaigns
ADD CONSTRAINT customerio_campaigns_unique
UNIQUE (campaign_name, date_range);