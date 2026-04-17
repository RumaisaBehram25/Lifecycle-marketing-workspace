-- Bootstrap the shared admin workspace (`slug = doublegood`) without a browser INSERT on `clients`.
-- RLS on `clients` can block or complicate INSERT from PostgREST; this runs as the function owner.

CREATE OR REPLACE FUNCTION public.ensure_doublegood_workspace_client ()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID;
BEGIN
  IF auth.uid () IS NULL OR NOT public.has_role (auth.uid (), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO cid FROM public.clients WHERE slug = 'doublegood' LIMIT 1;
  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  BEGIN
    INSERT INTO public.clients (name, slug, is_active)
    VALUES ('BRCG', 'doublegood', true)
    RETURNING id INTO cid;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO cid FROM public.clients WHERE slug = 'doublegood' LIMIT 1;
  END;

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_doublegood_workspace_client () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_doublegood_workspace_client () TO authenticated;

COMMENT ON FUNCTION public.ensure_doublegood_workspace_client () IS
  'Creates the shared BRCG `clients` row if missing. Admin-only; used by the app instead of REST INSERT on clients.';
