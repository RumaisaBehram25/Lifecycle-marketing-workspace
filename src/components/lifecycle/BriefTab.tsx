import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Calendar as CalendarIcon,
  FileText,
  Mail,
  Bell,
  Smartphone,
  Sparkles,
  Workflow,
  Zap,
  Check,
  ChevronRight,
  Upload,
  Users,
  Clock,
  LayoutGrid,
  List,
  ArrowRight,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isSameMonth, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { TemplatePickerModal } from '@/components/briefs/TemplatePickerModal';
import { BriefDetailModal } from '@/components/briefs/BriefDetailModal';
import { TasksSection } from '@/components/briefs/TasksSection';

type ContentType = 'campaign' | 'lifecycle';
type Channel = 'email' | 'push' | 'inapp';
type BriefStatus = 'draft' | 'in_review' | 'approved' | 'in_progress' | 'complete';

interface Brief {
  id: string;
  name: string;
  content_type: ContentType;
  channels: Channel[];
  status: BriefStatus;
  deadline: string | null;
  about: string | null;
  created_at: string;
  conversation_id: string | null;
  ai_generated_copy?: any;
}

interface Segment {
  id: string;
  name: string;
}

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode }[] = [
  { id: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { id: 'push', label: 'Push', icon: <Bell className="h-4 w-4" /> },
  { id: 'inapp', label: 'In-App', icon: <Smartphone className="h-4 w-4" /> },
];

const STATUS_CONFIG: Record<BriefStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  in_review: { label: 'In Review', color: 'bg-amber-500/20 text-amber-600' },
  approved: { label: 'Approved', color: 'bg-blue-500/20 text-blue-600' },
  in_progress: { label: 'In Progress', color: 'bg-purple-500/20 text-purple-600' },
  complete: { label: 'Complete', color: 'bg-green-500/20 text-green-600' },
};

const PROGRESS_STEPS = [
  { id: 'draft', label: 'Draft' },
  { id: 'in_review', label: 'Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'in_progress', label: 'Building' },
  { id: 'complete', label: 'Live' },
];

export function BriefTab() {
  const { data: client } = useLinktreeClient();
  const { data: platforms } = useLinktreePlatforms();
  const { user } = useAuth();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<'cards' | 'list' | 'calendar'>('cards');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedBrief, setSelectedBrief] = useState<Brief | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Fetch briefs
  const { data: briefs, isLoading, refetch } = useQuery({
    queryKey: ['briefs', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('briefs')
        .select('*')
        .eq('client_id', client.id)
        .order('deadline', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Brief[];
    },
    enabled: !!client?.id,
  });

  // Get starred segments for dropdown
  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeSegments: Segment[] = (brazePlatform?.schema_cache as any)?.segments || [];

  const { data: visibilityData } = useQuery({
    queryKey: ['data-visibility-segments', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', client.id)
        .eq('item_type', 'segment')
        .eq('is_visible', true);
      if (error) throw error;
      return data;
    },
    enabled: !!client?.id,
  });

  const starredSegmentIds = new Set(visibilityData?.map(v => v.item_id) || []);
  const starredSegments = brazeSegments.filter(s => starredSegmentIds.has(s.id));

  // Group briefs by deadline for calendar
  const briefsByDate = useMemo(() => {
    const map = new Map<string, Brief[]>();
    briefs?.forEach(brief => {
      if (brief.deadline) {
        const dateKey = brief.deadline;
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey)!.push(brief);
      }
    });
    return map;
  }, [briefs]);

  // Calendar days
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const handleBriefClick = (brief: Brief) => {
    setSelectedBrief(brief);
    setDetailModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'cards' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('cards')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('calendar')}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Brief
        </Button>
      </div>

      {/* Views */}
      {viewMode === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {briefs?.length === 0 ? (
            <Card className="col-span-full border-dashed">
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="font-semibold mb-2">No briefs yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first campaign or lifecycle brief to get started.
                </p>
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Brief
                </Button>
              </CardContent>
            </Card>
          ) : (
            briefs?.map(brief => (
              <BriefCard key={brief.id} brief={brief} onClick={() => handleBriefClick(brief)} />
            ))
          )}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-2">
          {briefs?.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No briefs yet</p>
          ) : (
            briefs?.map(brief => (
              <BriefListItem key={brief.id} brief={brief} onClick={() => handleBriefClick(brief)} />
            ))
          )}
        </div>
      )}

      {viewMode === 'calendar' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {format(calendarMonth, 'MMMM yyyy')}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
                  ←
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCalendarMonth(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
                  →
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-background p-2 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {/* Offset for first day */}
              {Array.from({ length: calendarDays[0].getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-background p-2 min-h-[100px]" />
              ))}
              {/* Calendar days */}
              {calendarDays.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayBriefs = briefsByDate.get(dateKey) || [];
                
                return (
                  <div
                    key={dateKey}
                    className={cn(
                      "bg-background p-2 min-h-[100px] border-t",
                      isToday(day) && "bg-primary/5"
                    )}
                  >
                    <div className={cn(
                      "text-sm mb-1",
                      isToday(day) && "font-bold text-primary"
                    )}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayBriefs.slice(0, 2).map(brief => (
                        <div
                          key={brief.id}
                          className={cn(
                            "text-xs p-1 rounded truncate cursor-pointer hover:opacity-80",
                            brief.content_type === 'campaign' ? 'bg-blue-500/20 text-blue-700' : 'bg-purple-500/20 text-purple-700'
                          )}
                          onClick={() => handleBriefClick(brief)}
                          title={brief.name}
                        >
                          {brief.name}
                        </div>
                      ))}
                      {dayBriefs.length > 2 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayBriefs.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks Section */}
      <TasksSection />

      {/* Create Brief Modal */}
      <CreateBriefDialog
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        segments={starredSegments}
        onSuccess={() => {
          refetch();
          setCreateModalOpen(false);
        }}
      />

      {/* Brief Detail Modal */}
      {client?.id && (
        <BriefDetailModal
          brief={selectedBrief}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          clientId={client.id}
          onUpdate={() => refetch()}
        />
      )}
    </div>
  );
}

// Brief Card Component
function BriefCard({ brief, onClick }: { brief: Brief; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[brief.status];
  const currentStepIndex = PROGRESS_STEPS.findIndex(s => s.id === brief.status);

  return (
    <Card 
      className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div className={cn(
        "h-1",
        brief.content_type === 'campaign' ? 'bg-blue-500' : 'bg-purple-500'
      )} />
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {brief.content_type === 'campaign' ? (
                <Zap className="h-4 w-4 text-blue-500" />
              ) : (
                <Workflow className="h-4 w-4 text-purple-500" />
              )}
              <Badge variant="outline" className="text-xs capitalize">
                {brief.content_type}
              </Badge>
            </div>
            <h3 className="font-medium line-clamp-2">{brief.name}</h3>
          </div>
          <Badge className={cn("text-xs", statusConfig.color)}>
            {statusConfig.label}
          </Badge>
        </div>

        {/* Progress tracker */}
        <div className="flex items-center gap-1">
          {PROGRESS_STEPS.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "flex-1 h-1.5 rounded-full",
                i <= currentStepIndex ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {brief.deadline && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(brief.deadline), 'MMM d')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Brief List Item Component
function BriefListItem({ brief, onClick }: { brief: Brief; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[brief.status];

  return (
    <Card 
      className="hover:border-primary/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center",
            brief.content_type === 'campaign' ? 'bg-blue-500/10' : 'bg-purple-500/10'
          )}>
            {brief.content_type === 'campaign' ? (
              <Zap className="h-5 w-5 text-blue-500" />
            ) : (
              <Workflow className="h-5 w-5 text-purple-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{brief.name}</h3>
          </div>
          <div className="flex items-center gap-4">
            <Badge className={cn("text-xs", statusConfig.color)}>
              {statusConfig.label}
            </Badge>
            {brief.deadline && (
              <span className="text-sm text-muted-foreground">
                {format(new Date(brief.deadline), 'MMM d')}
              </span>
            )}
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Create Brief Dialog
function CreateBriefDialog({
  open,
  onOpenChange,
  segments,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segments: Segment[];
  onSuccess: () => void;
}) {
  const { data: client } = useLinktreeClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const [formData, setFormData] = useState({
    contentType: 'campaign' as ContentType,
    channels: [] as Channel[],
    name: '',
    deadline: undefined as Date | undefined,
    about: '',
    segmentId: '',
    csvFile: null as File | null,
    templateIds: [] as string[],
  });

  const resetForm = () => {
    setStep(1);
    setFormData({
      contentType: 'campaign',
      channels: [],
      name: '',
      deadline: undefined,
      about: '',
      segmentId: '',
      csvFile: null,
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
      toast({ title: 'Add a description first', variant: 'destructive' });
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
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Create the brief (no conversation link)
      const { error: briefError } = await supabase
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
        });

      if (briefError) throw briefError;

      toast({ title: 'Brief created!' });
      handleClose();
      onSuccess();

    } catch (err: any) {
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
              {step === 1 ? 'Choose content type and channels' : 'Fill in brief details'}
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="flex items-center gap-2 px-1">
            <div className={cn("h-1.5 flex-1 rounded-full", step >= 1 ? "bg-primary" : "bg-muted")} />
            <div className={cn("h-1.5 flex-1 rounded-full", step >= 2 ? "bg-primary" : "bg-muted")} />
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-6">
            {step === 1 && (
              <>
                {/* Content Type */}
                <div className="space-y-3">
                  <Label>Content Type</Label>
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
                      <span className="text-xs text-muted-foreground">Single-send or triggered</span>
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
                      <span className="text-xs text-muted-foreground">Multi-touch journey</span>
                    </button>
                  </div>
                </div>

                {/* Channels */}
                <div className="space-y-3">
                  <Label>Channels</Label>
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
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                {/* Name */}
                <div className="space-y-2">
                  <Label>Campaign Name *</Label>
                  <Input
                    placeholder="e.g., Welcome Series, Black Friday Promo"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                {/* Audience Selection */}
                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={formData.segmentId} onValueChange={(v) => setFormData(prev => ({ ...prev, segmentId: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a segment" />
                      </SelectTrigger>
                      <SelectContent>
                        {segments.length === 0 ? (
                          <SelectItem value="none" disabled>No starred segments</SelectItem>
                        ) : (
                          segments.map(seg => (
                            <SelectItem key={seg.id} value={seg.id}>{seg.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="relative">
                      <Input
                        type="file"
                        accept=".csv"
                        className="opacity-0 absolute inset-0 cursor-pointer"
                        onChange={(e) => setFormData(prev => ({ ...prev, csvFile: e.target.files?.[0] || null }))}
                      />
                      <Button variant="outline" className="w-full pointer-events-none">
                        <Upload className="h-4 w-4 mr-2" />
                        {formData.csvFile ? formData.csvFile.name : 'Upload CSV'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Deadline */}
                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left", !formData.deadline && "text-muted-foreground")}
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
                    <Label>About</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAiAssist}
                      disabled={aiLoading || !formData.about.trim()}
                      className="text-xs h-7"
                    >
                      {aiLoading ? <LoadingSpinner size="sm" className="mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      AI Enhance
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Describe the goal, audience, and key messages..."
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
                    {formData.templateIds.length > 0 ? `${formData.templateIds.length} template(s) selected` : 'Browse templates'}
                    <ChevronRight className="ml-auto h-4 w-4" />
                  </Button>
                </div>

                {/* Summary badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Channels:</span>
                  {formData.channels.map(ch => (
                    <Badge key={ch} variant="secondary" className="capitalize">{ch}</Badge>
                  ))}
                  <Badge variant="outline" className="capitalize">{formData.contentType}</Badge>
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
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={handleSubmit} disabled={loading || !canSubmit}>
                  {loading ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                  Create Brief
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TemplatePickerModal
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        contentType={formData.contentType}
        channels={formData.channels}
        selectedIds={formData.templateIds}
        onSelect={(ids) => setFormData(prev => ({ ...prev, templateIds: ids }))}
      />
    </>
  );
}
