-- Canvases with no step payload (empty JSON object or NULL). Run in Supabase SQL Editor.
-- Use after deploying sync-braze Phase 1 fix to audit what still needs Phase 3 detail.

-- Detail: all affected rows
SELECT
  client_id,
  braze_canvas_id,
  name,
  draft,
  enabled,
  total_steps,
  synced_at
FROM public.braze_canvases
WHERE (raw_steps = '{}'::jsonb OR raw_steps IS NULL)
  AND archived = false
ORDER BY client_id, synced_at DESC NULLS LAST;

-- Scale: row counts per client
SELECT
  client_id,
  COUNT(*) AS affected_rows
FROM public.braze_canvases
WHERE (raw_steps = '{}'::jsonb OR raw_steps IS NULL)
  AND archived = false
GROUP BY client_id
ORDER BY affected_rows DESC, client_id;
