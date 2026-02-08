import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform, PlatformType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const DOUBLEGOOD_SLUG = 'doublegood';
const DOUBLEGOOD_NAME = 'Double Good';

// DoubleGood brand defaults based on website research
const DOUBLEGOOD_BRAND_DEFAULTS = {
  name: DOUBLEGOOD_NAME,
  slug: DOUBLEGOOD_SLUG,
  website_url: 'https://www.doublegood.com',
  industry: 'Fundraising / Food & Beverage',
  is_active: true,
  tagline: 'Fundraising has never been easier',
  primary_color: '#FFB800',
  secondary_color: '#1A1A1A',
  brand_voice: `Warm, encouraging, and community-focused. We make fundraising simple and fun for youth sports teams, schools, and nonprofits. Our tone celebrates team success, empowers organizers, and keeps the focus on the positive impact of every Pop-Up Store. We speak directly to coaches, parents, teachers, and anyone passionate about supporting their community.`,
  value_propositions: JSON.stringify([
    'Keep 50% of every sale — the highest fundraising profit share',
    'Virtual Pop-Up Stores make selling easy from anywhere',
    'Premium gourmet popcorn that people actually want to buy',
    'No upfront costs, no inventory to manage',
    'Four-day fundraisers that maximize urgency and results',
    'Free shipping directly to supporters',
  ]),
  differentiators: JSON.stringify([
    'Highest profit margin in fundraising (50% to your group)',
    'Virtual model eliminates door-to-door selling hassles',
    'Gourmet popcorn product loved by customers',
    'Simple app-based setup takes minutes',
    'Dedicated support for organizers',
  ]),
  target_audience: JSON.stringify([
    { segment: 'Youth Sports Teams', description: 'Baseball, softball, soccer, basketball teams raising funds for equipment and travel' },
    { segment: 'Schools & PTAs', description: 'Elementary, middle, and high schools funding programs and activities' },
    { segment: 'Nonprofits', description: 'Community organizations and charities looking for easy fundraising' },
    { segment: 'Dance & Cheer Teams', description: 'Competition teams funding uniforms, travel, and entry fees' },
    { segment: 'Scouts & Clubs', description: 'Boy Scouts, Girl Scouts, and other youth organizations' },
  ]),
  key_messaging_pillars: JSON.stringify([
    'Simplicity - Set up a fundraiser in minutes with our easy app',
    'Profit - Keep 50% of every sale for your group',
    'Quality - Gourmet popcorn people love to buy and eat',
    'Community - Celebrate every team success story',
    'Support - We\'re here to help you hit your goals',
  ]),
  do_rules: JSON.stringify([
    'Lead with the 50% profit message',
    'Celebrate team wins and success stories',
    'Keep language warm, friendly, and encouraging',
    'Emphasize simplicity and ease of use',
    'Use "your group" and "your team" language',
    'Highlight that there\'s no risk or upfront cost',
  ]),
  dont_rules: JSON.stringify([
    'Avoid pressure tactics or aggressive sales language',
    'Don\'t focus on the negatives of traditional fundraising',
    'Never make organizers feel overwhelmed',
    'Avoid corporate jargon — keep it friendly',
    'Don\'t understate the quality of the popcorn product',
  ]),
  tone_presets: JSON.stringify([
    'Warm & Encouraging',
    'Celebratory',
    'Supportive',
    'Community-focused',
    'Simple & Direct',
  ]),
};

// Hook to get or create the single DoubleGood client
export function useDoubleGoodClient() {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['doublegood-client'],
    queryFn: async () => {
      // Try to get existing DoubleGood client
      const { data: existing, error: fetchError } = await supabase
        .from('clients')
        .select('*')
        .eq('slug', DOUBLEGOOD_SLUG)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      if (existing) {
        // Update with brand defaults if brand voice is missing
        if (!existing.value_propositions || !existing.target_audience) {
          const { data: updated } = await supabase
            .from('clients')
            .update(DOUBLEGOOD_BRAND_DEFAULTS)
            .eq('id', existing.id)
            .select()
            .single();
          return (updated || existing) as Client;
        }
        return existing as Client;
      }
      
      // Create DoubleGood client if it doesn't exist
      const { data: created, error: createError } = await supabase
        .from('clients')
        .insert(DOUBLEGOOD_BRAND_DEFAULTS)
        .select()
        .single();
      
      if (createError) throw createError;
      return created as Client;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useDoubleGoodPlatforms() {
  const { data: client } = useDoubleGoodClient();
  
  return useQuery({
    queryKey: ['doublegood-platforms', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      // Use the public view which excludes sensitive API credentials
      const { data, error } = await supabase
        .from('client_platforms_public')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data as ClientPlatform[];
    },
    enabled: !!client?.id,
  });
}

export function useUpdateDoubleGoodClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: client } = useDoubleGoodClient();
  
  return useMutation({
    mutationFn: async (updates: Partial<Client>) => {
      if (!client?.id) throw new Error('Client not found');
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', client.id)
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doublegood-client'] });
      toast({ title: 'Brand updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useConnectPlatform() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: client } = useDoubleGoodClient();
  
  return useMutation({
    mutationFn: async ({ platform, apiKey, apiSecret }: { platform: PlatformType; apiKey: string; apiSecret?: string }) => {
      if (!client?.id) throw new Error('Client not found');
      const { data, error } = await supabase
        .from('client_platforms')
        .insert({
          client_id: client.id,
          platform,
          api_key_encrypted: apiKey,
          api_secret_encrypted: apiSecret || null,
          is_connected: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ClientPlatform;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
      toast({ title: 'Platform connected' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDisconnectPlatform() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: client } = useDoubleGoodClient();
  
  return useMutation({
    mutationFn: async (platform: PlatformType) => {
      if (!client?.id) throw new Error('Client not found');
      const { error } = await supabase
        .from('client_platforms')
        .delete()
        .eq('client_id', client.id)
        .eq('platform', platform);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
      toast({ title: 'Platform disconnected' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
