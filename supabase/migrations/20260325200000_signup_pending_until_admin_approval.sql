-- New signups require admin approval (profiles.is_approved).
-- The first user remains auto-approved + admin so the project can bootstrap without a chicken-and-egg.

ALTER TABLE public.profiles
  ALTER COLUMN is_approved SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prefer auth user count (see 20260326120000): COUNT(user_roles)=0 treats every signup as
  -- "first" when the table was truncated, so all signups became admin + approved.
  IF (SELECT COUNT(*)::int FROM auth.users) = 1 THEN
    INSERT INTO public.profiles (id, email, full_name, is_approved, approved_at)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
      ),
      true,
      now()
    );
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.profiles (id, email, full_name, is_approved)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
      ),
      false
    );
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;

  RETURN NEW;
END;
$$;
