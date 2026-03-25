import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, LogOut, Mail, RefreshCw } from 'lucide-react';

const POLL_MS = 20_000;

export default function PendingApproval() {
  const { profile, signOut, refreshUserData } = useAuth();
  const [checking, setChecking] = useState(false);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      await refreshUserData();
    } finally {
      setChecking(false);
    }
  }, [refreshUserData]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshUserData();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshUserData]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl font-bold">Pending Approval</CardTitle>
          <CardDescription>
            Sign up, then sign in — you stay here until an admin approves your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">
              You are signed in. When an administrator approves you in user management, this page will send you to the
              dashboard automatically; we recheck about every 20 seconds. Confirm your email first if your project
              requires it.
            </p>
          </div>

          {profile?.email && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Signed in as {profile.email}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => void checkNow()}
              disabled={checking}
              className="w-full"
            >
              {checking ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Check status
            </Button>
            <Button 
              variant="ghost" 
              onClick={signOut}
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
