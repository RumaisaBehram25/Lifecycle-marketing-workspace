-- Reduce database bloat from Braze sync (email event fan-out, sync run history).
-- Run manually in SQL Editor when needed, e.g.:
--   SELECT * FROM public.prune_braze_junk_storage(90, 45, 0);
-- p_kpi_series_days_keep: delete KPI rows whose series_date is older than N calendar days (0 = do not touch KPI).

CREATE OR REPLACE FUNCTION public.prune_braze_junk_storage(
  p_email_event_days integer DEFAULT 90,
  p_sync_run_days integer DEFAULT 45,
  p_kpi_series_days_keep integer DEFAULT 0
)
RETURNS TABLE(deleted_email bigint, deleted_sync_runs bigint, deleted_kpi bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_email bigint := 0;
  n_runs bigint := 0;
  n_kpi bigint := 0;
BEGIN
  IF p_email_event_days IS NOT NULL AND p_email_event_days > 0 THEN
    DELETE FROM public.braze_email_events
    WHERE occurred_at < (now() - make_interval(days => p_email_event_days));
    GET DIAGNOSTICS n_email = ROW_COUNT;
  END IF;

  IF p_sync_run_days IS NOT NULL AND p_sync_run_days > 0 THEN
    DELETE FROM public.braze_sync_runs
    WHERE started_at < (now() - make_interval(days => p_sync_run_days));
    GET DIAGNOSTICS n_runs = ROW_COUNT;
  END IF;

  IF p_kpi_series_days_keep IS NOT NULL AND p_kpi_series_days_keep > 0 THEN
    DELETE FROM public.braze_kpi_series
    WHERE series_date < (CURRENT_DATE - make_interval(days => p_kpi_series_days_keep));
    GET DIAGNOSTICS n_kpi = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT n_email, n_runs, n_kpi;
END;
$$;

COMMENT ON FUNCTION public.prune_braze_junk_storage(integer, integer, integer) IS
  'Project-wide cleanup: old braze_email_events, braze_sync_runs, optional braze_kpi_series. KPI arg 0 skips KPI.';

REVOKE ALL ON FUNCTION public.prune_braze_junk_storage(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_braze_junk_storage(integer, integer, integer) TO service_role;
