-- Persist Resource Center "Copy Rules" (channel character limits) for CRM Copilot / unified context.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS copy_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clients.copy_rules IS
  'Channel copy rules (JSON array) edited on Resource Center Rules tab; loaded by ops-chat unified context.';
