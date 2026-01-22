import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle, XCircle, Loader2, CalendarClock, FileText, FilePlus, FileEdit } from 'lucide-react';

interface SyncLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  total_documents: number;
  new_documents: number;
  updated_documents: number;
  failed_documents: number;
  platforms_processed: {
    platform: string;
    name: string;
    urls_found: number;
    new_docs: number;
    updated_docs: number;
    failed: number;
  }[];
  error_message: string | null;
}

export function SyncStatus() {
  const { data: syncLogs, isLoading } = useQuery({
    queryKey: ['knowledge-sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as unknown as SyncLog[];
    },
    refetchInterval: 5000, // Poll for updates when sync is running
  });

  const latestSync = syncLogs?.[0];
  const nextSync = getNextSyncDate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <CalendarClock className="h-5 w-5 text-primary" />
          Sync Schedule & Status
        </CardTitle>
        <CardDescription>
          Documentation auto-refreshes weekly on Sundays at 3 AM UTC
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Schedule Info */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Next Scheduled Sync</p>
              <p className="text-xs text-muted-foreground">
                {nextSync.toLocaleDateString()} at {nextSync.toLocaleTimeString()}
              </p>
            </div>
          </div>
          {latestSync && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              {latestSync.status === 'running' ? (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              ) : latestSync.status === 'completed' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <div>
                <p className="text-sm font-medium">Last Sync</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(latestSync.started_at).toLocaleDateString()} - {' '}
                  <span className={
                    latestSync.status === 'completed' ? 'text-green-600' :
                    latestSync.status === 'failed' ? 'text-destructive' : 'text-primary'
                  }>
                    {latestSync.status}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Latest Sync Results */}
        {latestSync && latestSync.status !== 'running' && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Latest Sync Results</h4>
            
            {latestSync.status === 'failed' && latestSync.error_message && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                Error: {latestSync.error_message}
              </div>
            )}

            {latestSync.status === 'completed' && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex items-center gap-2 p-2 rounded bg-green-500/10">
                    <FilePlus className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-lg font-bold text-green-600">{latestSync.new_documents}</p>
                      <p className="text-xs text-muted-foreground">New</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-blue-500/10">
                    <FileEdit className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-lg font-bold text-blue-600">{latestSync.updated_documents}</p>
                      <p className="text-xs text-muted-foreground">Updated</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-bold">{latestSync.total_documents}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                  </div>
                </div>

                {/* Platform Breakdown */}
                {latestSync.platforms_processed && latestSync.platforms_processed.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      By Platform
                    </h5>
                    <div className="grid gap-2">
                      {latestSync.platforms_processed.map((p) => (
                        <div
                          key={p.platform}
                          className="flex items-center justify-between p-2 rounded border text-sm"
                        >
                          <span className="font-medium">{p.name}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-muted-foreground">{p.urls_found} pages</span>
                            {p.new_docs > 0 && (
                              <Badge variant="outline" className="text-green-600">+{p.new_docs} new</Badge>
                            )}
                            {p.updated_docs > 0 && (
                              <Badge variant="outline" className="text-blue-600">{p.updated_docs} updated</Badge>
                            )}
                            {p.failed > 0 && (
                              <Badge variant="destructive">{p.failed} failed</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Running Status */}
        {latestSync?.status === 'running' && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <div>
              <p className="font-medium text-primary">Sync in progress...</p>
              <p className="text-sm text-muted-foreground">
                Started {new Date(latestSync.started_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}

        {!latestSync && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No sync history yet. Click "Refresh All Docs" to start the first sync.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function getNextSyncDate(): Date {
  const now = new Date();
  const nextSunday = new Date(now);
  
  // Find next Sunday
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  
  // Set to 3 AM UTC
  nextSunday.setUTCHours(3, 0, 0, 0);
  
  // If we're past 3 AM UTC on a Sunday, go to next week
  if (now.getDay() === 0 && now.getUTCHours() >= 3) {
    nextSunday.setDate(nextSunday.getDate() + 7);
  }
  
  return nextSunday;
}
