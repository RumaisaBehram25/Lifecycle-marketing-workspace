import { Badge } from '@/components/ui/badge';
import { FileText, ExternalLink, Calendar, Cloud, File } from 'lucide-react';
import { DriveBrief } from '@/hooks/useDriveBriefs';
import { cn } from '@/lib/utils';

function FileIcon({ fileName }: { fileName?: string }) {
  const isPdf = /\.pdf$/i.test(fileName || '');
  return isPdf ? (
    <File className="h-4 w-4 text-red-500/90 shrink-0" />
  ) : (
    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
  );
}

export function DriveBriefCard({ brief }: { brief: DriveBrief }) {
  return (
    <div
      className={cn(
        'group relative flex items-start justify-between gap-4 p-4 rounded-xl border transition-all duration-200',
        'border-border/80 bg-card shadow-sm',
        'hover:shadow-md hover:border-blue-500/30 hover:bg-blue-500/[0.02] dark:hover:bg-blue-500/5'
      )}
    >
      {/* Left accent - appears on hover */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b from-blue-500/60 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" aria-hidden />
      <div className="relative min-w-0 flex-1 space-y-2 pl-0">
        {/* Header: icon + title (left), campaign badge (right) */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/10">
              <FileIcon fileName={brief.file_name} />
            </div>
            <span className="font-semibold text-sm text-foreground truncate">
              {brief.title}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 text-[10px] font-medium bg-purple-500/15 text-purple-700 dark:bg-purple-400/90 border-0 capitalize rounded-md px-2"
          >
            {brief.content_type}
          </Badge>
        </div>

        {/* Sub-header: Synced from Google Drive */}
        {brief.summary && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Cloud className="h-3.5 w-3.5 text-blue-500/70" />
            {brief.summary}
          </p>
        )}

        {/* Footer: draft, date, filename */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] px-2 py-1 rounded-md font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400/90 capitalize">
            {brief.status}
          </span>
          {brief.brief_date && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground/80" />
              {new Date(brief.brief_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
        {brief.file_name && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 dark:bg-muted/20 rounded-md px-2 py-1.5 w-fit">
            <FileIcon fileName={brief.file_name} />
            <span className="truncate font-mono max-w-[180px]">{brief.file_name}</span>
          </div>
        )}
      </div>

      {/* Open link */}
      {brief.file_url && (
        <a
          href={brief.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-2 text-xs font-medium shrink-0 rounded-lg px-3 py-2 transition-colors',
            'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 dark:hover:bg-blue-500/25'
          )}
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
      )}
    </div>
  );
}
