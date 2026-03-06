import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  buildUnifiedContext, 
  buildSystemPromptFromContext,
} from "../_shared/unified-context.ts";
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

    const { input, client } = await req.json();

    // Validate user has access to this client if client.id is provided
    if (client?.id) {
      const accessResult = await validateClientAccess(authResult.userClient!, client.id);
      if (!accessResult.success) {
        return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build unified context for rich, consistent AI context
    console.log('Building unified context for copy generation:', client?.id);
    
    let unifiedContext;
    let systemPrompt: string;

    if (client?.id) {
      unifiedContext = await buildUnifiedContext({
        clientId: client.id,
        supabase,
        queryType: 'copy',
        userQuery: `${input.channel} ${input.goal} ${input.additional_context || ''}`,
      });

      // Build base prompt from unified context
      systemPrompt = buildSystemPromptFromContext(unifiedContext, 'copy');
      
      // Add copy-specific generation parameters
      systemPrompt += `

## GENERATION PARAMETERS
- **Channel**: ${input.channel}
- **Platform**: ${input.platform}
- **Audience Stage**: ${input.audience_stage}
- **Goal**: ${input.goal}
- **Tone**: ${input.tone}
- **CTA Type**: ${input.cta_type}
- **Additional Context**: ${input.additional_context || 'None'}

## OUTPUT FORMAT
Return valid JSON with the following structure:
{
  "subject_lines": ["Subject 1", "Subject 2", "Subject 3"],
  "preheader": "Preview text that complements the subject line",
  "body": "The main copy content with proper formatting",
  "cta": ["CTA 1", "CTA 2", "CTA 3"],
  "sources_used": ["List of sources/guidelines used"],
  "assumptions": ["Any assumptions made about the audience or context"]
}

Make sure to:
1. Apply the client's brand voice and tone presets
2. Follow all Do rules and avoid all Don't rules
3. Include any required legal disclaimers
4. Reference the client's actual lists, events, and templates where relevant
5. Make copy specific to their platform capabilities`;

      console.log('Context built:', {
        clientName: unifiedContext.client.name,
        platforms: unifiedContext.platforms.length,
        primaryDocs: unifiedContext.knowledge.primaryDocs.length,
      });
    } else {
      // Fallback for when no client context is available
      systemPrompt = `You are an expert lifecycle marketing copywriter. Generate compelling marketing copy.

CLIENT CONTEXT:
- Name: ${client?.name || 'Unknown'}
- Brand Voice: ${client?.brand_voice || 'Professional and friendly'}
- Tone Presets: ${client?.tone_presets?.join(', ') || 'N/A'}
- Do Rules: ${client?.do_rules?.join('; ') || 'N/A'}
- Don't Rules: ${client?.dont_rules?.join('; ') || 'N/A'}
- Legal Requirements: ${client?.legal_requirements || 'N/A'}

GENERATION PARAMETERS:
- Channel: ${input.channel}
- Platform: ${input.platform}
- Audience Stage: ${input.audience_stage}
- Goal: ${input.goal}
- Tone: ${input.tone}
- CTA Type: ${input.cta_type}
- Additional Context: ${input.additional_context || 'None'}

Return JSON with: subject_lines (array of 3), preheader (string), body (string), cta (array of 3), sources_used (array), assumptions (array).`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the marketing copy now. Return only valid JSON.' }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('AI error:', errorText);
      throw new Error('AI generation failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    let result;
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = { 
        subject_lines: ['Generated subject'], 
        preheader: 'Preview text', 
        body: content, 
        cta: ['Learn more'], 
        sources_used: ['Brand guidelines'], 
        assumptions: [] 
      };
    }

    // Add context transparency - what data informed this generation
    if (unifiedContext) {
      result.context_used = {
        client: unifiedContext.client.name,
        brand_voice_applied: !!unifiedContext.client.brand_voice,
        platforms: unifiedContext.platforms.map(p => p.platform),
        knowledge_docs_referenced: unifiedContext.knowledge.primaryDocs.length + unifiedContext.knowledge.supportingDocs.length,
        generated_at: new Date().toISOString(),
      };
    }

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error: unknown) {
    logger.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
