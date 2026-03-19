-- Fix braze_canvases
ALTER TABLE braze_canvases
ALTER COLUMN braze_canvas_id DROP NOT NULL,
ALTER COLUMN name DROP NOT NULL,
ALTER COLUMN synced_at DROP NOT NULL,
ALTER COLUMN updated_at DROP NOT NULL,
ALTER COLUMN client_id DROP NOT NULL;

-- Fix braze_campaign_analytics
ALTER TABLE braze_campaign_analytics
ALTER COLUMN campaign_id DROP NOT NULL,
ALTER COLUMN variation_api_id DROP NOT NULL,
ALTER COLUMN client_id DROP NOT NULL,
ALTER COLUMN date DROP NOT NULL;

-- Fix customerio_campaigns
ALTER TABLE customerio_campaigns
ALTER COLUMN name DROP NOT NULL,
ALTER COLUMN client_id DROP NOT NULL,
ALTER COLUMN synced_at DROP NOT NULL,
ALTER COLUMN updated_at DROP NOT NULL;

-- Fix customerio_broadcasts
ALTER TABLE customerio_broadcasts
ALTER COLUMN cio_broadcast_id DROP NOT NULL,
ALTER COLUMN name DROP NOT NULL,
ALTER COLUMN client_id DROP NOT NULL,
ALTER COLUMN synced_at DROP NOT NULL,
ALTER COLUMN updated_at DROP NOT NULL;

-- Fix customerio_messages
ALTER TABLE customerio_messages
ALTER COLUMN cio_message_id DROP NOT NULL,
ALTER COLUMN name DROP NOT NULL,
ALTER COLUMN client_id DROP NOT NULL,
ALTER COLUMN synced_at DROP NOT NULL,
ALTER COLUMN updated_at DROP NOT NULL,
ALTER COLUMN type DROP NOT NULL;