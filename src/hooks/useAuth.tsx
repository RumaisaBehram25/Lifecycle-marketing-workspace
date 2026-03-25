import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, UserRole, AppRole } from '@/lib/types';
import { logger } from '@/lib/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  /** Re-fetch profile and role without the full-app loading screen (e.g. pending-approval polling). */
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Avoid treating another user's profile/role as the current user's (e.g. fast account switch). */
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const loadProfileAndRole = useCallback(
    async (userId: string, options: { withFullScreenLoading: boolean }) => {
      if (options.withFullScreenLoading) {
        if (lastLoadedUserIdRef.current !== userId) {
          lastLoadedUserIdRef.current = userId;
          setProfile(null);
          setRole(null);
        }
        setIsLoading(true);
      }
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profileError) {
          logger.error('Error loading profile:', profileError);
        }
        setProfile(profileData ? (profileData as Profile) : null);

        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (roleError) {
          logger.error('Error loading role:', roleError);
        }
        setRole(roleData ? (roleData as UserRole).role : null);
      } catch (error) {
        logger.error('Error fetching user data:', error);
      } finally {
        if (options.withFullScreenLoading) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const fetchUserData = useCallback(
    async (userId: string) => {
      await loadProfileAndRole(userId, { withFullScreenLoading: true });
    },
    [loadProfileAndRole]
  );

  const refreshUserData = useCallback(async () => {
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    if (!current) return;
    await loadProfileAndRole(current.id, { withFullScreenLoading: false });
  }, [loadProfileAndRole]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void fetchUserData(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void fetchUserData(session.user.id);
      } else {
        lastLoadedUserIdRef.current = null;
        setProfile(null);
        setRole(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return {
      error: error as Error | null,
      needsEmailConfirmation: Boolean(data?.user && !data?.session),
    };
  }

  async function signOut() {
    await supabase.auth.signOut();
    lastLoadedUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  }

  const value: AuthContextType = {
    user,
    session,
    profile,
    role,
    isLoading,
    isAdmin: role === 'admin',
    // Admins can always use the app (bootstrap + break-glass). Everyone else needs profiles.is_approved.
    isApproved: role === 'admin' || profile?.is_approved === true,
    signIn,
    signUp,
    signOut,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
