-- =====================================================
-- Braze Campaigns (denormalized copy of each campaign)
-- =====================================================

CREATE TABLE public.braze_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  braze_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT,
  subject TEXT,
  preheader TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- sent, scheduled, draft
  sent_date TIMESTAMPTZ,
  opens INT DEFAULT 0,
  clicks INT DEFAULT 0,
  deliveries INT DEFAULT 0,
  open_rate NUMERIC,
  click_rate NUMERIC,
  unsubs INT DEFAULT 0,
  segment TEXT,
  tags TEXT[],
  creative_preview TEXT,
  raw_details JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, braze_campaign_id)
);

-- Enable RLS
ALTER TABLE public.braze_campaigns ENABLE ROW LEVEL SECURITY;

-- Approved users can SELECT campaigns for their org (admin or member with approval)
CREATE POLICY "Approved users can view braze_campaigns"
  ON public.braze_campaigns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

-- Only admins can INSERT/UPDATE/DELETE (run by backend sync or admin)
CREATE POLICY "Admins can manage braze_campaigns"
  ON public.braze_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- Trigger to keep updated_at current
CREATE TRIGGER update_braze_campaigns_updated_at
  BEFORE UPDATE ON public.braze_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for fast lookups
CREATE INDEX idx_braze_campaigns_client ON public.braze_campaigns(client_id);
CREATE INDEX idx_braze_campaigns_status ON public.braze_campaigns(client_id, status);
CREATE INDEX idx_braze_campaigns_sent_date ON public.braze_campaigns(client_id, sent_date);
