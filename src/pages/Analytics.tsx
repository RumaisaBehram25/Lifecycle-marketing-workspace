import { useState, useMemo } from 'react';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { 
  BarChart3, 
  TrendingUp, 
  Mail, 
  MousePointerClick, 
  Users, 
  Send, 
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  GitCompare,
  Filter,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  channel?: string;
  sends: number;
  deliveries: number;
  opens: number;
  unique_opens: number;
  clicks: number;
  unique_clicks: number;
  unsubscribes: number;
  bounces: number;
  conversions: number;
  revenue: number;
  first_sent?: string;
  last_sent?: string;
}

interface CanvasAnalytics {
  canvas_id: string;
  canvas_name: string;
  entries: number;
  conversions: number;
  revenue: number;
  first_entry?: string;
  last_entry?: string;
  variants?: Array<{
    name: string;
    percentage: number;
    entries?: number;
    conversions?: number;
  }>;
}

interface BrazeSchemaCache {
  campaigns?: Array<CampaignAnalytics & { id: string; name: string; channels?: string[] }>;
  canvases?: Array<CanvasAnalytics & { id: string; name: string; enabled?: boolean; variants?: any[] }>;
  analytics?: {
    campaigns: CampaignAnalytics[];
    canvases: CanvasAnalytics[];
    summary: {
      total_sends: number;
      total_deliveries: number;
      total_opens: number;
      total_clicks: number;
      total_unsubscribes: number;
      avg_open_rate: number;
      avg_click_rate: number;
      total_conversions: number;
      total_revenue: number;
    };
    date_range?: { start: string; end: string };
  };
}

const DATE_PRESETS = [
  { label: 'Last 7 days', value: '7', days: 7 },
  { label: 'Last 14 days', value: '14', days: 14 },
  { label: 'Last 30 days', value: '30', days: 30 },
  { label: 'Last 90 days', value: '90', days: 90 },
];

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export default function Analytics() {
  const { data: client, isLoading: clientLoading } = useLinktreeClient();
  const { data: platforms, isLoading: platformsLoading, refetch: refetchPlatforms } = useLinktreePlatforms();
  const { toast } = useToast();
  
  const [syncing, setSyncing] = useState(false);
  const [datePreset, setDatePreset] = useState('14');
  const [selectedFlow, setSelectedFlow] = useState<string>('all');
  const [compareFlows, setCompareFlows] = useState<string[]>([]);

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const schemaCache = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;

  // Calculate metrics from available data
  const campaignMetrics = useMemo(() => {
    if (!schemaCache?.campaigns) return null;
    
    const campaigns = schemaCache.campaigns.filter(c => 
      (c.sends && c.sends > 0) || (c.deliveries && c.deliveries > 0) || c.last_sent
    );
    if (campaigns.length === 0) return null;

    const totals = campaigns.reduce((acc, c) => ({
      sends: acc.sends + (c.sends || 0),
      deliveries: acc.deliveries + (c.deliveries || 0),
      opens: acc.opens + (c.opens || 0),
      unique_opens: acc.unique_opens + (c.unique_opens || 0),
      clicks: acc.clicks + (c.clicks || 0),
      unique_clicks: acc.unique_clicks + (c.unique_clicks || 0),
      unsubscribes: acc.unsubscribes + (c.unsubscribes || 0),
      bounces: acc.bounces + (c.bounces || 0),
      conversions: acc.conversions + (c.conversions || 0),
      revenue: acc.revenue + (c.revenue || 0),
    }), {
      sends: 0, deliveries: 0, opens: 0, unique_opens: 0,
      clicks: 0, unique_clicks: 0, unsubscribes: 0, bounces: 0,
      conversions: 0, revenue: 0,
    });

    return {
      ...totals,
      open_rate: totals.deliveries > 0 ? (totals.unique_opens / totals.deliveries) * 100 : 0,
      click_rate: totals.deliveries > 0 ? (totals.unique_clicks / totals.deliveries) * 100 : 0,
      cto_rate: totals.unique_opens > 0 ? (totals.unique_clicks / totals.unique_opens) * 100 : 0,
      delivery_rate: totals.sends > 0 ? (totals.deliveries / totals.sends) * 100 : 0,
      unsubscribe_rate: totals.deliveries > 0 ? (totals.unsubscribes / totals.deliveries) * 100 : 0,
      campaigns,
      count: campaigns.length,
    };
  }, [schemaCache?.campaigns]);

  const canvasMetrics = useMemo(() => {
    if (!schemaCache?.canvases) return null;
    
    const canvases = schemaCache.canvases.filter(c => c.enabled !== false);
    if (canvases.length === 0) return null;

    const totals = canvases.reduce((acc, c) => ({
      entries: acc.entries + (c.entries || 0),
      conversions: acc.conversions + (c.conversions || 0),
      revenue: acc.revenue + (c.revenue || 0),
    }), { entries: 0, conversions: 0, revenue: 0 });

    return {
      ...totals,
      conversion_rate: totals.entries > 0 ? (totals.conversions / totals.entries) * 100 : 0,
      canvases,
      count: canvases.length,
    };
  }, [schemaCache?.canvases]);

  // Top campaigns by engagement
  const topCampaigns = useMemo(() => {
    if (!campaignMetrics?.campaigns) return [];
    return [...campaignMetrics.campaigns]
      .filter(c => c.sends > 0 || c.unique_opens > 0)
      .sort((a, b) => (b.unique_opens || 0) - (a.unique_opens || 0))
      .slice(0, 10);
  }, [campaignMetrics?.campaigns]);

  // Channel breakdown
  const channelBreakdown = useMemo(() => {
    if (!campaignMetrics?.campaigns) return [];
    
    const byChannel: Record<string, { sends: number; opens: number; clicks: number; count: number }> = {};
    campaignMetrics.campaigns.forEach(c => {
      const channels = (c as any).channels || ['email'];
      channels.forEach((channel: string) => {
        if (!byChannel[channel]) {
          byChannel[channel] = { sends: 0, opens: 0, clicks: 0, count: 0 };
        }
        byChannel[channel].sends += c.sends || 0;
        byChannel[channel].opens += c.unique_opens || 0;
        byChannel[channel].clicks += c.unique_clicks || 0;
        byChannel[channel].count += 1;
      });
    });

    return Object.entries(byChannel).map(([channel, data]) => ({
      channel: channel === 'in_app_message' ? 'In-App' : channel.charAt(0).toUpperCase() + channel.slice(1),
      ...data,
      openRate: data.sends > 0 ? (data.opens / data.sends) * 100 : 0,
    }));
  }, [campaignMetrics?.campaigns]);

  // Lifecycle flows for filter/comparison
  const lifecycleFlows = useMemo(() => {
    if (!canvasMetrics?.canvases) return [];
    return canvasMetrics.canvases.map(c => ({
      id: c.canvas_id || (c as any).id,
      name: c.canvas_name || (c as any).name,
      entries: c.entries || 0,
      conversions: c.conversions || 0,
      revenue: c.revenue || 0,
      variants: (c as any).variants || [],
    }));
  }, [canvasMetrics?.canvases]);

  // Selected flow for detailed view
  const selectedFlowData = useMemo(() => {
    if (selectedFlow === 'all' || !lifecycleFlows.length) return null;
    return lifecycleFlows.find(f => f.id === selectedFlow);
  }, [selectedFlow, lifecycleFlows]);

  // Comparison data
  const comparisonData = useMemo(() => {
    if (compareFlows.length < 2) return null;
    return lifecycleFlows.filter(f => compareFlows.includes(f.id));
  }, [compareFlows, lifecycleFlows]);

  const handleSyncAnalytics = async () => {
    if (!client || !brazePlatform) return;
    
    setSyncing(true);
    try {
      const days = parseInt(datePreset) || 14;
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

      const { error } = await supabase.functions.invoke('sync-braze', {
        body: {
          clientId: client.id,
          platformId: brazePlatform.id,
          includeAnalytics: true,
          analyticsDateRange: { start: startDate, end: endDate },
        },
      });

      if (error) throw error;
      
      await refetchPlatforms();
      toast({ title: 'Analytics synced successfully' });
    } catch (err) {
      console.error('Sync error:', err);
      toast({ title: 'Sync failed', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const toggleCompareFlow = (flowId: string) => {
    setCompareFlows(prev => 
      prev.includes(flowId) 
        ? prev.filter(id => id !== flowId)
        : prev.length < 4 ? [...prev, flowId] : prev
    );
  };

  if (clientLoading || platformsLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  const hasData = campaignMetrics || canvasMetrics;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <PageHeader
          title="Analytics"
          description="Track messaging performance across campaigns and lifecycle flows"
          actions={
            <div className="flex items-center gap-3">
              {/* Quick Date Presets */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {DATE_PRESETS.map(preset => (
                  <Button
                    key={preset.value}
                    variant={datePreset === preset.value ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => setDatePreset(preset.value)}
                  >
                    {preset.label.replace('Last ', '')}
                  </Button>
                ))}
              </div>
              
              <Button onClick={handleSyncAnalytics} disabled={syncing || !brazePlatform}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync
              </Button>
            </div>
          }
        />

        {!brazePlatform ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Connect Braze to View Analytics</h3>
              <p className="text-muted-foreground mb-4">
                Analytics require a connected Braze account to fetch campaign and canvas performance data.
              </p>
              <Button asChild>
                <a href="/settings">Connect Braze</a>
              </Button>
            </CardContent>
          </Card>
        ) : !hasData ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Analytics Data Yet</h3>
              <p className="text-muted-foreground mb-4">
                Sync your Braze data to see campaign and lifecycle performance metrics.
              </p>
              <Button onClick={handleSyncAnalytics} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync Now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* ==================== OVERVIEW SECTION ==================== */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Overview
              </h2>
              
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <MetricCard
                  title="Total Sends"
                  value={campaignMetrics?.sends || 0}
                  icon={Send}
                  format="number"
                />
                <MetricCard
                  title="Deliveries"
                  value={campaignMetrics?.deliveries || 0}
                  icon={CheckCircle2}
                  format="number"
                  subtitle={`${(campaignMetrics?.delivery_rate || 0).toFixed(1)}% rate`}
                />
                <MetricCard
                  title="Unique Opens"
                  value={campaignMetrics?.unique_opens || 0}
                  icon={Mail}
                  format="number"
                  subtitle={`${(campaignMetrics?.open_rate || 0).toFixed(1)}% open rate`}
                />
                <MetricCard
                  title="Unique Clicks"
                  value={campaignMetrics?.unique_clicks || 0}
                  icon={MousePointerClick}
                  format="number"
                  subtitle={`${(campaignMetrics?.click_rate || 0).toFixed(2)}% CTR`}
                />
                <MetricCard
                  title="Conversions"
                  value={(campaignMetrics?.conversions || 0) + (canvasMetrics?.conversions || 0)}
                  icon={TrendingUp}
                  format="number"
                />
              </div>

              {/* Channel Breakdown */}
              {channelBreakdown.length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Channel Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      {channelBreakdown.map(channel => (
                        <div key={channel.channel} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                            channel.channel.toLowerCase() === 'email' ? 'bg-blue-500/10' :
                            channel.channel.toLowerCase() === 'push' ? 'bg-orange-500/10' : 'bg-purple-500/10'
                          }`}>
                            {channel.channel.toLowerCase() === 'email' ? <Mail className="h-5 w-5 text-blue-500" /> :
                             channel.channel.toLowerCase() === 'push' ? <Bell className="h-5 w-5 text-orange-500" /> :
                             <Smartphone className="h-5 w-5 text-purple-500" />}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{channel.channel}</p>
                            <p className="text-xs text-muted-foreground">{channel.count} campaigns</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm">{channel.sends.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">{channel.openRate.toFixed(1)}% open</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            <Separator />

            {/* ==================== CAMPAIGNS SECTION ==================== */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Campaigns
                {campaignMetrics?.count && (
                  <Badge variant="secondary" className="text-xs">{campaignMetrics.count} total</Badge>
                )}
              </h2>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Delivery Metrics */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Delivery Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <MetricRow label="Sends" value={campaignMetrics?.sends || 0} />
                      <MetricRow label="Deliveries" value={campaignMetrics?.deliveries || 0} rate={campaignMetrics?.delivery_rate} />
                      <MetricRow label="Bounces" value={campaignMetrics?.bounces || 0} isNegative />
                      <MetricRow label="Unsubscribes" value={campaignMetrics?.unsubscribes || 0} rate={campaignMetrics?.unsubscribe_rate} isNegative />
                    </div>
                  </CardContent>
                </Card>

                {/* Engagement Metrics */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Engagement Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <MetricRow label="Total Opens" value={campaignMetrics?.opens || 0} />
                      <MetricRow label="Unique Opens" value={campaignMetrics?.unique_opens || 0} rate={campaignMetrics?.open_rate} />
                      <MetricRow label="Total Clicks" value={campaignMetrics?.clicks || 0} />
                      <MetricRow label="Click-to-Open" value={campaignMetrics?.unique_clicks || 0} rate={campaignMetrics?.cto_rate} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Campaigns Table */}
              {topCampaigns.length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top Performing Campaigns</CardTitle>
                    <CardDescription>By unique opens in the selected period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 font-medium">Campaign</th>
                            <th className="text-right py-2 font-medium">Sends</th>
                            <th className="text-right py-2 font-medium">Open Rate</th>
                            <th className="text-right py-2 font-medium">Click Rate</th>
                            <th className="text-right py-2 font-medium">Conversions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topCampaigns.map((c, i) => {
                            const openRate = c.deliveries ? ((c.unique_opens || 0) / c.deliveries * 100) : 0;
                            const clickRate = c.deliveries ? ((c.unique_clicks || 0) / c.deliveries * 100) : 0;
                            return (
                              <tr key={c.campaign_id || i} className="border-b last:border-0 hover:bg-muted/50">
                                <td className="py-2.5 max-w-[300px] truncate">{c.campaign_name || (c as any).name}</td>
                                <td className="text-right py-2.5">{(c.sends || 0).toLocaleString()}</td>
                                <td className="text-right py-2.5">
                                  <span className={openRate > 20 ? 'text-green-600' : openRate < 10 ? 'text-amber-600' : ''}>
                                    {openRate.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="text-right py-2.5">
                                  <span className={clickRate > 3 ? 'text-green-600' : clickRate < 1 ? 'text-amber-600' : ''}>
                                    {clickRate.toFixed(2)}%
                                  </span>
                                </td>
                                <td className="text-right py-2.5">{(c.conversions || 0).toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            <Separator />

            {/* ==================== LIFECYCLE SECTION ==================== */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Lifecycle Flows
                  {canvasMetrics?.count && (
                    <Badge variant="secondary" className="text-xs">{canvasMetrics.count} active</Badge>
                  )}
                </h2>
                
                {/* Flow Filter */}
                <Select value={selectedFlow} onValueChange={setSelectedFlow}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by flow" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Flows</SelectItem>
                    {lifecycleFlows.map(flow => (
                      <SelectItem key={flow.id} value={flow.id}>{flow.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-3 mb-4">
                <MetricCard
                  title="Journey Entries"
                  value={canvasMetrics?.entries || 0}
                  icon={Users}
                  format="number"
                />
                <MetricCard
                  title="Conversions"
                  value={canvasMetrics?.conversions || 0}
                  icon={TrendingUp}
                  format="number"
                  subtitle={`${(canvasMetrics?.conversion_rate || 0).toFixed(1)}% conversion rate`}
                />
                <MetricCard
                  title="Revenue"
                  value={canvasMetrics?.revenue || 0}
                  icon={BarChart3}
                  format="currency"
                />
              </div>

              {/* Flow List / Selected Flow */}
              {selectedFlow === 'all' ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">All Active Flows</CardTitle>
                    <CardDescription>Click the compare icon to add flows for A/B comparison</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {lifecycleFlows.map((flow) => (
                        <div key={flow.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <Button
                              variant={compareFlows.includes(flow.id) ? 'default' : 'outline'}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleCompareFlow(flow.id)}
                            >
                              <GitCompare className="h-4 w-4" />
                            </Button>
                            <div>
                              <p className="font-medium">{flow.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {flow.variants?.length || 0} variants
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-right">
                            <div>
                              <p className="font-medium">{flow.entries.toLocaleString()}</p>
                              <p className="text-xs text-muted-foreground">entries</p>
                            </div>
                            <div>
                              <p className="font-medium">{flow.conversions.toLocaleString()}</p>
                              <p className="text-xs text-muted-foreground">conversions</p>
                            </div>
                            <div>
                              <p className="font-medium">
                                {flow.entries > 0 ? ((flow.conversions / flow.entries) * 100).toFixed(1) : 0}%
                              </p>
                              <p className="text-xs text-muted-foreground">rate</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : selectedFlowData && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{selectedFlowData.name}</CardTitle>
                    <CardDescription>
                      {selectedFlowData.entries.toLocaleString()} entries • 
                      {selectedFlowData.conversions.toLocaleString()} conversions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedFlowData.variants && selectedFlowData.variants.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-muted-foreground">Variant Performance</p>
                        {selectedFlowData.variants.map((variant, i) => (
                          <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
                            <div className="h-8 w-8 rounded-full flex items-center justify-center" 
                                 style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '20' }}>
                              <span className="text-xs font-bold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                                {String.fromCharCode(65 + i)}
                              </span>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{variant.name}</p>
                              <p className="text-xs text-muted-foreground">{variant.percentage}% traffic</p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{variant.entries?.toLocaleString() || '-'}</p>
                              <p className="text-xs text-muted-foreground">entries</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No variant data available</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* A/B Comparison Section */}
              {compareFlows.length >= 2 && comparisonData && (
                <Card className="mt-4">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <GitCompare className="h-4 w-4" />
                          Flow Comparison
                        </CardTitle>
                        <CardDescription>Comparing {compareFlows.length} flows</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setCompareFlows([])}>
                        Clear
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonData.map(f => ({
                          name: f.name.length > 20 ? f.name.substring(0, 20) + '...' : f.name,
                          entries: f.entries,
                          conversions: f.conversions,
                          rate: f.entries > 0 ? (f.conversions / f.entries) * 100 : 0,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" className="text-xs" />
                          <YAxis className="text-xs" />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))' 
                            }} 
                          />
                          <Legend />
                          <Bar dataKey="entries" name="Entries" fill="hsl(var(--primary))" />
                          <Bar dataKey="conversions" name="Conversions" fill="hsl(var(--chart-2))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Comparison Table */}
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 font-medium">Flow</th>
                            <th className="text-right py-2 font-medium">Entries</th>
                            <th className="text-right py-2 font-medium">Conversions</th>
                            <th className="text-right py-2 font-medium">Conv. Rate</th>
                            <th className="text-right py-2 font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonData.map((flow, i) => {
                            const rate = flow.entries > 0 ? (flow.conversions / flow.entries) * 100 : 0;
                            const bestRate = Math.max(...comparisonData.map(f => f.entries > 0 ? (f.conversions / f.entries) * 100 : 0));
                            return (
                              <tr key={flow.id} className="border-b last:border-0">
                                <td className="py-2.5 flex items-center gap-2">
                                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                  {flow.name}
                                </td>
                                <td className="text-right py-2.5">{flow.entries.toLocaleString()}</td>
                                <td className="text-right py-2.5">{flow.conversions.toLocaleString()}</td>
                                <td className="text-right py-2.5">
                                  <span className={rate === bestRate ? 'text-green-600 font-medium' : ''}>
                                    {rate.toFixed(2)}%
                                    {rate === bestRate && <ArrowUpRight className="h-3 w-3 inline ml-1" />}
                                  </span>
                                </td>
                                <td className="text-right py-2.5">${flow.revenue.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Helper Components
function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  format = 'number',
  subtitle,
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType;
  format?: 'number' | 'currency' | 'percent';
  subtitle?: string;
}) {
  const formattedValue = format === 'currency' 
    ? `$${value.toLocaleString()}` 
    : format === 'percent' 
      ? `${value.toFixed(1)}%` 
      : value.toLocaleString();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formattedValue}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ 
  label, 
  value, 
  rate,
  isNegative = false,
}: { 
  label: string; 
  value: number; 
  rate?: number;
  isNegative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-medium ${isNegative && value > 0 ? 'text-destructive' : ''}`}>
          {value.toLocaleString()}
        </span>
        {rate !== undefined && (
          <Badge variant="outline" className="text-xs">
            {rate.toFixed(1)}%
          </Badge>
        )}
      </div>
    </div>
  );
}
