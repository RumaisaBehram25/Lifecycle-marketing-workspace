import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style', 'link'],
    ADD_ATTR: ['target', 'href', 'src', 'alt', 'class', 'style'],
    FORBID_TAGS: ['script', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}
