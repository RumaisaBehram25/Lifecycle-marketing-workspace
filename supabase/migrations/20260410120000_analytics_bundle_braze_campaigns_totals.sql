-- Align CRM Copilot campaign directory counts with Campaigns tab:
-- braze_campaigns sample is LIMIT 50 → models inferred "50 campaigns" while UI shows full count (e.g. 160).
-- Add braze_campaigns_totals (full row_count + email_row_count using same channel rules as UI normalizeCampaignChannel).

CREATE OR REPLACE FUNCTION public.analytics_bundle_for_copilot(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'client_id', p_client_id,
    'source', 'analytics_bundle_for_copilot_v4',
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
    'braze_canvases_totals', (
      SELECT jsonb_build_object(
        'canvas_row_count', count(*)::bigint,
        'sum_entries_last_60d', coalesce(sum(coalesce(entries_last_60d, 0)), 0)::bigint,
        'sum_entries_last_30d', coalesce(sum(coalesce(entries_last_30d, 0)), 0)::bigint,
        'sum_sends_last_30d', coalesce(sum(coalesce(sends_last_30d, 0)), 0)::bigint
      )
      FROM braze_canvases
      WHERE client_id = p_client_id
    ),
    'braze_canvases', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT name, enabled, archived, draft, schedule_type, sends_last_30d, entries_last_30d,
               entries_last_60d, last_activity_at, entry_segment_name, trigger_event_name, synced_at, updated_at
        FROM braze_canvases
        WHERE client_id = p_client_id
        ORDER BY coalesce(entries_last_60d, 0) DESC, updated_at DESC NULLS LAST
        LIMIT 50
      ) t
    ), '[]'::jsonb),
    'braze_kpi_series', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT metric, series_date, value
        FROM braze_kpi_series
        WHERE client_id = p_client_id
        ORDER BY series_date DESC NULLS LAST, metric ASC
        LIMIT 200
      ) t
    ), '[]'::jsonb),
    'braze_kpi_summary', (
      SELECT jsonb_build_object(
        'kpi_row_count', (SELECT count(*)::bigint FROM braze_kpi_series WHERE client_id = p_client_id),
        'latest_dau', (
          SELECT value FROM braze_kpi_series
          WHERE client_id = p_client_id AND metric = 'dau'
          ORDER BY series_date DESC NULLS LAST LIMIT 1
        ),
        'latest_mau', (
          SELECT value FROM braze_kpi_series
          WHERE client_id = p_client_id AND metric = 'mau'
          ORDER BY series_date DESC NULLS LAST LIMIT 1
        ),
        'new_users_sum_30d', coalesce((
          SELECT sum(value) FROM braze_kpi_series
          WHERE client_id = p_client_id AND metric = 'new_users'
            AND series_date >= (CURRENT_DATE - INTERVAL '30 days')
        ), 0)
      )
    ),
    'braze_campaigns_totals', (
      SELECT jsonb_build_object(
        'row_count', count(*)::bigint,
        'email_row_count', coalesce(sum(
          CASE
            WHEN trim(coalesce(bc.channel, '')) = '' THEN 1
            WHEN lower(trim(bc.channel)) LIKE '%email%' THEN 1
            WHEN lower(trim(bc.channel)) = 'sms' OR lower(trim(bc.channel)) LIKE '%sms%' THEN 0
            WHEN lower(trim(bc.channel)) LIKE '%in_app%'
              OR lower(trim(bc.channel)) LIKE '%in-app%'
              OR lower(trim(bc.channel)) IN ('content_card', 'inapp') THEN 0
            WHEN lower(trim(bc.channel)) LIKE '%push%'
              OR lower(trim(bc.channel)) LIKE '%android%'
              OR lower(trim(bc.channel)) LIKE '%ios%'
              OR lower(trim(bc.channel)) LIKE '%web_push%' THEN 0
            ELSE 1
          END
        ), 0)::bigint
      )
      FROM braze_campaigns bc
      WHERE bc.client_id = p_client_id
    ),
    'braze_campaigns', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT name, channel, status, sent_date, opens, clicks, deliveries, open_rate, click_rate, unsubs, segment
        FROM braze_campaigns
        WHERE client_id = p_client_id
        ORDER BY sent_date DESC NULLS LAST, updated_at DESC NULLS LAST
        LIMIT 50
      ) t
    ), '[]'::jsonb),
    'braze_segments_sync_count', (SELECT count(*)::bigint FROM braze_segments_sync WHERE client_id = p_client_id),
    'braze_segments_sync', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT name, braze_segment_id, synced_at
        FROM braze_segments_sync
        WHERE client_id = p_client_id
        ORDER BY synced_at DESC NULLS LAST
        LIMIT 40
      ) t
    ), '[]'::jsonb),
    'braze_scheduled_broadcasts', coalesce((
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT name, next_send_time, broadcast_type, schedule_type
        FROM braze_scheduled_broadcasts
        WHERE client_id = p_client_id
        ORDER BY next_send_time ASC NULLS LAST
        LIMIT 30
      ) t
    ), '[]'::jsonb),
    'braze_email_events_30d', jsonb_build_object(
      'hard_bounces', (
        SELECT count(*)::bigint FROM braze_email_events
        WHERE client_id = p_client_id AND event_type = 'hard_bounce'
          AND occurred_at >= (now() - interval '30 days')
      ),
      'unsubscribes', (
        SELECT count(*)::bigint FROM braze_email_events
        WHERE client_id = p_client_id AND event_type = 'unsubscribe'
          AND occurred_at >= (now() - interval '30 days')
      )
    )
  );
$$;

COMMENT ON FUNCTION public.analytics_bundle_for_copilot(uuid) IS
  'Analytics JSON for CRM Copilot v4: adds braze_campaigns_totals (directory counts); canvas totals v3. Service role only.';
