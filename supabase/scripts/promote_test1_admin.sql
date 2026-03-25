-- Promote test1@test.com to admin + approve profile.
-- Run once in Supabase Dashboard → SQL Editor (not applied by db push unless you move to migrations).

DO $$
DECLARE
  v_email   text := 'test1@test.com';
  v_user_id uuid;
BEGIN
  SELECT u.id
  INTO v_user_id
  FROM auth.users AS u
  WHERE lower(trim(u.email)) = lower(trim(v_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row found for email: %', v_email;
    RETURN;
  END IF;

  RAISE NOTICE 'Promoting user id % (%).', v_user_id, v_email;

  -- Single admin role: remove other roles, then upsert admin (UNIQUE user_id + role).
  DELETE FROM public.user_roles
  WHERE user_id = v_user_id
    AND role IS DISTINCT FROM 'admin'::public.app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role)
  DO UPDATE SET role = EXCLUDED.role;

  -- Approve profile (insert minimal row if missing).
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    is_approved,
    approved_at,
    approved_by
  )
  SELECT
    u.id,
    u.email,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      split_part(u.email, '@', 1)
    ),
    true,
    now(),
    NULL
  FROM auth.users AS u
  WHERE u.id = v_user_id
  ON CONFLICT (id) DO UPDATE SET
    is_approved = true,
    approved_at = excluded.approved_at,
    approved_by = coalesce(public.profiles.approved_by, excluded.approved_by);

  RAISE NOTICE 'Done: admin + approved for %', v_email;
END;
$$;
