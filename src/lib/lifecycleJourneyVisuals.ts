import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  CalendarHeart,
  Flame,
  Gift,
  Heart,
  Mail,
  Megaphone,
  RefreshCw,
  Rocket,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

export type JourneyVisual = {
  Icon: LucideIcon;
  gradient: string;
  shadow: string;
  /** Soft hero background when there is no preview image */
  heroSurface: string;
};

const PALETTE: JourneyVisual[] = [
  {
    Icon: Sparkles,
    gradient: 'from-emerald-500 via-emerald-600 to-cyan-700',
    shadow: 'shadow-emerald-500/25',
    heroSurface:
      'from-emerald-200/90 via-teal-100/85 to-slate-50 dark:from-emerald-950/80 dark:via-teal-950/55 dark:to-slate-950',
  },
  {
    Icon: TrendingUp,
    gradient: 'from-sky-500 via-blue-600 to-indigo-700',
    shadow: 'shadow-blue-500/25',
    heroSurface:
      'from-sky-200/90 via-blue-100/85 to-slate-50 dark:from-sky-950/75 dark:via-blue-950/50 dark:to-slate-950',
  },
  {
    Icon: Zap,
    gradient: 'from-violet-500 via-purple-600 to-fuchsia-700',
    shadow: 'shadow-violet-500/25',
    heroSurface:
      'from-violet-200/90 via-purple-100/85 to-slate-50 dark:from-violet-950/75 dark:via-purple-950/50 dark:to-slate-950',
  },
  {
    Icon: Heart,
    gradient: 'from-pink-500 via-rose-600 to-red-700',
    shadow: 'shadow-pink-500/20',
    heroSurface:
      'from-pink-200/90 via-rose-100/85 to-slate-50 dark:from-pink-950/70 dark:via-rose-950/50 dark:to-slate-950',
  },
  {
    Icon: Rocket,
    gradient: 'from-orange-500 via-amber-600 to-yellow-700',
    shadow: 'shadow-orange-500/25',
    heroSurface:
      'from-orange-200/90 via-amber-100/85 to-slate-50 dark:from-orange-950/75 dark:via-amber-950/50 dark:to-slate-950',
  },
  {
    Icon: Target,
    gradient: 'from-cyan-500 via-blue-600 to-indigo-700',
    shadow: 'shadow-cyan-500/20',
    heroSurface:
      'from-cyan-200/90 via-sky-100/85 to-slate-50 dark:from-cyan-950/70 dark:via-sky-950/45 dark:to-slate-950',
  },
  {
    Icon: Star,
    gradient: 'from-amber-500 via-yellow-600 to-orange-700',
    shadow: 'shadow-amber-500/25',
    heroSurface:
      'from-amber-200/90 via-yellow-100/85 to-slate-50 dark:from-amber-950/70 dark:via-yellow-950/45 dark:to-slate-950',
  },
  {
    Icon: Shield,
    gradient: 'from-slate-500 via-slate-600 to-slate-800',
    shadow: 'shadow-slate-500/20',
    heroSurface:
      'from-slate-200/90 via-slate-100/85 to-slate-50 dark:from-slate-800/80 dark:via-slate-900/60 dark:to-slate-950',
  },
];

function hashTitle(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Icon + gradient for a journey from its title (keywords first, then stable hash fallback).
 */
export function getJourneyVisuals(name: string): JourneyVisual {
  const n = name.toLowerCase();

  if (n.includes('welcome') || n.includes('onboard'))
    return {
      Icon: Sparkles,
      gradient: 'from-emerald-500 via-emerald-600 to-teal-700',
      shadow: 'shadow-emerald-500/25',
      heroSurface:
        'from-emerald-200/90 via-teal-100/85 to-slate-50 dark:from-emerald-950/80 dark:via-teal-950/55 dark:to-slate-950',
    };
  if (n.includes('re-engage') || n.includes('winback') || n.includes('win-back') || n.includes('reactivation'))
    return {
      Icon: TrendingUp,
      gradient: 'from-sky-500 via-blue-600 to-indigo-700',
      shadow: 'shadow-blue-500/25',
      heroSurface:
        'from-sky-200/90 via-blue-100/85 to-slate-50 dark:from-sky-950/75 dark:via-blue-950/50 dark:to-slate-950',
    };
  if (n.includes('upgrade') || n.includes('upsell') || n.includes('cross-sell'))
    return {
      Icon: Zap,
      gradient: 'from-violet-500 via-purple-600 to-fuchsia-700',
      shadow: 'shadow-violet-500/25',
      heroSurface:
        'from-violet-200/90 via-purple-100/85 to-slate-50 dark:from-violet-950/75 dark:via-purple-950/50 dark:to-slate-950',
    };
  if (n.includes('milestone') || n.includes('anniversary') || n.includes('birthday'))
    return {
      Icon: Heart,
      gradient: 'from-pink-500 via-rose-600 to-red-700',
      shadow: 'shadow-pink-500/20',
      heroSurface:
        'from-pink-200/90 via-rose-100/85 to-slate-50 dark:from-pink-950/70 dark:via-rose-950/50 dark:to-slate-950',
    };
  if (n.includes('purchase') || n.includes('order') || n.includes('checkout') || n.includes('cart'))
    return {
      Icon: ShoppingCart,
      gradient: 'from-amber-500 via-orange-600 to-amber-800',
      shadow: 'shadow-amber-500/25',
      heroSurface:
        'from-amber-200/90 via-orange-100/85 to-slate-50 dark:from-amber-950/70 dark:via-orange-950/45 dark:to-slate-950',
    };
  if (n.includes('feature') || n.includes('announce') || n.includes('launch'))
    return {
      Icon: Gift,
      gradient: 'from-cyan-500 to-blue-600',
      shadow: 'shadow-cyan-500/20',
      heroSurface:
        'from-cyan-200/90 via-sky-100/85 to-slate-50 dark:from-cyan-950/70 dark:via-sky-950/45 dark:to-slate-950',
    };
  if (n.includes('abandon') || n.includes('recovery') || n.includes('remind'))
    return {
      Icon: Timer,
      gradient: 'from-orange-500 via-red-600 to-rose-800',
      shadow: 'shadow-orange-500/25',
      heroSurface:
        'from-orange-200/90 via-rose-100/80 to-slate-50 dark:from-orange-950/70 dark:via-rose-950/50 dark:to-slate-950',
    };
  if (n.includes('warm') || n.includes('warming') || n.includes('ip ') || n.includes('deliverability'))
    return {
      Icon: Flame,
      gradient: 'from-orange-400 via-rose-500 to-red-600',
      shadow: 'shadow-rose-500/30',
      heroSurface:
        'from-rose-200/90 via-orange-100/85 to-slate-50 dark:from-rose-950/70 dark:via-orange-950/45 dark:to-slate-950',
    };
  if (n.includes('sunset') || n.includes('churn') || n.includes('retention') || n.includes('save'))
    return {
      Icon: Shield,
      gradient: 'from-indigo-500 via-violet-600 to-purple-800',
      shadow: 'shadow-indigo-500/25',
      heroSurface:
        'from-indigo-200/90 via-violet-100/85 to-slate-50 dark:from-indigo-950/70 dark:via-violet-950/50 dark:to-slate-950',
    };
  if (n.includes('nurture') || n.includes('drip') || n.includes('education') || n.includes('series'))
    return {
      Icon: Mail,
      gradient: 'from-blue-500 via-indigo-600 to-violet-700',
      shadow: 'shadow-blue-500/25',
      heroSurface:
        'from-blue-200/90 via-indigo-100/85 to-slate-50 dark:from-blue-950/75 dark:via-indigo-950/50 dark:to-slate-950',
    };
  if (n.includes('trial') || n.includes('signup') || n.includes('sign-up'))
    return {
      Icon: Rocket,
      gradient: 'from-teal-500 via-cyan-600 to-blue-700',
      shadow: 'shadow-teal-500/25',
      heroSurface:
        'from-teal-200/90 via-cyan-100/85 to-slate-50 dark:from-teal-950/75 dark:via-cyan-950/50 dark:to-slate-950',
    };
  if (n.includes('survey') || n.includes('feedback') || n.includes('nps'))
    return {
      Icon: Star,
      gradient: 'from-yellow-500 via-amber-600 to-orange-700',
      shadow: 'shadow-amber-500/25',
      heroSurface:
        'from-yellow-200/90 via-amber-100/85 to-slate-50 dark:from-yellow-950/60 dark:via-amber-950/45 dark:to-slate-950',
    };
  if (n.includes('event') || n.includes('webinar') || n.includes('rsvp'))
    return {
      Icon: CalendarHeart,
      gradient: 'from-fuchsia-500 via-pink-600 to-rose-700',
      shadow: 'shadow-fuchsia-500/25',
      heroSurface:
        'from-fuchsia-200/90 via-pink-100/85 to-slate-50 dark:from-fuchsia-950/70 dark:via-pink-950/50 dark:to-slate-950',
    };
  if (n.includes('referral') || n.includes('invite') || n.includes('share'))
    return {
      Icon: Users,
      gradient: 'from-green-500 via-emerald-600 to-teal-700',
      shadow: 'shadow-green-500/25',
      heroSurface:
        'from-green-200/90 via-emerald-100/85 to-slate-50 dark:from-green-950/70 dark:via-emerald-950/50 dark:to-slate-950',
    };
  if (n.includes('loyalty') || n.includes('reward') || n.includes('vip'))
    return {
      Icon: Star,
      gradient: 'from-amber-400 via-yellow-500 to-orange-600',
      shadow: 'shadow-amber-500/30',
      heroSurface:
        'from-amber-200/90 via-yellow-100/85 to-slate-50 dark:from-amber-950/65 dark:via-yellow-950/40 dark:to-slate-950',
    };
  if (n.includes('billing') || n.includes('payment') || n.includes('invoice'))
    return {
      Icon: RefreshCw,
      gradient: 'from-slate-600 via-slate-700 to-slate-900',
      shadow: 'shadow-slate-500/25',
      heroSurface:
        'from-slate-200/90 via-slate-100/85 to-slate-50 dark:from-slate-800/80 dark:via-slate-900/60 dark:to-slate-950',
    };
  if (n.includes('push') || n.includes('notification') || n.includes('alert'))
    return {
      Icon: Bell,
      gradient: 'from-orange-500 via-amber-600 to-red-700',
      shadow: 'shadow-orange-500/25',
      heroSurface:
        'from-orange-200/90 via-amber-100/85 to-slate-50 dark:from-orange-950/75 dark:via-amber-950/50 dark:to-slate-950',
    };
  if (n.includes('promo') || n.includes('sale') || n.includes('discount') || n.includes('offer'))
    return {
      Icon: Megaphone,
      gradient: 'from-red-500 via-rose-600 to-pink-800',
      shadow: 'shadow-red-500/25',
      heroSurface:
        'from-red-200/90 via-rose-100/85 to-slate-50 dark:from-red-950/65 dark:via-rose-950/50 dark:to-slate-950',
    };

  return PALETTE[hashTitle(name) % PALETTE.length];
}
