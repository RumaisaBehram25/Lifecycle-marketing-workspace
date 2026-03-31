import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Scroll the app shell `<main>` (AppLayout uses this as the scroll container, not `window`). */
export function scrollAppMainToTop(behavior: ScrollBehavior = 'smooth') {
  if (typeof document === 'undefined') return;
  document.querySelector('main')?.scrollTo({ top: 0, behavior });
}

/** Run after the next frame so layout updates (e.g. pagination) have committed before scrolling. */
export function scrollAppMainToTopAfterLayout(behavior: ScrollBehavior = 'smooth') {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelector('main')?.scrollTo({ top: 0, behavior });
    });
  });
}
