-- Rename misleading "encrypted" columns to reflect their actual plaintext storage.
-- These columns store raw API keys with no encryption applied.
ALTER TABLE public.client_platforms
  RENAME COLUMN api_key_encrypted TO api_key;
ALTER TABLE public.client_platforms
  RENAME COLUMN api_secret_encrypted TO api_secret;

-- Update the public view comment to reflect new column names
COMMENT ON TABLE public.client_platforms IS 'Stores platform connection details. api_key and api_secret store plaintext keys — encrypt before production use.';
