import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Mail, Lock, User } from 'lucide-react';
import { BRCGLogo } from '@/components/BRCGLogo';

export default function Auth() {
  const { user, isLoading, isApproved, signIn, signUp } = useAuth();
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [signupInfo, setSignupInfo] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (user) {
    if (isApproved) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/pending-approval" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSignupInfo('');
    setLoading(true);

    try {
      if (activeTab === 'signin') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else {
        const { error, needsEmailConfirmation } = await signUp(email, password, fullName);
        if (error) {
          setError(error.message);
        } else if (needsEmailConfirmation) {
          setSignupInfo(
            'Check your email to confirm your account, then sign in. Until an administrator approves your profile, you will see a waiting screen after login.'
          );
          setActiveTab('signin');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden items-center justify-center bg-gradient-to-br from-[#0a0a0a] via-[#0f0f0f] to-[#141414] p-10 lg:flex lg:w-1/2 lg:p-14">
        <div className="w-full max-w-xl text-center">
          <div className="mx-auto mb-10 flex flex-col items-center gap-5">
            <BRCGLogo className="mx-auto h-14 w-auto max-w-[min(100%,22rem)] sm:h-16 md:h-[4.75rem] md:max-w-[min(100%,26rem)]" />
            <h1 className="sr-only">BRCG — CRM Copilot</h1>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/60 sm:text-base sm:tracking-[0.36em] md:text-lg">
              CRM Copilot
            </p>
          </div>
          <p className="mx-auto max-w-md text-lg leading-relaxed text-white/70 sm:text-xl">
            AI-powered lifecycle marketing. Generate on-brand copy and template code for your email platform.
          </p>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-4 sm:p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-6 flex lg:hidden flex-col items-center gap-3">
              <BRCGLogo className="h-11 w-auto max-w-[min(100%,15rem)] sm:h-12" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground sm:text-xs">
                CRM Copilot
              </p>
            </div>
            <CardTitle className="font-bold text-2xl">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'signin' | 'signup')}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin" className="font-semibold text-xs">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="font-semibold text-xs">Sign Up</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit}>
                <TabsContent value="signin" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-medium text-xs">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="font-medium text-xs">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="signup" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="font-medium text-xs">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupEmail" className="font-medium text-xs">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signupEmail"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupPassword" className="font-medium text-xs">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signupPassword"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                </TabsContent>

                {error && (
                  <p className="text-sm text-destructive mt-4">{error}</p>
                )}
                {signupInfo && (
                  <p className="text-sm text-muted-foreground mt-4 rounded-md border border-border bg-muted/50 p-3">
                    {signupInfo}
                  </p>
                )}

                <Button type="submit" className="w-full mt-6 font-semibold" disabled={loading}>
                  {loading && <LoadingSpinner size="sm" className="mr-2" />}
                  {activeTab === 'signin' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
