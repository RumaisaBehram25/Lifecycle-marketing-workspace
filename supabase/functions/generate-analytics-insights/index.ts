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
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const { client_id } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessResult = await validateClientAccess(authResult.userClient!, client_id);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: canvases, error: dbError } = await supabase
      .from('braze_canvases')
      .select('name, sends_last_30d, entries_last_30d, entries_last_60d, tags, enabled, schedule_type, conversion_events, archived')
      .eq('client_id', client_id)
      .eq('archived', false);

    if (dbError) {
      logger.error('DB query failed:', dbError);
      throw new Error('Failed to fetch campaign data');
    }

    if (!canvases || canvases.length === 0) {
      return new Response(
        JSON.stringify({ insights: [{ title: 'No Campaign Data', body: 'No active campaigns found. Connect your Braze account and sync campaigns to generate AI insights.', tag: 'Info', tagColor: 'bg-blue-500/10 text-blue-600' }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignSummary = canvases.map(c => ({
      name: c.name,
      sends_30d: c.sends_last_30d || 0,
      entries_30d: c.entries_last_30d || 0,
      entries_60d: c.entries_last_60d || 0,
      tags: c.tags || [],
      enabled: c.enabled,
      schedule_type: c.schedule_type,
      conversion_events: c.conversion_events || [],
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a lifecycle marketing analytics expert. Analyze campaign data and return exactly 3-4 actionable insights.

Return ONLY valid JSON — an array of objects with these fields:
- "title": short insight heading (5-10 words)
- "body": 1-2 sentence explanation with specific numbers from the data
- "tag": one of "High Priority", "Strategy", "Growth", "Benchmark", "Warning", "Opportunity"
- "tagColor": matching Tailwind classes:
  - "High Priority" -> "bg-red-500/10 text-red-600"
  - "Strategy" -> "bg-amber-500/10 text-amber-600"
  - "Growth" -> "bg-green-500/10 text-green-600"
  - "Benchmark" -> "bg-purple-500/10 text-purple-600"
  - "Warning" -> "bg-orange-500/10 text-orange-600"
  - "Opportunity" -> "bg-cyan-500/10 text-cyan-600"

Focus on: performance patterns, underperforming flows, engagement gaps, and growth opportunities.`
          },
          {
            role: 'user',
            content: `Analyze these ${canvases.length} campaigns/flows:\n${JSON.stringify(campaignSummary, null, 2)}`
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenAI error:', errorText);
      throw new Error('AI generation failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);

    let insights;
    if (jsonMatch) {
      insights = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse AI response');
    }

    return new Response(
      JSON.stringify({ insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    logger.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
