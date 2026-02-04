import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Batch size for parallel API calls - keep low to avoid memory issues
const BATCH_SIZE = 5;
const MAX_HTML_SIZE = 50000; // 50KB max per HTML content

// Normalized campaign type detection
type CampaignType = 'email' | 'push' | 'inapp' | 'sms' | 'webhook' | 'content_card' | 'unknown';
type MessageType = 'campaign' | 'canvas_step' | 'content_block';

interface NormalizedContent {
  title?: string;
  subject?: string;
  preheader?: string;
  body_text?: string;
  body_html?: string;
  image_url?: string;
  deep_link?: string;
  buttons?: Array<{ text: string; action?: string; url?: string }>;
  extras?: Record<string, unknown>;
}

interface NormalizedVariant {
  variant_id: string;
  name: string;
  platforms: string[];
  content: NormalizedContent;
}

interface NormalizedCampaign {
  source: 'braze';
  message_type: MessageType;
  campaign_id: string;
  campaign_name: string;
  updated_at?: string;
  campaign_type: CampaignType;
  channels: string[];
  variants: NormalizedVariant[];
  warnings: string[];
  draft?: boolean;
  schedule_type?: string;
  first_sent?: string;
  last_sent?: string;
  tags?: string[];
  archived?: boolean;
  description?: string;
}

interface BrazeCampaign extends NormalizedCampaign {
  id: string;
  name: string;
  subject?: string;
  preheader?: string;
  html_preview?: string;
  push_title?: string;
  push_body?: string;
  push_deep_link?: string;
  push_extras?: Record<string, unknown>;
  inapp_header?: string;
  inapp_body?: string;
  inapp_cta?: string;
  inapp_image_url?: string;
  inapp_buttons?: Array<{ text: string; action?: string; url?: string }>;
}

interface CanvasStep {
  id: string;
  name: string;
  type: string;
  channel?: string;
  delay_seconds?: number;
  delay_formatted?: string;
  next_step_ids: string[];
  next_paths?: Array<{ name: string; next_step_id: string; percentage?: number }>;
  messages?: Array<{
    channel: string;
    subject?: string;
    preheader?: string;
    title?: string;
    body?: string;
    html_content?: string;
    image_url?: string;
    buttons?: Array<{ text: string; action?: string; url?: string }>;
  }>;
}

interface CanvasVariant {
  name: string;
  percentage: number;
  first_step_id: string | null;
}

interface BrazeCanvas {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  enabled?: boolean;
  schedule_type?: string;
  first_entry?: string;
  last_entry?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  archived?: boolean;
  variants: CanvasVariant[];
  steps: Record<string, CanvasStep>;
  total_steps?: number;
  entry_type?: 'trigger' | 'segment' | 'api' | 'scheduled' | 'action_based';
  entry_segment_name?: string;
  trigger_event_name?: string;
  exception_events?: string[];
  filters?: Array<{ type: string; value: string }>;
  // Conversion tracking
  conversion_events?: Array<{
    name: string;
    window_seconds?: number;
    type?: string;
  }>;
  entry_filters?: Array<{
    type: string;
    property?: string;
    value?: string;
    comparator?: string;
  }>;
}

interface BrazeTemplate {
  email_template_id: string;
  template_name: string;
  description?: string;
  subject?: string;
  preheader?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  html_preview?: string;
}

interface BrazeSegment {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  is_starred?: boolean;
  size?: number;
}

// Truncate HTML to prevent memory issues
function truncateHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  if (html.length <= MAX_HTML_SIZE) return html;
  return html.slice(0, MAX_HTML_SIZE) + '<!-- truncated -->';
}

// Process items in batches to avoid memory spikes
async function processBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = BATCH_SIZE
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
    // Small delay between batches to let GC run
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  return results;
}

async function brazeFetch(endpoint: string, apiKey: string, restEndpoint: string) {
  const url = `${restEndpoint}/${endpoint}`;
  console.log(`Fetching Braze: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Braze API error: ${response.status}`);
  }

  return response.json();
}

function formatDelay(seconds: number | undefined): string {
  if (!seconds || seconds === 0) return '0h';
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

function detectCampaignType(msgData: any): CampaignType {
  if (msgData.body || msgData.html_body || msgData.from_name || msgData.subject) return 'email';
  if (msgData.alert || msgData.title || msgData.extras || msgData.deep_link) return 'push';
  if (msgData.message || msgData.header || msgData.buttons) return 'inapp';
  if (msgData.message_body || msgData.subscription_group_id) return 'sms';
  if (msgData.url || msgData.http_method) return 'webhook';
  if (msgData.card_type || msgData.pinned) return 'content_card';
  return 'unknown';
}

function normalizeMessageContent(msgData: any, campaignType: CampaignType): NormalizedContent {
  const content: NormalizedContent = {};
  
  switch (campaignType) {
    case 'email':
      content.subject = msgData.subject;
      content.preheader = msgData.preheader;
      content.body_html = truncateHtml(msgData.body || msgData.html_body);
      content.body_text = msgData.plaintext_body;
      break;
    case 'push':
      content.title = msgData.title || msgData.alert_title;
      content.body_text = msgData.message || msgData.alert || msgData.body;
      content.deep_link = msgData.deep_link || msgData.uri;
      content.image_url = msgData.big_image || msgData.image_url;
      break;
    case 'inapp':
      content.title = msgData.header || msgData.title;
      content.body_text = msgData.message || msgData.body;
      content.image_url = msgData.image_url;
      const buttons: Array<{ text: string; action?: string; url?: string }> = [];
      if (msgData.button_one_text) {
        buttons.push({ text: msgData.button_one_text, action: msgData.button_one_action, url: msgData.button_one_uri });
      }
      if (msgData.button_two_text) {
        buttons.push({ text: msgData.button_two_text, action: msgData.button_two_action, url: msgData.button_two_uri });
      }
      if (buttons.length > 0) content.buttons = buttons;
      break;
    case 'sms':
      content.body_text = msgData.message_body || msgData.body;
      break;
    default:
      content.body_text = msgData.message || msgData.body;
  }
  
  return content;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const { clientId, platformId, restEndpoint } = await req.json();

    if (!clientId || !platformId) {
      throw new Error('clientId and platformId are required');
    }

    const accessResult = await validateClientAccess(authResult.userClient!, clientId);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: platform, error: platformError } = await supabase
      .from('client_platforms')
      .select('*')
      .eq('id', platformId)
      .single();

    if (platformError || !platform) {
      throw new Error('Platform connection not found');
    }

    if (platform.platform !== 'braze') {
      throw new Error('This endpoint only supports Braze');
    }

    const apiKey = platform.api_key_encrypted;
    if (!apiKey) {
      throw new Error('No API key configured for this platform');
    }

    const brazeRestEndpoint = restEndpoint || 
      (platform.additional_config as any)?.rest_endpoint || 
      'https://rest.iad-01.braze.com';

    console.log('Fetching Braze data for client:', clientId);

    const results: {
      campaigns: BrazeCampaign[];
      canvases: BrazeCanvas[];
      templates: BrazeTemplate[];
      segments: BrazeSegment[];
    } = {
      campaigns: [],
      canvases: [],
      templates: [],
      segments: [],
    };

    // === TEMPLATES (limit to 20 with details, rest basic) ===
    const templateHtmlMap = new Map<string, { subject: string; preheader: string; html: string }>();
    
    try {
      const templatesData = await brazeFetch('templates/email/list?limit=50', apiKey, brazeRestEndpoint);
      const templateList = templatesData.templates || [];
      
      // Fetch details for first 20 templates only (in batches of 5)
      const templatesWithDetails = await processBatches(
        templateList.slice(0, 20),
        async (t: any) => {
          try {
            const details = await brazeFetch(`templates/email/info?email_template_id=${t.email_template_id}`, apiKey, brazeRestEndpoint);
            const htmlContent = truncateHtml(details.body);
            
            if (htmlContent) {
              templateHtmlMap.set(t.email_template_id, {
                subject: details.subject || '',
                preheader: details.preheader || '',
                html: htmlContent,
              });
            }
            
            return {
              email_template_id: t.email_template_id,
              template_name: t.template_name,
              description: t.description,
              subject: details.subject || t.subject,
              preheader: details.preheader || t.preheader,
              tags: t.tags,
              created_at: t.created_at,
              updated_at: t.updated_at,
              html_preview: htmlContent,
            };
          } catch {
            return {
              email_template_id: t.email_template_id,
              template_name: t.template_name,
              subject: t.subject,
              preheader: t.preheader,
              tags: t.tags,
            };
          }
        }
      );
      
      const remainingTemplates = templateList.slice(20).map((t: any) => ({
        email_template_id: t.email_template_id,
        template_name: t.template_name,
        subject: t.subject,
        preheader: t.preheader,
        tags: t.tags,
      }));
      
      results.templates = [...templatesWithDetails, ...remainingTemplates];
      console.log('Fetched templates:', results.templates.length);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    }

    // === CAMPAIGNS (limit to 30 with details) ===
    try {
      const campaignsData = await brazeFetch('campaigns/list?page=0&include_archived=false&sort_direction=desc', apiKey, brazeRestEndpoint);
      const campaignList = (campaignsData.campaigns || []).slice(0, 50);
      
      console.log(`Found ${campaignList.length} campaigns, fetching details for first 30...`);
      
      const campaignsWithDetails = await processBatches(
        campaignList.slice(0, 30),
        async (c: any): Promise<BrazeCampaign> => {
          const warnings: string[] = [];
          const variants: NormalizedVariant[] = [];
          let primaryCampaignType: CampaignType = 'unknown';
          let subject = '', preheader = '', htmlPreview = '';
          let push_title = '', push_body = '', push_deep_link = '';
          let inapp_header = '', inapp_body = '', inapp_cta = '', inapp_image_url = '';
          
          try {
            const details = await brazeFetch(`campaigns/details?campaign_id=${c.id}`, apiKey, brazeRestEndpoint);
            const messages = details.messages || {};
            
            for (const [variantId, msg] of Object.entries(messages)) {
              const msgData = msg as any;
              const detectedType = detectCampaignType(msgData);
              if (detectedType !== 'unknown') primaryCampaignType = detectedType;
              
              const normalizedContent = normalizeMessageContent(msgData, detectedType);
              variants.push({
                variant_id: variantId,
                name: msgData.name || `Variant ${variants.length + 1}`,
                platforms: ['all'],
                content: normalizedContent,
              });
              
              // Legacy flattened extraction
              if (detectedType === 'email') {
                subject = msgData.subject || subject;
                preheader = msgData.preheader || preheader;
                const templateId = msgData.email_template_id || msgData.template_id;
                if (msgData.body) {
                  htmlPreview = truncateHtml(msgData.body) || '';
                } else if (templateId && templateHtmlMap.has(templateId)) {
                  const tpl = templateHtmlMap.get(templateId)!;
                  htmlPreview = tpl.html;
                  subject = subject || tpl.subject;
                  preheader = preheader || tpl.preheader;
                }
              }
              if (detectedType === 'push') {
                push_title = msgData.title || push_title;
                push_body = msgData.message || msgData.alert || push_body;
                push_deep_link = msgData.deep_link || push_deep_link;
              }
              if (detectedType === 'inapp') {
                inapp_header = msgData.header || inapp_header;
                inapp_body = msgData.message || inapp_body;
                inapp_cta = msgData.button_one_text || inapp_cta;
                inapp_image_url = msgData.image_url || inapp_image_url;
              }
            }
          } catch {
            warnings.push('details_fetch_failed');
          }
          
          if (primaryCampaignType === 'unknown' && c.channels?.[0]) {
            const ch = c.channels[0].toLowerCase();
            if (ch.includes('email')) primaryCampaignType = 'email';
            else if (ch.includes('push')) primaryCampaignType = 'push';
            else if (ch.includes('in_app')) primaryCampaignType = 'inapp';
          }
          
          return {
            source: 'braze',
            message_type: 'campaign',
            campaign_id: c.id,
            campaign_name: c.name,
            campaign_type: primaryCampaignType,
            channels: c.channels || ['email'],
            variants,
            warnings,
            id: c.id,
            name: c.name,
            description: c.description,
            draft: c.draft,
            schedule_type: c.schedule_type,
            first_sent: c.first_sent,
            last_sent: c.last_sent,
            tags: c.tags,
            updated_at: c.updated_at,
            archived: c.archived,
            subject,
            preheader,
            html_preview: htmlPreview,
            push_title,
            push_body,
            push_deep_link,
            inapp_header,
            inapp_body,
            inapp_cta,
            inapp_image_url: inapp_image_url || undefined,
          };
        }
      );
      
      const remainingCampaigns: BrazeCampaign[] = campaignList.slice(30).map((c: any) => ({
        source: 'braze',
        message_type: 'campaign',
        campaign_id: c.id,
        campaign_name: c.name,
        campaign_type: 'unknown' as CampaignType,
        channels: c.channels || ['email'],
        variants: [],
        warnings: ['details_not_fetched'],
        id: c.id,
        name: c.name,
        draft: c.draft,
        schedule_type: c.schedule_type,
        tags: c.tags,
      }));
      
      results.campaigns = [...campaignsWithDetails, ...remainingCampaigns];
      console.log('Fetched campaigns:', results.campaigns.length);
    } catch (e) {
      console.error('Failed to fetch campaigns:', e);
    }

    // === CANVASES (paginate to capture all ~35-40 active journeys) ===
    try {
      let allCanvasList: any[] = [];
      let canvasPage = 0;
      
      // Fetch canvas list (up to 10 pages to capture all journeys)
      while (canvasPage < 10) {
        const canvasesData = await brazeFetch(`canvas/list?page=${canvasPage}&include_archived=false&sort_direction=desc`, apiKey, brazeRestEndpoint);
        const canvases = canvasesData.canvases || [];
        if (canvases.length === 0) break;
        allCanvasList = [...allCanvasList, ...canvases];
        canvasPage++;
        // Early exit if we have enough
        if (allCanvasList.length >= 100) break;
      }
      
      // Filter to non-draft canvases for detailed fetching (prioritize active)
      const activeCanvases = allCanvasList.filter((c: any) => !c.draft);
      const draftCanvases = allCanvasList.filter((c: any) => c.draft);
      
      console.log(`Found ${allCanvasList.length} total canvases (${activeCanvases.length} active, ${draftCanvases.length} drafts). Fetching details for active canvases...`);
      
      // Process active canvases first (all of them), then basic info for drafts
      const canvasesWithDetails = await processBatches(
        activeCanvases.slice(0, 50), // Up to 50 active canvases with full details
        async (c: any): Promise<BrazeCanvas> => {
          const variants: CanvasVariant[] = [];
          const steps: Record<string, CanvasStep> = {};
          let enabled = false;
          let entryType: string | undefined;
          let entrySegmentName: string | undefined;
          let triggerEventName: string | undefined;
          let exceptionEvents: string[] = [];
          let conversionEvents: Array<{ name: string; window_seconds?: number; type?: string }> = [];
          let entryFilters: Array<{ type: string; property?: string; value?: string; comparator?: string }> = [];
          
          try {
            const details = await brazeFetch(`canvas/details?canvas_id=${c.id}`, apiKey, brazeRestEndpoint);
            enabled = details.enabled === true;
            
            // Log key fields for debugging (first canvas only)
            if (allCanvasList.indexOf(c) === 0) {
              console.log('Sample canvas details keys:', Object.keys(details));
              console.log('schedule_type:', details.schedule_type);
              console.log('entry_schedule:', JSON.stringify(details.entry_schedule));
              console.log('entry_rules:', JSON.stringify(details.entry_rules));
              console.log('exception_events:', JSON.stringify(details.exception_events));
              console.log('conversion_behaviors:', JSON.stringify(details.conversion_behaviors));
            }
            
            // Parse entry type from schedule_type
            if (details.schedule_type) entryType = details.schedule_type;
            if (details.entry_schedule?.type) entryType = details.entry_schedule.type;
            
            // Parse trigger event name from multiple possible locations
            if (details.entry_schedule?.trigger_event_name) {
              triggerEventName = details.entry_schedule.trigger_event_name;
            }
            if (!triggerEventName && details.trigger_events?.length > 0) {
              triggerEventName = details.trigger_events.map((t: any) => 
                typeof t === 'string' ? t : t.name || t.event_name
              ).join(', ');
            }
            if (!triggerEventName && details.entry_rules?.trigger?.custom_event?.custom_event_name) {
              triggerEventName = details.entry_rules.trigger.custom_event.custom_event_name;
            }
            // Also check steps for action-based triggers
            if (!triggerEventName && details.steps?.length > 0) {
              const firstStep = details.steps[0];
              if (firstStep?.trigger_properties?.event_name) {
                triggerEventName = firstStep.trigger_properties.event_name;
              }
            }
            
            // Parse segment/audience name from multiple locations
            if (details.entry_audience_name) entrySegmentName = details.entry_audience_name;
            if (!entrySegmentName && details.entry_segment?.name) entrySegmentName = details.entry_segment.name;
            if (!entrySegmentName && details.entry_schedule?.segment?.name) entrySegmentName = details.entry_schedule.segment.name;
            if (!entrySegmentName && details.entry_rules?.segment) {
              entrySegmentName = details.entry_rules.segment.segment_id ? `Segment: ${details.entry_rules.segment.segment_id}` : undefined;
            }
            
            // Parse exception events
            if (details.exception_events?.length > 0) {
              exceptionEvents = details.exception_events.map((e: any) => 
                typeof e === 'string' ? e : e.name || e.custom_event_name || 'Exception'
              );
            }
            
            // Parse conversion events
            if (details.conversion_behaviors?.length > 0) {
              conversionEvents = details.conversion_behaviors.map((cv: any) => ({
                name: cv.type || cv.conversion_event_type || 'Conversion',
                window_seconds: cv.window_conversion_production_seconds || cv.window,
                type: cv.type,
              }));
            }
            if (details.conversion_events?.length > 0) {
              conversionEvents = details.conversion_events.map((cv: any) => ({
                name: cv.name || cv.event_name || 'Conversion',
                window_seconds: cv.window_seconds,
                type: cv.type,
              }));
            }
            
            // Parse entry filters/audiences
            if (details.entry_audience_filters?.length > 0) {
              entryFilters = details.entry_audience_filters.map((f: any) => ({
                type: f.type || 'filter',
                property: f.property || f.attribute,
                value: f.value?.toString() || f.comparator_value?.toString(),
                comparator: f.comparator || f.comparison,
              }));
            }
            if (details.entry_rules?.audience?.AND?.length > 0) {
              for (const rule of details.entry_rules.audience.AND) {
                if (rule.custom_attribute) {
                  entryFilters.push({
                    type: 'custom_attribute',
                    property: rule.custom_attribute.custom_attribute_name,
                    value: rule.custom_attribute.value?.toString(),
                    comparator: rule.custom_attribute.comparison,
                  });
                }
                if (rule.email_subscription) {
                  entryFilters.push({
                    type: 'email_subscription',
                    value: rule.email_subscription.subscription_status,
                  });
                }
              }
            }
            
            // Parse variants
            if (details.variants?.length > 0) {
              for (const v of details.variants) {
                variants.push({
                  name: v.name || 'Variant',
                  percentage: v.percentage || 100,
                  first_step_id: v.first_step_id || null,
                });
              }
            }
            
            // Parse steps (limit HTML size)
            if (details.steps?.length > 0) {
              for (const s of details.steps) {
                if (!s.id) continue;
                
                const messages: CanvasStep['messages'] = [];
                if (s.messages && typeof s.messages === 'object') {
                  for (const [, msgData] of Object.entries(s.messages)) {
                    const msg = msgData as any;
                    const channel = msg.channel || s.channels?.[0] || 'email';
                    
                    messages.push({
                      channel,
                      subject: msg.subject,
                      preheader: msg.preheader,
                      title: msg.title || msg.header,
                      body: msg.message || msg.alert,
                      html_content: truncateHtml(channel === 'email' ? (msg.body || msg.html_body) : undefined),
                      image_url: msg.image_url,
                      buttons: msg.buttons,
                    });
                  }
                }
                
                const nextPaths: Array<{ name: string; next_step_id: string; percentage?: number }> = [];
                if (s.next_paths?.length > 0) {
                  for (const p of s.next_paths) {
                    nextPaths.push({
                      name: p.name || 'Path',
                      next_step_id: p.next_step_id || '',
                      percentage: p.percentage,
                    });
                  }
                }
                
                steps[s.id] = {
                  id: s.id,
                  name: s.name || s.type || 'Step',
                  type: s.type || 'message',
                  channel: s.channels?.[0] || (messages[0]?.channel),
                  delay_seconds: s.delay?.value,
                  delay_formatted: s.delay ? formatDelay(s.delay.value) : undefined,
                  next_step_ids: s.next_step_ids || [],
                  next_paths: nextPaths.length > 0 ? nextPaths : undefined,
                  messages: messages.length > 0 ? messages : undefined,
                };
              }
            }
          } catch (err) {
            console.log(`Could not fetch canvas details for ${c.id}`);
          }
          
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            draft: c.draft,
            enabled,
            schedule_type: entryType,
            first_entry: c.first_entry,
            last_entry: c.last_entry,
            tags: c.tags,
            created_at: c.created_at,
            updated_at: c.updated_at,
            archived: c.archived,
            variants,
            steps,
            total_steps: Object.keys(steps).length,
            entry_type: entryType as any,
            entry_segment_name: entrySegmentName,
            trigger_event_name: triggerEventName,
            exception_events: exceptionEvents.length > 0 ? exceptionEvents : undefined,
            conversion_events: conversionEvents.length > 0 ? conversionEvents : undefined,
            entry_filters: entryFilters.length > 0 ? entryFilters : undefined,
          };
        },
        3 // Smaller batch size for canvases since they're larger
      );
      
      results.canvases = canvasesWithDetails;
      console.log('Fetched canvases:', results.canvases.length, 'enabled:', results.canvases.filter(c => c.enabled).length);
    } catch (e) {
      console.error('Failed to fetch canvases:', e);
    }

    // === SEGMENTS (basic list only, no details) ===
    try {
      const segmentsData = await brazeFetch('segments/list?page=0&sort_direction=desc', apiKey, brazeRestEndpoint);
      results.segments = (segmentsData.segments || []).slice(0, 100).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        tags: s.tags,
        is_starred: (s.tags || []).some((t: string) => t.toLowerCase().includes('star')),
      }));
      console.log('Fetched segments:', results.segments.length);
    } catch (e) {
      console.error('Failed to fetch segments:', e);
    }

    // === SAVE TO DATABASE ===
    const schemaCache = {
      cache_version: 5,
      saved_at: new Date().toISOString(),
      rest_endpoint: brazeRestEndpoint,
      campaigns_count: results.campaigns.length,
      canvases_count: results.canvases.length,
      canvases_enabled_count: results.canvases.filter(c => c.enabled).length,
      templates_count: results.templates.length,
      segments_count: results.segments.length,
      last_sync: new Date().toISOString(),
      campaigns: results.campaigns,
      canvases: results.canvases,
      templates: results.templates,
      segments: results.segments,
    };

    await supabase
      .from('client_platforms')
      .update({ 
        schema_cache: schemaCache,
        last_sync_at: new Date().toISOString(),
        additional_config: { rest_endpoint: brazeRestEndpoint },
      })
      .eq('id', platformId);

    console.log('Braze sync complete');

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error syncing Braze:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
