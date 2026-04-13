/**
 * Plain-text previews in the dashboard cannot execute Liquid/Braze templating.
 * Strips common tag forms so push/SMS/IAM card copy reads like human prose.
 */
const FALLBACK = 'Personalized message';

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Remove Braze/Liquid-style `{% ... %}` blocks (repeat for nested-ish payloads). */
function stripLiquidControlTags(s: string): string {
  let prev = '';
  let out = s;
  for (let i = 0; i < 32 && out !== prev; i++) {
    prev = out;
    out = out.replace(/\{%-?[\s\S]*?-?%\}/g, ' ');
  }
  return out;
}

/**
 * Remove `{{ ... }}` after `${...}` is gone — otherwise `{{custom_attribute.${x}}}`
 * breaks non-greedy matchers and leaves `}` / `@` junk.
 */
function stripDoubleBraceInterpolations(s: string): string {
  let prev = '';
  let out = s;
  for (let i = 0; i < 32 && out !== prev; i++) {
    prev = out;
    out = out.replace(/\{\{[\s\S]*?\}\}/g, ' ');
  }
  return out;
}

/** Braze `${field}` inside `{{ ... }}` must go before `{{` stripping (see stripDoubleBraceInterpolations). */
function stripDollarBraceFields(s: string): string {
  let prev = '';
  let out = s;
  for (let i = 0; i < 32 && out !== prev; i++) {
    prev = out;
    out = out.replace(/\$\{[^}]+\}/g, ' ');
  }
  return out;
}

/** Leftovers from partial merges / odd Braze exports. */
function stripPreviewArtifacts(s: string): string {
  return (
    s
      .replace(/%@+/g, ' ')
      // Stray "@ }" or ", }" after stripping tokens
      .replace(/@\s*[},]/g, ' ')
      .replace(/,\s*}\s*/g, ', ')
      .replace(/^\s*[},@]+\s*/g, '')
      .replace(/\s+[},@]{1,3}\s*$/g, '')
  );
}

/** If both `{% if %}` and `{% else %}` branches survived as adjacent duplicate prose, keep one. */
function dedupeRepeatedTail(s: string): string {
  const t = collapseWs(s);
  if (t.length < 24) return t;
  const half = Math.floor(t.length / 2);
  for (let len = half; len >= 12; len--) {
    const a = t.slice(0, len).trimEnd();
    const b = t.slice(len).trimStart();
    if (a.length > 0 && a === b) return a;
    if (b.startsWith(a) && b.length > a.length) return collapseWs(b.slice(a.length));
  }
  // Sentence-level: "Foo! Bar! Bar!" → "Foo! Bar!"
  const chunks = t.split(/(?<=[.!?])\s+/).map((c) => c.trim()).filter(Boolean);
  if (chunks.length < 2) return t;
  const out: string[] = [];
  for (const c of chunks) {
    const prev = out[out.length - 1];
    if (out.length && prev.toLowerCase() === c.toLowerCase()) continue;
    out.push(c);
  }
  return out.join(' ');
}

/**
 * Safe one-line / short-paragraph preview for message bodies stored with Braze/Liquid syntax.
 */
export function plainTextPreviewFromBrazeMessageBody(raw: string | undefined | null): string {
  if (raw == null) return '';
  let s = String(raw);
  if (!s.trim()) return '';

  if (!/\{%|\{\{|\$\{/.test(s)) return collapseWs(s);

  s = stripLiquidControlTags(s);
  // Critical: `${...}` before `{{...}}` so `}}` inside `${x}}` does not truncate the liquid tag.
  s = stripDollarBraceFields(s);
  s = stripDoubleBraceInterpolations(s);
  s = stripDollarBraceFields(s);
  s = stripPreviewArtifacts(s);
  s = dedupeRepeatedTail(s);
  s = collapseWs(s);
  if (!s) return FALLBACK;
  return s;
}
