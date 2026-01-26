-- Fix 1: Restrict client_platforms access to admins only (remove public SELECT for API keys)
DROP POLICY IF EXISTS "Authenticated users can view client platforms" ON public.client_platforms;

-- Ensure only admins can access client_platforms (contains API keys)
-- The "Admins can manage client platforms" policy already exists for ALL operations

-- Fix 2: Restrict platform_schemas - remove the overly permissive ALL policy
DROP POLICY IF EXISTS "System can manage schemas" ON public.platform_schemas;

-- Create proper admin-only management policy for platform_schemas
CREATE POLICY "Admins can manage platform schemas" 
  ON public.platform_schemas 
  FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));