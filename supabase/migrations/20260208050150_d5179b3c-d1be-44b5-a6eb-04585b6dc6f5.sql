-- Customer.io Campaigns (automated workflows)
CREATE TABLE public.customerio_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  cio_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT, -- 'triggered', 'segment', 'date'
  state TEXT, -- 'draft', 'active', 'paused', 'stopped'
  created_at_cio TIMESTAMPTZ,
  updated_at_cio TIMESTAMPTZ,
  actions JSONB DEFAULT '[]'::jsonb,
  metrics JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  filter_segment TEXT,
  trigger_event TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, cio_campaign_id)
);

-- Customer.io Broadcasts (one-time sends)
CREATE TABLE public.customerio_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  cio_broadcast_id TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT, -- 'draft', 'scheduled', 'sent', 'cancelled'
  send_to TEXT,
  sent_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  metrics JSONB DEFAULT '{}'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, cio_broadcast_id)
);

-- Customer.io Messages/Templates
CREATE TABLE public.customerio_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  cio_message_id TEXT NOT NULL,
  campaign_id UUID REFERENCES customerio_campaigns(id) ON DELETE CASCADE,
  broadcast_id UUID REFERENCES customerio_broadcasts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'email', 'push', 'sms', 'in_app', 'webhook', 'slack'
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  preheader TEXT,
  from_address TEXT,
  reply_to TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, cio_message_id)
);

-- Customer.io Sync Runs (logging)
CREATE TABLE public.customerio_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  campaigns_synced INTEGER DEFAULT 0,
  broadcasts_synced INTEGER DEFAULT 0,
  messages_synced INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.customerio_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customerio_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customerio_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customerio_sync_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customerio_campaigns
CREATE POLICY "Admins can manage customerio_campaigns"
  ON public.customerio_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role));

CREATE POLICY "Approved users can view customerio_campaigns"
  ON public.customerio_campaigns FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_approved = true));

-- RLS Policies for customerio_broadcasts
CREATE POLICY "Admins can manage customerio_broadcasts"
  ON public.customerio_broadcasts FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role));

CREATE POLICY "Approved users can view customerio_broadcasts"
  ON public.customerio_broadcasts FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_approved = true));

-- RLS Policies for customerio_messages
CREATE POLICY "Admins can manage customerio_messages"
  ON public.customerio_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role));

CREATE POLICY "Approved users can view customerio_messages"
  ON public.customerio_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_approved = true));

-- RLS Policies for customerio_sync_runs
CREATE POLICY "Admins can manage customerio_sync_runs"
  ON public.customerio_sync_runs FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role));

CREATE POLICY "Approved users can view customerio_sync_runs"
  ON public.customerio_sync_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_approved = true));

-- Update triggers for updated_at
CREATE TRIGGER update_customerio_campaigns_updated_at
  BEFORE UPDATE ON public.customerio_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_customerio_broadcasts_updated_at
  BEFORE UPDATE ON public.customerio_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_customerio_messages_updated_at
  BEFORE UPDATE ON public.customerio_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();