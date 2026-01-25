import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Calendar, FileText } from 'lucide-react';
import { format, isAfter, parseISO } from 'date-fns';

type BriefStatus = 'draft' | 'in_review' | 'approved' | 'in_progress' | 'complete';

const STATUS_CONFIG: Record<BriefStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  in_review: { label: 'In Review', variant: 'outline' },
  approved: { label: 'Approved', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'default' },
  complete: { label: 'Complete', variant: 'secondary' },
};

export function UpcomingBriefs() {
  const { data: briefs, isLoading } = useQuery({
    queryKey: ['upcoming-briefs'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('briefs')
        .select('*')
        .gte('deadline', today)
        .neq('status', 'complete')
        .order('deadline', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Upcoming Briefs</CardTitle>
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
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Upcoming Briefs</CardTitle>
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
              const status = (brief.status as BriefStatus) || 'draft';
              const config = STATUS_CONFIG[status];
              return (
                <div key={brief.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{brief.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {brief.deadline ? format(parseISO(brief.deadline), 'MMM d, yyyy') : 'No deadline'}
                      </span>
                    </div>
                  </div>
                  <Badge variant={config.variant} className="text-xs">
                    {config.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming briefs</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link to="/briefs">Create Brief</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
