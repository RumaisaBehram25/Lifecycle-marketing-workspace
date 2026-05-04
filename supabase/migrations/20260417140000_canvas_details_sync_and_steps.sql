-- Canvas /canvas/details enrichment tracking + full details blob + normalized steps per canvas

ALTER TABLE public.braze_canvases
  ADD COLUMN IF NOT EXISTS details_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_details JSONB;

COMMENT ON COLUMN public.braze_canvases.details_synced_at IS 'When GET canvas/details was last successfully applied for this row (resume batches skip fresh rows).';
COMMENT ON COLUMN public.braze_canvases.raw_details IS 'Last full JSON response from Braze canvas/details for debugging and re-parsing.';

CREATE TABLE IF NOT EXISTS public.braze_canvas_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  braze_canvas_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  step_name TEXT,
  step_type TEXT,
  messages JSONB,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT braze_canvas_steps_unique_step UNIQUE (client_id, braze_canvas_id, step_id),
  CONSTRAINT braze_canvas_steps_canvas_fk FOREIGN KEY (client_id, braze_canvas_id)
    REFERENCES public.braze_canvases(client_id, braze_canvas_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_braze_canvas_steps_client_canvas
  ON public.braze_canvas_steps(client_id, braze_canvas_id);

CREATE TRIGGER update_braze_canvas_steps_updated_at
  BEFORE UPDATE ON public.braze_canvas_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.braze_canvas_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view braze_canvas_steps"
  ON public.braze_canvas_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "Admins can manage braze_canvas_steps"
  ON public.braze_canvas_steps FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );
