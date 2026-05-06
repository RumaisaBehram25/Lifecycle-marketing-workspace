import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FolderOpen, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DriveBriefCard } from '@/components/briefs/DriveBriefCard';
import type { DriveBrief } from '@/hooks/useDriveBriefs';
import { countSyncedDriveFiles } from '@/hooks/useDriveBriefs';
import { cn } from '@/lib/utils';
import {
  dashIconChip,
  dashSectionTitleBorder,
  dashWashHeaderDown,
  dashboardSurfaceCard,
  dashboardTopAccentClass,
} from '@/lib/dashboard-surface';

interface GoogleDriveBriefsPanelProps {
  clientId: string | undefined;
  driveBriefs: DriveBrief[];
  isFetching: boolean;
}

type DriveConnectionRow = { id: string; folder_id: string; folder_name: string | null; folder_url: string | null };

export function GoogleDriveBriefsPanel({ clientId, driveBriefs, isFetching }: GoogleDriveBriefsPanelProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: connections = [], refetch: refetchConnections } = useQuery({
    queryKey: ['drive-connections', clientId ?? ''],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return [] as DriveConnectionRow[];
      const { data, error } = await (supabase as any)
        .from('client_google_drive')
        .select('id, folder_id, folder_name, folder_url, connected_at')
        .eq('client_id', clientId)
        .order('connected_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DriveConnectionRow[];
    },
  });

  const driveFilesOnly = useMemo(
    () => driveBriefs.filter((b) => (b.file_type ?? 'file') !== 'folder'),
    [driveBriefs]
  );
  const hasBriefs = driveFilesOnly.length > 0;

  const folderIdToDisplayName = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of driveBriefs) {
      if (b.folder_id && b.folder_name && !m.has(b.folder_id)) {
        m.set(b.folder_id, b.folder_name);
      }
    }
    return m;
  }, [driveBriefs]);

  const folderNameBySlotId = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of driveBriefs) {
      if (b.slot_id && b.folder_name && !m.has(b.slot_id)) {
        m.set(b.slot_id, b.folder_name);
      }
    }
    return m;
  }, [driveBriefs]);

  const handleRemoveSlot = (slotId: string) => {
    const run = async () => {
      if (!clientId) return;
      const { error } = await (supabase as any)
        .from('client_google_drive')
        .delete()
        .eq('client_id', clientId)
        .eq('id', slotId);
      if (error) throw error;
      await refetchConnections();
      queryClient.invalidateQueries({ queryKey: ['drive-briefs', clientId ?? ''] });
      toast({ title: 'Connection removed' });
    };
    run().catch((e: any) => {
      toast({ title: 'Could not remove connection', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    });
  };

  const configured = connections.length > 0;
  const syncedFileCount = useMemo(() => countSyncedDriveFiles(driveBriefs), [driveBriefs]);
  const totalSyncedRows = driveBriefs.length;

  return (
    <Card className={cn('w-full', dashboardSurfaceCard)}>
      <div className={dashboardTopAccentClass} aria-hidden />
      <CardHeader
        className={cn(
          'relative space-y-0 px-5 sm:px-6 pt-5 pb-4',
          dashSectionTitleBorder,
          dashWashHeaderDown,
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div className={cn(dashIconChip, 'h-11 w-11 shrink-0 rounded-xl')}>
              <FileText className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <CardTitle className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-foreground">
                  Google Drive Briefs
                </CardTitle>
                {isFetching && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating
                  </span>
                )}
              </div>
              {configured && (
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  <span className="font-medium text-foreground">{syncedFileCount}</span>
                  {syncedFileCount === 1 ? ' file' : ' files'}
                  {totalSyncedRows > syncedFileCount
                    ? ` (${totalSyncedRows - syncedFileCount} folder${totalSyncedRows - syncedFileCount === 1 ? '' : 's'})`
                    : null}{' '}
                  synced from Drive
                </p>
              )}
              {configured && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                  {connections.map((r, i) => {
                    const displayName = folderIdToDisplayName.get(r.folder_id) ?? r.folder_name ?? r.folder_id;
                    return (
                      <span key={r.id} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span className="text-muted-foreground/50">·</span>}
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-muted/80 px-2 py-0.5 text-foreground font-medium ring-1 ring-border/60 max-w-[220px] sm:max-w-xs truncate"
                          title={displayName}
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                          {displayName}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      {connections.length > 0 && (
        <div className={cn('px-5 sm:px-6 py-4 border-b bg-muted/20 dark:bg-muted/10', dashSectionTitleBorder)}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Connected</p>
          <div className="flex flex-wrap gap-2.5">
            {connections.map((slot) => {
              const title = folderNameBySlotId.get(slot.id) ?? slot.folder_name ?? slot.folder_id;
              return (
                <div
                  key={slot.id}
                  className={cn(
                    'group relative flex min-w-[min(100%,200px)] max-w-[280px] flex-1 items-center gap-3 rounded-xl border border-border/70',
                    'bg-gradient-to-b from-card to-muted/20 px-3.5 py-3 pr-11',
                    'shadow-sm shadow-black/[0.04] dark:shadow-black/20',
                    'ring-1 ring-black/[0.03] dark:ring-white/[0.06]',
                    'transition-colors hover:border-primary/35 hover:ring-primary/10'
                  )}
                >
                  <div className={cn(dashIconChip, 'h-9 w-9 shrink-0 rounded-lg')}>
                    <FolderOpen className="h-[18px] w-[18px]" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="text-[13px] font-semibold leading-snug tracking-tight text-foreground truncate" title={title}>
                      {title}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-muted-foreground opacity-80 hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveSlot(slot.id)}
                    aria-label={`Remove ${title}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {!configured ? (
          <div className="py-14 px-5 sm:px-6 text-center">
            <div className={cn(dashIconChip, 'mx-auto mb-4 h-14 w-14 rounded-2xl text-primary/50')}>
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-foreground">Nothing to load yet</h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
              {isAdmin ? (
                <>
                  Go to{' '}
                  <Link
                    to="/settings?tab=integrations"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Settings → Integrations
                  </Link>
                  {' '}
                  to add your Google Drive API key and folders. After they sync, files from those folders appear here.
                </>
              ) : (
                <>
                  Google Drive for this workspace is configured by admins. Contact your administrator and ask them to add the API key and folders under Settings →
                  Integrations so synced files can appear here.
                </>
              )}
            </p>
          </div>
        ) : !hasBriefs && isFetching ? (
          <div className="py-14 px-5 sm:px-6 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : !hasBriefs ? (
          <div className="py-14 px-5 sm:px-6 text-center">
            <p className="text-sm text-muted-foreground">
              {driveBriefs.length > 0
                ? 'No document files in this folder yet (only subfolders were synced).'
                : 'No files to show yet.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[min(520px,62vh)] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
            <div className="px-5 sm:px-6 py-4 space-y-3 w-full">
              {driveFilesOnly.map(brief => (
                <DriveBriefCard key={brief.id} brief={brief} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
