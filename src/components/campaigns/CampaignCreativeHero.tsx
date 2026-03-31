import { memo, useState, type ReactNode } from 'react';
import { Mail, Bell, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignChannelUi } from '@/lib/campaignDisplay';

/** Small icon when a preview image is shown (badge on top of image). */
const channelIconsSm: Record<CampaignChannelUi, React.ReactNode> = {
  email: <Mail className="h-5 w-5" aria-hidden />,
  push: <Bell className="h-5 w-5" aria-hidden />,
  inapp: <Smartphone className="h-5 w-5" aria-hidden />,
};

/** Large icon when there is no image — intentional placeholder, not initials. */
const channelIconsLg: Record<CampaignChannelUi, React.ReactNode> = {
  email: <Mail className="h-8 w-8" aria-hidden />,
  push: <Bell className="h-8 w-8" aria-hidden />,
  inapp: <Smartphone className="h-8 w-8" aria-hidden />,
};

const creativeGradients: Record<CampaignChannelUi, string> = {
  email: 'from-blue-200/90 via-blue-100/80 to-slate-50 dark:from-blue-950/80 dark:via-blue-900/50 dark:to-slate-950',
  push: 'from-orange-200/90 via-amber-100/80 to-slate-50 dark:from-orange-950/80 dark:via-amber-900/40 dark:to-slate-950',
  inapp: 'from-purple-200/90 via-violet-100/80 to-slate-50 dark:from-purple-950/80 dark:via-violet-900/40 dark:to-slate-950',
};

const iconPlaceholderRing: Record<CampaignChannelUi, string> = {
  email: 'ring-blue-400/40 bg-gradient-to-br from-blue-100 to-blue-50 text-blue-800 dark:from-blue-900 dark:to-blue-950 dark:text-blue-100',
  push: 'ring-orange-400/40 bg-gradient-to-br from-orange-100 to-amber-50 text-orange-800 dark:from-orange-900 dark:to-amber-950 dark:text-orange-100',
  inapp: 'ring-purple-400/40 bg-gradient-to-br from-purple-100 to-violet-50 text-purple-800 dark:from-purple-900 dark:to-violet-950 dark:text-purple-100',
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
}: CampaignCreativeHeroProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const url = typeof previewImageUrl === 'string' && previewImageUrl.trim() ? previewImageUrl.trim() : undefined;
  const showImg = Boolean(url && !imgFailed);

  const gradient = journeyPlaceholder?.surfaceGradient ?? creativeGradients[channel];
  const iconSm = channelIconsSm[channel];
  const iconLg = channelIconsLg[channel];

  const isModal = variant === 'modal';

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-muted',
        isModal ? 'aspect-video min-h-[160px] rounded-xl' : 'aspect-video rounded-t-lg',
        className,
      )}
    >
      {/* Gradient placeholder until image fades in (blur-up style) */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br transition-opacity duration-500',
          !showImg && gradient,
          showImg && !imgLoaded && cn(gradient, 'opacity-70'),
          showImg && imgLoaded && 'pointer-events-none opacity-0',
        )}
        aria-hidden
      />

      {showImg && url && (
        <img
          src={url}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className={cn(
            'absolute inset-0 z-[1] h-full w-full object-cover object-center transition-opacity duration-500 ease-out',
            imgLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgFailed(true);
            setImgLoaded(false);
          }}
        />
      )}

      {showImg && (
        <div
          className="absolute inset-0 z-[2] bg-gradient-to-t from-black/80 via-black/35 to-black/10"
          aria-hidden
        />
      )}

      <div
        className={cn(
          'relative z-[3] flex h-full min-h-0 flex-col items-center justify-end gap-2 px-4 pb-4 pt-10 text-center',
          isModal && 'justify-center pb-5 pt-12',
        )}
      >
        {showImg ? (
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

        <p
          className={cn(
            'line-clamp-3 w-full max-w-prose text-pretty text-xs leading-snug',
            showImg ? 'text-white drop-shadow-md' : 'text-foreground/80 dark:text-foreground/90',
            isModal && 'text-sm',
          )}
        >
          {previewText}
        </p>
      </div>
    </div>
  );
});
