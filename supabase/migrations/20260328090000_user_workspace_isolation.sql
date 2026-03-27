-- Per-user workspace: members get their own clients row + scoped RLS so Braze/CSV/Drive
-- data is not shared with the admin "doublegood" workspace.

-- =============================================================================
-- 1) Mapping: one workspace client per non-admin user
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_workspace_clients (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_workspace_clients_client ON public.user_workspace_clients (client_id);

ALTER TABLE public.user_workspace_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workspace mapping" ON public.user_workspace_clients;
CREATE POLICY "Users can view own workspace mapping"
  ON public.user_workspace_clients FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_workspace_clients IS 'Non-admin users: personal clients.id for Braze, CSV analytics, Drive. Admins use shared doublegood client.';

-- =============================================================================
-- 2) Access helper (SECURITY DEFINER — avoids RLS recursion on user_workspace_clients)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.user_can_access_client (p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_client_id IS NOT NULL
    AND (
      public.has_role (auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_workspace_clients u
        WHERE u.user_id = auth.uid()
          AND u.client_id = p_client_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_client (UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_client (UUID) TO authenticated;

-- =============================================================================
-- 3) Create personal workspace client (members only). Admins use doublegood elsewhere.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_personal_workspace_client ()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID;
  uname TEXT;
BEGIN
  IF public.has_role (auth.uid(), 'admin'::app_role) THEN
    SELECT id INTO cid FROM public.clients WHERE slug = 'doublegood' LIMIT 1;
    RETURN cid;
  END IF;

  SELECT u.client_id INTO cid FROM public.user_workspace_clients u WHERE u.user_id = auth.uid();
  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), split_part(p.email, '@', 1), 'Workspace')
  INTO uname
  FROM public.profiles p
  WHERE p.id = auth.uid();

  INSERT INTO public.clients (name, slug, is_active)
  VALUES (
    COALESCE(uname, 'My workspace'),
    'workspace-' || auth.uid()::text,
    true
  )
  RETURNING id INTO cid;

  INSERT INTO public.user_workspace_clients (user_id, client_id)
  VALUES (auth.uid(), cid);

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_workspace_client () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_personal_workspace_client () TO authenticated;

-- =============================================================================
-- 4) clients: members only see their workspace row; admins see all
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
CREATE POLICY "Authenticated users can view clients"
  ON public.clients FOR SELECT TO authenticated
  USING (
    public.has_role (auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_workspace_clients u
      WHERE u.user_id = auth.uid() AND u.client_id = clients.id
    )
  );

DROP POLICY IF EXISTS "Approved users can update own workspace client" ON public.clients;
CREATE POLICY "Approved users can update own workspace client"
  ON public.clients FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (id)
  );

-- =============================================================================
-- 5) client_platforms: SELECT + approved-user write policies scoped to client
-- =============================================================================
DROP POLICY IF EXISTS "Approved users can view platforms" ON public.client_platforms;
CREATE POLICY "Approved users can view platforms"
  ON public.client_platforms FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can insert client_platforms" ON public.client_platforms;
CREATE POLICY "Approved users can insert client_platforms"
  ON public.client_platforms FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND client_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can update client_platforms" ON public.client_platforms;
CREATE POLICY "Approved users can update client_platforms"
  ON public.client_platforms FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND client_id IS NOT NULL
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can delete client_platforms" ON public.client_platforms;
CREATE POLICY "Approved users can delete client_platforms"
  ON public.client_platforms FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

-- =============================================================================
-- 6) client_google_drive + client_drive_files
-- =============================================================================
DROP POLICY IF EXISTS "client_google_drive_select" ON public.client_google_drive;
CREATE POLICY "client_google_drive_select" ON public.client_google_drive FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "client_google_drive_insert" ON public.client_google_drive;
CREATE POLICY "client_google_drive_insert" ON public.client_google_drive FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND client_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "client_google_drive_update" ON public.client_google_drive;
CREATE POLICY "client_google_drive_update" ON public.client_google_drive FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND client_id IS NOT NULL
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "client_google_drive_delete" ON public.client_google_drive;
CREATE POLICY "client_google_drive_delete" ON public.client_google_drive FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "client_drive_files_select" ON public.client_drive_files;
CREATE POLICY "client_drive_files_select" ON public.client_drive_files FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "client_drive_files_insert" ON public.client_drive_files;
CREATE POLICY "client_drive_files_insert" ON public.client_drive_files FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND client_id IS NOT NULL
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "client_drive_files_update" ON public.client_drive_files;
CREATE POLICY "client_drive_files_update" ON public.client_drive_files FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND client_id IS NOT NULL
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "client_drive_files_delete" ON public.client_drive_files;
CREATE POLICY "client_drive_files_delete" ON public.client_drive_files FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

-- =============================================================================
-- 7) Braze + analytics tables (SELECT): approved + user_can_access_client(client_id)
-- =============================================================================
DROP POLICY IF EXISTS "Approved users can view braze_kpi_series" ON public.braze_kpi_series;
CREATE POLICY "Approved users can view braze_kpi_series" ON public.braze_kpi_series FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view braze_segments_sync" ON public.braze_segments_sync;
CREATE POLICY "Approved users can view braze_segments_sync" ON public.braze_segments_sync FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view braze_email_events" ON public.braze_email_events;
CREATE POLICY "Approved users can view braze_email_events" ON public.braze_email_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view braze_scheduled_broadcasts" ON public.braze_scheduled_broadcasts;
CREATE POLICY "Approved users can view braze_scheduled_broadcasts" ON public.braze_scheduled_broadcasts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view braze_campaigns" ON public.braze_campaigns;
CREATE POLICY "Approved users can view braze_campaigns" ON public.braze_campaigns FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view braze_canvases" ON public.braze_canvases;
CREATE POLICY "Approved users can view braze_canvases" ON public.braze_canvases FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view braze_campaign_analytics" ON public.braze_campaign_analytics;
CREATE POLICY "Approved users can view braze_campaign_analytics" ON public.braze_campaign_analytics FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view lifecycle_overrides" ON public.lifecycle_overrides;
CREATE POLICY "Approved users can view lifecycle_overrides" ON public.lifecycle_overrides FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view sync runs" ON public.braze_sync_runs;
CREATE POLICY "Approved users can view sync runs" ON public.braze_sync_runs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

-- segment / usage analytics (policy names from 20260319600000_fix_missing_tables.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'braze_segment_analytics') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "select_braze_segment_analytics" ON public.braze_segment_analytics;
      DROP POLICY IF EXISTS "Approved users can view braze_segment_analytics" ON public.braze_segment_analytics;
      CREATE POLICY "select_braze_segment_analytics" ON public.braze_segment_analytics FOR SELECT TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        );
    $p$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'braze_usage_analytics') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "select_braze_usage_analytics" ON public.braze_usage_analytics;
      DROP POLICY IF EXISTS "Approved users can view braze_usage_analytics" ON public.braze_usage_analytics;
      CREATE POLICY "select_braze_usage_analytics" ON public.braze_usage_analytics FOR SELECT TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        );
    $p$;
  END IF;
END $$;

-- Customer.io: drop both legacy policy names, then single scoped SELECT
DROP POLICY IF EXISTS "Approved users can view customerio_campaigns" ON public.customerio_campaigns;
DROP POLICY IF EXISTS "customerio_campaigns_select" ON public.customerio_campaigns;
CREATE POLICY "Approved users can view customerio_campaigns" ON public.customerio_campaigns FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view customerio_broadcasts" ON public.customerio_broadcasts;
DROP POLICY IF EXISTS "customerio_broadcasts_select" ON public.customerio_broadcasts;
CREATE POLICY "Approved users can view customerio_broadcasts" ON public.customerio_broadcasts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view customerio_messages" ON public.customerio_messages;
DROP POLICY IF EXISTS "customerio_messages_select" ON public.customerio_messages;
CREATE POLICY "Approved users can view customerio_messages" ON public.customerio_messages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DROP POLICY IF EXISTS "Approved users can view customerio_sync_runs" ON public.customerio_sync_runs;
DROP POLICY IF EXISTS "customerio_sync_runs_select" ON public.customerio_sync_runs;
CREATE POLICY "Approved users can view customerio_sync_runs" ON public.customerio_sync_runs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

-- =============================================================================
-- 8) CSV insert / upsert: restrict to own workspace client
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert braze_campaign_analytics" ON public.braze_campaign_analytics;
CREATE POLICY "Authenticated users can insert braze_campaign_analytics" ON public.braze_campaign_analytics FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'braze_segment_analytics') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "insert_braze_segment_analytics" ON public.braze_segment_analytics;
      CREATE POLICY "insert_braze_segment_analytics" ON public.braze_segment_analytics FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        );
    $p$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'braze_usage_analytics') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "insert_braze_usage_analytics" ON public.braze_usage_analytics;
      CREATE POLICY "insert_braze_usage_analytics" ON public.braze_usage_analytics FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        );
    $p$;
  END IF;
END $$;

DROP POLICY IF EXISTS "customerio_campaigns_insert" ON public.customerio_campaigns;
DROP POLICY IF EXISTS "customerio_campaigns_update" ON public.customerio_campaigns;

CREATE POLICY "customerio_campaigns_insert" ON public.customerio_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );
CREATE POLICY "customerio_campaigns_update" ON public.customerio_campaigns FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

-- Members need UPDATE for CSV upserts on braze_campaign_analytics
DROP POLICY IF EXISTS "Approved users can update own braze_campaign_analytics" ON public.braze_campaign_analytics;
CREATE POLICY "Approved users can update own braze_campaign_analytics" ON public.braze_campaign_analytics FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
    AND public.user_can_access_client (client_id)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'braze_segment_analytics') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "update_braze_segment_analytics" ON public.braze_segment_analytics;
      DROP POLICY IF EXISTS "Approved users can update own braze_segment_analytics" ON public.braze_segment_analytics;
      CREATE POLICY "update_braze_segment_analytics" ON public.braze_segment_analytics FOR UPDATE TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        );
    $p$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'braze_usage_analytics') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "update_braze_usage_analytics" ON public.braze_usage_analytics;
      DROP POLICY IF EXISTS "Approved users can update own braze_usage_analytics" ON public.braze_usage_analytics;
      CREATE POLICY "update_braze_usage_analytics" ON public.braze_usage_analytics FOR UPDATE TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
          AND public.user_can_access_client (client_id)
        );
    $p$;
  END IF;
END $$;
