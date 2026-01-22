-- Create knowledge sync logs table to track refresh history
CREATE TABLE public.knowledge_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total_documents INTEGER DEFAULT 0,
  new_documents INTEGER DEFAULT 0,
  updated_documents INTEGER DEFAULT 0,
  failed_documents INTEGER DEFAULT 0,
  platforms_processed JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_sync_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view sync logs
CREATE POLICY "Authenticated users can view sync logs"
ON public.knowledge_sync_logs
FOR SELECT
USING (true);

-- Admins can manage sync logs
CREATE POLICY "Admins can manage sync logs"
ON public.knowledge_sync_logs
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add index for faster queries
CREATE INDEX idx_knowledge_sync_logs_started_at ON public.knowledge_sync_logs(started_at DESC);