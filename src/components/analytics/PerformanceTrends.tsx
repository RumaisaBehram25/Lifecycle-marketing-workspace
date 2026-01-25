import { useMemo } from "react";
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

function formatTick(date: string) {
  try {
    return formatDate(parseISO(date), "MMM d");
  } catch {
    return date;
  }
}

export function PerformanceTrends({ data }: { data: CampaignDailyTrendPoint[] }) {
  const chartData = useMemo(() => {
    // Ensure consistent ordering even if backend sends unordered dates.
    return [...data].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  if (!chartData.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Performance Trends</CardTitle>
        <CardDescription>Daily totals for the selected window (time-series is limited to 14 days).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={formatTick} className="text-xs" minTickGap={16} />
              <YAxis className="text-xs" width={44} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
                labelFormatter={(label) => formatTick(String(label))}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="unique_opens"
                name="Unique opens"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="unique_clicks"
                name="Unique clicks"
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
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
