-- Create a view for platform data that excludes sensitive API credentials
-- This allows all authenticated users to see synced content without exposing keys

CREATE VIEW public.client_platforms_public
WITH (security_invoker = on) AS
SELECT 
  id,
  client_id,
  platform,
  is_connected,
  last_sync_at,
  schema_cache,
  created_at,
  updated_at
FROM public.client_platforms;
-- Excludes: api_key_encrypted, api_secret_encrypted, additional_config

-- Grant access to the view for authenticated users
GRANT SELECT ON public.client_platforms_public TO authenticated;

-- Add a policy to allow approved users to read from the base table via the view
-- The view uses security_invoker so we need a SELECT policy
DROP POLICY IF EXISTS "Admins can manage client platforms" ON public.client_platforms;

-- Admins retain full control
CREATE POLICY "Admins can manage client platforms"
ON public.client_platforms
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Approved users can SELECT (view will filter columns)
CREATE POLICY "Approved users can view platforms"
ON public.client_platforms
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_approved = true
  )
);

-- Add comment explaining the security model
COMMENT ON VIEW public.client_platforms_public IS 'Safe view of client_platforms that excludes API credentials. Use this for non-admin queries.';