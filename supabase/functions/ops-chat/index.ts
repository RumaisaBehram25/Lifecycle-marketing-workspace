import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildUnifiedContext,
  buildSystemPromptFromContext,
  type UnifiedContext,
} from "../_shared/unified-context.ts";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";
import { buildAnalyticsSnapshotBlock } from "../_shared/analytics-snapshot.ts";
import { logger } from '../_shared/logger.ts';
import { serializeUnknownError } from '../_shared/errors.ts';

type ChatProvider = {
  kind: 'anthropic';
  url: string;
  apiKey: string;
  defaultModel: string;
};

/** CRM Copilot uses Anthropic only. Set `ANTHROPIC_API_KEY` (and optional `ANTHROPIC_MODEL`) in Edge Function secrets. */
function getChatProvider(): ChatProvider | null {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (!anthropicKey) return null;
  // Pinned ID — matches `generate-analytics-insights`. Avoid deprecated aliases like
  // `claude-3-sonnet-latest` / `claude-3-5-sonnet-latest` (Anthropic may return 404).
  const defaultModel =
    Deno.env.get('ANTHROPIC_MODEL')?.trim() || 'claude-haiku-4-5-20251001';
  return {
    kind: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    apiKey: anthropicKey,
    defaultModel,
  };
}

function openAiCompatibleSseStreamFromText(text: string): ReadableStream<Uint8Array> {
  // The frontend `ClientChat` parses `data: ...` lines and expects an OpenAI-style
  // shape: { choices: [{ delta: { content: "..." } }] } plus a final [DONE].
  const encoder = new TextEncoder();
  const maxChunkSize = 80; // small chunks for a nicer typing effect
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxChunkSize));
    i += maxChunkSize;
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        for (const chunk of chunks) {
          if (!chunk) continue;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [{ delta: { content: chunk } }],
              })}\n`
            )
          );
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n`));
      } finally {
        controller.close();
      }
    },
  });
}

function toAnthropicMessages(openAiMessages: Array<{ role: string; content?: unknown }>) {
  const out: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }> = [];
  for (const m of openAiMessages) {
    if (m.role === 'system') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    out.push({
      role: m.role,
      content: [{ type: 'text', text: String(m.content ?? '') }],
    });
  }
  return out;
}

async function anthropicComplete(provider: ChatProvider, payload: Record<string, unknown>): Promise<string> {
  const model = (payload.model as string | undefined) || provider.defaultModel;
  const messages = (payload.messages as Array<{ role: string; content?: unknown }>) || [];

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => String(m.content ?? ''))
    .filter(Boolean)
    .join('\n\n');

  const anthropicMessages = toAnthropicMessages(messages);

  const maxTokens = (payload.max_tokens as number | undefined) ?? 1024;
  const temperature = (payload.temperature as number | undefined) ?? 0.4;

  const resp = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': Deno.env.get('ANTHROPIC_VERSION')?.trim() || '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages: anthropicMessages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return `Anthropic error (${resp.status}): ${errText.slice(0, 800)}`;
  }

  const json = (await resp.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const blocks = json.content ?? [];
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

async function buildWorkspaceSnapshot(supabase: ReturnType<typeof createClient>, clientId: string): Promise<string> {
  try {
    const settled = await Promise.allSettled([
      supabase
        .from('briefs')
        .select('name, status, content_type, deadline')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false })
        .limit(12),
      supabase
        .from('client_drive_files')
        .select('file_name, file_type')
        .eq('client_id', clientId)
        .limit(24),
      supabase
        .from('template_library')
        .select('name, content_type')
        .eq('client_id', clientId)
        .limit(8),
    ]);

    type Pg = { data: unknown; error: { message?: string } | null };
    const take = (i: number, label: string): unknown[] => {
      const out = settled[i];
      if (out.status === 'rejected') {
        logger.error(`workspace snapshot ${label} rejected:`, out.reason);
        return [];
      }
      const r = out.value as Pg;
      if (r?.error) logger.error(`workspace snapshot ${label}:`, r.error.message ?? r.error);
      return (r?.data as unknown[]) || [];
    };

    const briefs = take(0, 'briefs');
    const files = take(1, 'client_drive_files');
    const templates = take(2, 'template_library');

    let block =
      '\n## LIVE WORKSPACE SNAPSHOT (this account)\nGround answers in this data when relevant. If something is empty, say so clearly.\n';

    if (briefs.length) {
      block += `\n### Briefs (recent)\n${briefs
        .map(
          (b: { status?: string; name?: string; content_type?: string; deadline?: string }) =>
            `- [${b.status ?? 'unknown'}] ${b.name ?? 'Untitled'} (${b.content_type ?? 'n/a'}${b.deadline ? `, deadline ${b.deadline}` : ''})`
        )
        .join('\n')}\n`;
    } else {
      block += '\n### Briefs\n- None in the database yet.\n';
    }

    const docs = files.filter((f: { file_type?: string }) => (f.file_type || 'file') !== 'folder');
    if (docs.length) {
      block += `\n### Google Drive (synced files, sample)\n${docs
        .slice(0, 12)
        .map((f: { file_name?: string }) => `- ${f.file_name || 'file'}`)
        .join('\n')}\n`;
    }

    if (templates.length) {
      block += `\n### Template library\n${templates
        .map((t: { name?: string; content_type?: string }) => `- ${t.name ?? 'Template'} (${t.content_type ?? 'n/a'})`)
        .join('\n')}\n`;
    }

    block +=
      '\nIf a subsection is empty, the workspace has no rows there yet. Analytics/KPI numbers for Braze live in the **ANALYTICS & CRM DATA** section below when synced.\n';
    return block;
  } catch (e) {
    logger.error('workspace snapshot error:', e);
    return '';
  }
}

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

    let body: {
      messages: ChatMessage[];
      client: LegacyClientContext;
      platformContext?: LegacyPlatformContext | LegacyPlatformContext[];
      /** Optional: Braze/analytics `client_id` when it must match Dashboard (defaults to client.id). */
      analyticsClientId?: string;
    };
    try {
      body = await req.json();
    } catch (e) {
      logger.error('ops-chat invalid JSON body:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages, client, platformContext, analyticsClientId: analyticsClientIdRaw } = body;

    // Validate user has access to this client
    const accessResult = await validateClientAccess(authResult.userClient!, client.id);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const analyticsClientId =
      typeof analyticsClientIdRaw === 'string' && analyticsClientIdRaw.trim().length > 0
        ? analyticsClientIdRaw.trim()
        : client.id;

    if (analyticsClientId !== client.id) {
      const analyticsAccess = await validateClientAccess(authResult.userClient!, analyticsClientId);
      if (!analyticsAccess.success) {
        return authErrorResponse(analyticsAccess.error!, analyticsAccess.status!, corsHeaders);
      }
    }

    const provider = getChatProvider();
    if (!provider) {
      return new Response(
        JSON.stringify({
          error:
            'No AI provider configured. Set ANTHROPIC_API_KEY (Anthropic/Claude) in Edge Function secrets, then redeploy ops-chat. Optional: ANTHROPIC_MODEL.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Build rich system prompt from unified context + live DB snapshot
    let systemPrompt = buildSystemPromptFromContext(unifiedContext, 'chat');
    systemPrompt += await buildWorkspaceSnapshot(supabase, client.id);
    systemPrompt += await buildAnalyticsSnapshotBlock(supabase, analyticsClientId);

    systemPrompt += `\n## DATA ACCURACY & SUPABASE ACCESS (mandatory)\n` +
      `- **Snapshot time:** ${unifiedContext.generatedAt} (UTC). Numbers are a point-in-time read for this chat request.\n` +
      `- **Client scope:** \`clients.id\` = \`${client.id}\`. **Analytics / Braze bundle** uses \`analyticsClientId\` = \`${analyticsClientId}\` (aligned with Dashboard Braze tiles when that ID matches your synced workspace).\n` +
      `- **How this is loaded:** This Edge Function uses the Supabase **service role** to **read** rows for those IDs (same underlying tables as in-app Analytics, Campaigns, KPIs). That is **not** “no access” — it is the server-side, API-grounded snapshot injected into your context.\n` +
      `- **Answer rules:** State **only** metrics, campaign names, segment names, and counts that appear in **ANALYTICS & CRM DATA**, **LIVE WORKSPACE SNAPSHOT**, **PLATFORM**, and **CLIENT CONTEXT** above. **Do not invent** sends, opens, revenue, or list sizes. If something is not in the snapshot, say it is **not in the current data** and suggest Braze sync or checking Analytics / Campaigns.\n` +
      `- **Forbidden claims:** Do **not** say you lack “API access”, “Supabase access”, or “can’t see the Analytics tab” — this prompt already contains what the app exposed for this turn.\n`;

    systemPrompt += `\n## COPILOT VOICE\nYou are **CRM Copilot** for lifecycle marketersâ€”warm, decisive, and concise. Prefer short sections and bullet points. Be actionable and slightly catchy without being cheesy. If a metric is missing from the snapshots above, say it is not synced or not in the database yetâ€”do not invent numbersâ€”and still give strong best-practice guidance.\n`;

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

    // Anthropic Claude: non-streaming API, then adapt to OpenAI-compatible SSE for the client.
    const completionText = await anthropicComplete(provider, {
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 8192,
      temperature: 0.35,
    });

    if (completionText.startsWith('Anthropic error')) {
      return new Response(JSON.stringify({ error: completionText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(openAiCompatibleSseStreamFromText(completionText), {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    const message = serializeUnknownError(error);
    logger.error('ops-chat error:', message, error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
