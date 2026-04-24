import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import {
  countDistinctSegmentsFromAnalytics,
  resolveBrazeSegmentDirectoryCount,
} from '@/lib/brazeSegmentDirectory';
import { sumBouncesUnsubsLast30dFromCampaignAnalytics } from '@/lib/brazeCampaignAnalyticsHealth';
import { warnIfMetricsDiverge } from '@/lib/workspaceMetricsIntegrity';

type KpiRow = { metric: string; series_date: string; value: number | string | null };
type CampaignAggTotals = {
  sends: number;
  deliveries: number;
  opens: number;
  clicks: number;
  unsubs: number;
  bounces: number;
  spam: number;
};

function n(v: unknown): number {
  if (v == null || v === '') return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** String sort on dates breaks for non–zero-padded days (e.g. 2026-03-9 vs 2026-03-24). */
function seriesDateMs(seriesDate: string): number {
  const d = String(seriesDate).slice(0, 10);
  const t = Date.parse(`${d}T12:00:00.000Z`);
  return Number.isNaN(t) ? 0 : t;
}

function pctChange(prev: number, curr: number): string {
  if (prev <= 0) return curr > 0 ? '+100%' : '0%';
  const ch = ((curr - prev) / prev) * 100;
  const sign = ch >= 0 ? '+' : '';
  return `${sign}${ch.toFixed(1)}%`;
}

/** Sum KPI points in the last `days` calendar days (not merely the last N rows). */
function sumKpiLastDays(rows: KpiRow[], metric: string, days: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows
    .filter(
      (r) =>
        r.metric === metric && String(r.series_date ?? '').slice(0, 10) >= cutoffStr
    )
    .reduce((s, r) => s + n(r.value), 0);
}

function latestKpi(rows: KpiRow[], metric: string): number {
  const filtered = rows.filter((r) => r.metric === metric);
  if (!filtered.length) return 0;
  let bestMs = -Infinity;
  let bestVal = 0;
  for (const r of filtered) {
    const ms = seriesDateMs(String(r.series_date));
    const v = n(r.value);
    if (ms > bestMs || (ms === bestMs && v > bestVal)) {
      bestMs = ms;
      bestVal = v;
    }
  }
  return bestVal;
}

function trendKpi(rows: KpiRow[], metric: string): string {
  const sorted = rows
    .filter((r) => r.metric === metric)
    .sort((a, b) => seriesDateMs(String(a.series_date)) - seriesDateMs(String(b.series_date)));
  if (sorted.length < 8) return 'Sync Braze for trend';
  const last7 = sorted.slice(-7).reduce((s, r) => s + n(r.value), 0) / 7;
  const prev7 = sorted.slice(-14, -7).reduce((s, r) => s + n(r.value), 0) / 7;
  return `7d vs prior 7d ${pctChange(prev7, last7)}`;
}

const PILLAR_KEYS = [
  { key: 'retention', label: 'Retention' },
  { key: 'reactivation', label: 'Reactivation' },
  { key: 'activation', label: 'Activation' },
  { key: 'upsell', label: 'Upsell' },
] as const;

function matchesPillar(text: string, pillar: string): boolean {
  const t = text.toLowerCase();
  return t.includes(pillar);
}

export function useDashboardBrazeMetrics() {
  const { clientId, isLoading: isClientLoading } = useBrazeDashboardClientId();

  const kpiQuery = useQuery({
    queryKey: ['dashboard-braze', 'kpi', clientId],
    queryFn: async () => {
      if (!clientId) return [] as KpiRow[];
      const { data, error } = await (supabase as any)
        .from('braze_kpi_series')
        .select('metric,series_date,value')
        .eq('client_id', clientId)
        .order('series_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as KpiRow[];
    },
    enabled: !!clientId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const campaignsAgg = useQuery({
    queryKey: ['dashboard-braze', 'campaigns-agg', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from('braze_campaigns')
        .select('channel,deliveries,opens,clicks,unsubs')
        .eq('client_id', clientId);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const zero: CampaignAggTotals = {
        sends: 0,
        deliveries: 0,
        opens: 0,
        clicks: 0,
        unsubs: 0,
        bounces: 0,
        spam: 0,
      };
      /**
       * Aggregation model:
       * - Source table: `braze_campaigns`
       * - Source fields: `deliveries`, `opens`, `clicks`, `unsubs`, `channel`
       * - Rollup: campaign-wide totals for the workspace client, with additional per-channel buckets.
       *   This keeps KPI math stable and enables channel-level filtering when needed.
       */
      const byChannel: Record<string, CampaignAggTotals> = {};
      const totals = rows.reduce((acc, row) => {
        const deliveries = n(row.deliveries);
        const opens = n(row.opens);
        const clicks = n(row.clicks);
        const unsubs = n(row.unsubs);
        const channel = String(row.channel ?? 'unknown').trim().toLowerCase() || 'unknown';
        const cur = byChannel[channel] ?? { ...zero };
        cur.sends += deliveries;
        cur.deliveries += deliveries;
        cur.opens += opens;
        cur.clicks += clicks;
        cur.unsubs += unsubs;
        byChannel[channel] = cur;
        return {
          sends: acc.sends + deliveries,
          deliveries: acc.deliveries + deliveries,
          opens: acc.opens + opens,
          clicks: acc.clicks + clicks,
          unsubs: acc.unsubs + unsubs,
          bounces: 0,
          spam: 0,
        };
      }, { ...zero });
      return { totals, byChannel };
    },
    enabled: !!clientId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const canvasStats = useQuery({
    queryKey: ['dashboard-braze', 'canvas-stats', clientId],
    queryFn: async () => {
      if (!clientId) {
        const empty: Record<string, number> = {};
        for (const p of PILLAR_KEYS) empty[p.key] = 0;
        return { syncedTotal: 0, enabledInBraze: 0, pillars: '—', pillarByKey: empty as Record<(typeof PILLAR_KEYS)[number]['key'], number> };
      }
      const { data, error } = await supabase
        .from('braze_canvases')
        .select('enabled,archived,name,tags')
        .eq('client_id', clientId);
      if (error) throw error;
      const rows = data ?? [];
      const isArchived = (r: { archived?: boolean | null }) => r.archived === true;
      const workspaceRows = rows.filter((r) => !isArchived(r));
      const enabledInBraze = workspaceRows.filter((r: any) => r.enabled === true).length;
      const syncedTotal = workspaceRows.length;
      const pillarCounts: Record<string, number> = {};
      for (const p of PILLAR_KEYS) pillarCounts[p.key] = 0;
      for (const r of workspaceRows) {
        const blob = `${(r as any).name || ''} ${((r as any).tags || []).join(' ')}`;
        for (const p of PILLAR_KEYS) {
          if (matchesPillar(blob, p.key)) pillarCounts[p.key]++;
        }
      }
      const parts = PILLAR_KEYS.filter((p) => pillarCounts[p.key] > 0).map(
        (p) => `${p.label} ${pillarCounts[p.key]}`
      );
      return {
        syncedTotal,
        enabledInBraze,
        pillars: parts.length ? parts.join(' · ') : '—',
        pillarByKey: { ...pillarCounts } as Record<(typeof PILLAR_KEYS)[number]['key'], number>,
      };
    },
    enabled: !!clientId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const segmentCount = useQuery({
    queryKey: ['dashboard-braze', 'segments-count', clientId],
    queryFn: async () => {
      if (!clientId) return { count: 0, source: null as const };
      return resolveBrazeSegmentDirectoryCount(clientId);
    },
    enabled: !!clientId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const scheduledPeek = useQuery({
    queryKey: ['dashboard-braze', 'scheduled', clientId],
    queryFn: async () => {
      if (!clientId) return { count: 0, nextSendTimeLabel: '', upcomingThree: [] as Array<{ name: string; when: string }> };
      const { data, error } = await (supabase as any)
        .from('braze_scheduled_broadcasts')
        .select('name,next_send_time')
        .eq('client_id', clientId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ name?: string | null; next_send_time?: string | null }>;
      const count = rows.length;
      const withTime = rows
        .filter((r) => r.next_send_time != null && String(r.next_send_time).trim() !== '')
        .sort((a, b) => {
          const ta = Date.parse(String(a.next_send_time));
          const tb = Date.parse(String(b.next_send_time));
          return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
        });
      const next = withTime[0];
      let nextSendTimeLabel = '';
      if (next?.next_send_time) {
        const t = Date.parse(String(next.next_send_time));
        if (!Number.isNaN(t)) {
          nextSendTimeLabel = new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(t));
        }
      }
      const fmtUpcoming = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const upcomingThree = withTime.slice(0, 3).map((r) => {
        const t = Date.parse(String(r.next_send_time));
        return {
          name: String(r.name || 'Broadcast').slice(0, 48),
          when: Number.isNaN(t) ? '—' : fmtUpcoming.format(new Date(t)),
        };
      });
      return { count, nextSendTimeLabel, upcomingThree };
    },
    enabled: !!clientId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const emailHealth = useQuery({
    queryKey: ['dashboard-braze', 'email-health', clientId],
    queryFn: async () => {
      if (!clientId) return { bounces: 0, unsubs: 0 };
      /**
       * Avoid direct `braze_email_events` count probes — some tenants return HTTP 500 for count+limit requests.
       * Use campaign analytics rollups only so UI remains clean and console stays quiet.
       */
      return sumBouncesUnsubsLast30dFromCampaignAnalytics(clientId);
    },
    enabled: !!clientId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const syncHealth = useQuery({
    queryKey: ['dashboard-braze', 'sync-health', clientId],
    queryFn: async () => {
      if (!clientId) {
        return {
          counts: { canvases: 0, segments: 0, emailEvents30d: 0, scheduledBroadcasts: 0 },
          lastRunAt: null as string | null,
          lastRunStatus: null as string | null,
          lastError: null as string | null,
        };
      }
      const [
        canvasesRes,
        segmentsRes,
        scheduledRes,
        latestRunRes,
        latestFailedRes,
        csvEmailFallback,
      ] = await Promise.all([
        (supabase as any)
          .from('braze_canvases')
          .select('id', { count: 'exact' })
          .eq('client_id', clientId)
          .or('archived.is.null,archived.eq.false')
          .limit(1),
        (supabase as any)
          .from('braze_segments_sync')
          .select('id', { count: 'exact' })
          .eq('client_id', clientId)
          .limit(1),
        (supabase as any)
          .from('braze_scheduled_broadcasts')
          .select('id', { count: 'exact' })
          .eq('client_id', clientId)
          .limit(1),
        (supabase as any)
          .from('braze_sync_runs')
          .select('status,started_at,completed_at,error_message')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from('braze_sync_runs')
          .select('error_message,completed_at,started_at')
          .eq('client_id', clientId)
          .eq('status', 'failed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        sumBouncesUnsubsLast30dFromCampaignAnalytics(clientId),
      ]);

      if (canvasesRes.error) throw canvasesRes.error;
      if (segmentsRes.error) throw segmentsRes.error;
      if (scheduledRes.error) throw scheduledRes.error;
      if (latestRunRes.error) throw latestRunRes.error;
      if (latestFailedRes.error) throw latestFailedRes.error;

      const lastRun = (latestRunRes.data ?? null) as
        | { status?: string | null; started_at?: string | null; completed_at?: string | null; error_message?: string | null }
        | null;
      const lastFailed = (latestFailedRes.data ?? null) as
        | { error_message?: string | null; started_at?: string | null; completed_at?: string | null }
        | null;

      const syncSegmentN = segmentsRes.count ?? 0;
      const segmentsDisplay =
        syncSegmentN > 0 ? syncSegmentN : await countDistinctSegmentsFromAnalytics(clientId);

      return {
        counts: {
          canvases: canvasesRes.count ?? 0,
          segments: segmentsDisplay,
          // Avoid hard dependency on `braze_email_events` count endpoint (can 500 on some tenants).
          emailEvents30d: (csvEmailFallback.bounces ?? 0) + (csvEmailFallback.unsubs ?? 0),
          scheduledBroadcasts: scheduledRes.count ?? 0,
        },
        lastRunAt: lastRun?.completed_at ?? lastRun?.started_at ?? null,
        lastRunStatus: lastRun?.status ?? null,
        lastError: lastFailed?.error_message ?? lastRun?.error_message ?? null,
      };
    },
    enabled: !!clientId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const derived = useMemo(() => {
    const kpi = kpiQuery.data ?? [];
    const camp = campaignsAgg.data?.totals;
    const campaignAggByChannel = campaignsAgg.data?.byChannel ?? {};
    const dau = latestKpi(kpi, 'dau');
    const mau = latestKpi(kpi, 'mau');
    const newUsers30 = sumKpiLastDays(kpi, 'new_users', 30);
    const openRate = camp && camp.deliveries > 0 ? (camp.opens / camp.deliveries) * 100 : 0;
    const clickRate = camp && camp.deliveries > 0 ? (camp.clicks / camp.deliveries) * 100 : 0;
    const bounceRate = camp && camp.sends > 0 ? (camp.bounces / camp.sends) * 100 : 0;
    const unsubRate = camp && camp.deliveries > 0 ? (camp.unsubs / camp.deliveries) * 100 : 0;
    const deliveryRate = camp && camp.sends > 0 ? (camp.deliveries / camp.sends) * 100 : 0;

    let anomaly = '';
    if (bounceRate >= 3) anomaly = `High bounce rate (${bounceRate.toFixed(2)}%). `;
    if (unsubRate >= 0.5) anomaly += `Elevated unsubscribes (${unsubRate.toFixed(2)}%).`;
    if (!anomaly && camp && camp.deliveries > 0 && openRate < 10) anomaly = 'Open rate below 10% on synced campaigns — review creative.';

    return {
      dau,
      mau,
      newUsers30,
      dauTrend: trendKpi(kpi, 'dau'),
      mauTrend: trendKpi(kpi, 'mau'),
      openRate,
      clickRate,
      bounceRate,
      unsubRate,
      deliveryRate,
      totalDeliveries: camp?.deliveries ?? 0,
      spamReports: camp?.spam ?? 0,
      anomaly: anomaly.trim(),
      hasKpi: kpi.length > 0,
      hasCampaignAgg: !!camp && (camp.sends > 0 || camp.deliveries > 0),
      /** Channel-level campaign aggregation (same source fields as totals) for optional filtering/UI drilldown. */
      campaignAggByChannel,
    };
  }, [kpiQuery.data, campaignsAgg.data]);

  useEffect(() => {
    if (import.meta.env.PROD || !clientId || !syncHealth.data || !canvasStats.data) return;
    warnIfMetricsDiverge(
      { nonArchivedCanvases: syncHealth.data.counts.canvases },
      { nonArchivedCanvases: canvasStats.data.syncedTotal },
      'syncHealth vs canvasStats (non-archived canvases)'
    );
    const segTile = segmentCount.data?.count ?? 0;
    const segSync = syncHealth.data.counts.segments;
    warnIfMetricsDiverge(
      { segmentDirectory: segTile },
      { segmentDirectory: segSync },
      'segment count tile vs syncHealth'
    );
  }, [clientId, syncHealth.data, canvasStats.data, segmentCount.data]);

  const isLoading =
    isClientLoading ||
    (!!clientId &&
      (kpiQuery.isLoading ||
        campaignsAgg.isLoading ||
        canvasStats.isLoading ||
        segmentCount.isLoading ||
        scheduledPeek.isLoading ||
        emailHealth.isLoading ||
        syncHealth.isLoading));

  return {
    clientId,
    isLoading,
    refetch: () => {
      kpiQuery.refetch();
      campaignsAgg.refetch();
      canvasStats.refetch();
      segmentCount.refetch();
      scheduledPeek.refetch();
      emailHealth.refetch();
      syncHealth.refetch();
    },
    canvasStats: canvasStats.data ?? {
      syncedTotal: 0,
      enabledInBraze: 0,
      pillars: '—',
      pillarByKey: Object.fromEntries(PILLAR_KEYS.map((p) => [p.key, 0])) as Record<
        (typeof PILLAR_KEYS)[number]['key'],
        number
      >,
    },
    segmentCount: segmentCount.data?.count ?? 0,
    segmentDirectorySource: segmentCount.data?.source ?? null,
    scheduled: scheduledPeek.data ?? { count: 0, nextSendTimeLabel: '', upcomingThree: [] },
    scheduledError: scheduledPeek.error ?? null,
    scheduledIsError: scheduledPeek.isError,
    emailHealth: emailHealth.data ?? { bounces: 0, unsubs: 0 },
    syncHealth: syncHealth.data ?? {
      counts: { canvases: 0, segments: 0, emailEvents30d: 0, scheduledBroadcasts: 0 },
      lastRunAt: null,
      lastRunStatus: null,
      lastError: null,
    },
    kpiRows: kpiQuery.data ?? [],
    derived,
  };
}
