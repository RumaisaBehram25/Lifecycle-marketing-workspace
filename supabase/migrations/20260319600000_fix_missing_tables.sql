-- Add missing columns to customerio_campaigns
ALTER TABLE customerio_campaigns
ADD COLUMN IF NOT EXISTS campaign_name text,
ADD COLUMN IF NOT EXISTS date_range text,
ADD COLUMN IF NOT EXISTS channel text,
ADD COLUMN IF NOT EXISTS total_sent integer,
ADD COLUMN IF NOT EXISTS total_delivered integer,
ADD COLUMN IF NOT EXISTS total_opens integer,
ADD COLUMN IF NOT EXISTS unique_opens integer,
ADD COLUMN IF NOT EXISTS total_clicks integer,
ADD COLUMN IF NOT EXISTS unique_clicks integer,
ADD COLUMN IF NOT EXISTS bounces integer,
ADD COLUMN IF NOT EXISTS unsubscribes integer,
ADD COLUMN IF NOT EXISTS spam_reports integer,
ADD COLUMN IF NOT EXISTS conversions integer,
ADD COLUMN IF NOT EXISTS revenue numeric,
ADD COLUMN IF NOT EXISTS delivery_rate numeric,
ADD COLUMN IF NOT EXISTS open_rate numeric,
ADD COLUMN IF NOT EXISTS unique_open_rate numeric,
ADD COLUMN IF NOT EXISTS click_rate numeric,
ADD COLUMN IF NOT EXISTS unique_click_rate numeric,
ADD COLUMN IF NOT EXISTS click_to_open_rate numeric,
ADD COLUMN IF NOT EXISTS bounce_rate numeric,
ADD COLUMN IF NOT EXISTS unsubscribe_rate numeric,
ADD COLUMN IF NOT EXISTS spam_rate numeric,
ADD COLUMN IF NOT EXISTS conversion_rate numeric;

-- Create braze_segment_analytics
CREATE TABLE IF NOT EXISTS braze_segment_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid,
  date date,
  segment_id text,
  segment_name text,
  size integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(segment_id, date)
);

-- Create braze_usage_analytics
CREATE TABLE IF NOT EXISTS braze_usage_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid,
  date date,
  sessions integer,
  dau integer,
  mau integer,
  new_users integer,
  emails_sent integer,
  emails_delivered integer,
  emails_opened integer,
  email_clicks integer,
  email_bounces integer,
  emails_reported_spam integer,
  push_sent integer,
  push_total_opens integer,
  push_direct_opens integer,
  push_bounces integer,
  in_app_sent integer,
  in_app_impressions integer,
  in_app_clicks integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, client_id)
);

-- RLS for new tables
ALTER TABLE braze_segment_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE braze_usage_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_braze_segment_analytics" ON braze_segment_analytics FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_braze_segment_analytics" ON braze_segment_analytics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_braze_segment_analytics" ON braze_segment_analytics FOR UPDATE TO authenticated USING (true);

CREATE POLICY "select_braze_usage_analytics" ON braze_usage_analytics FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_braze_usage_analytics" ON braze_usage_analytics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_braze_usage_analytics" ON braze_usage_analytics FOR UPDATE TO authenticated USING (true);