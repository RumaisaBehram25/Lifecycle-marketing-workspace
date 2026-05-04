import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronRight, FileText, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  dashboardSurfaceCard,
  dashboardTopAccentClass,
  dashSectionTitleBorder,
  dashboardSectionHeadingClass,
  dashSubtitleRule,
} from '@/lib/dashboard-surface';

function titleFromMarkdown(md: string): string {
  const line = md.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const stripped = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
  return stripped.slice(0, 120) || 'AI report';
}

type Row = {
  id: string;
  prompt: string;
  report_markdown: string;
  created_at: string;
  posted_by: string | null;
};

export function DashboardAiReportsSection({ clientId }: { clientId: string | undefined }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['dashboard-ai-reports', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('dashboard_ai_reports')
        .select('id, prompt, report_markdown, created_at, posted_by')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  const sorted = useMemo(() => rows, [rows]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dashboard_ai_reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-ai-reports', clientId] });
      setOpenId((cur) => (cur === deletedId ? null : cur));
      setPendingDelete(null);
      toast({ title: 'Report removed' });
    },
    onError: (e: unknown) => {
      toast({
        title: 'Could not remove report',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    },
  });

  if (!clientId) return null;

  return (
    <Card className={cn(dashboardSurfaceCard, 'shadow-md')}>
      <div className={dashboardTopAccentClass} aria-hidden />
      <CardHeader className={cn('pb-3 pt-6', dashSectionTitleBorder)}>
        <CardTitle
          className={cn(
            dashboardSectionHeadingClass,
            'flex items-center gap-2 text-2xl sm:text-3xl font-bold tracking-tight',
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          AI Reports
        </CardTitle>
        <p className={cn('text-xs text-muted-foreground mt-1.5', dashSubtitleRule)}>
          Reports generated from Analytics and saved here.
        </p>
      </CardHeader>
      <CardContent className="pt-5 sm:pt-6 pb-6 space-y-2 px-4 sm:px-8 bg-muted/10">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading reports…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 rounded-lg border border-dashed border-border/60 px-4">
            No saved reports yet. Open Analytics → AI Reports, generate an answer, then use &quot;Post to Dashboard&quot;.
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((r) => {
              const expanded = openId === r.id;
              const removingThis = deleteMutation.isPending && pendingDelete?.id === r.id;
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-border/60 bg-card/90 overflow-hidden"
                >
                  <div className="flex items-start gap-2 p-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-expanded={expanded}
                      onClick={() => setOpenId(expanded ? null : r.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug line-clamp-2">{titleFromMarkdown(r.report_markdown)}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {format(new Date(r.created_at), 'MMM d, yyyy · p')}
                        {r.posted_by ? ` · ${r.posted_by}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove report"
                      disabled={deleteMutation.isPending}
                      onClick={() => setPendingDelete(r)}
                    >
                      {removingThis ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <X className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                  {expanded ? (
                    <div className="border-t border-border/50 bg-muted/15 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Prompt</p>
                      <p className="text-xs text-muted-foreground mb-4 whitespace-pre-wrap">{r.prompt}</p>
                      <div
                        className={cn(
                          'prose prose-sm dark:prose-invert max-w-none',
                          'prose-table:text-sm',
                        )}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.report_markdown}</ReactMarkdown>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this report?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved report from the dashboard. You can generate it again from Analytics → AI Reports whenever you need.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
