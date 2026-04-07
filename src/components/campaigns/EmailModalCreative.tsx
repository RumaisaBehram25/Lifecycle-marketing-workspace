import { memo, useEffect, useMemo, useState } from 'react';
import { ImageIcon, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { wrapHtmlForIframePreview, type EmailModalPreviewType } from '@/lib/campaignDisplay';

export interface EmailModalCreativeProps {
  /** Hero / fallback image URL from Braze. */
  imageUrl?: string | null;
  /** Prefer for <img src> when set (e.g. CDN-resized). */
  displayImageUrl?: string | null;
  /** Email HTML from `raw_details.email_html_preview` or `messages.*` (iframe when no usable image). */
  htmlContent?: string | null;
  /**
   * hero | imageUrl: show image first, then HTML on error.
   * html: iframe only (fast path, no external image fetch).
   * auto: legacy — use image when URL present, else HTML.
   */
  previewMode?: EmailModalPreviewType | 'auto';
  /** When true, creative data is still being fetched — show a skeleton instead of "no preview". */
  loading?: boolean;
  className?: string;
}

/**
 * Email campaign hero: image → sandboxed HTML iframe → neutral placeholder.
 * Fixed 220px height, top-anchored crop — subject and preheader are rendered outside this component.
 */
export const EmailModalCreative = memo(function EmailModalCreative({
  imageUrl,
  displayImageUrl,
  htmlContent,
  previewMode = 'auto',
  loading = false,
  className,
}: EmailModalCreativeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const display =
    typeof displayImageUrl === 'string' && displayImageUrl.trim()
      ? displayImageUrl.trim()
      : typeof imageUrl === 'string' && imageUrl.trim()
        ? imageUrl.trim()
        : undefined;
  const html = typeof htmlContent === 'string' && htmlContent.trim() ? htmlContent.trim() : undefined;

  const hasUrl = Boolean(display);
  const hasHtml = Boolean(html);

  const iframeDoc = useMemo(() => (html ? wrapHtmlForIframePreview(html) : ''), [html]);

  const tryImageFirst =
    previewMode === 'auto' || previewMode === 'hero' || previewMode === 'imageUrl';
  const htmlOnly = previewMode === 'html';

  const useImageBranch = !htmlOnly && tryImageFirst && hasUrl && !imgFailed;
  /** HTML as main surface (no hero attempt, or image failed / skipped). */
  const useHtmlBranchPrimary =
    (htmlOnly && hasHtml && !iframeFailed) ||
    (!useImageBranch && hasHtml && !iframeFailed);
  /** HTML behind a loading hero so the modal is not an empty gray box while the image downloads. */
  const useHtmlBranchUnderHero =
    Boolean(useImageBranch && hasHtml && !iframeFailed && !htmlOnly);
  const showIframe = useHtmlBranchPrimary || useHtmlBranchUnderHero;
  /** Skip the image skeleton when HTML is visible underneath (faster perceived load). */
  const showImgSkeleton = Boolean(useImageBranch && display && !imgLoaded && !useHtmlBranchUnderHero);

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
    setIframeFailed(false);
    setIframeLoaded(false);
  }, [display, html, previewMode]);

  const loadFailed =
    iframeFailed || Boolean(hasUrl && imgFailed && !hasHtml && !useHtmlBranchUnderHero);

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

        {showIframe && iframeDoc && (
          <>
            {!iframeLoaded && (
              <Skeleton
                className={cn(
                  'pointer-events-none absolute inset-0 rounded-none',
                  useHtmlBranchUnderHero ? 'z-[2]' : 'z-[3]',
                )}
                aria-hidden
              />
            )}
            <iframe
              title="Email HTML preview"
              sandbox=""
              srcDoc={iframeDoc}
              className={cn(
                'absolute inset-0 h-full w-full border-0 bg-white transition-opacity duration-300',
                useHtmlBranchUnderHero ? 'z-[2]' : 'z-[4]',
                iframeLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={() => setIframeLoaded(true)}
              onError={() => setIframeFailed(true)}
            />
          </>
        )}

        {useImageBranch && display && (
          <>
            {showImgSkeleton && (
              <Skeleton className="pointer-events-none absolute inset-0 z-[1] rounded-none" aria-hidden />
            )}
            <img
              src={display}
              alt=""
              width={920}
              height={400}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className={cn(
                'absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-300 ease-out',
                useHtmlBranchUnderHero ? 'z-[3]' : 'z-[2]',
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

        {!useImageBranch && !useHtmlBranchPrimary && (
          loading ? (
            <Skeleton className="absolute inset-0 z-[5] rounded-none" aria-label="Loading creative preview" />
          ) : (
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
          )
        )}
      </div>
    </div>
  );
});
