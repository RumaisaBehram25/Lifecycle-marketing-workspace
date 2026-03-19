import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DriveBrief {
  id: string;
  title: string;
  summary: string;
  file_name: string;
  file_url: string;
  brief_date: string;
  source: 'google_drive';
  content_type: 'campaign' | 'lifecycle' | 'task';
  status: 'draft';
  /** From sync: `folder` rows are excluded from dashboard "file" counts. */
  file_type?: string | null;
  folder_name?: string;
  folder_id?: string;
  slot_id?: string;
}

/** Rows synced from Drive that are not subfolders (counts briefs/docs for metrics). */
export function countSyncedDriveFiles(briefs: readonly DriveBrief[]): number {
  return briefs.filter((b) => (b.file_type ?? 'file') !== 'folder').length;
}

export function useDriveBriefs(clientId: string | undefined) {
  return useQuery({
    queryKey: ['drive-briefs', clientId ?? ''],
    refetchInterval: 30000,
    queryFn: async () => {
      if (!clientId) return [];

      const { data: connections, error: connErr } = await (supabase as any)
        .from('client_google_drive')
        .select('id, folder_id, folder_name')
        .eq('client_id', clientId)
        .order('connected_at', { ascending: true });
      if (connErr) throw connErr;

      const byConnectionId = new Map<string, { folder_id: string; folder_name: string | null }>();
      for (const c of (connections ?? []) as any[]) {
        byConnectionId.set(String(c.id), {
          folder_id: String(c.folder_id ?? ''),
          folder_name: c.folder_name ? String(c.folder_name) : null,
        });
      }

      const { data: rows, error } = await (supabase as any)
        .from('client_drive_files')
        .select('*')
        .eq('client_id', clientId)
        .order('created_time', { ascending: false, nullsFirst: false });
      if (error) throw error;

      return ((rows ?? []) as any[]).map((r) => {
        const c = byConnectionId.get(String(r.drive_connection_id));
        const folderName = c?.folder_name || 'Connected folder';
        const fileName = String(r.file_name ?? '');
        const fileType = r.file_type != null ? String(r.file_type) : null;
        return {
          id: String(r.id ?? `${r.drive_connection_id}_${r.file_id}`),
          title: fileName.replace(/\.(docx|pdf|gdoc|doc)$/i, '').replace(/[-_]/g, ' '),
          summary: `Synced from Google Drive · ${folderName}`,
          file_name: fileName,
          file_url: String(r.web_view_link ?? ''),
          brief_date: r.created_time ? String(r.created_time).slice(0, 10) : '',
          source: 'google_drive' as const,
          content_type: 'campaign' as const,
          status: 'draft' as const,
          file_type: fileType,
          folder_name: folderName,
          folder_id: c?.folder_id ?? String(r.drive_connection_id ?? ''),
          slot_id: String(r.drive_connection_id ?? ''),
        } satisfies DriveBrief;
      });
    },
  });
}
