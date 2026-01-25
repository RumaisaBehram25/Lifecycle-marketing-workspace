import { useState, useMemo } from 'react';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  BarChart3, 
  TrendingUp, 
  Mail, 
  MousePointerClick, 
  Users, 
  Send, 
  AlertTriangle,
  CalendarIcon,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
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
  channel: string;
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
  step_analytics?: Array<{
    step_name: string;
    channel: string;
    sends: number;
    opens: number;
    clicks: number;
  }>;
}

interface BrazeSchemaCache {
  campaigns?: Array<CampaignAnalytics & { id: string; name: string }>;
  canvases?: Array<CanvasAnalytics & { id: string; name: string; enabled?: boolean }>;
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
    date_range: { start: string; end: string };
  };
}

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedCanvases, setSelectedCanvases] = useState<string[]>([]);

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const schemaCache = brazePlatform?.schema_cache as BrazeSchemaCache | undefined;
  const analytics = schemaCache?.analytics;

  // Calculate metrics from available data
  const campaignMetrics = useMemo(() => {
    if (!schemaCache?.campaigns) return null;
    
    const campaigns = schemaCache.campaigns.filter(c => c.sends || c.deliveries);
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
    };
  }, [schemaCache?.canvases]);

  // Top campaigns by engagement
  const topCampaigns = useMemo(() => {
    if (!campaignMetrics?.campaigns) return [];
    return [...campaignMetrics.campaigns]
      .sort((a, b) => (b.unique_opens || 0) - (a.unique_opens || 0))
      .slice(0, 10);
  }, [campaignMetrics?.campaigns]);

  // Channel breakdown
  const channelBreakdown = useMemo(() => {
    if (!campaignMetrics?.campaigns) return [];
    
    const byChannel: Record<string, { sends: number; opens: number; clicks: number }> = {};
    campaignMetrics.campaigns.forEach(c => {
      const channel = c.channel || 'email';
      if (!byChannel[channel]) {
        byChannel[channel] = { sends: 0, opens: 0, clicks: 0 };
      }
      byChannel[channel].sends += c.sends || 0;
      byChannel[channel].opens += c.unique_opens || 0;
      byChannel[channel].clicks += c.unique_clicks || 0;
    });

    return Object.entries(byChannel).map(([channel, data]) => ({
      channel: channel.charAt(0).toUpperCase() + channel.slice(1),
      ...data,
      openRate: data.sends > 0 ? (data.opens / data.sends) * 100 : 0,
    }));
  }, [campaignMetrics?.campaigns]);

  const handleSyncAnalytics = async () => {
    if (!client || !brazePlatform) return;
    
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('sync-braze', {
        body: {
          clientId: client.id,
          platformId: brazePlatform.id,
          includeAnalytics: true,
          analyticsDateRange: dateRange ? {
            start: format(dateRange.from!, 'yyyy-MM-dd'),
            end: format(dateRange.to || new Date(), 'yyyy-MM-dd'),
          } : undefined,
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

  const hasAnalytics = campaignMetrics || canvasMetrics;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <PageHeader
          title="Analytics"
          description="Track messaging performance across campaigns and lifecycle flows"
          actions={
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
              
              <Button onClick={handleSyncAnalytics} disabled={syncing || !brazePlatform}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync Analytics
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
        ) : !hasAnalytics ? (
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
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Total Sends"
                value={campaignMetrics?.sends || 0}
                icon={Send}
                format="number"
              />
              <MetricCard
                title="Unique Opens"
                value={campaignMetrics?.unique_opens || 0}
                icon={Mail}
                format="number"
                subtitle={`${campaignMetrics?.open_rate?.toFixed(1) || 0}% open rate`}
              />
              <MetricCard
                title="Unique Clicks"
                value={campaignMetrics?.unique_clicks || 0}
                icon={MousePointerClick}
                format="number"
                subtitle={`${campaignMetrics?.click_rate?.toFixed(2) || 0}% CTR`}
              />
              <MetricCard
                title="Conversions"
                value={(campaignMetrics?.conversions || 0) + (canvasMetrics?.conversions || 0)}
                icon={TrendingUp}
                format="number"
                subtitle={canvasMetrics?.revenue ? `$${canvasMetrics.revenue.toLocaleString()} revenue` : undefined}
              />
            </div>

            {/* Tabs for Campaigns vs Lifecycle */}
            <Tabs defaultValue="campaigns" className="space-y-6">
              <TabsList>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="lifecycle">Lifecycle Flows</TabsTrigger>
                <TabsTrigger value="comparison">Compare</TabsTrigger>
              </TabsList>

              <TabsContent value="campaigns" className="space-y-6">
                {/* Delivery Metrics */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Delivery Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <MetricRow label="Sends" value={campaignMetrics?.sends || 0} />
                        <MetricRow label="Deliveries" value={campaignMetrics?.deliveries || 0} rate={campaignMetrics?.delivery_rate} />
                        <MetricRow label="Bounces" value={campaignMetrics?.bounces || 0} isNegative />
                        <MetricRow label="Unsubscribes" value={campaignMetrics?.unsubscribes || 0} rate={campaignMetrics?.unsubscribe_rate} isNegative />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Engagement Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <MetricRow label="Opens" value={campaignMetrics?.opens || 0} />
                        <MetricRow label="Unique Opens" value={campaignMetrics?.unique_opens || 0} rate={campaignMetrics?.open_rate} />
                        <MetricRow label="Clicks" value={campaignMetrics?.clicks || 0} />
                        <MetricRow label="Click-to-Open" value={campaignMetrics?.unique_clicks || 0} rate={campaignMetrics?.cto_rate} />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Channel Breakdown */}
                {channelBreakdown.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Channel Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelBreakdown}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="channel" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--card))', 
                                border: '1px solid hsl(var(--border))' 
                              }} 
                            />
                            <Legend />
                            <Bar dataKey="sends" name="Sends" fill="hsl(var(--primary))" />
                            <Bar dataKey="opens" name="Opens" fill="hsl(var(--chart-2))" />
                            <Bar dataKey="clicks" name="Clicks" fill="hsl(var(--chart-3))" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top Campaigns Table */}
                {topCampaigns.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Top Performing Campaigns</CardTitle>
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
                            {topCampaigns.map((c, i) => (
                              <tr key={c.campaign_id || i} className="border-b last:border-0">
                                <td className="py-2 max-w-[300px] truncate">{c.campaign_name || c.name}</td>
                                <td className="text-right py-2">{(c.sends || 0).toLocaleString()}</td>
                                <td className="text-right py-2">
                                  {c.deliveries ? ((c.unique_opens || 0) / c.deliveries * 100).toFixed(1) : 0}%
                                </td>
                                <td className="text-right py-2">
                                  {c.deliveries ? ((c.unique_clicks || 0) / c.deliveries * 100).toFixed(2) : 0}%
                                </td>
                                <td className="text-right py-2">{(c.conversions || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="lifecycle" className="space-y-6">
                {canvasMetrics ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-3">
                      <MetricCard
                        title="Journey Entries"
                        value={canvasMetrics.entries}
                        icon={Users}
                        format="number"
                      />
                      <MetricCard
                        title="Conversions"
                        value={canvasMetrics.conversions}
                        icon={TrendingUp}
                        format="number"
                        subtitle={`${canvasMetrics.conversion_rate.toFixed(1)}% conversion rate`}
                      />
                      <MetricCard
                        title="Revenue"
                        value={canvasMetrics.revenue}
                        icon={BarChart3}
                        format="currency"
                      />
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Active Lifecycle Flows</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {canvasMetrics.canvases.map((canvas, i) => (
                            <div key={canvas.canvas_id || i} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                              <div>
                                <p className="font-medium">{canvas.canvas_name || canvas.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {canvas.first_entry ? `First entry: ${format(new Date(canvas.first_entry), 'MMM d, yyyy')}` : 'No entries yet'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium">{(canvas.entries || 0).toLocaleString()} entries</p>
                                <p className="text-xs text-muted-foreground">
                                  {canvas.conversions || 0} conversions
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No lifecycle flow analytics available</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="comparison" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Campaign vs Lifecycle Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { 
                            name: 'Campaigns', 
                            conversions: campaignMetrics?.conversions || 0,
                            revenue: campaignMetrics?.revenue || 0,
                          },
                          { 
                            name: 'Lifecycle', 
                            conversions: canvasMetrics?.conversions || 0,
                            revenue: canvasMetrics?.revenue || 0,
                          },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="conversions" name="Conversions" fill="hsl(var(--primary))" />
                          <Bar dataKey="revenue" name="Revenue ($)" fill="hsl(var(--chart-2))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
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
  trend,
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType;
  format?: 'number' | 'currency' | 'percent';
  subtitle?: string;
  trend?: { value: number; isPositive: boolean };
}) {
  const formattedValue = format === 'currency' 
    ? `$${value.toLocaleString()}` 
    : format === 'percent' 
      ? `${value.toFixed(1)}%` 
      : value.toLocaleString();

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          {trend && (
            <Badge variant={trend.isPositive ? 'default' : 'destructive'} className="text-xs">
              {trend.isPositive ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
              {Math.abs(trend.value).toFixed(1)}%
            </Badge>
          )}
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold">{formattedValue}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
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
