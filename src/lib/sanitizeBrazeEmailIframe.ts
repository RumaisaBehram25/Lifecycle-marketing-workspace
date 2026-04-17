import { stripBrazeLiquidFromEmailHtmlForPreview } from '@/lib/campaignDisplay';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

/**
 * Braze email / in-app HTML for sandboxed iframes: strip Liquid control + variable tags, then DOMPurify.
 * Keeps `{% assign … %}`, `{%- … -%}`, etc. from rendering as visible text in Lifecycle / flow previews.
 */
export function sanitizeBrazeEmailHtmlForIframe(html: string | null | undefined): string {
  if (html == null) return '';
  return sanitizeHtml(stripBrazeLiquidFromEmailHtmlForPreview(String(html)));
}
