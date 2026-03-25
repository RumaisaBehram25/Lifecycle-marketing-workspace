import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Canonical shades — match User Growth hero everywhere (primary/success/     */
/*  destructive/warning use the same opacity steps).                           */
/* -------------------------------------------------------------------------- */

/** Card outer border (all dashboard surfaces). */
export const dashBorder = 'border-primary/20';

/** Section / header dividers. */
export const dashDivider = 'border-primary/10';

/** Underline under section titles (drawer / panels). */
export const dashSectionTitleBorder = 'border-b border-primary/10';

/** Hover border emphasis (cards, buttons). */
export const dashBorderHover = 'hover:border-primary/35';

/** Live / status pill (compact). */
export const dashPill = cn(
  'inline-flex items-center rounded-full bg-primary/12 px-2 py-0.5',
  'text-[10px] font-semibold uppercase tracking-wide text-primary',
);

/** Standard primary icon chip (square). */
export const dashIconChip = cn(
  'flex items-center justify-center rounded-lg bg-primary/12 text-primary',
  'ring-1 ring-primary/15',
);

/** Semantic icon chips — same 12/15 pattern as primary. */
export const dashIconChipSuccess = cn(
  'flex items-center justify-center rounded-lg bg-success/12 text-success',
  'ring-1 ring-success/15',
);

export const dashIconChipDestructive = cn(
  'flex items-center justify-center rounded-lg bg-destructive/10 text-destructive',
  'ring-1 ring-destructive/15',
);

export const dashIconChipWarning = cn(
  'flex items-center justify-center rounded-lg bg-warning/12 text-warning',
  'ring-1 ring-warning/15',
);

/** Header / brand gradient wash. */
export const dashWashHeaderDown = 'bg-gradient-to-b from-primary/[0.07] to-transparent';
export const dashWashHeaderSide = 'bg-gradient-to-r from-primary/[0.07] via-card to-transparent';
export const dashWashBrand = 'bg-gradient-to-br from-primary/[0.07] via-card to-card';

/** CTA / promo panel (slightly stronger wash). */
export const dashWashPromo = 'bg-gradient-to-br from-primary/[0.08] via-card to-primary/[0.05]';

/** Shadows (single scale). */
export const dashShadowSm = 'shadow-sm shadow-primary/[0.06]';
export const dashShadowMd = 'shadow-md shadow-primary/[0.06]';
export const dashShadowLg = 'shadow-lg shadow-primary/[0.06]';
export const dashShadowHover = 'hover:shadow-xl hover:shadow-primary/[0.12]';

/** Inset ring on inner panels. */
export const dashRingInset = 'ring-1 ring-inset ring-border/40';
export const dashRingInsetSoft = 'ring-1 ring-inset ring-primary/10';

/** KPI left rails (3px). */
export const dashRailPrimary = 'border-l-[3px] border-l-primary';
export const dashRailSuccess = 'border-l-[3px] border-l-success/55';
export const dashRailDestructive = 'border-l-[3px] border-l-destructive/50';
export const dashRailWarning = 'border-l-[3px] border-l-warning/55';

/** KPI stat tile interiors (User Growth stat boxes). */
export const dashTileSuccess = cn(
  'rounded-xl border border-border/50 bg-gradient-to-br from-success/[0.06] via-card/90 to-card',
  'shadow-sm ring-1 ring-success/10',
  dashRailSuccess,
);

export const dashTilePrimary = cn(
  'rounded-xl border border-border/50 bg-gradient-to-br from-primary/[0.08] via-card/90 to-card',
  'shadow-sm ring-1 ring-primary/15',
  dashRailPrimary,
);

export const dashTileAccent = cn(
  'rounded-xl border border-border/50 bg-gradient-to-br from-accent/50 via-card/90 to-card',
  'shadow-sm ring-1 ring-accent-foreground/10 border-l-[3px] border-l-accent-foreground/50',
);

/** Canvases / secondary lifecycle metrics — accent rail. */
export const dashRailAccent = 'border-l-[3px] border-l-accent-foreground/50';

export const dashIconChipAccent = cn(
  'flex items-center justify-center rounded-lg bg-accent text-accent-foreground',
  'ring-1 ring-accent-foreground/15',
);

/** Skeleton / loading shell. */
export const dashWashSkeleton = 'bg-gradient-to-br from-primary/[0.06] via-card to-card';

/** Subtitle left rule (section descriptions). */
export const dashSubtitleRule = 'border-l-2 border-primary/20';

/** Soft badges (e.g. pillar tags). */
export const dashBadgeSoft =
  'border border-primary/10 bg-primary/12 text-foreground shadow-sm';

/** List row hover (briefs). */
export const dashRowHover = cn(
  'transition-all',
  dashBorderHover,
  'hover:shadow-md hover:shadow-primary/[0.12] hover:bg-card',
);

/** User Growth hero button (interactive shell). */
export const dashHeroButton = cn(
  'group w-full text-left rounded-2xl overflow-hidden border bg-card',
  dashBorder,
  dashShadowLg,
  dashRingInset,
  'transition-all duration-300',
  dashBorderHover,
  dashShadowHover,
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
);

/** Thin rule under sheet titles (same gradient as top accent, shorter). */
export const dashSheetHeaderAccent =
  'h-0.5 w-full shrink-0 bg-gradient-to-r from-primary via-primary/85 to-accent-foreground/40';

/** Sparkline container (hero + similar). */
export const dashSparklineBox = cn(
  'rounded-xl border border-primary/10 bg-gradient-to-b from-muted/40 to-muted/20 p-3 shadow-inner',
  'ring-1 ring-border/30',
);

/** Stickiness / inset callouts. */
export const dashStickinessPanel = cn(
  'rounded-xl border border-primary/10 bg-muted/25 px-4 py-3 text-sm',
  dashRingInset,
);

/** Live pill without “uppercase” (drawer subtitle). */
export const dashLivePillSoft = 'rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary';

/** Top accent strip (full width). */
export const dashboardTopAccentClass =
  'h-1 w-full shrink-0 bg-gradient-to-r from-primary via-primary/85 to-accent-foreground/40';

/** Outer shell — uses canonical border + shadow. */
export const dashboardSurfaceCard = cn(
  'overflow-hidden rounded-2xl border bg-card',
  dashBorder,
  dashShadowLg,
  dashRingInset,
);

export const dashboardSurfaceCardInteractive = cn(
  dashboardSurfaceCard,
  'transition-all duration-300',
  dashBorderHover,
  dashShadowHover,
);

/** Loading skeleton outer card. */
export const dashSkeletonCard = cn(dashboardSurfaceCard, dashWashSkeleton);

/** Empty / no-data warning card. */
export const dashboardEmptyWarningCard = cn(
  'overflow-hidden rounded-2xl border border-dashed border-warning/35',
  'bg-gradient-to-br from-warning/[0.06] via-card to-card',
  dashShadowLg,
  dashRingInset,
);

export const dashboardSectionHeadingClass = cn(
  'flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground font-heading',
);

export const dashboardSectionDotClass = 'h-1 w-1 rounded-full bg-primary shrink-0';

/** Performance grid metric card shell (below hero). */
export const dashboardMetricTile = cn(
  'overflow-hidden rounded-xl border border-border/50',
  'bg-gradient-to-br from-card via-card/95 to-muted/15',
  dashShadowMd,
  'ring-1 ring-inset ring-border/35',
);

/** Data tables in drawers. */
export const dashTableShell = 'rounded-lg border border-border/60 overflow-hidden';

/** Trend rings on interactive hero (grow / decline / mixed). */
export const dashTrendRingGrow = 'ring-success/15 hover:ring-success/25';
export const dashTrendRingDecline = 'ring-destructive/15 hover:ring-destructive/25';
export const dashTrendRingMixed = 'ring-warning/15 hover:ring-warning/25';
