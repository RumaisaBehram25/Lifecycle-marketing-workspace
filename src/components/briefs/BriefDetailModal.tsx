import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileText, 
  Mail, 
  Bell, 
  Smartphone, 
  Clock, 
  Sparkles,
  Zap,
  Workflow,
  Calendar,
  Save,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type ContentType = 'campaign' | 'lifecycle';
type Channel = 'email' | 'push' | 'inapp';
type BriefStatus = 'to_brief' | 'pending_copy' | 'pending_design' | 'design_review' | 'in_development' | 'qa_ready' | 'live' | 'draft' | 'in_review' | 'approved' | 'in_progress' | 'complete';

interface Brief {
  id: string;
  name: string;
  content_type: ContentType;
  channels: Channel[];
  status: string;
  deadline: string | null;
  about: string | null;
  created_at: string;
  conversation_id: string | null;
  ai_generated_copy?: EmailCopy | null;
}

interface EmailCopy {
  subject_line?: string;
  preheader?: string;
  headline?: string;
  body?: string;
  cta_text?: string;
  cta_url?: string;
}

interface BriefDetailModalProps {
  brief: Brief | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onUpdate: () => void;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'to_brief', label: 'To Brief' },
  { value: 'pending_copy', label: 'Pending Copy' },
  { value: 'pending_design', label: 'Pending Design' },
  { value: 'design_review', label: 'In Design Review' },
  { value: 'in_development', label: 'In Development' },
  { value: 'qa_ready', label: 'QA Ready' },
  { value: 'live', label: 'Live' },
];

const CHANNEL_CONFIG: Record<Channel, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: 'Email', icon: <Mail className="h-4 w-4" />, color: 'bg-blue-500/10 text-blue-500' },
  push: { label: 'Push', icon: <Bell className="h-4 w-4" />, color: 'bg-orange-500/10 text-orange-500' },
  inapp: { label: 'In-App', icon: <Smartphone className="h-4 w-4" />, color: 'bg-purple-500/10 text-purple-500' },
};

export function BriefDetailModal({ 
  brief, 
  open, 
  onOpenChange, 
  clientId,
  onUpdate 
}: BriefDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editedBrief, setEditedBrief] = useState<Brief | null>(null);
  const [emailCopy, setEmailCopy] = useState<EmailCopy>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  // Sync state when brief changes
  useState(() => {
    if (brief) {
      setEditedBrief(brief);
      setEmailCopy((brief.ai_generated_copy as EmailCopy) || {});
    }
  });

  // Update when modal opens with new brief
  if (brief && editedBrief?.id !== brief.id) {
    setEditedBrief(brief);
    setEmailCopy((brief.ai_generated_copy as EmailCopy) || {});
  }

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { error } = await supabase
        .from('briefs')
        .update(data as any)
        .eq('id', brief!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs', clientId] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-briefs'] });
      toast({ title: 'Brief updated' });
      onUpdate();
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('briefs')
        .delete()
        .eq('id', brief!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs', clientId] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-briefs'] });
      toast({ title: 'Brief deleted' });
      onOpenChange(false);
      onUpdate();
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete', description: err.message, variant: 'destructive' });
    },
  });

  const handleGenerateCopy = async () => {
    if (!editedBrief?.about) {
      toast({ title: 'Add a description first', variant: 'destructive' });
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-brief-copy', {
        body: {
          contentType: editedBrief.content_type,
          channels: editedBrief.channels,
          about: editedBrief.about,
          clientId,
          generateEmailCopy: true,
        }
      });
      if (error) throw error;
      
      if (data?.emailCopy) {
        setEmailCopy(data.emailCopy);
        toast({ title: 'Email copy generated!' });
      } else if (data?.suggestions) {
        // Fallback if only suggestions returned
        setEmailCopy({
          subject_line: data.suggestions.subjectLine || '',
          preheader: data.suggestions.preheader || '',
          headline: data.suggestions.headline || '',
          body: data.suggestions.body || '',
          cta_text: data.suggestions.ctaText || 'Get Started',
        });
        toast({ title: 'Copy suggestions generated!' });
      }
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = () => {
    if (!editedBrief) return;
    updateMutation.mutate({
      name: editedBrief.name,
      status: editedBrief.status,
      about: editedBrief.about,
      ai_generated_copy: emailCopy as Record<string, unknown>,
    });
  };

  if (!brief || !editedBrief) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pr-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                editedBrief.content_type === 'campaign' ? 'bg-blue-500/10' : 'bg-purple-500/10'
              )}>
                {editedBrief.content_type === 'campaign' ? (
                  <Zap className="h-5 w-5 text-blue-500" />
                ) : (
                  <Workflow className="h-5 w-5 text-purple-500" />
                )}
              </div>
              <div>
                <DialogTitle className="text-left">{editedBrief.name}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="capitalize text-xs">
                    {editedBrief.content_type}
                  </Badge>
                  {editedBrief.channels.map(ch => (
                    <div key={ch} className={cn("h-5 w-5 rounded flex items-center justify-center", CHANNEL_CONFIG[ch]?.color || 'bg-muted')}>
                      {CHANNEL_CONFIG[ch]?.icon || <Mail className="h-4 w-4" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {editedBrief.deadline && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mr-4">
                <Calendar className="h-4 w-4" />
                {format(new Date(editedBrief.deadline), 'MMM d, yyyy')}
              </div>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="copy">Email Copy</TabsTrigger>
            <TabsTrigger value="design">Design</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="details" className="mt-0 space-y-4">
              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={editedBrief.status} 
                  onValueChange={(v) => setEditedBrief({ ...editedBrief, status: v as any })}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input 
                  value={editedBrief.name}
                  onChange={(e) => setEditedBrief({ ...editedBrief, name: e.target.value })}
                />
              </div>

              {/* About */}
              <div className="space-y-2">
                <Label>About / Brief</Label>
                <Textarea 
                  value={editedBrief.about || ''}
                  onChange={(e) => setEditedBrief({ ...editedBrief, about: e.target.value })}
                  rows={6}
                  placeholder="Describe the campaign goal, target audience, and key messages..."
                />
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">{format(new Date(editedBrief.created_at), 'PPP')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Deadline</p>
                  <p className="text-sm">{editedBrief.deadline ? format(new Date(editedBrief.deadline), 'PPP') : 'Not set'}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="copy" className="mt-0">
              {/* Document-style Email Copy Editor */}
              <div className="bg-background border rounded-lg shadow-sm">
                {/* Header with generate button */}
                <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Email Copy</span>
                  </div>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleGenerateCopy}
                    disabled={aiLoading}
                  >
                    {aiLoading ? <LoadingSpinner size="sm" className="mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Generate with AI
                  </Button>
                </div>
                
                {/* Document content - single scrollable page */}
                <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
                  {/* Subject & Preheader block */}
                  <div className="space-y-3 pb-4 border-b">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Subject Line</label>
                      <Input 
                        value={emailCopy.subject_line || ''}
                        onChange={(e) => setEmailCopy({ ...emailCopy, subject_line: e.target.value })}
                        placeholder="The first thing recipients see..."
                        className="mt-1 text-base font-semibold border-none shadow-none px-0 focus-visible:ring-0 bg-transparent"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(emailCopy.subject_line || '').length}/60 chars
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Preheader</label>
                      <Input 
                        value={emailCopy.preheader || ''}
                        onChange={(e) => setEmailCopy({ ...emailCopy, preheader: e.target.value })}
                        placeholder="Preview text after subject..."
                        className="mt-1 text-sm border-none shadow-none px-0 focus-visible:ring-0 bg-transparent text-muted-foreground"
                      />
                    </div>
                  </div>

                  {/* Headline block */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Headline</label>
                    <Input 
                      value={emailCopy.headline || ''}
                      onChange={(e) => setEmailCopy({ ...emailCopy, headline: e.target.value })}
                      placeholder="Main heading..."
                      className="mt-1 text-xl font-bold border-none shadow-none px-0 focus-visible:ring-0 bg-transparent"
                    />
                  </div>

                  {/* Body block */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Body Copy</label>
                    <Textarea 
                      value={emailCopy.body || ''}
                      onChange={(e) => setEmailCopy({ ...emailCopy, body: e.target.value })}
                      placeholder="The main message content..."
                      className="mt-1 min-h-[120px] border-none shadow-none px-0 focus-visible:ring-0 bg-transparent resize-none"
                    />
                  </div>

                  {/* CTA block */}
                  <div className="pt-4 border-t">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Call to Action</label>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1">
                        <Input 
                          value={emailCopy.cta_text || ''}
                          onChange={(e) => setEmailCopy({ ...emailCopy, cta_text: e.target.value })}
                          placeholder="Button text..."
                          className="font-medium"
                        />
                      </div>
                      <span className="text-muted-foreground text-sm">→</span>
                      <div className="flex-1">
                        <Input 
                          value={emailCopy.cta_url || ''}
                          onChange={(e) => setEmailCopy({ ...emailCopy, cta_url: e.target.value })}
                          placeholder="https://..."
                          className="text-sm"
                        />
                      </div>
                    </div>
                    {emailCopy.cta_text && (
                      <div className="mt-4 flex justify-center">
                        <Button size="sm">{emailCopy.cta_text}</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="design" className="mt-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Template Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on your campaign type and content, we recommend these templates:
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border rounded-lg p-4 hover:border-primary/50 cursor-pointer transition-colors">
                      <div className="h-24 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg mb-3 flex items-center justify-center">
                        <Mail className="h-8 w-8 text-primary/50" />
                      </div>
                      <p className="font-medium text-sm">Standard Promo</p>
                      <p className="text-xs text-muted-foreground">Clean layout for promotions</p>
                    </div>
                    <div className="border rounded-lg p-4 hover:border-primary/50 cursor-pointer transition-colors">
                      <div className="h-24 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-lg mb-3 flex items-center justify-center">
                        <Mail className="h-8 w-8 text-blue-500/50" />
                      </div>
                      <p className="font-medium text-sm">Feature Announcement</p>
                      <p className="text-xs text-muted-foreground">Highlight new features</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <Button variant="outline" size="sm" className="w-full">
                      Browse Template Library
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm('Are you sure you want to delete this brief?')) {
                deleteMutation.mutate();
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <LoadingSpinner size="sm" className="mr-2" />}
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
