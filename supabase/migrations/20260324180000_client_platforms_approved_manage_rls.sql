-- Allow approved (non-admin) users to connect/disconnect marketing platforms.
-- Previously only admins could INSERT/UPDATE/DELETE client_platforms, which broke
-- Platforms + onboarding Braze flows for members ("row-level security policy").
-- Model matches client_google_drive: approved users may manage rows for real clients.

CREATE POLICY "Approved users can insert client_platforms"
  ON public.client_platforms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
    AND client_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id)
  );

CREATE POLICY "Approved users can update client_platforms"
  ON public.client_platforms
  FOR UPDATE
  TO authenticated
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

CREATE POLICY "Approved users can delete client_platforms"
  ON public.client_platforms
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_approved = true
    )
  );

COMMENT ON POLICY "Approved users can insert client_platforms" ON public.client_platforms IS
  'Members can save API keys for platform sync; keys remain on base table (use client_platforms_public for reads without secrets).';
