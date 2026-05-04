-- Remove duplicate braze_canvases rows for the same (client_id, braze_canvas_id) and
-- re-assert uniqueness. Duplicates can appear if braze_canvas_id differed only by leading/trailing
-- whitespace, or if a unique constraint was missing on a branch DB.

-- 1) Normalize stored IDs (so "uuid" and " uuid " match Braze upserts)
UPDATE public.braze_canvases
SET braze_canvas_id = trim(braze_canvas_id)
WHERE braze_canvas_id IS NOT NULL
  AND braze_canvas_id <> trim(braze_canvas_id);

-- 2) Keep the richest row per (client_id, braze_canvas_id); delete the rest
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, trim(braze_canvas_id)
      ORDER BY
        (raw_steps IS NOT NULL) DESC,
        (raw_details IS NOT NULL) DESC,
        details_synced_at DESC NULLS LAST,
        entries_last_60d DESC NULLS LAST,
        synced_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        id::text
    ) AS rn
  FROM public.braze_canvases
  WHERE client_id IS NOT NULL
    AND braze_canvas_id IS NOT NULL
    AND length(trim(braze_canvas_id)) > 0
)
DELETE FROM public.braze_canvases c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 3) Ensure a single UNIQUE on (client_id, braze_canvas_id) (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'braze_canvases'
      AND con.contype = 'u'
      AND con.conname = 'braze_canvases_client_id_braze_canvas_id_key'
  ) THEN
    ALTER TABLE public.braze_canvases
      ADD CONSTRAINT braze_canvases_client_id_braze_canvas_id_key
      UNIQUE (client_id, braze_canvas_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN unique_violation THEN
    RAISE NOTICE 'braze_canvases still has duplicates; run manual cleanup before adding UNIQUE';
END $$;

COMMENT ON CONSTRAINT braze_canvases_client_id_braze_canvas_id_key ON public.braze_canvases IS
  'One row per workspace client and Braze canvas id; required for PostgREST upsert onConflict.';
