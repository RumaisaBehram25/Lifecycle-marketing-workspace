-- Braze custom events directory synced from /events/list endpoint
-- Stores event names, descriptions, properties, and metadata for campaign/canvas logic

CREATE TABLE IF NOT EXISTS public.braze_custom_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  braze_event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_description TEXT,
  event_type TEXT,
  category TEXT,
  platform TEXT,
  properties JSONB,
  properties_count INT DEFAULT 0,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(client_id, braze_event_id)
);

CREATE INDEX IF NOT EXISTS idx_braze_custom_events_client ON public.braze_custom_events (client_id);
CREATE INDEX IF NOT EXISTS idx_braze_custom_events_client_name ON public.braze_custom_events (client_id, event_name);
CREATE INDEX IF NOT EXISTS idx_braze_custom_events_synced ON public.braze_custom_events (client_id, synced_at DESC);

ALTER TABLE public.braze_custom_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view braze_custom_events" ON public.braze_custom_events;
CREATE POLICY "Approved users can view braze_custom_events"
  ON public.braze_custom_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage braze_custom_events" ON public.braze_custom_events;
CREATE POLICY "Admins can manage braze_custom_events"
  ON public.braze_custom_events FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

COMMENT ON TABLE public.braze_custom_events IS 'Braze custom events directory synced from /events/list endpoint by sync-braze function. Used for campaign/canvas custom event targeting.';
