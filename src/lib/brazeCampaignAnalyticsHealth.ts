import { supabase } from '@/integrations/supabase/client';

/** Roll up bounces / unsubscribes from campaign analytics CSV for the last 30 calendar days. */
export async function sumBouncesUnsubsLast30dFromCampaignAnalytics(clientId: string): Promise<{
  bounces: number;
  unsubs: number;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('braze_campaign_analytics')
    .select('bounces,unsubscribes')
    .eq('client_id', clientId)
    .gte('date', cutoffStr);
  if (error) throw error;
  let bounces = 0;
  let unsubs = 0;
  for (const raw of data ?? []) {
    const r = raw as { bounces?: number | null; unsubscribes?: number | null };
    bounces += Number(r.bounces) || 0;
    unsubs += Number(r.unsubscribes) || 0;
  }
  return { bounces, unsubs };
}
