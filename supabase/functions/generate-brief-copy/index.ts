import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";
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

    const { contentType, channels, about, clientId } = await req.json();

    // Validate user has access to this client if clientId is provided
    if (clientId) {
      const accessResult = await validateClientAccess(authResult.userClient!, clientId);
      if (!accessResult.success) {
        return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Fetch client brand context if available
    let brandContext = '';
    if (clientId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: client } = await supabase
        .from('clients')
        .select('name, brand_voice, tagline, value_propositions')
        .eq('id', clientId)
        .maybeSingle();

      if (client) {
        brandContext = `
Brand: ${client.name}
${client.tagline ? `Tagline: ${client.tagline}` : ''}
${client.brand_voice ? `Voice: ${client.brand_voice}` : ''}
${client.value_propositions ? `Value Props: ${JSON.stringify(client.value_propositions)}` : ''}
`;
      }
    }

    const systemPrompt = `You are a CRM marketing strategist helping create campaign briefs. Your role is to:
1. Suggest a clear, descriptive campaign name based on the description
2. Expand the description into a more detailed brief that includes goals, target audience, and key messages

${brandContext}

Return a JSON object with:
- name: A concise campaign name (max 50 chars)
- expandedAbout: An expanded 2-3 paragraph description covering goals, audience, and messaging strategy

Be specific, actionable, and aligned with CRM best practices for ${contentType === 'lifecycle' ? 'lifecycle journeys' : 'campaigns'}.`;

    const userPrompt = `Create a brief for a ${contentType} using these channels: ${channels.join(', ')}

Description: ${about}

Suggest a name and expand this into a detailed brief.`;

    console.log('Calling AI for brief generation...');
    console.log('Content type:', contentType);
    console.log('Channels:', channels);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_brief_suggestions',
              description: 'Return name and expanded description for the campaign brief',
              parameters: {
                type: 'object',
                properties: {
                  name: { 
                    type: 'string',
                    description: 'A concise, descriptive campaign name (max 50 chars)'
                  },
                  expandedAbout: { 
                    type: 'string',
                    description: 'An expanded 2-3 paragraph description covering goals, audience, and messaging strategy'
                  },
                },
                required: ['name', 'expandedAbout'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'generate_brief_suggestions' } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      logger.error('AI gateway error:', response.status, errorText);
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const suggestions = JSON.parse(toolCall.function.arguments);
      console.log('Generated suggestions:', suggestions);
      
      return new Response(
        JSON.stringify({ suggestions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback if no tool call
    return new Response(
      JSON.stringify({ suggestions: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Generate brief error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
