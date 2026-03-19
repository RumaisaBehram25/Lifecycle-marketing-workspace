-- Fix all RLS policies for customerio_campaigns
ALTER TABLE customerio_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert customerio_campaigns" ON customerio_campaigns;
DROP POLICY IF EXISTS "Authenticated users can select customerio_campaigns" ON customerio_campaigns;
DROP POLICY IF EXISTS "Authenticated users can update customerio_campaigns" ON customerio_campaigns;

CREATE POLICY "customerio_campaigns_select" ON customerio_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "customerio_campaigns_insert" ON customerio_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customerio_campaigns_update" ON customerio_campaigns FOR UPDATE TO authenticated USING (true);