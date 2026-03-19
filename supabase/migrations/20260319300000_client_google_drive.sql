-- Store Google Drive connections per client
CREATE TABLE IF NOT EXISTS client_google_drive (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  folder_id text NOT NULL,
  folder_name text,
  folder_url text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  status text DEFAULT 'connected',
  created_at timestamptz DEFAULT now()
);

-- Store individual files/videos fetched from Google Drive
CREATE TABLE IF NOT EXISTS client_drive_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  drive_connection_id uuid REFERENCES client_google_drive(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  file_name text,
  file_type text,
  mime_type text,
  thumbnail_url text,
  web_view_link text,
  download_url text,
  created_time timestamptz,
  modified_time timestamptz,
  size bigint,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, file_id)
);

-- RLS
ALTER TABLE client_google_drive ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_drive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_google_drive_select" ON client_google_drive FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "client_google_drive_insert" ON client_google_drive FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "client_google_drive_update" ON client_google_drive FOR UPDATE TO authenticated USING (client_id = auth.uid());
CREATE POLICY "client_google_drive_delete" ON client_google_drive FOR DELETE TO authenticated USING (client_id = auth.uid());

CREATE POLICY "client_drive_files_select" ON client_drive_files FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "client_drive_files_insert" ON client_drive_files FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "client_drive_files_update" ON client_drive_files FOR UPDATE TO authenticated USING (client_id = auth.uid());
CREATE POLICY "client_drive_files_delete" ON client_drive_files FOR DELETE TO authenticated USING (client_id = auth.uid());