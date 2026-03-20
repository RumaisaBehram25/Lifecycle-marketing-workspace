-- Exact analytics aggregates + samples for CRM Copilot (ops-chat).
-- SECURITY DEFINER reads all rows for the client in one query (same math as the Analytics tab sums).
-- Callable only by service_role from Edge Functions.

-- Align with app schema (some projects pre-date this column).
ALTER TABLE public.braze_campaign_analytics
  ADD COLUMN IF NOT EXISTS sends_last_30d INT DEFAULT 0;

CREATE OR REPLACE FUNCTION public.analytics_bundle_for_copilot(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'client_id', p_client_id,
    'source', 'analytics_bundle_for_copilot',
    'braze_campaign_totals', (
      SELECT jsonb_build_object(
        'row_count', count(*)::bigint,
        'total_sent', coalesce(sum(coalesce(sent, sends_last_30d, 0)), 0)::bigint,
        'total_delivered', coalesce(sum(coalesce(delivered, 0)), 0)::bigint,
        'total_opens', coalesce(sum(coalesce(opens, 0)), 0)::bigint,
        'total_clicks', coalesce(sum(coalesce(clicks, 0)), 0)::bigint,
        'total_conversions', coalesce(sum(coalesce(conversions, 0)), 0)::bigint,
        'total_revenue', coalesce(sum(coalesce(revenue, 0)), 0)::numeric
      )
      FROM braze_campaign_analytics
      WHERE client_id = p_client_id
    ),
    'braze_recent', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT campaign_name, date, channel, sent, sends_last_30d, delivered, opens, clicks, conversions, revenue, variation_api_id
        FROM braze_campaign_analytics
        WHERE client_id = p_client_id
        ORDER BY date DESC NULLS LAST, campaign_name ASC NULLS LAST
        LIMIT 80
      ) t
    ), '[]'::jsonb),
    'braze_usage', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT date, sessions, dau, mau, new_users,
               emails_sent, emails_delivered, emails_opened, email_clicks, email_bounces,
               push_sent, in_app_sent
        FROM braze_usage_analytics
        WHERE client_id = p_client_id
        ORDER BY date DESC NULLS LAST
        LIMIT 40
      ) t
    ), '[]'::jsonb),
    'braze_segments', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT date, segment_id, segment_name, size
        FROM braze_segment_analytics
        WHERE client_id = p_client_id
        ORDER BY date DESC NULLS LAST
        LIMIT 100
      ) t
    ), '[]'::jsonb),
    'customerio_campaigns', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT *
        FROM customerio_campaigns
        WHERE client_id = p_client_id
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 60
      ) t
    ), '[]'::jsonb),
    'customerio_broadcasts', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT id, name, state, sent_at, scheduled_for, send_to, metrics, synced_at
        FROM customerio_broadcasts
        WHERE client_id = p_client_id
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 40
      ) t
    ), '[]'::jsonb),
    'braze_canvases', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT name, enabled, archived, draft, schedule_type, sends_last_30d, entries_last_30d,
               entries_last_60d, last_activity_at, entry_segment_name, trigger_event_name, synced_at
        FROM braze_canvases
        WHERE client_id = p_client_id
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 50
      ) t
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.analytics_bundle_for_copilot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_bundle_for_copilot(uuid) TO service_role;

COMMENT ON FUNCTION public.analytics_bundle_for_copilot(uuid) IS
  'Returns analytics JSON for CRM Copilot; same aggregates as Analytics tab (full-table sums). Edge Functions only.';
