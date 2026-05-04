import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBrazeCustomEventDetail } from '@/hooks/useBrazeCustomEventDetail';
import { cn } from '@/lib/utils';

function fmtIso(iso: string | null | undefined) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(t),
  );
}

function dayOnlyUtc(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return new Date(t).toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  eventName: string | null;
};

export function DashboardCustomEventDetailDialog({
  open,
  onOpenChange,
  clientId,
  eventName,
}: Props) {
  const { data, isLoading, isError } = useBrazeCustomEventDetail(clientId, eventName, open);

  const byDay = useMemo(() => {
    if (!data?.series?.length) return [];
    return data.series.map((r) => ({
      day: dayOnlyUtc(r.bucket_at),
      event_count: r.event_count,
    }));
  }, [data?.series]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[min(90vh,720px)] w-[min(100vw-2rem,56rem)] flex flex-col gap-0 p-0',
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0 space-y-1">
          <DialogTitle className="pr-8 text-left leading-snug">
            {eventName ?? 'Custom event'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-left font-normal">
            braze_custom_events + braze_custom_event_series (same as your SQL checks)
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[min(72vh,640px)] px-6 pb-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive py-6">Could not load event detail.</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground py-6">No data for this event.</p>
          ) : (
            <div className="space-y-6 pr-3">
              {/* 4) Directory row match */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Directory row (braze_custom_events)
                </h3>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground w-[40%]">event_name</TableCell>
                      <TableCell className="font-medium">{data.event_name}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">synced_at (directory)</TableCell>
                      <TableCell className="tabular-nums text-xs">{fmtIso(data.events_list_synced_at)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">GET /events status</TableCell>
                      <TableCell>{data.get_events_status ?? '—'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">data_series bucket count</TableCell>
                      <TableCell className="tabular-nums">{data.data_series_buckets}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </section>

              <Separator />

              {/* 3) Totals */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Totals (series)
                </h3>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground">bucket_rows</TableCell>
                      <TableCell className="tabular-nums">{data.totals.bucket_rows}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">sum(event_count)</TableCell>
                      <TableCell className="tabular-nums">{data.totals.sum_counts}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">min(bucket_at)</TableCell>
                      <TableCell className="tabular-nums text-xs">{fmtIso(data.totals.first_bucket_at)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">max(bucket_at)</TableCell>
                      <TableCell className="tabular-nums text-xs">{fmtIso(data.totals.last_bucket_at)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </section>

              <Separator />

              {/* 2) By day */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  By day (bucket_at::date, event_count)
                </h3>
                <div className="rounded-md border max-h-48 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">day</TableHead>
                        <TableHead className="text-xs text-right">event_count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byDay.map((row) => (
                        <TableRow key={row.day}>
                          <TableCell className="tabular-nums text-xs py-1.5">{row.day}</TableCell>
                          <TableCell className="tabular-nums text-xs text-right py-1.5">
                            {row.event_count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <Separator />

              {/* 1) Full series rows */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  All series rows (braze_custom_event_series)
                </h3>
                <div className="rounded-md border max-h-56 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] whitespace-nowrap">bucket_at</TableHead>
                        <TableHead className="text-[10px] text-right">event_count</TableHead>
                        <TableHead className="text-[10px]">unit</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">series_ending_at</TableHead>
                        <TableHead className="text-[10px] whitespace-nowrap">synced_at</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.series.map((r, i) => (
                        <TableRow key={`${r.bucket_at}-${i}`}>
                          <TableCell className="tabular-nums text-[10px] py-1 whitespace-nowrap">
                            {r.bucket_at}
                          </TableCell>
                          <TableCell className="tabular-nums text-[10px] text-right py-1">
                            {r.event_count}
                          </TableCell>
                          <TableCell className="text-[10px] py-1">{r.unit}</TableCell>
                          <TableCell className="tabular-nums text-[10px] py-1 whitespace-nowrap">
                            {r.series_ending_at ?? '—'}
                          </TableCell>
                          <TableCell className="tabular-nums text-[10px] py-1 whitespace-nowrap">
                            {r.synced_at ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <p className="text-[11px] text-muted-foreground pt-2">
                Window and bucket count come from the Edge sync (length/unit/ending_at). This is not full
                Braze history unless you extend the sync.
              </p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
