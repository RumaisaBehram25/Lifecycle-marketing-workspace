import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BrazeCampaign {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  schedule_type?: string;
  channels?: string[];
  first_sent?: string;
  last_sent?: string;
  tags?: string[];
  message_types?: string[];
  created_at?: string;
  updated_at?: string;
  archived?: boolean;
  subject?: string;
  preheader?: string;
  html_preview?: string;
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
}

interface BrazeSubscriptionGroup {
  id: string;
  name: string;
  channel: string;
  is_active?: boolean;
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
    const { clientId, platformId, restEndpoint } = await req.json();

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
    } = {
      campaigns: [],
      canvases: [],
      templates: [],
      segments: [],
      subscriptionGroups: [],
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

    // Fetch campaigns with details
    try {
      const campaignsData = await brazeFetch('campaigns/list?page=0&include_archived=false&sort_direction=desc', apiKey, brazeRestEndpoint);
      const campaignList = campaignsData.campaigns || [];
      
      const campaignsWithDetails = await Promise.all(
        campaignList.slice(0, 50).map(async (c: any) => {
          let subject = '';
          let preheader = '';
          let htmlPreview = '';
          let templateId = '';
          let push_title = '';
          let push_body = '';
          let inapp_header = '';
          let inapp_body = '';
          let inapp_cta = '';
          
          try {
            const details = await brazeFetch(`campaigns/details?campaign_id=${c.id}`, apiKey, brazeRestEndpoint);
            const messages = details.messages || {};
            for (const [key, msg] of Object.entries(messages)) {
              const msgData = msg as any;
              
              // Email content
              if (msgData.channel === 'email') {
                subject = msgData.subject || subject;
                preheader = msgData.preheader || preheader;
                templateId = msgData.email_template_id || msgData.template_id || '';
                
                if (msgData.body) {
                  htmlPreview = msgData.body as string;
                } else if (templateId && templateHtmlMap.has(templateId)) {
                  const templateData = templateHtmlMap.get(templateId)!;
                  htmlPreview = templateData.html;
                  subject = subject || templateData.subject;
                  preheader = preheader || templateData.preheader;
                }
              }
              
              // Push notification content
              if (msgData.channel === 'push' || msgData.channel === 'ios_push' || msgData.channel === 'android_push') {
                push_title = msgData.title || msgData.alert_title || push_title;
                push_body = msgData.message || msgData.alert || msgData.body || push_body;
              }
              
              // In-app message content
              if (msgData.channel === 'in_app_message') {
                inapp_header = msgData.header || msgData.title || inapp_header;
                inapp_body = msgData.message || msgData.body || inapp_body;
                inapp_cta = msgData.button_one_text || msgData.cta || inapp_cta;
              }
            }
          } catch (err) {
            console.log(`Could not fetch details for campaign ${c.id}: ${err}`);
          }
          
          if (!htmlPreview) {
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
          
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            draft: c.draft,
            schedule_type: c.schedule_type,
            channels: c.channels,
            first_sent: c.first_sent,
            last_sent: c.last_sent,
            tags: c.tags,
            message_types: c.message_types,
            created_at: c.created_at,
            updated_at: c.updated_at,
            archived: c.archived,
            subject,
            preheader,
            html_preview: htmlPreview,
            push_title,
            push_body,
            inapp_header,
            inapp_body,
            inapp_cta,
          };
        })
      );
      
      const remainingCampaigns = campaignList.slice(50).map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        draft: c.draft,
        schedule_type: c.schedule_type,
        channels: c.channels,
        first_sent: c.first_sent,
        last_sent: c.last_sent,
        tags: c.tags,
        message_types: c.message_types,
        created_at: c.created_at,
        updated_at: c.updated_at,
        archived: c.archived,
      }));
      
      results.campaigns = [...campaignsWithDetails, ...remainingCampaigns];
      console.log('Fetched campaigns:', results.campaigns.length, 'with HTML:', campaignsWithDetails.filter(c => c.html_preview).length);
    } catch (e) {
      console.error('Failed to fetch campaigns:', e);
    }

    // Fetch canvases with FULL hierarchical structure: variants -> steps graph
    try {
      const canvasesData = await brazeFetch('canvas/list?page=0&include_archived=false&sort_direction=desc', apiKey, brazeRestEndpoint);
      const canvasList = canvasesData.canvases || [];
      
      console.log(`Found ${canvasList.length} canvases, fetching details for up to 50...`);
      
      const canvasesWithDetails = await Promise.all(
        canvasList.slice(0, 50).map(async (c: any): Promise<BrazeCanvas> => {
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
                    messages.push({
                      channel: msg.channel || (s.channels?.[0]) || 'email',
                      subject: msg.subject,
                      preheader: msg.preheader,
                      title: msg.title,
                      body: msg.body,
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
      
      // Add remaining canvases without full details
      const remainingCanvases: BrazeCanvas[] = canvasList.slice(50).map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        draft: c.draft,
        enabled: false, // Can't determine without details
        schedule_type: c.schedule_type,
        first_entry: c.first_entry,
        last_entry: c.last_entry,
        tags: c.tags,
        created_at: c.created_at,
        updated_at: c.updated_at,
        archived: c.archived,
        variants: [],
        steps: {},
        total_steps: 0,
      }));
      
      results.canvases = [...canvasesWithDetails, ...remainingCanvases];
      
      const enabledCount = canvasesWithDetails.filter(c => c.enabled).length;
      const withStepsCount = canvasesWithDetails.filter(c => Object.keys(c.steps).length > 0).length;
      console.log(`Fetched canvases: ${results.canvases.length} total, ${enabledCount} enabled, ${withStepsCount} with steps`);
    } catch (e) {
      console.error('Failed to fetch canvases:', e);
    }

    // Fetch segments
    try {
      const segmentsData = await brazeFetch('segments/list?page=0&sort_direction=desc', apiKey, brazeRestEndpoint);
      results.segments = (segmentsData.segments || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        analytics_tracking_enabled: s.analytics_tracking_enabled,
        tags: s.tags,
      }));
      console.log('Fetched segments:', results.segments.length);
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

    // Store the schema data in platform_schemas
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
      cache_version: 2, // Bumped for new structure
      saved_at: new Date().toISOString(),
      rest_endpoint: brazeRestEndpoint,
      
      // Counts for quick reference
      campaigns_count: results.campaigns.length,
      canvases_count: results.canvases.length,
      canvases_enabled_count: results.canvases.filter(c => c.enabled).length,
      templates_count: results.templates.length,
      segments_count: results.segments.length,
      subscription_groups_count: results.subscriptionGroups.length,
      last_sync: new Date().toISOString(),
      
      // Full data for AI context and UI
      campaigns: results.campaigns,
      canvases: results.canvases, // Now includes full variants + steps graph
      templates: results.templates,
      segments: results.segments,
      subscription_groups: results.subscriptionGroups,
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
