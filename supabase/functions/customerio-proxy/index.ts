import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Config ──────────────────────────────────────────────────────────────
const CIO_BASE = () => Deno.env.get('CUSTOMERIO_BASE_URL') || 'https://api.customer.io';
const CIO_KEY = () => {
  const k = Deno.env.get('CUSTOMERIO_API_KEY');
  if (!k) throw { status: 500, hint: 'CUSTOMERIO_API_KEY not configured on server.' };
  return k;
};

const cioHeaders = () => ({
  Authorization: `Bearer ${CIO_KEY()}`,
  'Content-Type': 'application/json',
});

function errResponse(status: number, endpoint: string, hint: string, bodySnippet = '') {
  return new Response(
    JSON.stringify({ ok: false, status, endpoint, hint, bodySnippet }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

function okResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function cioFetch(path: string) {
  const url = `${CIO_BASE()}${path}`;
  const res = await fetch(url, { headers: cioHeaders() });
  if (!res.ok) {
    const body = await res.text();
    const hint =
      res.status === 401
        ? '401 Unauthorized. Verify CUSTOMERIO_BASE_URL region, App API Key validity, and scopes. Ensure you are not using Track API keys.'
        : `Customer.io returned ${res.status}`;
    throw { status: res.status, endpoint: path, hint, bodySnippet: body.slice(0, 300) };
  }
  return res.json();
}

// ── Route handlers ──────────────────────────────────────────────────────

async function handleHealth() {
  await cioFetch('/v1/campaigns?page=1&page_size=1');
  return okResponse({ ok: true });
}

async function handleCampaignsList() {
  const items: any[] = [];
  let page = 1;
  const pageSize = 50;
  let hasMore = true;

  while (hasMore && page <= 20) {
    const data = await cioFetch(`/v1/campaigns?page=${page}&page_size=${pageSize}`);
    const campaigns = data.campaigns || [];
    for (const c of campaigns) {
      const messageIds: string[] = [];
      if (Array.isArray(c.actions)) {
        for (const a of c.actions) {
          if (a.id) messageIds.push(String(a.id));
        }
      }
      items.push({
        type: 'campaign',
        id: c.id,
        name: c.name,
        status: c.state || null,
        updated_at: c.updated ? new Date(c.updated * 1000).toISOString() : null,
        message_ids: messageIds,
      });
    }
    hasMore = campaigns.length === pageSize;
    page++;
  }
  return okResponse({ ok: true, items });
}

async function handleNewslettersList() {
  const items: any[] = [];
  let page = 1;
  const pageSize = 50;
  let hasMore = true;

  while (hasMore && page <= 20) {
    const data = await cioFetch(`/v1/newsletters?page=${page}&page_size=${pageSize}`);
    const newsletters = data.newsletters || [];
    for (const n of newsletters) {
      const variantIds: string[] = [];
      if (Array.isArray(n.actions)) {
        for (const a of n.actions) {
          if (a.id) variantIds.push(String(a.id));
        }
      }
      if (n.content && Array.isArray(n.content.variants)) {
        for (const v of n.content.variants) {
          if (v.id && !variantIds.includes(String(v.id))) {
            variantIds.push(String(v.id));
          }
        }
      }
      items.push({
        type: 'newsletter',
        id: n.id,
        name: n.name,
        status: n.state || null,
        updated_at: n.updated ? new Date(n.updated * 1000).toISOString() : null,
        variant_ids: variantIds,
      });
    }
    hasMore = newsletters.length === pageSize;
    page++;
  }
  return okResponse({ ok: true, items });
}

async function handleCampaignCreative(campaignId: string, actionId: string) {
  const action = await cioFetch(`/v1/campaigns/${campaignId}/actions/${actionId}`);
  let subject = action.subject || '';
  let htmlBody = action.body || '';
  let textBody = '';

  try {
    const msgData = await cioFetch(`/v1/campaigns/${campaignId}/actions/${actionId}/language/en`);
    if (msgData.body) htmlBody = msgData.body;
    if (msgData.subject) subject = msgData.subject;
    if (msgData.body_plain || msgData.body_text) textBody = msgData.body_plain || msgData.body_text;
  } catch {
    // use what we already have
  }

  return okResponse({
    ok: true,
    creative: { type: 'campaign', campaign_id: campaignId, message_id: actionId, subject, html_body: htmlBody, text_body: textBody },
  });
}

async function handleNewsletterCreative(newsletterId: string, variantId: string) {
  const variant = await cioFetch(`/v1/newsletters/${newsletterId}/actions/${variantId}`);
  let subject = variant.subject || '';
  let htmlBody = variant.body || '';
  let textBody = variant.body_plain || variant.body_text || '';

  try {
    const langData = await cioFetch(`/v1/newsletters/${newsletterId}/actions/${variantId}/language/en`);
    if (langData.body) htmlBody = langData.body;
    if (langData.subject) subject = langData.subject;
    if (langData.body_plain || langData.body_text) textBody = langData.body_plain || langData.body_text;
  } catch {
    // keep what we have
  }

  return okResponse({
    ok: true,
    creative: { type: 'newsletter', newsletter_id: newsletterId, variant_id: variantId, subject, html_body: htmlBody, text_body: textBody },
  });
}

// ── Main ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept POST with { path: "/campaigns" } in body
    let subPath = '/health';
    if (req.method === 'POST') {
      const body = await req.json();
      subPath = body.path || '/health';
    }

    if (subPath === '/health' || subPath === '') {
      return await handleHealth();
    }
    if (subPath === '/campaigns') {
      return await handleCampaignsList();
    }
    if (subPath === '/newsletters') {
      return await handleNewslettersList();
    }

    const cm = subPath.match(/^\/campaigns\/(\d+)\/messages\/(\d+)\/creative$/);
    if (cm) return await handleCampaignCreative(cm[1], cm[2]);

    const nm = subPath.match(/^\/newsletters\/(\d+)\/variants\/(\d+)\/creative$/);
    if (nm) return await handleNewsletterCreative(nm[1], nm[2]);

    return errResponse(404, subPath, 'Unknown route');
  } catch (err: any) {
    if (err.status && err.hint) {
      return errResponse(err.status, err.endpoint || '', err.hint, err.bodySnippet || '');
    }
    console.error('Proxy error:', err);
    return errResponse(500, '', err.message || 'Internal error');
  }
});
