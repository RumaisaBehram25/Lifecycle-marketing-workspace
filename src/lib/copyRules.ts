import type { Json } from '@/integrations/supabase/types';

/** Matches `RulesTab` row shape; persisted on `clients.copy_rules`. */
export interface ClientCopyRule {
  id: string;
  channel: 'email' | 'push' | 'sms' | 'in_app';
  element: string;
  minChars: number;
  maxChars: number;
  deviceTypes: ('mobile' | 'tablet' | 'desktop' | 'watch')[];
  isActive: boolean;
}

export const DEFAULT_CLIENT_COPY_RULES: ClientCopyRule[] = [
  { id: '1', channel: 'email', element: 'Subject Line', minChars: 20, maxChars: 50, deviceTypes: ['mobile', 'desktop'], isActive: true },
  { id: '2', channel: 'email', element: 'Preview Text', minChars: 40, maxChars: 90, deviceTypes: ['mobile', 'desktop'], isActive: true },
  { id: '3', channel: 'email', element: 'CTA Button', minChars: 10, maxChars: 25, deviceTypes: ['mobile', 'desktop'], isActive: true },
  { id: '4', channel: 'push', element: 'Title', minChars: 10, maxChars: 40, deviceTypes: ['mobile', 'watch'], isActive: true },
  { id: '5', channel: 'push', element: 'Body', minChars: 30, maxChars: 120, deviceTypes: ['mobile', 'watch'], isActive: true },
  { id: '6', channel: 'sms', element: 'Message', minChars: 50, maxChars: 160, deviceTypes: ['mobile'], isActive: true },
  { id: '7', channel: 'in_app', element: 'Header', minChars: 10, maxChars: 30, deviceTypes: ['mobile', 'tablet'], isActive: true },
  { id: '8', channel: 'in_app', element: 'Body', minChars: 40, maxChars: 100, deviceTypes: ['mobile', 'tablet'], isActive: true },
];

function isDeviceType(d: unknown): d is ClientCopyRule['deviceTypes'][number] {
  return d === 'mobile' || d === 'tablet' || d === 'desktop' || d === 'watch';
}

function isChannel(c: unknown): c is ClientCopyRule['channel'] {
  return c === 'email' || c === 'push' || c === 'sms' || c === 'in_app';
}

/** Parse DB JSON into rules; returns null if nothing usable (caller may use defaults in UI only). */
export function parseClientCopyRules(json: Json | null | undefined): ClientCopyRule[] | null {
  if (json == null) return null;
  if (!Array.isArray(json) || json.length === 0) return null;
  const out: ClientCopyRule[] = [];
  for (const row of json) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const channel = r.channel;
    const element = r.element;
    if (!isChannel(channel) || typeof element !== 'string' || !element.trim()) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : `rule-${out.length}`;
    const minChars = typeof r.minChars === 'number' ? r.minChars : Number(r.minChars) || 0;
    const maxChars = typeof r.maxChars === 'number' ? r.maxChars : Number(r.maxChars) || 0;
    const rawDevices = Array.isArray(r.deviceTypes) ? r.deviceTypes : [];
    const deviceTypes = rawDevices.filter(isDeviceType);
    const isActive = r.isActive === false ? false : true;
    out.push({
      id,
      channel,
      element: element.trim(),
      minChars,
      maxChars,
      deviceTypes: deviceTypes.length > 0 ? deviceTypes : ['mobile', 'desktop'],
      isActive,
    });
  }
  return out.length > 0 ? out : null;
}
