-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('analytics-csvs', 'analytics-csvs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload analytics csvs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'analytics-csvs');

CREATE POLICY "Authenticated users can read analytics csvs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'analytics-csvs');