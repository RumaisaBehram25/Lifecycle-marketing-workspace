-- Add rich brand profile columns to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS tagline text,
ADD COLUMN IF NOT EXISTS primary_color text,
ADD COLUMN IF NOT EXISTS secondary_color text,
ADD COLUMN IF NOT EXISTS value_propositions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS copy_examples jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS target_audience jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS key_messaging_pillars jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS differentiators jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS industry text,
ADD COLUMN IF NOT EXISTS competitors jsonb DEFAULT '[]'::jsonb;