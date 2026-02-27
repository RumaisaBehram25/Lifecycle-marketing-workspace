import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  FileText, Mail, Bell, Smartphone, Clock, Sparkles,
  Zap, Workflow, Calendar, Save, Trash2, ExternalLink,
  Palette, Upload, Paperclip, CheckCircle2, Image, X, Plus, Copy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type ContentType = 'campaign' | 'lifecycle' | 'task';
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

interface Attachment {
  id: string;
  name: string;
  size: string;
  type: string;
}

interface BriefDetailModalProps {
  brief: Brief | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onUpdate: () => void;
}

const STATUS_OPTIONS = [
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

const PROGRESS_STEPS = [
  { id: 'to_brief', label: 'Brief' },
  { id: 'pending_copy', label: 'Copy' },
  { id: 'pending_design', label: 'Design' },
  { id: 'design_review', label: 'Review' },
  { id: 'in_development', label: 'Dev' },
  { id: 'qa_ready', label: 'QA' },
  { id: 'live', label: 'Live' },
];

const PLACEHOLDER_ATTACHMENTS: Attachment[] = [
  { id: 'a1', name: 'campaign-brief-v2.pdf', size: '2.4 MB', type: 'pdf' },
  { id: 'a2', name: 'brand-guidelines.docx', size: '1.8 MB', type: 'docx' },
  { id: 'a3', name: 'hero-mockup.png', size: '540 KB', type: 'image' },
];

/* ─────── Sub-components ─────── */

function BriefProgressBar({ status }: { status: string }) {
  const currentIdx = PROGRESS_STEPS.findIndex(s => s.id === status || (status === 'draft' && s.id === 'to_brief'));
  return (
    <div className="flex items-center gap-1">
      {PROGRESS_STEPS.map((step, i) => (
        <div key={step.id} className="flex-1 flex flex-col items-center gap-1">
          <div className={cn("w-full h-1.5 rounded-full", i <= currentIdx ? 'bg-primary' : 'bg-muted')} />
          <span className={cn("text-[9px]", i <= currentIdx ? 'text-primary font-medium' : 'text-muted-foreground')}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function AttachmentsSection({ attachments, onAdd, onRemove }: { 
  attachments: Attachment[]; 
  onAdd: () => void; 
  onRemove: (id: string) => void;
}) {
  const getIcon = (type: string) => {
    if (type === 'image') return <Image className="h-3.5 w-3.5 text-green-500" />;
    if (type === 'pdf') return <FileText className="h-3.5 w-3.5 text-red-500" />;
    return <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Attachments ({attachments.length})</Label>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={onAdd}>
          <Plus className="h-3 w-3" /> Add File
        </Button>
      </div>
      <div className="border border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer group" onClick={onAdd}>
        <Upload className="h-6 w-6 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-1" />
        <p className="text-xs text-muted-foreground">Drop files here or click to upload</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">PDF, DOCX, images up to 10MB</p>
      </div>
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 p-2 rounded border bg-muted/30 text-sm group/att">
              {getIcon(att.type)}
              <span className="flex-1 truncate text-xs">{att.name}</span>
              <span className="text-[10px] text-muted-foreground">{att.size}</span>
              <button onClick={() => onRemove(att.id)} className="opacity-0 group-hover/att:opacity-100 transition-opacity">
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailsTab({ brief, onChange, attachments, onAddAttachment, onRemoveAttachment }: { 
  brief: Brief; 
  onChange: (b: Brief) => void;
  attachments: Attachment[];
  onAddAttachment: () => void;
  onRemoveAttachment: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Status</Label>
            <Select value={brief.status} onValueChange={(v) => onChange({ ...brief, status: v })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {brief.deadline && (
            <div className="text-right">
              <Label className="text-xs">Deadline</Label>
              <p className="text-sm flex items-center gap-1 mt-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {format(new Date(brief.deadline), 'MMM d, yyyy')}
              </p>
            </div>
          )}
        </div>
        <BriefProgressBar status={brief.status} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Campaign / Brief Name</Label>
        <Input
          value={brief.name}
          onChange={(e) => onChange({ ...brief, name: e.target.value })}
          className="text-base font-semibold"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">About / Brief Details</Label>
        <Textarea
          value={brief.about || ''}
          onChange={(e) => onChange({ ...brief, about: e.target.value })}
          rows={8}
          placeholder="Describe the campaign goal, target audience, key messages, segmentation criteria, and any specific requirements..."
          className="text-sm leading-relaxed"
        />
      </div>

      <AttachmentsSection 
        attachments={attachments} 
        onAdd={onAddAttachment} 
        onRemove={onRemoveAttachment} 
      />

      <div className="grid grid-cols-2 gap-4 pt-3 border-t">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Created</p>
          <p className="text-sm">{brief.created_at ? format(new Date(brief.created_at), 'PPP') : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
          <p className="text-sm capitalize">{brief.content_type}</p>
        </div>
      </div>
    </div>
  );
}

function EmailCopyTab({ emailCopy, onChange, onGenerate, loading, briefName }: {
  emailCopy: EmailCopy;
  onChange: (c: EmailCopy) => void;
  onGenerate: () => void;
  loading: boolean;
  briefName: string;
}) {
  return (
    <div className="bg-background border rounded-lg shadow-sm max-w-2xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Email Proof</span>
        </div>
        <Button variant="default" size="sm" onClick={onGenerate} disabled={loading}>
          {loading ? <LoadingSpinner size="sm" className="mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Generate with AI
        </Button>
      </div>

      {/* Email document proof */}
      <div className="max-h-[55vh] overflow-y-auto">
        {/* Envelope header */}
        <div className="border-b px-6 py-4 bg-muted/10">
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-20">From</span>
              <span className="text-sm">BRCG &lt;hello@brcg.com&gt;</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-20">Subject</span>
              <Input
                value={emailCopy.subject_line || ''}
                onChange={(e) => onChange({ ...emailCopy, subject_line: e.target.value })}
                placeholder="Enter subject line..."
                className="border-none shadow-none h-auto p-0 text-sm font-semibold bg-transparent focus-visible:ring-0"
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-20">Preheader</span>
              <Input
                value={emailCopy.preheader || ''}
                onChange={(e) => onChange({ ...emailCopy, preheader: e.target.value })}
                placeholder="Preview text..."
                className="border-none shadow-none h-auto p-0 text-sm text-muted-foreground bg-transparent focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
            <span>Subject: {(emailCopy.subject_line || '').length}/60 chars</span>
            <span>Preheader: {(emailCopy.preheader || '').length}/100 chars</span>
          </div>
        </div>

        {/* Email body — document-like */}
        <div className="px-8 py-6 space-y-6">
          {/* Hero / Headline area */}
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-6 text-center">
            <Input
              value={emailCopy.headline || ''}
              onChange={(e) => onChange({ ...emailCopy, headline: e.target.value })}
              placeholder="Main Headline"
              className="border-none shadow-none text-center text-xl font-bold bg-transparent focus-visible:ring-0 placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Body */}
          <Textarea
            value={emailCopy.body || ''}
            onChange={(e) => onChange({ ...emailCopy, body: e.target.value })}
            placeholder="Write the main body copy of the email here. This area supports longer-form content that will be the primary message of your email..."
            className="min-h-[160px] border-none shadow-none px-0 bg-transparent focus-visible:ring-0 resize-none text-sm leading-relaxed"
          />

          {/* CTA Button */}
          <div className="text-center space-y-3 py-4 border-t border-b border-dashed">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Call to Action</p>
            <div className="flex items-center gap-3 max-w-md mx-auto">
              <Input
                value={emailCopy.cta_text || ''}
                onChange={(e) => onChange({ ...emailCopy, cta_text: e.target.value })}
                placeholder="Button text..."
                className="text-center font-medium"
              />
            </div>
            <Input
              value={emailCopy.cta_url || ''}
              onChange={(e) => onChange({ ...emailCopy, cta_url: e.target.value })}
              placeholder="https://..."
              className="text-xs text-center max-w-sm mx-auto h-8 text-muted-foreground"
            />
            {emailCopy.cta_text && (
              <div className="pt-2">
                <Button size="lg" className="px-8 font-semibold">{emailCopy.cta_text}</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreativeReferencesTab({ clientId }: { clientId: string }) {
  const { data: templates } = useQuery({
    queryKey: ['template-library', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_library')
        .select('*')
        .or(`client_id.eq.${clientId},is_global.eq.true`)
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  const PLACEHOLDER_TEMPLATES = [
    { id: 't1', name: 'Welcome Series - Hero', category: 'Welcome', channel: 'email', gradient: 'from-primary/10 to-primary/5' },
    { id: 't2', name: 'Pro Upgrade Nudge', category: 'Conversion', channel: 'email', gradient: 'from-blue-500/10 to-blue-500/5' },
    { id: 't3', name: 'Feature Announcement', category: 'Education', channel: 'email', gradient: 'from-emerald-500/10 to-emerald-500/5' },
    { id: 't4', name: 'Win-Back Series', category: 'Retention', channel: 'email', gradient: 'from-amber-500/10 to-amber-500/5' },
    { id: 't5', name: 'Post-Purchase Thank You', category: 'Transactional', channel: 'email', gradient: 'from-violet-500/10 to-violet-500/5' },
    { id: 't6', name: 'Cart Abandonment', category: 'Recovery', channel: 'email', gradient: 'from-rose-500/10 to-rose-500/5' },
  ];

  const displayTemplates = templates && templates.length > 0 ? templates : PLACEHOLDER_TEMPLATES;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-sm">Template Library</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">Select templates for design inspiration and reference</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayTemplates.map((tpl: any) => (
              <div
                key={tpl.id}
                className="border rounded-lg p-3 hover:border-primary/50 cursor-pointer transition-all group hover:shadow-sm"
              >
                <div className={cn(
                  "h-20 rounded-lg mb-2 flex items-center justify-center transition-colors",
                  `bg-gradient-to-br ${tpl.gradient || 'from-muted to-muted/50'}`
                )}>
                  <Image className="h-6 w-6 text-muted-foreground/40 group-hover:text-primary/40 transition-colors" />
                </div>
                <p className="font-medium text-xs">{tpl.name}</p>
                <p className="text-[10px] text-muted-foreground">{tpl.category || 'General'}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/brand">
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                Browse Full Template Library
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────── Main Modal ─────── */

export function BriefDetailModal({ brief, open, onOpenChange, clientId, onUpdate }: BriefDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editedBrief, setEditedBrief] = useState<Brief | null>(null);
  const [emailCopy, setEmailCopy] = useState<EmailCopy>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [attachments, setAttachments] = useState<Attachment[]>(PLACEHOLDER_ATTACHMENTS);

  useEffect(() => {
    if (brief) {
      setEditedBrief(brief);
      setEmailCopy((brief.ai_generated_copy as EmailCopy) || {});
      setActiveTab('details');
    }
  }, [brief?.id]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { error } = await supabase.from('briefs').update(data as any).eq('id', brief!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['brief-counts'] });
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
      const { error } = await supabase.from('briefs').delete().eq('id', brief!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['brief-counts'] });
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

  const handleAddAttachment = () => {
    toast({ title: 'File upload coming soon', description: 'File storage integration will be added.' });
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleDuplicate = async () => {
    if (!editedBrief || !clientId) return;
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      const { error } = await supabase.from('briefs').insert({
        name: `${editedBrief.name} (Copy)`,
        content_type: editedBrief.content_type,
        channels: editedBrief.channels,
        status: 'to_brief',
        deadline: editedBrief.deadline,
        about: editedBrief.about,
        client_id: clientId,
        user_id: user.user.id,
        ai_generated_copy: emailCopy as Record<string, unknown>,
      } as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['briefs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['brief-counts'] });
      toast({ title: 'Brief duplicated', description: `"${editedBrief.name} (Copy)" created` });
      onOpenChange(false);
      onUpdate();
    } catch (err: any) {
      toast({ title: 'Failed to duplicate', description: err.message, variant: 'destructive' });
    }
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
                editedBrief.content_type === 'campaign' ? 'bg-blue-500/10' :
                editedBrief.content_type === 'task' ? 'bg-green-500/10' : 'bg-purple-500/10'
              )}>
                {editedBrief.content_type === 'campaign' ? (
                  <Zap className="h-5 w-5 text-blue-500" />
                ) : editedBrief.content_type === 'task' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
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
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="copy">Email Copy</TabsTrigger>
            <TabsTrigger value="creative">Creative References</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="details" className="mt-0">
              <DetailsTab 
                brief={editedBrief} 
                onChange={setEditedBrief} 
                attachments={attachments}
                onAddAttachment={handleAddAttachment}
                onRemoveAttachment={handleRemoveAttachment}
              />
            </TabsContent>

            <TabsContent value="copy" className="mt-0">
              <EmailCopyTab
                emailCopy={emailCopy}
                onChange={setEmailCopy}
                onGenerate={handleGenerateCopy}
                loading={aiLoading}
                briefName={editedBrief.name}
              />
            </TabsContent>

            <TabsContent value="creative" className="mt-0">
              <CreativeReferencesTab clientId={clientId} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDuplicate}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
