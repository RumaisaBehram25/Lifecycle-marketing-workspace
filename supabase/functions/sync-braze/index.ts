import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { validateAuth, validateClientAccess, authErrorResponse } from "../_shared/auth.ts";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// Reduced batch size and limits for memory safety
const BATCH_SIZE = 3;
const MAX_HTML_SIZE = 50000;
const MAX_CANVASES_TO_PROCESS = 100;
const MAX_CAMPAIGNS_TO_PROCESS = 100;

// Priority scoring for lifecycle canvas detection
function getCanvasPriority(name: string): number {
  const nameLower = name.toLowerCase();
  const nameUpper = name.toUpperCase();
  
  // Priority 1: Lifecycle patterns (score 100+)
  if (nameLower.includes('lifecycle')) return 150;
  if (/^\d{8}\s*\|\s*marketing\s*\|\s*lifecycle/i.test(name)) return 140;
  if (nameLower.includes('welcome') && (nameLower.includes('free') || nameLower.includes('paid') || nameLower.includes('activation') || nameLower.includes('trial'))) return 130;
  if (nameLower.includes('retention')) return 120;
  if (nameLower.includes('abandoned') || nameLower.includes('abandon')) return 115;
  if (nameLower.includes('reactivation')) return 110;
  if (nameLower.includes('pre-churn') || nameLower.includes('prechurn')) return 105;
  if (nameLower.includes('post cancellation') || nameLower.includes('post-cancellation')) return 100;
  
  // Priority 2: Recent dates (2025/2026) or enabled (score 50-90)
  if (/^2026\d{4}/i.test(name) || /^2026\d{2}\d{2}/i.test(name)) return 90;
  if (/^2025\d{4}/i.test(name) || /^2025\d{2}\d{2}/i.test(name)) return 85;
  if (/^20250\d{3}/i.test(name) || /^20260\d{3}/i.test(name)) return 80;
  if (nameLower.includes('marketing') && nameLower.includes('campaign')) return 60;
  if (nameLower.includes('transactional')) return 55;
  
  // Priority 3: Skip patterns (score 0-10)
  if (nameLower.includes('testing') || nameLower.includes('test ')) return 5;
  if (nameUpper.includes('[DO NOT EDIT]')) return 3;
  if (nameLower.includes('complete') && !nameLower.includes('lifecycle')) return 2;
  if (/^201\d{5}/i.test(name) || /^202[0-3]\d{4}/i.test(name)) return 10; // Older dates
  
  // Default: medium priority
  return 40;
}

// Truncate HTML to prevent memory issues
function truncateHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  if (html.length <= MAX_HTML_SIZE) return html;
  return html.slice(0, MAX_HTML_SIZE) + '<!-- truncated -->';
}

// Retry wrapper with exponential back-off
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`Retrying after ${delay}ms (attempt ${attempt + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

async function brazeFetch(endpoint: string, apiKey: string, restEndpoint: string) {
  return withRetry(async () => {
    const url = `${restEndpoint}/${endpoint}`;
    console.log(`Fetching Braze: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Braze API error ${response.status}: ${errorText.slice(0, 200)}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  });
}

function formatDelay(seconds: number | undefined): string {
  if (!seconds || seconds === 0) return '0h';
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

const isTruthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';

const toDateMs = (v: unknown): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
};

const toIso = (v: unknown): string | undefined => {
  const ms = toDateMs(v);
  return ms ? new Date(ms).toISOString() : undefined;
};

interface CanvasListItem {
  id: string;
  name: string;
  draft?: boolean;
  enabled?: boolean;
  is_active?: boolean;
  active?: boolean;
  status?: string;
  last_entry?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  description?: string;
  archived?: boolean;
}

interface ProcessedCanvas {
  id: string;
  name: string;
  description?: string;
  draft?: boolean;
  enabled?: boolean;
  archived?: boolean;
  schedule_type?: string;
  first_entry?: string;
  last_entry?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  variants: Array<{ name: string; percentage: number; first_step_id: string | null }>;
  steps: Record<string, unknown>;
  total_steps: number;
  entry_type?: string;
  entry_segment_name?: string;
  trigger_event_name?: string;
  exception_events?: string[];
  conversion_events?: Array<{ name: string; window_seconds?: number; type?: string }>;
  entry_filters?: Array<{ type: string; property?: string; value?: string; comparator?: string }>;
  entries_last_30d?: number;
  entries_last_60d?: number;
  sends_last_30d?: number;
  last_activity_at?: string;
}

interface CampaignListItem {
  id: string;
  name: string;
  is_api_campaign?: boolean;
  last_sent?: string;
  tags?: string[];
}

interface ProcessedCampaign {
  id: string;
  name: string;
  channel?: string;
  subject?: string;
  preheader?: string;
  status: string;
  sent_date?: string;
  opens: number;
  clicks: number;
  deliveries: number;
  open_rate: number | null;
  click_rate: number | null;
  unsubs: number;
  segment?: string;
  tags?: string[];
  raw_details?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await validateAuth(req);
    if (!authResult.success) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const { clientId, platformId, restEndpoint } = await req.json();

    if (!clientId || !platformId) {
      throw new Error('clientId and platformId are required');
    }

    const accessResult = await validateClientAccess(authResult.userClient!, clientId);
    if (!accessResult.success) {
      return authErrorResponse(accessResult.error!, accessResult.status!, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: platform, error: platformError } = await supabase
      .from('client_platforms')
      .select('*')
      .eq('id', platformId)
      .single();

    if (platformError || !platform) {
      throw new Error('Platform connection not found');
    }

    if (platform.platform !== 'braze') {
      throw new Error('This endpoint only supports Braze');
    }

    const apiKey = platform.api_key;
    if (!apiKey) {
      throw new Error('No API key configured for this platform');
    }

    const brazeRestEndpoint = restEndpoint || 
      (platform.additional_config as Record<string, unknown>)?.rest_endpoint || 
      'https://rest.iad-01.braze.com';

    console.log('Starting Braze sync for client:', clientId);

    // === Create sync run entry ===
    const syncStart = Date.now();
    const { data: syncRun } = await supabase
      .from('braze_sync_runs')
      .insert({ client_id: clientId, platform_id: platformId, status: 'running' })
      .select('id')
      .single();
    const syncRunId = syncRun?.id as string | undefined;

    // === PHASE 1: Fetch ALL canvas IDs with names (lightweight) ===
    console.log('Phase 1: Fetching all canvas IDs...');
    const allCanvasList: CanvasListItem[] = [];
    const seenIds = new Set<string>();
    let canvasPage = 0;

    while (canvasPage < 50) {
      try {
        const canvasesData = await brazeFetch(
          `canvas/list?page=${canvasPage}&include_archived=false&limit=100`,
          apiKey,
          brazeRestEndpoint
        );
        const canvases = canvasesData.canvases || [];
        console.log(`Canvas page ${canvasPage}: ${canvases.length} items`);

        if (canvases.length === 0) break;

        for (const c of canvases) {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            allCanvasList.push(c);
          }
        }

        canvasPage++;
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        logger.error(`Failed to fetch canvas page ${canvasPage}:`, err);
        break;
      }
    }

    console.log(`Total canvases found: ${allCanvasList.length}`);

    // === PHASE 2: Score and prioritize canvases ===
    console.log('Phase 2: Scoring canvases by lifecycle priority...');
    const scoredCanvases = allCanvasList
      .filter(c => !c.draft && !c.archived)
      .map(c => ({
        canvas: c,
        priority: getCanvasPriority(c.name),
      }))
      .sort((a, b) => b.priority - a.priority);

    // Log top scoring canvases for debugging
    console.log('Top 20 priority canvases:', scoredCanvases.slice(0, 20).map(s => `${s.priority}: ${s.canvas.name}`));

    const canvasesToProcess = scoredCanvases.slice(0, MAX_CANVASES_TO_PROCESS).map(s => s.canvas);
    console.log(`Will process top ${canvasesToProcess.length} canvases`);

    // === PHASE 3: Process canvases in small batches with immediate checkpointing ===
    console.log('Phase 3: Processing canvas details in batches of 3...');
    const nowIso = new Date().toISOString();
    let processedCount = 0;
    let enabledCount = 0;

    // Build template map first (limited to 30 templates for memory)
    const templateHtmlMap = new Map<string, { subject: string; preheader: string; html: string }>();
    try {
      const templatesData = await brazeFetch('templates/email/list?limit=30', apiKey, brazeRestEndpoint);
      const templateList = templatesData.templates || [];
      
      for (let i = 0; i < Math.min(templateList.length, 30); i += BATCH_SIZE) {
        const batch = templateList.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(async (t: { email_template_id: string }) => {
          try {
            const details = await brazeFetch(`templates/email/info?email_template_id=${t.email_template_id}`, apiKey, brazeRestEndpoint);
            const htmlContent = truncateHtml(details.body);
            if (htmlContent) {
              templateHtmlMap.set(t.email_template_id, {
                subject: details.subject || '',
                preheader: details.preheader || '',
                html: htmlContent,
              });
            }
          } catch { /* skip */ }
        }));
        await new Promise(r => setTimeout(r, 50));
      }
      console.log(`Loaded ${templateHtmlMap.size} templates for enrichment`);
    } catch (e) {
      console.warn('Failed to load templates:', e);
    }

    // Process canvases in batches
    for (let i = 0; i < canvasesToProcess.length; i += BATCH_SIZE) {
      const batch = canvasesToProcess.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(canvasesToProcess.length / BATCH_SIZE)}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (c): Promise<ProcessedCanvas | null> => {
          const variants: ProcessedCanvas['variants'] = [];
          const steps: Record<string, unknown> = {};

          const enabledFromList = isTruthy(c.enabled ?? c.is_active ?? c.active ?? (c.status === 'active'));
          let enabled = enabledFromList;

          let firstEntryIso = toIso(c.last_entry);
          let lastEntryIso = toIso(c.last_entry);

          let entryType: string | undefined;
          let entrySegmentName: string | undefined;
          let triggerEventName: string | undefined;
          let exceptionEvents: string[] = [];
          let conversionEvents: ProcessedCanvas['conversion_events'] = [];
          let entryFilters: ProcessedCanvas['entry_filters'] = [];

          // Activity metrics
          let entries_last_30d = 0;
          let entries_last_60d = 0;
          let sends_last_30d = 0;
          let last_activity_at: string | undefined;

          try {
            // Fetch canvas details
            const details = await brazeFetch(`canvas/details?canvas_id=${c.id}`, apiKey, brazeRestEndpoint);

            enabled = isTruthy(
              details.enabled ?? details.canvas?.enabled ?? details.is_active ?? details.active ?? enabledFromList
            );

            firstEntryIso = toIso(details.first_entry ?? details.first_entry_at) ?? firstEntryIso;
            lastEntryIso = toIso(details.last_entry ?? details.last_entry_at) ?? lastEntryIso;

            // Entry type
            entryType = details.schedule_type || details.entry_schedule?.type;

            // Trigger event name
            if (details.entry_schedule?.trigger_event_name) {
              triggerEventName = details.entry_schedule.trigger_event_name;
            } else if (details.trigger_events?.length > 0) {
              triggerEventName = details.trigger_events
                .map((t: unknown) => (typeof t === 'string' ? t : (t as Record<string, string>).name || (t as Record<string, string>).event_name))
                .join(', ');
            } else if (details.entry_rules?.trigger?.custom_event?.custom_event_name) {
              triggerEventName = details.entry_rules.trigger.custom_event.custom_event_name;
            }

            // Segment name
            entrySegmentName = details.entry_audience_name || details.entry_segment?.name || details.entry_schedule?.segment?.name;

            // Exception events
            if (details.exception_events?.length > 0) {
              exceptionEvents = details.exception_events.map((e: unknown) =>
                (typeof e === 'string' ? e : (e as Record<string, string>).name || (e as Record<string, string>).custom_event_name || 'Exception')
              );
            }

            // Conversion events
            if (details.conversion_behaviors?.length > 0) {
              conversionEvents = details.conversion_behaviors.map((cv: Record<string, unknown>) => ({
                name: (cv.type as string) || 'Conversion',
                window_seconds: cv.window_conversion_production_seconds as number,
                type: cv.type as string,
              }));
            }

            // Entry filters
            if (details.entry_audience_filters?.length > 0) {
              entryFilters = details.entry_audience_filters.map((f: Record<string, unknown>) => ({
                type: (f.type as string) || 'filter',
                property: f.property as string,
                value: f.value?.toString(),
                comparator: f.comparator as string,
              }));
            }

            // Parse variants
            if (details.variants?.length > 0) {
              for (const v of details.variants) {
                variants.push({
                  name: v.name || 'Variant',
                  percentage: v.percentage || 100,
                  first_step_id: v.first_step_id || null,
                });
              }
            }

            // Parse steps (skip HTML to save memory - store template IDs)
            if (details.steps?.length > 0) {
              for (const s of details.steps) {
                if (!s.id) continue;

                const messages: Array<Record<string, unknown>> = [];
                if (s.messages && typeof s.messages === 'object') {
                  const entries = Array.isArray(s.messages)
                    ? (s.messages as unknown[]).map((m, idx) => [`message_${idx}`, m])
                    : Object.entries(s.messages);

                  for (const [msgKey, msgData] of entries) {
                    const msg = msgData as Record<string, unknown>;
                    const inferredChannel = typeof msgKey === 'string' ? msgKey : undefined;
                    const channel = (msg.channel as string) || inferredChannel || (s.channels?.[0] as string) || 'email';

                    const templateId = msg.email_template_id || msg.template_id;
                    let subject = msg.subject as string | undefined;
                    let preheader = msg.preheader as string | undefined;
                    let html: string | undefined;

                    if (channel === 'email' && templateId && templateHtmlMap.has(templateId as string)) {
                      const tpl = templateHtmlMap.get(templateId as string)!;
                      html = tpl.html;
                      subject = subject || tpl.subject;
                      preheader = preheader || tpl.preheader;
                    } else if (channel === 'email') {
                      html = truncateHtml((msg.body as string) || (msg.html_body as string));
                    }

                    messages.push({
                      channel,
                      subject,
                      preheader,
                      title: msg.title || msg.header,
                      body: msg.message || msg.alert || msg.body || msg.plaintext_body,
                      html_content: html,
                      image_url: msg.image_url || msg.big_image,
                      buttons: msg.buttons,
                    });
                  }
                }

                const nextPaths: Array<{ name: string; next_step_id: string; percentage?: number }> = [];
                if (s.next_paths?.length > 0) {
                  for (const p of s.next_paths) {
                    nextPaths.push({
                      name: p.name || 'Path',
                      next_step_id: p.next_step_id || '',
                      percentage: p.percentage,
                    });
                  }
                }

                const nextStepIds = Array.isArray(s.next_step_ids) && s.next_step_ids.length > 0
                  ? s.next_step_ids
                  : nextPaths.map(p => p.next_step_id).filter(Boolean);

                steps[s.id] = {
                  id: s.id,
                  name: s.name || s.type || 'Step',
                  type: s.type || 'message',
                  channel: s.channels?.[0] || messages[0]?.channel,
                  delay_seconds: s.delay?.value,
                  delay_formatted: s.delay ? formatDelay(s.delay.value) : undefined,
                  next_step_ids: nextStepIds,
                  next_paths: nextPaths.length > 0 ? nextPaths : undefined,
                  messages: messages.length > 0 ? messages : undefined,
                };
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch details for canvas ${c.id}:`, err);
          }

          // Fetch activity data if canvas is enabled
          if (enabled) {
            try {
              const now = new Date();
              const end = now.toISOString().split('T')[0];
              const start60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

              const analyticsData = await brazeFetch(
                `canvas/data_series?canvas_id=${c.id}&length=60&ending_at=${end}T00:00:00Z`,
                apiKey,
                brazeRestEndpoint
              );

              if (analyticsData.data?.length > 0) {
                const dataSeries = analyticsData.data as Array<{ time: string; total_stats?: { entries?: number }; entries?: number }>;
                
                for (let j = 0; j < dataSeries.length; j++) {
                  const day = dataSeries[j];
                  const entries = day.total_stats?.entries ?? day.entries ?? 0;
                  entries_last_60d += entries;
                  if (j < 30) entries_last_30d += entries;
                  
                  if (entries > 0 && !last_activity_at) {
                    last_activity_at = day.time;
                  }
                }

                // Estimate sends from the data
                sends_last_30d = Math.floor(entries_last_30d * 0.9); // Rough estimate
              }
            } catch (err) {
              console.warn(`Failed to fetch analytics for canvas ${c.id}:`, err);
            }
          }

          return {
            id: c.id,
            name: c.name,
            description: c.description,
            draft: c.draft,
            enabled,
            archived: c.archived,
            schedule_type: entryType,
            first_entry: firstEntryIso,
            last_entry: lastEntryIso,
            tags: c.tags,
            created_at: c.created_at,
            updated_at: c.updated_at,
            variants,
            steps,
            total_steps: Object.keys(steps).length,
            entry_type: entryType,
            entry_segment_name: entrySegmentName,
            trigger_event_name: triggerEventName,
            exception_events: exceptionEvents.length > 0 ? exceptionEvents : undefined,
            conversion_events: conversionEvents && conversionEvents.length > 0 ? conversionEvents : undefined,
            entry_filters: entryFilters && entryFilters.length > 0 ? entryFilters : undefined,
            entries_last_30d,
            entries_last_60d,
            sends_last_30d,
            last_activity_at,
          };
        })
      );

      // Immediately upsert this batch to the database (checkpointing)
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const c = result.value;
          const row = {
            client_id: clientId,
            braze_canvas_id: c.id,
            name: c.name,
            description: c.description || null,
            draft: c.draft ?? false,
            enabled: c.enabled ?? false,
            archived: c.archived ?? false,
            schedule_type: c.schedule_type || null,
            entry_type: c.entry_type || null,
            trigger_event_name: c.trigger_event_name || null,
            entry_segment_name: c.entry_segment_name || null,
            tags: c.tags || [],
            first_entry: c.first_entry || null,
            last_entry: c.last_entry || null,
            created_in_braze: c.created_at || null,
            updated_in_braze: c.updated_at || null,
            total_steps: c.total_steps || 0,
            raw_variants: c.variants || [],
            raw_steps: c.steps || {},
            conversion_events: c.conversion_events || [],
            entry_filters: c.entry_filters || [],
            exception_events: c.exception_events || [],
            entries_last_30d: c.entries_last_30d || 0,
            entries_last_60d: c.entries_last_60d || 0,
            sends_last_30d: c.sends_last_30d || 0,
            last_activity_at: c.last_activity_at || null,
            synced_at: nowIso,
          };

          const { error: upsertErr } = await supabase
            .from('braze_canvases')
            .upsert(row, { onConflict: 'client_id,braze_canvas_id' });

          if (upsertErr) {
            console.warn(`Canvas upsert failed for ${c.id}:`, upsertErr.message);
          } else {
            processedCount++;
            if (c.enabled) enabledCount++;
          }
        }
      }

      // Release memory between batches
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Processed ${processedCount} canvases, ${enabledCount} enabled`);

    // === PHASE 4: Fetch and process campaigns ===
    console.log('Phase 4: Fetching all campaign IDs...');
    const allCampaignList: CampaignListItem[] = [];
    const seenCampaignIds = new Set<string>();
    let campaignPage = 0;

    while (campaignPage < 50) {
      try {
        const campaignsData = await brazeFetch(
          `campaigns/list?page=${campaignPage}&include_archived=false&sort_direction=desc`,
          apiKey,
          brazeRestEndpoint
        );
        const campaigns = campaignsData.campaigns || [];
        console.log(`Campaign page ${campaignPage}: ${campaigns.length} items`);

        if (campaigns.length === 0) break;

        for (const c of campaigns) {
          if (!seenCampaignIds.has(c.id)) {
            seenCampaignIds.add(c.id);
            allCampaignList.push(c);
          }
        }

        campaignPage++;
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        logger.error(`Failed to fetch campaign page ${campaignPage}:`, err);
        break;
      }
    }

    console.log(`Total campaigns found: ${allCampaignList.length}`);

    const campaignsToProcess = allCampaignList.slice(0, MAX_CAMPAIGNS_TO_PROCESS);
    console.log(`Will process ${campaignsToProcess.length} campaigns`);

    console.log('Phase 4b: Processing campaign details in batches of 3...');
    let campaignsProcessedCount = 0;
    let campaignsEnabledCount = 0;

    for (let i = 0; i < campaignsToProcess.length; i += BATCH_SIZE) {
      const batch = campaignsToProcess.slice(i, i + BATCH_SIZE);
      console.log(`Processing campaign batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(campaignsToProcess.length / BATCH_SIZE)}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (c): Promise<ProcessedCampaign | null> => {
          let channel: string | undefined;
          let subject: string | undefined;
          let preheader: string | undefined;
          let status = 'draft';
          let sentDate: string | undefined;
          let segment: string | undefined;
          let tags = c.tags || [];
          let rawDetails: Record<string, unknown> = {};

          // Fetch campaign details
          try {
            const details = await brazeFetch(
              `campaigns/details?campaign_id=${c.id}`,
              apiKey,
              brazeRestEndpoint
            );

            rawDetails = {
              description: details.description,
              schedule_type: details.schedule_type,
              channels: details.channels,
              first_sent: details.first_sent,
              last_sent: details.last_sent,
              is_api_campaign: details.is_api_campaign ?? c.is_api_campaign,
            };

            // Determine channel from details
            if (details.channels && Array.isArray(details.channels) && details.channels.length > 0) {
              channel = details.channels[0];
            } else if (details.channel) {
              channel = details.channel;
            } else if (details.messages) {
              // Try to infer channel from messages object keys
              const msgKeys = Object.keys(details.messages);
              if (msgKeys.length > 0) {
                const firstMsg = details.messages[msgKeys[0]];
                channel = firstMsg?.channel || msgKeys[0];
              }
            }

            // Extract subject/preheader from email messages if available
            if (details.messages && typeof details.messages === 'object') {
              const msgEntries = Object.values(details.messages) as Array<Record<string, unknown>>;
              for (const msg of msgEntries) {
                if (msg.subject) { subject = msg.subject as string; break; }
              }
              for (const msg of msgEntries) {
                if (msg.preheader) { preheader = msg.preheader as string; break; }
              }
            }

            // Determine status
            const lastSent = details.last_sent || c.last_sent;
            if (lastSent) {
              status = 'sent';
              sentDate = toIso(lastSent);
            } else if (details.schedule_type) {
              status = 'scheduled';
            } else {
              status = 'draft';
            }

            // Extract segment
            segment = details.segment?.name || details.segment_name || undefined;

            // Update tags from details if available
            if (details.tags && Array.isArray(details.tags)) {
              tags = details.tags;
            }
          } catch (err) {
            console.warn(`Failed to fetch details for campaign ${c.id}:`, err);
            // Still determine status from list data
            if (c.last_sent) {
              status = 'sent';
              sentDate = toIso(c.last_sent);
            }
          }

          // Fetch analytics for sent/scheduled campaigns
          let opens = 0;
          let clicks = 0;
          let deliveries = 0;
          let unsubs = 0;

          if (status === 'sent' || status === 'scheduled') {
            try {
              const analyticsData = await brazeFetch(
                `campaigns/data_series?campaign_id=${c.id}&length=60`,
                apiKey,
                brazeRestEndpoint
              );

              if (analyticsData.data?.length > 0) {
                const dataSeries = analyticsData.data as Array<Record<string, unknown>>;

                for (const day of dataSeries) {
                  opens += (day.unique_opens as number) || 0;
                  clicks += (day.unique_clicks as number) || 0;
                  deliveries += (day.deliveries as number) || (day.sent as number) || 0;
                  unsubs += (day.unsubscribes as number) || 0;
                }
              }
            } catch (err) {
              console.warn(`Failed to fetch analytics for campaign ${c.id}:`, err);
            }
          }

          // Compute rates
          const open_rate = deliveries > 0 ? Math.round((opens / deliveries) * 10000) / 10000 : null;
          const click_rate = deliveries > 0 ? Math.round((clicks / deliveries) * 10000) / 10000 : null;

          return {
            id: c.id,
            name: c.name,
            channel,
            subject,
            preheader,
            status,
            sent_date: sentDate,
            opens,
            clicks,
            deliveries,
            open_rate,
            click_rate,
            unsubs,
            segment,
            tags,
            raw_details: rawDetails,
          };
        })
      );

      // Immediately upsert this batch to the database (checkpointing)
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const c = result.value;
          const row = {
            client_id: clientId,
            braze_campaign_id: c.id,
            name: c.name,
            channel: c.channel || null,
            subject: c.subject || null,
            preheader: c.preheader || null,
            status: c.status,
            sent_date: c.sent_date || null,
            opens: c.opens,
            clicks: c.clicks,
            deliveries: c.deliveries,
            open_rate: c.open_rate,
            click_rate: c.click_rate,
            unsubs: c.unsubs,
            segment: c.segment || null,
            tags: c.tags || [],
            raw_details: c.raw_details || {},
            synced_at: nowIso,
          };

          const { error: upsertErr } = await supabase
            .from('braze_campaigns')
            .upsert(row, { onConflict: 'client_id,braze_campaign_id' });

          if (upsertErr) {
            console.warn(`Campaign upsert failed for ${c.id}:`, upsertErr.message);
          } else {
            campaignsProcessedCount++;
            if (c.status === 'sent' || c.status === 'scheduled') campaignsEnabledCount++;
          }
        }
      }

      // Release memory between batches
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Processed ${campaignsProcessedCount} campaigns, ${campaignsEnabledCount} enabled/sent`);

    // === Update schema_cache with summary (no full canvas data) ===
    const schemaCache = {
      cache_version: 8,
      saved_at: nowIso,
      rest_endpoint: brazeRestEndpoint,
      canvases_count: processedCount,
      canvases_enabled_count: enabledCount,
      campaigns_count: campaignsProcessedCount,
      campaigns_enabled_count: campaignsEnabledCount,
      last_sync: nowIso,
      // Intentionally NOT storing full canvas/campaign data here - it's in dedicated tables
    };

    await supabase
      .from('client_platforms')
      .update({
        schema_cache: schemaCache,
        last_sync_at: nowIso,
        additional_config: { rest_endpoint: brazeRestEndpoint },
      })
      .eq('id', platformId);

    // === Mark sync run complete ===
    const syncDuration = Date.now() - syncStart;
    if (syncRunId) {
      await supabase.from('braze_sync_runs').update({
        status: 'success',
        completed_at: nowIso,
        duration_ms: syncDuration,
        canvases_synced: processedCount,
        campaigns_synced: campaignsProcessedCount,
      }).eq('id', syncRunId);
    }

    console.log(`Braze sync complete in ${syncDuration}ms: ${processedCount} canvases, ${enabledCount} enabled, ${campaignsProcessedCount} campaigns`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sync_run_id: syncRunId,
          saved_at: nowIso,
          duration_ms: syncDuration,
          counts: {
            canvases_found: allCanvasList.length,
            canvases_processed: processedCount,
            canvases_enabled: enabledCount,
            campaigns_found: allCampaignList.length,
            campaigns_processed: campaignsProcessedCount,
            campaigns_enabled: campaignsEnabledCount,
          },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    logger.error('Error syncing Braze:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
