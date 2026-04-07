import { memo, useMemo, useState } from 'react';
import { ImageIcon, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { wrapHtmlForIframePreview } from '@/lib/campaignDisplay';

export interface EmailModalCreativeProps {
  /** Hero image URL from Braze (preferred when present). */
  imageUrl?: string | null;
  /** Email HTML from `raw_details.email_html_preview` or `messages.*` (iframe when no usable image). */
  htmlContent?: string | null;
  className?: string;
}

/**
 * Email campaign hero: image → sandboxed HTML iframe → neutral placeholder.
 * Fixed 220px height, top-anchored crop — subject and preheader are rendered outside this component.
 */
export const EmailModalCreative = memo(function EmailModalCreative({
  imageUrl,
  htmlContent,
  className,
}: EmailModalCreativeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const url = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : undefined;
  const html = typeof htmlContent === 'string' && htmlContent.trim() ? htmlContent.trim() : undefined;

  const hasUrl = Boolean(url);
  const hasHtml = Boolean(html);

  const iframeDoc = useMemo(() => (html ? wrapHtmlForIframePreview(html) : ''), [html]);

  const useImageBranch = hasUrl && !imgFailed;
  const useHtmlBranch = !useImageBranch && hasHtml && !iframeFailed;

  const loadFailed = iframeFailed || Boolean(hasUrl && imgFailed && !hasHtml);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm dark:border-border/60',
        className,
      )}
    >
      <div
        className="relative h-[220px] min-h-[220px] w-full overflow-hidden bg-muted"
        aria-label="Email creative preview"
      >
        <div className="absolute inset-0 bg-muted" aria-hidden />

        {useImageBranch && url && (
          <>
            {!imgLoaded && (
              <Skeleton className="pointer-events-none absolute inset-0 z-[1] rounded-none" aria-hidden />
            )}
            <img
              src={url}
              alt=""
              width={920}
              height={400}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            className={cn(
              'absolute inset-0 z-[2] h-full w-full object-cover object-top transition-opacity duration-300 ease-out',
              imgLoaded ? 'opacity-100' : 'opacity-0',
            )}
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setImgFailed(true);
                setImgLoaded(false);
              }}
            />
          </>
        )}

        {useHtmlBranch && iframeDoc && (
          <>
            {!iframeLoaded && (
              <Skeleton className="pointer-events-none absolute inset-0 z-[3] rounded-none" aria-hidden />
            )}
            <iframe
              title="Email HTML preview"
              sandbox=""
              srcDoc={iframeDoc}
              className={cn(
                'absolute inset-0 z-[4] h-full w-full border-0 bg-white transition-opacity duration-300',
                iframeLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={() => setIframeLoaded(true)}
              onError={() => setIframeFailed(true)}
            />
          </>
        )}

        {!useImageBranch && !useHtmlBranch && (
          <div
            className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 px-6 text-center"
            aria-hidden
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted-foreground/10 ring-1 ring-border">
              {loadFailed ? (
                <ImageOff className="h-7 w-7 text-muted-foreground/50" aria-hidden />
              ) : (
                <ImageIcon className="h-7 w-7 text-muted-foreground/45" aria-hidden />
              )}
            </div>
            <p className="max-w-[260px] text-xs text-muted-foreground">
              {loadFailed ? 'Preview could not be loaded' : 'No creative preview available'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});
