import { memo } from 'react';
import { Bell, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { campaignImageDisplayUrl } from '@/lib/campaignCreativeImageUrl';
import { Badge } from '@/components/ui/badge';
import type { CampaignChannelUi } from '@/lib/campaignDisplay';

export interface PushSmsModalHeroProps {
  channel: Exclude<CampaignChannelUi, 'email'>;
  title: string;
  body: string;
  previewImageUrl?: string | null;
  className?: string;
  /** Shown when the source string contained Braze Liquid before sanitization. */
  titlePersonalized?: boolean;
  bodyPersonalized?: boolean;
}

/**
 * Push / in-app / SMS hero for the campaign modal — distinct from email (no mail placeholder).
 */
export const PushSmsModalHero = memo(function PushSmsModalHero({
  channel,
  title,
  body,
  previewImageUrl,
  className,
  titlePersonalized,
  bodyPersonalized,
}: PushSmsModalHeroProps) {
  const url = typeof previewImageUrl === 'string' && previewImageUrl.trim() ? previewImageUrl.trim() : undefined;
  const imgSrc = url ? campaignImageDisplayUrl(url, 'detail') : undefined;
  const isSms = channel === 'sms';
  const isInApp = channel === 'inapp';

  if (isSms) {
    return (
      <div
        className={cn(
          'flex min-h-[220px] items-center justify-center rounded-xl border border-border/80 bg-muted/40 px-4 py-6 shadow-sm dark:border-border/60',
          className,
        )}
        aria-label="SMS preview"
      >
        <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-primary/15 px-4 py-3 text-left shadow-sm ring-1 ring-border/60 dark:bg-primary/10">
          <div className="flex flex-wrap items-center gap-2">
            <p className="select-text text-sm font-semibold leading-snug text-foreground break-words">{title || '—'}</p>
            {titlePersonalized ? (
              <Badge
                variant="outline"
                className="h-5 shrink-0 border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
              >
                Personalized
              </Badge>
            ) : null}
          </div>
          {body ? (
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {bodyPersonalized ? (
                <Badge
                  variant="outline"
                  className="mt-0.5 h-5 shrink-0 border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
                >
                  Personalized
                </Badge>
              ) : null}
              <p className="min-w-0 flex-1 select-text text-sm leading-relaxed text-muted-foreground break-words">
                {body}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-[220px] rounded-xl border border-border/80 bg-gradient-to-b from-muted/80 to-background shadow-sm dark:border-border/60',
        className,
      )}
      aria-label={isInApp ? 'In-app message preview' : 'Push notification preview'}
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {isInApp ? (
          <Smartphone className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" aria-hidden />
        ) : (
          <Bell className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" aria-hidden />
        )}
        {isInApp ? 'In-app message' : 'Push notification'}
      </div>
      {url && imgSrc ? (
        <div className="relative w-full bg-muted">
          <img
            src={imgSrc}
            alt=""
            className="block h-auto w-full max-w-full object-contain object-top"
            loading="eager"
            decoding="async"
          />
        </div>
      ) : null}
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="select-text text-sm font-semibold leading-snug text-foreground break-words">{title || '—'}</p>
          {titlePersonalized ? (
            <Badge
              variant="outline"
              className="h-5 shrink-0 border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
            >
              Personalized
            </Badge>
          ) : null}
        </div>
        {body ? (
          <div className="flex flex-wrap items-start gap-2">
            {bodyPersonalized ? (
              <Badge
                variant="outline"
                className="mt-0.5 h-5 shrink-0 border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
              >
                Personalized
              </Badge>
            ) : null}
            <p className="min-w-0 flex-1 select-text text-sm leading-relaxed text-muted-foreground break-words">
              {body}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No body text in sync payload</p>
        )}
      </div>
    </div>
  );
});
