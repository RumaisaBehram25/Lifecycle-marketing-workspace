import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Search, Zap, Tag, ChevronDown, ChevronUp, Database, Layers, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  aggregateCanvasTags,
  sortPrefixes,
  type CanvasTagRow,
  type AggregatedCanvasTag,
} from '@/lib/canvasTagTaxonomy';

interface PlatformSchema {
  id: string;
  name: string;
  schema_type: string;
  description: string | null;
  data_type: string | null;
  sample_values: unknown;
  metadata: Record<string, unknown> | null;
  last_seen_at: string | null;
  client_platform_id: string;
}

interface ConnectedPlatform {
  id: string | null;
  platform: string | null;
  schema_cache: unknown;
  is_connected: boolean | null;
  /** From `client_platforms_public.last_sync_at` when the integration last completed a sync. */
  last_sync_at?: string | null;
}

interface DisplayEvent {
  name: string;
  description: string;
  category: string;
  source: string;
  lastSeen?: string;
}

interface DisplayAttribute {
  name: string;
  type: string;
  description: string;
  category: string;
  source: string;
  sampleValues?: string[];
}

const typeColors: Record<string, string> = {
  string: 'bg-blue-500/20 text-blue-700',
  number: 'bg-purple-500/20 text-purple-700',
  integer: 'bg-purple-500/20 text-purple-700',
  float: 'bg-purple-500/20 text-purple-700',
  date: 'bg-orange-500/20 text-orange-700',
  boolean: 'bg-green-500/20 text-green-700',
};

type EventSortKey = 'name' | 'category' | 'source';
type AttrSortKey = 'name' | 'type' | 'category' | 'source';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function formatLocalDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** Clarifies that tables are populated from workspace syncs, not a vendor-exported catalog. */
function EventsWorkspaceDataBanner({ syncDetail }: { syncDetail: string | null }) {
  return (
    <Alert className="border-primary/20 bg-muted/30 text-left">
      <Info className="h-4 w-4" />
      <AlertTitle>Workspace data scope</AlertTitle>
      <AlertDescription className="text-sm mt-1 space-y-2">
        <p>This section reflects synced workspace data and is not a full vendor event catalog.</p>
        {syncDetail ? (
          <p className="text-xs text-muted-foreground">{syncDetail}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            After you run a platform or Braze sync, last-updated times from your workspace will show here when available.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

// Schema types that represent events/actions (for Klaviyo/Iterable)
const EVENT_SCHEMA_TYPES = new Set(['metric', 'event']);

interface BrazeCanvas {
  trigger_event_name: string | null;
  exception_events: string[] | null;
  conversion_events: unknown;
  entry_segment_name: string | null;
  entry_type: string | null;
  name: string;
  synced_at: string;
}

interface BrazeCampaign {
  segment: string | null;
  name: string;
  channel: string | null;
}

export function EventsAttributesTab() {
  const { clientId } = useResolvedClientId();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [resourceTab, setResourceTab] = useState<'events' | 'attributes' | 'canvas-tags'>('events');
  const [eventSort, setEventSort] = useState<{ key: EventSortKey; asc: boolean }>({ key: 'name', asc: true });
  const [attrSort, setAttrSort] = useState<{ key: AttrSortKey; asc: boolean }>({ key: 'name', asc: true });

  const { data: platforms = [], isLoading: platformsLoading } = useQuery({
    queryKey: ['client-platforms-for-schemas', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('*')
        .eq('client_id', clientId!);
      if (error) throw error;
      return data as ConnectedPlatform[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  const platformIds = useMemo(
    () => platforms.filter(p => p.is_connected && p.id).map(p => p.id as string),
    [platforms],
  );

  const { data: schemas = [], isLoading: schemasLoading } = useQuery({
    queryKey: ['platform-schemas-events-attrs', platformIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_schemas')
        .select('*')
        .in('client_platform_id', platformIds)
        .order('name', { ascending: true });
      if (error) throw error;
      return data as PlatformSchema[];
    },
    enabled: platformIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  // Braze stores events/segments in dedicated tables, not platform_schemas
  const { data: brazeCanvases = [], isLoading: canvasesLoading } = useQuery({
    queryKey: ['braze-canvases-schema', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('braze_canvases')
        .select('trigger_event_name, exception_events, conversion_events, entry_segment_name, entry_type, name, synced_at')
        .eq('client_id', clientId!)
        .limit(500);
      if (error) throw error;
      return (data || []) as BrazeCanvas[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  /** Canvas tag taxonomy from Braze `braze_canvases.tags` on synced rows. */
  const { data: canvasTagRows = [], isLoading: canvasTagsLoading } = useQuery({
    queryKey: ['braze-canvas-tags-taxonomy', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('braze_canvases')
        .select('name, tags')
        .eq('client_id', clientId!)
        .not('tags', 'is', null)
        .limit(8000);
      if (error) throw error;
      return (data || []) as CanvasTagRow[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: brazeCampaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['braze-campaigns-schema', clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from('braze_campaigns')
        .select('segment, name, channel')
        .eq('client_id', clientId!)
        .not('segment', 'is', null)
        .limit(500);
      if (error) throw error;
      return (data || []) as BrazeCampaign[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  const platformNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of platforms) {
      if (p.id) map.set(p.id, capitalize(p.platform || 'Unknown'));
    }
    return map;
  }, [platforms]);

  const canvasTagsByPrefix = useMemo(() => aggregateCanvasTags(canvasTagRows), [canvasTagRows]);

  const uniqueCanvasTagCount = useMemo(() => {
    let n = 0;
    for (const list of canvasTagsByPrefix.values()) n += list.length;
    return n;
  }, [canvasTagsByPrefix]);

  const filteredCanvasTagsByPrefix = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return canvasTagsByPrefix;
    const out = new Map<string, AggregatedCanvasTag[]>();
    for (const [prefix, tags] of canvasTagsByPrefix) {
      const hits = tags.filter(
        (t) =>
          t.fullTag.toLowerCase().includes(q) ||
          t.suffix.toLowerCase().includes(q) ||
          prefix.toLowerCase().includes(q) ||
          t.sampleCanvasNames.some((n) => n.toLowerCase().includes(q)),
      );
      if (hits.length > 0) out.set(prefix, hits);
    }
    return out;
  }, [canvasTagsByPrefix, searchQuery]);

  const sortedCanvasTagPrefixes = useMemo(
    () => sortPrefixes([...filteredCanvasTagsByPrefix.keys()]),
    [filteredCanvasTagsByPrefix],
  );

  const filteredCanvasTagTotal = useMemo(() => {
    let n = 0;
    for (const list of filteredCanvasTagsByPrefix.values()) n += list.length;
    return n;
  }, [filteredCanvasTagsByPrefix]);

  const allEvents = useMemo((): DisplayEvent[] => {
    const events: DisplayEvent[] = [];

    // From platform_schemas: Klaviyo metrics, Iterable events, etc.
    for (const s of schemas) {
      if (!EVENT_SCHEMA_TYPES.has(s.schema_type)) continue;
      const platformName = platformNameMap.get(s.client_platform_id) || 'Unknown';
      const meta = s.metadata as Record<string, Record<string, string>> | null;
      const integration = meta?.integration?.name;
      events.push({
        name: s.name,
        description: s.description || `${platformName} event: ${s.name}`,
        category: integration || capitalize(s.schema_type),
        source: platformName,
        lastSeen: s.last_seen_at || undefined,
      });
    }

    // From braze_canvases: trigger events, conversion events, exception events
    const seen = new Set<string>();
    for (const canvas of brazeCanvases) {
      // Trigger events
      if (canvas.trigger_event_name) {
        const key = `trigger:${canvas.trigger_event_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            name: canvas.trigger_event_name,
            description: `Trigger event used to start a Braze canvas`,
            category: 'Trigger',
            source: 'Braze',
            lastSeen: canvas.synced_at,
          });
        }
      }

      // Conversion events (stored as JSON array of { name, type, window_seconds })
      const convEvents = Array.isArray(canvas.conversion_events)
        ? (canvas.conversion_events as Array<Record<string, unknown>>)
        : [];
      for (const ce of convEvents) {
        const evName = String(ce.name ?? '').trim();
        if (!evName) continue;
        const key = `conversion:${evName}`;
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            name: evName,
            description: `Conversion event tracked in Braze canvases`,
            category: String(ce.type ?? 'Conversion'),
            source: 'Braze',
            lastSeen: canvas.synced_at,
          });
        }
      }

      // Exception events (stored as string[])
      for (const exName of canvas.exception_events ?? []) {
        const key = `exception:${exName}`;
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            name: exName,
            description: `Exception event that prevents canvas entry`,
            category: 'Exception',
            source: 'Braze',
            lastSeen: canvas.synced_at,
          });
        }
      }
    }

    return events;
  }, [schemas, brazeCanvases, platformNameMap]);

  const allAttributes = useMemo((): DisplayAttribute[] => {
    const attrs: DisplayAttribute[] = [];

    // From platform_schemas: entries with data_type (Klaviyo/Iterable user attributes)
    for (const s of schemas) {
      if (!s.data_type) continue;
      const platformName = platformNameMap.get(s.client_platform_id) || 'Unknown';
      const sampleVals = Array.isArray(s.sample_values)
        ? (s.sample_values as unknown[]).map(String).slice(0, 3)
        : undefined;
      attrs.push({
        name: s.name,
        type: s.data_type,
        description: s.description || s.name,
        category: capitalize(s.schema_type),
        source: platformName,
        sampleValues: sampleVals,
      });
    }

    // From braze_canvases: entry segments (unique audience segments used for canvas entry)
    const seenSegs = new Set<string>();
    for (const canvas of brazeCanvases) {
      if (canvas.entry_segment_name && !seenSegs.has(canvas.entry_segment_name)) {
        seenSegs.add(canvas.entry_segment_name);
        attrs.push({
          name: canvas.entry_segment_name,
          type: 'segment',
          description: `Audience segment used as canvas entry filter (${canvas.entry_type ?? 'segment'})`,
          category: 'Audience Segment',
          source: 'Braze',
        });
      }
    }

    // From braze_campaigns: unique segments used for campaign targeting
    for (const campaign of brazeCampaigns) {
      if (campaign.segment && !seenSegs.has(campaign.segment)) {
        seenSegs.add(campaign.segment);
        attrs.push({
          name: campaign.segment,
          type: 'segment',
          description: `Audience segment used for campaign targeting`,
          category: 'Audience Segment',
          source: 'Braze',
        });
      }
    }

    return attrs;
  }, [schemas, brazeCanvases, brazeCampaigns, platformNameMap]);

  const isLoading =
    platformsLoading ||
    (platformIds.length > 0 && schemasLoading) ||
    canvasesLoading ||
    campaignsLoading ||
    canvasTagsLoading;

  const hasPlatforms = platforms.some(p => p.is_connected);
  const hasData =
    schemas.length > 0 ||
    brazeCanvases.length > 0 ||
    brazeCampaigns.length > 0 ||
    uniqueCanvasTagCount > 0;

  const eventCategories = useMemo(() => [...new Set(allEvents.map(e => e.category))].sort(), [allEvents]);
  const attrCategories = useMemo(() => [...new Set(allAttributes.map(a => a.category))].sort(), [allAttributes]);
  const allCategories = useMemo(
    () => [...new Set([...eventCategories, ...attrCategories])].sort(),
    [eventCategories, attrCategories],
  );
  const uniqueSources = useMemo(
    () => [...new Set(platforms.filter(p => p.is_connected && p.platform).map(p => capitalize(p.platform!)))],
    [platforms],
  );

  /** Best-effort freshness from workspace tables (not real-time vendor APIs). */
  const syncDetailText = useMemo(() => {
    const connected = platforms.filter((p) => p.is_connected);
    const platformTimes = connected
      .map((p) => p.last_sync_at)
      .filter((t): t is string => Boolean(t));
    const latestPlatform =
      platformTimes.length > 0 ? platformTimes.reduce((a, b) => (a > b ? a : b)) : null;

    const schemaTimes = schemas.map((s) => s.last_seen_at).filter((t): t is string => Boolean(t));
    const latestSchema =
      schemaTimes.length > 0 ? schemaTimes.reduce((a, b) => (a > b ? a : b)) : null;

    const canvasTimes = brazeCanvases.map((c) => c.synced_at).filter(Boolean);
    const latestCanvas =
      canvasTimes.length > 0 ? canvasTimes.reduce((a, b) => (a > b ? a : b)) : null;

    const parts: string[] = [];
    if (latestPlatform) parts.push(`Platforms last synced: ${formatLocalDateTime(latestPlatform)}`);
    if (latestCanvas) parts.push(`Braze canvas snapshot: ${formatLocalDateTime(latestCanvas)}`);
    if (latestSchema) parts.push(`Integration schema last seen: ${formatLocalDateTime(latestSchema)}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [platforms, schemas, brazeCanvases]);

  const filteredEvents = useMemo(
    () =>
      allEvents
        .filter(
          e =>
            (e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              e.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
            (categoryFilter === 'All' || e.category === categoryFilter),
        )
        .sort((a, b) => {
          const mul = eventSort.asc ? 1 : -1;
          return mul * (a[eventSort.key] || '').localeCompare(b[eventSort.key] || '');
        }),
    [allEvents, searchQuery, categoryFilter, eventSort],
  );

  const filteredAttributes = useMemo(
    () =>
      allAttributes
        .filter(
          a =>
            (a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              a.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
            (categoryFilter === 'All' || a.category === categoryFilter),
        )
        .sort((a, b) => {
          const mul = attrSort.asc ? 1 : -1;
          return mul * (a[attrSort.key] || '').localeCompare(b[attrSort.key] || '');
        }),
    [allAttributes, searchQuery, categoryFilter, attrSort],
  );

  const handleEventSort = (key: EventSortKey) =>
    setEventSort(prev => ({ key, asc: prev.key === key ? !prev.asc : true }));

  const handleAttrSort = (key: AttrSortKey) =>
    setAttrSort(prev => ({ key, asc: prev.key === key ? !prev.asc : true }));

  const SortIcon = ({ active, asc }: { active: boolean; asc: boolean }) => {
    if (!active) return <ChevronDown className="inline h-3 w-3 ml-0.5 opacity-30" />;
    return asc ? <ChevronUp className="inline h-3 w-3 ml-0.5" /> : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!hasPlatforms) {
    return (
      <div className="min-w-0 space-y-6">
        <EventsWorkspaceDataBanner syncDetail={syncDetailText} />
        <div className="text-center py-16 space-y-3 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4">
          <Database className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="font-medium text-foreground">No connected platforms</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This tab reads from your workspace after you connect Braze or another integration under{' '}
            <span className="font-medium text-foreground">Settings → Platforms</span>. Until then, there is nothing to list — that
            is expected, not missing placeholder content.
          </p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="min-w-0 space-y-6">
        <EventsWorkspaceDataBanner syncDetail={syncDetailText} />
        <div className="text-center py-16 space-y-3 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4">
          <Database className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="font-medium text-foreground">No rows to display yet</p>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            You have connected platforms, but this view only shows data that has landed in{' '}
            <span className="font-medium text-foreground">platform_schemas</span>,{' '}
            <span className="font-medium text-foreground">braze_canvases</span>, and{' '}
            <span className="font-medium text-foreground">braze_campaigns</span>. Run a Braze / platform sync so triggers,
            segments, campaigns, and canvas <code className="rounded bg-muted px-1 py-0.5 text-[11px]">tags</code> sync into the
            database — empty tables here mean “not synced yet,” not sample placeholder rows.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <EventsWorkspaceDataBanner syncDetail={syncDetailText} />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{allEvents.length}</p>
            <p className="text-xs text-muted-foreground">Events Tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{allAttributes.length}</p>
            <p className="text-xs text-muted-foreground">User Attributes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{uniqueCanvasTagCount}</p>
            <p className="text-xs text-muted-foreground">Unique canvas tags</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{allCategories.length}</p>
            <p className="text-xs text-muted-foreground">Categories</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1 lg:col-span-1">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{uniqueSources.length}</p>
            <p className="text-xs text-muted-foreground">Data Sources</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              resourceTab === 'canvas-tags'
                ? 'Search tags or canvas names…'
                : 'Search events & attributes…'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {resourceTab !== 'canvas-tags' && allCategories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Categories</SelectItem>
              {allCategories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs value={resourceTab} onValueChange={(v) => setResourceTab(v as typeof resourceTab)} className="space-y-4">
        <TabsList className="h-auto min-h-10 flex-wrap gap-1">
          <TabsTrigger value="events" className="gap-2">
            <Zap className="h-4 w-4" />
            Events ({filteredEvents.length})
          </TabsTrigger>
          <TabsTrigger value="attributes" className="gap-2">
            <Tag className="h-4 w-4" />
            Attributes ({filteredAttributes.length})
          </TabsTrigger>
          <TabsTrigger value="canvas-tags" className="gap-2">
            <Layers className="h-4 w-4" />
            Canvas tags ({filteredCanvasTagTotal})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead
                        className="text-xs cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleEventSort('name')}
                      >
                        Event Name <SortIcon active={eventSort.key === 'name'} asc={eventSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleEventSort('category')}
                      >
                        Category <SortIcon active={eventSort.key === 'category'} asc={eventSort.asc} />
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleEventSort('source')}
                      >
                        Source <SortIcon active={eventSort.key === 'source'} asc={eventSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs">Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map(event => (
                      <TableRow key={`${event.source}-${event.name}`}>
                        <TableCell className="font-mono text-sm font-medium py-2.5">{event.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5 max-w-[240px]">
                          {event.description}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="text-xs">{event.category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5">{event.source}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5">
                          {event.lastSeen ? new Date(event.lastSeen).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredEvents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {searchQuery || categoryFilter !== 'All'
                            ? 'No events match your filter'
                            : 'No trigger or conversion events found. Run a Braze sync to populate.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attributes">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead
                        className="text-xs cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleAttrSort('name')}
                      >
                        Attribute <SortIcon active={attrSort.key === 'name'} asc={attrSort.asc} />
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleAttrSort('type')}
                      >
                        Type <SortIcon active={attrSort.key === 'type'} asc={attrSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleAttrSort('category')}
                      >
                        Category <SortIcon active={attrSort.key === 'category'} asc={attrSort.asc} />
                      </TableHead>
                      <TableHead className="text-xs">Sample Values</TableHead>
                      <TableHead
                        className="text-xs cursor-pointer select-none hover:text-foreground"
                        onClick={() => handleAttrSort('source')}
                      >
                        Source <SortIcon active={attrSort.key === 'source'} asc={attrSort.asc} />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttributes.map(attr => (
                      <TableRow key={`${attr.source}-${attr.name}`}>
                        <TableCell className="font-mono text-sm font-medium py-2.5">{attr.name}</TableCell>
                        <TableCell className="py-2.5">
                          <Badge className={cn('text-xs', typeColors[attr.type] || 'bg-muted text-muted-foreground')}>
                            {attr.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5 max-w-[200px]">
                          {attr.description}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="text-xs">{attr.category}</Badge>
                        </TableCell>
                        <TableCell className="py-2.5">
                          {attr.sampleValues?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {attr.sampleValues.slice(0, 3).map((v, i) => (
                                <code key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  {v}
                                </code>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5">{attr.source}</TableCell>
                      </TableRow>
                    ))}
                    {filteredAttributes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {searchQuery || categoryFilter !== 'All'
                            ? 'No attributes match your filter'
                            : 'User attributes will appear here once your platform syncs include attribute schema data.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canvas-tags" className="space-y-4">
          <Card className="border-primary/15 bg-muted/20">
            <CardContent className="p-4 text-sm text-muted-foreground">
              <p className="text-foreground font-medium mb-1">Braze canvas tag taxonomy</p>
              <p>
                These tags come from the <code className="rounded bg-muted px-1 py-0.5 text-[11px]">tags</code> field on synced{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">braze_canvases</code> rows. Tags with a{' '}
                <span className="font-medium text-foreground">/</span> in the name are grouped by the first segment (for example{' '}
                <span className="font-mono text-xs">Channel/Email</span> under prefix <span className="font-mono text-xs">Channel/</span>). Tags without{' '}
                <span className="font-medium text-foreground">/</span> sit under <span className="font-medium text-foreground">Other / flat tags</span>. Trigger events from the API are still a separate follow-up when we map the correct field shape.
              </p>
            </CardContent>
          </Card>

          {uniqueCanvasTagCount === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No canvas tags in the database yet. When your Braze canvases include tags and you run a sync, they will show here.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sortedCanvasTagPrefixes.map((prefix, idx) => {
                const tags = filteredCanvasTagsByPrefix.get(prefix) ?? [];
                return (
                  <Collapsible key={prefix} defaultOpen={idx < 8} className="group">
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full min-w-0 items-center justify-between gap-2 border-b border-border/50 bg-card px-4 py-3 text-left text-sm font-medium hover:bg-muted/40 transition-colors"
                        >
                          <span className="min-w-0 break-words">
                            {prefix}
                            <Badge variant="secondary" className="ml-2 align-middle text-[10px] font-normal">
                              {tags.length} tag{tags.length === 1 ? '' : 's'}
                            </Badge>
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="space-y-2 p-3 pt-2">
                          {tags.map((t) => (
                            <div
                              key={t.fullTag}
                              className="rounded-lg border border-border/40 bg-background/80 px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                                <code className="break-all text-xs font-mono font-medium text-foreground">{t.fullTag}</code>
                                <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                                  {t.canvasCount} canvas{t.canvasCount === 1 ? '' : 'es'}
                                </Badge>
                              </div>
                              {t.sampleCanvasNames.length > 0 && (
                                <p className="mt-1.5 text-[11px] text-muted-foreground break-words">
                                  <span className="font-medium text-foreground/80">Examples:</span>{' '}
                                  {t.sampleCanvasNames.join(' · ')}
                                  {t.canvasCount > t.sampleCanvasNames.length ? ' · …' : ''}
                                </p>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
              {sortedCanvasTagPrefixes.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No tags match your search.</p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
