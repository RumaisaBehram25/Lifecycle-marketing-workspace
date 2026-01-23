import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useLinktreeClient, useLinktreePlatforms } from '@/hooks/useLinktreeClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { 
  FileText, 
  Code, 
  Database, 
  ArrowRight, 
  MessageSquare,
  Zap,
  Target,
  Sparkles,
  Link as LinkIcon,
  Palette,
  TrendingUp,
} from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();
  const { data: client, isLoading: clientLoading } = useLinktreeClient();
  const { data: platforms, isLoading: platformsLoading } = useLinktreePlatforms();

  // Fetch real stats
  const { data: copyCount, isLoading: copyLoading } = useQuery({
    queryKey: ['stats-copy-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('generated_content')
        .select('*', { count: 'exact', head: true })
        .eq('content_type', 'copy');
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: codeCount, isLoading: codeLoading } = useQuery({
    queryKey: ['stats-code-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('generated_content')
        .select('*', { count: 'exact', head: true })
        .eq('content_type', 'code');
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: docsCount, isLoading: docsLoading } = useQuery({
    queryKey: ['stats-docs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('knowledge_documents')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const connectedPlatforms = platforms?.filter(p => p.is_connected) || [];

  const stats = [
    { name: 'Copy Generated', value: copyCount || 0, icon: FileText, href: '/chat', isLoading: copyLoading },
    { name: 'Code Generated', value: codeCount || 0, icon: Code, href: '/generate/code', isLoading: codeLoading },
    { name: 'Knowledge Docs', value: docsCount || 0, icon: Database, href: '/knowledge', isLoading: docsLoading },
    { name: 'Platforms', value: connectedPlatforms.length, icon: LinkIcon, href: '/platforms', isLoading: platformsLoading },
  ];

  const quickActions = [
    { 
      name: 'Generate Lifecycle Copy', 
      description: 'Create on-brand email & push messaging',
      href: '/chat',
      icon: MessageSquare,
      gradient: true,
    },
    { 
      name: 'Generate Template Code', 
      description: 'Build Liquid/Handlebars for your platform',
      href: '/generate/code',
      icon: Code,
    },
    { 
      name: 'Update Brand Voice', 
      description: 'Refine your messaging guidelines',
      href: '/brand',
      icon: Palette,
    },
    { 
      name: 'Add Knowledge', 
      description: 'Ingest docs with Firecrawl',
      href: '/knowledge',
      icon: Database,
    },
  ];

  const lifecycleJourneys = [
    { name: 'Welcome Series', description: 'Onboard new users with warmth', icon: Sparkles },
    { name: 'Re-engagement', description: 'Win back inactive creators', icon: TrendingUp },
    { name: 'Feature Adoption', description: 'Drive usage of new features', icon: Target },
    { name: 'Upgrade Nudges', description: 'Convert free to paid', icon: Zap },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 sm:space-y-10 max-w-6xl mx-auto">
        {/* Welcome section */}
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <h1 className="font-bold text-2xl sm:text-3xl tracking-tight break-words">
              Welcome back, {profile?.full_name?.split(' ')[0] || 'there'} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Your Linktree lifecycle marketing command center.
            </p>
          </div>
        </div>

        {/* Brand Status Card */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-primary-foreground" fill="currentColor">
                  <path d="M7.5 21.5v-6h9v6h-9zm0-7.5v-6h9v6h-9zm0-7.5V3h9v3.5h-9z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">Linktree</h2>
                {clientLoading ? (
                  <Skeleton className="h-4 w-48 mt-1" />
                ) : client?.brand_voice ? (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {client.brand_voice}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/60 italic mt-1">
                    Brand voice not configured yet
                  </p>
                )}
              </div>
              <Button asChild>
                <Link to="/brand">
                  <Palette className="mr-2 h-4 w-4" />
                  View Brand
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Link key={stat.name} to={stat.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                        {stat.name}
                      </p>
                      {stat.isLoading ? (
                        <Skeleton className="h-8 w-12 mt-1" />
                      ) : (
                        <p className="font-bold text-2xl mt-1">{stat.value}</p>
                      )}
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <stat.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="font-semibold text-sm uppercase tracking-wide mb-4 text-muted-foreground">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link key={action.name} to={action.href}>
                <Card className={`group hover:border-primary transition-all cursor-pointer h-full ${action.gradient ? 'border-primary/30 bg-gradient-to-br from-primary/10 to-transparent' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${action.gradient ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' : 'bg-primary/10'}`}>
                        <action.icon className={`h-6 w-6 ${action.gradient ? '' : 'text-primary'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {action.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{action.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Lifecycle Journeys */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Lifecycle Journeys</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/chat">
                Start Building
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lifecycleJourneys.map((journey) => (
              <Link key={journey.name} to="/chat">
                <Card className="hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <journey.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{journey.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{journey.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
