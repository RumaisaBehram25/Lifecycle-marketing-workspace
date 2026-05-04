-- Saved AI reports posted from Analytics → Dashboard

CREATE TABLE IF NOT EXISTS public.dashboard_ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  report_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_dashboard_ai_reports_client_created
  ON public.dashboard_ai_reports (client_id, created_at DESC);

ALTER TABLE public.dashboard_ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dashboard_ai_reports for accessible clients"
  ON public.dashboard_ai_reports
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_client(client_id));

CREATE POLICY "Approved users can insert dashboard_ai_reports for accessible clients"
  ON public.dashboard_ai_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_client(client_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

COMMENT ON TABLE public.dashboard_ai_reports IS
  'AI-generated markdown reports posted from Analytics to the main Dashboard.';
