import { useQuery } from '@tanstack/react-query';

const API_KEY = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
const FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID;

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
}

export function useDriveBriefs() {
  return useQuery({
    queryKey: ['drive-briefs'],
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents&key=${API_KEY}&fields=files(id,name,createdTime,webViewLink,mimeType)&orderBy=createdTime+desc`
      );
      const data = await res.json();

      if (data.error) {
        console.error('Drive API error:', data.error);
        return [];
      }

      return (data.files || []).map((file: any) => ({
        id: file.id,
        title: file.name
          .replace(/\.(docx|pdf|gdoc|doc)$/i, '')
          .replace(/[-_]/g, ' '),
        summary: 'Synced from Google Drive',
        file_name: file.name,
        file_url: file.webViewLink,
        brief_date: file.createdTime?.split('T')[0],
        source: 'google_drive',
        content_type: 'campaign',
        status: 'draft',
      }));
    }
  });
}