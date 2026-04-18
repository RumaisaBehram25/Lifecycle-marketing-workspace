import { cn } from '@/lib/utils';

/** Served from `public/BRCG.png` (copy of project-root `BRCG.png`). */
const BRCG_PNG_SRC = '/BRCG.png';

const logoVisualBase =
  'block h-auto w-auto max-w-full object-contain object-left [image-rendering:-webkit-optimize-contrast]';

const iconVisualBase = 'block max-h-full max-w-full shrink-0 object-contain object-center';

/** Full-width / header wordmark — same asset as icon, sized by `className`. */
export function BRCGLogo({ className = 'h-8 w-auto', alt = 'BRCG' }: { className?: string; alt?: string }) {
  return (
    <img
      src={BRCG_PNG_SRC}
      alt={alt}
      width={160}
      height={40}
      className={cn(
        logoVisualBase,
        'drop-shadow-sm dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]',
        className,
      )}
      decoding="async"
    />
  );
}

/** Compact mark for sidebar, auth, chat — same PNG, constrained by `className` (often square wrapper). */
export function BRCGIcon({ className = 'h-6 w-6', alt = 'BRCG' }: { className?: string; alt?: string }) {
  return (
    <img
      src={BRCG_PNG_SRC}
      alt={alt}
      width={48}
      height={48}
      className={cn(iconVisualBase, 'drop-shadow-sm dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]', className)}
      decoding="async"
    />
  );
}
