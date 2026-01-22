import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IterableList {
  id: number;
  name: string;
  createdAt?: number;
  listType?: string;
  subscriberCount?: number;
}

interface IterableChannel {
  id: number;
  name: string;
  channelType: string;
  messageMedium?: string;
}

interface IterableCampaign {
  id: number;
  name: string;
  type: string;
  templateId?: number;
  createdAt?: number;
  updatedAt?: number;
  campaignState?: string;
}

interface IterableTemplate {
  templateId: number;
  name: string;
  templateType: string;
  createdAt?: number;
  updatedAt?: number;
  messageMedium?: string;
}

interface IterableEvent {
  name: string;
  count?: number;
}

async function iterableFetch(endpoint: string, apiKey: string, method = 'GET', body?: any) {
  const options: RequestInit = {
    method,
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`https://api.iterable.com/api/${endpoint}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Iterable API error (${endpoint}):`, response.status, errorText);
    throw new Error(`Iterable API error: ${response.status}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, platformId } = await req.json();

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

    if (platform.platform !== 'iterable') {
      throw new Error('This endpoint only supports Iterable');
    }

    const apiKey = platform.api_key_encrypted;
    if (!apiKey) {
      throw new Error('No API key configured for this platform');
    }

    console.log('Fetching Iterable data for client:', clientId);

    const results: {
      lists: IterableList[];
      channels: IterableChannel[];
      campaigns: IterableCampaign[];
      templates: IterableTemplate[];
      events: IterableEvent[];
    } = {
      lists: [],
      channels: [],
      campaigns: [],
      templates: [],
      events: [],
    };

    // Fetch lists
    try {
      const listsData = await iterableFetch('lists', apiKey);
      results.lists = (listsData.lists || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        createdAt: l.createdAt,
        listType: l.listType,
        subscriberCount: l.subscriberCount,
      }));
      console.log('Fetched lists:', results.lists.length);
    } catch (e) {
      console.error('Failed to fetch lists:', e);
    }

    // Fetch channels (message types)
    try {
      const channelsData = await iterableFetch('channels', apiKey);
      results.channels = (channelsData.channels || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        channelType: c.channelType,
        messageMedium: c.messageMedium,
      }));
      console.log('Fetched channels:', results.channels.length);
    } catch (e) {
      console.error('Failed to fetch channels:', e);
    }

    // Fetch campaigns
    try {
      const campaignsData = await iterableFetch('campaigns', apiKey);
      results.campaigns = (campaignsData.campaigns || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        templateId: c.templateId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        campaignState: c.campaignState,
      }));
      console.log('Fetched campaigns:', results.campaigns.length);
    } catch (e) {
      console.error('Failed to fetch campaigns:', e);
    }

    // Fetch templates
    try {
      // First try email templates
      const emailTemplatesData = await iterableFetch('templates?templateType=Base', apiKey);
      const emailTemplates = (emailTemplatesData.templates || []).map((t: any) => ({
        templateId: t.templateId,
        name: t.name,
        templateType: t.templateType || 'Base',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messageMedium: 'Email',
      }));
      results.templates.push(...emailTemplates);
      console.log('Fetched email templates:', emailTemplates.length);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    }

    // Fetch event names (custom events)
    try {
      // Iterable doesn't have a direct endpoint for all event names, but we can get system fields
      const fieldsData = await iterableFetch('users/getFields', apiKey);
      if (fieldsData.fields) {
        // Extract event-related fields
        results.events = Object.keys(fieldsData.fields)
          .filter(key => key.startsWith('event_') || key.includes('Event'))
          .map(name => ({ name }));
      }
      console.log('Fetched event fields:', results.events.length);
    } catch (e) {
      console.error('Failed to fetch events:', e);
    }

    // Store the schema data in platform_schemas
    const schemaEntries = [
      ...results.lists.map(l => ({
        client_platform_id: platformId,
        name: l.name,
        schema_type: 'list',
        description: `Iterable list: ${l.name}`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: l.id,
          listType: l.listType,
          subscriberCount: l.subscriberCount,
          createdAt: l.createdAt,
        },
      })),
      ...results.channels.map(c => ({
        client_platform_id: platformId,
        name: c.name,
        schema_type: 'channel',
        description: `Iterable channel (${c.channelType})`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: c.id,
          channelType: c.channelType,
          messageMedium: c.messageMedium,
        },
      })),
      ...results.campaigns.map(c => ({
        client_platform_id: platformId,
        name: c.name,
        schema_type: 'campaign',
        description: `Iterable campaign (${c.type})`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: c.id,
          type: c.type,
          templateId: c.templateId,
          campaignState: c.campaignState,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
      })),
      ...results.templates.map(t => ({
        client_platform_id: platformId,
        name: t.name,
        schema_type: 'template',
        description: `Iterable template (${t.messageMedium || t.templateType})`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          templateId: t.templateId,
          templateType: t.templateType,
          messageMedium: t.messageMedium,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
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

    // Update the schema_cache on the platform
    const schemaCache = {
      cache_version: 1,
      saved_at: new Date().toISOString(),
      lists_count: results.lists.length,
      channels_count: results.channels.length,
      campaigns_count: results.campaigns.length,
      templates_count: results.templates.length,
      events_count: results.events.length,
      last_sync: new Date().toISOString(),
      lists: results.lists,
      channels: results.channels,
      campaigns: results.campaigns,
      templates: results.templates,
      events: results.events,
    };

    await supabase
      .from('client_platforms')
      .update({ 
        schema_cache: schemaCache,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', platformId);

    console.log('Iterable sync complete');

    return new Response(
      JSON.stringify({
        success: true,
        data: results,
        schema_cache: schemaCache,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error syncing Iterable:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
