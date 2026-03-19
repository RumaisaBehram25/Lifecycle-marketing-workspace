-- client_google_drive / client_drive_files RLS incorrectly used client_id = auth.uid().
-- client_id is FK to public.clients(id), not the auth user id.

DROP POLICY IF EXISTS "client_google_drive_select" ON public.client_google_drive;
DROP POLICY IF EXISTS "client_google_drive_insert" ON public.client_google_drive;
DROP POLICY IF EXISTS "client_google_drive_update" ON public.client_google_drive;
DROP POLICY IF EXISTS "client_google_drive_delete" ON public.client_google_drive;

DROP POLICY IF EXISTS "client_drive_files_select" ON public.client_drive_files;
DROP POLICY IF EXISTS "client_drive_files_insert" ON public.client_drive_files;
DROP POLICY IF EXISTS "client_drive_files_update" ON public.client_drive_files;
DROP POLICY IF EXISTS "client_drive_files_delete" ON public.client_drive_files;

-- Approved users: read/write Drive data for any real client row (same model as shared briefs).
CREATE POLICY "client_google_drive_select" ON public.client_google_drive
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "client_google_drive_insert" ON public.client_google_drive
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
    AND client_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id)
  );

CREATE POLICY "client_google_drive_update" ON public.client_google_drive
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
    AND client_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id)
  );

CREATE POLICY "client_google_drive_delete" ON public.client_google_drive
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "client_drive_files_select" ON public.client_drive_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "client_drive_files_insert" ON public.client_drive_files
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
    AND client_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id)
  );

CREATE POLICY "client_drive_files_update" ON public.client_drive_files
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
    AND client_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id)
  );

CREATE POLICY "client_drive_files_delete" ON public.client_drive_files
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );
