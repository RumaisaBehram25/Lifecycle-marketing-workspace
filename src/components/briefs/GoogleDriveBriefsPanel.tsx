import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FolderOpen, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  extractGoogleDriveFolderId,
} from '@/lib/driveFolderLinks';
import { supabase } from '@/integrations/supabase/client';
import { DriveBriefCard } from '@/components/briefs/DriveBriefCard';
import type { DriveBrief } from '@/hooks/useDriveBriefs';
import { countSyncedDriveFiles } from '@/hooks/useDriveBriefs';
import { cn } from '@/lib/utils';
import {
  dashIconChip,
  dashRingInsetSoft,
  dashSectionTitleBorder,
  dashShadowSm,
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

async function fetchFolderName(apiKey: string, folderId: string): Promise<string | null> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=name&key=${encodeURIComponent(apiKey)}`);
  const data = await res.json();
  if (data?.error) return null;
  const name = data?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

async function fetchFilesFromFolder(apiKey: string, folderId: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${encodeURIComponent(apiKey)}&fields=files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,modifiedTime)&orderBy=createdTime+desc`
  );
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || 'Google Drive API error');
  return (data.files ?? []) as Array<{
    id: string;
    name: string;
    mimeType?: string;
    thumbnailLink?: string;
    webViewLink?: string;
    createdTime?: string;
    modifiedTime?: string;
  }>;
}

export function GoogleDriveBriefsPanel({ clientId, driveBriefs, isFetching }: GoogleDriveBriefsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [folderId, setFolderId] = useState('');
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

  useEffect(() => {
    setApiKey('');
    setFolderId('');
  }, [clientId]);

  const handleSave = () => {
    const run = async () => {
      if (!clientId) {
        toast({ title: 'No client selected', variant: 'destructive' });
        return;
      }
    const key = apiKey.trim();
    if (!key) {
      toast({ title: 'Google Drive API key is required', variant: 'destructive' });
      return;
    }
    const folder = folderId.trim();
    if (!folder) {
      toast({ title: 'Folder ID or link is required', variant: 'destructive' });
      return;
    }
    if (!extractGoogleDriveFolderId(folder)) {
      toast({ title: 'Invalid folder ID or URL', variant: 'destructive' });
      return;
    }
      const parsedFolderId = extractGoogleDriveFolderId(folder)!;
      const realFolderName = await fetchFolderName(key, parsedFolderId);

      const { data: conn, error: connErr } = await (supabase as any)
        .from('client_google_drive')
        .insert({
          client_id: clientId,
          folder_id: parsedFolderId,
          folder_name: realFolderName ?? null,
          folder_url: folder,
          status: 'connected',
          last_synced_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (connErr) throw connErr;

      const files = await fetchFilesFromFolder(key, parsedFolderId);
      if (files.length > 0) {
        const payload = files.map((f) => ({
          client_id: clientId,
          drive_connection_id: conn.id,
          file_id: f.id,
          file_name: f.name,
          file_type: (f.mimeType || '').includes('folder') ? 'folder' : 'file',
          mime_type: f.mimeType ?? null,
          thumbnail_url: f.thumbnailLink ?? null,
          web_view_link: f.webViewLink ?? null,
          created_time: f.createdTime ?? null,
          modified_time: f.modifiedTime ?? null,
          synced_at: new Date().toISOString(),
        }));
        const { error: upErr } = await (supabase as any)
          .from('client_drive_files')
          .upsert(payload, { onConflict: 'client_id,file_id' });
        if (upErr) throw upErr;
      }

      await (supabase as any)
        .from('client_google_drive')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', conn.id);

      await refetchConnections();
    setApiKey('');
    setFolderId('');
    queryClient.invalidateQueries({ queryKey: ['drive-briefs', clientId ?? ''] });
    toast({ title: 'Saved' });
    };
    run().catch((e: any) => {
      toast({ title: 'Could not sync Drive folder', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    });
  };

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

  const handleClearAll = () => {
    const run = async () => {
      if (!clientId) return;
      const { error } = await (supabase as any)
        .from('client_google_drive')
        .delete()
        .eq('client_id', clientId);
      if (error) throw error;
      await refetchConnections();
      setApiKey('');
      setFolderId('');
      queryClient.setQueryData(['drive-briefs', clientId ?? ''], []);
      queryClient.invalidateQueries({ queryKey: ['drive-briefs', clientId ?? ''] });
      toast({ title: 'All Drive connections cleared' });
    };
    run().catch((e: any) => {
      toast({ title: 'Could not clear connections', description: e?.message ?? 'Unknown error', variant: 'destructive' });
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
          'relative space-y-0 px-5 sm:px-6 pt-5 pb-4 pr-12 sm:pr-14',
          dashSectionTitleBorder,
          dashWashHeaderDown,
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={handleClearAll}
          aria-label="Clear all Drive connections"
          title="Clear all saved connections and list"
        >
          <X className="h-4 w-4" />
        </Button>
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

      <div className={cn('px-5 sm:px-6 py-5 border-b bg-muted/20 dark:bg-muted/10', dashSectionTitleBorder)}>
        <div className={cn('rounded-xl border border-border/60 bg-card/90 p-4 space-y-4', dashRingInsetSoft, dashShadowSm)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1 basis-[200px] space-y-2">
              <Label htmlFor="google-drive-api-key" className="text-xs font-medium text-muted-foreground">
                Google Drive API key
              </Label>
              <Input
                id="google-drive-api-key"
                type="password"
                autoComplete="off"
                placeholder="AIza…"
                className="h-10 font-mono text-sm"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
            <div className="min-w-0 flex-1 basis-[200px] space-y-2">
              <Label htmlFor="google-drive-folder" className="text-xs font-medium text-muted-foreground">
                Folders
              </Label>
              <Input
                id="google-drive-folder"
                type="password"
                autoComplete="off"
                placeholder="Folder ID or share link"
                className="h-10 font-mono text-xs sm:text-sm"
                value={folderId}
                onChange={e => setFolderId(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto sm:shrink-0 min-w-[88px] sm:mb-0.5"
              size="default"
              onClick={handleSave}
            >
              Save
            </Button>
          </div>

          {connections.length > 0 && (
            <div className="pt-4 border-t border-border/60 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Connected</p>
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
        </div>
      </div>

      <CardContent className="p-0">
        {!configured ? (
          <div className="py-14 px-5 sm:px-6 text-center">
            <div className={cn(dashIconChip, 'mx-auto mb-4 h-14 w-14 rounded-2xl text-primary/50')}>
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-foreground">Nothing to load yet</h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
              Save a connection below, or set <code className="text-xs bg-muted px-1 rounded">.env</code> for a default folder.
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
