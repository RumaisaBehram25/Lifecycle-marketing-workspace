import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Users,
  Sparkles,
  Check,
  X,
  Search,
  Star,
} from 'lucide-react';

interface Segment {
  id: string;
  name: string;
  tags?: string[];
  is_starred?: boolean;
}

interface SegmentDescription {
  segment_id: string;
  description: string;
}

// Generate AI description based on segment name
function generateAiDescription(name: string): string {
  const lower = name.toLowerCase();
  
  if (lower.includes('marketing') && lower.includes('audience')) {
    return 'Core marketing audience eligible for promotional campaigns and product updates.';
  }
  if (lower.includes('transactional')) {
    return 'Users receiving transactional communications related to account activity.';
  }
  if (lower.includes('abandon') || lower.includes('cart')) {
    return 'Users who started checkout but didn\'t complete their purchase.';
  }
  if (lower.includes('music') || lower.includes('linker')) {
    return 'Creators in the music vertical using Linktree for their audience.';
  }
  if (lower.includes('earn')) {
    return 'Users eligible for or engaged with monetization features.';
  }
  if (lower.includes('pro') || lower.includes('upgrade')) {
    return 'Segment targeted for premium tier conversion messaging.';
  }
  if (lower.includes('active') || lower.includes('engaged')) {
    return 'Highly engaged users with regular platform activity.';
  }
  if (lower.includes('lapsed') || lower.includes('inactive') || lower.includes('reactivation')) {
    return 'Users who haven\'t engaged recently, targeted for win-back.';
  }
  if (lower.includes('free')) {
    return 'Users on free tier, potential candidates for upgrade campaigns.';
  }
  if (lower.includes('workspace') || lower.includes('owner')) {
    return 'Workspace administrators with team management capabilities.';
  }
  if (lower.includes('test')) {
    return 'Internal testing segment for QA and validation.';
  }
  if (lower.includes('education') || lower.includes('student')) {
    return 'Users in the education vertical or with student status.';
  }
  if (lower.includes('fitness') || lower.includes('health')) {
    return 'Creators in the fitness and wellness vertical.';
  }
  if (lower.includes('podcast')) {
    return 'Podcasters using Linktree to connect with their audience.';
  }
  
  return 'Audience segment for targeted lifecycle communications.';
}

export function AudienceTab() {
  const { data: client } = useLinktreeClient();
  const { data: platforms } = useLinktreePlatforms();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  
  // Local state for descriptions (could be persisted to DB later)
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});

  const brazePlatform = platforms?.find(p => p.platform === 'braze' && p.is_connected);
  const brazeSegments = (brazePlatform?.schema_cache as any)?.segments || [];

  // Fetch visibility data to filter to starred segments only
  const { data: visibilityData, isLoading: visibilityLoading } = useQuery({
    queryKey: ['data-visibility-starred-segments', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('data_visibility')
        .select('*')
        .eq('client_id', client.id)
        .eq('item_type', 'segment_starred')
        .eq('is_visible', true);
      if (error) throw error;
      return data as Array<{ item_id: string; is_visible: boolean }>;
    },
    enabled: !!client?.id,
  });

  // Get starred segment IDs from the segment_starred visibility records
  const starredSegmentIds = new Set(visibilityData?.map(v => v.item_id) || []);

  // Filter to only starred segments
  const starredSegments: Segment[] = brazeSegments.filter((s: Segment) => 
    starredSegmentIds.has(s.id)
  );

  // Filter by search
  const filteredSegments = starredSegments.filter(seg =>
    seg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (descriptions[seg.id] || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Initialize descriptions with AI-generated ones
  useEffect(() => {
    const newDescriptions: Record<string, string> = {};
    starredSegments.forEach(seg => {
      if (!descriptions[seg.id]) {
        newDescriptions[seg.id] = generateAiDescription(seg.name);
      }
    });
    if (Object.keys(newDescriptions).length > 0) {
      setDescriptions(prev => ({ ...prev, ...newDescriptions }));
    }
  }, [starredSegments.length]);

  const handleEditStart = (segmentId: string) => {
    setEditingId(segmentId);
    setEditValue(descriptions[segmentId] || generateAiDescription(
      starredSegments.find(s => s.id === segmentId)?.name || ''
    ));
  };

  const handleEditSave = (segmentId: string) => {
    setDescriptions(prev => ({ ...prev, [segmentId]: editValue }));
    setEditingId(null);
    setEditValue('');
    toast({ title: 'Description updated' });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleRegenerateDescription = async (segmentId: string, name: string) => {
    setGeneratingFor(segmentId);
    // Simulate AI generation (could call edge function in future)
    await new Promise(resolve => setTimeout(resolve, 800));
    const newDescription = generateAiDescription(name);
    setDescriptions(prev => ({ ...prev, [segmentId]: newDescription }));
    setGeneratingFor(null);
    toast({ title: 'Description regenerated' });
  };

  if (visibilityLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (starredSegments.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-semibold mb-2">No starred segments</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Go to Settings → Data Visibility to star segments you want to use for campaign targeting.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search segments..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Segment Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSegments.map(segment => (
          <Card key={segment.id} className="hover:border-primary/30 transition-colors">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm line-clamp-2" title={segment.name}>
                    {segment.name}
                  </h3>
                  {segment.tags && segment.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {segment.tags.slice(0, 2).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Description - Editable */}
              {editingId === segment.id ? (
                <div className="space-y-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Describe this segment..."
                    className="text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditSave(segment.id);
                      if (e.key === 'Escape') handleEditCancel();
                    }}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditSave(segment.id)}>
                      <Check className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleEditCancel}>
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="group">
                  <p 
                    className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleEditStart(segment.id)}
                    title="Click to edit"
                  >
                    {descriptions[segment.id] || generateAiDescription(segment.name)}
                  </p>
                  <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 text-xs"
                      onClick={() => handleEditStart(segment.id)}
                    >
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 text-xs"
                      onClick={() => handleRegenerateDescription(segment.id, segment.name)}
                      disabled={generatingFor === segment.id}
                    >
                      {generatingFor === segment.id ? (
                        <LoadingSpinner size="sm" className="mr-1" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredSegments.length === 0 && searchQuery && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No segments match "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
}
