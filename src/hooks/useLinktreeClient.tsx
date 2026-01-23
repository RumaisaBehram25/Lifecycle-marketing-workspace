import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform, PlatformType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const LINKTREE_SLUG = 'linktree';
const LINKTREE_NAME = 'Linktree';

// Linktree brand defaults based on website research
const LINKTREE_BRAND_DEFAULTS = {
  name: LINKTREE_NAME,
  slug: LINKTREE_SLUG,
  website_url: 'https://linktr.ee',
  industry: 'Technology / Creator Economy',
  is_active: true,
  tagline: 'A link in bio built for you',
  primary_color: '#43E660',
  secondary_color: '#254F1A',
  brand_voice: `Friendly, empowering, and inclusive. We help 70M+ creators share everything they are with a single link. Our tone is approachable and encouraging—we celebrate self-expression and make complex things feel simple. We speak directly to creators, influencers, small businesses, and anyone building their online presence.`,
  value_propositions: JSON.stringify([
    'One link to share everything you create, curate, and sell',
    'Trusted by 70M+ creators, influencers, and businesses',
    'The original and most popular link in bio tool since 2016',
    'Customize every detail to match your brand',
    'Powerful analytics to understand your audience',
    'Monetization features to sell products and collect payments',
  ]),
  differentiators: JSON.stringify([
    'Invented the link-in-bio category in 2016',
    'Used by celebrities like Selena Gomez, Tony Hawk, and major brands like HBO',
    'Trusted URL that audiences recognize and feel safe clicking',
    'Works seamlessly across Instagram, TikTok, Twitter, YouTube',
    'QR codes for offline-to-online traffic',
  ]),
  target_audience: JSON.stringify([
    { segment: 'Creators & Influencers', description: 'YouTubers, TikTokers, streamers, vloggers building their personal brand' },
    { segment: 'Small Businesses', description: 'Entrepreneurs, ecommerce sellers, and retailers monetizing online' },
    { segment: 'Musicians & Artists', description: 'Bands, DJs, fashion designers sharing their work' },
    { segment: 'Fitness & Wellness', description: 'Coaches, health educators, and wellness leaders' },
    { segment: 'Enterprise & Media', description: 'Brands like HBO, Comedy Central using Linktree at scale' },
  ]),
  key_messaging_pillars: JSON.stringify([
    'Simplicity - Never compromise or remove links; share everything in one place',
    'Self-expression - Reflect your personality and brand in seconds',
    'Monetization - Turn followers into revenue with seamless selling',
    'Analytics - Understand what converts your audience',
    'Trust - The original, most recognized link in bio tool',
  ]),
  do_rules: JSON.stringify([
    'Speak directly to creators with "you" language',
    'Celebrate self-expression and individuality',
    'Keep messaging simple, friendly, and encouraging',
    'Highlight ease of use and time savings',
    'Use social proof (70M+ users, celebrity examples)',
    'Emphasize monetization possibilities',
  ]),
  dont_rules: JSON.stringify([
    'Avoid corporate jargon or overly formal language',
    'Don\'t be condescending about tech skills',
    'Never make creators feel limited by the platform',
    'Avoid comparing negatively to competitors',
    'Don\'t use complex technical terms without explanation',
  ]),
  tone_presets: JSON.stringify([
    'Friendly & Approachable',
    'Empowering & Encouraging',
    'Simple & Direct',
    'Celebratory',
    'Inclusive',
  ]),
};

// Hook to get or create the single Linktree client
export function useLinktreeClient() {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: ['linktree-client'],
    queryFn: async () => {
      // Try to get existing Linktree client
      const { data: existing, error: fetchError } = await supabase
        .from('clients')
        .select('*')
        .eq('slug', LINKTREE_SLUG)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      if (existing) {
        // Update with brand defaults if brand voice is missing or basic
        if (!existing.value_propositions || !existing.target_audience) {
          const { data: updated } = await supabase
            .from('clients')
            .update(LINKTREE_BRAND_DEFAULTS)
            .eq('id', existing.id)
            .select()
            .single();
          return (updated || existing) as Client;
        }
        return existing as Client;
      }
      
      // Create Linktree client if it doesn't exist
      const { data: created, error: createError } = await supabase
        .from('clients')
        .insert(LINKTREE_BRAND_DEFAULTS)
        .select()
        .single();
      
      if (createError) throw createError;
      return created as Client;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useLinktreePlatforms() {
  const { data: client } = useLinktreeClient();
  
  return useQuery({
    queryKey: ['linktree-platforms', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('client_platforms')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data as ClientPlatform[];
    },
    enabled: !!client?.id,
  });
}

export function useUpdateLinktreeClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: client } = useLinktreeClient();
  
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
      queryClient.invalidateQueries({ queryKey: ['linktree-client'] });
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
  const { data: client } = useLinktreeClient();
  
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
      queryClient.invalidateQueries({ queryKey: ['linktree-platforms'] });
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
  const { data: client } = useLinktreeClient();
  
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
      queryClient.invalidateQueries({ queryKey: ['linktree-platforms'] });
      toast({ title: 'Platform disconnected' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
