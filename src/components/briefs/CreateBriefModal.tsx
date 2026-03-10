import { useState } from 'react';
import { useDoubleGoodClient } from '@/hooks/useDoubleGoodClient';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  Mail, Bell, Smartphone, CalendarIcon, Sparkles, Workflow,
  Zap, ChevronRight, Check, FileText, Upload, ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { TemplatePickerModal } from './TemplatePickerModal';
import { logger } from '@/lib/logger';

interface CreateBriefModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ContentType = 'campaign' | 'lifecycle' | 'task';
type Channel = 'email' | 'push' | 'inapp';

interface BriefFormData {
  contentType: ContentType;
  channels: Channel[];
  name: string;
  deadline: Date | undefined;
  about: string;
  templateIds: string[];
  notes: string;
}

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, description: 'Rich HTML emails' },
  { id: 'push', label: 'Push', icon: <Bell className="h-4 w-4" />, description: 'Mobile notifications' },
  { id: 'inapp', label: 'In-App', icon: <Smartphone className="h-4 w-4" />, description: 'In-app messages' },
];

export function CreateBriefModal({ open, onOpenChange }: CreateBriefModalProps) {
  const { data: client } = useDoubleGoodClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  
  const [formData, setFormData] = useState<BriefFormData>({
    contentType: 'campaign',
    channels: [],
    name: '',
    deadline: undefined,
    about: '',
    templateIds: [],
    notes: '',
  });

  const resetForm = () => {
    setStep(1);
    setFormData({
      contentType: 'campaign',
      channels: [],
      name: '',
      deadline: undefined,
      about: '',
      templateIds: [],
      notes: '',
    });
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const toggleChannel = (channel: Channel) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel]
    }));
  };

  const handleAiAssist = async () => {
    if (!formData.about.trim()) {
      toast({ title: 'Add a description first', description: 'Tell us what this brief is about so AI can help.', variant: 'destructive' });
      return;
    }

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-brief-copy', {
        body: {
          contentType: formData.contentType,
          channels: formData.channels,
          about: formData.about,
          clientId: client?.id,
        }
      });

      if (error) throw error;

      if (data?.suggestions) {
        setFormData(prev => ({
          ...prev,
          name: data.suggestions.name || prev.name,
          about: data.suggestions.expandedAbout || prev.about,
        }));
        toast({ title: 'AI suggestions applied!' });
      }
    } catch (err: unknown) {
      logger.error('AI assist error:', err);
      toast({ title: 'AI assist failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!client?.id || !user?.id) {
      toast({ title: 'Missing context', variant: 'destructive' });
      return;
    }

    if (!formData.name.trim()) {
      toast({ title: 'Name required', description: 'Please enter a name', variant: 'destructive' });
      return;
    }

    if (formData.contentType !== 'task' && formData.channels.length === 0) {
      toast({ title: 'Select channels', description: 'Please select at least one channel', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error: briefError } = await supabase
        .from('briefs')
        .insert({
          client_id: client.id,
          user_id: user.id,
          content_type: formData.contentType,
          channels: formData.contentType === 'task' ? [] : formData.channels,
          name: formData.name,
          deadline: formData.deadline?.toISOString().split('T')[0],
          about: formData.contentType === 'task' 
            ? [formData.about, formData.notes].filter(Boolean).join('\n\n---\nNotes:\n')
            : formData.about,
          template_ids: formData.templateIds,
          status: 'draft',
        });

      if (briefError) throw briefError;

      toast({ title: 'Brief created!' });
      queryClient.invalidateQueries({ queryKey: ['briefs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-briefs'] });
      queryClient.invalidateQueries({ queryKey: ['brief-counts'] });
      handleClose();

    } catch (err: unknown) {
      logger.error('Create brief error:', err);
      toast({ title: 'Failed to create brief', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const isTask = formData.contentType === 'task';
  const canProceedStep1 = formData.contentType && (isTask || formData.channels.length > 0);
  const canSubmit = formData.name.trim().length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              Create Brief
            </DialogTitle>
            <DialogDescription>
              {step === 1 
                ? 'Choose your content type and channels'
                : 'Fill in the details for your brief'
              }
            </DialogDescription>
          </DialogHeader>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 px-1">
            <div className={cn("h-1.5 flex-1 rounded-full transition-colors", step >= 1 ? "bg-primary" : "bg-muted")} />
            <div className={cn("h-1.5 flex-1 rounded-full transition-colors", step >= 2 ? "bg-primary" : "bg-muted")} />
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-6">
            {step === 1 && (
              <>
                {/* Content Type Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Content Type</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, contentType: 'campaign' }))}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        formData.contentType === 'campaign'
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      {formData.contentType === 'campaign' && (
                        <div className="absolute top-2 right-2"><Check className="h-4 w-4 text-primary" /></div>
                      )}
                      <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Zap className="h-6 w-6 text-blue-500" />
                      </div>
                      <span className="font-medium">Campaign</span>
                      <span className="text-xs text-muted-foreground text-center">Single-send or triggered</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, contentType: 'lifecycle' }))}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        formData.contentType === 'lifecycle'
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      {formData.contentType === 'lifecycle' && (
                        <div className="absolute top-2 right-2"><Check className="h-4 w-4 text-primary" /></div>
                      )}
                      <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <Workflow className="h-6 w-6 text-purple-500" />
                      </div>
                      <span className="font-medium">Lifecycle</span>
                      <span className="text-xs text-muted-foreground text-center">Multi-touch journey</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, contentType: 'task' }))}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        formData.contentType === 'task'
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      {formData.contentType === 'task' && (
                        <div className="absolute top-2 right-2"><Check className="h-4 w-4 text-primary" /></div>
                      )}
                      <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                        <ClipboardList className="h-6 w-6 text-green-500" />
                      </div>
                      <span className="font-medium">Task</span>
                      <span className="text-xs text-muted-foreground text-center">Track with notes</span>
                    </button>
                  </div>
                </div>

                {/* Channel Selection - hidden for tasks */}
                {!isTask && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Channels (select all that apply)</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {CHANNELS.map(channel => (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => toggleChannel(channel.id)}
                          className={cn(
                            "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                            formData.channels.includes(channel.id)
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-muted-foreground/30"
                          )}
                        >
                          {formData.channels.includes(channel.id) && (
                            <div className="absolute top-2 right-2"><Check className="h-4 w-4 text-primary" /></div>
                          )}
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center",
                            channel.id === 'email' && "bg-blue-500/10 text-blue-500",
                            channel.id === 'push' && "bg-orange-500/10 text-orange-500",
                            channel.id === 'inapp' && "bg-purple-500/10 text-purple-500",
                          )}>
                            {channel.icon}
                          </div>
                          <span className="font-medium text-sm">{channel.label}</span>
                          <span className="text-xs text-muted-foreground text-center">{channel.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">{isTask ? 'Task Name' : 'Campaign Name'} *</Label>
                  <Input
                    id="name"
                    placeholder={isTask ? "e.g., Update audience segments, QA welcome flow" : "e.g., Welcome Series, Black Friday Promo"}
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                {/* Deadline */}
                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !formData.deadline && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.deadline ? format(formData.deadline, "PPP") : "Pick a deadline"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.deadline}
                        onSelect={(date) => setFormData(prev => ({ ...prev, deadline: date }))}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* About */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="about">About</Label>
                    {!isTask && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAiAssist}
                        disabled={aiLoading || !formData.about.trim()}
                        className="text-xs h-7"
                      >
                        {aiLoading ? (
                          <LoadingSpinner size="sm" className="mr-1" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        AI Enhance
                      </Button>
                    )}
                  </div>
                  <Textarea
                    id="about"
                    placeholder={isTask ? "Describe what needs to be done..." : "Describe the goal, audience, and key messages..."}
                    value={formData.about}
                    onChange={(e) => setFormData(prev => ({ ...prev, about: e.target.value }))}
                    rows={3}
                  />
                </div>

                {/* Notes - for tasks */}
                {isTask && (
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Add any additional notes, links, or context..."
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                    />
                  </div>
                )}

                {/* Upload for tasks */}
                {isTask && (
                  <div className="space-y-2">
                    <Label>Attachments</Label>
                    <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center hover:border-muted-foreground/30 transition-colors">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Drag & drop or click to upload files</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, DOC, images supported</p>
                    </div>
                  </div>
                )}

                {/* Template Inspiration - not for tasks */}
                {!isTask && (
                  <div className="space-y-2">
                    <Label>Template Inspiration</Label>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setTemplatePickerOpen(true)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {formData.templateIds.length > 0 
                        ? `${formData.templateIds.length} template(s) selected`
                        : 'Browse template library'
                      }
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Summary badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize">{formData.contentType}</Badge>
                  {formData.channels.length > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground">Channels:</span>
                      {formData.channels.map(ch => (
                        <Badge key={ch} variant="secondary" className="capitalize">{ch}</Badge>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            {step === 1 ? (
              <>
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>
                  Continue <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={handleSubmit} disabled={!canSubmit || loading}>
                  {loading ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                  Create {isTask ? 'Task' : 'Brief'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TemplatePickerModal
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        selectedIds={formData.templateIds}
        onSelect={(ids) => setFormData(prev => ({ ...prev, templateIds: ids }))}
        contentType={formData.contentType === 'task' ? 'campaign' : formData.contentType}
        channels={formData.channels}
      />
    </>
  );
}
