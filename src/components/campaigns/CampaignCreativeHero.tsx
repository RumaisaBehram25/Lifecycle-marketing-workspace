import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Mail, Bell, Smartphone, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { campaignImageDisplayUrl } from '@/lib/campaignCreativeImageUrl';
import {
  campaignEmailIframeSrcDocCacheKey,
  isCampaignEmailIframeSrcDocLoaded,
  isCampaignThumbnailDisplayUrlLoaded,
  markCampaignEmailIframeSrcDocLoaded,
  markCampaignThumbnailDisplayUrlLoaded,
} from '@/lib/campaignImagePreload';
import { sanitizeBrazeEmailHtmlForIframe } from '@/lib/sanitizeBrazeEmailIframe';
import { Skeleton } from '@/components/ui/skeleton';
import type { CampaignChannelUi } from '@/lib/campaignDisplay';

/** Small icon when a preview image is shown (badge on top of image). */
const channelIconsSm: Record<CampaignChannelUi, React.ReactNode> = {
  email: <Mail className="h-5 w-5" aria-hidden />,
  push: <Bell className="h-5 w-5" aria-hidden />,
  inapp: <Smartphone className="h-5 w-5" aria-hidden />,
  sms: <MessageSquare className="h-5 w-5" aria-hidden />,
};

/** Large icon when there is no image — intentional placeholder, not initials. */
const channelIconsLg: Record<CampaignChannelUi, React.ReactNode> = {
  email: <Mail className="h-8 w-8" aria-hidden />,
  push: <Bell className="h-8 w-8" aria-hidden />,
  inapp: <Smartphone className="h-8 w-8" aria-hidden />,
  sms: <MessageSquare className="h-8 w-8" aria-hidden />,
};

const creativeGradients: Record<CampaignChannelUi, string> = {
  email: 'from-blue-200/90 via-blue-100/80 to-slate-50 dark:from-blue-950/80 dark:via-blue-900/50 dark:to-slate-950',
  push: 'from-orange-200/90 via-amber-100/80 to-slate-50 dark:from-orange-950/80 dark:via-amber-900/40 dark:to-slate-950',
  inapp: 'from-purple-200/90 via-violet-100/80 to-slate-50 dark:from-purple-950/80 dark:via-violet-900/40 dark:to-slate-950',
  sms: 'from-emerald-200/90 via-teal-100/80 to-slate-50 dark:from-emerald-950/80 dark:via-teal-900/40 dark:to-slate-950',
};

/** Clip inner email chrome: no scrollbars; card iframe is a static preview only. */
function wrapEmailCardSrcDocForThumbnail(inner: string): string {
  const t = inner.trim();
  if (!t) return '';
  const noScroll = `<style data-campaign-thumb="1">html,body{margin:0!important;padding:0!important;height:100%!important;width:100%!important;overflow:hidden!important;overscroll-behavior:none;}*{scrollbar-width:none!important;}::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}</style>`;
  if (/<\/head\s*>/i.test(t)) return t.replace(/<\/head\s*>/i, `${noScroll}</head>`);
  if (/<head\b/i.test(t)) return t.replace(/<head\b[^>]*>/i, m => `${m}${noScroll}`);
  if (/^\s*<html\b/i.test(t)) return t.replace(/<html[^>]*>/i, m => `${m}<head><meta charset="utf-8"/>${noScroll}</head>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${noScroll}</head><body>${t}</body></html>`;
}

const iconPlaceholderRing: Record<CampaignChannelUi, string> = {
  email: 'ring-blue-400/40 bg-gradient-to-br from-blue-100 to-blue-50 text-blue-800 dark:from-blue-900 dark:to-blue-950 dark:text-blue-100',
  push: 'ring-orange-400/40 bg-gradient-to-br from-orange-100 to-amber-50 text-orange-800 dark:from-orange-900 dark:to-amber-950 dark:text-orange-100',
  inapp: 'ring-purple-400/40 bg-gradient-to-br from-purple-100 to-violet-50 text-purple-800 dark:from-purple-900 dark:to-violet-950 dark:text-purple-100',
  sms: 'ring-emerald-400/40 bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-900 dark:from-emerald-900 dark:to-teal-950 dark:text-emerald-100',
};

export type CampaignCreativeHeroVariant = 'card' | 'modal';

/** Lifecycle / journey cards: replace channel mail/push placeholder with title-based icon + matching tint */
export interface JourneyHeroPlaceholder {
  surfaceGradient: string;
  largeIcon: ReactNode;
  iconContainerClassName: string;
}

export interface CampaignCreativeHeroProps {
  channel: CampaignChannelUi;
  /** Always non-empty resolved preview line */
  previewText: string;
  /** Direct http(s) image URL for the card/modal hero (e.g. uploaded bucket asset, Stripo CDN); always `<img>`, never iframe. */
  previewImageUrl?: string | null;
  /** Used for accessibility label when there is no image */
  campaignName: string;
  variant?: CampaignCreativeHeroVariant;
  className?: string;
  journeyPlaceholder?: JourneyHeroPlaceholder | null;
  /** Load image immediately (e.g. campaign detail modal is open). */
  eagerImage?: boolean;
  /**
   * Index on the current page (0-based). First rows get `fetchpriority="high"` and eager decode hints
   * so they match list {@link preloadCampaignImages} priority.
   */
  listPageIndex?: number;
  /**
   * Campaigns grid: fixed-height area with channel icon only (no image, no skeleton, no async load).
   * Omit when `preview_image_url` exists so the hero image can show (aligned with preload URLs).
   */
  gridThumbnail?: boolean;
  /**
   * Email campaigns: when no usable hero `<img>` URL (or image fails), show a sandboxed mini HTML preview
   * (same pattern as client-facing campaign cards).
   */
  emailIframeHtml?: string | null;
}

/**
 * 16:9 hero — fixed aspect ratio, image fade-in, gradient + channel icon when no image.
 */
export const CampaignCreativeHero = memo(function CampaignCreativeHero(props: CampaignCreativeHeroProps) {
  const {
    channel,
    previewText,
    previewImageUrl,
    campaignName,
    variant = 'card',
    className,
    journeyPlaceholder,
    eagerImage = false,
    listPageIndex,
    gridThumbnail = false,
    emailIframeHtml,
  } = props;
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const isModal = variant === 'modal';
  const url =
    gridThumbnail
      ? undefined
      : typeof previewImageUrl === 'string' && previewImageUrl.trim()
        ? previewImageUrl.trim()
        : undefined;
  const imgSrc =
    url &&
    campaignImageDisplayUrl(
      url,
      isModal ? 'detail' : 'default',
    );
  const showImg = Boolean(url && !imgFailed);

  const { iframeWrappedSrcDoc, iframeWarmKey } = useMemo(() => {
    if (channel !== 'email' || isModal) return { iframeWrappedSrcDoc: '', iframeWarmKey: '' };
    const raw = typeof emailIframeHtml === 'string' ? emailIframeHtml : '';
    const inner = sanitizeBrazeEmailHtmlForIframe(raw);
    if (!inner.trim()) return { iframeWrappedSrcDoc: '', iframeWarmKey: '' };
    const iframeWarmKey = campaignEmailIframeSrcDocCacheKey(inner);
    return {
      iframeWrappedSrcDoc: wrapEmailCardSrcDocForThumbnail(inner),
      iframeWarmKey,
    };
  }, [channel, emailIframeHtml, isModal]);

  const showIframe = Boolean(iframeWrappedSrcDoc.trim()) && !showImg;

  // If the image was preloaded and is already in the browser cache, img.complete is true
  // synchronously — skip the skeleton entirely by detecting this before the first paint.
  useLayoutEffect(() => {
    setImgFailed(false);
    if (imgSrc && isCampaignThumbnailDisplayUrlLoaded(imgSrc)) {
      setImgLoaded(true);
    } else {
      setImgLoaded(false);
    }
    if (iframeWarmKey && isCampaignEmailIframeSrcDocLoaded(iframeWarmKey)) {
      setIframeReady(true);
    } else {
      setIframeReady(false);
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setImgLoaded(true);
      if (imgSrc) markCampaignThumbnailDisplayUrlLoaded(imgSrc);
    }
  }, [imgSrc, iframeWarmKey]);

  const gradient = journeyPlaceholder?.surfaceGradient ?? creativeGradients[channel];
  const iconSm = channelIconsSm[channel];
  const iconLg = channelIconsLg[channel];

  /** Modal: full-bleed creative only — no channel badge or caption on top of the image. */
  const modalImageClean =
    isModal && showImg && imgLoaded;
  /** Modal: show placeholder (no URL or load error), not while image is loading. */
  const modalShowPlaceholder = isModal && !showImg;
  /** Modal: image is resolving — keep skeleton, no overlaid text/icons. */
  const modalImageLoading = isModal && showImg && !imgLoaded && !imgFailed;

  const iframeCreativeVisible = showIframe && iframeReady;

  const cardThumbClipRounded = isModal ? 'rounded-xl' : gridThumbnail ? 'rounded-lg' : 'rounded-t-lg';

  /** Card (non-grid): dimming gradient + icon + caption over image. */
  const showCardStyleImageOverlay = showImg && !isModal && !gridThumbnail;

  /** Align with `headLinkPreloadUrls` (first five on page): eager decode + high priority. */
  const aboveFoldEager =
    typeof listPageIndex === 'number' && listPageIndex < 5;
  const loadingAttr = eagerImage || aboveFoldEager ? 'eager' : 'lazy';
  /** DOM / React JSX use lowercase `fetchpriority` (React does not accept `fetchPriority` on `<img>` in all versions). */
  const fetchpriorityAttr: 'high' | 'low' =
    eagerImage || (typeof listPageIndex === 'number' && listPageIndex < 3) ? 'high' : 'low';

  /** Footer caption: hidden for `gridThumbnail` when an image is shown; otherwise card/modal rules. */
  const showFooterOverlay =
    (!isModal || modalShowPlaceholder) &&
    !modalImageLoading &&
    (!gridThumbnail || (!showImg && !iframeCreativeVisible));

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden',
        !isModal && (showImg || showIframe) ? 'bg-white dark:bg-white/95' : 'bg-muted',
        isModal ? 'aspect-video min-h-[220px] rounded-xl' : gridThumbnail ? 'h-[132px] min-h-[132px] rounded-t-lg' : 'aspect-video rounded-t-lg',
        className,
      )}
    >
      {/* Gradient + skeleton: fixed aspect prevents layout shift while image loads */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br transition-opacity duration-500',
          !(showIframe || showImg) && gradient,
          showImg && !imgLoaded && !imgFailed && cn(gradient, 'opacity-70'),
          ((showImg && imgLoaded) || iframeCreativeVisible) && 'pointer-events-none opacity-0',
        )}
        aria-hidden
      />
      {showIframe && !iframeCreativeVisible && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[1] overflow-hidden',
            isModal ? 'rounded-xl' : 'rounded-t-lg',
          )}
          aria-hidden
        >
          <Skeleton className="absolute inset-0 rounded-none opacity-40 motion-safe:animate-pulse" />
        </div>
      )}
      {showImg && !imgLoaded && !imgFailed && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[1] overflow-hidden',
            isModal ? 'rounded-xl' : 'rounded-t-lg',
          )}
          aria-hidden
        >
          <div
            className={cn(
              'absolute inset-0 scale-110 bg-gradient-to-br from-muted via-muted/70 to-muted blur-2xl',
              'motion-safe:animate-pulse',
            )}
          />
          <Skeleton className="absolute inset-0 rounded-none opacity-50 motion-safe:animate-pulse" />
        </div>
      )}

      {showImg && url && imgSrc && (
        <img
          ref={imgRef}
          src={imgSrc}
          alt={campaignName}
          width={640}
          height={360}
          referrerPolicy="no-referrer"
          loading={loadingAttr}
          decoding="async"
          fetchpriority={fetchpriorityAttr}
          className={cn(
            'absolute inset-0 z-[2] h-full w-full min-h-full min-w-full max-w-none object-cover transition-opacity duration-500 ease-out',
            isModal && !modalImageClean ? 'object-center' : 'object-top',
            isModal && modalImageClean && 'rounded-xl',
            imgLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => {
            if (imgSrc) markCampaignThumbnailDisplayUrlLoaded(imgSrc);
            setImgLoaded(true);
          }}
          onError={e => {
            e.currentTarget.style.display = 'none';
            setImgFailed(true);
            setImgLoaded(false);
          }}
        />
      )}

      {showIframe && iframeWrappedSrcDoc && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[2] overflow-hidden bg-white dark:bg-white/95',
            cardThumbClipRounded,
          )}
        >
          <iframe
            title={`${campaignName} — email preview`}
            srcDoc={iframeWrappedSrcDoc}
            scrolling="no"
            className={cn(
              'pointer-events-none absolute left-1/2 top-0 z-[2] block max-w-none -translate-x-1/2 border-0 bg-white dark:bg-white/95',
              'h-[220%] w-[220%] origin-top',
              isModal ? 'scale-[0.454]' : gridThumbnail ? 'scale-[0.42]' : 'scale-[0.454]',
            )}
            onLoad={() => {
              if (iframeWarmKey) markCampaignEmailIframeSrcDocLoaded(iframeWarmKey);
              setIframeReady(true);
            }}
          />
        </div>
      )}

      {showCardStyleImageOverlay && (
        <div
          className="absolute inset-0 z-[3] bg-gradient-to-t from-black/80 via-black/35 to-black/10"
          aria-hidden
        />
      )}

      {/* Card: footer when placeholder or legacy card overlay. Grid thumbnail: icon-only, no caption on image. Modal: only when no creative image (placeholder). */}
      {showFooterOverlay && (
        <div
          className={cn(
            'relative z-[4] flex h-full min-h-0 flex-col items-center justify-end gap-2 px-4 pb-4 pt-10 text-center',
            gridThumbnail && 'justify-center pb-4 pt-4',
            isModal && 'justify-center pb-5 pt-12',
          )}
        >
          {showImg && !isModal && !gridThumbnail ? (
            <div
              className={cn(
                'mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-black/5',
                'bg-white/95 text-slate-900 dark:bg-white/90',
              )}
            >
              {iconSm}
            </div>
          ) : journeyPlaceholder ? (
            <div
              className={journeyPlaceholder.iconContainerClassName}
              aria-label={`${campaignName} — journey preview`}
            >
              {journeyPlaceholder.largeIcon}
            </div>
          ) : (
            <div
              className={cn(
                'mb-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-md ring-2',
                iconPlaceholderRing[channel],
              )}
              aria-label={`${campaignName} — ${channel} channel preview`}
            >
              {iconLg}
            </div>
          )}

          {!gridThumbnail && (
            <p
              className={cn(
                'line-clamp-3 w-full max-w-prose text-pretty text-xs leading-snug',
                showImg && !isModal ? 'text-white drop-shadow-md' : 'text-foreground/80 dark:text-foreground/90',
                isModal && 'text-sm',
              )}
            >
              {previewText}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
