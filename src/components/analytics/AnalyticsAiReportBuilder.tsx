import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Copy, LayoutDashboard, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  dashboardSurfaceCard,
  dashboardTopAccentClass,
  dashSectionTitleBorder,
  dashboardSectionHeadingClass,
  dashSubtitleRule,
} from '@/lib/dashboard-surface';

const SUGGESTIONS = [
  'Summarize campaign performance this month',
  'Which segments are largest?',
  'What touchpoints ran in April?',
  'Compare this month vs last month',
  'Draft a marketing performance report',
];

type LoadingPhase = 'idle' | 'reading' | 'thinking' | 'writing';

const PHASE_LABEL: Record<Exclude<LoadingPhase, 'idle'>, string> = {
  reading: 'Reading your data…',
  thinking: 'Thinking…',
  writing: 'Writing report…',
};

type Props = {
  clientId: string | undefined;
};

/** Parse `{ error }` from Edge Function HTTP response body — invoke often only exposes a generic non-2xx message. */
async function readEdgeFunctionErrorPayload(invokeError: unknown): Promise<string> {
  const ctx =
    invokeError && typeof invokeError === 'object' && 'context' in invokeError
      ? (invokeError as { context?: unknown }).context
      : undefined;
  if (!ctx || !(typeof Response !== 'undefined' && ctx instanceof Response)) {
    return '';
  }
  try {
    const text = await ctx.clone().text();
    if (!text.trim()) return '';
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      if (typeof j.error === 'string' && j.error.trim()) return j.error.trim();
      if (typeof j.message === 'string' && j.message.trim()) return j.message.trim();
    } catch {
      return text.trim().slice(0, 500);
    }
  } catch {
    /* ignore */
  }
  return '';
}

function httpStatusFromInvokeError(invokeError: unknown): number | undefined {
  const ctx =
    invokeError && typeof invokeError === 'object' && 'context' in invokeError
      ? (invokeError as { context?: unknown }).context
      : undefined;
  if (ctx && typeof Response !== 'undefined' && ctx instanceof Response) {
    return ctx.status;
  }
  return undefined;
}

/** Supabase `invoke` often sets a generic message on non-2xx; prefer JSON `{ error }` from the response body. */
async function describeAiReportInvokeFailure(
  invokeError: unknown,
  data: { error?: string } | null,
): Promise<string> {
  const fromPayload =
    data && typeof data === 'object' && typeof data.error === 'string' && data.error.trim()
      ? data.error.trim()
      : '';
  if (fromPayload) return fromPayload;

  const fromBody = await readEdgeFunctionErrorPayload(invokeError);
  if (fromBody) return fromBody;

  const status = httpStatusFromInvokeError(invokeError);

  if (invokeError instanceof Error) {
    const m = invokeError.message?.trim() ?? '';
    if (m && !/Edge Function returned a non-2xx/i.test(m)) return m;
    if (m && status != null) {
      return `${m} (HTTP ${status}). For Anthropic errors check the message above; for access errors verify your workspace mapping. Edge logs: Supabase Dashboard → Edge Functions → ai-analytics-report → Logs.`;
    }
    if (m) return m;
  }

  return 'The AI report edge function failed or returned an error. Deploy supabase/functions/ai-analytics-report and set the ANTHROPIC_API_KEY secret for this project (Dashboard → Edge Functions → Secrets).';
}

export function AnalyticsAiReportBuilder({ clientId }: Props) {
  const [prompt, setPrompt] = useState('');
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [posting, setPosting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (loadingPhase === 'idle') return;
    if (loadingPhase === 'reading') {
      const t = window.setTimeout(() => setLoadingPhase('thinking'), 2800);
      return () => window.clearTimeout(t);
    }
    if (loadingPhase === 'thinking') {
      const t = window.setTimeout(() => setLoadingPhase('writing'), 3200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [loadingPhase]);

  const runReport = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!clientId || !trimmed) {
      toast({
        title: 'Add a prompt',
        description: 'Describe what you want to analyze.',
        variant: 'destructive',
      });
      return;
    }
    setReportMd(null);
    setLoadingPhase('reading');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast({ title: 'Sign in required', variant: 'destructive' });
        setLoadingPhase('idle');
        return;
      }

      const { data, error } = await supabase.functions.invoke<{
        report_markdown?: string;
        error?: string;
      }>('ai-analytics-report', {
        body: { client_id: clientId, prompt: trimmed },
        headers: { Authorization: `Bearer ${token}` },
      });

      const payloadErr =
        data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error;
      if (error || payloadErr) {
        const msg = await describeAiReportInvokeFailure(error, data ?? null);
        throw new Error(msg);
      }

      const md = typeof data?.report_markdown === 'string' ? data.report_markdown : '';
      setReportMd(md || '_No content returned._');
    } catch (e: unknown) {
      toast({
        title: 'AI report failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      setReportMd(null);
    } finally {
      setLoadingPhase('idle');
    }
  }, [clientId, prompt, toast]);

  const copyMarkdown = useCallback(async () => {
    if (!reportMd) return;
    try {
      await navigator.clipboard.writeText(reportMd);
      toast({ title: 'Copied', description: 'Report markdown copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  }, [reportMd, toast]);

  const postToDashboard = useCallback(async () => {
    if (!clientId || !reportMd || !prompt.trim()) return;
    setPosting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      let postedBy = userData.user?.email ?? '';
      if (uid) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', uid)
          .maybeSingle();
        type P = { email?: string | null; full_name?: string | null };
        const p = profile as P | null;
        postedBy =
          (typeof p?.email === 'string' && p.email.trim()) ||
          postedBy ||
          (typeof p?.full_name === 'string' && p.full_name.trim()) ||
          'user';
      }

      const { error } = await supabase.from('dashboard_ai_reports').insert({
        client_id: clientId,
        prompt: prompt.trim(),
        report_markdown: reportMd,
        posted_by: postedBy || null,
      });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['dashboard-ai-reports', clientId] });
      toast({
        title: 'Posted to Dashboard',
        description: 'Your report appears under AI Reports on the main Dashboard.',
      });
    } catch (e: unknown) {
      toast({
        title: 'Could not save report',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPosting(false);
    }
  }, [clientId, prompt, reportMd, queryClient, toast]);

  if (!clientId) return null;

  return (
    <Card className={cn(dashboardSurfaceCard, 'shadow-md overflow-hidden')}>
      <div className={dashboardTopAccentClass} aria-hidden />
      <CardHeader
        className={cn(
          'pb-4 pt-7 sm:pt-8 px-4 sm:px-6 lg:px-8',
          'bg-gradient-to-r from-primary/[0.07] via-card to-transparent',
          dashSectionTitleBorder,
        )}
      >
        <div className="flex gap-3 sm:gap-4">
          <span
            className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm"
            aria-hidden
          >
            <Sparkles className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
          </span>
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <CardTitle
              className={cn(
                dashboardSectionHeadingClass,
                'text-2xl sm:text-3xl font-bold tracking-tight leading-tight',
              )}
            >
              AI Reports
            </CardTitle>
            <p className={cn('text-sm text-muted-foreground leading-relaxed max-w-2xl', dashSubtitleRule)}>
              Ask about synced Braze data, segments, KPIs, and workspace context. Answers use what is in your database—no
              filler metrics. If data is not synced yet, the assistant says so clearly.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="border-t border-border/40 bg-gradient-to-b from-muted/25 via-muted/10 to-background pb-8 pt-6 sm:pt-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full flex-col gap-8">
          {/* Composer */}
          <section aria-labelledby="ai-report-prompt-label" className="space-y-4">
            <div
              className={cn(
                'rounded-2xl border border-border/60 bg-card/90 p-4 sm:p-6',
                'shadow-sm shadow-primary/[0.04] ring-1 ring-inset ring-primary/[0.06]',
              )}
            >
              <div className="space-y-3">
                <div>
                  <label
                    id="ai-report-prompt-label"
                    htmlFor="ai-report-prompt"
                    className="text-sm font-medium text-foreground"
                  >
                    Fill in your question
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the full box—include channels, date ranges, and any campaign, canvas, or segment names you care
                    about. More detail usually means a sharper report.
                  </p>
                </div>
                <Textarea
                  id="ai-report-prompt"
                  placeholder="Write your full question here… e.g. Compare email vs SMS performance last month; list top 5 campaigns by revenue and note any segments over 100k users."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className={cn(
                    'w-full min-h-[200px] sm:min-h-[260px] resize-y rounded-xl border-border/60 bg-background/90 text-sm leading-relaxed',
                    'placeholder:text-muted-foreground/70',
                    'focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/30',
                  )}
                  disabled={loadingPhase !== 'idle'}
                  aria-label="Fill in your question for the AI report"
                />
              </div>

              <div className="mt-5 border-t border-border/50 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Try asking</p>
                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={loadingPhase !== 'idle'}
                      className={cn(
                        'rounded-lg border border-primary/12 bg-primary/[0.04] px-3 py-2.5 text-left text-xs leading-snug',
                        'text-muted-foreground transition-colors',
                        'hover:border-primary/25 hover:bg-primary/[0.08] hover:text-foreground',
                        'disabled:pointer-events-none disabled:opacity-50',
                      )}
                      onClick={() => setPrompt(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  size="lg"
                  className="w-full rounded-xl sm:w-auto sm:min-w-[220px]"
                  onClick={() => void runReport()}
                  disabled={loadingPhase !== 'idle'}
                >
                  {loadingPhase !== 'idle' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {PHASE_LABEL[loadingPhase === 'reading' ? 'reading' : loadingPhase === 'thinking' ? 'thinking' : 'writing']}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate report
                    </>
                  )}
                </Button>
                {loadingPhase !== 'idle' ? (
                  <p className="text-center text-xs text-muted-foreground sm:text-right">
                    <span className="animate-pulse">{PHASE_LABEL[loadingPhase]}</span>
                  </p>
                ) : (
                  <p className="text-center text-[11px] text-muted-foreground sm:text-right">
                    Typical run: a few seconds · uses Claude with your workspace snapshot
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Output */}
          {reportMd != null && (
            <section aria-labelledby="ai-report-output-title" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3
                  id="ai-report-output-title"
                  className="flex items-center gap-2 text-sm font-semibold text-foreground"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="h-4 w-4" aria-hidden />
                  </span>
                  Generated report
                </h3>
              </div>
              <div
                className={cn(
                  'rounded-2xl border border-border/60 bg-card p-4 sm:p-6',
                  'shadow-sm ring-1 ring-inset ring-border/30',
                  'border-l-[3px] border-l-primary/55',
                )}
              >
                <div
                  className={cn(
                    'prose prose-sm dark:prose-invert max-w-none',
                    'prose-headings:scroll-mt-20 prose-table:text-sm prose-p:leading-relaxed',
                  )}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportMd}</ReactMarkdown>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border/50 pt-4">
                  <Button type="button" variant="default" size="sm" onClick={() => void postToDashboard()} disabled={posting}>
                    {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LayoutDashboard className="h-4 w-4 mr-2" />}
                    Post to Dashboard
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyMarkdown()}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy markdown
                  </Button>
                </div>
              </div>
            </section>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
