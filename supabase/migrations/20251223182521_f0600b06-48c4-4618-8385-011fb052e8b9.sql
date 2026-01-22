-- Create enums for roles and platforms
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.platform_type AS ENUM ('braze', 'klaviyo', 'iterable', 'customerio', 'hubspot');
CREATE TYPE public.channel_type AS ENUM ('email', 'push', 'sms', 'in_app');
CREATE TYPE public.content_type AS ENUM ('copy', 'code');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Create clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  brand_voice TEXT,
  tone_presets JSONB DEFAULT '[]'::jsonb,
  do_rules JSONB DEFAULT '[]'::jsonb,
  dont_rules JSONB DEFAULT '[]'::jsonb,
  legal_requirements TEXT,
  website_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view clients" ON public.clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert clients" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update clients" ON public.clients
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete clients" ON public.clients
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create client_platforms table for platform connections
CREATE TABLE public.client_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  additional_config JSONB DEFAULT '{}'::jsonb,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  schema_cache JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, platform)
);

ALTER TABLE public.client_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client platforms" ON public.client_platforms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage client platforms" ON public.client_platforms
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create knowledge_documents table for Firecrawl ingested content
CREATE TABLE public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'markdown',
  category TEXT,
  platform platform_type,
  is_vendor_doc BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view knowledge" ON public.knowledge_documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage knowledge" ON public.knowledge_documents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create platform_schemas table for discovered events/attributes
CREATE TABLE public.platform_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_platform_id UUID NOT NULL REFERENCES public.client_platforms(id) ON DELETE CASCADE,
  schema_type TEXT NOT NULL CHECK (schema_type IN ('event', 'attribute', 'consent')),
  name TEXT NOT NULL,
  data_type TEXT,
  description TEXT,
  sample_values JSONB DEFAULT '[]'::jsonb,
  last_seen_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_platform_id, schema_type, name)
);

ALTER TABLE public.platform_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view schemas" ON public.platform_schemas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can manage schemas" ON public.platform_schemas
  FOR ALL TO authenticated USING (true);

-- Create generated_content table for audit trail
CREATE TABLE public.generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type content_type NOT NULL,
  channel channel_type,
  platform platform_type,
  input_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources_used JSONB DEFAULT '[]'::jsonb,
  assumptions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generated content" ON public.generated_content
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generated content" ON public.generated_content
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_client_platforms_updated_at BEFORE UPDATE ON public.client_platforms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_knowledge_documents_updated_at BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_platform_schemas_updated_at BEFORE UPDATE ON public.platform_schemas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();