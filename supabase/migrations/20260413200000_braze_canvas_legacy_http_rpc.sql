-- RPC for lifecycle image PATCH migration: canvas rows whose raw_steps still look "legacy"
-- (http/https present, no amazonaws / .s3. / s3- substring) — matches app SQL filter.
CREATE OR REPLACE FUNCTION public.braze_canvas_ids_legacy_http_not_in_s3_text()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.braze_canvases c
  WHERE c.raw_steps IS NOT NULL
    AND c.raw_steps::text ~* '(http|https)://'
    AND c.raw_steps::text !~* 'amazonaws\.com'
    AND c.raw_steps::text !~* '\.s3\.'
    AND c.raw_steps::text !~* 's3-'
$$;

COMMENT ON FUNCTION public.braze_canvas_ids_legacy_http_not_in_s3_text() IS
  'IDs of braze_canvases rows still containing legacy http(s) URLs (no S3 markers in text). Used by patch-lifecycle-canvas-images-to-s3.ts.';

GRANT EXECUTE ON FUNCTION public.braze_canvas_ids_legacy_http_not_in_s3_text() TO service_role;
