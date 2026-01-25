import { useMemo, useState } from "react";
import { parseISO, format as formatDate } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export type CampaignDailyTrendPoint = {
  date: string; // YYYY-MM-DD
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
};

type MetricMode = "absolute" | "rates";

function formatTick(date: string) {
  try {
    return formatDate(parseISO(date), "MMM d");
  } catch {
    return date;
  }
}

function calcRate(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

interface TrendBadgeProps {
  current: number;
  previous: number;
  suffix?: string;
  higherIsBetter?: boolean;
}

function TrendBadge({ current, previous, suffix = "", higherIsBetter = true }: TrendBadgeProps) {
  if (previous === 0 && current === 0) {
    return <Badge variant="secondary" className="text-xs">-</Badge>;
  }
  
  const diff = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const isPositive = diff > 0;
  const isNegative = diff < 0;
  const isGood = higherIsBetter ? isPositive : isNegative;
  const isBad = higherIsBetter ? isNegative : isPositive;

  if (Math.abs(diff) < 0.5) {
    return (
      <Badge variant="secondary" className="text-xs gap-0.5">
        <Minus className="h-3 w-3" />
        0%{suffix}
      </Badge>
    );
  }

  return (
    <Badge 
      variant="secondary" 
      className={`text-xs gap-0.5 ${isGood ? "text-green-600 bg-green-500/10" : isBad ? "text-red-600 bg-red-500/10" : ""}`}
    >
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(diff).toFixed(1)}%{suffix}
    </Badge>
  );
}

interface PerformanceTrendsProps {
  data: CampaignDailyTrendPoint[];
  previousPeriodData?: CampaignDailyTrendPoint[];
}

export function PerformanceTrends({ data, previousPeriodData }: PerformanceTrendsProps) {
  const [mode, setMode] = useState<MetricMode>("rates");

  const chartData = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    
    if (mode === "rates") {
      return sorted.map((d) => ({
        date: d.date,
        open_rate: calcRate(d.unique_opens, d.deliveries),
        click_rate: calcRate(d.unique_clicks, d.deliveries),
        cto_rate: calcRate(d.unique_clicks, d.unique_opens),
      }));
    }
    
    return sorted;
  }, [data, mode]);

  // Calculate period totals for comparison
  // If previousPeriodData is provided, use it. Otherwise, split current data in half.
  const periodTotals = useMemo(() => {
    const sum = (arr: CampaignDailyTrendPoint[]) =>
      arr.reduce(
        (acc, d) => ({
          sends: acc.sends + d.sends,
          deliveries: acc.deliveries + d.deliveries,
          unique_opens: acc.unique_opens + d.unique_opens,
          unique_clicks: acc.unique_clicks + d.unique_clicks,
          conversions: acc.conversions + d.conversions,
          revenue: acc.revenue + d.revenue,
        }),
        { sends: 0, deliveries: 0, unique_opens: 0, unique_clicks: 0, conversions: 0, revenue: 0 }
      );

    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    
    // If we have explicit previous period data, use it
    if (previousPeriodData && previousPeriodData.length > 0) {
      const current = sum(sorted);
      const previous = sum(previousPeriodData);
      return {
        current: {
          ...current,
          open_rate: calcRate(current.unique_opens, current.deliveries),
          click_rate: calcRate(current.unique_clicks, current.deliveries),
        },
        previous: {
          ...previous,
          open_rate: calcRate(previous.unique_opens, previous.deliveries),
          click_rate: calcRate(previous.unique_clicks, previous.deliveries),
        },
        comparisonLabel: "vs previous period",
      };
    }
    
    // Otherwise, split the current data in half for first-half vs second-half comparison
    if (sorted.length >= 4) {
      const midpoint = Math.floor(sorted.length / 2);
      const firstHalf = sorted.slice(0, midpoint);
      const secondHalf = sorted.slice(midpoint);
      
      const previous = sum(firstHalf);
      const current = sum(secondHalf);
      
      return {
        current: {
          ...current,
          open_rate: calcRate(current.unique_opens, current.deliveries),
          click_rate: calcRate(current.unique_clicks, current.deliveries),
        },
        previous: {
          ...previous,
          open_rate: calcRate(previous.unique_opens, previous.deliveries),
          click_rate: calcRate(previous.unique_clicks, previous.deliveries),
        },
        comparisonLabel: "vs first half",
      };
    }

    // Not enough data for comparison
    const current = sum(sorted);
    return {
      current: {
        ...current,
        open_rate: calcRate(current.unique_opens, current.deliveries),
        click_rate: calcRate(current.unique_clicks, current.deliveries),
      },
      previous: null,
      comparisonLabel: "",
    };
  }, [data, previousPeriodData]);

  if (!chartData.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Performance Trends</CardTitle>
            <CardDescription>
              Daily metrics for the selected window (limited to 14 days by Braze API).
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Button
              variant={mode === "rates" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setMode("rates")}
            >
              Rates
            </Button>
            <Button
              variant={mode === "absolute" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setMode("absolute")}
            >
              Absolute
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Period comparison badges */}
        {periodTotals.previous && (
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Open Rate:</span>
              <span className="font-medium">{periodTotals.current.open_rate.toFixed(1)}%</span>
              <TrendBadge
                current={periodTotals.current.open_rate}
                previous={periodTotals.previous.open_rate}
                suffix={` ${periodTotals.comparisonLabel}`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Click Rate:</span>
              <span className="font-medium">{periodTotals.current.click_rate.toFixed(2)}%</span>
              <TrendBadge
                current={periodTotals.current.click_rate}
                previous={periodTotals.previous.click_rate}
                suffix={` ${periodTotals.comparisonLabel}`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Conversions:</span>
              <span className="font-medium">{periodTotals.current.conversions.toLocaleString()}</span>
              <TrendBadge
                current={periodTotals.current.conversions}
                previous={periodTotals.previous.conversions}
                suffix={` ${periodTotals.comparisonLabel}`}
              />
            </div>
          </div>
        )}

        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={formatTick} className="text-xs" minTickGap={16} />
              <YAxis
                className="text-xs"
                width={44}
                tickFormatter={(v) => (mode === "rates" ? `${v.toFixed(0)}%` : v.toLocaleString())}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
                labelFormatter={(label) => formatTick(String(label))}
                formatter={(value: number, name: string) => {
                  if (mode === "rates") {
                    return [`${value.toFixed(2)}%`, name];
                  }
                  return [value.toLocaleString(), name];
                }}
              />
              <Legend />
              {mode === "rates" ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="open_rate"
                    name="Open Rate"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="click_rate"
                    name="Click Rate"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cto_rate"
                    name="Click-to-Open"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="unique_opens"
                    name="Unique Opens"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="unique_clicks"
                    name="Unique Clicks"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="conversions"
                    name="Conversions"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
