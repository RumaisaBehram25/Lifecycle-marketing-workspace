import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KlaviyoProfile {
  id: string;
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  created?: string;
  updated?: string;
  properties?: Record<string, unknown>;
  location?: Record<string, unknown>;
  subscriptions?: Record<string, unknown>;
}

interface KlaviyoMetric {
  id: string;
  name: string;
  created?: string;
  updated?: string;
  integration?: Record<string, unknown>;
}

interface KlaviyoList {
  id: string;
  name: string;
  created?: string;
  updated?: string;
  profile_count?: number;
  opt_in_process?: string;
}

interface KlaviyoTemplate {
  id: string;
  name: string;
  editor_type?: string;
  html?: string;
  text?: string;
  created?: string;
  updated?: string;
}

async function klaviyoFetch(endpoint: string, apiKey: string) {
  const response = await fetch(`https://a.klaviyo.com/api/${endpoint}`, {
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Accept': 'application/json',
      'revision': '2024-02-15',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Klaviyo API error (${endpoint}):`, response.status, errorText);
    throw new Error(`Klaviyo API error: ${response.status}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT authentication
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const { clientId, platformId } = await req.json();

    if (!clientId || !platformId) {
      throw new Error('clientId and platformId are required');
    }

    // Validate user has access to this client
    const accessResult = await validateClientAccess(authResult.userClient!, clientId);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
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

    if (platform.platform !== 'klaviyo') {
      throw new Error('This endpoint only supports Klaviyo');
    }

    const apiKey = platform.api_key_encrypted;
    if (!apiKey) {
      throw new Error('No API key configured for this platform');
    }

    console.log('Fetching Klaviyo data for client:', clientId);

    // Fetch various data from Klaviyo
    const results: {
      profiles: { count: number; sample: KlaviyoProfile[] };
      metrics: KlaviyoMetric[];
      lists: KlaviyoList[];
      templates: KlaviyoTemplate[];
      account: Record<string, unknown>;
    } = {
      profiles: { count: 0, sample: [] },
      metrics: [],
      lists: [],
      templates: [],
      account: {},
    };

    // Fetch account info
    try {
      const accountData = await klaviyoFetch('accounts/', apiKey);
      results.account = accountData.data?.[0]?.attributes || {};
      console.log('Fetched account info');
    } catch (e) {
      console.error('Failed to fetch account:', e);
    }

    // Fetch profiles with full attributes
    try {
      const profilesData = await klaviyoFetch('profiles/?page[size]=25', apiKey);
      results.profiles.sample = (profilesData.data || []).map((p: any) => ({
        id: p.id,
        email: p.attributes?.email,
        phone_number: p.attributes?.phone_number,
        first_name: p.attributes?.first_name,
        last_name: p.attributes?.last_name,
        created: p.attributes?.created,
        updated: p.attributes?.updated,
        properties: p.attributes?.properties || {},
        location: p.attributes?.location || {},
        subscriptions: p.attributes?.subscriptions || {},
        external_id: p.attributes?.external_id,
        anonymous_id: p.attributes?.anonymous_id,
        title: p.attributes?.title,
        organization: p.attributes?.organization,
        image: p.attributes?.image,
      }));
      results.profiles.count = results.profiles.sample.length;
      console.log('Fetched profiles:', results.profiles.count);
    } catch (e) {
      console.error('Failed to fetch profiles:', e);
    }

    // Fetch metrics (events/triggers) with full metadata
    try {
      const metricsData = await klaviyoFetch('metrics/', apiKey);
      results.metrics = (metricsData.data || []).map((m: any) => ({
        id: m.id,
        name: m.attributes?.name,
        created: m.attributes?.created,
        updated: m.attributes?.updated,
        integration: m.attributes?.integration || {},
      }));
      console.log('Fetched metrics:', results.metrics.length);
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    }

    // Fetch lists with profile counts
    try {
      const listsData = await klaviyoFetch('lists/', apiKey);
      results.lists = await Promise.all((listsData.data || []).map(async (l: any) => {
        const listInfo: KlaviyoList = {
          id: l.id,
          name: l.attributes?.name,
          created: l.attributes?.created,
          updated: l.attributes?.updated,
          opt_in_process: l.attributes?.opt_in_process,
        };
        // Try to get profile count for this list
        try {
          const countData = await klaviyoFetch(`lists/${l.id}/profiles/?page[size]=1`, apiKey);
          listInfo.profile_count = countData.meta?.page_info?.count || 0;
        } catch (e) {
          console.log(`Could not get profile count for list ${l.id}`);
        }
        return listInfo;
      }));
      console.log('Fetched lists:', results.lists.length);
    } catch (e) {
      console.error('Failed to fetch lists:', e);
    }

    // Fetch templates with HTML content
    try {
      const templatesData = await klaviyoFetch('templates/', apiKey);
      results.templates = (templatesData.data || []).map((t: any) => ({
        id: t.id,
        name: t.attributes?.name,
        editor_type: t.attributes?.editor_type,
        html: t.attributes?.html,
        text: t.attributes?.text,
        created: t.attributes?.created,
        updated: t.attributes?.updated,
      }));
      console.log('Fetched templates:', results.templates.length);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    }

    // Store the schema data in platform_schemas with full metadata
    const schemaEntries = [
      ...results.metrics.map(m => ({
        client_platform_id: platformId,
        name: m.name,
        schema_type: 'metric',
        description: `Klaviyo metric/event: ${m.name}`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: m.id,
          created: m.created,
          updated: m.updated,
          integration: m.integration,
        },
      })),
      ...results.lists.map(l => ({
        client_platform_id: platformId,
        name: l.name,
        schema_type: 'list',
        description: `Klaviyo list: ${l.name}`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: l.id,
          created: l.created,
          updated: l.updated,
          profile_count: l.profile_count,
          opt_in_process: l.opt_in_process,
        },
      })),
      ...results.templates.map(t => ({
        client_platform_id: platformId,
        name: t.name,
        schema_type: 'template',
        description: `Klaviyo template (${t.editor_type || 'unknown'})`,
        last_seen_at: new Date().toISOString(),
        metadata: {
          id: t.id,
          editor_type: t.editor_type,
          created: t.created,
          updated: t.updated,
          has_html: !!t.html,
          html_length: t.html?.length || 0,
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

    // Update the schema_cache on the platform with FULL DATA for chat context
    const schemaCache = {
      // Cache version for debugging stale data issues
      cache_version: 2,
      saved_at: new Date().toISOString(),
      
      // Counts for quick reference
      profiles_count: results.profiles.count,
      metrics_count: results.metrics.length,
      lists_count: results.lists.length,
      templates_count: results.templates.length,
      last_sync: new Date().toISOString(),
      account: results.account,
      
      // FULL DATA ARRAYS for chat context
      metrics: results.metrics,
      lists: results.lists,
      templates: results.templates.map(t => ({
        id: t.id,
        name: t.name,
        editor_type: t.editor_type,
        created: t.created,
        updated: t.updated,
        // Exclude full HTML to keep cache size reasonable
      })),
      sample_profiles: results.profiles.sample,
    };

    await supabase
      .from('client_platforms')
      .update({ 
        schema_cache: schemaCache,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', platformId);

    console.log('Klaviyo sync complete');

    return new Response(
      JSON.stringify({
        success: true,
        data: results,
        schema_cache: schemaCache,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error syncing Klaviyo:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
