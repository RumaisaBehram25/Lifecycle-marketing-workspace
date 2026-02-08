import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CustomerIOCampaign {
  id: number;
  name: string;
  type: string;
  state: string;
  created: number;
  updated: number;
  filter_segment?: number;
  trigger?: {
    event_name?: string;
  };
  actions?: unknown[];
  tags?: string[];
}

interface CustomerIOBroadcast {
  id: number;
  name: string;
  state: string;
  created: number;
  sent?: number;
  scheduled_for?: number;
  filter_segment?: string;
  actions?: unknown[];
  tags?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { clientId, platformId } = await req.json();

    if (!clientId || !platformId) {
      throw new Error('clientId and platformId are required');
    }

    const siteId = Deno.env.get('CUSTOMERIO_SITE_ID');
    const apiKey = Deno.env.get('CUSTOMERIO_API_KEY');

    if (!siteId || !apiKey) {
      throw new Error('Customer.io credentials not configured. Set CUSTOMERIO_SITE_ID and CUSTOMERIO_API_KEY.');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create sync run record
    const { data: syncRun, error: syncRunError } = await supabase
      .from('customerio_sync_runs')
      .insert({
        client_id: clientId,
        platform_id: platformId,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (syncRunError) {
      console.error('Failed to create sync run:', syncRunError);
      throw syncRunError;
    }

    const syncRunId = syncRun.id;
    const startTime = Date.now();

    // Customer.io App API uses Basic Auth with Site ID and API Key
    const credentials = btoa(`${siteId}:${apiKey}`);
    const headers = {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };

    let campaignsSynced = 0;
    let broadcastsSynced = 0;
    let messagesSynced = 0;

    try {
      // Fetch campaigns (automated workflows)
      console.log('Fetching Customer.io campaigns...');
      const campaignsResponse = await fetch('https://api.customer.io/v1/campaigns', { headers });
      
      if (!campaignsResponse.ok) {
        const errorText = await campaignsResponse.text();
        console.error('Customer.io campaigns API error:', campaignsResponse.status, errorText);
        throw new Error(`Customer.io API error: ${campaignsResponse.status} - ${errorText}`);
      }

      const campaignsData = await campaignsResponse.json();
      const campaigns: CustomerIOCampaign[] = campaignsData.campaigns || [];
      console.log(`Found ${campaigns.length} campaigns`);

      // Upsert campaigns
      for (const campaign of campaigns) {
        const { error: upsertError } = await supabase
          .from('customerio_campaigns')
          .upsert({
            client_id: clientId,
            cio_campaign_id: String(campaign.id),
            name: campaign.name,
            type: campaign.type,
            state: campaign.state,
            created_at_cio: campaign.created ? new Date(campaign.created * 1000).toISOString() : null,
            updated_at_cio: campaign.updated ? new Date(campaign.updated * 1000).toISOString() : null,
            trigger_event: campaign.trigger?.event_name || null,
            filter_segment: campaign.filter_segment ? String(campaign.filter_segment) : null,
            actions: campaign.actions || [],
            tags: campaign.tags || [],
            synced_at: new Date().toISOString(),
          }, { onConflict: 'client_id,cio_campaign_id' });

        if (upsertError) {
          console.error('Error upserting campaign:', upsertError);
        } else {
          campaignsSynced++;
        }
      }

      // Fetch broadcasts (one-time sends)
      console.log('Fetching Customer.io broadcasts...');
      const broadcastsResponse = await fetch('https://api.customer.io/v1/broadcasts', { headers });
      
      if (!broadcastsResponse.ok) {
        const errorText = await broadcastsResponse.text();
        console.error('Customer.io broadcasts API error:', broadcastsResponse.status, errorText);
        // Don't throw - broadcasts might not be available on all plans
      } else {
        const broadcastsData = await broadcastsResponse.json();
        const broadcasts: CustomerIOBroadcast[] = broadcastsData.broadcasts || [];
        console.log(`Found ${broadcasts.length} broadcasts`);

        // Upsert broadcasts
        for (const broadcast of broadcasts) {
          const { error: upsertError } = await supabase
            .from('customerio_broadcasts')
            .upsert({
              client_id: clientId,
              cio_broadcast_id: String(broadcast.id),
              name: broadcast.name,
              state: broadcast.state,
              sent_at: broadcast.sent ? new Date(broadcast.sent * 1000).toISOString() : null,
              scheduled_for: broadcast.scheduled_for ? new Date(broadcast.scheduled_for * 1000).toISOString() : null,
              send_to: broadcast.filter_segment || null,
              actions: broadcast.actions || [],
              tags: broadcast.tags || [],
              synced_at: new Date().toISOString(),
            }, { onConflict: 'client_id,cio_broadcast_id' });

          if (upsertError) {
            console.error('Error upserting broadcast:', upsertError);
          } else {
            broadcastsSynced++;
          }
        }
      }

      // Update client_platforms with last sync time
      const { error: platformUpdateError } = await supabase
        .from('client_platforms')
        .update({
          last_sync_at: new Date().toISOString(),
          schema_cache: {
            campaigns_count: campaignsSynced,
            broadcasts_count: broadcastsSynced,
            last_sync: new Date().toISOString(),
          },
        })
        .eq('id', platformId);

      if (platformUpdateError) {
        console.error('Error updating platform:', platformUpdateError);
      }

      // Mark sync run as complete
      const duration = Date.now() - startTime;
      await supabase
        .from('customerio_sync_runs')
        .update({
          status: 'complete',
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          campaigns_synced: campaignsSynced,
          broadcasts_synced: broadcastsSynced,
          messages_synced: messagesSynced,
        })
        .eq('id', syncRunId);

      console.log(`Sync complete: ${campaignsSynced} campaigns, ${broadcastsSynced} broadcasts`);

      return new Response(JSON.stringify({
        success: true,
        campaigns_synced: campaignsSynced,
        broadcasts_synced: broadcastsSynced,
        messages_synced: messagesSynced,
        duration_ms: duration,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (syncError) {
      // Mark sync run as failed
      await supabase
        .from('customerio_sync_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: syncError instanceof Error ? syncError.message : 'Unknown error',
          duration_ms: Date.now() - startTime,
        })
        .eq('id', syncRunId);

      throw syncError;
    }

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
