import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  buildUnifiedContext, 
  buildSystemPromptFromContext,
  toLegacyPlatformContext,
  type UnifiedContext,
  type PlatformData,
} from "../_shared/unified-context.ts";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LegacyClientContext {
  id: string;
  name: string;
  brand_voice?: string;
  do_rules?: string[];
  dont_rules?: string[];
  tone_presets?: string[];
  legal_requirements?: string;
}

interface LegacyPlatformContext {
  platform: string;
  events: string[];
  lists: Array<{ name: string; count?: number }>;
  templates: string[];
  profile_properties: string[];
  segments: string[];
  last_sync_at?: string;
}

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

    const { messages, client, platformContext } = await req.json() as {
      messages: ChatMessage[];
      client: LegacyClientContext;
      platformContext?: LegacyPlatformContext | LegacyPlatformContext[];
    };

    // Validate user has access to this client
    const accessResult = await validateClientAccess(authResult.userClient!, client.id);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Use service role for data operations that require elevated access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get latest user query for context-aware knowledge retrieval
    const latestUserQuery = messages
      .filter(m => m.role === 'user')
      .pop()?.content || '';

    // Build unified context with full platform data from database
    console.log('Building unified context for client:', client.id);
    const unifiedContext = await buildUnifiedContext({
      clientId: client.id,
      supabase,
      queryType: 'chat',
      userQuery: latestUserQuery,
    });

    // Build rich system prompt from unified context
    const systemPrompt = buildSystemPromptFromContext(unifiedContext, 'chat');

    // Get legacy platform contexts for tool handlers
    const legacyPlatformContexts = toLegacyPlatformContext(unifiedContext.platforms);

    console.log('Context built:', {
      clientName: unifiedContext.client.name,
      platforms: unifiedContext.platforms.map(p => ({
        name: p.platform,
        metrics: p.metrics.length,
        lists: p.lists.length,
        templates: p.templates.length,
      })),
      knowledge: {
        primary: unifiedContext.knowledge.primaryDocs.length,
        supporting: unifiedContext.knowledge.supportingDocs.length,
        available: unifiedContext.knowledge.availableDocs.length,
      }
    });

    // Define available tools for the AI
    const tools = [
      {
        type: "function",
        function: {
          name: "generate_copy",
          description: "Generate marketing copy (email, SMS, push notification) for the client",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "string", enum: ["email", "sms", "push", "in_app"] },
              goal: { type: "string", description: "Goal of the copy (e.g., drive purchase, re-engage)" },
              tone: { type: "string", description: "Desired tone" },
              additional_context: { type: "string", description: "Any additional context from the conversation" }
            },
            required: ["channel", "goal"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_knowledge",
          description: "Search platform documentation and best practices from the web",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "What to search for" },
              platform: { type: "string", description: "Platform to focus on (braze, klaviyo, etc)" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_client_knowledge",
          description: "Search client-specific documents, email examples, and brand guidelines from the knowledge base",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "What to search for (e.g., 'email examples', 'brand guidelines')" },
              category: { type: "string", description: "Optional category filter (e.g., 'email', 'brand', 'guidelines')" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "suggest_entry_criteria",
          description: "Suggest entry criteria for a flow/journey based on available events",
          parameters: {
            type: "object",
            properties: {
              flow_type: { type: "string", description: "Type of flow (e.g., abandoned cart, browse abandonment, welcome)" },
              timing: { type: "string", description: "When to trigger (e.g., after 2 hours, immediately)" }
            },
            required: ["flow_type"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "suggest_segmentation",
          description: "Suggest audience segmentation based on available lists and profile properties",
          parameters: {
            type: "object",
            properties: {
              segment_goal: { type: "string", description: "Goal of the segment (e.g., high-value customers, at-risk)" }
            },
            required: ["segment_goal"]
          }
        }
      }
    ];

    // First, make a non-streaming call to check if the AI wants to use tools
    const toolCheckResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools,
        tool_choice: 'auto',
      }),
    });

    if (!toolCheckResponse.ok) {
      const errorText = await toolCheckResponse.text();
      logger.error('AI tool check error:', toolCheckResponse.status, errorText);
      throw new Error('AI gateway error');
    }

    const toolCheckData = await toolCheckResponse.json();
    const choice = toolCheckData.choices[0];

    // Check if AI wants to call a tool
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      console.log(`Tool called: ${toolName}`, toolArgs);

      let toolResult: any;

      switch (toolName) {
        case 'generate_copy':
          toolResult = await handleGenerateCopy(unifiedContext, toolArgs);
          break;
        case 'search_knowledge':
          toolResult = await handleSearchKnowledge(PERPLEXITY_API_KEY, toolArgs);
          break;
        case 'search_client_knowledge':
          toolResult = await handleSearchClientKnowledge(supabase, client.id, unifiedContext.platforms, toolArgs);
          break;
        case 'suggest_entry_criteria':
          toolResult = handleSuggestEntryCriteria(legacyPlatformContexts[0], toolArgs);
          break;
        case 'suggest_segmentation':
          toolResult = handleSuggestSegmentation(legacyPlatformContexts[0], toolArgs);
          break;
        default:
          toolResult = { error: 'Unknown tool' };
      }

      // Now stream a response that incorporates the tool result
      const streamResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            { role: 'assistant', content: null, tool_calls: [toolCall] },
            { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) }
          ],
          stream: true,
        }),
      });

      if (!streamResponse.ok) {
        const errorText = await streamResponse.text();
        logger.error('AI stream error:', streamResponse.status, errorText);
        throw new Error('AI gateway error during streaming');
      }

      return new Response(streamResponse.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    // No tool call - just stream the response directly
    const streamResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
      }),
    });

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      logger.error('AI stream error:', streamResponse.status, errorText);
      throw new Error('AI gateway error');
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    logger.error('ops-chat error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============= Tool Handlers =============

async function handleGenerateCopy(
  context: UnifiedContext,
  args: { channel: string; goal: string; tone?: string; additional_context?: string }
) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
  const client = context.client;
  
  // Include platform data for context
  const platformInfo = context.platforms.map(p => 
    `${p.platform}: ${p.metrics.length} events, ${p.lists.length} lists, ${p.templates.length} templates`
  ).join('; ');
  
  const copyPrompt = `Generate marketing copy for ${client.name}:
- Channel: ${args.channel}
- Goal: ${args.goal}
- Tone: ${args.tone || 'Match brand voice'}
- Brand Voice: ${client.brand_voice || 'Professional and friendly'}
- Do Rules: ${client.do_rules?.join('; ') || 'N/A'}
- Don't Rules: ${client.dont_rules?.join('; ') || 'N/A'}
- Platform Data: ${platformInfo}
${args.additional_context ? `- Additional Context: ${args.additional_context}` : ''}

Return JSON with: subject_lines (array of 3), preheader (string), body (string), cta (array of 3)`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are an expert marketing copywriter. Return only valid JSON.' },
        { role: 'user', content: copyPrompt }
      ],
    }),
  });

  if (!response.ok) {
    return { error: 'Failed to generate copy' };
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { body: content };
}

async function handleSearchKnowledge(apiKey: string | undefined, args: { query: string; platform?: string }) {
  if (!apiKey) {
    return { error: 'Perplexity API key not configured', fallback: 'I can provide general guidance but cannot search documentation without the API key.' };
  }

  try {
    const searchQuery = args.platform 
      ? `${args.query} in ${args.platform} marketing automation platform`
      : args.query;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant that provides accurate information about marketing automation platforms. Focus on practical, actionable advice.' 
          },
          { role: 'user', content: searchQuery }
        ],
      }),
    });

    if (!response.ok) {
      return { error: 'Search failed' };
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      citations: data.citations || []
    };
  } catch (error) {
    logger.error('Knowledge search error:', error);
    return { error: 'Search failed' };
  }
}

async function handleSearchClientKnowledge(
  supabase: any,
  clientId: string,
  platforms: PlatformData[],
  args: { query: string; category?: string }
) {
  try {
    const platformNames = platforms.map(p => p.platform);
    
    let query = supabase
      .from('knowledge_documents')
      .select('title, content, category, source_url, platform, is_vendor_doc')
      .or(`client_id.eq.${clientId},is_vendor_doc.eq.true`);

    // Filter by category if provided
    if (args.category) {
      query = query.ilike('category', `%${args.category}%`);
    }

    // Filter vendor docs to connected platforms
    if (platformNames.length > 0) {
      query = query.or(`client_id.eq.${clientId},and(is_vendor_doc.eq.true,platform.in.(${platformNames.join(',')}))`);
    }

    const { data, error } = await query.limit(15);

    if (error) {
      logger.error('Client knowledge search error:', error);
      return { error: 'Failed to search knowledge base' };
    }

    if (!data || data.length === 0) {
      return { 
        message: 'No documents found matching your query.',
        suggestions: ['Try a broader search term', 'Check if documents have been uploaded to the knowledge base']
      };
    }

    // Score by query relevance
    const queryTerms = args.query.toLowerCase().split(' ');
    const scoredDocs = data.map((doc: any) => {
      const titleScore = queryTerms.filter((term: string) => 
        doc.title?.toLowerCase().includes(term)
      ).length * 2;
      const contentScore = queryTerms.filter((term: string) => 
        doc.content?.toLowerCase().includes(term)
      ).length;
      return { ...doc, score: titleScore + contentScore };
    }).sort((a: any, b: any) => b.score - a.score);

    return {
      documents: scoredDocs.slice(0, 5).map((doc: any) => ({
        title: doc.title,
        content: doc.content,
        category: doc.category,
        source_url: doc.source_url,
        platform: doc.platform,
        is_vendor_doc: doc.is_vendor_doc
      })),
      total_found: data.length
    };
  } catch (error) {
    logger.error('Client knowledge search error:', error);
    return { error: 'Failed to search knowledge base' };
  }
}

function handleSuggestEntryCriteria(
  platformContext: LegacyPlatformContext | undefined,
  args: { flow_type: string; timing?: string }
) {
  if (!platformContext) {
    return { error: 'No platform data available. Please sync your platform first.' };
  }

  const flowType = args.flow_type.toLowerCase();
  const events = platformContext.events;

  // Match events to flow types
  const relevantEvents: string[] = [];
  const excludeEvents: string[] = [];

  if (flowType.includes('abandon') && flowType.includes('cart')) {
    relevantEvents.push(...events.filter(e => 
      e.toLowerCase().includes('add') && e.toLowerCase().includes('cart') ||
      e.toLowerCase().includes('started checkout') ||
      e.toLowerCase().includes('checkout started')
    ));
    excludeEvents.push(...events.filter(e => 
      e.toLowerCase().includes('placed order') ||
      e.toLowerCase().includes('order') && e.toLowerCase().includes('completed')
    ));
  } else if (flowType.includes('browse') && flowType.includes('abandon')) {
    relevantEvents.push(...events.filter(e => 
      e.toLowerCase().includes('view') && e.toLowerCase().includes('product') ||
      e.toLowerCase().includes('viewed product')
    ));
    excludeEvents.push(...events.filter(e => 
      e.toLowerCase().includes('add') && e.toLowerCase().includes('cart')
    ));
  } else if (flowType.includes('welcome')) {
    relevantEvents.push(...events.filter(e => 
      e.toLowerCase().includes('subscribed') ||
      e.toLowerCase().includes('signed up') ||
      e.toLowerCase().includes('created account')
    ));
  } else if (flowType.includes('post') && flowType.includes('purchase')) {
    relevantEvents.push(...events.filter(e => 
      e.toLowerCase().includes('placed order') ||
      e.toLowerCase().includes('order') && e.toLowerCase().includes('completed') ||
      e.toLowerCase().includes('fulfilled')
    ));
  } else if (flowType.includes('win') && flowType.includes('back')) {
    relevantEvents.push(...events.filter(e => 
      e.toLowerCase().includes('placed order')
    ));
  }

  return {
    flow_type: args.flow_type,
    suggested_trigger_events: relevantEvents.slice(0, 5),
    suggested_exclude_events: excludeEvents.slice(0, 3),
    timing: args.timing || 'Recommended: 1-2 hours after trigger event',
    all_available_events: events.length,
    platform: platformContext.platform
  };
}

function handleSuggestSegmentation(
  platformContext: LegacyPlatformContext | undefined,
  args: { segment_goal: string }
) {
  if (!platformContext) {
    return { error: 'No platform data available. Please sync your platform first.' };
  }

  const goal = args.segment_goal.toLowerCase();
  const properties = platformContext.profile_properties;
  const lists = platformContext.lists;

  const suggestions: any = {
    segment_goal: args.segment_goal,
    existing_lists: [],
    suggested_criteria: [],
    available_properties: properties.slice(0, 15)
  };

  // Find relevant existing lists
  if (goal.includes('vip') || goal.includes('high') && goal.includes('value')) {
    suggestions.existing_lists = lists.filter(l => 
      l.name.toLowerCase().includes('vip') || 
      l.name.toLowerCase().includes('loyalty') ||
      l.name.toLowerCase().includes('high value')
    );
    suggestions.suggested_criteria.push(
      'Lifetime value > top 20%',
      'Order count > 3',
      'Average order value > median'
    );
  } else if (goal.includes('at risk') || goal.includes('churn')) {
    suggestions.suggested_criteria.push(
      'Days since last purchase > 90',
      'Email engagement declining',
      'No site activity in 30 days'
    );
  } else if (goal.includes('new') || goal.includes('first')) {
    suggestions.suggested_criteria.push(
      'Order count = 0 or 1',
      'Account created within 30 days',
      'First purchase within 7 days'
    );
  }

  return suggestions;
}
