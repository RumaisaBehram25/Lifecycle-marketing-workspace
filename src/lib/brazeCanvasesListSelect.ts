/**
 * Avoid `select('*')` on many `braze_canvases` rows: `raw_steps` / `raw_variants` can be huge and
 * cause PostgREST/worker failures (HTTP 500). List + analytics use this; load full rows per canvas when needed.
 */
export const BRAZE_CANVASES_LIST_SELECT =
  'id,client_id,braze_canvas_id,name,description,archived,draft,enabled,schedule_type,' +
  'first_entry,last_entry,created_at,updated_at,synced_at,created_in_braze,updated_in_braze,last_activity_at,' +
  'entry_type,entry_segment_name,trigger_event_name,exception_events,conversion_events,entry_filters,tags,' +
  'total_steps,entries_last_30d,entries_last_60d,sends_last_30d,revenue_last_30d,conversions_last_30d,opens_last_30d,clicks_last_30d';
