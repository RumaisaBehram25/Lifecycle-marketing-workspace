import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { extractGoogleDriveFolderId } from '@/lib/driveFolderLinks';

type DriveSettingsRow = {
  client_id: string;
  api_key_hint: string;
  updated_at: string | null;
};

type DriveFolderRow = {
  id: string;
  folder_id: string;
  folder_url: string | null;
};

interface GoogleDriveSettingsFormProps {
  clientId: string | undefined;
}

export function GoogleDriveSettingsForm({ clientId }: GoogleDriveSettingsFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [folderRows, setFolderRows] = useState<string[]>(['']);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['google-drive-settings', clientId ?? ''],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await (supabase as any)
        .from('client_google_drive_settings')
        .select('client_id, api_key_hint, updated_at')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DriveSettingsRow | null;
    },
  });

  const { data: connections = [], isLoading: connLoading } = useQuery({
    queryKey: ['google-drive-settings-folders', clientId ?? ''],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await (supabase as any)
        .from('client_google_drive')
        .select('id, folder_id, folder_url')
        .eq('client_id', clientId)
        .order('connected_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DriveFolderRow[];
    },
  });

  const hydrateFolders = useCallback(() => {
    if (connections.length === 0) {
      setFolderRows(['']);
      return;
    }
    setFolderRows(
      connections.map((c) => (c.folder_url && c.folder_url.trim() ? c.folder_url.trim() : c.folder_id)),
    );
  }, [connections]);

  useEffect(() => {
    hydrateFolders();
  }, [hydrateFolders]);

  const hasSavedKey = Boolean(settings?.api_key_hint?.trim());
  const displayHint = settings?.api_key_hint?.trim() || '';

  const busy = settingsLoading || connLoading;

  const validateClient = useMemo(() => {
    const trimmedRows = folderRows.map((s) => s.trim()).filter(Boolean);
    const errors: string[] = [];
    if (!apiKeyInput.trim() && !hasSavedKey) {
      errors.push('Google Drive API key is required');
    }
    if (trimmedRows.length === 0) {
      errors.push('Add at least one folder (ID or share link)');
    } else {
      for (const line of trimmedRows) {
        if (!extractGoogleDriveFolderId(line)) {
          errors.push(`Invalid folder ID or link: ${line.slice(0, 60)}${line.length > 60 ? '…' : ''}`);
          break;
        }
      }
    }
    return errors;
  }, [apiKeyInput, folderRows, hasSavedKey]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!clientId) {
      toast({ title: 'No workspace selected', variant: 'destructive' });
      return;
    }
    const errs = validateClient;
    if (errs.length) {
      toast({ title: errs[0], variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const folderInputs = folderRows.map((s) => s.trim()).filter(Boolean);
      const payload: { clientId: string; folderInputs: string[]; apiKey?: string } = {
        clientId,
        folderInputs,
      };
      if (apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }

      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        apiKeyHint?: string;
        folderCount?: number;
        fileCount?: number;
        error?: string;
      }>('save-google-drive-settings', { body: payload });

      if (error) {
        throw new Error(error.message || 'Request failed');
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error));
      }

      setApiKeyInput('');
      queryClient.invalidateQueries({ queryKey: ['google-drive-settings', clientId] });
      queryClient.invalidateQueries({ queryKey: ['google-drive-settings-folders', clientId] });
      queryClient.invalidateQueries({ queryKey: ['drive-briefs', clientId] });
      queryClient.invalidateQueries({ queryKey: ['drive-connections', clientId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-drive-connections', clientId] });

      toast({
        title: 'Saved',
        description: `Synced ${data?.folderCount ?? folderInputs.length} folder(s), ${data?.fileCount ?? 0} file(s).`,
      });
    } catch (e: unknown) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!clientId) {
    return (
      <p className="text-sm text-muted-foreground">
        Resolve a workspace (same as Dashboard Drive) to configure Google Drive.
      </p>
    );
  }

  if (busy) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <LoadingSpinner size="sm" className="shrink-0" />
        Loading Drive settings…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="gd-api-key">Google Drive API key</Label>
        <Input
          id="gd-api-key"
          type="password"
          autoComplete="off"
          placeholder={hasSavedKey ? 'Enter only to replace the saved key' : 'AIza…'}
          className="font-mono text-sm"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
        />
        {hasSavedKey ? (
          <p className="text-xs text-muted-foreground">
            Saved key: <span className="font-mono text-foreground">{displayHint}</span> — full value is not shown again.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Stored in the database when you save. Only a masked hint is shown after that.</p>
        )}
      </div>

      <div className="space-y-3">
        <Label>Folders</Label>
        <p className="text-xs text-muted-foreground -mt-1">Folder ID or full Google Drive share link (one per row).</p>
        <div className="space-y-2">
          {folderRows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <Input
                type="text"
                autoComplete="off"
                placeholder="Folder ID or https://drive.google.com/…"
                className="font-mono text-sm"
                value={row}
                onChange={(e) => {
                  const v = e.target.value;
                  setFolderRows((prev) => prev.map((p, j) => (j === i ? v : p)));
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setFolderRows((prev) => prev.filter((_, j) => j !== i))}
                disabled={folderRows.length <= 1}
                aria-label="Remove folder row"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={() => setFolderRows((p) => [...p, ''])}>
          <Plus className="h-4 w-4" />
          Add folder
        </Button>
      </div>

      <Button type="button" onClick={() => void handleSave()} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
