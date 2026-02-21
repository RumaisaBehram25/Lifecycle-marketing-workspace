import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDoubleGoodClient, useDoubleGoodPlatforms } from '@/hooks/useDoubleGoodClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
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
  Search, 
  Mail, 
  Smartphone, 
  Bell, 
  ArrowRight, 
  Sparkles,
  TrendingUp,
  Gift,
  Heart,
  Zap,
  Calendar,
  ChevronRight,
  LayoutGrid,
  List,
  Workflow,
  Pencil,
  Check,
  X,
  Users,
  Timer,
  GitBranch,
  Filter,
  ShoppingCart,
  Star,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { parseCampaignTaxonomy, getChannelColor, getTypeColor } from '@/lib/campaign-taxonomy';
import { HorizontalFlowChart } from '@/components/creative/HorizontalFlowChart';
import { BRCGIcon } from '@/components/BRCGLogo';

// Type definitions
interface CanvasStep {
  id: string;
  name: string;
  type: string;
  channel?: string;
  delay_seconds?: number;
  delay_formatted?: string;
  next_step_ids: string[];
  next_paths?: Array<{ name: string; next_step_id: string; percentage?: number }>;
  messages?: Array<{
    channel: string;
    subject?: string;
    preheader?: string;
    title?: string;
    body?: string;
    html_content?: string;
    image_url?: string;
    buttons?: Array<{ text: string; action?: string; url?: string }>;
  }>;
}

interface CanvasVariant {
  name: string;
  percentage: number;
  first_step_id: string | null;
}

interface BrazeSchemaCache {
  canvases?: any[];
  last_sync?: string;
}

// Mock data – generic copy, BRCG branded
const MOCK_JOURNEYS: Array<{
  id: string;
  name: string;
  displayName: string;
  description: string;
  status: 'active' | 'draft';
  tags: string[];
  channels: string[];
  taxonomy: { type: 'lifecycle'; channel: string; displayName: string; dateString: string };
  variants: CanvasVariant[];
  steps: Record<string, CanvasStep>;
  total_steps: number;
  first_entry?: string;
  last_entry?: string;
}> = [
  {
    id: 'welcome',
    name: 'Welcome Series',
    displayName: 'Welcome Series',
    description: 'Onboard new users and drive first actions',
    status: 'active',
    last_entry: new Date().toISOString(),
    tags: [],
    channels: ['email', 'push'],
    taxonomy: { type: 'lifecycle', channel: 'email', displayName: 'Welcome Series', dateString: '' },
    variants: [
      { name: 'Main Path', percentage: 100, first_step_id: 'step1' }
    ],
    steps: {
      'step1': { id: 'step1', name: 'Welcome Email', type: 'message', channel: 'email', delay_formatted: '0h', next_step_ids: ['delay1'], messages: [{ channel: 'email', subject: 'Welcome! Here\'s how to get started', preheader: 'Your journey starts here', body: 'Get started with your first experience' }] },
      'delay1': { id: 'delay1', name: 'Wait 24 hours', type: 'delay', delay_seconds: 86400, delay_formatted: '24h', next_step_ids: ['step2'], messages: [] },
      'step2': { id: 'step2', name: 'Getting Started Push', type: 'message', channel: 'push', delay_formatted: '24h', next_step_ids: ['split1'], messages: [{ channel: 'push', title: 'Complete your profile', body: 'Finish setting up to unlock all features' }] },
      'split1': { id: 'split1', name: 'Completed Profile?', type: 'decision_split', next_step_ids: ['step3', 'step3b'], next_paths: [{ name: 'Yes – Completed', next_step_id: 'step3', percentage: 65 }, { name: 'No – Incomplete', next_step_id: 'step3b', percentage: 35 }], messages: [] },
      'step3': { id: 'step3', name: 'Tips & Best Practices', type: 'message', channel: 'email', delay_formatted: '48h', next_step_ids: ['delay2'], messages: [{ channel: 'email', subject: 'Tips to get the most out of your account', preheader: 'Best practices inside', body: 'Learn how successful users maximize their results' }] },
      'step3b': { id: 'step3b', name: 'Profile Reminder', type: 'message', channel: 'email', delay_formatted: '48h', next_step_ids: ['delay2'], messages: [{ channel: 'email', subject: 'Complete your profile to unlock all features', preheader: 'It only takes 2 minutes', body: 'You\'re almost there — finish setting up your profile' }] },
      'delay2': { id: 'delay2', name: 'Wait 3 days', type: 'delay', delay_seconds: 259200, delay_formatted: '3d', next_step_ids: ['step4'], messages: [] },
      'step4': { id: 'step4', name: 'Engagement Nudge', type: 'message', channel: 'push', delay_formatted: '72h', next_step_ids: [], messages: [{ channel: 'push', title: 'Don\'t miss out!', body: 'Check out what\'s new since you joined' }] },
    },
    total_steps: 5,
  },
  {
    id: 're-engagement',
    name: 'Re-engagement',
    displayName: 'Re-engagement',
    description: 'Win back inactive users',
    status: 'active',
    last_entry: new Date().toISOString(),
    tags: [],
    channels: ['email', 'push', 'in_app_message'],
    taxonomy: { type: 'lifecycle', channel: 'email', displayName: 'Re-engagement', dateString: '' },
    variants: [
      { name: 'Main Path', percentage: 100, first_step_id: 'step1' }
    ],
    steps: {
      'step1': { id: 'step1', name: 'We Miss You Email', type: 'message', channel: 'email', delay_formatted: '0h', next_step_ids: ['delay1'], messages: [{ channel: 'email', subject: 'It\'s been a while — come see what\'s new', preheader: 'We\'ve got updates for you', body: 'Check out the latest features and content' }] },
      'delay1': { id: 'delay1', name: 'Wait 3 days', type: 'delay', delay_seconds: 259200, delay_formatted: '3d', next_step_ids: ['split1'], messages: [] },
      'split1': { id: 'split1', name: 'Opened Email?', type: 'decision_split', next_step_ids: ['step2', 'step2b'], next_paths: [{ name: 'Opened', next_step_id: 'step2', percentage: 40 }, { name: 'Did Not Open', next_step_id: 'step2b', percentage: 60 }], messages: [] },
      'step2': { id: 'step2', name: 'In-App Welcome Back', type: 'message', channel: 'in_app_message', delay_formatted: '3d', next_step_ids: ['delay2'], messages: [{ channel: 'in_app_message', title: 'Welcome back!', body: 'Here\'s what you\'ve missed', buttons: [{ text: 'Explore Now' }] }] },
      'step2b': { id: 'step2b', name: 'Reminder Push', type: 'message', channel: 'push', delay_formatted: '3d', next_step_ids: ['delay2'], messages: [{ channel: 'push', title: 'We have updates for you', body: 'Check out what\'s new' }] },
      'delay2': { id: 'delay2', name: 'Wait 7 days', type: 'delay', delay_seconds: 604800, delay_formatted: '7d', next_step_ids: ['step3'], messages: [] },
      'step3': { id: 'step3', name: 'Social Proof Email', type: 'message', channel: 'email', delay_formatted: '7d', next_step_ids: ['delay3'], messages: [{ channel: 'email', subject: 'See how others are succeeding', preheader: 'Real results from real users', body: 'Get inspired by success stories' }] },
      'delay3': { id: 'delay3', name: 'Wait 7 days', type: 'delay', delay_seconds: 604800, delay_formatted: '7d', next_step_ids: ['step4'], messages: [] },
      'step4': { id: 'step4', name: 'Final Nudge', type: 'message', channel: 'push', delay_formatted: '14d', next_step_ids: [], messages: [{ channel: 'push', title: 'Last chance!', body: 'Don\'t miss out on what\'s waiting for you' }] },
    },
    total_steps: 5,
  },
  {
    id: 'post-purchase',
    name: 'Post-Purchase Follow Up',
    displayName: 'Post-Purchase Follow Up',
    description: 'Delight customers after their first purchase',
    status: 'active',
    last_entry: new Date().toISOString(),
    tags: [],
    channels: ['email', 'push'],
    taxonomy: { type: 'lifecycle', channel: 'email', displayName: 'Post-Purchase Follow Up', dateString: '' },
    variants: [
      { name: 'Main Path', percentage: 100, first_step_id: 'step1' }
    ],
    steps: {
      'step1': { id: 'step1', name: 'Order Confirmation', type: 'message', channel: 'email', delay_formatted: '0h', next_step_ids: ['delay1'], messages: [{ channel: 'email', subject: 'Your order is confirmed!', preheader: 'Thanks for your purchase', body: 'We\'re getting your order ready.' }] },
      'delay1': { id: 'delay1', name: 'Wait 3 days', type: 'delay', delay_seconds: 259200, delay_formatted: '3d', next_step_ids: ['step2'], messages: [] },
      'step2': { id: 'step2', name: 'How\'s Your Order?', type: 'message', channel: 'email', delay_formatted: '3d', next_step_ids: ['delay2'], messages: [{ channel: 'email', subject: 'How are you enjoying your purchase?', preheader: 'We\'d love to hear from you', body: 'Leave a review and let us know how it\'s going.' }] },
      'delay2': { id: 'delay2', name: 'Wait 7 days', type: 'delay', delay_seconds: 604800, delay_formatted: '7d', next_step_ids: ['split1'], messages: [] },
      'split1': { id: 'split1', name: 'Left Review?', type: 'audience_paths', next_step_ids: ['step3', 'step3b'], next_paths: [{ name: 'Reviewed', next_step_id: 'step3', percentage: 30 }, { name: 'No Review', next_step_id: 'step3b', percentage: 70 }], messages: [] },
      'step3': { id: 'step3', name: 'Thank You + Referral', type: 'message', channel: 'email', delay_formatted: '10d', next_step_ids: [], messages: [{ channel: 'email', subject: 'Thanks for your review! Share with friends', preheader: 'Earn rewards by referring', body: 'Share your experience and earn rewards.' }] },
      'step3b': { id: 'step3b', name: 'Review Reminder Push', type: 'message', channel: 'push', delay_formatted: '10d', next_step_ids: [], messages: [{ channel: 'push', title: 'How\'s your order?', body: 'Share your experience with a quick review' }] },
    },
    total_steps: 4,
  },
  {
    id: 'milestone',
    name: 'Milestone Celebration',
    displayName: 'Milestone Celebration',
    description: 'Celebrate user milestones and anniversaries',
    status: 'draft',
    last_entry: new Date().toISOString(),
    tags: [],
    channels: ['email', 'push', 'in_app_message'],
    taxonomy: { type: 'lifecycle', channel: 'email', displayName: 'Milestone Celebration', dateString: '' },
    variants: [
      { name: 'Main Path', percentage: 100, first_step_id: 'step1' }
    ],
    steps: {
      'step1': { id: 'step1', name: 'Milestone Email', type: 'message', channel: 'email', delay_formatted: '0h', next_step_ids: ['delay1'], messages: [{ channel: 'email', subject: '🎉 You\'ve reached a milestone!', preheader: 'Celebrate your achievement', body: 'Congratulations on your milestone! Here\'s a special reward.' }] },
      'delay1': { id: 'delay1', name: 'Wait 1 day', type: 'delay', delay_seconds: 86400, delay_formatted: '24h', next_step_ids: ['step2'], messages: [] },
      'step2': { id: 'step2', name: 'In-App Celebration', type: 'message', channel: 'in_app_message', delay_formatted: '24h', next_step_ids: ['delay2'], messages: [{ channel: 'in_app_message', title: 'You\'re amazing!', body: 'Celebrate your milestone and claim your reward', buttons: [{ text: 'Claim Reward' }] }] },
      'delay2': { id: 'delay2', name: 'Wait 2 days', type: 'delay', delay_seconds: 172800, delay_formatted: '2d', next_step_ids: ['step3'], messages: [] },
      'step3': { id: 'step3', name: 'Share Push', type: 'message', channel: 'push', delay_formatted: '3d', next_step_ids: [], messages: [{ channel: 'push', title: 'Share your milestone!', body: 'Let your friends know about your achievement' }] },
    },
    total_steps: 3,
  },
];

// Helper to count only message steps
function countMessageSteps(steps?: Record<string, CanvasStep>): number {
  if (!steps) return 0;
  return Object.values(steps).filter((s) => {
    const type = s.type?.toLowerCase() || 'message';
    const channel = (s.channel || '').toLowerCase();
    if (['delay', 'wait', 'decision_split', 'branch', 'filter', 'audience_paths', 'action_paths', 'experiment_paths', 'webhook'].includes(type)) return false;
    return channel.includes('email') || channel.includes('push') || channel.includes('in_app') || channel.includes('in-app') || channel.includes('sms') || type === 'message';
  }).length;
}

export default function Lifecycle() {
  const { data: client } = useDoubleGoodClient();
  const { data: platforms } = useDoubleGoodPlatforms();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [launchDateFilter, setLaunchDateFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedJourney, setSelectedJourney] = useState<any>(null);
  const [selectedTouchpoint, setSelectedTouchpoint] = useState<any>(null);

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeJsonCache = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;

  // Fetch canvases from normalized table
  const { data: normalizedCanvases } = useQuery({
    queryKey: ['braze_canvases', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('braze_canvases')
        .select('*')
        .eq('client_id', client.id)
        .eq('archived', false)
        .eq('draft', false)
        .eq('enabled', true)
        .order('entries_last_60d', { ascending: false, nullsFirst: false })
        .order('last_entry', { ascending: false, nullsFirst: true })
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!client?.id,
  });

  // Fetch visibility settings
  const { data: visibilityData } = useQuery({
    queryKey: ['data-visibility-canvas', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', client.id)
        .eq('item_type', 'canvas');
      if (error) throw error;
      return data as Array<{ item_id: string; is_visible: boolean }>;
    },
    enabled: !!client?.id,
  });

  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    visibilityData?.forEach(v => map.set(v.item_id, v.is_visible));
    return map;
  }, [visibilityData]);

  // Transform canvases to journey format
  const journeys = useMemo(() => {
    const rawSource: unknown[] = normalizedCanvases?.length
      ? normalizedCanvases
      : (brazeJsonCache?.canvases?.filter((c: any) => !c.archived && !c.draft && c.enabled) || []);

    if (rawSource.length === 0) return MOCK_JOURNEYS;

    return rawSource.map((canvasRaw) => {
      const canvas = canvasRaw as Record<string, unknown>;
      const name = (canvas.name as string) ?? '';
      const taxonomy = parseCampaignTaxonomy(name);
      const stepsRecord = ((canvas.raw_steps ?? canvas.steps ?? {}) as Record<string, CanvasStep>);
      const stepsList = Object.values(stepsRecord);

      let inferredChannels: string[] = [];
      if (stepsList.length > 0) {
        const channels = stepsList.filter((s): s is CanvasStep => typeof s?.channel === 'string').map(s => s.channel as string);
        inferredChannels = [...new Set(channels)];
      }
      if (inferredChannels.length === 0) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('email') || taxonomy.channel === 'email') inferredChannels.push('email');
        if (nameLower.includes('push')) inferredChannels.push('push');
        if (nameLower.includes('sms')) inferredChannels.push('sms');
        if (nameLower.includes('in-app') || nameLower.includes('in_app')) inferredChannels.push('in_app_message');
        if (inferredChannels.length === 0) inferredChannels.push('email');
      }

      const messageStepCount = stepsList.filter((s): s is CanvasStep => {
        const type = ((s.type as string) ?? 'message').toLowerCase();
        const channel = ((s.channel as string) ?? '').toLowerCase();
        if (['delay', 'wait', 'decision_split', 'branch', 'filter', 'audience_paths', 'action_paths', 'experiment_paths', 'webhook'].includes(type)) return false;
        return channel.includes('email') || channel.includes('push') || channel.includes('in_app') || channel.includes('in-app') || channel.includes('sms') || type === 'message';
      }).length;

      const canvasId = (canvas.braze_canvas_id ?? canvas.id ?? '') as string;

      return {
        id: canvasId,
        name,
        displayName: taxonomy.displayName,
        description: (canvas.description as string | undefined) || 'Automated lifecycle journey',
        status: 'active' as const,
        tags: (canvas.tags as string[] | undefined) || [],
        channels: inferredChannels,
        first_entry: canvas.first_entry as string | undefined,
        last_entry: canvas.last_entry as string | undefined,
        taxonomy: { ...taxonomy, type: 'lifecycle' as const },
        variants: ((canvas.raw_variants ?? canvas.variants ?? []) as CanvasVariant[]),
        steps: stepsRecord,
        total_steps: messageStepCount,
        entry_type: canvas.entry_type as string | undefined,
        entry_segment_name: canvas.entry_segment_name as string | undefined,
        trigger_event_name: canvas.trigger_event_name as string | undefined,
        exception_events: canvas.exception_events as string[] | undefined,
        conversion_events: canvas.conversion_events,
        entry_filters: canvas.entry_filters,
        entries_last_30d: canvas.entries_last_30d as number | undefined,
        entries_last_60d: canvas.entries_last_60d as number | undefined,
      };
    });
  }, [normalizedCanvases, brazeJsonCache?.canvases]);

  const isItemVisible = (canvasId: string) => {
    const explicitSetting = visibilityMap.get(canvasId);
    if (explicitSetting !== undefined) return explicitSetting;
    return true;
  };

  // Filter journeys
  const filteredJourneys = useMemo(() => {
    return journeys.filter(journey => {
      if (!isItemVisible(journey.id)) return false;

      const matchesSearch = journey.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           journey.description?.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesChannel = true;
      if (channelFilter !== 'All') {
        matchesChannel = journey.channels?.some(ch => {
          const normalizedCh = ch.toLowerCase().replace(/[-_]/g, '');
          const normalizedFilter = channelFilter.toLowerCase().replace(/[-_]/g, '');
          return normalizedCh === normalizedFilter || normalizedCh.includes(normalizedFilter) || normalizedFilter.includes(normalizedCh);
        }) || false;
      }

      let matchesLaunchDate = true;
      if (launchDateFilter !== 'All') {
        if (!journey.first_entry) {
          matchesLaunchDate = false;
        } else {
          const launchDate = new Date(journey.first_entry);
          const daysDiff = Math.floor((Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24));
          if (launchDateFilter === '7days') matchesLaunchDate = daysDiff <= 7;
          else if (launchDateFilter === '30days') matchesLaunchDate = daysDiff <= 30;
          else if (launchDateFilter === '90days') matchesLaunchDate = daysDiff <= 90;
        }
      }

      return matchesSearch && matchesChannel && matchesLaunchDate;
    }).sort((a, b) => {
      const aEntries = (a as any).entries_last_60d ?? 0;
      const bEntries = (b as any).entries_last_60d ?? 0;
      return bEntries - aEntries;
    });
  }, [journeys, searchQuery, channelFilter, launchDateFilter, visibilityMap]);

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Lifecycle"
          description="Browse multi-touch lifecycle journeys and automated flows"
          actions={
            <Button asChild>
              <Link to="/chat">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate New
              </Link>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search journeys..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="inapp">In-App</SelectItem>
              </SelectContent>
            </Select>

            <Select value={launchDateFilter} onValueChange={setLaunchDateFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Launched" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">Any time</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Journeys Grid/List */}
        {selectedJourney ? (
          <JourneyDetail 
            journey={selectedJourney} 
            onBack={() => setSelectedJourney(null)}
            onViewTouchpoint={(step: any) => setSelectedTouchpoint(step)}
          />
        ) : (
          <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {filteredJourneys.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Workflow className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No journeys found</p>
              </div>
            ) : (
              filteredJourneys.map(journey => (
                <JourneyCard 
                  key={journey.id} 
                  journey={journey} 
                  viewMode={viewMode}
                  onClick={() => setSelectedJourney(journey)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Touchpoint Creative Modal */}
      <Dialog open={!!selectedTouchpoint} onOpenChange={() => setSelectedTouchpoint(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChannelIcon channel={selectedTouchpoint?.channel || 'email'} size="lg" />
              {selectedTouchpoint?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTouchpoint?.channel === 'email' ? 'Email creative preview' :
               selectedTouchpoint?.channel === 'push' ? 'Push notification preview' :
               selectedTouchpoint?.channel?.includes('in_app') || selectedTouchpoint?.channel?.includes('in-app') ? 'In-app message preview' :
               'Message preview'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTouchpoint && (() => {
            const messages = selectedTouchpoint.messages || [];
            const channel = (selectedTouchpoint.channel || 'email').toLowerCase();
            const message = messages.find((m: any) => m.channel?.toLowerCase().includes(channel.split('_')[0])) || messages[0];
            
            return (
              <div className="space-y-4 mt-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={getChannelColor(selectedTouchpoint.channel)}>
                    {selectedTouchpoint.channel === 'in_app_message' || selectedTouchpoint.channel === 'trigger_in_app_message' 
                      ? 'In-App' 
                      : selectedTouchpoint.channel}
                  </Badge>
                  {selectedTouchpoint.delay && (
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="h-3 w-3" />
                      {selectedTouchpoint.delay}
                    </Badge>
                  )}
                </div>

                {/* Email preview */}
                {channel === 'email' && (
                  <div className="space-y-3">
                    {(message?.subject || selectedTouchpoint.subject) && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Subject Line</p>
                        <p className="font-medium">{message?.subject || selectedTouchpoint.subject}</p>
                        {(message?.preheader || selectedTouchpoint.preheader) && (
                          <p className="text-sm text-muted-foreground mt-1">{message?.preheader || selectedTouchpoint.preheader}</p>
                        )}
                      </div>
                    )}
                    {(message?.html_content || selectedTouchpoint.html_content || selectedTouchpoint.html_preview) ? (
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe
                          srcDoc={message?.html_content || selectedTouchpoint.html_content || selectedTouchpoint.html_preview}
                          className="w-full h-[600px]"
                          title="Email Preview"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    ) : message?.body ? (
                      <div className="p-4 border rounded-lg bg-card">
                        <p className="text-sm">{message.body}</p>
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-muted/20 rounded-lg border border-dashed">
                        <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Email preview not available</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Push preview */}
                {(channel === 'push' || channel.includes('push')) && (
                  <div className="space-y-3">
                    <div className="max-w-sm mx-auto">
                      <div className="bg-card border rounded-2xl p-4 shadow-lg">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                            <BRCGIcon className="h-5 w-5 text-primary-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">BRCG • now</p>
                            <p className="font-semibold text-sm mt-0.5">
                              {message?.title || selectedTouchpoint.title || selectedTouchpoint.name}
                            </p>
                            {(message?.body || selectedTouchpoint.body) && (
                              <p className="text-sm text-muted-foreground line-clamp-3 mt-1">
                                {message?.body || selectedTouchpoint.body}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-center text-muted-foreground mt-3">Push notification preview</p>
                    </div>
                  </div>
                )}

                {/* In-app message preview */}
                {(channel === 'in_app_message' || channel.includes('in_app') || channel.includes('in-app') || channel === 'trigger_in_app_message') && (
                  <div className="space-y-3">
                    {(() => {
                      const bodyContent = message?.body || selectedTouchpoint.body || '';
                      const isHtmlBody = bodyContent.trim().startsWith('<!doctype') || bodyContent.trim().startsWith('<html') || bodyContent.includes('<div');
                      
                      if (isHtmlBody) {
                        return (
                          <div className="border rounded-lg overflow-hidden bg-white">
                            <iframe srcDoc={bodyContent} className="w-full h-[600px]" title="In-App Message Preview" sandbox="allow-same-origin" />
                          </div>
                        );
                      }
                      
                      return (
                        <div className="max-w-sm mx-auto">
                          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-2xl p-6 text-center">
                            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                              <Smartphone className="h-6 w-6 text-primary" />
                            </div>
                            <h4 className="font-bold text-lg">
                              {message?.title || selectedTouchpoint.title || selectedTouchpoint.name}
                            </h4>
                            {bodyContent && <p className="text-sm text-muted-foreground mt-2">{bodyContent}</p>}
                            <Button className="mt-4" size="sm">
                              {message?.buttons?.[0]?.text || 'Take Action'}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* SMS preview */}
                {channel === 'sms' && (
                  <div className="max-w-sm mx-auto">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
                      <p className="text-sm">{message?.body || selectedTouchpoint.body || 'SMS message content'}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// Journey Card Component
function JourneyCard({ journey, viewMode, onClick }: { journey: any; viewMode: 'grid' | 'list'; onClick: () => void }) {
  const getIcon = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome') || name.includes('onboard')) return Sparkles;
    if (name.includes('re-engage') || name.includes('winback') || name.includes('win-back')) return TrendingUp;
    if (name.includes('upgrade') || name.includes('upsell')) return Zap;
    if (name.includes('milestone') || name.includes('anniversary')) return Heart;
    if (name.includes('purchase') || name.includes('order')) return ShoppingCart;
    if (name.includes('feature') || name.includes('announce')) return Gift;
    return Workflow;
  };
  
  const getColor = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome')) return 'bg-emerald-500';
    if (name.includes('re-engage') || name.includes('win-back')) return 'bg-blue-500';
    if (name.includes('upgrade')) return 'bg-purple-500';
    if (name.includes('milestone')) return 'bg-pink-500';
    if (name.includes('purchase')) return 'bg-amber-500';
    return 'bg-primary';
  };

  const Icon = getIcon();
  const color = getColor();
  
  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium line-clamp-1">{journey.displayName || journey.name}</h3>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {[...new Set(journey.channels?.map((ch: string) => {
                  const normalized = ch.toLowerCase().replace(/[-_]/g, '');
                  if (normalized.includes('email')) return 'Email';
                  if (normalized.includes('push')) return 'Push';
                  if (normalized.includes('inapp')) return 'In-App';
                  if (normalized.includes('sms')) return 'SMS';
                  return null;
                }).filter(Boolean))]?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch.toLowerCase())}`}>{ch}</Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{journey.total_steps || countMessageSteps(journey.steps)} touches</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:border-primary/50 hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2 leading-tight">
              {journey.displayName || journey.name}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Workflow className="h-3.5 w-3.5" />
          <span>{journey.total_steps || countMessageSteps(journey.steps)} touchpoints</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[...new Set(journey.channels?.map((ch: string) => {
            const normalized = ch.toLowerCase().replace(/[-_]/g, '');
            if (normalized.includes('email')) return 'Email';
            if (normalized.includes('push')) return 'Push';
            if (normalized.includes('inapp')) return 'In-App';
            if (normalized.includes('sms')) return 'SMS';
            return null;
          }).filter(Boolean))]?.map((ch: string) => (
            <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch.toLowerCase())}`}>{ch}</Badge>
          ))}
        </div>

        <div className="flex items-center justify-end pt-3 border-t mt-3">
          <Button variant="ghost" size="sm" className="gap-1">
            View Journey
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function generateJourneyDescription(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('welcome') || lower.includes('onboard')) return 'Guides new users through their first experience and drives initial engagement.';
  if (lower.includes('re-engage') || lower.includes('winback') || lower.includes('win-back')) return 'Reactivates inactive users and brings them back to the platform.';
  if (lower.includes('upgrade') || lower.includes('upsell')) return 'Encourages users to upgrade to premium features or paid plans.';
  if (lower.includes('purchase') || lower.includes('order')) return 'Follows up after a purchase to build loyalty and drive repeat orders.';
  if (lower.includes('milestone')) return 'Celebrates user milestones and anniversaries to strengthen engagement.';
  return 'Automated multi-touch journey delivering targeted messages across channels.';
}

// Journey Detail Component
function JourneyDetail({ journey, onBack, onViewTouchpoint }: { journey: any; onBack: () => void; onViewTouchpoint: (step: any) => void }) {
  const [editableDescription, setEditableDescription] = useState<string>(
    journey.description && journey.description !== 'Automated lifecycle journey' ? journey.description : generateJourneyDescription(journey.name)
  );
  const [editableTrigger, setEditableTrigger] = useState<string>(journey.trigger_event_name || '');
  const [isEditingTrigger, setIsEditingTrigger] = useState(false);
  const [tempTrigger, setTempTrigger] = useState('');
  const [editableAudience, setEditableAudience] = useState<string>(journey.entry_segment_name || '');
  const [isEditingAudience, setIsEditingAudience] = useState(false);
  const [tempAudience, setTempAudience] = useState('');
  
  const getIcon = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome')) return Sparkles;
    if (name.includes('re-engage') || name.includes('win-back')) return TrendingUp;
    if (name.includes('upgrade')) return Zap;
    if (name.includes('purchase')) return ShoppingCart;
    if (name.includes('milestone')) return Heart;
    return Workflow;
  };
  
  const getColor = () => {
    const name = journey.name.toLowerCase();
    if (name.includes('welcome')) return 'bg-emerald-500';
    if (name.includes('re-engage') || name.includes('win-back')) return 'bg-blue-500';
    if (name.includes('upgrade')) return 'bg-purple-500';
    if (name.includes('purchase')) return 'bg-amber-500';
    if (name.includes('milestone')) return 'bg-pink-500';
    return 'bg-primary';
  };

  const Icon = getIcon();
  const color = getColor();

  const stepsList = journey.steps ? Object.values(journey.steps) : [];
  const messageStepCount = countMessageSteps(journey.steps);
  const channelCounts = stepsList.reduce((acc: Record<string, number>, step: any) => {
    const type = step.type?.toLowerCase() || 'message';
    if (['delay', 'wait', 'decision_split', 'branch', 'filter', 'audience_paths', 'action_paths', 'experiment_paths', 'webhook'].includes(type)) return acc;
    const ch = step.channel || 'email';
    acc[ch] = (acc[ch] || 0) + 1;
    return acc;
  }, {});

  const getEntryType = (): string => {
    if (journey.entry_type) {
      const type = journey.entry_type.toLowerCase();
      if (type.includes('trigger') || type.includes('action')) return 'Trigger';
      if (type.includes('segment')) return 'Segment';
      if (type.includes('api')) return 'API';
      if (type.includes('schedule')) return 'Scheduled';
    }
    return 'Trigger';
  };

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 -ml-2">
        ← Back to Journeys
      </Button>

      <Card className="overflow-hidden">
        <div className={`h-2 ${color}`} />
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{journey.displayName || journey.name}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                {[...new Set(Object.keys(channelCounts).map((channel) => {
                  const normalized = channel.toLowerCase().replace(/[-_]/g, '');
                  if (normalized.includes('email')) return 'Email';
                  if (normalized.includes('push')) return 'Push';
                  if (normalized.includes('inapp')) return 'In-App';
                  if (normalized.includes('sms')) return 'SMS';
                  return null;
                }).filter(Boolean))]?.map((ch: string) => (
                  <Badge key={ch} variant="outline" className={`text-xs ${getChannelColor(ch.toLowerCase())}`}>{ch}</Badge>
                ))}
                <Badge variant="outline" className="text-xs">
                  {messageStepCount} touchpoint{messageStepCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </div>

          {/* TLDR Section */}
          <div className="bg-muted/30 rounded-lg p-4 mb-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge className="bg-primary/10 text-primary border-primary/30">{getEntryType()} Entry</Badge>
            </div>
            
            {/* Trigger Event */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-emerald-500" />
                <p className="text-xs font-medium text-muted-foreground">Trigger Event:</p>
              </div>
              {isEditingTrigger ? (
                <div className="flex items-center gap-2">
                  <Input value={tempTrigger} onChange={(e) => setTempTrigger(e.target.value)} placeholder="e.g., user_signed_up" className="h-8 text-sm flex-1" autoFocus />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditableTrigger(tempTrigger); setIsEditingTrigger(false); }}>
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingTrigger(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {editableTrigger ? (
                    <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 gap-1">
                      <Zap className="h-3 w-3" />{editableTrigger}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No trigger event set</span>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setTempTrigger(editableTrigger); setIsEditingTrigger(true); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>
            
            {/* Audience */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                <p className="text-xs font-medium text-muted-foreground">Audience / Segment:</p>
              </div>
              {isEditingAudience ? (
                <div className="flex items-center gap-2">
                  <Input value={tempAudience} onChange={(e) => setTempAudience(e.target.value)} placeholder="e.g., Active Users" className="h-8 text-sm flex-1" autoFocus />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditableAudience(tempAudience); setIsEditingAudience(false); }}>
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingAudience(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {editableAudience ? (
                    <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400 gap-1">
                      <Users className="h-3 w-3" />{editableAudience}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No audience defined</span>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setTempAudience(editableAudience); setIsEditingAudience(true); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>
            
            {journey.entry_filters?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Additional Filters:</p>
                <div className="flex flex-wrap gap-1.5">
                  {journey.entry_filters.slice(0, 5).map((filter: any, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400">
                      {filter.property || filter.type}{filter.comparator && ` ${filter.comparator}`}{filter.value && ` "${filter.value}"`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {journey.exception_events?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Exclusions:</p>
                <div className="flex flex-wrap gap-1.5">
                  {journey.exception_events.map((event: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400">{event}</Badge>
                  ))}
                </div>
              </div>
            )}
            
            {journey.conversion_events?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Conversion Goals:</p>
                <div className="flex flex-wrap gap-1.5">
                  {journey.conversion_events.map((cv: any, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400 gap-1">
                      <TrendingUp className="h-3 w-3" />{cv.name}{cv.window_seconds && ` (${Math.round(cv.window_seconds / 86400)}d window)`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {journey.description && journey.description !== 'Automated lifecycle journey' && (
              <p className="text-sm text-muted-foreground pt-1 border-t">{journey.description}</p>
            )}
          </div>

          {/* Flow Chart */}
          {journey.steps && Object.keys(journey.steps).length > 0 && (
            <HorizontalFlowChart
              canvas={{
                id: journey.id,
                name: journey.name,
                description: journey.description,
                enabled: true,
                draft: false,
                variants: journey.variants || [],
                steps: journey.steps,
                tags: journey.tags,
                first_entry: journey.first_entry,
                last_entry: journey.last_entry,
              }}
              onViewStep={(step) => onViewTouchpoint({ ...step, delay: step.delay_formatted })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Channel Icon Component
function ChannelIcon({ channel, size = 'sm' }: { channel: string; size?: 'sm' | 'lg' }) {
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  const normalizedChannel = channel.toLowerCase().replace('_', '-');
  switch (normalizedChannel) {
    case 'email': return <Mail className={`${iconSize} text-blue-500`} />;
    case 'push': case 'ios-push': case 'android-push': return <Bell className={`${iconSize} text-orange-500`} />;
    case 'in-app': case 'in-app-message': return <Smartphone className={`${iconSize} text-purple-500`} />;
    default: return <Mail className={`${iconSize} text-muted-foreground`} />;
  }
}
