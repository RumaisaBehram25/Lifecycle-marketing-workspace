-- Create table to store visibility preferences for Braze data items
CREATE TABLE public.data_visibility (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'campaign', 'canvas', 'segment'
  item_id TEXT NOT NULL, -- Braze ID
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, item_type, item_id)
);

-- Enable RLS
ALTER TABLE public.data_visibility ENABLE ROW LEVEL SECURITY;

-- Admins can manage visibility settings
CREATE POLICY "Admins can manage data visibility"
ON public.data_visibility
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view visibility settings
CREATE POLICY "Authenticated users can view visibility"
ON public.data_visibility
FOR SELECT
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_data_visibility_updated_at
BEFORE UPDATE ON public.data_visibility
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();