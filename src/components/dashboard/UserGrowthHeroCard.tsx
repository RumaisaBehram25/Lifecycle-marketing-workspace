import { useMemo, useState, useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrazeDashboardClientId } from '@/hooks/useBrazeDashboardClientId';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceDot,
  Legend,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  dashHeroButton,
  dashIconChip,
  dashIconChipAccent,
  dashIconChipSuccess,
  dashLivePillSoft,
  dashSectionTitleBorder,
  dashSheetHeaderAccent,
  dashSkeletonCard,
  dashSparklineBox,
  dashStickinessPanel,
  dashTableShell,
  dashTileAccent,
  dashTilePrimary,
  dashTileSuccess,
  dashTrendRingDecline,
  dashTrendRingGrow,
  dashTrendRingMixed,
  dashboardEmptyWarningCard,
  dashboardSectionDotClass,
  dashboardTopAccentClass,
  dashPill,
} from '@/lib/dashboard-surface';
import { format } from 'date-fns';
import { ArrowRight, TrendingDown, TrendingUp, Users, Activity, UserPlus } from 'lucide-react';
import {
  normalizeUsageRows,
  sliceLastDays,
  windowSeries,
  rollingMean,
  sumNewUsers30d,
  latestDayRow,
  trendTone,
  trendPercent,
  type UsageRow,
} from './userGrowthMetrics';

type KpiRow = { metric: string; series_date: string; value: number | string | null };

function n(v: unknown): number {
  if (v == null || v === '') return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function latestKpiValue(rows: KpiRow[], metric: 'dau' | 'mau' | 'new_users'): number {
  const filtered = rows.filter((r) => r.metric === metric);
  if (!filtered.length) return 0;
  let bestDate = '';
  let bestValue = 0;
  for (const r of filtered) {
    const d = String(r.series_date ?? '').slice(0, 10);
    const v = n(r.value);
    if (d > bestDate || (d === bestDate && v > bestValue)) {
      bestDate = d;
      bestValue = v;
    }
  }
  return bestValue;
}

function sumKpiNewUsers30(rows: KpiRow[]): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows
    .filter((r) => r.metric === 'new_users' && String(r.series_date ?? '').slice(0, 10) >= cutoffStr)
    .reduce((sum, r) => sum + n(r.value), 0);
}

function SparklineDau({ data }: { data: { i: number; v: number }[] }) {
  const gradId = useId().replace(/:/g, '');
  if (!data.length) {
    return <div className={cn('h-11 w-full rounded-lg bg-muted/40', 'ring-1 ring-inset ring-border/40')} />;
  }
  const w = 400;
  const h = 44;
  const max = Math.max(...data.map((d) => d.v), 1);
  const min = Math.min(...data.map((d) => d.v), 0);
  const pad = 2;
  const baseline = h - pad;
  const pts = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((d.v - min) / (max - min || 1)) * (h - pad * 2);
    return `${x},${y}`;
  });
  const lineD = `M ${pts.map((p) => p.replace(',', ' ')).join(' L ')}`;
  const firstX = pts[0]!.split(',')[0]!;
  const lastX = pts[pts.length - 1]!.split(',')[0]!;
  const areaD = `M ${firstX},${baseline} L ${pts.map((p) => p.replace(',', ' ')).join(' L ')} L ${lastX},${baseline} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`spark-fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`spark-line-${gradId}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.75" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-fill-${gradId})`} />
      <path
        d={lineD}
        fill="none"
        stroke={`url(#spark-line-${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PctBadge({ pct }: { pct: number | null }) {
  if (pct == null || Number.isNaN(pct))
    return <span className="text-xs text-muted-foreground">7d vs prior —</span>;
  const pos = pct > 0;
  const neg = pct < 0;
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-[10px] font-semibold tabular-nums border-0',
        pos && 'bg-success/12 text-success',
        neg && 'bg-destructive/10 text-destructive',
        !pos && !neg && 'bg-muted/80 text-muted-foreground',
      )}
    >
      {pos ? <TrendingUp className="mr-0.5 h-3 w-3 inline" /> : neg ? <TrendingDown className="mr-0.5 h-3 w-3 inline" /> : null}
      7d vs prior {pct >= 0 ? '+' : ''}
      {pct.toFixed(1)}%
    </Badge>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className={cn(
        'text-sm font-semibold tracking-tight text-foreground flex items-center gap-2 pb-2',
        dashSectionTitleBorder,
      )}
    >
      <span className={cn(dashboardSectionDotClass, 'shrink-0')} aria-hidden />
      {children}
    </h3>
  );
}

export function UserGrowthHeroCard() {
  const { clientId, isLoading: clientLoading } = useBrazeDashboardClientId();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: rawRows = [], isLoading: rowsLoading } = useQuery({
    queryKey: ['analytics', 'braze_usage_analytics', clientId],
    queryFn: async () => {
      if (!clientId) return [] as UsageRow[];
      const { data, error } = await supabase
        .from('braze_usage_analytics')
        .select('date,dau,mau,new_users')
        .eq('client_id', clientId)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const { data: kpiRows = [], isLoading: kpiLoading } = useQuery({
    queryKey: ['analytics', 'braze_kpi_series', clientId],
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
  });

  const mergedRows = useMemo(() => {
    const hasAnyKpi =
      kpiRows.some((r) => r.metric === 'dau') ||
      kpiRows.some((r) => r.metric === 'mau') ||
      kpiRows.some((r) => r.metric === 'new_users');
    if (!hasAnyKpi) return rawRows;

    const byDate = new Map<string, UsageRow>();
    for (const r of kpiRows) {
      const date = String(r.series_date ?? '').slice(0, 10);
      if (!date) continue;
      const row = byDate.get(date) ?? { date, dau: 0, mau: 0, new_users: 0 };
      if (r.metric === 'dau') row.dau = n(r.value);
      if (r.metric === 'mau') row.mau = n(r.value);
      if (r.metric === 'new_users') row.new_users = n(r.value);
      byDate.set(date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [kpiRows, rawRows]);
  const hasDauKpi = kpiRows.some((r) => r.metric === 'dau');
  const hasMauKpi = kpiRows.some((r) => r.metric === 'mau');
  const hasNewUsersKpi = kpiRows.some((r) => r.metric === 'new_users');

  const sorted = useMemo(() => normalizeUsageRows(mergedRows), [mergedRows]);
  const anchor = latestDayRow(sorted)?.date ?? '';
  const loading = clientLoading || rowsLoading || kpiLoading;

  const derived = useMemo(() => {
    if (!anchor || !sorted.length) {
      return {
        newUsers30: 0,
        mauLatest: 0,
        dauLatest: 0,
        mauPct: null as number | null,
        dauPct: null as number | null,
        spark: [] as { i: number; v: number }[],
        summary: '',
        tone: 'mixed' as const,
        dau30: [] as { date: string; value: number; dow: number }[],
        mau90: [] as { date: string; value: number }[],
        new30: [] as { date: string; value: number }[],
        weekendBands: [] as { x1: string; x2: string }[],
        rolling7: [] as number[],
        bestDau: null as { date: string; value: number } | null,
        worstDau: null as { date: string; value: number } | null,
        peakMau: null as { date: string; value: number } | null,
        momRows: [] as { from: string; to: string; changePct: number | null }[],
        weekTotals: [] as { label: string; total: number }[],
        wowPct: null as number | null,
        dowAvgs: [] as { day: string; avg: number; dow: number }[],
        stickiness: null as number | null,
        takeaways: [] as string[],
      };
    }

    const newUsers30 = hasNewUsersKpi ? sumKpiNewUsers30(kpiRows) : sumNewUsers30d(sorted, anchor);
    const latest = sorted.find((r) => r.date === anchor) ?? sorted[sorted.length - 1];
    const mauLatest = hasMauKpi ? latestKpiValue(kpiRows, 'mau') : latest.mau;
    const dauLatest = hasDauKpi ? latestKpiValue(kpiRows, 'dau') : latest.dau;
    const mauPct = trendPercent(sorted, anchor, 'mau');
    const dauPct = trendPercent(sorted, anchor, 'dau');
    const tone = trendTone(dauPct, mauPct);

    const dau30 = windowSeries(sorted, anchor, 30, 'dau');
    const spark = dau30.map((d, i) => ({ i, v: d.value }));
    const values = dau30.map((d) => d.value);
    const rolling7 = rollingMean(values, 7);

    const weekendBands: { x1: string; x2: string }[] = [];
    for (let i = 0; i < dau30.length - 1; i++) {
      if (dau30[i].dow === 6 && dau30[i + 1].dow === 0) {
        weekendBands.push({ x1: dau30[i].date, x2: dau30[i + 1].date });
      }
    }

    let bestDau: { date: string; value: number } | null = null;
    let worstDau: { date: string; value: number } | null = null;
    for (const d of dau30) {
      if (!bestDau || d.value > bestDau.value) bestDau = { date: d.date, value: d.value };
      if (!worstDau || d.value < worstDau.value) worstDau = { date: d.date, value: d.value };
    }

    const mauSlice = sliceLastDays(sorted, anchor, 90);
    const mau90 = mauSlice.map((r) => ({ date: r.date, value: r.mau }));
    let peakMau: { date: string; value: number } | null = null;
    for (const r of mau90) {
      if (!peakMau || r.value > peakMau.value) peakMau = { date: r.date, value: r.value };
    }

    const byMonth = new Map<string, { sum: number; n: number }>();
    for (const r of mauSlice) {
      const ym = r.date.slice(0, 7);
      const cur = byMonth.get(ym) ?? { sum: 0, n: 0 };
      cur.sum += r.mau;
      cur.n += 1;
      byMonth.set(ym, cur);
    }
    const monthKeys = [...byMonth.keys()].sort();
    const monthAvgs = monthKeys.map((k) => ({
      key: k,
      avg: byMonth.get(k)!.sum / byMonth.get(k)!.n,
    }));
    const momRows: { from: string; to: string; changePct: number | null }[] = [];
    for (let i = Math.max(0, monthAvgs.length - 3); i < monthAvgs.length - 1; i++) {
      const a = monthAvgs[i].avg;
      const b = monthAvgs[i + 1].avg;
      const changePct = a > 0 ? ((b - a) / a) * 100 : b > 0 ? 100 : null;
      const fromLabel = format(new Date(monthAvgs[i].key + '-01'), 'MMMM yyyy');
      const toLabel = format(new Date(monthAvgs[i + 1].key + '-01'), 'MMMM yyyy');
      momRows.push({ from: fromLabel, to: toLabel, changePct });
    }

    const new30 = windowSeries(sorted, anchor, 30, 'new_users');
    const nuVals = new30.map((d) => d.value);
    const maxNu = Math.max(...nuVals, 1);

    const weekTotals: { label: string; total: number }[] = [];
    for (let w = 0; w < 4; w++) {
      const start = w * 7;
      const chunk = new30.slice(start, start + 7);
      const total = chunk.reduce((s, d) => s + d.value, 0);
      weekTotals.push({ label: `Week ${w + 1}`, total });
    }
    const wowPct =
      weekTotals[2].total > 0
        ? ((weekTotals[3].total - weekTotals[2].total) / weekTotals[2].total) * 100
        : weekTotals[3].total > 0
          ? 100
          : null;

    const dowSum = new Array(7).fill(0);
    const dowN = new Array(7).fill(0);
    for (const d of dau30) {
      dowSum[d.dow] += d.value;
      dowN[d.dow] += 1;
    }
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowAvgs = labels.map((day, dow) => ({
      day,
      avg: dowN[dow] ? dowSum[dow] / dowN[dow] : 0,
      dow,
    }));
    const reordered = [...dowAvgs.slice(1), dowAvgs[0]];

    const stickiness = mauLatest > 0 ? (dauLatest / mauLatest) * 100 : null;

    let summary = '';
    if (tone === 'decline') {
      summary = 'User activity is declining week-over-week across DAU and MAU.';
    } else if (tone === 'grow') {
      summary = 'Strong growth — DAU and MAU averages are up versus the prior 7-day window.';
    } else {
      summary = 'Mixed signals — DAU and MAU are moving in different directions week-over-week.';
    }

    const takeaways: string[] = [];
    if (dauPct != null) {
      takeaways.push(
        `DAU has ${dauPct >= 0 ? 'grown' : 'declined'} ${Math.abs(dauPct).toFixed(1)}% vs the prior 7-day average (trailing windows).`,
      );
    }
    const bestNu = [...new30].sort((a, b) => b.value - a.value)[0];
    if (bestNu && bestNu.value > 0) {
      takeaways.push(
        `Best new user day was ${format(new Date(bestNu.date + 'T12:00:00'), 'MMM d, yyyy')} with ${bestNu.value.toLocaleString()} signups.`,
      );
    }
    if (stickiness != null) {
      const healthy = stickiness >= 10;
      takeaways.push(
        `Stickiness (DAU ÷ MAU) is ${stickiness.toFixed(2)}% — ${healthy ? 'at or above' : 'below'} the ~10% healthy engagement rule of thumb.`,
      );
    }
    if (peakMau) {
      const vsPeak = peakMau.value > 0 ? ((mauLatest - peakMau.value) / peakMau.value) * 100 : 0;
      takeaways.push(
        `MAU peaked on ${format(new Date(peakMau.date + 'T12:00:00'), 'MMM d, yyyy')} at ${peakMau.value.toLocaleString()}; latest MAU is ${vsPeak >= 0 ? '+' : ''}${vsPeak.toFixed(1)}% vs that peak.`,
      );
    }
    const wd = reordered.filter((d) => d.dow >= 1 && d.dow <= 5);
    const we = reordered.filter((d) => d.dow === 0 || d.dow === 6);
    const wdAvg = wd.length ? wd.reduce((s, x) => s + x.avg, 0) / wd.length : 0;
    const weAvg = we.length ? we.reduce((s, x) => s + x.avg, 0) / we.length : 0;
    if (wdAvg > 0 && weAvg >= 0) {
      const drop = ((weAvg - wdAvg) / wdAvg) * 100;
      takeaways.push(`Weekend DAU averages ${Math.abs(drop).toFixed(1)}% ${drop < 0 ? 'lower' : 'higher'} than weekday DAU (last 30 days).`);
    }

    return {
      newUsers30,
      mauLatest,
      dauLatest,
      mauPct,
      dauPct,
      spark,
      summary,
      tone,
      dau30: dau30.map((d, i) => ({
        date: d.date,
        dau: d.value,
        roll7: rolling7[i],
        label: format(new Date(`${d.date}T12:00:00`), 'MMM d'),
      })),
      mau90: mau90.map((r) => ({
        ...r,
        label: format(new Date(`${r.date}T12:00:00`), 'MMM d'),
      })),
      new30: new30.map((d) => {
        const intensity = maxNu > 0 ? d.value / maxNu : 0;
        // Single teal ramp: quiet days = soft mint, busy days = deep teal (readable in light & dark).
        const fill =
          intensity >= 0.75
            ? 'hsl(168 72% 38%)'
            : intensity >= 0.5
              ? 'hsl(168 58% 46%)'
              : intensity >= 0.25
                ? 'hsl(168 42% 58%)'
                : 'hsl(168 28% 72%)';
        return {
          ...d,
          label: format(new Date(`${d.date}T12:00:00`), 'MMM d'),
          fill,
        };
      }),
      weekendBands,
      rolling7,
      bestDau,
      worstDau,
      peakMau,
      momRows,
      weekTotals,
      wowPct,
      dowAvgs: reordered,
      stickiness,
      takeaways: takeaways.slice(0, 5),
    };
  }, [sorted, anchor, kpiRows, hasDauKpi, hasMauKpi, hasNewUsersKpi]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (!clientId && !clientLoading) {
    return null;
  }

  if (loading) {
    return (
      <Card className={dashSkeletonCard}>
        <div className={dashboardTopAccentClass} aria-hidden />
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-48 rounded-md bg-primary/12" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Skeleton className="h-24 w-full rounded-xl bg-muted/60" />
            <Skeleton className="h-24 w-full rounded-xl bg-muted/60" />
            <Skeleton className="h-24 w-full rounded-xl bg-muted/60" />
          </div>
          <Skeleton className="h-12 w-full rounded-xl bg-muted/50" />
          <Skeleton className="h-4 w-2/3 rounded-md bg-muted/50" />
        </CardContent>
      </Card>
    );
  }

  if (!sorted.length) {
    return (
      <Card className={dashboardEmptyWarningCard}>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground font-heading">User Growth</p>
          <p className="mt-1.5 leading-relaxed">
            No Braze usage analytics rows yet. Import usage CSV on onboarding or run sync — same source as the Analytics tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bgTrend =
    derived.tone === 'grow'
      ? 'from-success/[0.10] via-primary/[0.05] to-card'
      : derived.tone === 'decline'
        ? 'from-destructive/[0.08] via-primary/[0.04] to-card'
        : 'from-warning/[0.10] via-primary/[0.05] to-card';

  const trendRing =
    derived.tone === 'grow'
      ? dashTrendRingGrow
      : derived.tone === 'decline'
        ? dashTrendRingDecline
        : dashTrendRingMixed;

  return (
    <>
      <button type="button" onClick={() => setDrawerOpen(true)} className={cn(dashHeroButton, trendRing)}>
        <div className={dashboardTopAccentClass} aria-hidden />
        <div className={cn('bg-gradient-to-br', bgTrend)}>
          <Card className="border-0 shadow-none bg-transparent">
            <CardContent className="p-5 sm:p-7 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight text-foreground">
                    User Growth
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={dashPill}>Live</span>
                    <span className="text-xs text-muted-foreground">Braze KPI sync</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className={cn(dashTileSuccess, 'p-4')}>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    <span className={cn(dashIconChipSuccess, 'h-7 w-7 shrink-0')}>
                      <UserPlus className="h-3.5 w-3.5" />
                    </span>
                    New Users (30d)
                  </div>
                  <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                    {derived.newUsers30.toLocaleString()}
                  </p>
                </div>
                <div className={cn(dashTilePrimary, 'p-4')}>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    <span className={cn(dashIconChip, 'h-7 w-7 shrink-0')}>
                      <Users className="h-3.5 w-3.5" />
                    </span>
                    MAU
                  </div>
                  <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                    {derived.mauLatest.toLocaleString()}
                  </p>
                  <div className="mt-2">
                    <PctBadge pct={derived.mauPct} />
                  </div>
                </div>
                <div className={cn(dashTileAccent, 'p-4')}>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    <span className={cn(dashIconChipAccent, 'h-7 w-7 shrink-0')}>
                      <Activity className="h-3.5 w-3.5" />
                    </span>
                    DAU
                  </div>
                  <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                    {derived.dauLatest.toLocaleString()}
                  </p>
                  <div className="mt-2">
                    <PctBadge pct={derived.dauPct} />
                  </div>
                </div>
              </div>

              <div className={dashSparklineBox}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 mb-2">DAU · last 30 days</p>
                <SparklineDau data={derived.spark} />
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">{derived.summary}</p>

              <div className="flex justify-end pt-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition group-hover:gap-2">
                  View details
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-[100vw] sm:max-w-[700px] sm:w-[700px] overflow-y-auto p-0 gap-0 flex flex-col"
        >
          {rowsLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : (
            <>
              <SheetHeader
                className={cn('p-0 text-left space-y-0 bg-gradient-to-r from-primary/[0.07] via-card to-card', dashSectionTitleBorder)}
              >
                <div className={dashSheetHeaderAccent} aria-hidden />
                <div className="p-6 pb-4 space-y-2">
                  <SheetTitle className="text-xl font-heading tracking-tight">User Growth</SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={dashLivePillSoft}>Live</span>
                    <span>Braze usage analytics (synced)</span>
                  </SheetDescription>
                </div>
              </SheetHeader>

              <div className="px-6 py-6 space-y-10 flex-1">
                <section className="space-y-4">
                  <SectionTitle>Snapshot</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className={cn(dashTileSuccess, 'p-4')}>
                      <p className="text-xs text-muted-foreground font-medium">New Users (30d)</p>
                      <p className="text-2xl font-bold tabular-nums mt-1">{derived.newUsers30.toLocaleString()}</p>
                    </div>
                    <div className={cn(dashTilePrimary, 'p-4')}>
                      <p className="text-xs text-muted-foreground font-medium">MAU (latest)</p>
                      <p className="text-2xl font-bold tabular-nums mt-1">{derived.mauLatest.toLocaleString()}</p>
                      <div className="mt-2">
                        <PctBadge pct={derived.mauPct} />
                      </div>
                    </div>
                    <div className={cn(dashTileAccent, 'p-4')}>
                      <p className="text-xs text-muted-foreground font-medium">DAU (latest)</p>
                      <p className="text-2xl font-bold tabular-nums mt-1">{derived.dauLatest.toLocaleString()}</p>
                      <div className="mt-2">
                        <PctBadge pct={derived.dauPct} />
                      </div>
                    </div>
                  </div>
                  {derived.stickiness != null && (
                    <div className={dashStickinessPanel}>
                      <span className="font-semibold text-foreground">Stickiness</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-bold tabular-nums">{derived.stickiness.toFixed(2)}%</span>
                      <span className="text-xs text-muted-foreground"> (DAU ÷ MAU)</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        Higher means more daily engagement relative to monthly active users.
                      </p>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <SectionTitle>DAU trend (30 days)</SectionTitle>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={derived.dau30} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(d: string) => format(new Date(`${d}T12:00:00`), 'MMM d')}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 10 }} width={36} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8 }}
                          labelFormatter={(d: string) => format(new Date(`${d}T12:00:00`), 'MMM d, yyyy')}
                          formatter={(v: number, name: string) => [
                            v.toLocaleString(),
                            name === '7-day average' || name === 'roll7' ? '7d rolling avg' : 'DAU',
                          ]}
                        />
                        {derived.weekendBands.map((b, i) => (
                          <ReferenceArea
                            key={`${b.x1}-${b.x2}-${i}`}
                            x1={b.x1}
                            x2={b.x2}
                            strokeOpacity={0}
                            fill="hsl(var(--muted))"
                            fillOpacity={0.25}
                          />
                        ))}
                        <Line type="monotone" dataKey="dau" name="DAU" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                        <Line
                          type="monotone"
                          dataKey="roll7"
                          name="7-day average"
                          stroke="hsl(var(--muted-foreground))"
                          dot={false}
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                        {derived.bestDau && (
                          <ReferenceDot
                            x={derived.bestDau.date}
                            y={derived.bestDau.value}
                            r={5}
                            fill="hsl(var(--success))"
                            stroke="hsl(var(--card))"
                            strokeWidth={2}
                          />
                        )}
                        {derived.worstDau && (
                          <ReferenceDot
                            x={derived.worstDau.date}
                            y={derived.worstDau.value}
                            r={5}
                            fill="hsl(var(--destructive))"
                            stroke="hsl(var(--card))"
                            strokeWidth={2}
                          />
                        )}
                        <Legend />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {derived.bestDau && (
                      <span>
                        Best DAU: <strong className="text-foreground">{derived.bestDau.value.toLocaleString()}</strong>{' '}
                        on {format(new Date(derived.bestDau.date + 'T12:00:00'), 'MMM d')}
                      </span>
                    )}
                    {derived.worstDau && (
                      <span>
                        Worst DAU: <strong className="text-foreground">{derived.worstDau.value.toLocaleString()}</strong>{' '}
                        on {format(new Date(derived.worstDau.date + 'T12:00:00'), 'MMM d')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Shaded bands = weekends. Dots mark best / worst day in the window.</p>
                </section>

                <section className="space-y-3">
                  <SectionTitle>MAU trend (90 days)</SectionTitle>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={derived.mau90} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(d: string) => format(new Date(`${d}T12:00:00`), 'MMM d')}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 10 }} width={36} />
                        <Tooltip
                          labelFormatter={(d: string) => format(new Date(`${d}T12:00:00`), 'MMM d, yyyy')}
                          formatter={(v: number) => [v.toLocaleString(), 'MAU']}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="hsl(var(--accent-foreground))"
                          dot={false}
                          strokeWidth={2}
                        />
                        {derived.peakMau && (
                          <ReferenceDot
                            x={derived.peakMau.date}
                            y={derived.peakMau.value}
                            r={6}
                            fill="hsl(var(--accent-foreground))"
                            stroke="hsl(var(--card))"
                            strokeWidth={2}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {derived.peakMau && (
                    <p className="text-xs text-muted-foreground">
                      Peak MAU: <strong className="text-foreground">{derived.peakMau.value.toLocaleString()}</strong> on{' '}
                      {format(new Date(derived.peakMau.date + 'T12:00:00'), 'MMM d, yyyy')}
                    </p>
                  )}
                  {derived.momRows.length > 0 && (
                    <div className={dashTableShell}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="p-2 pl-3">Period</th>
                            <th className="p-2 text-right pr-3">MoM Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {derived.momRows.map((r) => (
                            <tr key={`${r.from}-${r.to}`} className="border-t border-border/60">
                              <td className="p-2 pl-3">
                                {r.from} → {r.to}
                              </td>
                              <td className="p-2 text-right pr-3 tabular-nums font-medium">
                                {r.changePct == null
                                  ? '—'
                                  : `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(1)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="space-y-4 rounded-2xl border border-border/50 bg-gradient-to-b from-teal-500/[0.06] via-card to-card p-4 sm:p-5 ring-1 ring-inset ring-teal-500/10">
                  <div>
                    <SectionTitle>New signups by day</SectionTitle>
                    <p className="text-xs text-muted-foreground pl-5 -mt-1 leading-relaxed">
                      Last 30 days · darker bars = more new users that day
                    </p>
                  </div>
                  <div className="h-52 w-full rounded-xl border border-border/40 bg-card/80 p-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={derived.new30} margin={{ top: 10, right: 6, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                          interval={4}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          width={40}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
                          contentStyle={{
                            borderRadius: 10,
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--card))',
                            fontSize: 12,
                            boxShadow: '0 4px 14px rgb(0 0 0 / 0.08)',
                          }}
                          labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                          formatter={(v: number) => [v.toLocaleString(), 'New users']}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
                          {derived.new30.map((e, i) => (
                            <Cell key={i} fill={e.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">Four-week totals</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {derived.weekTotals.map((w) => (
                        <div
                          key={w.label}
                          className="rounded-xl border border-teal-500/15 bg-teal-500/[0.06] px-3 py-3 text-center shadow-sm"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800/80 dark:text-teal-200/90">
                            {w.label}
                          </p>
                          <p className="mt-1.5 text-base sm:text-lg font-bold tabular-nums text-foreground">
                            {w.total.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">signups</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm',
                      derived.wowPct == null
                        ? 'border-border/60 bg-muted/30 text-muted-foreground'
                        : derived.wowPct >= 0
                          ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-foreground'
                          : 'border-amber-500/25 bg-amber-500/[0.08] text-foreground',
                    )}
                  >
                    {derived.wowPct != null && derived.wowPct >= 0 ? (
                      <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    ) : derived.wowPct != null ? (
                      <TrendingDown className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                    ) : null}
                    <span>
                      <span className="font-semibold">Week 4 vs week 3:</span>{' '}
                      {derived.wowPct == null ? (
                        'not enough data'
                      ) : (
                        <span className="tabular-nums font-bold">
                          {derived.wowPct >= 0 ? '+' : ''}
                          {derived.wowPct.toFixed(1)}%
                        </span>
                      )}
                    </span>
                    {derived.wowPct != null && (
                      <span className="text-xs text-muted-foreground">(last week compared to the week before)</span>
                    )}
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-border/50 bg-gradient-to-b from-sky-500/[0.05] via-card to-card p-4 sm:p-5 ring-1 ring-inset ring-sky-500/10">
                  <div>
                    <SectionTitle>Busiest days of the week</SectionTitle>
                    <p className="text-xs text-muted-foreground pl-5 -mt-1 leading-relaxed">
                      Average DAU per weekday · last 30 days · longer bar = more daily active users
                    </p>
                  </div>
                  <div className="h-56 w-full rounded-xl border border-border/40 bg-card/80 p-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={derived.dowAvgs}
                        margin={{ top: 8, right: 20, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="day"
                          width={40}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
                          contentStyle={{
                            borderRadius: 10,
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--card))',
                            fontSize: 12,
                            boxShadow: '0 4px 14px rgb(0 0 0 / 0.08)',
                          }}
                          formatter={(v: number) => [v.toLocaleString(undefined, { maximumFractionDigits: 0 }), 'Avg DAU']}
                        />
                        <Bar dataKey="avg" radius={[0, 6, 6, 0]} maxBarSize={22}>
                          {derived.dowAvgs.map((e, i) => {
                            const avgs = derived.dowAvgs.map((d) => d.avg);
                            const max = Math.max(...avgs, 1);
                            const t = max > 0 ? e.avg / max : 0;
                            const s = 52 + t * 28;
                            const l = 58 - t * 22;
                            const fill = `hsl(210 ${Math.round(s)}% ${Math.round(l)}%)`;
                            return <Cell key={i} fill={fill} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
