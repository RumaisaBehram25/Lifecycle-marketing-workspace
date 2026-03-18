-- Re-create the trigger on auth.users to handle new user signups
-- This was missing, causing profiles not to be created

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Skip user_roles and profiles backfill when auth users don't exist yet.
-- Add user_roles and backfill profiles after auth users exist.

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