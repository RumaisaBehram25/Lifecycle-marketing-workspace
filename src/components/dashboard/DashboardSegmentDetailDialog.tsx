import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { BrazeSegmentDirectoryRichRow } from '@/hooks/useBrazeSegmentsDirectoryRich';
import { cn } from '@/lib/utils';

function pickDetailsExport(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  const d = raw?.braze_export_segment_details;
  if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>;
  return null;
}

function fmtIso(iso: string | undefined) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(t),
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  segment: BrazeSegmentDirectoryRichRow | null;
  latestSize: number | undefined;
};

export function DashboardSegmentDetailDialog({
  open,
  onOpenChange,
  clientId,
  segment,
  latestSize,
}: Props) {
  const segId = segment?.id;

  const { data: analyticsRows = [] } = useQuery({
    queryKey: ['braze_segment_analytics', 'segment-detail', clientId, segId],
    queryFn: async () => {
      if (!clientId || !segId) return [];
      const { data, error } = await (supabase as any)
        .from('braze_segment_analytics')
        .select('date, size, segment_name, created_at')
        .eq('client_id', clientId)
        .eq('segment_id', segId)
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        date?: string | null;
        size?: number | null;
        segment_name?: string | null;
        created_at?: string | null;
      }>;
    },
    enabled: open && !!clientId && !!segId,
    staleTime: 30_000,
  });

  if (!segment) return null;

  const details = pickDetailsExport(segment.raw);
  const description =
    (typeof details?.description === 'string' && details.description.trim()) ||
    (typeof details?.text_description === 'string' && details.text_description.trim()) ||
    '';
  const message = typeof details?.message === 'string' ? details.message : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] w-[min(100vw-2rem,560px)] gap-0 p-0 flex flex-col">
        <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle className="text-xl leading-snug pr-8">{segment.name}</DialogTitle>
          <p className="text-xs font-mono text-muted-foreground break-all">{segment.id}</p>
        </DialogHeader>

        <ScrollArea className="max-h-[min(78vh,640px)] px-6 py-4">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5">
              {segment.tags.length > 0 ?
                segment.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                    {t}
                  </Badge>
                ))
              : <span className="text-xs text-muted-foreground">No tags</span>}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  List synced
                </p>
                <p className="tabular-nums">{fmtIso(segment.syncedAt)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Latest size (analytics)
                </p>
                <p className="tabular-nums">
                  {latestSize != null ? latestSize.toLocaleString() : '—'}
                </p>
              </div>
            </div>

            {(description || message) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    From /segments/details export
                  </h4>
                  {message ?
                    <p className="text-xs text-muted-foreground mb-2">
                      <span className="font-medium text-foreground">Status:</span> {message}
                    </p>
                  : null}
                  {description ?
                    <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                      {description}
                    </p>
                  : (
                    !message && (
                      <p className="text-xs text-muted-foreground">No description in export payload.</p>
                    )
                  )}
                  {(details?.created_at || details?.updated_at) && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Export updated{' '}
                      {details?.updated_at ?
                        fmtIso(String(details.updated_at))
                      : fmtIso(String(details?.created_at))}
                    </p>
                  )}
                </div>
              </>
            )}

            {analyticsRows.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Segment analytics (`braze_segment_analytics`)
                  </h4>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    data_series snapshots / CSV — newest first (up to 50 rows).
                  </p>
                  <div className="rounded-lg border border-border/60 overflow-hidden text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-1.5 font-medium">Date</th>
                          <th className="px-2 py-1.5 font-medium text-right">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsRows.map((r, i) => (
                          <tr
                            key={`${r.date}-${i}`}
                            className={cn('border-t border-border/50', i % 2 === 1 && 'bg-muted/20')}
                          >
                            <td className="px-2 py-1.5 tabular-nums">{String(r.date ?? '—')}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {r.size != null ? Number(r.size).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
