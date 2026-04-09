-- Touchpoints sync: persist trigger/audience/schedule from canvas/details alongside raw_steps.

DROP FUNCTION IF EXISTS public.upsert_braze_canvas_touchpoints(uuid, text, text, integer, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_braze_canvas_touchpoints(
  p_client_id uuid,
  p_braze_canvas_id text,
  p_name text,
  p_total_steps integer,
  p_raw_steps jsonb,
  p_trigger_event_name text DEFAULT NULL,
  p_entry_segment_name text DEFAULT NULL,
  p_entry_type text DEFAULT NULL,
  p_schedule_type text DEFAULT NULL
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
    trigger_event_name,
    entry_segment_name,
    entry_type,
    schedule_type,
    synced_at
  )
  VALUES (
    p_client_id,
    p_braze_canvas_id,
    COALESCE(NULLIF(trim(p_name), ''), p_braze_canvas_id),
    p_total_steps,
    p_raw_steps,
    p_trigger_event_name,
    p_entry_segment_name,
    p_entry_type,
    p_schedule_type,
    now()
  )
  ON CONFLICT (client_id, braze_canvas_id)
  DO UPDATE SET
    total_steps = EXCLUDED.total_steps,
    raw_steps = EXCLUDED.raw_steps,
    trigger_event_name = COALESCE(EXCLUDED.trigger_event_name, braze_canvases.trigger_event_name),
    entry_segment_name = COALESCE(EXCLUDED.entry_segment_name, braze_canvases.entry_segment_name),
    entry_type = COALESCE(EXCLUDED.entry_type, braze_canvases.entry_type),
    schedule_type = COALESCE(EXCLUDED.schedule_type, braze_canvases.schedule_type);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_braze_canvas_touchpoints(uuid, text, text, integer, jsonb, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_braze_canvas_touchpoints(uuid, text, text, integer, jsonb, text, text, text, text) TO service_role;
