import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { input, client } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const platformSyntax: Record<string, string> = {
      braze: 'Liquid (Braze syntax)',
      klaviyo: 'Django template syntax',
      iterable: 'Handlebars',
      customerio: 'Liquid',
      hubspot: 'HubL',
    };

    const systemPrompt = `You are an expert lifecycle marketing developer. Generate ${platformSyntax[input.platform] || 'templating'} code.

CLIENT: ${client?.name || 'Unknown'}
PLATFORM: ${input.platform}
TRIGGER: ${input.trigger_type}
ATTRIBUTES: ${input.available_attributes?.join(', ') || 'first_name, email'}
EDGE CASES: ${input.edge_cases?.join('; ') || 'Handle missing values'}
CONTEXT: ${input.additional_context || 'Standard personalization'}

Return JSON with: logic (string - the code), language (string), explanation (string), fallback_handling (array), sources_used (array), assumptions (array).
Include proper fallbacks and comments in the code.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the lifecycle code now. Return only valid JSON.' }
        ],
      }),
    });

    if (!response.ok) throw new Error('AI generation failed');

    const data = await response.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { logic: content, language: platformSyntax[input.platform], explanation: 'Generated code', fallback_handling: [], sources_used: [], assumptions: [] };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
