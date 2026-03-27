import { useState, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Building2, 
  Palette, 
  Users, 
  Target, 
  Cpu,
  Upload,
  Swords,
  Check,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResolvedClientId } from '@/hooks/useDoubleGoodClient';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  brazeSyncPartialDescription,
  formatBrazeSyncInvokeError,
} from '@/lib/brazeSyncInvoke';
import { useToast } from '@/components/ui/use-toast';

const DEFAULT_BRAZE_REST = 'https://rest.iad-01.braze.com';

interface OnboardingData {
  companyName: string;
  industry: string;
  website: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  brandVoice: string;
  toneKeywords: string;
  primaryAudience: string;
  audienceAge: string;
  audienceInterests: string;
  primaryGoal: string;
  currentChannels: string[];
  monthlyEmailVolume: string;
  // Tech Stack
  techTools: string[];
  apiKeys: Record<string, string>;
  brazeRestEndpoint: string;
  // Competitors
  competitors: string[];
  competitorInput: string;
  // Brand Resources
  uploadedFiles: string[];
}

const SECTIONS = [
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'brand', label: 'Brand Identity', icon: Palette },
  { id: 'audience', label: 'Audience & Goals', icon: Users },
  { id: 'tech', label: 'Tech Stack', icon: Cpu },
  { id: 'competitors', label: 'Competitors', icon: Swords },
  { id: 'resources', label: 'Brand Resources', icon: Upload },
  { id: 'analytics', label: 'Upload Analytics CSVs', icon: FileSpreadsheet },
];

const TECH_TOOLS = [
  'Braze', 'Klaviyo', 'Iterable', 'Customer.io', 'HubSpot',
  'Salesforce', 'Segment', 'Amplitude', 'Mixpanel', 'Snowflake',
  'Looker', 'Google Analytics', 'Figma', 'Webflow', 'Shopify',
];

const INITIAL_DATA: OnboardingData = {
  companyName: '', industry: '', website: '', tagline: '',
  primaryColor: '#3b82f6', secondaryColor: '#8b5cf6',
  brandVoice: '', toneKeywords: '',
  primaryAudience: '', audienceAge: '', audienceInterests: '',
  primaryGoal: '', currentChannels: [], monthlyEmailVolume: '',
  techTools: [], apiKeys: {},
  brazeRestEndpoint: '',
  competitors: [], competitorInput: '',
  uploadedFiles: [],
};

const BUCKET = 'analytics-csvs';

type FileProgressItem = {
  file: File;
  status: 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
};

function formatError(error: unknown): string {
  let msg: string;
  if (error == null) msg = 'Unknown error';
  else if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string')
    msg = (error as { message: string }).message;
  else if (typeof error === 'string') msg = error;
  else {
    try {
      msg = JSON.stringify(error) || 'Unknown error';
    } catch {
      msg = 'Unknown error';
    }
  }
  // Network / config: unrelated to profiles.is_approved or RLS (those affect Postgres, not this fetch).
  if (msg.includes('Failed to send a request to the Edge Function')) {
    return `${msg} Use the Supabase anon JWT in VITE_SUPABASE_PUBLISHABLE_KEY (Dashboard → Settings → API; starts with eyJ), not sb_publishable_… keys. Deploy sync-braze to the same project and ensure *.supabase.co is reachable.`;
  }
  return msg;
}

type AnalyticsTable =
  | 'braze_campaign_analytics'
  | 'customerio_campaigns'
  | 'customerio_broadcasts'
  | 'customerio_messages'
  | 'braze_sync_runs';

type DetectedFormat = AnalyticsTable | 'braze_segment_analytics' | 'braze_usage_analytics';

/** Normalize header for matching: lowercase, spaces → underscores */
function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseCSV(text: string): { headers: string[]; rawHeaderLine: string; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rawHeaderLine: '', rows: [] };
  const rawHeaderLine = lines[0];
  const headers = rawHeaderLine.split(',').map((h) => normalizeHeader(h));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return { headers, rawHeaderLine, rows };
}

/** Return true if headers array contains every key (normalized). */
function headersContainAll(headers: string[], keys: string[]): boolean {
  const set = new Set(headers);
  return keys.every((k) => set.has(normalizeHeader(k)));
}

/** Detection: braze_campaign_analytics → campaign_id + variation_api_id; braze_computed_rates → campaign_name + delivery_rate */
function detectTableFromHeaders(headers: string[], rawHeaderLine: string): DetectedFormat | null {
  if (headersContainAll(headers, ['campaign_id', 'variation_api_id'])) return 'braze_campaign_analytics';
  if (headersContainAll(headers, ['campaign_name', 'delivery_rate'])) return 'customerio_campaigns';
  if (headersContainAll(headers, ['segment_id', 'segment_name'])) return 'braze_segment_analytics';
  if (headersContainAll(headers, ['dau', 'mau'])) return 'braze_usage_analytics';

  console.warn('[Upload Analytics CSVs] CSV did not match any table. Actual headers:', rawHeaderLine || headers);
  return null;
}

/** Hardcoded column whitelist per table. Only these columns are allowed when inserting from CSV. */
const TABLE_WHITELIST: Record<string, Set<string>> = {
  braze_campaign_analytics: new Set([
    'id', 'client_id', 'created_at', 'campaign_id', 'campaign_name',
    'variation_api_id', 'channel', 'date', 'sent', 'delivered', 'opens', 'unique_opens',
    'clicks', 'unique_clicks', 'unsubscribes', 'bounces', 'reported_spam',
    'unique_recipients', 'conversions', 'conversions_by_send_time', 'revenue',
  ]),
  customerio_campaigns: new Set([
    'id', 'client_id', 'created_at', 'campaign_name', 'date_range', 'channel',
    'total_sent', 'total_delivered', 'total_opens', 'unique_opens', 'total_clicks',
    'unique_clicks', 'bounces', 'unsubscribes', 'spam_reports', 'conversions',
    'revenue', 'delivery_rate', 'open_rate', 'unique_open_rate', 'click_rate',
    'unique_click_rate', 'click_to_open_rate', 'bounce_rate', 'unsubscribe_rate',
    'spam_rate', 'conversion_rate',
  ]),
  braze_usage_analytics: new Set([
    'id', 'client_id', 'created_at', 'date', 'sessions', 'dau', 'mau', 'new_users',
    'emails_sent', 'emails_delivered', 'emails_opened', 'email_clicks', 'email_bounces',
    'emails_reported_spam', 'push_sent', 'push_total_opens', 'push_direct_opens',
    'push_bounces', 'in_app_sent', 'in_app_impressions', 'in_app_clicks',
  ]),
  braze_segment_analytics: new Set([
    'id', 'client_id', 'created_at', 'date', 'segment_id', 'segment_name', 'size',
  ]),
};

function getTableWhitelist(table: string): Set<string> {
  const cols = TABLE_WHITELIST[table];
  if (!cols) throw new Error(`No whitelist for table: ${table}`);
  return cols;
}

/** Tables that use upsert with this onConflict (column list) to avoid duplicates. Must match DB UNIQUE constraint exactly. */
const UPSERT_ON_CONFLICT: Record<string, string> = {
  braze_campaign_analytics: 'client_id,campaign_id,date,variation_api_id',
  braze_canvases: 'campaign_id,date,variation_api_id',
  braze_segment_analytics: 'segment_id,date',
  braze_usage_analytics: 'date,client_id',
  customerio_campaigns: 'campaign_name,date_range',
};

/** Coerce a CSV string for DB: strip "%" and parse as number for numeric columns, else return trimmed string. */
function coerceValue(raw: string): string | number {
  const s = raw.trim();
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    return Number.isNaN(n) ? s : n;
  }
  return s;
}

/** Parse common date formats (M/D/YYYY, M/D/YY, YYYY-MM-DD) to ISO YYYY-MM-DD for the DB. */
function coerceDate(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/);
  if (m) {
    const month = m[1].padStart(2, '0');
    const day = m[2].padStart(2, '0');
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${month}-${day}`;
  }
  return s;
}

/** CSV column name → DB column name for tables where Braze exports use different names. */
const COLUMN_ALIASES: Record<string, Record<string, string>> = {
  braze_campaign_analytics: { conversions_by_revenue: 'conversions_by_send_time' },
};

/** Build insert rows: normalize CSV columns to lowercase + underscores, only keep keys in whitelist, add client_id. */
function buildInsertRows(
  table: string,
  whitelist: Set<string>,
  headers: string[],
  rows: Record<string, string>[],
  client_id: string
): Record<string, unknown>[] {
  const aliases = COLUMN_ALIASES[table] ?? {};
  return rows.map((row) => {
    const obj: Record<string, unknown> = { client_id };
    for (const csvKey of headers) {
      const value = row[csvKey];
      if (value === undefined || value === '') continue;
      const normalized = csvKey.toLowerCase().replace(/\s+/g, '_');
      const dbKey = aliases[normalized] ?? normalized;
      if (!whitelist.has(dbKey)) continue;
      const raw = String(value).trim();
      const finalValue = dbKey === 'date' ? coerceDate(raw) : coerceValue(value);
      obj[dbKey] = finalValue;
    }
    return obj;
  });
}

export function OnboardingTab() {
  const [activeSection, setActiveSection] = useState('company');
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [submitted, setSubmitted] = useState(false);
  const [isCompletingSetup, setIsCompletingSetup] = useState(false);
  const { isAdmin } = useAuth();
  const { clientId, isClientLoading: clientStillLoading } = useResolvedClientId();

  /** Company / brand / audience (first three sections) are admin-only; members configure Braze, Drive, CSV on their workspace. */
  const visibleSections = useMemo(
    () =>
      isAdmin
        ? SECTIONS
        : SECTIONS.filter((s) => !['company', 'brand', 'audience'].includes(s.id)),
    [isAdmin],
  );

  useEffect(() => {
    if (!visibleSections.some((s) => s.id === activeSection)) {
      setActiveSection(visibleSections[0]?.id ?? 'tech');
    }
  }, [visibleSections, activeSection]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileProgressList, setFileProgressList] = useState<FileProgressItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const updateField = (field: keyof OnboardingData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleChannel = (channel: string) => {
    setData(prev => ({
      ...prev,
      currentChannels: prev.currentChannels.includes(channel)
        ? prev.currentChannels.filter(c => c !== channel)
        : [...prev.currentChannels, channel],
    }));
  };

  const toggleTool = (tool: string) => {
    setData(prev => ({
      ...prev,
      techTools: prev.techTools.includes(tool)
        ? prev.techTools.filter(t => t !== tool)
        : [...prev.techTools, tool],
    }));
  };

  const addCompetitor = () => {
    if (data.competitorInput.trim()) {
      setData(prev => ({
        ...prev,
        competitors: [...prev.competitors, prev.competitorInput.trim()],
        competitorInput: '',
      }));
    }
  };

  const removeCompetitor = (idx: number) => {
    setData(prev => ({
      ...prev,
      competitors: prev.competitors.filter((_, i) => i !== idx),
    }));
  };

  const setFileProgress = (index: number, update: Partial<FileProgressItem>) => {
    setFileProgressList(prev => prev.map((item, i) => i === index ? { ...item, ...update } : item));
  };

  const handleAnalyticsCsvFileSelect = async (files: FileList | null) => {
    if (!files?.length) {
      toast({ title: 'No files', description: 'Please select one or more files.', variant: 'destructive' });
      return;
    }
    if (!clientId) {
      toast({ title: 'No client context', description: 'Client is required. Please ensure you are logged in with a client.', variant: 'destructive' });
      return;
    }
    const list = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.csv'));
    if (list.length === 0) {
      toast({ title: 'No CSV files', description: 'Please select one or more .csv files.', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    setFileProgressList(list.map(file => ({ file, status: 'uploading' as const })));
    if (fileInputRef.current) fileInputRef.current.value = '';

    let successCount = 0;
    const now = Date.now();
    const client_id = clientId;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const path = `${clientId}/${now + i}_${file.name}`;

      try {
        setFileProgress(i, { status: 'uploading' });
        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        setFileProgress(i, { status: 'processing' });
        const text = await file.text();
        const { headers, rawHeaderLine, rows } = parseCSV(text);
        const table = detectTableFromHeaders(headers, rawHeaderLine);
        if (!table) {
          setFileProgress(i, { status: 'error', error: 'Unknown CSV format: no matching table' });
          continue;
        }

        const whitelist = getTableWhitelist(table);
        let rowsToUse = rows;

        if (table === 'customerio_campaigns') {
          rowsToUse = rows.filter((row) => {
            const name = (row.campaign_name ?? row['campaign_name'] ?? '').trim();
            return name !== '' && !name.startsWith('---');
          });
        }

        const insertRows = buildInsertRows(table, whitelist, headers, rowsToUse, client_id);

        if (insertRows.length === 0) {
          setFileProgress(i, { status: 'error', error: 'No rows to insert after filtering' });
          continue;
        }

        const onConflict = UPSERT_ON_CONFLICT[table];
        if (onConflict) {
          const { data: upsertData, error: upsertErr } = await (supabase as any)
            .from(table)
            .upsert(insertRows, { onConflict })
            .select('id');
          if (upsertErr) {
            setFileProgress(i, { status: 'error', error: upsertErr.message ?? formatError(upsertErr) });
            continue;
          }
          const affected = Array.isArray(upsertData) ? upsertData.length : 0;
          if (affected === 0) {
            setFileProgress(i, { status: 'error', error: 'Upsert reported no rows affected' });
            continue;
          }
        } else {
          const { data: insertData, error: insertErr } = await (supabase as any)
            .from(table)
            .insert(insertRows)
            .select('id');
          if (insertErr) {
            setFileProgress(i, { status: 'error', error: insertErr.message ?? formatError(insertErr) });
            continue;
          }
          const affected = Array.isArray(insertData) ? insertData.length : 0;
          if (affected === 0) {
            setFileProgress(i, { status: 'error', error: 'Insert reported no rows affected' });
            continue;
          }
        }

        setFileProgress(i, { status: 'done' });
        successCount++;
      } catch (e: unknown) {
        setFileProgress(i, { status: 'error', error: formatError(e) });
      }
    }

    setIsUploading(false);
    toast({
      title: 'Processing complete',
      description: `${successCount} of ${list.length} files processed successfully.`,
      variant: successCount === list.length ? 'default' : 'destructive',
    });
  };

  const handleSubmit = async () => {
    setIsCompletingSetup(true);
    try {
      const brazeClientId = clientId;
      const restOpt = data.brazeRestEndpoint.trim() || undefined;

      const startBrazeSync = (platformId: string, cid: string) => {
        void (async () => {
          const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-braze', {
            body: {
              clientId: cid,
              platformId,
              restEndpoint: restOpt,
            },
          });
          if (syncError) {
            toast({
              title: 'Braze sync failed',
              description: formatBrazeSyncInvokeError(syncError),
              variant: 'destructive',
            });
            return;
          }
          queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-braze'] });
          const partialDesc = brazeSyncPartialDescription(syncData);
          toast({
            title: syncData?.partial ? 'Braze sync complete (partial)' : 'Braze sync complete',
            description: partialDesc
              ? `${partialDesc} Dashboard data has been refreshed.`
              : 'Dashboard data has been refreshed.',
          });
        })();
      };

      if (brazeClientId && data.techTools.includes('Braze')) {
        try {
          const { data: existingBraze } = await supabase
            .from('client_platforms_public')
            .select('id')
            .eq('client_id', brazeClientId)
            .eq('platform', 'braze')
            .maybeSingle();

          const platformId = existingBraze?.id ?? null;

          if (platformId) {
            toast({
              title: 'Starting Braze sync',
              description: 'This can take a minute. You can leave this page.',
            });
            startBrazeSync(platformId, brazeClientId);
          } else {
            const brazeKey = data.apiKeys.Braze?.trim();
            if (brazeKey) {
              const rest =
                data.brazeRestEndpoint.trim() || DEFAULT_BRAZE_REST;
              const { data: upserted, error: upsertErr } = await supabase
                .from('client_platforms')
                .upsert(
                  {
                    client_id: brazeClientId,
                    platform: 'braze' as const,
                    api_key: brazeKey,
                    api_secret: null,
                    is_connected: true,
                    additional_config: { rest_endpoint: rest },
                  },
                  { onConflict: 'client_id,platform' }
                )
                .select('id')
                .single();
              if (upsertErr) throw upsertErr;
              const newPlatformId = upserted?.id;
              if (newPlatformId) {
                queryClient.invalidateQueries({ queryKey: ['doublegood-platforms'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-braze'] });
                toast({
                  title: 'Braze connected',
                  description: 'Credentials saved. Sync is running in the background.',
                });
                startBrazeSync(newPlatformId, brazeClientId);
              }
            } else if (data.brazeRestEndpoint.trim()) {
              toast({
                title: 'Braze setup note',
                description: 'Add your Braze REST API key above (or connect from Platforms) to save credentials and sync.',
              });
            }
          }
        } catch (error) {
          toast({
            title: 'Braze setup incomplete',
            description: formatError(error),
            variant: 'destructive',
          });
        }
      }

      setSubmitted(true);
    } finally {
      setIsCompletingSetup(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">Onboarding Complete!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your client profile has been set up. The dashboard and resources will now be populated with your brand information.
            </p>
            <Button onClick={() => { setSubmitted(false); }} variant="outline">
              Edit Responses
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        multiple
        className="sr-only"
        aria-hidden
        onChange={e => handleAnalyticsCsvFileSelect(e.target.files)}
      />
      {/* Section Nav */}
      <div className="w-56 flex-shrink-0 space-y-1 hidden md:block">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                activeSection === section.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {section.label}
            </button>
          );
        })}
        <div className="pt-4">
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isCompletingSetup}
            className="w-full"
          >
            {isCompletingSetup ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {isCompletingSetup ? 'Saving…' : 'Complete Setup'}
          </Button>
        </div>
      </div>

      {/* Mobile section selector */}
      <div className="md:hidden w-full space-y-4">
        <div className="flex gap-2 flex-wrap">
          {visibleSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                activeSection === section.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Company Info */}
            {activeSection === 'company' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Company Information</h3>
                  <p className="text-sm text-muted-foreground">Tell us about the company.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input value={data.companyName} onChange={e => updateField('companyName', e.target.value)} placeholder="Acme Corp" />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Select value={data.industry} onValueChange={v => updateField('industry', v)}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ecommerce">E-Commerce</SelectItem>
                        <SelectItem value="saas">SaaS</SelectItem>
                        <SelectItem value="fintech">Fintech</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                        <SelectItem value="media">Media & Entertainment</SelectItem>
                        <SelectItem value="nonprofit">Non-Profit</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Website URL</Label>
                    <Input value={data.website} onChange={e => updateField('website', e.target.value)} placeholder="https://example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tagline / Positioning</Label>
                    <Input value={data.tagline} onChange={e => updateField('tagline', e.target.value)} placeholder="The best way to..." />
                  </div>
                </div>
              </>
            )}

            {/* Brand Identity */}
            {activeSection === 'brand' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Brand Identity</h3>
                  <p className="text-sm text-muted-foreground">Define the visual and verbal identity for CRM communications.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Primary Brand Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={data.primaryColor} onChange={e => updateField('primaryColor', e.target.value)} className="h-10 w-14 rounded border cursor-pointer" />
                      <Input value={data.primaryColor} onChange={e => updateField('primaryColor', e.target.value)} className="flex-1" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Secondary Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={data.secondaryColor} onChange={e => updateField('secondaryColor', e.target.value)} className="h-10 w-14 rounded border cursor-pointer" />
                      <Input value={data.secondaryColor} onChange={e => updateField('secondaryColor', e.target.value)} className="flex-1" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Brand Voice</Label>
                  <Textarea value={data.brandVoice} onChange={e => updateField('brandVoice', e.target.value)} placeholder="Describe the brand's communication style..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Tone Keywords</Label>
                  <Input value={data.toneKeywords} onChange={e => updateField('toneKeywords', e.target.value)} placeholder="e.g., Warm, Bold, Playful, Professional" />
                  <p className="text-xs text-muted-foreground">Comma-separated keywords that describe the tone</p>
                </div>
              </>
            )}

            {/* Audience & Goals */}
            {activeSection === 'audience' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Audience & Goals</h3>
                  <p className="text-sm text-muted-foreground">Who are you reaching, and what's the objective?</p>
                </div>
                <div className="space-y-2">
                  <Label>Primary Audience</Label>
                  <Textarea value={data.primaryAudience} onChange={e => updateField('primaryAudience', e.target.value)} placeholder="Describe your primary audience..." rows={3} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Age Range</Label>
                    <Select value={data.audienceAge} onValueChange={v => updateField('audienceAge', v)}>
                      <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="18-24">18–24</SelectItem>
                        <SelectItem value="25-34">25–34</SelectItem>
                        <SelectItem value="35-44">35–44</SelectItem>
                        <SelectItem value="45-54">45–54</SelectItem>
                        <SelectItem value="55+">55+</SelectItem>
                        <SelectItem value="mixed">Mixed / All Ages</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Key Interests</Label>
                    <Input value={data.audienceInterests} onChange={e => updateField('audienceInterests', e.target.value)} placeholder="e.g., Fitness, Technology, Travel" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Primary Goal</Label>
                  <Select value={data.primaryGoal} onValueChange={v => updateField('primaryGoal', v)}>
                    <SelectTrigger><SelectValue placeholder="Select primary goal" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acquisition">Customer Acquisition</SelectItem>
                      <SelectItem value="retention">Retention & Loyalty</SelectItem>
                      <SelectItem value="reactivation">Win-back / Re-engagement</SelectItem>
                      <SelectItem value="upsell">Upsell & Cross-sell</SelectItem>
                      <SelectItem value="onboarding">User Onboarding</SelectItem>
                      <SelectItem value="full-lifecycle">Full Lifecycle Optimization</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Active Channels</Label>
                  <div className="flex flex-wrap gap-2">
                    {['Email', 'Push', 'SMS', 'In-App', 'Webhooks'].map(ch => (
                      <button
                        key={ch}
                        onClick={() => toggleChannel(ch)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                          data.currentChannels.includes(ch)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:border-primary/30"
                        )}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Monthly Email Volume</Label>
                  <Select value={data.monthlyEmailVolume} onValueChange={v => updateField('monthlyEmailVolume', v)}>
                    <SelectTrigger><SelectValue placeholder="Estimated volume" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="<10k">Under 10K</SelectItem>
                      <SelectItem value="10k-50k">10K – 50K</SelectItem>
                      <SelectItem value="50k-250k">50K – 250K</SelectItem>
                      <SelectItem value="250k-1m">250K – 1M</SelectItem>
                      <SelectItem value="1m+">1M+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Tech Stack */}
            {activeSection === 'tech' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Tech Stack</h3>
                  <p className="text-sm text-muted-foreground">Select all tools the client uses. You can add API keys for connected integrations.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TECH_TOOLS.map(tool => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={cn(
                        "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                        data.techTools.includes(tool)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/30"
                      )}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
                {data.techTools.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <p className="text-sm font-medium">API Keys (optional)</p>
                    {data.techTools.map(tool => (
                      <div key={tool} className="flex items-center gap-3">
                        <Label className="w-28 text-sm flex-shrink-0">{tool}</Label>
                        <Input
                          type="password"
                          placeholder={`${tool} API key`}
                          value={data.apiKeys[tool] || ''}
                          onChange={e => setData(prev => ({
                            ...prev,
                            apiKeys: { ...prev.apiKeys, [tool]: e.target.value },
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Competitors */}
            {activeSection === 'competitors' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Competitors</h3>
                  <p className="text-sm text-muted-foreground">List key competitors so we can differentiate messaging.</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={data.competitorInput}
                    onChange={e => updateField('competitorInput', e.target.value)}
                    placeholder="Add a competitor name"
                    onKeyDown={e => e.key === 'Enter' && addCompetitor()}
                  />
                  <Button variant="outline" onClick={addCompetitor}>Add</Button>
                </div>
                {data.competitors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.competitors.map((comp, idx) => (
                      <Badge key={idx} variant="secondary" className="gap-1 text-sm py-1 px-3">
                        {comp}
                        <button onClick={() => removeCompetitor(idx)} className="ml-1 hover:text-destructive">×</button>
                      </Badge>
                    ))}
                  </div>
                )}
                {data.competitors.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No competitors added yet. Type a name and press Enter or click Add.</p>
                )}
              </>
            )}

            {/* Brand Resources */}
            {activeSection === 'resources' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Brand Resources</h3>
                  <p className="text-sm text-muted-foreground">Upload logos, style guides, or any brand documentation to enrich your dashboard.</p>
                </div>
                <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
                  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium mb-1">Drag & drop files here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse. PDF, PNG, JPG, SVG accepted.</p>
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Browse Files
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Uploaded brand resources will be analyzed and used to populate your Brand Voice, Design, and Rules tabs automatically.
                </p>
              </>
            )}

            {/* Upload Analytics CSVs */}
            {activeSection === 'analytics' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Upload Analytics CSVs</h3>
                  <p className="text-sm text-muted-foreground">Upload Braze or Customer.io CSV exports. Files are stored and rows are imported into the matching analytics tables.</p>
                </div>
                <div className="space-y-2">
                  <Button
                    type="button"
                    disabled={isUploading}
                    onClick={() => {
                      if (!clientId) {
                        toast({ title: 'Client required', description: 'No client is available. Add a client in the clients table (Supabase) and refresh, or check RLS allows your user to read clients.', variant: 'destructive' });
                        return;
                      }
                      fileInputRef.current?.click();
                    }}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Upload Analytics CSVs
                      </>
                    )}
                  </Button>
                  {clientStillLoading && (
                    <p className="text-sm text-muted-foreground">
                      Loading client…
                    </p>
                  )}
                  {!clientId && !clientStillLoading && (
                    <p className="text-sm text-amber-600 dark:text-amber-500">
                      No client found. Add at least one row to the <code className="text-xs bg-muted px-1 rounded">clients</code> table (e.g. in Supabase or via a seed), then refresh.
                    </p>
                  )}
                </div>
                {fileProgressList.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Files</p>
                    <ul className="space-y-1.5">
                      {fileProgressList.map((item, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm">
                          {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          {item.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                          {item.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                          <span className={cn(
                            item.status === 'error' && 'text-destructive'
                          )}>
                            {item.file.name}
                          </span>
                          {item.status === 'uploading' && <span className="text-muted-foreground">Uploading…</span>}
                          {item.status === 'processing' && <span className="text-muted-foreground">Processing…</span>}
                          {item.status === 'done' && <span className="text-muted-foreground">Done</span>}
                          {item.status === 'error' && (
                            <span className="text-destructive text-xs">
                              ({formatError(item.error)})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {!isUploading && (
                      <p className="text-sm text-muted-foreground">
                        {fileProgressList.filter(f => f.status === 'done').length} of {fileProgressList.length} files processed successfully.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Mobile submit */}
        <div className="md:hidden pt-4">
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isCompletingSetup}
            className="w-full"
          >
            {isCompletingSetup ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {isCompletingSetup ? 'Saving…' : 'Complete Setup'}
          </Button>
        </div>
      </div>
    </div>
  );
}
