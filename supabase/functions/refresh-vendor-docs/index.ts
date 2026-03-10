import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive documentation configuration for all platforms
const PLATFORM_DOCS: Record<string, { 
  name: string; 
  baseUrl: string; 
  includePaths: string[]; 
  excludePaths?: string[];
  priority_paths?: string[]; // These get scraped first
}> = {
  braze: {
    name: 'Braze',
    baseUrl: 'https://www.braze.com/docs',
    priority_paths: [
      '/user_guide/personalization_and_dynamic_content/liquid/',
      '/api/',
      '/user_guide/message_building_by_channel/email/',
      '/user_guide/message_building_by_channel/push/',
      '/user_guide/engagement_tools/canvas/',
    ],
    includePaths: [
      '/user_guide/message_building_by_channel/email/',
      '/user_guide/message_building_by_channel/push/',
      '/user_guide/message_building_by_channel/sms_mms/',
      '/user_guide/message_building_by_channel/in-app_messages/',
      '/user_guide/personalization_and_dynamic_content/liquid/',
      '/user_guide/personalization_and_dynamic_content/connected_content/',
      '/user_guide/engagement_tools/canvas/',
      '/user_guide/engagement_tools/campaigns/',
      '/user_guide/engagement_tools/segments/',
      '/user_guide/data_and_analytics/',
      '/api/',
      '/developer_guide/',
    ],
    excludePaths: ['/release_notes/', '/partners/', '/help/', '/_feedback'],
  },
  klaviyo: {
    name: 'Klaviyo',
    baseUrl: 'https://developers.klaviyo.com',
    priority_paths: [
      '/en/docs/flows',
      '/en/docs/templates',
      '/en/docs/lists',
      '/en/docs/segments',
      '/en/reference/api_overview',
    ],
    includePaths: [
      '/en/docs/',
      '/en/reference/',
      '/en/tutorials/',
    ],
    excludePaths: ['/changelog/', '/community/'],
  },
  iterable: {
    name: 'Iterable',
    baseUrl: 'https://support.iterable.com/hc/en-us',
    priority_paths: [
      '/articles/workflow-studio',
      '/articles/email-templates',
      '/articles/events',
      '/articles/api',
    ],
    includePaths: [
      '/articles/',
      '/categories/',
    ],
    excludePaths: ['/community/', '/requests/'],
  },
  customerio: {
    name: 'Customer.io',
    baseUrl: 'https://customer.io/docs',
    priority_paths: [
      '/journeys/',
      '/api/',
      '/messaging/',
    ],
    includePaths: [
      '/journeys/',
      '/api/',
      '/sdk/',
      '/messaging/',
      '/data/',
      '/integrations/',
    ],
    excludePaths: ['/changelog/', '/videos/'],
  },
  hubspot: {
    name: 'HubSpot',
    baseUrl: 'https://developers.hubspot.com/docs',
    priority_paths: [
      '/api/marketing/marketing-emails',
      '/api/crm/',
      '/cms/templates/',
    ],
    includePaths: [
      '/cms/',
      '/api/',
      '/crm/',
      '/guides/',
    ],
    excludePaths: ['/changelog/', '/reference/api/deprecated/'],
  },
};

// Document categories based on URL patterns
function categorizeUrl(url: string): string {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('/liquid') || lowerUrl.includes('/personalization')) {
    return 'liquid_templating';
  }
  if (lowerUrl.includes('/api') || lowerUrl.includes('/reference')) {
    return 'api_reference';
  }
  if (lowerUrl.includes('/canvas') || lowerUrl.includes('/flow') || lowerUrl.includes('/journey') || lowerUrl.includes('/workflow')) {
    return 'flows_journeys';
  }
  if (lowerUrl.includes('/email')) {
    return 'email';
  }
  if (lowerUrl.includes('/sms') || lowerUrl.includes('/mms')) {
    return 'sms';
  }
  if (lowerUrl.includes('/push')) {
    return 'push_notifications';
  }
  if (lowerUrl.includes('/segment')) {
    return 'segmentation';
  }
  if (lowerUrl.includes('/template')) {
    return 'templates';
  }
  if (lowerUrl.includes('/event') || lowerUrl.includes('/tracking')) {
    return 'events_tracking';
  }
  if (lowerUrl.includes('/integration') || lowerUrl.includes('/webhook')) {
    return 'integrations';
  }
  
  return 'documentation';
}

const MAX_PAGES_PER_PLATFORM = 150; // Increased from 50 for comprehensive coverage

async function mapAndScrapeUrl(
  baseUrl: string, 
  apiKey: string,
  includePaths: string[],
  excludePaths?: string[],
  priorityPaths?: string[]
): Promise<{ url: string; markdown: string; title: string; category: string }[]> {
  const results: { url: string; markdown: string; title: string; category: string }[] = [];
  
  try {
    // Step 1: Map the website to discover all URLs
    console.log(`Mapping ${baseUrl}...`);
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: baseUrl,
        limit: 1000, // Increased limit to discover more pages
        includeSubdomains: false,
      }),
    });

    if (!mapResponse.ok) {
      logger.error(`Failed to map ${baseUrl}: ${mapResponse.status}`);
      return results;
    }

    const mapData = await mapResponse.json();
    let urls: string[] = mapData.links || mapData.data?.links || [];
    
    console.log(`Found ${urls.length} URLs at ${baseUrl}`);

    // Filter URLs based on include/exclude paths
    if (includePaths && includePaths.length > 0) {
      urls = urls.filter(url => includePaths.some(path => url.includes(path)));
    }
    if (excludePaths && excludePaths.length > 0) {
      urls = urls.filter(url => !excludePaths.some(path => url.includes(path)));
    }

    // Sort URLs to prioritize important paths
    if (priorityPaths && priorityPaths.length > 0) {
      urls.sort((a, b) => {
        const aIsPriority = priorityPaths.some(path => a.includes(path));
        const bIsPriority = priorityPaths.some(path => b.includes(path));
        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;
        return 0;
      });
    }

    // Limit the number of pages
    urls = urls.slice(0, MAX_PAGES_PER_PLATFORM);
    console.log(`Processing ${urls.length} filtered URLs`);

    // Step 2: Scrape each URL
    for (const url of urls) {
      try {
        console.log(`Scraping: ${url}`);
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });

        if (!scrapeResponse.ok) {
          logger.error(`Failed to scrape ${url}: ${scrapeResponse.status}`);
          continue;
        }

        const scrapeData = await scrapeResponse.json();
        const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
        const title = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || url;

        if (markdown && markdown.length > 100) {
          const category = categorizeUrl(url);
          results.push({ url, markdown, title, category });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        logger.error(`Error scraping ${url}:`, error);
      }
    }
  } catch (error) {
    logger.error(`Error mapping ${baseUrl}:`, error);
  }

  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Create a sync log entry
  const { data: syncLog, error: syncLogError } = await supabase
    .from('knowledge_sync_logs')
    .insert({ status: 'running' })
    .select()
    .single();

  if (syncLogError) {
    logger.error('Failed to create sync log:', syncLogError);
  }

  const syncId = syncLog?.id;

  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const platformResults: { 
      platform: string; 
      name: string;
      urls_found: number; 
      new_docs: number; 
      updated_docs: number;
      failed: number;
      categories: Record<string, number>;
    }[] = [];

    let totalNew = 0;
    let totalUpdated = 0;
    let totalFailed = 0;

    // Process each platform
    for (const [platformKey, platformData] of Object.entries(PLATFORM_DOCS)) {
      console.log(`\n=== Processing ${platformData.name} documentation ===`);
      
      const scraped = await mapAndScrapeUrl(
        platformData.baseUrl, 
        FIRECRAWL_API_KEY,
        platformData.includePaths,
        platformData.excludePaths,
        platformData.priority_paths
      );

      let newDocs = 0;
      let updatedDocs = 0;
      let failed = 0;
      const categories: Record<string, number> = {};

      for (const doc of scraped) {
        // Track categories
        categories[doc.category] = (categories[doc.category] || 0) + 1;

        // Check if document already exists
        const { data: existing } = await supabase
          .from('knowledge_documents')
          .select('id, content')
          .eq('source_url', doc.url)
          .single();

        if (existing) {
          // Update if content changed
          if (existing.content !== doc.markdown) {
            const { error } = await supabase
              .from('knowledge_documents')
              .update({
                title: doc.title,
                content: doc.markdown,
                category: doc.category,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);

            if (error) {
              logger.error(`Error updating ${doc.url}:`, error);
              failed++;
            } else {
              console.log(`Updated: ${doc.title}`);
              updatedDocs++;
            }
          }
        } else {
          // Insert new document
          const { error } = await supabase
            .from('knowledge_documents')
            .insert({
              source_url: doc.url,
              title: doc.title,
              content: doc.markdown,
              content_type: 'markdown',
              category: doc.category,
              platform: platformKey,
              is_vendor_doc: true,
            });

          if (error) {
            logger.error(`Error inserting ${doc.url}:`, error);
            failed++;
          } else {
            console.log(`Added: ${doc.title}`);
            newDocs++;
          }
        }
      }

      platformResults.push({ 
        platform: platformKey, 
        name: platformData.name,
        urls_found: scraped.length,
        new_docs: newDocs, 
        updated_docs: updatedDocs,
        failed,
        categories
      });

      totalNew += newDocs;
      totalUpdated += updatedDocs;
      totalFailed += failed;
    }

    // Update sync log with results
    if (syncId) {
      await supabase
        .from('knowledge_sync_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_documents: totalNew + totalUpdated,
          new_documents: totalNew,
          updated_documents: totalUpdated,
          failed_documents: totalFailed,
          platforms_processed: platformResults,
        })
        .eq('id', syncId);
    }

    console.log(`\n=== Refresh complete ===`);
    console.log(`New: ${totalNew}, Updated: ${totalUpdated}, Failed: ${totalFailed}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Refreshed vendor documentation',
        sync_id: syncId,
        results: platformResults,
        totals: { 
          new: totalNew, 
          updated: totalUpdated, 
          failed: totalFailed,
          total: totalNew + totalUpdated
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    logger.error('Error refreshing docs:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Update sync log with error
    if (syncId) {
      await supabase
        .from('knowledge_sync_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('id', syncId);
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
