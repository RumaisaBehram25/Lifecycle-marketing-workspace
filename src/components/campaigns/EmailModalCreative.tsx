import { memo, useState } from 'react';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmailModalCreativeProps {
  /** Primary line (usually subject) */
  subjectLine: string;
  /** Secondary line (preheader); may be em dash */
  preheaderLine: string;
  previewImageUrl?: string | null;
  /** Fallback when subject is empty */
  summaryLine: string;
  className?: string;
}

/**
 * Inbox-style creative block for the campaign detail modal (replaces a blank gradient hero).
 */
export const EmailModalCreative = memo(function EmailModalCreative({
  subjectLine,
  preheaderLine,
  previewImageUrl,
  summaryLine,
  className,
}: EmailModalCreativeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const url = typeof previewImageUrl === 'string' && previewImageUrl.trim() ? previewImageUrl.trim() : undefined;
  const showImg = Boolean(url && !imgFailed);

  const primary =
    subjectLine !== '—' && subjectLine.trim().length > 0 ? subjectLine : summaryLine;
  const secondary =
    preheaderLine !== '—' && preheaderLine.trim().length > 0 ? preheaderLine : null;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-gradient-to-b from-slate-50/90 to-background shadow-sm dark:from-slate-950/80 dark:to-card',
        className,
      )}
    >
      {showImg && url && (
        <div className="relative h-40 w-full bg-muted">
          <div
            className={cn(
              'absolute inset-0 bg-gradient-to-br from-blue-100/80 to-slate-100 transition-opacity duration-500 dark:from-blue-950/50 dark:to-slate-900',
              imgLoaded && 'opacity-0',
            )}
            aria-hidden
          />
          <img
            src={url}
            alt=""
            width={640}
            height={240}
            loading="lazy"
            decoding="async"
            className={cn(
              'relative z-[1] h-full w-full object-cover object-center transition-opacity duration-500',
              imgLoaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setImgLoaded(true)}
            onError={() => {
              setImgFailed(true);
              setImgLoaded(false);
            }}
          />
        </div>
      )}

      <div className="relative border-t border-border/60 bg-card px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden />
          Email preview
        </div>
        <p className="select-text text-sm font-semibold leading-snug text-foreground break-words">{primary}</p>
        {secondary ? (
          <p className="mt-2 select-text text-xs leading-relaxed text-muted-foreground break-words line-clamp-5">
            {secondary}
          </p>
        ) : null}
      </div>
    </div>
  );
});
