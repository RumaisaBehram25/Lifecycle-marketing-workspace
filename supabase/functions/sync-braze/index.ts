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

interface BrazeCanvas {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  schedule_type?: string;
  first_entry?: string;
  last_entry?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  archived?: boolean;
  total_steps?: number;
  variants?: any[];
  // Canvas details
  steps?: Array<{
    name: string;
    type: string;
    channel?: string;
    delay?: string;
    id?: string;
  }>;
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
            // Store full HTML - emails typically 50-150KB max, and we need complete HTML for proper rendering
            const htmlContent = details.body || undefined;
            
            // Store in map for campaign matching
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
      
      // Add remaining templates without HTML content
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
      
      // Fetch campaign details for first 50 campaigns to get message content
      const campaignsWithDetails = await Promise.all(
        campaignList.slice(0, 50).map(async (c: any) => {
          let subject = '';
          let preheader = '';
          let htmlPreview = '';
          let templateId = '';
          
          // Try to get campaign details
          try {
            const details = await brazeFetch(`campaigns/details?campaign_id=${c.id}`, apiKey, brazeRestEndpoint);
            // Extract email message details if available
            const messages = details.messages || {};
            for (const [key, msg] of Object.entries(messages)) {
              const msgData = msg as any;
              if (msgData.channel === 'email') {
                subject = msgData.subject || subject;
                preheader = msgData.preheader || preheader;
                templateId = msgData.email_template_id || msgData.template_id || '';
                
                // Check if body is directly available - store full HTML for proper rendering
                if (msgData.body) {
                  htmlPreview = msgData.body as string;
                }
                // If no body but we have a template ID, look it up
                else if (templateId && templateHtmlMap.has(templateId)) {
                  const templateData = templateHtmlMap.get(templateId)!;
                  htmlPreview = templateData.html;
                  subject = subject || templateData.subject;
                  preheader = preheader || templateData.preheader;
                }
                break;
              }
            }
          } catch (err) {
            console.log(`Could not fetch details for campaign ${c.id}: ${err}`);
          }
          
          // If still no HTML, try matching by campaign name to template name
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
          };
        })
      );
      
      // Add remaining campaigns without details
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

    // Fetch canvases (user journeys) with step details
    try {
      const canvasesData = await brazeFetch('canvas/list?page=0&include_archived=false&sort_direction=desc', apiKey, brazeRestEndpoint);
      const canvasList = canvasesData.canvases || [];
      
      // Fetch canvas details for first 30 canvases to get steps
      const canvasesWithDetails = await Promise.all(
        canvasList.slice(0, 30).map(async (c: any) => {
          let steps: Array<{ name: string; type: string; channel?: string; delay?: string; id?: string }> = [];
          
          try {
            const details = await brazeFetch(`canvas/details?canvas_id=${c.id}`, apiKey, brazeRestEndpoint);
            
            // Parse steps from canvas details
            if (details.steps) {
              steps = Object.entries(details.steps).map(([stepId, step]: [string, any]) => {
                // Determine channel from message type
                let channel = 'email';
                if (step.type === 'message') {
                  const messages = step.messages || [];
                  if (messages.length > 0) {
                    const msgChannel = messages[0]?.channel;
                    if (msgChannel) channel = msgChannel;
                  }
                }
                
                // Parse delay
                let delay = '0h';
                if (step.delay) {
                  const seconds = step.delay;
                  if (seconds >= 86400) {
                    delay = `${Math.floor(seconds / 86400)}d`;
                  } else if (seconds >= 3600) {
                    delay = `${Math.floor(seconds / 3600)}h`;
                  } else if (seconds >= 60) {
                    delay = `${Math.floor(seconds / 60)}m`;
                  }
                }
                
                return {
                  id: stepId,
                  name: step.name || `Step ${stepId.slice(0, 4)}`,
                  type: step.type || 'message',
                  channel,
                  delay,
                };
              });
            }
            
            // Also try to parse from variants if steps aren't available
            if (steps.length === 0 && details.variants) {
              details.variants.forEach((variant: any, vIndex: number) => {
                if (variant.steps) {
                  variant.steps.forEach((step: any, sIndex: number) => {
                    steps.push({
                      id: `v${vIndex}-s${sIndex}`,
                      name: step.name || `Step ${sIndex + 1}`,
                      type: step.type || 'message',
                      channel: step.channel || 'email',
                      delay: step.delay || '0h',
                    });
                  });
                }
              });
            }
            
            console.log(`Canvas ${c.name}: found ${steps.length} steps`);
          } catch (err) {
            console.log(`Could not fetch details for canvas ${c.id}: ${err}`);
          }
          
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            draft: c.draft,
            schedule_type: c.schedule_type,
            first_entry: c.first_entry,
            last_entry: c.last_entry,
            tags: c.tags,
            created_at: c.created_at,
            updated_at: c.updated_at,
            archived: c.archived,
            steps: steps.length > 0 ? steps : undefined,
          };
        })
      );
      
      // Add remaining canvases without step details
      const remainingCanvases = canvasList.slice(30).map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        draft: c.draft,
        schedule_type: c.schedule_type,
        first_entry: c.first_entry,
        last_entry: c.last_entry,
        tags: c.tags,
        created_at: c.created_at,
        updated_at: c.updated_at,
        archived: c.archived,
      }));
      
      results.canvases = [...canvasesWithDetails, ...remainingCanvases];
      console.log('Fetched canvases:', results.canvases.length, 'with steps:', canvasesWithDetails.filter(c => c.steps && c.steps.length > 0).length);
    } catch (e) {
      console.error('Failed to fetch canvases:', e);
    }
    // Templates already fetched above - no need to fetch again

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
          schedule_type: c.schedule_type,
          first_entry: c.first_entry,
          last_entry: c.last_entry,
          tags: c.tags,
          archived: c.archived,
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
      cache_version: 1,
      saved_at: new Date().toISOString(),
      rest_endpoint: brazeRestEndpoint,
      
      // Counts for quick reference
      campaigns_count: results.campaigns.length,
      canvases_count: results.canvases.length,
      templates_count: results.templates.length,
      segments_count: results.segments.length,
      subscription_groups_count: results.subscriptionGroups.length,
      last_sync: new Date().toISOString(),
      
      // Full data for AI context
      campaigns: results.campaigns,
      canvases: results.canvases,
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
