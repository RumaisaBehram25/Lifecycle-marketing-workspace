import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalized campaign type detection
type CampaignType = 'email' | 'push' | 'inapp' | 'sms' | 'webhook' | 'content_card' | 'unknown';
type MessageType = 'campaign' | 'canvas_step' | 'content_block';

// Normalized variant content structure
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
  raw: Record<string, unknown>;
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
  // Legacy fields for backward compatibility
  draft?: boolean;
  schedule_type?: string;
  first_sent?: string;
  last_sent?: string;
  tags?: string[];
  archived?: boolean;
  description?: string;
}

// Legacy interface for backward compat
interface BrazeCampaign extends NormalizedCampaign {
  id: string;
  name: string;
  // Flattened fields for UI backward compat
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

// Canvas step with full graph structure for flowchart visualization
interface CanvasStep {
  id: string;
  name: string;
  type: string; // message, delay, decision_split, experiment_paths, action_paths, etc.
  channel?: string; // email, push, in_app_message, sms, webhook, content_card
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

// Canvas variant (entry point into the canvas)
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
  enabled?: boolean; // Key field for "active" status
  schedule_type?: string;
  first_entry?: string;
  last_entry?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  archived?: boolean;
  // Hierarchical structure: Canvas -> Variants -> Steps (graph)
  variants: CanvasVariant[];
  steps: Record<string, CanvasStep>;
  total_steps?: number;
}

interface BrazeTemplate {
  email_template_id: string;
  template_name: string;
  description?: string;
  subject?: string;
  preheader?: string;
  body?: string;
  plaintext_body?: string;
  should_inline_css?: boolean;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  html_preview?: string;
}

interface BrazeSegment {
  id: string;
  name: string;
  description?: string;
  analytics_tracking_enabled?: boolean;
  tags?: string[];
  is_starred?: boolean;
  size?: number;
}

interface BrazeSubscriptionGroup {
  id: string;
  name: string;
  channel: string;
  is_active?: boolean;
}

interface BrazeCustomEvent {
  name: string;
  description?: string;
  last_received_at?: string;
  included_in_analytics_report?: boolean;
}

interface BrazeCustomAttribute {
  name: string;
  data_type: string;
  description?: string;
  array_length?: number;
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
    console.error(`Braze API error (${endpoint}):`, response.status, errorText);
    throw new Error(`Braze API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Format delay seconds to human-readable string
function formatDelay(seconds: number | undefined): string {
  if (!seconds || seconds === 0) return '0h';
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return `${days}d`;
  } else if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h`;
  } else if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

// ====== CHANNEL DETECTION ======
// Detect campaign type based on message payload keys - NOT just channel field
function detectCampaignType(msgData: any): CampaignType {
  // Check for email-specific fields
  if (msgData.body || msgData.html_body || msgData.from_name || msgData.subject || 
      msgData.from_address || msgData.reply_to || msgData.preheader || msgData.email_template_id) {
    return 'email';
  }
  
  // Check for push-specific fields
  if (msgData.alert || msgData.title || msgData.extras || msgData.deep_link || 
      msgData.device_platform || msgData.android_push_alert || msgData.ios_push_alert ||
      msgData.alert_title || msgData.sound || msgData.badge_count) {
    return 'push';
  }
  
  // Check for in-app-specific fields  
  if (msgData.message || msgData.header || msgData.buttons || msgData.image_url ||
      msgData.message_close || msgData.click_action || msgData.slide_from ||
      msgData.button_one_text || msgData.button_two_text || msgData.modal_style) {
    return 'inapp';
  }
  
  // Check for SMS-specific fields
  if (msgData.message_body || msgData.subscription_group_id) {
    return 'sms';
  }
  
  // Check for webhook-specific fields
  if (msgData.url || msgData.http_method || msgData.request_headers) {
    return 'webhook';
  }
  
  // Check for content card-specific fields
  if (msgData.card_type || msgData.pinned || msgData.dismissible) {
    return 'content_card';
  }
  
  return 'unknown';
}

// Extract platform(s) from message data
function extractPlatforms(msgData: any, channel: string): string[] {
  const platforms: string[] = [];
  
  if (channel.includes('ios') || msgData.ios_push_alert) platforms.push('ios');
  if (channel.includes('android') || msgData.android_push_alert) platforms.push('android');
  if (channel.includes('web') || msgData.web_push_alert) platforms.push('web');
  
  // Default based on channel type
  if (platforms.length === 0) {
    if (channel === 'push') return ['ios', 'android'];
    if (channel === 'in_app_message') return ['ios', 'android', 'web'];
    return ['all'];
  }
  
  return platforms;
}

// ====== CONTENT NORMALIZATION ======
// Normalize message content into consistent structure
function normalizeMessageContent(msgData: any, campaignType: CampaignType): NormalizedContent {
  const content: NormalizedContent = {};
  
  switch (campaignType) {
    case 'email':
      content.subject = msgData.subject;
      content.preheader = msgData.preheader;
      content.body_html = msgData.body || msgData.html_body;
      content.body_text = msgData.plaintext_body;
      break;
      
    case 'push':
      content.title = msgData.title || msgData.alert_title;
      content.body_text = msgData.message || msgData.alert || msgData.body;
      content.deep_link = msgData.deep_link || msgData.uri || msgData.open_app_uri;
      content.image_url = msgData.big_image || msgData.image_url || msgData.rich_notification_image;
      if (msgData.extras && typeof msgData.extras === 'object') {
        content.extras = msgData.extras;
      }
      break;
      
    case 'inapp':
      content.title = msgData.header || msgData.title;
      content.body_text = msgData.message || msgData.body;
      content.image_url = msgData.image_url || msgData.image_uri || msgData.graphic_url;
      
      // Parse buttons
      const buttons: Array<{ text: string; action?: string; url?: string }> = [];
      if (msgData.button_one_text) {
        buttons.push({
          text: msgData.button_one_text,
          action: msgData.button_one_action || msgData.button_one_click_action_type,
          url: msgData.button_one_uri || msgData.button_one_deep_link,
        });
      }
      if (msgData.button_two_text) {
        buttons.push({
          text: msgData.button_two_text,
          action: msgData.button_two_action || msgData.button_two_click_action_type,
          url: msgData.button_two_uri || msgData.button_two_deep_link,
        });
      }
      // Also check for buttons array format
      if (msgData.buttons && Array.isArray(msgData.buttons)) {
        for (const btn of msgData.buttons) {
          buttons.push({
            text: btn.text || btn.label,
            action: btn.action || btn.click_action,
            url: btn.url || btn.uri || btn.deep_link,
          });
        }
      }
      if (buttons.length > 0) {
        content.buttons = buttons;
      }
      if (msgData.extras && typeof msgData.extras === 'object') {
        content.extras = msgData.extras;
      }
      break;
      
    case 'sms':
      content.body_text = msgData.message_body || msgData.body;
      break;
      
    default:
      // Store any body-like field
      content.body_text = msgData.message || msgData.body || msgData.text;
  }
  
  return content;
}

// Determine the primary channel from a step
function inferChannel(step: any): string {
  if (step.messages && step.messages.length > 0) {
    return step.messages[0]?.channel || 'email';
  }
  // Infer from step type
  const type = (step.type || '').toLowerCase();
  if (type.includes('email')) return 'email';
  if (type.includes('push')) return 'push';
  if (type.includes('sms')) return 'sms';
  if (type.includes('in_app') || type.includes('in-app')) return 'in_app_message';
  if (type.includes('webhook')) return 'webhook';
  if (type.includes('content_card')) return 'content_card';
  return 'email';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, platformId, restEndpoint, includeAnalytics, analyticsDateRange } = await req.json();

    if (!clientId || !platformId) {
      throw new Error('clientId and platformId are required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the platform connection to retrieve the API key
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

    // Use the REST endpoint from request or from additional_config
    const brazeRestEndpoint = restEndpoint || 
      (platform.additional_config as any)?.rest_endpoint || 
      'https://rest.iad-01.braze.com';

    console.log('Fetching Braze data for client:', clientId, 'endpoint:', brazeRestEndpoint);

    const results: {
      campaigns: BrazeCampaign[];
      canvases: BrazeCanvas[];
      templates: BrazeTemplate[];
      segments: BrazeSegment[];
      subscriptionGroups: BrazeSubscriptionGroup[];
      customEvents: BrazeCustomEvent[];
      customAttributes: BrazeCustomAttribute[];
    } = {
      campaigns: [],
      canvases: [],
      templates: [],
      segments: [],
      subscriptionGroups: [],
      customEvents: [],
      customAttributes: [],
    };

    // First fetch templates with HTML content - we'll need these to map to campaigns
    const templateHtmlMap = new Map<string, { subject: string; preheader: string; html: string }>();
    
    try {
      const templatesData = await brazeFetch('templates/email/list?limit=100', apiKey, brazeRestEndpoint);
      const templateList = templatesData.templates || [];
      
      // Fetch full template details including HTML for templates (up to 50 for better coverage)
      const templatesWithContent = await Promise.all(
        templateList.slice(0, 50).map(async (t: any) => {
          try {
            const details = await brazeFetch(`templates/email/info?email_template_id=${t.email_template_id}`, apiKey, brazeRestEndpoint);
            const htmlContent = details.body || undefined;
            
            if (htmlContent) {
              templateHtmlMap.set(t.email_template_id, {
                subject: details.subject || t.subject || '',
                preheader: details.preheader || t.preheader || '',
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
          } catch (err) {
            console.log(`Could not fetch details for template ${t.email_template_id}`);
            return {
              email_template_id: t.email_template_id,
              template_name: t.template_name,
              description: t.description,
              subject: t.subject,
              preheader: t.preheader,
              tags: t.tags,
              created_at: t.created_at,
              updated_at: t.updated_at,
            };
          }
        })
      );
      
      const remainingTemplates = templateList.slice(50).map((t: any) => ({
        email_template_id: t.email_template_id,
        template_name: t.template_name,
        description: t.description,
        subject: t.subject,
        preheader: t.preheader,
        tags: t.tags,
        created_at: t.created_at,
        updated_at: t.updated_at,
      }));
      
      results.templates = [...templatesWithContent, ...remainingTemplates];
      console.log('Fetched templates:', results.templates.length, 'with HTML preview:', templatesWithContent.filter(t => t.html_preview).length);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    }

    // Fetch campaigns with FULL normalized structure
    try {
      const campaignsData = await brazeFetch('campaigns/list?page=0&include_archived=false&sort_direction=desc', apiKey, brazeRestEndpoint);
      const campaignList = campaignsData.campaigns || [];
      
      console.log(`[Campaigns] Found ${campaignList.length} campaigns, fetching details for up to 50...`);
      
      const campaignsWithDetails = await Promise.all(
        campaignList.slice(0, 50).map(async (c: any): Promise<BrazeCampaign> => {
          const warnings: string[] = [];
          const variants: NormalizedVariant[] = [];
          const detectedChannels = new Set<string>();
          let primaryCampaignType: CampaignType = 'unknown';
          
          // Legacy flattened fields for backward compatibility
          let subject = '';
          let preheader = '';
          let htmlPreview = '';
          let push_title = '';
          let push_body = '';
          let push_deep_link = '';
          let push_extras: Record<string, unknown> = {};
          let inapp_header = '';
          let inapp_body = '';
          let inapp_cta = '';
          let inapp_image_url = '';
          let inapp_buttons: Array<{ text: string; action?: string; url?: string }> = [];
          
          try {
            const details = await brazeFetch(`campaigns/details?campaign_id=${c.id}`, apiKey, brazeRestEndpoint);
            const messages = details.messages || {};
            
            // Log endpoint and field keys for debugging
            console.log(`[Campaign ${c.id}] "${c.name}" - endpoint: campaigns/details`);
            console.log(`[Campaign ${c.id}] message keys: ${Object.keys(messages).join(', ') || 'none'}`);
            
            // Process each message variant
            for (const [variantId, msg] of Object.entries(messages)) {
              const msgData = msg as any;
              const msgChannel = msgData.channel || 'unknown';
              
              // Detect campaign type from payload fields, not just channel
              const detectedType = detectCampaignType(msgData);
              console.log(`[Campaign ${c.id}] variant ${variantId}: channel=${msgChannel}, detected_type=${detectedType}, fields=${Object.keys(msgData).slice(0, 10).join(',')}`);
              
              if (detectedType !== 'unknown') {
                primaryCampaignType = detectedType;
              }
              
              // Track channels
              detectedChannels.add(msgChannel);
              
              // Normalize content
              const normalizedContent = normalizeMessageContent(msgData, detectedType);
              const platforms = extractPlatforms(msgData, msgChannel);
              
              // Build normalized variant
              variants.push({
                variant_id: variantId,
                name: msgData.name || `Variant ${variants.length + 1}`,
                platforms,
                content: normalizedContent,
                raw: msgData, // Keep raw for debugging
              });
              
              // ====== Legacy flattened extraction for backward compat ======
              if (detectedType === 'email' || msgChannel === 'email') {
                subject = msgData.subject || subject;
                preheader = msgData.preheader || preheader;
                const templateId = msgData.email_template_id || msgData.template_id || '';
                
                if (msgData.body) {
                  htmlPreview = msgData.body as string;
                } else if (templateId && templateHtmlMap.has(templateId)) {
                  const templateData = templateHtmlMap.get(templateId)!;
                  htmlPreview = templateData.html;
                  subject = subject || templateData.subject;
                  preheader = preheader || templateData.preheader;
                }
              }
              
              if (detectedType === 'push' || msgChannel === 'push' || msgChannel === 'ios_push' || msgChannel === 'android_push') {
                push_title = msgData.title || msgData.alert_title || push_title;
                push_body = msgData.message || msgData.alert || msgData.body || push_body;
                push_deep_link = msgData.deep_link || msgData.uri || msgData.open_app_uri || push_deep_link;
                if (msgData.extras && typeof msgData.extras === 'object') {
                  push_extras = { ...push_extras, ...msgData.extras };
                }
              }
              
              if (detectedType === 'inapp' || msgChannel === 'in_app_message') {
                inapp_header = msgData.header || msgData.title || inapp_header;
                inapp_body = msgData.message || msgData.body || inapp_body;
                inapp_cta = msgData.button_one_text || msgData.cta || inapp_cta;
                inapp_image_url = msgData.image_url || msgData.image_uri || msgData.graphic_url || inapp_image_url;
                
                // Extract buttons
                if (msgData.button_one_text && !inapp_buttons.find(b => b.text === msgData.button_one_text)) {
                  inapp_buttons.push({
                    text: msgData.button_one_text,
                    action: msgData.button_one_action,
                    url: msgData.button_one_uri,
                  });
                }
                if (msgData.button_two_text && !inapp_buttons.find(b => b.text === msgData.button_two_text)) {
                  inapp_buttons.push({
                    text: msgData.button_two_text,
                    action: msgData.button_two_action,
                    url: msgData.button_two_uri,
                  });
                }
              }
            }
          } catch (err) {
            console.log(`[Campaign ${c.id}] Could not fetch details: ${err}`);
            warnings.push('details_fetch_failed');
          }
          
          // Fallback: try to match template for email HTML
          if (!htmlPreview && (primaryCampaignType === 'email' || primaryCampaignType === 'unknown')) {
            for (const template of results.templates) {
              if (template.html_preview && (
                c.name.toLowerCase().includes(template.template_name.toLowerCase()) ||
                template.template_name.toLowerCase().includes(c.name.toLowerCase())
              )) {
                htmlPreview = template.html_preview;
                subject = subject || template.subject || '';
                preheader = preheader || template.preheader || '';
                break;
              }
            }
          }
          
          // Use channel hints from campaign list if no variants detected
          if (primaryCampaignType === 'unknown' && c.channels && c.channels.length > 0) {
            const ch = c.channels[0].toLowerCase();
            if (ch.includes('email')) primaryCampaignType = 'email';
            else if (ch.includes('push')) primaryCampaignType = 'push';
            else if (ch.includes('in_app') || ch.includes('inapp')) primaryCampaignType = 'inapp';
            else if (ch.includes('sms')) primaryCampaignType = 'sms';
            
            if (primaryCampaignType === 'unknown') {
              warnings.push('campaign_type_not_inferred');
            }
          }
          
          // Check for personalization that we can't resolve
          const hasPersonalization = [subject, preheader, htmlPreview, push_body, inapp_body].some(
            text => text && (text.includes('{{') || text.includes('{%'))
          );
          if (hasPersonalization) {
            warnings.push('personalization_not_resolved');
          }
          
          const channels = detectedChannels.size > 0 
            ? Array.from(detectedChannels) 
            : (c.channels || ['email']);
          
          console.log(`[Campaign ${c.id}] RESULT: type=${primaryCampaignType}, channels=${channels.join(',')}, variants=${variants.length}, warnings=${warnings.join(',') || 'none'}`);
          
          return {
            // Normalized structure
            source: 'braze',
            message_type: 'campaign',
            campaign_id: c.id,
            campaign_name: c.name,
            campaign_type: primaryCampaignType,
            channels,
            variants,
            warnings,
            // Legacy fields
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
            // Flattened content for backward compat
            subject,
            preheader,
            html_preview: htmlPreview,
            push_title,
            push_body,
            push_deep_link,
            push_extras: Object.keys(push_extras).length > 0 ? push_extras : undefined,
            inapp_header,
            inapp_body,
            inapp_cta,
            inapp_image_url: inapp_image_url || undefined,
            inapp_buttons: inapp_buttons.length > 0 ? inapp_buttons : undefined,
          };
        })
      );
      
      // Handle remaining campaigns (basic info only)
      const remainingCampaigns: BrazeCampaign[] = campaignList.slice(50).map((c: any) => ({
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
        description: c.description,
        draft: c.draft,
        schedule_type: c.schedule_type,
        first_sent: c.first_sent,
        last_sent: c.last_sent,
        tags: c.tags,
        updated_at: c.updated_at,
        archived: c.archived,
      }));
      
      results.campaigns = [...campaignsWithDetails, ...remainingCampaigns];
      
      // Log summary
      const typeBreakdown = {
        email: results.campaigns.filter(c => c.campaign_type === 'email').length,
        push: results.campaigns.filter(c => c.campaign_type === 'push').length,
        inapp: results.campaigns.filter(c => c.campaign_type === 'inapp').length,
        unknown: results.campaigns.filter(c => c.campaign_type === 'unknown').length,
      };
      console.log(`[Campaigns] SUMMARY: total=${results.campaigns.length}, email=${typeBreakdown.email}, push=${typeBreakdown.push}, inapp=${typeBreakdown.inapp}, unknown=${typeBreakdown.unknown}`);
    } catch (e) {
      console.error('[Campaigns] Failed to fetch campaigns:', e);
    }

    // Fetch canvases with FULL hierarchical structure: variants -> steps graph
    // We'll fetch details first to determine enabled status, then filter to ONLY sync active canvases
    try {
      const canvasesData = await brazeFetch('canvas/list?page=0&include_archived=false&sort_direction=desc', apiKey, brazeRestEndpoint);
      const canvasList = canvasesData.canvases || [];
      
      console.log(`Found ${canvasList.length} canvases total, fetching details to filter active only...`);
      
      // Increase limit to 100 to capture all active canvases (you mentioned ~40 live)
      const canvasesWithDetails = await Promise.all(
        canvasList.slice(0, 100).map(async (c: any): Promise<BrazeCanvas> => {
          const variants: CanvasVariant[] = [];
          const steps: Record<string, CanvasStep> = {};
          let enabled = false;
          
          try {
            const details = await brazeFetch(`canvas/details?canvas_id=${c.id}`, apiKey, brazeRestEndpoint);
            
            // Capture enabled status - this is the key field for "active"
            enabled = details.enabled === true;
            
            console.log(`Canvas "${c.name}" (${c.id}): enabled=${enabled}, draft=${c.draft}`);
            
            // Parse variants - these are entry points with percentage allocations
            if (details.variants && Array.isArray(details.variants)) {
              details.variants.forEach((v: any, index: number) => {
                variants.push({
                  name: v.name || `Variant ${index + 1}`,
                  percentage: v.percentage || (100 / details.variants.length),
                  first_step_id: v.first_step_id || null,
                });
              });
            }
            
            // Parse steps - Braze returns steps as an ARRAY, not object
            // Each step has: id, name, type, channels[], messages{}, next_step_ids[], next_paths[]
            if (details.steps && Array.isArray(details.steps)) {
              for (const s of details.steps) {
                const stepId = s.id;
                if (!stepId) continue;
                
                // Parse messages - Braze returns messages as OBJECT keyed by message_variation_id
                // Structure: { "message_variation_id": { channel, subject, body, title, ... } }
                const messages: CanvasStep['messages'] = [];
                if (s.messages && typeof s.messages === 'object' && !Array.isArray(s.messages)) {
                  for (const [variationId, msgData] of Object.entries(s.messages)) {
                    const msg = msgData as any;
                    const channel = msg.channel || (s.channels?.[0]) || 'email';
                    
                    // Extract HTML content based on channel type
                    let htmlContent = msg.body; // For email, body contains HTML
                    if (channel === 'email') {
                      htmlContent = msg.body || msg.html_body || msg.html;
                    }
                    
                    // Extract buttons for in-app messages
                    let buttons: Array<{ text: string; action?: string; url?: string }> | undefined;
                    if (msg.buttons && Array.isArray(msg.buttons)) {
                      buttons = msg.buttons.map((b: any) => ({
                        text: b.text || b.label || 'Button',
                        action: b.action || b.click_action,
                        url: b.url || b.uri,
                      }));
                    }
                    
                    messages.push({
                      channel,
                      subject: msg.subject,
                      preheader: msg.preheader,
                      title: msg.title || msg.header,
                      body: typeof msg.body === 'string' && msg.body.length < 500 ? msg.body : msg.message || msg.text,
                      html_content: htmlContent,
                      image_url: msg.image_url || msg.icon,
                      buttons,
                    });
                  }
                }
                
                // Get channels from the step's channels array
                const stepChannels: string[] = s.channels || [];
                const primaryChannel = stepChannels[0] || (messages.length > 0 ? messages[0].channel : 'email');
                
                // Parse next_step_ids - handles branching for Message steps
                let nextStepIds: string[] = [];
                if (s.next_step_ids && Array.isArray(s.next_step_ids)) {
                  nextStepIds = s.next_step_ids;
                }
                
                // Parse next_paths - for Decision Splits, Audience Paths, Action Paths, Experiment Paths
                // Structure: [{ name: "Yes/No/Group Name/Path Name", next_step_id: "uuid" }]
                let nextPaths: CanvasStep['next_paths'] = undefined;
                if (s.next_paths && Array.isArray(s.next_paths)) {
                  const pathsArray = s.next_paths as Array<{ name?: string; next_step_id?: string; percentage?: number }>;
                  nextPaths = pathsArray.map((path) => ({
                    name: path.name || 'Path',
                    next_step_id: path.next_step_id || '',
                    percentage: path.percentage,
                  }));
                  // Also add to nextStepIds if not already there
                  for (const p of pathsArray) {
                    if (p.next_step_id && !nextStepIds.includes(p.next_step_id)) {
                      nextStepIds.push(p.next_step_id);
                    }
                  }
                }
                
                // Infer step type from Braze type field
                const stepType = s.type?.toLowerCase() || 'message';
                
                // Get delay info if available
                const delaySeconds = s.delay_seconds || s.delay || 0;
                
                steps[stepId] = {
                  id: stepId,
                  name: s.name || `Step`,
                  type: stepType,
                  channel: primaryChannel,
                  delay_seconds: delaySeconds,
                  delay_formatted: formatDelay(delaySeconds),
                  next_step_ids: nextStepIds,
                  next_paths: nextPaths,
                  messages: messages.length > 0 ? messages : undefined,
                };
              }
            }
            
            console.log(`Canvas "${c.name}" parsed: ${variants.length} variants, ${Object.keys(steps).length} steps`);
            
            // Log step graph for debugging
            for (const [id, step] of Object.entries(steps)) {
              console.log(`  Step ${step.name} (${step.type}): channels=[${step.channel}], next=${step.next_step_ids.join(',') || 'end'}, messages=${step.messages?.length || 0}`);
            }
            
            console.log(`Canvas "${c.name}": ${variants.length} variants, ${Object.keys(steps).length} steps, enabled=${enabled}`);
          } catch (err) {
            console.log(`Could not fetch details for canvas ${c.id}: ${err}`);
          }
          
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            draft: c.draft,
            enabled, // Key field for active status
            schedule_type: c.schedule_type,
            first_entry: c.first_entry,
            last_entry: c.last_entry,
            tags: c.tags,
            created_at: c.created_at,
            updated_at: c.updated_at,
            archived: c.archived,
            variants,
            steps,
            total_steps: Object.keys(steps).length,
          };
        })
      );
      
      // ONLY include ACTIVE (enabled) canvases - filter out drafts and disabled
      const activeCanvases = canvasesWithDetails.filter(c => c.enabled === true);
      
      // Don't include remaining canvases without details since we can't verify they're active
      // This ensures the Lifecycle page only shows truly active journeys
      results.canvases = activeCanvases;
      
      const withStepsCount = activeCanvases.filter(c => Object.keys(c.steps).length > 0).length;
      console.log(`Synced canvases: ${activeCanvases.length} active (from ${canvasesWithDetails.length} fetched, ${canvasList.length} total), ${withStepsCount} with steps`);
    } catch (e) {
      console.error('Failed to fetch canvases:', e);
    }

    // Fetch segments - paginate to get all segments
    try {
      let allSegments: any[] = [];
      let page = 0;
      let hasMore = true;
      
      while (hasMore) {
        const segmentsData = await brazeFetch(`segments/list?page=${page}&sort_direction=desc`, apiKey, brazeRestEndpoint);
        const segments = segmentsData.segments || [];
        
        if (segments.length === 0) {
          hasMore = false;
        } else {
          allSegments = [...allSegments, ...segments];
          page++;
          // Safety limit to prevent infinite loops
          if (page > 50) {
            console.log('Reached max segment pages (50), stopping pagination');
            hasMore = false;
          }
        }
      }
      
      // Fetch details (including size) for top segments (limit to 30 for performance)
      const segmentsWithDetails = await Promise.all(
        allSegments.slice(0, 30).map(async (s: any) => {
          try {
            const details = await brazeFetch(`segments/details?segment_id=${s.id}`, apiKey, brazeRestEndpoint);
            return {
              id: s.id,
              name: s.name,
              description: details.description || s.description,
              analytics_tracking_enabled: s.analytics_tracking_enabled,
              tags: s.tags,
              is_starred: (s.tags || []).some((t: string) => 
                t.toLowerCase() === 'starred' || t.toLowerCase() === 'favorite' || t.toLowerCase() === 'star'
              ),
              size: details.size || 0,
            };
          } catch (err) {
            // If details fetch fails, return without size
            return {
              id: s.id,
              name: s.name,
              description: s.description,
              analytics_tracking_enabled: s.analytics_tracking_enabled,
              tags: s.tags,
              is_starred: (s.tags || []).some((t: string) => 
                t.toLowerCase() === 'starred' || t.toLowerCase() === 'favorite' || t.toLowerCase() === 'star'
              ),
            };
          }
        })
      );
      
      // Map remaining segments without size (beyond first 30)
      const remainingSegments = allSegments.slice(30).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        analytics_tracking_enabled: s.analytics_tracking_enabled,
        tags: s.tags,
        is_starred: (s.tags || []).some((t: string) => 
          t.toLowerCase() === 'starred' || t.toLowerCase() === 'favorite' || t.toLowerCase() === 'star'
        ),
      }));
      
      results.segments = [...segmentsWithDetails, ...remainingSegments];
      console.log('Fetched segments:', results.segments.length, 'pages:', page, 'with sizes:', segmentsWithDetails.length);
    } catch (e) {
      console.error('Failed to fetch segments:', e);
    }

    // Fetch subscription groups
    try {
      const subGroupsData = await brazeFetch('subscription/status/get', apiKey, brazeRestEndpoint);
      results.subscriptionGroups = (subGroupsData.subscription_groups || []).map((sg: any) => ({
        id: sg.id,
        name: sg.name,
        channel: sg.channel,
        is_active: sg.is_active,
      }));
      console.log('Fetched subscription groups:', results.subscriptionGroups.length);
    } catch (e) {
      console.error('Failed to fetch subscription groups:', e);
    }

    // Fetch custom events
    try {
      const eventsData = await brazeFetch('events/list', apiKey, brazeRestEndpoint);
      results.customEvents = (eventsData.events || []).map((e: any) => ({
        name: e.name || e,
        description: e.description,
        last_received_at: e.last_received_at,
        included_in_analytics_report: e.included_in_analytics_report,
      }));
      console.log('Fetched custom events:', results.customEvents.length);
    } catch (e) {
      console.error('Failed to fetch custom events:', e);
    }

    // Fetch custom attributes
    try {
      const attributesData = await brazeFetch('users/export/global_control_group', apiKey, brazeRestEndpoint);
      // Note: Braze doesn't have a direct "list attributes" endpoint
      // We'll use a different approach - try to get from data_profile/attributes if available
      // For now, we'll extract from any sample user data or use the custom_attributes endpoint
      results.customAttributes = [];
      
      // Try alternative endpoint for custom attributes
      try {
        const attrData = await brazeFetch('custom_attributes', apiKey, brazeRestEndpoint);
        if (attrData.custom_attributes) {
          results.customAttributes = attrData.custom_attributes.map((a: any) => ({
            name: a.name || a,
            data_type: a.data_type || 'string',
            description: a.description,
            array_length: a.array_length,
          }));
        }
      } catch {
        // Fallback: No attributes endpoint available
        console.log('Custom attributes endpoint not available');
      }
      console.log('Fetched custom attributes:', results.customAttributes.length);
    } catch (e) {
      console.error('Failed to fetch custom attributes:', e);
    }

    // Fetch analytics data if requested
    interface CampaignAnalyticsItem { campaign_id: string; campaign_name: string; channel?: string; sends: number; deliveries: number; opens: number; unique_opens: number; clicks: number; unique_clicks: number; unsubscribes: number; bounces: number; conversions: number; revenue: number }
    interface CanvasAnalyticsItem { canvas_id: string; canvas_name: string; entries: number; conversions: number; revenue: number; variants?: Array<{ name: string; entries: number; conversions: number; revenue: number }> }
    interface AnalyticsSummary { total_sends: number; total_deliveries: number; total_opens: number; total_clicks: number; total_unsubscribes: number; avg_open_rate: number; avg_click_rate: number; total_conversions: number; total_revenue: number }
    interface CampaignDailyTrendPoint {
      date: string; // YYYY-MM-DD
      sends: number;
      deliveries: number;
      opens: number;
      unique_opens: number;
      clicks: number;
      unique_clicks: number;
      unsubscribes: number;
      bounces: number;
      conversions: number;
      revenue: number;
    }
    
    let analyticsData: {
      campaigns: CampaignAnalyticsItem[];
      canvases: CanvasAnalyticsItem[];
      summary: AnalyticsSummary;
      trends?: { campaigns_daily: CampaignDailyTrendPoint[] };
      date_range?: { start: string; end: string };
    } | null = null;

    if (includeAnalytics) {
      console.log('Fetching analytics data...');

      // Braze limits data_series to 14 days max; we respect the requested window but clamp to 14.
      const requestedWindowDays = (() => {
        const start = analyticsDateRange?.start;
        const end = analyticsDateRange?.end;
        if (!start || !end) return 14;
        const startMs = new Date(start).getTime();
        const endMs = new Date(end).getTime();
        if (isNaN(startMs) || isNaN(endMs)) return 14;
        const diffDays = Math.floor((endMs - startMs) / 86400000) + 1;
        return Math.max(1, Math.min(14, diffDays));
      })();
      
      // Try to determine a realistic end date - use any available dates from synced data
      // This handles cases where the system date might be in the "future" from Braze's perspective
      let fallbackEndDate = analyticsDateRange?.end || new Date().toISOString().split('T')[0];
      
      // Collect dates from all sources - campaigns, canvases, templates
      const campaignDates = results.campaigns
        .map(c => c.last_sent || c.first_sent || c.updated_at)
        .filter(Boolean)
        .map(d => new Date(d!).getTime())
        .filter(t => !isNaN(t));
        
      const canvasDates = results.canvases
        .map(c => c.last_entry || c.first_entry || c.updated_at || c.created_at)
        .filter(Boolean)
        .map(d => new Date(d!).getTime())
        .filter(t => !isNaN(t));
        
      // Use template dates as another source of realistic dates
      const templateDates = results.templates
        .map(t => t.updated_at || t.created_at)
        .filter(Boolean)
        .map(d => new Date(d!).getTime())
        .filter(t => !isNaN(t));
      
      const allDates = [...campaignDates, ...canvasDates, ...templateDates];
      
      if (allDates.length > 0) {
        const mostRecent = new Date(Math.max(...allDates));
        // Add 1 day buffer to ensure we capture the full day
        mostRecent.setDate(mostRecent.getDate() + 1);
        fallbackEndDate = mostRecent.toISOString().split('T')[0];
        console.log(`Using most recent date from synced data as fallback: ${fallbackEndDate}`);
      } else {
        // Hardcoded fallback to a known good date if no dates found
        // This ensures we can fetch analytics even without date metadata
        fallbackEndDate = '2025-01-25';
        console.log(`No dates found in synced data, using hardcoded fallback: ${fallbackEndDate}`);
      }
      
      const campaignAnalytics: CampaignAnalyticsItem[] = [];
      const canvasAnalytics: CanvasAnalyticsItem[] = [];

      // Aggregate daily totals across all campaigns so the UI can show time-series trends.
      const campaignDailyMap = new Map<string, Omit<CampaignDailyTrendPoint, 'date'>>();

      function ensureCampaignDay(date: string) {
        const existing = campaignDailyMap.get(date);
        if (existing) return existing;
        const empty = {
          sends: 0,
          deliveries: 0,
          opens: 0,
          unique_opens: 0,
          clicks: 0,
          unique_clicks: 0,
          unsubscribes: 0,
          bounces: 0,
          conversions: 0,
          revenue: 0,
        };
        campaignDailyMap.set(date, empty);
        return empty;
      }

      function dayKeyFromBraze(dayData: any): string | null {
        const raw = dayData?.time || dayData?.date || dayData?.date_time || dayData?.timestamp;
        if (typeof raw !== 'string') return null;
        // Handles both "YYYY-MM-DD" and ISO timestamps.
        const key = raw.slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
      }

      // Ensure our series is aligned to a single end date (otherwise campaigns with different last_sent dates
      // create an unusable aggregate). We clamp requested end to a realistic end date from Braze data.
      const requestedEndDate = analyticsDateRange?.end || new Date().toISOString().split('T')[0];
      const effectiveEndDate = requestedEndDate <= fallbackEndDate ? requestedEndDate : fallbackEndDate;
      const effectiveStartDate = (() => {
        const d = new Date(effectiveEndDate);
        d.setDate(d.getDate() - (requestedWindowDays - 1));
        return d.toISOString().split('T')[0];
      })();
      
      // Fetch analytics for ALL campaigns (not just those with last_sent)
      // Take up to 30 campaigns for analytics
      const campaignsForAnalytics = results.campaigns.slice(0, 30);
      console.log(`Fetching analytics for ${campaignsForAnalytics.length} campaigns...`);
      
      for (const campaign of campaignsForAnalytics) {
        try {
          const campaignEndDate = effectiveEndDate;
          const analyticsUrl = `campaigns/data_series?campaign_id=${campaign.id}&length=${requestedWindowDays}&ending_at=${campaignEndDate}T23:59:59Z`;
          const data = await brazeFetch(analyticsUrl, apiKey, brazeRestEndpoint);
          
          // Braze response structure: data[].messages.<channel>[] with stats per variant
          // We need to aggregate across all channels and all time periods
          let totals = {
            sends: 0, deliveries: 0, opens: 0, unique_opens: 0,
            clicks: 0, unique_clicks: 0, unsubscribes: 0, bounces: 0,
            conversions: 0, revenue: 0,
          };
          
          if (data.data && Array.isArray(data.data)) {
            for (const dayData of data.data) {
              const dayTotals = {
                sends: 0,
                deliveries: 0,
                opens: 0,
                unique_opens: 0,
                clicks: 0,
                unique_clicks: 0,
                unsubscribes: 0,
                bounces: 0,
                conversions: (dayData.conversions || 0) + (dayData.conversions1 || 0),
                revenue: dayData.revenue || 0,
              };
              
              // Extract metrics from messages.<channel>[] arrays
              const messages = dayData.messages || {};
              
              // Process email channel
              if (messages.email && Array.isArray(messages.email)) {
                for (const variant of messages.email) {
                  dayTotals.sends += variant.sent || 0;
                  dayTotals.deliveries += variant.delivered || 0;
                  dayTotals.opens += variant.opens || 0;
                  dayTotals.unique_opens += variant.unique_opens || 0;
                  dayTotals.clicks += variant.clicks || 0;
                  dayTotals.unique_clicks += variant.unique_clicks || 0;
                  dayTotals.unsubscribes += variant.unsubscribes || 0;
                  dayTotals.bounces += variant.bounces || 0;
                }
              }
              
              // Process push channels (ios_push, android_push, web_push)
              for (const pushChannel of ['ios_push', 'android_push', 'web_push']) {
                if (messages[pushChannel] && Array.isArray(messages[pushChannel])) {
                  for (const variant of messages[pushChannel]) {
                    dayTotals.sends += variant.sent || 0;
                    dayTotals.opens += (variant.direct_opens || 0) + (variant.total_opens || 0);
                    dayTotals.clicks += variant.body_clicks || 0;
                    dayTotals.bounces += variant.bounces || 0;
                  }
                }
              }
              
              // Process SMS
              if (messages.sms && Array.isArray(messages.sms)) {
                for (const variant of messages.sms) {
                  dayTotals.sends += variant.sent || 0;
                  dayTotals.deliveries += variant.delivered || 0;
                  dayTotals.clicks += variant.clicks || 0;
                }
              }
              
              // Process in-app messages
              if (messages.in_app_message && Array.isArray(messages.in_app_message)) {
                for (const variant of messages.in_app_message) {
                  dayTotals.sends += variant.impressions || 0;
                  dayTotals.clicks += variant.clicks || 0;
                }
              }
              
              // Process content cards
              if (messages.content_cards && Array.isArray(messages.content_cards)) {
                for (const variant of messages.content_cards) {
                  dayTotals.sends += variant.sent || 0;
                  dayTotals.clicks += variant.total_clicks || variant.unique_clicks || 0;
                }
              }

              // Roll day totals into campaign totals
              totals.sends += dayTotals.sends;
              totals.deliveries += dayTotals.deliveries;
              totals.opens += dayTotals.opens;
              totals.unique_opens += dayTotals.unique_opens;
              totals.clicks += dayTotals.clicks;
              totals.unique_clicks += dayTotals.unique_clicks;
              totals.unsubscribes += dayTotals.unsubscribes;
              totals.bounces += dayTotals.bounces;
              totals.conversions += dayTotals.conversions;
              totals.revenue += dayTotals.revenue;

              // Roll into cross-campaign daily trend
              const key = dayKeyFromBraze(dayData);
              if (key) {
                const bucket = ensureCampaignDay(key);
                bucket.sends += dayTotals.sends;
                bucket.deliveries += dayTotals.deliveries;
                bucket.opens += dayTotals.opens;
                bucket.unique_opens += dayTotals.unique_opens;
                bucket.clicks += dayTotals.clicks;
                bucket.unique_clicks += dayTotals.unique_clicks;
                bucket.unsubscribes += dayTotals.unsubscribes;
                bucket.bounces += dayTotals.bounces;
                bucket.conversions += dayTotals.conversions;
                bucket.revenue += dayTotals.revenue;
              }
            }
          }
          
          // Only add if we got any data
          if (totals.sends > 0 || totals.opens > 0 || totals.clicks > 0) {
            campaignAnalytics.push({
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              channel: campaign.channels?.[0],
              ...totals,
            });

            // Also update the campaign object with analytics
            Object.assign(campaign, totals);
            console.log(`Campaign ${campaign.name}: sends=${totals.sends}, opens=${totals.unique_opens}, clicks=${totals.unique_clicks}`);
          }
        } catch (e) {
          console.log(`Could not fetch analytics for campaign ${campaign.id}:`, e);
        }
      }
      
      // Fetch analytics for canvases (use canvas/data_summary for better overview)
      const enabledCanvases = results.canvases.filter(c => c.enabled).slice(0, 15);
      console.log(`Fetching analytics for ${enabledCanvases.length} canvases...`);
      
      for (const canvas of enabledCanvases) {
        try {
          // Use canvas's last_entry date if available, otherwise fallback
          const canvasEndDate = canvas.last_entry 
            ? new Date(new Date(canvas.last_entry).getTime() + 86400000).toISOString().split('T')[0]
            : fallbackEndDate;
          
          // Try data_summary first for overall stats, fallback to data_series
          let totals = { entries: 0, conversions: 0, revenue: 0 };
          const variantStats: Array<{ name: string; entries: number; conversions: number; revenue: number }> = [];
          
          try {
            // data_summary gives aggregate totals
            const summaryUrl = `canvas/data_summary?canvas_id=${canvas.id}&length=14&ending_at=${canvasEndDate}T23:59:59Z`;
            const summaryData = await brazeFetch(summaryUrl, apiKey, brazeRestEndpoint);
            
            if (summaryData.data) {
              totals.entries = summaryData.data.total_entries || 0;
              totals.conversions = summaryData.data.conversions || summaryData.data.primary_conversions || 0;
              totals.revenue = summaryData.data.revenue || 0;
              
              // Extract variant stats if available
              if (summaryData.data.variant_stats && Array.isArray(summaryData.data.variant_stats)) {
                for (const vs of summaryData.data.variant_stats) {
                  variantStats.push({
                    name: vs.name || vs.variant_name || 'Variant',
                    entries: vs.entries || 0,
                    conversions: vs.conversions || 0,
                    revenue: vs.revenue || 0,
                  });
                }
              }
            }
          } catch {
            // Fallback to data_series
            const analyticsUrl = `canvas/data_series?canvas_id=${canvas.id}&length=14&ending_at=${canvasEndDate}T23:59:59Z`;
            const data = await brazeFetch(analyticsUrl, apiKey, brazeRestEndpoint);
            
            if (data.data && Array.isArray(data.data)) {
              for (const d of data.data) {
                totals.entries += d.entries || 0;
                totals.conversions += (d.conversions || 0) + (d.primary_conversions || 0);
                totals.revenue += d.revenue || 0;
              }
            }
          }

          if (totals.entries > 0 || totals.conversions > 0) {
            canvasAnalytics.push({
              canvas_id: canvas.id,
              canvas_name: canvas.name,
              ...totals,
              variants: variantStats.length > 0 ? variantStats : undefined,
            });

            // Also update the canvas object with analytics
            Object.assign(canvas, totals);
            if (variantStats.length > 0) {
              // Merge variant stats with existing variants
              canvas.variants = canvas.variants.map(v => {
                const stats = variantStats.find(vs => vs.name === v.name);
                return stats ? { ...v, entries: stats.entries, conversions: stats.conversions, revenue: stats.revenue } : v;
              });
            }
            console.log(`Canvas ${canvas.name}: entries=${totals.entries}, conversions=${totals.conversions}`);
          }
        } catch (e) {
          console.log(`Could not fetch analytics for canvas ${canvas.id}:`, e);
        }
      }
      
      // Calculate summary
      const summary: AnalyticsSummary = {
        total_sends: campaignAnalytics.reduce((sum: number, c: CampaignAnalyticsItem) => sum + c.sends, 0),
        total_deliveries: campaignAnalytics.reduce((sum: number, c: CampaignAnalyticsItem) => sum + c.deliveries, 0),
        total_opens: campaignAnalytics.reduce((sum: number, c: CampaignAnalyticsItem) => sum + c.unique_opens, 0),
        total_clicks: campaignAnalytics.reduce((sum: number, c: CampaignAnalyticsItem) => sum + c.unique_clicks, 0),
        total_unsubscribes: campaignAnalytics.reduce((sum: number, c: CampaignAnalyticsItem) => sum + c.unsubscribes, 0),
        avg_open_rate: 0,
        avg_click_rate: 0,
        total_conversions: campaignAnalytics.reduce((sum: number, c: CampaignAnalyticsItem) => sum + c.conversions, 0) + canvasAnalytics.reduce((sum: number, c: CanvasAnalyticsItem) => sum + c.conversions, 0),
        total_revenue: campaignAnalytics.reduce((sum: number, c: CampaignAnalyticsItem) => sum + c.revenue, 0) + canvasAnalytics.reduce((sum: number, c: CanvasAnalyticsItem) => sum + c.revenue, 0),
      };
      
      if (summary.total_deliveries > 0) {
        summary.avg_open_rate = (summary.total_opens / summary.total_deliveries) * 100;
        summary.avg_click_rate = (summary.total_clicks / summary.total_deliveries) * 100;
      }

      const campaignsDaily: CampaignDailyTrendPoint[] = Array.from(campaignDailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, totals]) => ({ date, ...totals }));

      analyticsData = {
        campaigns: campaignAnalytics,
        canvases: canvasAnalytics,
        summary,
        trends: { campaigns_daily: campaignsDaily },
        date_range: { start: effectiveStartDate, end: effectiveEndDate },
      };
      
      console.log('Analytics fetched:', {
        campaigns: campaignAnalytics.length,
        canvases: canvasAnalytics.length,
        summary,
      });
    }

    const schemaEntries = [
      ...results.campaigns.map(c => ({
        client_platform_id: platformId,
        name: c.name,
        schema_type: 'campaign',
        description: c.description || `Braze campaign: ${c.name}`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: c.id,
          draft: c.draft,
          schedule_type: c.schedule_type,
          channels: c.channels,
          first_sent: c.first_sent,
          last_sent: c.last_sent,
          tags: c.tags,
          archived: c.archived,
        },
      })),
      ...results.canvases.map(c => ({
        client_platform_id: platformId,
        name: c.name,
        schema_type: 'canvas',
        description: c.description || `Braze canvas (journey): ${c.name}`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: c.id,
          draft: c.draft,
          enabled: c.enabled,
          schedule_type: c.schedule_type,
          first_entry: c.first_entry,
          last_entry: c.last_entry,
          tags: c.tags,
          archived: c.archived,
          variants_count: c.variants?.length || 0,
          steps_count: Object.keys(c.steps || {}).length,
        },
      })),
      ...results.templates.map(t => ({
        client_platform_id: platformId,
        name: t.template_name,
        schema_type: 'template',
        description: t.description || `Braze email template: ${t.template_name}`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: t.email_template_id,
          subject: t.subject,
          preheader: t.preheader,
          tags: t.tags,
          created_at: t.created_at,
          updated_at: t.updated_at,
        },
      })),
      ...results.segments.map(s => ({
        client_platform_id: platformId,
        name: s.name,
        schema_type: 'segment',
        description: s.description || `Braze segment: ${s.name}`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: s.id,
          analytics_tracking_enabled: s.analytics_tracking_enabled,
          tags: s.tags,
        },
      })),
    ];

    // Clear old schema entries and insert new ones
    if (schemaEntries.length > 0) {
      await supabase
        .from('platform_schemas')
        .delete()
        .eq('client_platform_id', platformId);

      const { error: insertError } = await supabase
        .from('platform_schemas')
        .insert(schemaEntries);

      if (insertError) {
        console.error('Failed to store schemas:', insertError);
      } else {
        console.log('Stored', schemaEntries.length, 'schema entries');
      }
    }

    // Update the schema_cache on the platform with full data for chat context
    const schemaCache = {
      cache_version: 4, // Bumped for analytics
      saved_at: new Date().toISOString(),
      rest_endpoint: brazeRestEndpoint,
      
      // Counts for quick reference
      campaigns_count: results.campaigns.length,
      canvases_count: results.canvases.length,
      canvases_enabled_count: results.canvases.filter(c => c.enabled).length,
      templates_count: results.templates.length,
      segments_count: results.segments.length,
      segments_starred_count: results.segments.filter(s => s.is_starred).length,
      subscription_groups_count: results.subscriptionGroups.length,
      custom_events_count: results.customEvents.length,
      custom_attributes_count: results.customAttributes.length,
      last_sync: new Date().toISOString(),
      
      // Full data for AI context and UI
      campaigns: results.campaigns,
      canvases: results.canvases,
      templates: results.templates,
      segments: results.segments,
      subscription_groups: results.subscriptionGroups,
      custom_events: results.customEvents,
      custom_attributes: results.customAttributes,
      
      // Analytics data (if fetched)
      analytics: analyticsData,
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
      JSON.stringify({
        success: true,
        data: results,
        schema_cache: schemaCache,
      }),
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
