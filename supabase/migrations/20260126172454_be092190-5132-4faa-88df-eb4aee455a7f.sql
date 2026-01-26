-- Create feedback table for product requests and bug reports
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  client_id UUID REFERENCES public.clients(id),
  type TEXT NOT NULL CHECK (type IN ('product_request', 'bug_report')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can create feedback
CREATE POLICY "Users can create feedback" 
ON public.feedback 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can view their own feedback
CREATE POLICY "Users can view their own feedback" 
ON public.feedback 
FOR SELECT 
USING (auth.uid() = user_id);

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback" 
ON public.feedback 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role = 'admin'
));

-- Admins can update feedback status
CREATE POLICY "Admins can update feedback" 
ON public.feedback 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role = 'admin'
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_feedback_updated_at
BEFORE UPDATE ON public.feedback
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();