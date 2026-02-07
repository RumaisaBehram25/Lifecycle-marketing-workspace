-- =====================================================
-- Normalized Braze lifecycle data + manual overrides
-- =====================================================

-- Braze Canvases (denormalized copy of each canvas)
CREATE TABLE public.braze_canvases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  braze_canvas_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  draft BOOLEAN DEFAULT false,
  enabled BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  schedule_type TEXT,
  entry_type TEXT, -- trigger, segment, api, scheduled, action_based
  trigger_event_name TEXT,
  entry_segment_name TEXT,
  tags TEXT[],
  first_entry TIMESTAMPTZ,
  last_entry TIMESTAMPTZ,
  created_in_braze TIMESTAMPTZ,
  updated_in_braze TIMESTAMPTZ,
  total_steps INT DEFAULT 0,
  raw_variants JSONB,
  raw_steps JSONB,
  conversion_events JSONB,
  entry_filters JSONB,
  exception_events TEXT[],
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, braze_canvas_id)
);

-- Enable RLS
ALTER TABLE public.braze_canvases ENABLE ROW LEVEL SECURITY;

-- Approved users can SELECT canvases for their org (admin or member with approval)
CREATE POLICY "Approved users can view braze_canvases"
  ON public.braze_canvases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

-- Only admins can INSERT/UPDATE/DELETE (run by backend sync or admin)
CREATE POLICY "Admins can manage braze_canvases"
  ON public.braze_canvases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- Trigger to keep updated_at current
CREATE TRIGGER update_braze_canvases_updated_at
  BEFORE UPDATE ON public.braze_canvases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_braze_canvases_client ON public.braze_canvases(client_id);
CREATE INDEX idx_braze_canvases_enabled ON public.braze_canvases(client_id, enabled) WHERE NOT archived;

-- =====================================================
-- Manual overrides for lifecycle journeys
-- =====================================================
CREATE TABLE public.lifecycle_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  braze_canvas_id TEXT NOT NULL,
  trigger_event_override TEXT,
  audience_override TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, braze_canvas_id)
);

ALTER TABLE public.lifecycle_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view lifecycle_overrides"
  ON public.lifecycle_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "Admins can manage lifecycle_overrides"
  ON public.lifecycle_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

CREATE TRIGGER update_lifecycle_overrides_updated_at
  BEFORE UPDATE ON public.lifecycle_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Sync run log for health dashboard
-- =====================================================
CREATE TABLE public.braze_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- running, success, failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  canvases_synced INT DEFAULT 0,
  campaigns_synced INT DEFAULT 0,
  templates_synced INT DEFAULT 0,
  segments_synced INT DEFAULT 0,
  error_message TEXT,
  cursor_next TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.braze_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view sync runs"
  ON public.braze_sync_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "Admins can manage sync runs"
  ON public.braze_sync_runs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

CREATE INDEX idx_braze_sync_runs_client ON public.braze_sync_runs(client_id);
