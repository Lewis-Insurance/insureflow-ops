import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { asMessage } from '@/lib/errors';

interface UserProfile {
  id: string;
  full_name: string | null;
  role: 'customer' | 'staff' | 'admin' | 'producer' | 'csr' | 'accounting' | 'owner';
  phone: string | null;
  is_staff: boolean;
  created_at: string;
  mfa_enabled?: boolean;
  phone_verified?: boolean;
  notification_email?: string | boolean;
  notification_sms?: string | boolean;
  timezone?: string;
  locale?: string;
  avatar_url?: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Centralized profile fetching with proper error handling
  const fetchProfile = useCallback(async (userId: string, userEmail?: string): Promise<void> => {
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Profile fetch error:', error);
        toast({
          title: "Profile Error",
          description: `Failed to load profile: ${error.message}`,
          variant: "destructive",
        });
        
        // Create minimal profile to prevent infinite loading
        const fallbackProfile: UserProfile = {
          id: userId,
          full_name: userEmail?.split('@')[0] || 'User',
          role: 'customer',
          phone: null,
          is_staff: false,
          created_at: new Date().toISOString()
        };
        setProfile(fallbackProfile);
        return;
      }

      if (profileData) {
        setProfile({
          ...profileData,
          role: (profileData.role as UserProfile['role']) || 'customer',
          is_staff: profileData.is_staff ?? false,
          notification_email: typeof profileData.notification_email === 'string' 
            ? profileData.notification_email === 'true' 
            : Boolean(profileData.notification_email),
          notification_sms: false // Default since field doesn't exist in database yet
        });
      }
    } catch (error) {
      console.error('Profile fetch exception:', error);
      // Fallback profile on any error to prevent infinite loading
      const fallbackProfile: UserProfile = {
        id: userId,
        full_name: userEmail?.split('@')[0] || 'User',
        role: 'customer',
        phone: null,
        is_staff: false,
        created_at: new Date().toISOString()
      };
      setProfile(fallbackProfile);
    }
  }, [toast]);

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener (sync callback, defer async work)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer Supabase calls to avoid deadlocks and state flicker
          setTimeout(() => {
            fetchProfile(session.user!.id, session.user!.email);
          }, 0);
        } else {
          setProfile(null);
        }
        
        if (event !== 'INITIAL_SESSION') {
          setLoading(false);
        }
      }
    );

    // Check for existing session with timeout
    const initializeAuth = async () => {
      try {
        // Add timeout to prevent hanging on slow connections
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session timeout')), 10000)
        );

        const result: any = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]);
        const { data: { session: existingSession } = {}, error } = result || {};
        
        if (!mounted) return;

        if (error) {
          // Silently handle session errors - user will be prompted to sign in
          setLoading(false);
          return;
        }

        setSession(existingSession);
        setUser(existingSession?.user ?? null);
        
        if (existingSession?.user) {
          await fetchProfile(existingSession.user.id, existingSession.user.email);
        }
        
        setLoading(false);
      } catch (error) {
        // Handle timeout or other errors
        if (!mounted) return;
        setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      // SECURITY: Remove role assignment - roles should be set server-side
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName
            // Role removed for security - will default to 'customer'
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Account created successfully",
        description: "Please check your email to verify your account.",
      });

      return { data, error: null };
    } catch (error) {
      const errorMessage = asMessage(error, 'An error occurred during sign up');
      toast({
        title: "Sign up failed",
        description: errorMessage,
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      toast({
        title: "Welcome back!",
        description: "You have been signed in successfully.",
      });

      return { data, error: null };
    } catch (error) {
      const errorMessage = asMessage(error, 'An error occurred during sign in');
      toast({
        title: "Sign in failed",
        description: errorMessage,
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Clear all state
      setUser(null);
      setSession(null);
      setProfile(null);

      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });

      // Redirect to login page
      window.location.href = '/auth';
    } catch (error) {
      const errorMessage = asMessage(error, 'Error signing out');
      toast({
        title: "Error signing out",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Computed values based on role
  const isStaff = profile?.role === 'staff' || profile?.role === 'admin' || profile?.is_staff === true;
  const isAdmin = profile?.role === 'admin';
  const isAuthenticated = !!user;

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    isStaff,
    isAdmin,
    isAuthenticated
  };
}