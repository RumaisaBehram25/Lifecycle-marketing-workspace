import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, clientName } = await req.json();
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    console.log('Discovering emails for:', clientName);

    const results: Array<{ source: string; url: string; title: string; content: string }> = [];

    // Search Really Good Emails
    const rgeSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `site:reallygoodemails.com ${clientName}`,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    if (rgeSearchResponse.ok) {
      const rgeData = await rgeSearchResponse.json();
      const rgeResults = rgeData.data || [];
      for (const item of rgeResults) {
        if (item.url && item.markdown) {
          results.push({
            source: 'Really Good Emails',
            url: item.url,
            title: item.title || item.url,
            content: item.markdown.substring(0, 5000),
          });
        }
      }
      console.log(`Found ${rgeResults.length} emails from Really Good Emails`);
    }

    // Search Milled
    const milledSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `site:milled.com ${clientName}`,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    if (milledSearchResponse.ok) {
      const milledData = await milledSearchResponse.json();
      const milledResults = milledData.data || [];
      for (const item of milledResults) {
        if (item.url && item.markdown) {
          results.push({
            source: 'Milled',
            url: item.url,
            title: item.title || item.url,
            content: item.markdown.substring(0, 5000),
          });
        }
      }
      console.log(`Found ${milledResults.length} emails from Milled`);
    }

    // General search for brand emails
    const generalSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${clientName} email marketing examples`,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    if (generalSearchResponse.ok) {
      const generalData = await generalSearchResponse.json();
      const generalResults = generalData.data || [];
      for (const item of generalResults) {
        if (item.url && item.markdown) {
          results.push({
            source: 'Web Search',
            url: item.url,
            title: item.title || item.url,
            content: item.markdown.substring(0, 5000),
          });
        }
      }
      console.log(`Found ${generalResults.length} emails from general search`);
    }

    // Store results in knowledge_documents
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let storedCount = 0;
    for (const result of results) {
      // Check if document already exists
      const { data: existing } = await supabase
        .from('knowledge_documents')
        .select('id')
        .eq('source_url', result.url)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('knowledge_documents')
          .update({
            title: result.title,
            content: result.content,
            metadata: { source: result.source },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (!error) storedCount++;
        else logger.error('Failed to update email:', error);
      } else {
        // Insert new
        const { error } = await supabase.from('knowledge_documents').insert({
          source_url: result.url,
          title: result.title,
          content: result.content,
          content_type: 'markdown',
          category: 'email_example',
          client_id: clientId,
          is_vendor_doc: false,
          metadata: { source: result.source },
        });

        if (!error) storedCount++;
        else logger.error('Failed to store email:', error);
      }
    }

    console.log(`Stored ${storedCount} email examples`);

    return new Response(JSON.stringify({
      found: results.length,
      stored: storedCount,
      results: results.map(r => ({
        source: r.source,
        url: r.url,
        title: r.title,
      })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    logger.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
