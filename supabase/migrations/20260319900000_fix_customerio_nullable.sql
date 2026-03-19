-- Make cio_campaign_id nullable since CSV doesn't have this column
ALTER TABLE customerio_campaigns
ALTER COLUMN cio_campaign_id DROP NOT NULL;