import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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

const IFRAME_MIN_PX = 200;

/** Size iframe to document height so no inner scrollbar (outer modal scroll only). */
function fitIframeToContent(el: HTMLIFrameElement) {
  try {
    const doc = el.contentDocument;
    const h =
      doc?.documentElement?.scrollHeight ??
      doc?.body?.scrollHeight ??
      0;
    el.style.minHeight = '';
    if (h > 0) {
      el.style.height = `${h + 24}px`;
      el.style.overflow = 'hidden';
    } else {
      el.style.minHeight = `${IFRAME_MIN_PX}px`;
    }
  } catch {
    el.style.minHeight = `${IFRAME_MIN_PX}px`;
  }
}

/**
 * Campaign detail email preview only: natural image height, iframe sized to HTML — no nested scroll.
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
  const useHtmlBranchPrimary =
    (htmlOnly && hasHtml && !iframeFailed) ||
    (!useImageBranch && hasHtml && !iframeFailed);
  const useHtmlBranchUnderHero =
    Boolean(useImageBranch && hasHtml && !iframeFailed && !htmlOnly);
  const showIframe = useHtmlBranchPrimary || useHtmlBranchUnderHero;
  const showImgSkeleton = Boolean(useImageBranch && display && !imgLoaded && !useHtmlBranchUnderHero);

  const onIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    fitIframeToContent(e.currentTarget);
    setIframeLoaded(true);
  }, []);

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
        'rounded-xl border border-border/80 bg-muted shadow-sm dark:border-border/60',
        className,
      )}
    >
      <div className="relative w-full bg-muted" aria-label="Email creative preview">
        <div className="pointer-events-none absolute inset-0 bg-muted" aria-hidden />

        {showIframe && iframeDoc && (
          <div className="relative z-[1] w-full">
            {!iframeLoaded && (
              <Skeleton className="pointer-events-none absolute inset-0 z-0 min-h-[240px] rounded-none" aria-hidden />
            )}
            <iframe
              title="Email HTML preview"
              sandbox="allow-same-origin"
              scrolling="no"
              srcDoc={iframeDoc}
              className={cn(
                'relative z-[1] block w-full min-w-0 border-0 bg-white transition-opacity duration-300',
                useHtmlBranchUnderHero ? 'z-[2]' : 'z-[4]',
                iframeLoaded ? 'opacity-100' : 'min-h-[240px] opacity-0',
              )}
              style={{ width: '100%', overflow: 'hidden' }}
              onLoad={onIframeLoad}
              onError={() => setIframeFailed(true)}
            />
          </div>
        )}

        {useImageBranch && display && (
          <div
            className={cn(
              'relative z-[3] w-full',
              useHtmlBranchUnderHero &&
                'pointer-events-none absolute inset-x-0 top-0 flex justify-center bg-gradient-to-b from-transparent to-muted/20',
              !useHtmlBranchUnderHero && 'block',
            )}
          >
            {showImgSkeleton && (
              <Skeleton
                className={cn(
                  'rounded-none',
                  useHtmlBranchUnderHero ? 'absolute inset-0 min-h-[200px]' : 'block min-h-[200px] w-full',
                )}
                aria-hidden
              />
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
                'relative z-[2] block h-auto w-full max-w-full object-contain object-top transition-opacity duration-300 ease-out',
                useHtmlBranchUnderHero && 'max-w-full',
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

        {!useImageBranch && !useHtmlBranchPrimary && (
          loading ? (
            <Skeleton
              className="relative z-[5] block min-h-[200px] w-full rounded-none"
              aria-label="Loading creative preview"
            />
          ) : (
            <div
              className="relative z-[5] flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center"
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
