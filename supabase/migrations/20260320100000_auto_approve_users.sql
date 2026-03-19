-- Auto-approve all users so nobody is blocked on pending approval.

-- 1) Make approval default true for newly created profiles.
ALTER TABLE public.profiles
ALTER COLUMN is_approved SET DEFAULT true;

-- 2) Auto-approve existing users who are still pending.
UPDATE public.profiles
SET
  is_approved = true,
  approved_at = COALESCE(approved_at, now()),
  approved_by = approved_by
WHERE is_approved = false;

-- 3) Ensure signup-created profiles are immediately approved.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_approved, approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    true,
    now()
  );

  -- First user becomes admin
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;

  RETURN NEW;
END;
$$;
