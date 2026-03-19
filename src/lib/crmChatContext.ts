import type { ClientPlatform } from '@/lib/types';

/** Shape expected by `ClientChat` / `ops-chat` for platform-aware replies */
export interface CrmChatPlatformContext {
  platform: string;
  events: string[];
  lists: Array<{ name: string; count?: number }>;
  templates: string[];
  profile_properties: string[];
  segments: string[];
  last_sync_at?: string;
}

export function extractProfilePropertiesFromSamples(sampleProfiles: unknown[]): string[] {
  const properties = new Set<string>();
  sampleProfiles.forEach((profile) => {
    const extractProps = (obj: unknown, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj as object).forEach((key) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        properties.add(fullKey);
        const val = (obj as Record<string, unknown>)[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          extractProps(val, fullKey);
        }
      });
    };
    extractProps(profile);
  });
  return Array.from(properties);
}

export function buildCrmPlatformContexts(
  platforms: ClientPlatform[] | undefined
): CrmChatPlatformContext[] {
  const connected = platforms?.filter((p) => p.is_connected) || [];
  return connected
    .filter((cp) => cp.schema_cache)
    .map((cp) => {
      const cache = cp.schema_cache as Record<string, unknown>;
      return {
        platform: cp.platform,
        events: ((cache.metrics as { name?: string }[]) || []).map((m) => m.name).filter(Boolean) as string[],
        lists: ((cache.lists as { name?: string; profile_count?: number }[]) || []).map((l) => ({
          name: l.name || '',
          count: l.profile_count,
        })),
        templates: ((cache.templates as { name?: string }[]) || []).map((t) => t.name).filter(Boolean) as string[],
        profile_properties: extractProfilePropertiesFromSamples((cache.sample_profiles as unknown[]) || []),
        segments: ((cache.segments as { name?: string }[]) || []).map((s) => s.name).filter(Boolean) as string[],
        last_sync_at: cp.last_sync_at || undefined,
      };
    });
}
