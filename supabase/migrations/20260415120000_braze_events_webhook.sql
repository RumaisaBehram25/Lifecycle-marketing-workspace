-- Inbound Braze webhook events (Edge Function `braze-webhook`). Service role inserts; RLS for dashboard reads.

CREATE TABLE IF NOT EXISTS public.braze_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id TEXT,
  event_name TEXT,
  occurred_at TIMESTAMPTZ,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_braze_events_created_at ON public.braze_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_braze_events_client_created ON public.braze_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_braze_events_event_name ON public.braze_events (event_name);

ALTER TABLE public.braze_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view braze_events" ON public.braze_events;
CREATE POLICY "Approved users can view braze_events"
  ON public.braze_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage braze_events" ON public.braze_events;
CREATE POLICY "Admins can manage braze_events"
  ON public.braze_events FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

COMMENT ON TABLE public.braze_events IS 'Real-time Braze webhook payloads ingested by Edge Function braze-webhook.';
