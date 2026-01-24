-- Create briefs table to store campaign/lifecycle briefs
CREATE TABLE public.briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('campaign', 'lifecycle')),
  channels TEXT[] NOT NULL DEFAULT '{}',
  name TEXT NOT NULL,
  deadline DATE,
  about TEXT,
  template_ids TEXT[] DEFAULT '{}',
  ai_generated_copy JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'complete', 'archived')),
  conversation_id UUID REFERENCES public.chat_conversations(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own briefs"
  ON public.briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own briefs"
  ON public.briefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own briefs"
  ON public.briefs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own briefs"
  ON public.briefs FOR DELETE
  USING (auth.uid() = user_id);

-- Create template library table for curated templates
CREATE TABLE public.template_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('campaign', 'lifecycle')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push', 'inapp', 'sms')),
  category TEXT,
  subject_line TEXT,
  preview_text TEXT,
  body_preview TEXT,
  html_content TEXT,
  tags TEXT[] DEFAULT '{}',
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.template_library ENABLE ROW LEVEL SECURITY;

-- RLS policies for template library (read-only for all authenticated, admin can manage)
CREATE POLICY "Authenticated users can view templates"
  ON public.template_library FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage templates"
  ON public.template_library FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on briefs
CREATE TRIGGER update_briefs_updated_at
  BEFORE UPDATE ON public.briefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on template_library
CREATE TRIGGER update_template_library_updated_at
  BEFORE UPDATE ON public.template_library
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();