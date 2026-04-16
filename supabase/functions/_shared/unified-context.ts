// Shared unified context builder for all AI-powered edge functions
// This ensures consistent, rich context across ops-chat, generate-copy, generate-code, etc.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from './logger.ts';

// ============= Types =============

export interface ClientContext {
  id: string;
  name: string;
  slug?: string;
  website_url?: string;
  logo_url?: string;
  brand_voice?: string;
  do_rules?: string[];
  dont_rules?: string[];
  tone_presets?: string[];
  legal_requirements?: string;
  // Extended brand context
  tagline?: string;
  industry?: string;
  primary_color?: string;
  secondary_color?: string;
  value_propositions?: Array<{ headline: string; description: string; icon?: string }>;
  copy_examples?: Array<{ title: string; content: string; channel?: string; source_url?: string }>;
  target_audience?: Array<{ name: string; description: string }>;
  key_messaging_pillars?: string[];
  differentiators?: string[];
  competitors?: Array<{ name: string; url?: string; notes?: string }>;
  /** Resource Center copy rules (channel character limits), from `clients.copy_rules` */
  copy_rules?: Record<string, unknown>[];
}

export interface PlatformData {
  platform: string;
  platform_id: string;
  is_connected: boolean;
  last_sync_at?: string;
  // Full arrays from schema_cache
  metrics: Array<{ id: string; name: string; integration?: any }>;
  lists: Array<{ id: string; name: string; profile_count?: number }>;
  templates: Array<{ id: string; name: string; editor_type?: string }>;
  sample_profiles: Array<{
    email?: string;
    properties?: Record<string, unknown>;
    location?: Record<string, unknown>;
  }>;
  profile_properties: string[];
  account?: Record<string, unknown>;
}

export interface KnowledgeDoc {
  title: string;
  content: string;
  platform?: string;
  category?: string;
  source_url?: string;
  is_vendor_doc: boolean;
}

export interface KnowledgeContext {
  // Tier 1: Full content (top 5 most relevant)
  primaryDocs: KnowledgeDoc[];
  // Tier 2: Summaries (next 10)
  supportingDocs: Array<{ title: string; platform?: string; category?: string; summary: string }>;
  // Tier 3: Just titles for reference
  availableDocs: Array<{ title: string; platform?: string; category?: string }>;
  // Stats
  stats: {
    totalVendorDocs: number;
    totalClientDocs: number;
    byPlatform: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

export interface UnifiedContext {
  client: ClientContext;
  platforms: PlatformData[];
  knowledge: KnowledgeContext;
  generatedAt: string;
}

// ============= Context Builder =============

/** Loads client + platforms + knowledge for one AI request (no cross-request memoization). */
export async function buildUnifiedContext(params: {
  clientId: string;
  supabase: SupabaseClient;
  queryType?: 'chat' | 'copy' | 'code';
  userQuery?: string;
}): Promise<UnifiedContext> {
  const { clientId, supabase, queryType = 'chat', userQuery } = params;

  // Fetch client, platforms, and knowledge in parallel
  const [clientResult, platformsResult, knowledgeResult] = await Promise.all([
    fetchClient(supabase, clientId),
    fetchPlatformData(supabase, clientId),
    fetchKnowledgeContext(supabase, clientId, queryType, userQuery),
  ]);

  return {
    client: clientResult,
    platforms: platformsResult,
    knowledge: knowledgeResult,
    generatedAt: new Date().toISOString(),
  };
}

// ============= Client Fetcher =============

/**
 * Loads the canonical `clients` row for AI features (CRM Copilot / `ops-chat`, `generate-copy`, etc.).
 * Resource Center edits the same row (`brand_voice`, `tone_presets`, `do_rules`, `dont_rules`, `copy_rules`, …).
 * `select('*')` keeps new brand columns available to `buildSystemPromptFromContext` without a separate migration step here.
 */
async function fetchClient(supabase: SupabaseClient, clientId: string): Promise<ClientContext> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error || !data) {
    logger.error('Failed to fetch client:', error);
    return {
      id: clientId,
      name: 'Unknown Client',
    };
  }

  // Ensure all array fields are properly arrays (JSON may come as objects)
  const toArray = (val: any): any[] => {
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') return Object.values(val);
    return [];
  };

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    website_url: data.website_url,
    logo_url: data.logo_url,
    brand_voice: data.brand_voice,
    do_rules: toArray(data.do_rules),
    dont_rules: toArray(data.dont_rules),
    tone_presets: toArray(data.tone_presets),
    legal_requirements: data.legal_requirements,
    // Extended brand context
    tagline: data.tagline,
    industry: data.industry,
    primary_color: data.primary_color,
    secondary_color: data.secondary_color,
    value_propositions: toArray(data.value_propositions),
    copy_examples: toArray(data.copy_examples),
    target_audience: toArray(data.target_audience),
    key_messaging_pillars: toArray(data.key_messaging_pillars),
    differentiators: toArray(data.differentiators),
    competitors: toArray(data.competitors),
    copy_rules: normalizeCopyRules(data.copy_rules),
  };
}

function normalizeCopyRules(val: unknown): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
}

function formatCopyRulesForPrompt(rules: Record<string, unknown>[] | undefined): string {
  if (!rules || rules.length === 0) return "";
  const lines: string[] = [];
  for (const r of rules) {
    if (r.isActive === false) continue;
    const ch = String(r.channel ?? "?");
    const el = String(r.element ?? "?");
    const min = typeof r.minChars === "number" ? r.minChars : Number(r.minChars);
    const max = typeof r.maxChars === "number" ? r.maxChars : Number(r.maxChars);
    const dev = Array.isArray(r.deviceTypes) ? (r.deviceTypes as string[]).join(", ") : "";
    const range =
      Number.isFinite(min) && Number.isFinite(max) ? `${min}–${max} characters` : "see workspace";
    lines.push(
      `- **${ch} · ${el}**: ${range}${dev ? ` (${dev})` : ""}`,
    );
  }
  return lines.join("\n");
}

// ============= Platform Data Fetcher =============

async function fetchPlatformData(supabase: SupabaseClient, clientId: string): Promise<PlatformData[]> {
  const { data: platforms, error } = await supabase
    .from('client_platforms')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_connected', true);

  if (error || !platforms) {
    logger.error('Failed to fetch platforms:', error);
    return [];
  }

  return platforms.map((p: any) => {
    const cache = p.schema_cache || {};
    
    // Extract profile properties from sample profiles
    const sampleProfiles = cache.sample_profiles || [];
    const profileProperties = extractProfileProperties(sampleProfiles);

    return {
      platform: p.platform,
      platform_id: p.id,
      is_connected: p.is_connected,
      last_sync_at: p.last_sync_at,
      metrics: cache.metrics || [],
      lists: cache.lists || [],
      templates: cache.templates || [],
      sample_profiles: sampleProfiles.slice(0, 5), // Keep only 5 for context
      profile_properties: profileProperties,
      account: cache.account,
    };
  });
}

function extractProfileProperties(profiles: any[]): string[] {
  const properties = new Set<string>();
  
  for (const profile of profiles) {
    // Standard properties
    if (profile.email) properties.add('email');
    if (profile.phone_number) properties.add('phone_number');
    if (profile.first_name) properties.add('first_name');
    if (profile.last_name) properties.add('last_name');
    if (profile.external_id) properties.add('external_id');
    
    // Custom properties
    if (profile.properties && typeof profile.properties === 'object') {
      Object.keys(profile.properties).forEach(key => properties.add(key));
    }
    
    // Location properties
    if (profile.location && typeof profile.location === 'object') {
      Object.keys(profile.location).forEach(key => properties.add(`location.${key}`));
    }
  }
  
  return Array.from(properties).sort();
}

// ============= Knowledge Context Fetcher =============

async function fetchKnowledgeContext(
  supabase: SupabaseClient,
  clientId: string,
  queryType: string,
  userQuery?: string
): Promise<KnowledgeContext> {
  // Priority categories based on query type
  const priorityCategories: Record<string, string[]> = {
    chat: ['liquid_templating', 'flows_journeys', 'api_reference', 'email', 'segmentation'],
    copy: ['email', 'sms', 'push', 'brand', 'copy_examples'],
    code: ['api_reference', 'liquid_templating', 'webhooks', 'integrations'],
  };
  
  const priorities = priorityCategories[queryType] || priorityCategories.chat;

  // Fetch vendor docs and client docs in parallel
  const [vendorDocsResult, clientDocsResult, statsResult] = await Promise.all([
    supabase
      .from('knowledge_documents')
      .select('title, content, platform, category, source_url, is_vendor_doc')
      .eq('is_vendor_doc', true)
      .order('updated_at', { ascending: false })
      .limit(60),
    supabase
      .from('knowledge_documents')
      .select('title, content, category, source_url, is_vendor_doc, platform')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(30),
    supabase
      .from('knowledge_documents')
      .select('platform, category, is_vendor_doc, client_id'),
  ]);

  const vendorDocs = vendorDocsResult.data || [];
  const clientDocs = clientDocsResult.data || [];
  const allDocs = [...clientDocs, ...vendorDocs]; // Client docs first

  // Score and sort docs by relevance
  const scoredDocs = scoreDocs(allDocs, priorities, userQuery);
  
  // Build tiered context
  const primaryDocs = scoredDocs.slice(0, 5).map(d => ({
    title: d.title || 'Untitled',
    content: d.content,
    platform: d.platform,
    category: d.category,
    source_url: d.source_url,
    is_vendor_doc: d.is_vendor_doc,
  }));
  
  const supportingDocs = scoredDocs.slice(5, 15).map(d => ({
    title: d.title || 'Untitled',
    platform: d.platform,
    category: d.category,
    summary: d.content?.slice(0, 300) || '',
  }));
  
  const availableDocs = scoredDocs.slice(15, 40).map(d => ({
    title: d.title || 'Untitled',
    platform: d.platform,
    category: d.category,
  }));

  // Build stats
  const stats = buildKnowledgeStats(statsResult.data || [], clientId);

  return {
    primaryDocs,
    supportingDocs,
    availableDocs,
    stats,
  };
}

function scoreDocs(docs: any[], priorities: string[], userQuery?: string): any[] {
  const queryTerms = userQuery?.toLowerCase().split(/\s+/) || [];
  
  return docs.map(doc => {
    let score = 0;
    
    // Priority category bonus
    const categoryIndex = priorities.indexOf(doc.category);
    if (categoryIndex !== -1) {
      score += (priorities.length - categoryIndex) * 10;
    }
    
    // Client docs get higher priority
    if (!doc.is_vendor_doc) {
      score += 50;
    }
    
    // Query term matching
    if (queryTerms.length > 0) {
      const title = doc.title?.toLowerCase() || '';
      const content = doc.content?.toLowerCase() || '';
      
      queryTerms.forEach(term => {
        if (title.includes(term)) score += 15;
        if (content.includes(term)) score += 5;
      });
    }
    
    return { ...doc, _score: score };
  }).sort((a, b) => b._score - a._score);
}

function buildKnowledgeStats(docs: any[], clientId: string): KnowledgeContext['stats'] {
  const stats = {
    totalVendorDocs: 0,
    totalClientDocs: 0,
    byPlatform: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
  };
  
  docs.forEach(doc => {
    if (doc.is_vendor_doc) {
      stats.totalVendorDocs++;
    } else if (doc.client_id === clientId) {
      stats.totalClientDocs++;
    }
    
    if (doc.platform) {
      stats.byPlatform[doc.platform] = (stats.byPlatform[doc.platform] || 0) + 1;
    }
    if (doc.category) {
      stats.byCategory[doc.category] = (stats.byCategory[doc.category] || 0) + 1;
    }
  });
  
  return stats;
}

// ============= System Prompt Builder =============

/**
 * Serializes `UnifiedContext` into markdown instructions for the model.
 *
 * **Resource Center alignment (chat / copy):** the `## CLIENT CONTEXT` block below injects the latest
 * `brand_voice`, `tone_presets`, `do_rules`, `dont_rules`, and optional extended fields from `fetchClient`.
 * **Copy Rules** (`clients.copy_rules`, edited under Resource Center → Rules) are appended when
 * `formatCopyRulesForPrompt` returns text. Callers should run `buildUnifiedContext` per request so edits
 * in the app appear on the next Copilot turn without relying on the browser cache.
 */
export function buildSystemPromptFromContext(
  context: UnifiedContext,
  purpose: 'chat' | 'copy' | 'code' = 'chat'
): string {
  const { client, platforms, knowledge } = context;
  
  let prompt = '';
  
  // Purpose-specific intro
  if (purpose === 'chat') {
    prompt = `You are an expert lifecycle marketing assistant helping with ${client.name}. You have deep knowledge of marketing automation platforms and can help with:
1. Writing marketing copy (emails, SMS, push notifications)
2. Building customer journeys and flows
3. Suggesting entry criteria and segmentation
4. Answering platform-specific questions
5. Explaining Liquid/templating syntax with examples
6. Troubleshooting platform configurations
7. **Analytics & CRM data** — when the prompt includes **ANALYTICS & CRM DATA**, those values are loaded **server-side with full database access** for the active client (same sources as the in-app Analytics tab). Quote them for totals, campaigns, usage, segments, canvases, and Customer.io. **Never** say you lack “tab permission”, “dashboard access”, or “cannot view Analytics”—you already have the excerpt.
8. If a subsection in **ANALYTICS & CRM DATA** is empty, only then say that table has no rows yet and suggest CSV import or sync.

`;
  } else if (purpose === 'copy') {
    prompt = `You are an expert lifecycle marketing copywriter for ${client.name}. Generate compelling, on-brand marketing copy that drives action while adhering to brand guidelines.

`;
  } else if (purpose === 'code') {
    prompt = `You are an expert in marketing automation platforms, helping ${client.name} with technical implementations. Provide accurate, platform-specific code examples.

`;
  }
  
  // Client context - core identity
  // Safe array join helper
  const safeJoin = (arr: any, separator = ', '): string => {
    if (Array.isArray(arr) && arr.length > 0) return arr.join(separator);
    return 'Not specified';
  };

  prompt += `## CLIENT CONTEXT
- **Name**: ${client.name}
- **Tagline**: ${client.tagline || 'Not specified'}
- **Industry**: ${client.industry || 'Not specified'}
- **Website**: ${client.website_url || 'Not specified'}
- **Brand Voice**: ${client.brand_voice || 'Professional and friendly'}
- **Tone Presets**: ${safeJoin(client.tone_presets)}
- **Do's**: ${safeJoin(client.do_rules, '; ')}
- **Don'ts**: ${safeJoin(client.dont_rules, '; ')}
- **Legal Requirements**: ${client.legal_requirements || 'Standard compliance'}

`;

  const copyRulesBlock = formatCopyRulesForPrompt(client.copy_rules);
  if (copyRulesBlock) {
    prompt += `### Copy Rules (character limits — from Resource Center → Rules)
${copyRulesBlock}

`;
  }

  // Target Audience
  if (client.target_audience && client.target_audience.length > 0) {
    prompt += `### Target Audience
${client.target_audience.map(a => `- **${a.name}**: ${a.description}`).join('\n')}

`;
  }

  // Value Propositions
  if (client.value_propositions && client.value_propositions.length > 0) {
    prompt += `### Value Propositions
${client.value_propositions.map(v => `- **${v.headline}**: ${v.description}`).join('\n')}

`;
  }

  // Key Messaging Pillars
  if (client.key_messaging_pillars && client.key_messaging_pillars.length > 0) {
    prompt += `### Key Messaging Pillars
${client.key_messaging_pillars.map(p => `- ${p}`).join('\n')}

`;
  }

  // Differentiators
  if (client.differentiators && client.differentiators.length > 0) {
    prompt += `### Differentiators (What Makes This Brand Unique)
${client.differentiators.map(d => `- ${d}`).join('\n')}

`;
  }

  // Competitors
  if (client.competitors && client.competitors.length > 0) {
    prompt += `### Competitive Landscape
${client.competitors.map(c => `- **${c.name}**${c.notes ? `: ${c.notes}` : ''}`).join('\n')}

`;
  }

  // Copy Examples - crucial for style emulation
  if (client.copy_examples && client.copy_examples.length > 0) {
    prompt += `### Copy Examples (Reference Style)
These are real examples of the brand's marketing copy. Emulate this style and tone:

${client.copy_examples.slice(0, 5).map(ex => `**${ex.title}** ${ex.channel ? `[${ex.channel}]` : ''}
${ex.content.slice(0, 500)}${ex.content.length > 500 ? '...' : ''}
`).join('\n')}

`;
  }

  // Platform data - FULL ARRAYS for rich context
  platforms.forEach(platform => {
    const syncAge = platform.last_sync_at 
      ? getTimeSince(platform.last_sync_at) 
      : 'never synced';
    
    prompt += `## PLATFORM: ${platform.platform.toUpperCase()}
**Last Sync**: ${syncAge}

### Events/Metrics (${platform.metrics.length} total)
${platform.metrics.slice(0, 50).map(m => m.name).join(', ')}${platform.metrics.length > 50 ? ` ... and ${platform.metrics.length - 50} more` : ''}

### Lists (${platform.lists.length} total)
${platform.lists.map(l => `- ${l.name}${l.profile_count ? ` (${l.profile_count.toLocaleString()} profiles)` : ''}`).join('\n')}

### Templates (${platform.templates.length} total)
${platform.templates.slice(0, 25).map(t => t.name).join(', ')}${platform.templates.length > 25 ? ` ... and ${platform.templates.length - 25} more` : ''}

### Profile Properties (${platform.profile_properties.length} available)
${platform.profile_properties.slice(0, 30).join(', ')}${platform.profile_properties.length > 30 ? ` ... and ${platform.profile_properties.length - 30} more` : ''}

`;
  });

  // Knowledge context - tiered approach
  if (knowledge.primaryDocs.length > 0) {
    prompt += `## KNOWLEDGE BASE

### PRIMARY REFERENCE DOCS (Full Content)
${knowledge.primaryDocs.map(doc => `
**${doc.title}** [${doc.platform || 'general'}/${doc.category || 'general'}]
${doc.content.slice(0, 1000)}${doc.content.length > 1000 ? '...' : ''}
`).join('\n')}

`;
  }
  
  if (knowledge.supportingDocs.length > 0) {
    prompt += `### SUPPORTING DOCS (Summaries)
${knowledge.supportingDocs.map(doc => `- **${doc.title}** [${doc.platform || 'general'}]: ${doc.summary}...`).join('\n')}

`;
  }
  
  if (knowledge.availableDocs.length > 0) {
    prompt += `### MORE DOCS AVAILABLE
${knowledge.availableDocs.map(doc => `- ${doc.title} [${doc.platform || 'general'}/${doc.category || 'general'}]`).join('\n')}

You only have titles/metadata for these unless full text appears under PRIMARY REFERENCE DOCS above.

`;
  }

  // Stats
  const platformCounts = Object.entries(knowledge.stats.byPlatform)
    .map(([p, c]) => `${p}: ${c}`)
    .join(', ');
  prompt += `**Knowledge Stats**: ${knowledge.stats.totalVendorDocs} vendor docs, ${knowledge.stats.totalClientDocs} client docs (${platformCounts || 'no platform docs'})

`;

  // Guidelines
  prompt += `## GUIDELINES
- Always use the client's brand voice and adhere to their do's and don'ts
- **Resource Center copy limits:** Character limits for email/SMS/push/in-app appear under **CLIENT CONTEXT → Copy Rules** when configured (saved on the client workspace in Supabase — not from Braze template sync). **Always** apply those limits when drafting or critiquing copy. **Never** say copy rules are "missing", "not synced", or "not in the snapshot" **only** because **PLATFORM** events, lists, or templates are empty — empty platform sync does **not** mean copy rules are absent if **Copy Rules** appears above.
- When suggesting entry criteria, use the actual events available in their platform
- When suggesting segmentation, reference their actual lists and profile properties
- When asked about Liquid/templating, provide complete syntax examples
- If data seems stale (synced > 24 hours ago), mention the user may want to re-sync
- Provide specific, actionable advice - not generic recommendations${
    purpose === 'chat'
      ? `
- **Metrics & CRM facts:** For **sends, opens, clicks, revenue, segment sizes, campaign performance, and list counts**, use only numbers and names from **ANALYTICS & CRM DATA** and **PLATFORM** in this prompt; never invent those. If those subsections are empty, say that operational data is not synced yet — this does **not** apply to **brand voice**, **do/don't rules**, or **Copy Rules** under **CLIENT CONTEXT** (use those whenever present).
- **No hallucinated access errors:** Do not tell the user you cannot query their database or Analytics; this prompt is already loaded from Supabase for their workspace.`
      : ''
  }

## RESPONSE FORMATTING
Format all responses using proper Markdown for optimal readability:

**Structure:**
- Use ## and ### headers to organize long responses into clear sections
- Keep paragraphs concise (2-3 sentences max)
- Use horizontal rules (---) to separate major sections when needed

**Lists:**
- Use bullet points (-) for unordered lists of options, features, or items
- Use numbered lists (1. 2. 3.) for sequential steps or ranked items
- Indent sub-items for hierarchy

**Emphasis:**
- Use **bold** for key terms, important concepts, and emphasis
- Use *italics* for platform names, technical terms on first mention, or subtle emphasis
- Use \`inline code\` for: variable names, event names, property names, Liquid tags, API endpoints

**Code Blocks:**
Always use fenced code blocks with language tags for code examples:
\`\`\`liquid
{{ profile.first_name | default: "there" }}
\`\`\`

Supported languages: liquid, json, html, javascript, python

**Tables:**
Use Markdown tables when comparing options or showing structured data:
| Option | Description | Use Case |
|--------|-------------|----------|
| A | Description A | When to use A |

**Callouts:**
Use blockquotes (>) for important warnings, tips, or callouts:
> **Note:** This is an important consideration...

**Links:**
When referencing documentation or resources, use proper Markdown links: [Link Text](URL)
`;

  return prompt;
}

function getTimeSince(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

// ============= Legacy Adapter =============
// For backwards compatibility with existing code

export function toLegacyPlatformContext(platforms: PlatformData[]): Array<{
  platform: string;
  events: string[];
  lists: Array<{ name: string; count?: number }>;
  templates: string[];
  profile_properties: string[];
  segments: string[];
  last_sync_at?: string;
}> {
  return platforms.map(p => ({
    platform: p.platform,
    events: p.metrics.map(m => m.name),
    lists: p.lists.map(l => ({ name: l.name, count: l.profile_count })),
    templates: p.templates.map(t => t.name),
    profile_properties: p.profile_properties,
    segments: [], // Not stored separately currently
    last_sync_at: p.last_sync_at,
  }));
}
