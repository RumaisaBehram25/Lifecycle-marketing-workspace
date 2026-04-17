-- Workspace Google Drive API key (admin-managed). Sync runs via Edge Function (service role).
CREATE TABLE IF NOT EXISTS public.client_google_drive_settings (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  google_drive_api_key text NOT NULL DEFAULT '',
  api_key_hint text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.client_google_drive_settings IS 'Stores Google Drive API key per workspace; writes via Edge only. Admins may SELECT masked hint only (avoid selecting google_drive_api_key in the app).';

ALTER TABLE public.client_google_drive_settings ENABLE ROW LEVEL SECURITY;

-- Admins: read metadata and masked hint (client must never SELECT google_drive_api_key in queries).
CREATE POLICY "client_google_drive_settings_admin_select"
  ON public.client_google_drive_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE for authenticated — Edge Function uses service role.
