import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BrandAnalysis {
  brand_voice?: string;
  tone_presets?: string[];
  do_rules?: string[];
  dont_rules?: string[];
  legal_requirements?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  tagline?: string;
  industry?: string;
  value_propositions?: Array<{ title: string; description: string }>;
  target_audience?: Array<{ segment: string; description: string; demographics?: string }>;
  key_messaging_pillars?: Array<{ pillar: string; description: string }>;
  differentiators?: string[];
  competitors?: string[];
  copy_examples?: Array<{ type: string; text: string; context?: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, websiteUrl, clientName } = await req.json();
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Discovering brand for:', clientName, websiteUrl);

    // Step 1: Scrape the website for brand info using Firecrawl
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: websiteUrl,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      console.error('Firecrawl scrape failed:', errorText);
      throw new Error('Failed to scrape website');
    }

    const scrapeData = await scrapeResponse.json();
    console.log('Scrape successful, analyzing brand...');

    const markdown = scrapeData.data?.markdown || '';
    const metadata = scrapeData.data?.metadata || {};

    // Step 2: Use AI to analyze and extract comprehensive brand guidelines
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a brand analyst expert. Analyze the provided website content to extract comprehensive brand guidelines.

Return a JSON object with:
{
  "brand_voice": "A 2-3 sentence description of the brand's voice and tone",
  "tagline": "The brand's tagline or slogan if found",
  "industry": "The industry/vertical the brand operates in",
  "primary_color": "Primary brand color in hex if identifiable from content",
  "secondary_color": "Secondary brand color in hex if identifiable",
  "tone_presets": ["array", "of", "3-5", "tone", "keywords"],
  "do_rules": ["Array of 3-5 things the brand DOES in their messaging"],
  "dont_rules": ["Array of 3-5 things the brand AVOIDS in their messaging"],
  "legal_requirements": "Any legal disclaimers or requirements noticed, or null if none",
  "value_propositions": [
    { "title": "Value Prop Title", "description": "Brief description of this value proposition" }
  ],
  "target_audience": [
    { "segment": "Audience Segment Name", "description": "Description of this audience", "demographics": "Optional demographics" }
  ],
  "key_messaging_pillars": [
    { "pillar": "Messaging Theme", "description": "How this pillar is expressed in content" }
  ],
  "differentiators": ["What makes this brand unique vs competitors"],
  "competitors": ["Known or inferred competitor names"],
  "copy_examples": [
    { "type": "headline|cta|tagline|body", "text": "Actual copy from the site", "context": "Where it was used" }
  ]
}

Extract 3-5 items for array fields. Be specific and base analysis on actual content.`
          },
          {
            role: 'user',
            content: `Analyze this brand: ${clientName}

Website URL: ${websiteUrl}

Website Content:
${markdown.substring(0, 12000)}

Page Title: ${metadata.title || 'Unknown'}
Page Description: ${metadata.description || 'None'}

Return only valid JSON.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI analysis failed:', errorText);
      throw new Error('Failed to analyze brand');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;
    
    // Parse AI response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    let brandAnalysis: BrandAnalysis = {};
    if (jsonMatch) {
      try {
        brandAnalysis = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Failed to parse AI response as JSON:', e);
        brandAnalysis = { brand_voice: content };
      }
    }

    console.log('Brand analysis complete:', Object.keys(brandAnalysis));

    // Step 3: Update the client in database with all new fields
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const updateData: Record<string, unknown> = {};
    
    // Text fields
    if (brandAnalysis.brand_voice) updateData.brand_voice = brandAnalysis.brand_voice;
    if (brandAnalysis.tagline) updateData.tagline = brandAnalysis.tagline;
    if (brandAnalysis.industry) updateData.industry = brandAnalysis.industry;
    if (brandAnalysis.primary_color) updateData.primary_color = brandAnalysis.primary_color;
    if (brandAnalysis.secondary_color) updateData.secondary_color = brandAnalysis.secondary_color;
    if (brandAnalysis.legal_requirements) updateData.legal_requirements = brandAnalysis.legal_requirements;
    
    // JSON/Array fields
    if (brandAnalysis.tone_presets?.length) updateData.tone_presets = brandAnalysis.tone_presets;
    if (brandAnalysis.do_rules?.length) updateData.do_rules = brandAnalysis.do_rules;
    if (brandAnalysis.dont_rules?.length) updateData.dont_rules = brandAnalysis.dont_rules;
    if (brandAnalysis.value_propositions?.length) updateData.value_propositions = brandAnalysis.value_propositions;
    if (brandAnalysis.target_audience?.length) updateData.target_audience = brandAnalysis.target_audience;
    if (brandAnalysis.key_messaging_pillars?.length) updateData.key_messaging_pillars = brandAnalysis.key_messaging_pillars;
    if (brandAnalysis.differentiators?.length) updateData.differentiators = brandAnalysis.differentiators;
    if (brandAnalysis.competitors?.length) updateData.competitors = brandAnalysis.competitors;
    if (brandAnalysis.copy_examples?.length) updateData.copy_examples = brandAnalysis.copy_examples;

    console.log('Updating client with fields:', Object.keys(updateData));

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', clientId);

      if (updateError) {
        console.error('Failed to update client:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      } else {
        console.log('Client updated with brand data');
      }
    }

    return new Response(JSON.stringify({
      success: true,
      fieldsUpdated: Object.keys(updateData),
      brandAnalysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});