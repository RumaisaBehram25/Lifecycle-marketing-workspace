import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, X, ShieldCheck, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { Profile, AppRole } from '@/lib/types';
import { logger } from '@/lib/logger';

interface UserWithRole extends Profile {
  role?: AppRole;
}

export function UserManagementPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    userId: string;
    action: 'approve' | 'reject';
    userName: string;
  } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setIsLoading(true);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => ({
        ...profile,
        role: roles?.find(r => r.user_id === profile.id)?.role as AppRole | undefined
      }));
      setUsers(usersWithRoles);
    } catch (error) {
      logger.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(userId: string) {
    try {
      setActionLoading(userId);
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: true, approved_at: new Date().toISOString(), approved_by: user?.id })
        .eq('id', userId);
      if (error) throw error;
      toast.success('User approved successfully');
      fetchUsers();
    } catch (error) {
      logger.error('Error approving user:', error);
      toast.error('Failed to approve user');
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  }

  async function handleReject(userId: string) {
    try {
      setActionLoading(userId);
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: false, approved_at: null, approved_by: null })
        .eq('id', userId);
      if (error) throw error;
      toast.success('User access revoked');
      fetchUsers();
    } catch (error) {
      logger.error('Error rejecting user:', error);
      toast.error('Failed to revoke user access');
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  }

  const pendingUsers = users.filter(u => !u.is_approved);
  const approvedUsers = users.filter(u => u.is_approved);

  return (
    <>
      <div className="space-y-6">
        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <CardTitle>Pending Approvals</CardTitle>
              {pendingUsers.length > 0 && (
                <Badge variant="secondary">{pendingUsers.length}</Badge>
              )}
            </div>
            <CardDescription>Users waiting for approval to access the application</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : pendingUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No pending approval requests</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Signed Up</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((pendingUser) => (
                    <TableRow key={pendingUser.id}>
                      <TableCell className="font-medium">{pendingUser.full_name || 'Unknown'}</TableCell>
                      <TableCell>{pendingUser.email}</TableCell>
                      <TableCell>{format(new Date(pendingUser.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setConfirmDialog({ open: true, userId: pendingUser.id, action: 'approve', userName: pendingUser.full_name || pendingUser.email || 'this user' })} disabled={actionLoading === pendingUser.id}>
                            {actionLoading === pendingUser.id ? <LoadingSpinner size="sm" /> : <><Check className="mr-1 h-4 w-4" />Approve</>}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmDialog({ open: true, userId: pendingUser.id, action: 'reject', userName: pendingUser.full_name || pendingUser.email || 'this user' })} disabled={actionLoading === pendingUser.id}>
                            <X className="mr-1 h-4 w-4" />Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Approved Users */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              <CardTitle>Approved Users</CardTitle>
              <Badge variant="secondary">{approvedUsers.length}</Badge>
            </div>
            <CardDescription>Users with access to the application</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : approvedUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No approved users yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedUsers.map((approvedUser) => (
                    <TableRow key={approvedUser.id}>
                      <TableCell className="font-medium">{approvedUser.full_name || 'Unknown'}</TableCell>
                      <TableCell>{approvedUser.email}</TableCell>
                      <TableCell>
                        <Badge variant={approvedUser.role === 'admin' ? 'default' : 'secondary'}>
                          {approvedUser.role || 'member'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {approvedUser.approved_at ? format(new Date(approvedUser.approved_at), 'MMM d, yyyy') : 'Auto-approved'}
                      </TableCell>
                      <TableCell className="text-right">
                        {approvedUser.id !== user?.id && (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDialog({ open: true, userId: approvedUser.id, action: 'reject', userName: approvedUser.full_name || approvedUser.email || 'this user' })} disabled={actionLoading === approvedUser.id}>
                            <X className="mr-1 h-4 w-4" />Revoke Access
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.action === 'approve' ? 'Approve User' : 'Revoke Access'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'approve'
                ? `Are you sure you want to approve ${confirmDialog.userName}? They will be able to access the application.`
                : `Are you sure you want to revoke access for ${confirmDialog?.userName}? They will no longer be able to use the application.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmDialog?.action === 'approve') handleApprove(confirmDialog.userId);
              else if (confirmDialog) handleReject(confirmDialog.userId);
            }}>
              {confirmDialog?.action === 'approve' ? 'Approve' : 'Revoke Access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
