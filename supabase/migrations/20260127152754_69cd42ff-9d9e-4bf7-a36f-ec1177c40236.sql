-- Add approval status to profiles table for admin approval flow
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

-- Create index for faster approval status lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_approved ON public.profiles(is_approved);

-- Update RLS policy for profiles to allow admins to view all profiles for approval management
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Admins can view all profiles for user management
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- Admins can update any profile (for approval)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

-- Fix platform_schemas: Remove the policy that exposes data to all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view schemas" ON public.platform_schemas;

-- Only admins can view platform schemas (contains sensitive integration details)
CREATE POLICY "Admins can view platform schemas" 
ON public.platform_schemas 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- Verify client_platforms is admin-only (should already be from previous migration)
-- This ensures API credentials are protected
DROP POLICY IF EXISTS "Authenticated users can view platforms" ON public.client_platforms;

-- Add comment documenting the security model
COMMENT ON TABLE public.profiles IS 'User profiles with admin approval workflow. is_approved must be true for user to access the application.';
COMMENT ON COLUMN public.profiles.is_approved IS 'Whether the user has been approved by an admin. False by default for new signups.';
COMMENT ON COLUMN public.profiles.approved_at IS 'Timestamp when the user was approved.';
COMMENT ON COLUMN public.profiles.approved_by IS 'Admin user ID who approved this user.';