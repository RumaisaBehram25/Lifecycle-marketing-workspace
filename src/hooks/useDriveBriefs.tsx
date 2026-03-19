import { useQuery } from '@tanstack/react-query';
import { getResolvedDriveFolders } from '@/lib/driveFolderLinks';

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
  folder_name?: string;
  folder_id?: string;
  slot_id?: string;
}

async function fetchDriveFolderDisplayName(apiKey: string, folderId: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=name&key=${encodeURIComponent(apiKey)}`
  );
  const data = await res.json();
  if (data.error) {
    console.error('Drive folder metadata error:', data.error);
    return null;
  }
  const name = data.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

async function fetchFolderFiles(
  apiKey: string,
  folderId: string,
  folderName: string,
  slotId: string
): Promise<DriveBrief[]> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${encodeURIComponent(apiKey)}&fields=files(id,name,createdTime,webViewLink,mimeType)&orderBy=createdTime+desc`
  );
  const data = await res.json();

  if (data.error) {
    console.error('Drive API error:', data.error);
    return [];
  }

  return (data.files || []).map((file: { id: string; name: string; createdTime?: string; webViewLink?: string }) => ({
    id: `${slotId}_${folderId}_${file.id}`,
    title: file.name
      .replace(/\.(docx|pdf|gdoc|doc)$/i, '')
      .replace(/[-_]/g, ' '),
    summary: `Synced from Google Drive · ${folderName}`,
    file_name: file.name,
    file_url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    brief_date: file.createdTime?.split('T')[0] || '',
    source: 'google_drive' as const,
    content_type: 'campaign' as const,
    status: 'draft' as const,
    folder_name: folderName,
    folder_id: folderId,
    slot_id: slotId,
  }));
}

export function useDriveBriefs(clientId: string | undefined) {
  return useQuery({
    queryKey: ['drive-briefs', clientId ?? ''],
    refetchInterval: 30000,
    queryFn: async () => {
      const resolved = getResolvedDriveFolders(clientId);
      if (resolved.length === 0) return [];

      const resolvedWithRealNames = await Promise.all(
        resolved.map(async r => {
          const realName = await fetchDriveFolderDisplayName(r.apiKey, r.folderId);
          return {
            ...r,
            folderName: realName ?? r.folderName,
          };
        })
      );

      const batches = await Promise.all(
        resolvedWithRealNames.map(r =>
          fetchFolderFiles(r.apiKey, r.folderId, r.folderName, r.slotId)
        )
      );

      return batches.flat();
    },
  });
}
