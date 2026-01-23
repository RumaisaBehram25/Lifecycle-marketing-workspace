import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Client, ClientPlatform, PlatformType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const LINKTREE_SLUG = 'linktree';
const LINKTREE_NAME = 'Linktree';

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
        return existing as Client;
      }
      
      // Create Linktree client if it doesn't exist
      const { data: created, error: createError } = await supabase
        .from('clients')
        .insert({
          name: LINKTREE_NAME,
          slug: LINKTREE_SLUG,
          website_url: 'https://linktr.ee',
          industry: 'Technology',
          is_active: true,
          brand_voice: 'Friendly, empowering, and inclusive. We celebrate self-expression and help creators share everything they are with a single link.',
        })
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
