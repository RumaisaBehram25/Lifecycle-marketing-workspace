-- Incremental Braze touchpoints sync: resume cursor + safe upsert (only total_steps / raw_steps on conflict)

CREATE TABLE IF NOT EXISTS public.client_sync_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.client_platforms (id) ON DELETE CASCADE,
  sync_kind text NOT NULL DEFAULT 'braze_touchpoints',
  last_offset integer NOT NULL DEFAULT 0,
  total_canvases integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_sync_progress_unique_platform_kind UNIQUE (client_id, platform_id, sync_kind)
);

CREATE INDEX IF NOT EXISTS idx_client_sync_progress_client_platform
  ON public.client_sync_progress (client_id, platform_id);

COMMENT ON TABLE public.client_sync_progress IS 'Resume cursors for long-running syncs (e.g. Braze touchpoints_only chunks).';

ALTER TABLE public.client_sync_progress ENABLE ROW LEVEL SECURITY;
-- Edge Functions use the service role key, which bypasses RLS. No policies for anon/authenticated.

-- INSERT new canvas row with name; ON CONFLICT only updates total_steps + raw_steps (preserves other columns).
CREATE OR REPLACE FUNCTION public.upsert_braze_canvas_touchpoints(
  p_client_id uuid,
  p_braze_canvas_id text,
  p_name text,
  p_total_steps integer,
  p_raw_steps jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.braze_canvases (
    client_id,
    braze_canvas_id,
    name,
    total_steps,
    raw_steps,
    synced_at
  )
  VALUES (
    p_client_id,
    p_braze_canvas_id,
    COALESCE(NULLIF(trim(p_name), ''), p_braze_canvas_id),
    p_total_steps,
    p_raw_steps,
    now()
  )
  ON CONFLICT (client_id, braze_canvas_id)
  DO UPDATE SET
    total_steps = EXCLUDED.total_steps,
    raw_steps = EXCLUDED.raw_steps;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_braze_canvas_touchpoints(uuid, text, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_braze_canvas_touchpoints(uuid, text, text, integer, jsonb) TO service_role;
