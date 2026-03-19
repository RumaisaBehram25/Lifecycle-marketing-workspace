import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, FolderOpen, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  addDriveSlot,
  clearAllDriveSessionConnections,
  extractGoogleDriveFolderId,
  getDriveSlots,
  getResolvedDriveFolders,
  purgeLegacyDriveLocalStorage,
  removeDriveSlot,
  type DriveSlot,
} from '@/lib/driveFolderLinks';
import { DriveBriefCard } from '@/components/briefs/DriveBriefCard';
import type { DriveBrief } from '@/hooks/useDriveBriefs';
import { cn } from '@/lib/utils';

interface GoogleDriveBriefsPanelProps {
  clientId: string | undefined;
  driveBriefs: DriveBrief[];
  isFetching: boolean;
}

function slotFolderTitle(slot: DriveSlot, namesBySlotId: Map<string, string>): string {
  const fromDrive = namesBySlotId.get(slot.id);
  if (fromDrive) return fromDrive;
  const raw = slot.folders[0]?.trim();
  if (!raw) return 'Folder';
  const id = extractGoogleDriveFolderId(raw);
  if (id) return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
  return raw.length > 32 ? `${raw.slice(0, 32)}…` : raw;
}

export function GoogleDriveBriefsPanel({ clientId, driveBriefs, isFetching }: GoogleDriveBriefsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [folderId, setFolderId] = useState('');
  const [slots, setSlots] = useState<DriveSlot[]>(() => getDriveSlots(clientId));

  const resolved = getResolvedDriveFolders(clientId);
  const hasBriefs = driveBriefs.length > 0;

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
    purgeLegacyDriveLocalStorage();
    queryClient.invalidateQueries({ queryKey: ['drive-briefs'] });
  }, [queryClient]);

  useEffect(() => {
    setSlots(getDriveSlots(clientId));
    setApiKey('');
    setFolderId('');
  }, [clientId]);

  const handleSave = () => {
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
    addDriveSlot(clientId, key, [folder]);
    setSlots(getDriveSlots(clientId));
    setApiKey('');
    setFolderId('');
    queryClient.invalidateQueries({ queryKey: ['drive-briefs', clientId ?? ''] });
    toast({ title: 'Saved' });
  };

  const handleRemoveSlot = (slotId: string) => {
    removeDriveSlot(clientId, slotId);
    setSlots(getDriveSlots(clientId));
    queryClient.invalidateQueries({ queryKey: ['drive-briefs', clientId ?? ''] });
    toast({ title: 'Connection removed' });
  };

  const handleClearAll = () => {
    clearAllDriveSessionConnections();
    purgeLegacyDriveLocalStorage();
    setSlots(getDriveSlots(clientId));
    setApiKey('');
    setFolderId('');
    queryClient.setQueryData(['drive-briefs', clientId ?? ''], []);
    queryClient.invalidateQueries({ queryKey: ['drive-briefs', clientId ?? ''] });
    toast({ title: 'All Drive connections cleared' });
  };

  const configured = resolved.length > 0;

  return (
    <Card
      className={cn(
        'w-full overflow-hidden rounded-xl border border-border/70 bg-card',
        'shadow-sm shadow-black/5 dark:shadow-black/20',
        'ring-1 ring-blue-500/[0.07] dark:ring-blue-400/10'
      )}
    >
      <CardHeader className="relative space-y-0 px-5 sm:px-6 pt-5 pb-4 pr-12 sm:pr-14 border-b border-border/60 bg-gradient-to-b from-blue-500/[0.06] to-transparent dark:from-blue-500/[0.08]">
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
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
              <FileText className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
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
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                  {resolved.map((r, i) => {
                    const displayName = folderIdToDisplayName.get(r.folderId) ?? r.folderName;
                    return (
                      <span key={r.key} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span className="text-muted-foreground/50">·</span>}
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-muted/80 px-2 py-0.5 text-foreground font-medium ring-1 ring-border/60 max-w-[220px] sm:max-w-xs truncate"
                          title={displayName}
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
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

      <div className="px-5 sm:px-6 py-5 border-b border-border/50 bg-muted/25 dark:bg-muted/15">
        <div className="rounded-xl border border-border/70 bg-background/80 dark:bg-background/40 p-4 shadow-sm space-y-4">
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

          {slots.length > 0 && (
            <div className="pt-4 border-t border-border/60 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Connected</p>
              <div className="flex flex-wrap gap-2.5">
                {slots.map(slot => {
                  const title = slotFolderTitle(slot, folderNameBySlotId);
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        'group relative flex min-w-[min(100%,200px)] max-w-[280px] flex-1 items-center gap-3 rounded-xl border border-border/70',
                        'bg-gradient-to-b from-card to-muted/20 px-3.5 py-3 pr-11',
                        'shadow-sm shadow-black/[0.04] dark:shadow-black/20',
                        'ring-1 ring-black/[0.03] dark:ring-white/[0.06]',
                        'transition-colors hover:border-blue-500/25 hover:ring-blue-500/10'
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/[0.12] text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
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
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500/50">
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-foreground">Nothing to load yet</h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
              Save a connection below, or set <code className="text-xs bg-muted px-1 rounded">.env</code> for a default folder.
            </p>
          </div>
        ) : !hasBriefs && isFetching ? (
          <div className="py-14 px-5 sm:px-6 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500/60" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : !hasBriefs ? (
          <div className="py-14 px-5 sm:px-6 text-center">
            <p className="text-sm text-muted-foreground">No briefs to show yet.</p>
          </div>
        ) : (
          <div className="max-h-[min(520px,62vh)] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
            <div className="px-5 sm:px-6 py-4 space-y-3 w-full">
              {driveBriefs.map(brief => (
                <DriveBriefCard key={brief.id} brief={brief} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
