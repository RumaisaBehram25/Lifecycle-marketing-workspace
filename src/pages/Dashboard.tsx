import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useClients } from '@/hooks/useClients';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  FileText, 
  Code, 
  Database, 
  ArrowRight, 
  Plus,
  Shield,
  Zap,
  Target,
  CheckCircle2
} from 'lucide-react';

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: clients, isLoading: clientsLoading } = useClients();

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

  const stats = [
    { name: 'Total Clients', value: clients?.length || 0, icon: Users, href: '/clients', isLoading: clientsLoading },
    { name: 'Copy Generated', value: copyCount || 0, icon: FileText, href: '/chat', isLoading: copyLoading },
    { name: 'Code Generated', value: codeCount || 0, icon: Code, href: '/generate/code', isLoading: codeLoading },
    { name: 'Knowledge Docs', value: docsCount || 0, icon: Database, href: '/knowledge', isLoading: docsLoading },
  ];

  const valueProps = [
    {
      icon: Shield,
      title: 'Brand Guidelines First',
      description: 'Upload your brand voice, tone presets, do\'s and don\'ts. Every piece of content stays on-brand, every time.',
    },
    {
      icon: Target,
      title: 'Platform-Native Output',
      description: 'Generate Liquid for Braze, Django syntax for Klaviyo, Handlebars for Iterable. No manual translation needed.',
    },
    {
      icon: Zap,
      title: 'AI-Powered, Human-Guided',
      description: 'Leverage AI to accelerate output while your guardrails ensure quality. Copy and code that passes QA.',
    },
    {
      icon: CheckCircle2,
      title: 'Knowledge-Grounded',
      description: 'Ingest vendor docs and client assets. Outputs cite sources and flag assumptions for full transparency.',
    },
  ];

  const quickActions = [
    { 
      name: 'Generate Lifecycle Code', 
      description: 'Build Liquid/Handlebars logic',
      href: '/generate/code',
      icon: Code,
    },
    { 
      name: 'Add Knowledge', 
      description: 'Ingest docs with Firecrawl',
      href: '/knowledge',
      icon: Database,
    },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 sm:space-y-10">
        {/* Welcome section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading font-black text-2xl sm:text-3xl tracking-tight break-words">
              Welcome Back, {profile?.full_name?.split(' ')[0] || 'There'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Your lifecycle marketing ops command center.
            </p>
          </div>
          {isAdmin && (
            <Button asChild>
              <Link to="/clients/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Client
              </Link>
            </Button>
          )}
        </div>

        {/* Value Props Section */}
        <section className="bg-primary/5 border border-primary/20 rounded-lg p-6 lg:p-8">
          <div className="text-center mb-8">
            <h2 className="font-heading font-black text-2xl tracking-tight mb-2">
              How Copilot Works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Brand guidelines are the key to generating quality copy and code. Set up your clients with their voice, rules, and platform connections.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {valueProps.map((prop, i) => (
              <div key={prop.title} className="text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground mb-4">
                  <prop.icon className="h-6 w-6" />
                </div>
                <h3 className="font-heading font-bold text-sm uppercase tracking-wide mb-2">
                  {prop.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {prop.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Link key={stat.name} to={stat.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                        {stat.name}
                      </p>
                      {stat.isLoading ? (
                        <Skeleton className="h-8 w-12 mt-1" />
                      ) : (
                        <p className="font-heading font-black text-2xl mt-1">{stat.value}</p>
                      )}
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
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
          <h2 className="font-heading font-bold text-sm uppercase tracking-wide mb-4">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <Link key={action.name} to={action.href}>
                <Card className="group hover:border-primary transition-all cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <action.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-heading font-bold text-sm group-hover:text-primary transition-colors">
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

        {/* Clients overview */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-bold text-sm uppercase tracking-wide">Recent Clients</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/clients">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          
          {clientsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <Skeleton className="h-6 w-14 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !clients || clients.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  icon={Users}
                  title="No Clients Yet"
                  description="Add your first client to get started with generating content."
                  action={
                    isAdmin && (
                      <Button asChild>
                        <Link to="/clients/new">
                          <Plus className="mr-2 h-4 w-4" />
                          Add Client
                        </Link>
                      </Button>
                    )
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {clients.slice(0, 6).map((client) => (
                <Link key={client.id} to={`/clients/${client.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {client.logo_url ? (
                          <img 
                            src={client.logo_url} 
                            alt={client.name} 
                            className="h-10 w-10 object-contain rounded-lg bg-muted p-1"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-heading font-bold">
                            {client.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.slug}</p>
                        </div>
                        {client.is_active ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}