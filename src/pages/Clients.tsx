import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useClients, useDeleteClient } from '@/hooks/useClients';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Search, 
  Users, 
  Trash2, 
  MessageSquare, 
  ExternalLink,
  Globe,
  CheckCircle2,
  ArrowRight,
  Pencil
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { Client } from '@/lib/types';

export default function Clients() {
  const { isAdmin } = useAuth();
  const { data: clients, isLoading } = useClients();
  const deleteClient = useDeleteClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [editWebsiteUrl, setEditWebsiteUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return (
      <AppLayout>
        <LoadingPage />
      </AppLayout>
    );
  }

  const filteredClients = clients?.filter((client) =>
    client.name.toLowerCase().includes(search.toLowerCase()) ||
    client.slug.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleDelete = async () => {
    if (clientToDelete) {
      await deleteClient.mutateAsync(clientToDelete.id);
      setClientToDelete(null);
    }
  };

  const handleEditWebsite = (client: Client) => {
    setClientToEdit(client);
    setEditWebsiteUrl(client.website_url || '');
  };

  const handleSaveWebsite = async () => {
    if (!clientToEdit) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ website_url: editWebsiteUrl.trim() || null })
        .eq('id', clientToEdit.id);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast({ title: 'Website updated', description: `Updated website for ${clientToEdit.name}` });
      setClientToEdit(null);
    } catch (error) {
      toast({ 
        title: 'Failed to update', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const activeClients = clients?.filter(c => c.is_active).length || 0;
  const withBrandVoice = clients?.filter(c => c.brand_voice).length || 0;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <PageHeader
          title="Clients"
          description="Manage client accounts and brand guidelines"
          actions={
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

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                    Total Clients
                  </p>
                  <p className="font-heading font-black text-2xl mt-1">{clients?.length || 0}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                    Active
                  </p>
                  <p className="font-heading font-black text-2xl mt-1">{activeClients}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground">
                    With Brand Voice
                  </p>
                  <p className="font-heading font-black text-2xl mt-1">{withBrandVoice}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-accent-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Clients grid */}
        {filteredClients.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={Users}
                title={search ? 'No clients found' : 'No clients yet'}
                description={
                  search
                    ? 'Try adjusting your search terms.'
                    : 'Add your first client to start generating on-brand content.'
                }
                action={
                  !search && isAdmin && (
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
            {filteredClients.map((client) => (
              <Card key={client.id} className="group hover:border-primary/50 hover:shadow-md transition-all">
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="p-4 sm:p-5 pb-3 sm:pb-4">
                    <div className="flex items-start gap-3 mb-3">
                      {/* Logo/Initial */}
                      {client.logo_url ? (
                        <img
                          src={client.logo_url}
                          alt={client.name}
                          className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg object-contain bg-muted p-1 flex-shrink-0"
                        />
                      ) : (
                        <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-heading font-bold text-base sm:text-lg flex-shrink-0">
                          {client.name.charAt(0)}
                        </div>
                      )}
                      
                      {/* Name + Slug + Badge */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-heading font-bold group-hover:text-primary transition-colors truncate text-sm sm:text-base">
                              {client.name}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">{client.slug}</p>
                          </div>
                          {/* Active Badge - always visible */}
                          <div className="flex-shrink-0">
                            {client.is_active ? (
                              <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-success/10 text-success whitespace-nowrap">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">
                                Inactive
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Brand Voice Preview */}
                    {client.brand_voice ? (
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                        {client.brand_voice}
                      </p>
                    ) : (
                      <p className="text-xs sm:text-sm text-muted-foreground/60 italic">
                        No brand voice configured
                      </p>
                    )}

                    {/* Website */}
                    <div className="flex items-center gap-2 mt-2">
                      {client.website_url ? (
                        <a 
                          href={client.website_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-[180px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{new URL(client.website_url).hostname}</span>
                          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 italic">No website</span>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditWebsite(client);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-3 border-t bg-muted/30">
                    <Button variant="ghost" size="sm" asChild className="flex-1 justify-between group/btn h-8">
                      <Link to={`/clients/${client.id}`}>
                        <span className="text-xs sm:text-sm">Open</span>
                        <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 opacity-0 -translate-x-2 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all" />
                      </Link>
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                        onClick={() => setClientToDelete(client)}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!clientToDelete} onOpenChange={() => setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{clientToDelete?.name}"? This action cannot be undone
              and will remove all associated platform connections and generated content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Website Dialog */}
      <Dialog open={!!clientToEdit} onOpenChange={() => setClientToEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Website URL</DialogTitle>
            <DialogDescription>
              Update the website for {clientToEdit?.name}. You can run brand discovery after to update brand guidelines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="website-url">Website URL</Label>
              <Input
                id="website-url"
                type="url"
                value={editWebsiteUrl}
                onChange={(e) => setEditWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientToEdit(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveWebsite} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
