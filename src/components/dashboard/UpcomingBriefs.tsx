import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveClientRow } from '@/hooks/useDoubleGoodClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Calendar, FileText, Clock, Zap, Workflow } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { BriefDetailModal } from '@/components/briefs/BriefDetailModal';

type BriefStatus = 'to_brief' | 'pending_copy' | 'pending_design' | 'design_review' | 'in_development' | 'qa_ready' | 'live' | 'draft' | 'in_review' | 'approved' | 'in_progress' | 'complete';
type Channel = 'email' | 'push' | 'inapp';

interface DashboardBrief {
  id: string;
  name: string;
  content_type: 'campaign' | 'lifecycle';
  channels: Channel[];
  status: string;
  deadline: string | null;
  about: string | null;
  created_at: string;
  conversation_id: string | null;
  ai_generated_copy?: any;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; progress: number }> = {
  to_brief: { label: 'To Brief', color: 'bg-muted text-muted-foreground', progress: 0 },
  pending_copy: { label: 'Pending Copy', color: 'bg-amber-500/20 text-amber-600', progress: 15 },
  pending_design: { label: 'Pending Design', color: 'bg-orange-500/20 text-orange-600', progress: 30 },
  design_review: { label: 'In Design Review', color: 'bg-blue-500/20 text-blue-600', progress: 50 },
  in_development: { label: 'In Development', color: 'bg-purple-500/20 text-purple-600', progress: 70 },
  qa_ready: { label: 'QA Ready', color: 'bg-cyan-500/20 text-cyan-600', progress: 85 },
  live: { label: 'Live', color: 'bg-green-500/20 text-green-600', progress: 100 },
  // Legacy status mappings
  draft: { label: 'To Brief', color: 'bg-muted text-muted-foreground', progress: 0 },
  in_review: { label: 'In Design Review', color: 'bg-blue-500/20 text-blue-600', progress: 50 },
  approved: { label: 'In Development', color: 'bg-purple-500/20 text-purple-600', progress: 70 },
  in_progress: { label: 'In Development', color: 'bg-purple-500/20 text-purple-600', progress: 70 },
  complete: { label: 'Live', color: 'bg-green-500/20 text-green-600', progress: 100 },
};

export function UpcomingBriefs() {
  const { data: client } = useActiveClientRow();
  const [selectedBrief, setSelectedBrief] = useState<DashboardBrief | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const { data: briefs, isLoading, refetch } = useQuery({
    queryKey: ['in-progress-briefs', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('briefs')
        .select('*')
        .eq('client_id', client.id)
        .not('status', 'in', '("complete","live")')
        .order('deadline', { ascending: true, nullsFirst: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as DashboardBrief[];
    },
    enabled: !!client?.id,
  });

  const handleBriefClick = (brief: DashboardBrief) => {
    setSelectedBrief(brief);
    setDetailModalOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">In Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">In Progress</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/briefs">
              View All
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {briefs && briefs.length > 0 ? (
            <div className="space-y-3">
              {briefs.map((brief) => {
                const status = brief.status || 'draft';
                const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
                return (
                  <div 
                    key={brief.id} 
                    className="flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleBriefClick(brief)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        brief.content_type === 'campaign' ? 'bg-blue-500/10' : 'bg-purple-500/10'
                      }`}>
                        {brief.content_type === 'campaign' ? (
                          <Zap className="h-5 w-5 text-blue-500" />
                        ) : (
                          <Workflow className="h-5 w-5 text-purple-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{brief.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {brief.deadline && (
                            <>
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(brief.deadline), 'MMM d, yyyy')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge className={`text-xs ${config.color}`}>
                        {config.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={config.progress} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground w-8">{config.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No briefs in progress</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link to="/briefs">Create Brief</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brief Detail Modal */}
      {client?.id && (
        <BriefDetailModal
          brief={selectedBrief as any}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          clientId={client.id}
          onUpdate={() => refetch()}
        />
      )}
    </>
  );
}
