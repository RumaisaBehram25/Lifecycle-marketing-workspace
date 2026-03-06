import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAuth, authErrorResponse } from "../_shared/auth.ts";
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
    // Validate JWT authentication
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const { url, category, platform, is_vendor_doc, use_perplexity = false } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let content = '';
    let title = '';
    let metadata: Record<string, unknown> = {};

    // If use_perplexity is true, use Perplexity to analyze and summarize the content
    if (use_perplexity) {
      const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
      if (!PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY not configured');

      console.log('Using Perplexity to analyze URL:', url);

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            { 
              role: 'system', 
              content: 'You are a documentation expert. Analyze the given URL and provide a comprehensive summary of its content. Include key features, API endpoints, configuration options, and best practices. Format your response in markdown with clear sections and code examples where relevant.' 
            },
            { role: 'user', content: `Analyze and create detailed documentation for: ${url}` }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Perplexity API error:', response.status, errorText);
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const data = await response.json();
      content = data.choices?.[0]?.message?.content || '';
      title = `Perplexity Analysis: ${new URL(url).hostname}`;
      metadata = { citations: data.citations || [], analyzed_with: 'perplexity' };
    } else {
      // Use Firecrawl to scrape the URL
      const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
      if (!FIRECRAWL_API_KEY) throw new Error('FIRECRAWL_API_KEY not configured');

      console.log('Using Firecrawl to scrape URL:', url);

      const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      });

      if (!firecrawlResponse.ok) throw new Error('Firecrawl scrape failed');

      const firecrawlData = await firecrawlResponse.json();
      content = firecrawlData.data?.markdown || firecrawlData.markdown || '';
      title = firecrawlData.data?.metadata?.title || firecrawlData.metadata?.title || url;
      metadata = firecrawlData.data?.metadata || firecrawlData.metadata || {};
    }

    if (!content) {
      throw new Error('No content extracted from URL');
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data, error } = await supabase.from('knowledge_documents').insert({
      source_url: url,
      title,
      content,
      content_type: 'markdown',
      category: category || null,
      platform: platform || null,
      is_vendor_doc: is_vendor_doc || false,
      metadata,
    }).select().single();

    if (error) throw error;

    console.log('Ingested document:', data.id);
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    logger.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
