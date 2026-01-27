// Parse campaign name taxonomy: "20260115 | Campaign | Email | Messaging Nudge #2 - Active"
// Format: YYYYMMDD | Type | Channel | Campaign Name

export type CampaignCategory = 'marketing' | 'transactional';

export interface ParsedCampaign {
  date: Date | null;
  dateString: string | null;
  type: 'campaign' | 'lifecycle' | 'unknown';
  channel: string | null;
  displayName: string;
  originalName: string;
  category: CampaignCategory;
}

export function parseCampaignTaxonomy(name: string, tags?: string[]): ParsedCampaign {
  const parts = name.split('|').map(p => p.trim());
  
  // Determine category from tags or name
  const category = determineCampaignCategory(name, tags);
  
  if (parts.length < 4) {
    // Not following taxonomy, return as-is
    return {
      date: null,
      dateString: null,
      type: 'unknown',
      channel: null,
      displayName: name,
      originalName: name,
      category,
    };
  }

  const [dateStr, typeStr, channelStr, ...nameParts] = parts;
  const displayName = nameParts.join(' | ').trim() || name;

  // Parse date (YYYYMMDD)
  let date: Date | null = null;
  let dateString: string | null = null;
  if (dateStr && /^\d{8}$/.test(dateStr)) {
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = parseInt(dateStr.slice(6, 8));
    date = new Date(year, month, day);
    dateString = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }

  // Parse type
  const typeLower = typeStr?.toLowerCase() || '';
  let type: 'campaign' | 'lifecycle' | 'unknown' = 'unknown';
  if (typeLower.includes('campaign')) {
    type = 'campaign';
  } else if (typeLower.includes('lifecycle') || typeLower.includes('journey') || typeLower.includes('canvas')) {
    type = 'lifecycle';
  }

  // Parse channel
  const channel = channelStr?.toLowerCase() || null;

  return {
    date,
    dateString,
    type,
    channel,
    displayName,
    originalName: name,
    category,
  };
}

// Determine if campaign is Marketing or Transactional
export function determineCampaignCategory(name: string, tags?: string[]): CampaignCategory {
  const nameLower = name.toLowerCase();
  const tagSet = new Set((tags || []).map(t => t.toLowerCase()));
  
  // Check for transactional indicators
  const transactionalKeywords = [
    'transactional', 'receipt', 'confirmation', 'password', 'reset',
    'verification', 'verify', 'invoice', 'order', 'shipping', 'delivery',
    'account', 'security', 'login', 'authentication', '2fa', 'otp'
  ];
  
  // Check tags first
  if (tagSet.has('transactional')) return 'transactional';
  if (tagSet.has('marketing')) return 'marketing';
  
  // Check name for keywords
  for (const keyword of transactionalKeywords) {
    if (nameLower.includes(keyword)) return 'transactional';
  }
  
  // Default to marketing
  return 'marketing';
}

// Get badge color for category
export function getCategoryColor(category: CampaignCategory): string {
  switch (category) {
    case 'marketing':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
    case 'transactional':
      return 'bg-slate-500/10 text-slate-600 border-slate-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// Get badge color for channel
export function getChannelColor(channel: string | null): string {
  switch (channel?.toLowerCase()) {
    case 'email':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    case 'push':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
    case 'sms':
      return 'bg-green-500/10 text-green-600 border-green-500/30';
    case 'in-app':
    case 'in_app':
    case 'in-app-message':
    case 'in_app_message':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// Get badge color for type
export function getTypeColor(type: 'campaign' | 'lifecycle' | 'unknown'): string {
  switch (type) {
    case 'campaign':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'lifecycle':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
