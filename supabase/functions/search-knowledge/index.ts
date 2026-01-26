import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAuth, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT authentication
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const { query, platform, limit = 10 } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Perplexity API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the search query with platform context
    const platformContext = platform ? ` for ${platform}` : '';
    const searchQuery = `${query}${platformContext} marketing automation email platform documentation`;

    console.log('Searching with Perplexity:', searchQuery);

    // Use Perplexity chat completions with grounded search
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert on marketing automation platforms including Braze, Klaviyo, Iterable, Customer.io, and HubSpot. Provide detailed, accurate information about platform features, integrations, and best practices. Always cite your sources.' 
          },
          { role: 'user', content: searchQuery }
        ],
        search_domain_filter: platform ? getDomainFilter(platform) : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Perplexity API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    console.log('Perplexity search successful, citations:', citations.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        content,
        citations,
        query: searchQuery,
        platform 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error searching knowledge:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getDomainFilter(platform: string): string[] {
  const domainMap: Record<string, string[]> = {
    braze: ['braze.com', 'docs.braze.com'],
    klaviyo: ['klaviyo.com', 'help.klaviyo.com', 'developers.klaviyo.com'],
    iterable: ['iterable.com', 'support.iterable.com', 'api.iterable.com'],
    customerio: ['customer.io', 'docs.customer.io'],
    hubspot: ['hubspot.com', 'developers.hubspot.com', 'knowledge.hubspot.com'],
  };
  return domainMap[platform.toLowerCase()] || [];
}
