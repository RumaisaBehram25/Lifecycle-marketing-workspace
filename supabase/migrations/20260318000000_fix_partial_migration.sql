-- Fix partially failing migration: add missing columns and create missing tables.
-- Skip user_roles backfill (do that after auth users exist).

-- 1. Add missing columns to existing tables (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'competitors'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN competitors TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- 2. Create client_platforms if missing (structure matches current schema with api_key/api_secret)
CREATE TABLE IF NOT EXISTS public.client_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform public.platform_type NOT NULL,
  api_key TEXT,
  api_secret TEXT,
  additional_config JSONB DEFAULT '{}'::jsonb,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  schema_cache JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, platform)
);

ALTER TABLE public.client_platforms ENABLE ROW LEVEL SECURITY;

-- Policies: admin-only for client_platforms (matches 20260126233524 / 20260127161213)
DROP POLICY IF EXISTS "Authenticated users can view client platforms" ON public.client_platforms;
DROP POLICY IF EXISTS "Admins can manage client platforms" ON public.client_platforms;

CREATE POLICY "Admins can manage client platforms"
  ON public.client_platforms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- View for non-admin access (excludes API keys); create if not exists
CREATE OR REPLACE VIEW public.client_platforms_public
WITH (security_invoker = on) AS
SELECT id, client_id, platform, is_connected, last_sync_at, schema_cache, created_at, updated_at
FROM public.client_platforms;

GRANT SELECT ON public.client_platforms_public TO authenticated;

DROP POLICY IF EXISTS "Approved users can view platforms" ON public.client_platforms;
CREATE POLICY "Approved users can view platforms"
  ON public.client_platforms FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_approved = true)
  );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_client_platforms_updated_at ON public.client_platforms;
CREATE TRIGGER update_client_platforms_updated_at
  BEFORE UPDATE ON public.client_platforms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. Create customerio_sync_runs if missing
CREATE TABLE IF NOT EXISTS public.customerio_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  campaigns_synced INTEGER DEFAULT 0,
  broadcasts_synced INTEGER DEFAULT 0,
  messages_synced INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customerio_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage customerio_sync_runs" ON public.customerio_sync_runs;
DROP POLICY IF EXISTS "Approved users can view customerio_sync_runs" ON public.customerio_sync_runs;

CREATE POLICY "Admins can manage customerio_sync_runs"
  ON public.customerio_sync_runs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role));

CREATE POLICY "Approved users can view customerio_sync_runs"
  ON public.customerio_sync_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true));

COMMENT ON TABLE public.client_platforms IS 'Stores platform connection details. api_key and api_secret store plaintext keys — encrypt before production use.';
