import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLinktreeClient } from '@/hooks/useLinktreeClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquarePlus, Bug, Lightbulb, Send } from 'lucide-react';
import { toast } from 'sonner';

export function FeedbackWidget() {
  const { user } = useAuth();
  const { data: client } = useLinktreeClient();
  const queryClient = useQueryClient();
  
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'product_request' | 'bug_report'>('product_request');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submitFeedback = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('feedback')
        .insert({
          user_id: user.id,
          client_id: client?.id,
          type,
          title,
          description,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Feedback submitted! Thank you for your input.');
      setTitle('');
      setDescription('');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
    onError: (error) => {
      toast.error('Failed to submit feedback: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    submitFeedback.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="fixed bottom-4 right-4 h-10 w-10 rounded-full shadow-lg z-50"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" side="top" align="end">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">Submit Feedback</h4>
            <p className="text-xs text-muted-foreground">
              Help us improve by reporting bugs or requesting features.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product_request">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Product Request
                  </div>
                </SelectItem>
                <SelectItem value="bug_report">
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-red-500" />
                    Bug Report
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder={type === 'bug_report' ? 'Brief description of the bug' : 'Feature name or idea'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder={type === 'bug_report' 
                ? 'Steps to reproduce, expected vs actual behavior...' 
                : 'Describe the feature and why it would be helpful...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={submitFeedback.isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            {submitFeedback.isPending ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
