import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface UserProfile {
  id: string;
  full_name: string | null;
  role: 'customer' | 'staff' | 'admin' | 'producer' | 'csr' | 'accounting' | 'owner';
  phone: string | null;
  is_staff: boolean;
  created_at: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch user profile after authentication
          setTimeout(async () => {
            try {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('id, full_name, role, phone, is_staff, created_at')
                .eq('id', session.user.id)
                .single();
              
              setProfile(profileData);
            } catch (error) {
              console.error('Error fetching profile:', error);
            }
          }, 0);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string, role: string = 'csr') => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            role: role
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Account created successfully",
        description: "Please check your email to verify your account.",
      });

      return { data, error: null };
    } catch (error: any) {
      const errorMessage = error.message || 'An error occurred during sign up';
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
    } catch (error: any) {
      const errorMessage = error.message || 'An error occurred during sign in';
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

      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    isStaff: profile?.is_staff || false,
    isAuthenticated: !!user
  };
}