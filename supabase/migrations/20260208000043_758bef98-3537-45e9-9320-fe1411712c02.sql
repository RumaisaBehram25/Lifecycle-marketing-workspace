-- Add activity tracking columns to braze_canvases
ALTER TABLE public.braze_canvases
ADD COLUMN IF NOT EXISTS entries_last_30d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS entries_last_60d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS sends_last_30d INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Create index for efficient activity-based queries
CREATE INDEX IF NOT EXISTS idx_braze_canvases_activity 
ON public.braze_canvases (client_id, enabled, entries_last_60d DESC NULLS LAST);