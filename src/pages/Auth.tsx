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

export default function Auth() {
  const { user, isLoading, signIn, signUp } = useAuth();
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (activeTab === 'signin') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a0a0a] items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-8 inline-flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-2xl shadow-primary/30">
              <svg viewBox="0 0 24 24" className="h-12 w-12 text-primary-foreground" fill="currentColor">
                <path d="M7.5 21.5v-6h9v6h-9zm0-7.5v-6h9v6h-9zm0-7.5V3h9v3.5h-9z"/>
              </svg>
            </div>
          </div>
          <h1 className="font-bold text-5xl text-white mb-2 tracking-tight">
            Linktree
          </h1>
          <p className="font-semibold text-sm uppercase tracking-widest text-white/50 mb-8">
            Lifecycle Copilot
          </p>
          <p className="text-lg text-white/70">
            AI-powered lifecycle marketing. Generate on-brand copy and template code for your email platform.
          </p>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-4 sm:p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 lg:hidden flex items-center justify-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary-foreground" fill="currentColor">
                  <path d="M7.5 21.5v-6h9v6h-9zm0-7.5v-6h9v6h-9zm0-7.5V3h9v3.5h-9z"/>
                </svg>
              </div>
              <span className="font-bold text-xl">Linktree</span>
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
