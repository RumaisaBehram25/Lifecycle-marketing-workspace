import { useState, useMemo } from 'react';
import { useDoubleGoodClient, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
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
  Mail, 
  Bell, 
  Smartphone, 
  CalendarIcon, 
  Sparkles, 
  Workflow,
  Zap,
  ChevronRight,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { TemplatePickerModal } from './TemplatePickerModal';

interface CreateBriefModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ContentType = 'campaign' | 'lifecycle';
type Channel = 'email' | 'push' | 'inapp';

interface BriefFormData {
  contentType: ContentType;
  channels: Channel[];
  name: string;
  deadline: Date | undefined;
  about: string;
  templateIds: string[];
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
  const navigate = useNavigate();

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
    } catch (err: any) {
      console.error('AI assist error:', err);
      toast({ title: 'AI assist failed', description: err.message, variant: 'destructive' });
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
      toast({ title: 'Name required', description: 'Please enter a campaign name', variant: 'destructive' });
      return;
    }

    if (formData.channels.length === 0) {
      toast({ title: 'Select channels', description: 'Please select at least one channel', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Create the brief
      const { data: brief, error: briefError } = await supabase
        .from('briefs')
        .insert({
          client_id: client.id,
          user_id: user.id,
          content_type: formData.contentType,
          channels: formData.channels,
          name: formData.name,
          deadline: formData.deadline?.toISOString().split('T')[0],
          about: formData.about,
          template_ids: formData.templateIds,
          status: 'draft',
        })
        .select()
        .single();

      if (briefError) throw briefError;

      // Create a new conversation linked to the brief
      const { data: conversation, error: convError } = await supabase
        .from('chat_conversations')
        .insert({
          client_id: client.id,
          user_id: user.id,
          title: `Brief: ${formData.name}`,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Update brief with conversation ID
      await supabase
        .from('briefs')
        .update({ conversation_id: conversation.id })
        .eq('id', brief.id);

      // Create initial AI message with brief context
      const briefContext = `I'm starting a new ${formData.contentType} brief called "${formData.name}".

**Channels:** ${formData.channels.join(', ')}
${formData.deadline ? `**Deadline:** ${format(formData.deadline, 'PPP')}` : ''}
${formData.about ? `**About:** ${formData.about}` : ''}

Please help me develop the creative for this ${formData.contentType}. Start by suggesting the messaging strategy and first draft copy for each channel.`;

      await supabase.from('chat_messages').insert({
        conversation_id: conversation.id,
        role: 'user',
        content: briefContext,
      });

      toast({ title: 'Brief created!', description: 'Starting AI conversation...' });
      handleClose();
      
      // Navigate to chat with the new conversation
      navigate(`/chat?conversation=${conversation.id}`);

    } catch (err: any) {
      console.error('Create brief error:', err);
      toast({ title: 'Failed to create brief', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const canProceedStep1 = formData.contentType && formData.channels.length > 0;
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
            <div className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              step >= 1 ? "bg-primary" : "bg-muted"
            )} />
            <div className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              step >= 2 ? "bg-primary" : "bg-muted"
            )} />
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-6">
            {step === 1 && (
              <>
                {/* Content Type Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Content Type</Label>
                  <div className="grid grid-cols-2 gap-3">
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
                        <div className="absolute top-2 right-2">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Zap className="h-6 w-6 text-blue-500" />
                      </div>
                      <span className="font-medium">Campaign</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Single-send or triggered message
                      </span>
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
                        <div className="absolute top-2 right-2">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <Workflow className="h-6 w-6 text-purple-500" />
                      </div>
                      <span className="font-medium">Lifecycle</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Multi-touch journey or canvas
                      </span>
                    </button>
                  </div>
                </div>

                {/* Channel Selection */}
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
                          <div className="absolute top-2 right-2">
                            <Check className="h-4 w-4 text-primary" />
                          </div>
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
                        <span className="text-xs text-muted-foreground text-center">
                          {channel.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                {/* Campaign Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Welcome Series, Black Friday Promo"
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
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.deadline && "text-muted-foreground"
                        )}
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
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* About */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="about">About</Label>
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
                  </div>
                  <Textarea
                    id="about"
                    placeholder="Describe the goal, audience, and key messages for this campaign..."
                    value={formData.about}
                    onChange={(e) => setFormData(prev => ({ ...prev, about: e.target.value }))}
                    rows={4}
                  />
                </div>

                {/* Template Inspiration */}
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

                {/* Selected channels summary */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Channels:</span>
                  {formData.channels.map(ch => (
                    <Badge key={ch} variant="secondary" className="capitalize">
                      {ch}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="capitalize">
                    {formData.contentType}
                  </Badge>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            {step === 1 ? (
              <>
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canProceedStep1}
                >
                  Continue
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || loading}
                >
                  {loading ? (
                    <LoadingSpinner size="sm" className="mr-2" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Create & Start Chat
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
        contentType={formData.contentType}
        channels={formData.channels}
      />
    </>
  );
}
