/** Group Braze canvas tags by first path segment (e.g. `Channel/…` → prefix `Channel/`). */

export function canvasTagPrefix(tag: string): string {
  const t = tag.trim();
  if (!t) return 'Empty';
  const i = t.indexOf('/');
  if (i !== -1) return t.slice(0, i + 1);
  return 'Other / flat tags';
}

export function canvasTagSuffix(tag: string): string {
  const t = tag.trim();
  const i = t.indexOf('/');
  if (i !== -1) return t.slice(i + 1).trim() || t;
  return t;
}

export interface CanvasTagRow {
  tags: string[] | null;
  name: string;
}

export interface AggregatedCanvasTag {
  fullTag: string;
  suffix: string;
  canvasCount: number;
  sampleCanvasNames: string[];
}

export function aggregateCanvasTags(rows: CanvasTagRow[]): Map<string, AggregatedCanvasTag[]> {
  const perTag = new Map<string, { names: Set<string> }>();
  for (const row of rows) {
    const list = Array.isArray(row.tags) ? row.tags : [];
    for (const raw of list) {
      const tag = String(raw ?? '').trim();
      if (!tag) continue;
      let entry = perTag.get(tag);
      if (!entry) {
        entry = { names: new Set() };
        perTag.set(tag, entry);
      }
      entry.names.add(row.name);
    }
  }

  const byPrefix = new Map<string, AggregatedCanvasTag[]>();
  for (const [fullTag, { names }] of perTag) {
    const prefix = canvasTagPrefix(fullTag);
    const agg: AggregatedCanvasTag = {
      fullTag,
      suffix: canvasTagSuffix(fullTag),
      canvasCount: names.size,
      sampleCanvasNames: [...names].slice(0, 4),
    };
    const list = byPrefix.get(prefix) ?? [];
    list.push(agg);
    byPrefix.set(prefix, list);
  }

  for (const [, list] of byPrefix) {
    list.sort((a, b) => a.fullTag.localeCompare(b.fullTag));
  }

  return byPrefix;
}

export function sortPrefixes(prefixes: string[]): string[] {
  return [...prefixes].sort((a, b) => {
    const aOther = a.startsWith('Other');
    const bOther = b.startsWith('Other');
    if (aOther !== bOther) return aOther ? 1 : -1;
    return a.localeCompare(b);
  });
}
