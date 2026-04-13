import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ImageIcon, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { wrapHtmlForIframePreview, type EmailModalPreviewType } from '@/lib/campaignDisplay';
import {
  campaignImageDisplayUrl,
  isSupabaseStoragePublicObjectUrl,
  plainSupabasePublicObjectUrl,
} from '@/lib/campaignCreativeImageUrl';

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
/** Typical max content width for HTML emails in the modal (centered). */
const EMAIL_PREVIEW_MAX_WIDTH_PX = 600;

/**
 * Size iframe to match the *visible* creative height. With `html { zoom }`, layout scrollHeight is
 * often pre-zoom; multiply by zoom so the frame is not too tall. Re-measure on the next frame after
 * images/fonts settle.
 */
function fitIframeToContent(el: HTMLIFrameElement) {
  const apply = () => {
    try {
      const doc = el.contentDocument;
      const htmlEl = doc?.documentElement;
      const body = doc?.body;
      if (!htmlEl || !body) return;

      const win = doc.defaultView;
      let zoomScale = 1;
      if (win) {
        const z = win.getComputedStyle(htmlEl).zoom;
        if (z && z !== 'normal' && z !== '') {
          const p = parseFloat(z);
          if (Number.isFinite(p) && p > 0 && p < 1) zoomScale = p;
        }
      }

      const raw = Math.max(htmlEl.scrollHeight, body.scrollHeight, htmlEl.offsetHeight, body.offsetHeight);
      const pad = 24;
      const fitted = zoomScale < 1 ? Math.ceil(raw * zoomScale + pad) : raw + pad;

      el.style.minHeight = '';
      if (raw > 0) {
        el.style.height = `${fitted}px`;
        el.style.overflow = 'hidden';
      } else {
        el.style.minHeight = `${IFRAME_MIN_PX}px`;
      }
    } catch {
      el.style.minHeight = `${IFRAME_MIN_PX}px`;
    }
  };

  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
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
  /** 0 = optimized display URL; 1 = plain Supabase object URL (no transform); 2 = raw `display` from Braze/DB. */
  const [imgFallbackTier, setImgFallbackTier] = useState(0);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const display =
    typeof displayImageUrl === 'string' && displayImageUrl.trim()
      ? displayImageUrl.trim()
      : typeof imageUrl === 'string' && imageUrl.trim()
        ? imageUrl.trim()
        : undefined;
  const html = typeof htmlContent === 'string' && htmlContent.trim() ? htmlContent.trim() : undefined;

  const imgSrc = useMemo(() => {
    if (!display?.trim()) return undefined;
    const d = display.trim();
    if (imgFallbackTier === 0) return campaignImageDisplayUrl(d, 'detail') ?? d;
    if (imgFallbackTier === 1 && isSupabaseStoragePublicObjectUrl(d)) {
      return plainSupabasePublicObjectUrl(d) ?? d;
    }
    return d;
  }, [display, imgFallbackTier]);

  const hasUrl = Boolean(display);
  const hasHtml = Boolean(html);

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
  /** Full HTML email preview (not the stacked “HTML under hero image” path). */
  const useFullEmailHtmlPreview = Boolean(showIframe && hasHtml && !useHtmlBranchUnderHero);

  const iframeDoc = useMemo(() => (html ? wrapHtmlForIframePreview(html) : ''), [html]);

  const onIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    fitIframeToContent(e.currentTarget);
    setIframeLoaded(true);
  }, []);

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
    setImgFallbackTier(0);
    setIframeFailed(false);
    setIframeLoaded(false);
  }, [display, html, previewMode]);

  useEffect(() => {
    if (!loading) return;
    setImgFailed(false);
    setImgLoaded(false);
    setImgFallbackTier(0);
    setIframeFailed(false);
    setIframeLoaded(false);
  }, [loading]);

  const onHeroImgError = useCallback(() => {
    if (!display?.trim()) {
      setImgFailed(true);
      setImgLoaded(false);
      return;
    }
    const d = display.trim();
    if (imgFallbackTier === 0) {
      if (isSupabaseStoragePublicObjectUrl(d)) {
        const plain = plainSupabasePublicObjectUrl(d);
        const optimized = campaignImageDisplayUrl(d, 'detail');
        if (plain && plain !== optimized) {
          setImgFallbackTier(1);
          setImgLoaded(false);
          return;
        }
        setImgFallbackTier(2);
        setImgLoaded(false);
        return;
      }
      setImgFailed(true);
      setImgLoaded(false);
      return;
    }
    if (imgFallbackTier === 1) {
      setImgFallbackTier(2);
      setImgLoaded(false);
      return;
    }
    setImgFailed(true);
    setImgLoaded(false);
  }, [display, imgFallbackTier]);

  const loadFailed =
    iframeFailed || Boolean(hasUrl && imgFailed && !hasHtml && !useHtmlBranchUnderHero);

  if (loading) {
    return (
      <div
        className={cn(
          'flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-muted/30 py-14',
          className,
        )}
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading email preview"
      >
        <LoadingSpinner size="lg" />
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        useFullEmailHtmlPreview
          ? 'w-full'
          : 'rounded-xl border border-border/80 bg-muted shadow-sm dark:border-border/60',
        className,
      )}
    >
      <div
        className={cn('relative w-full', !useFullEmailHtmlPreview && 'bg-muted')}
        aria-label="Email creative preview"
      >
        {!useFullEmailHtmlPreview && (
          <div className="pointer-events-none absolute inset-0 bg-muted" aria-hidden />
        )}

        {showIframe && iframeDoc && useFullEmailHtmlPreview && (
          <div className="relative z-[4] w-full">
            {!iframeLoaded && (
              <Skeleton
                className="pointer-events-none mx-auto mb-2 block min-h-[min(280px,40dvh)] w-full max-w-[600px] rounded-md"
                aria-hidden
              />
            )}
            <div
              className="relative mx-auto bg-white"
              style={{ maxWidth: EMAIL_PREVIEW_MAX_WIDTH_PX }}
            >
              <iframe
                title="Email HTML preview"
                sandbox="allow-same-origin"
                scrolling="no"
                srcDoc={iframeDoc}
                className={cn(
                  'relative z-[1] block w-full min-w-0 border-0 bg-white transition-opacity duration-300',
                  iframeLoaded ? 'opacity-100' : 'min-h-[min(280px,40dvh)] opacity-0',
                )}
                style={{
                  maxWidth: EMAIL_PREVIEW_MAX_WIDTH_PX,
                  overflow: 'hidden',
                  pointerEvents: 'none',
                }}
                onLoad={onIframeLoad}
                onError={() => setIframeFailed(true)}
              />
            </div>
          </div>
        )}

        {showIframe && iframeDoc && useHtmlBranchUnderHero && (
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
                'relative z-[2] block w-full min-w-0 border-0 bg-white transition-opacity duration-300',
                iframeLoaded ? 'opacity-100' : 'min-h-[240px] opacity-0',
              )}
              style={{ width: '100%', overflow: 'hidden', pointerEvents: 'none' }}
              onLoad={onIframeLoad}
              onError={() => setIframeFailed(true)}
            />
          </div>
        )}

        {useImageBranch && display && imgSrc && (
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
              key={`${imgFallbackTier}-${imgSrc ?? ''}`}
              src={imgSrc}
              alt=""
              width={920}
              height={400}
              loading="eager"
              decoding="async"
              fetchpriority="high"
              className={cn(
                'relative z-[2] block h-auto w-full max-w-full object-contain object-top transition-opacity duration-300 ease-out',
                useHtmlBranchUnderHero && 'max-w-full',
                imgLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={() => setImgLoaded(true)}
              onError={onHeroImgError}
            />
          </div>
        )}

        {!useImageBranch && !useHtmlBranchPrimary && (
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
        )}
      </div>
    </div>
  );
});
