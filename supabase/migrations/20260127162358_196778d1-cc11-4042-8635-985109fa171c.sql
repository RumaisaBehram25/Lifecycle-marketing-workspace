-- Re-create the trigger on auth.users to handle new user signups
-- This was missing, causing profiles not to be created

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any existing users that don't have profiles
-- We need to do this via a function since we can't directly query auth.users

-- Insert missing profile for hpollard23@gmail.com (known from auth logs)
INSERT INTO public.profiles (id, email, full_name, is_approved)
VALUES ('4755cec5-adb7-4f51-9a1e-9d0b10c26d58', 'hpollard23@gmail.com', 'Henry', true)
ON CONFLICT (id) DO UPDATE SET is_approved = true;

-- Insert missing profile for the admin user
INSERT INTO public.profiles (id, email, full_name, is_approved)
VALUES ('6438d72e-c633-4ec0-9fac-12268e588966', 'henry@brcg.co', 'Henry', true)
ON CONFLICT (id) DO UPDATE SET is_approved = true;

-- Add role for hpollard23@gmail.com user
INSERT INTO public.user_roles (user_id, role)
VALUES ('4755cec5-adb7-4f51-9a1e-9d0b10c26d58', 'member')
ON CONFLICT (user_id, role) DO NOTHING;

-- Update briefs RLS policy to allow all approved users to view ALL briefs
-- (not just their own) so everyone sees the same content
DROP POLICY IF EXISTS "Users can view their own briefs" ON public.briefs;

CREATE POLICY "Approved users can view all briefs"
ON public.briefs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_approved = true
  )
);