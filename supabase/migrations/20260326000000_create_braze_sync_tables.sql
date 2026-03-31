-- Braze REST sync tables (supabase/functions/sync-braze/index.ts)
-- client_id references public.clients(id) — same as all other braze_* tables in this project.
-- Hard bounces and unsubscribes are stored in braze_email_events (event_type), not separate tables.

-- =============================================================================
-- braze_kpi_series — KPI /dau|mau|new_users data_series upserts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.braze_kpi_series (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('dau', 'mau', 'new_users')),
  series_date DATE NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, metric, series_date)
);

CREATE INDEX IF NOT EXISTS idx_braze_kpi_series_client_metric_date
  ON public.braze_kpi_series (client_id, metric, series_date DESC);

ALTER TABLE public.braze_kpi_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.braze_kpi_series;
CREATE POLICY "Service role full access" ON public.braze_kpi_series
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Approved users can view braze_kpi_series" ON public.braze_kpi_series;
CREATE POLICY "Approved users can view braze_kpi_series"
  ON public.braze_kpi_series FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage braze_kpi_series" ON public.braze_kpi_series;
CREATE POLICY "Admins can manage braze_kpi_series"
  ON public.braze_kpi_series FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- =============================================================================
-- braze_segments_sync — segments/list snapshot
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.braze_segments_sync (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  braze_segment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  raw JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, braze_segment_id)
);

CREATE INDEX IF NOT EXISTS idx_braze_segments_sync_client ON public.braze_segments_sync (client_id);

ALTER TABLE public.braze_segments_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.braze_segments_sync;
CREATE POLICY "Service role full access" ON public.braze_segments_sync
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Approved users can view braze_segments_sync" ON public.braze_segments_sync;
CREATE POLICY "Approved users can view braze_segments_sync"
  ON public.braze_segments_sync FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage braze_segments_sync" ON public.braze_segments_sync;
CREATE POLICY "Admins can manage braze_segments_sync"
  ON public.braze_segments_sync FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- =============================================================================
-- braze_email_events — hard_bounce + unsubscribe rows from Braze email APIs
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.braze_email_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('hard_bounce', 'unsubscribe')),
  email TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, event_type, email, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_braze_email_events_client_type_time
  ON public.braze_email_events (client_id, event_type, occurred_at DESC);

ALTER TABLE public.braze_email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.braze_email_events;
CREATE POLICY "Service role full access" ON public.braze_email_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Approved users can view braze_email_events" ON public.braze_email_events;
CREATE POLICY "Approved users can view braze_email_events"
  ON public.braze_email_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage braze_email_events" ON public.braze_email_events;
CREATE POLICY "Admins can manage braze_email_events"
  ON public.braze_email_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- =============================================================================
-- braze_scheduled_broadcasts — messages/scheduled_broadcasts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.braze_scheduled_broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  braze_id TEXT NOT NULL,
  name TEXT,
  broadcast_type TEXT,
  next_send_time TIMESTAMPTZ,
  schedule_type TEXT,
  tags TEXT[] DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, braze_id, next_send_time)
);

CREATE INDEX IF NOT EXISTS idx_braze_scheduled_client_next
  ON public.braze_scheduled_broadcasts (client_id, next_send_time);

ALTER TABLE public.braze_scheduled_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.braze_scheduled_broadcasts;
CREATE POLICY "Service role full access" ON public.braze_scheduled_broadcasts
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Approved users can view braze_scheduled_broadcasts" ON public.braze_scheduled_broadcasts;
CREATE POLICY "Approved users can view braze_scheduled_broadcasts"
  ON public.braze_scheduled_broadcasts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage braze_scheduled_broadcasts" ON public.braze_scheduled_broadcasts;
CREATE POLICY "Admins can manage braze_scheduled_broadcasts"
  ON public.braze_scheduled_broadcasts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- Optional: extra columns used by later migrations / analytics on braze_campaigns
ALTER TABLE public.braze_campaigns
  ADD COLUMN IF NOT EXISTS bounces INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spam_reports INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sends INT DEFAULT 0;
