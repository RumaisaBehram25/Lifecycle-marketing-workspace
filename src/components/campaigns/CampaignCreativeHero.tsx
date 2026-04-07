import { memo, useState, type ReactNode } from 'react';
import { Mail, Bell, Smartphone, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  previewImageUrl?: string | null;
  /** Used for accessibility label when there is no image */
  campaignName: string;
  variant?: CampaignCreativeHeroVariant;
  className?: string;
  journeyPlaceholder?: JourneyHeroPlaceholder | null;
  /** Load image immediately (e.g. campaign detail modal is open). */
  eagerImage?: boolean;
  /**
   * Campaigns grid: fixed-height thumbnail, full-bleed image (no overlay/icon/text on image),
   * icon-only placeholder when there is no image — no subject/preheader in the hero.
   */
  gridThumbnail?: boolean;
}

/**
 * 16:9 hero — fixed aspect ratio, image fade-in, gradient + channel icon when no image.
 */
export const CampaignCreativeHero = memo(function CampaignCreativeHero({
  channel,
  previewText,
  previewImageUrl,
  campaignName,
  variant = 'card',
  className,
  journeyPlaceholder,
  eagerImage = false,
  gridThumbnail = false,
}: CampaignCreativeHeroProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const url = typeof previewImageUrl === 'string' && previewImageUrl.trim() ? previewImageUrl.trim() : undefined;
  const showImg = Boolean(url && !imgFailed);

  const gradient = journeyPlaceholder?.surfaceGradient ?? creativeGradients[channel];
  const iconSm = channelIconsSm[channel];
  const iconLg = channelIconsLg[channel];

  const isModal = variant === 'modal';

  /** Modal: full-bleed creative only — no channel badge or caption on top of the image. */
  const modalImageClean =
    isModal && showImg && imgLoaded;
  /** Modal: show placeholder (no URL or load error), not while image is loading. */
  const modalShowPlaceholder = isModal && !showImg;
  /** Modal: image is resolving — keep skeleton, no overlaid text/icons. */
  const modalImageLoading = isModal && showImg && !imgLoaded && !imgFailed;

  /** Card (non-grid): dimming gradient + icon + caption over image. */
  const showCardStyleImageOverlay = showImg && !isModal && !gridThumbnail;

  /** Grid: never stack text/icon on top of a creative image. */
  const showFooterOverlay =
    (!isModal || modalShowPlaceholder) &&
    !modalImageLoading &&
    !(gridThumbnail && showImg);

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-muted',
        isModal ? 'aspect-video min-h-[220px] rounded-xl' : gridThumbnail ? 'h-[132px] min-h-[132px] rounded-t-lg' : 'aspect-video rounded-t-lg',
        className,
      )}
    >
      {/* Gradient + skeleton: fixed aspect prevents layout shift while image loads */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br transition-opacity duration-500',
          !showImg && gradient,
          showImg && !imgLoaded && (gridThumbnail ? 'bg-muted' : cn(gradient, 'opacity-70')),
          showImg && imgLoaded && 'pointer-events-none opacity-0',
        )}
        aria-hidden
      />
      {showImg && !imgLoaded && !imgFailed && (
        <Skeleton className="pointer-events-none absolute inset-0 z-[1] rounded-none opacity-40" aria-hidden />
      )}

      {showImg && url && (
        <img
          src={url}
          alt=""
          width={640}
          height={360}
          loading={eagerImage ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eagerImage ? 'high' : 'low'}
          className={cn(
            'absolute inset-0 z-[2] h-full w-full object-cover transition-opacity duration-500 ease-out',
            modalImageClean || gridThumbnail ? 'object-top' : 'object-center',
            isModal && modalImageClean && 'rounded-xl',
            imgLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgFailed(true);
            setImgLoaded(false);
          }}
        />
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
