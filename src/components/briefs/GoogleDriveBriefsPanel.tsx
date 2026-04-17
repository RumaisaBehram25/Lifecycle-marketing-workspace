import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FolderOpen, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const { isAdmin } = useAuth();
  const { data: connections = [] } = useQuery({
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
    [driveBriefs],
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

      <CardContent className="p-0">
        {!configured ? (
          <div className="py-14 px-5 sm:px-6 text-center border-t border-border/60">
            <div className={cn(dashIconChip, 'mx-auto mb-4 h-14 w-14 rounded-2xl text-primary/50')}>
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-foreground">Google Drive is not configured</h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
              {isAdmin ? (
                <>
                  Add an API key and folders in{' '}
                  <Link to="/settings?tab=integrations" className="text-primary font-medium underline-offset-4 hover:underline">
                    Settings → Integrations
                  </Link>
                  , then save to sync files here.
                </>
              ) : (
                'Ask a workspace admin to connect Google Drive in Settings → Integrations.'
              )}
            </p>
          </div>
        ) : !hasBriefs && isFetching ? (
          <div className="py-14 px-5 sm:px-6 flex flex-col items-center gap-3 text-muted-foreground border-t border-border/60">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : !hasBriefs ? (
          <div className="py-14 px-5 sm:px-6 text-center border-t border-border/60">
            <p className="text-sm text-muted-foreground">
              {driveBriefs.length > 0
                ? 'No document files in this folder yet (only subfolders were synced).'
                : 'No files to show yet.'}
            </p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-3">
                Change folders or re-sync from{' '}
                <Link to="/settings?tab=integrations" className="text-primary underline-offset-4 hover:underline">
                  Settings → Integrations
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <div className="max-h-[min(520px,62vh)] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] border-t border-border/60">
            <div className="px-5 sm:px-6 py-4 space-y-3 w-full">
              {driveFilesOnly.map((brief) => (
                <DriveBriefCard key={brief.id} brief={brief} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
