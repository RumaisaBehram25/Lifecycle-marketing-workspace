import { Badge } from '@/components/ui/badge';
import { FileText, ExternalLink, Calendar, Cloud, File, FolderOpen } from 'lucide-react';
import { DriveBrief } from '@/hooks/useDriveBriefs';
import { cn } from '@/lib/utils';
import { dashIconChip, dashRingInset, dashRowHover, dashShadowSm } from '@/lib/dashboard-surface';

function FileIcon({ fileName }: { fileName?: string }) {
  const isPdf = /\.pdf$/i.test(fileName || '');
  return isPdf ? (
    <File className="h-4 w-4 text-red-600/90 dark:text-red-400/90 shrink-0" />
  ) : (
    <FileText className="h-4 w-4 text-primary shrink-0" />
  );
}

export function DriveBriefCard({ brief }: { brief: DriveBrief }) {
  const folderLabel = brief.folder_name || 'Drive';

  return (
    <div
      className={cn(
        'group relative flex w-full flex-col gap-4 rounded-xl border border-border/60 bg-card/95 p-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-5',
        'duration-200',
        dashShadowSm,
        dashRingInset,
        dashRowHover,
      )}
    >
      <div
        className="absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />

      <div className="relative min-w-0 flex-1 space-y-3 pl-0 sm:pl-1">
        <div className="flex gap-3">
          <div className={cn(dashIconChip, 'h-11 w-11 shrink-0 rounded-xl')}>
            <FileIcon fileName={brief.file_name} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground pr-2">
              {brief.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-md border border-primary/10 bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                {folderLabel}
              </Badge>
              <Badge className="rounded-md border-0 bg-violet-500/12 px-2 py-0.5 text-[11px] font-medium capitalize text-violet-800 dark:text-violet-200">
                {brief.content_type}
              </Badge>
              <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
              <span className="rounded-md bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium capitalize text-amber-900 dark:text-amber-200">
                {brief.status}
              </span>
              {brief.brief_date && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    <Calendar className="h-3.5 w-3.5 opacity-70" />
                    {new Date(brief.brief_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground sm:ml-14">
          <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
          <span>
            Synced from Google Drive · <span className="text-foreground/80">{folderLabel}</span>
          </span>
        </p>

        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-14">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span>
            Drive folder:{' '}
            <span className="font-medium text-foreground">{folderLabel}</span>
          </span>
        </p>

        {brief.file_name && (
          <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 sm:ml-14 dark:bg-muted/20">
            <FileIcon fileName={brief.file_name} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{brief.file_name}</span>
          </div>
        )}
      </div>

      {brief.file_url && (
        <div className="flex w-full shrink-0 sm:w-auto sm:flex-col sm:justify-center sm:pt-0.5">
          <a
            href={brief.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground shadow-md shadow-primary/[0.06]',
              'hover:bg-primary/90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4 opacity-90" />
            Open
          </a>
        </div>
      )}
    </div>
  );
}
