-- Enrich custom events with GET /events payload and time-series from GET /events/data_series

ALTER TABLE public.braze_custom_events
  ADD COLUMN IF NOT EXISTS events_get_json JSONB;

COMMENT ON COLUMN public.braze_custom_events.events_get_json IS 'Latest payload from Braze GET /events (events.get) merged by event name.';

CREATE TABLE IF NOT EXISTS public.braze_custom_event_series (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'day',
  bucket_at TIMESTAMPTZ NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  series_ending_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, event_name, unit, bucket_at)
);

CREATE INDEX IF NOT EXISTS idx_braze_custom_event_series_client_event
  ON public.braze_custom_event_series (client_id, event_name);

CREATE INDEX IF NOT EXISTS idx_braze_custom_event_series_synced
  ON public.braze_custom_event_series (client_id, synced_at DESC);

ALTER TABLE public.braze_custom_event_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view braze_custom_event_series" ON public.braze_custom_event_series;
CREATE POLICY "Approved users can view braze_custom_event_series"
  ON public.braze_custom_event_series FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage braze_custom_event_series" ON public.braze_custom_event_series;
CREATE POLICY "Admins can manage braze_custom_event_series"
  ON public.braze_custom_event_series FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

COMMENT ON TABLE public.braze_custom_event_series IS 'Occurrence counts from Braze GET /events/data_series (events.data_series permission).';
