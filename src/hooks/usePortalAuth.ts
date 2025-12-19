// ============================================================================
// PORTAL AUTHENTICATION HOOK
// ============================================================================
// Magic link authentication with invite-required flow
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type {
  ClientPortalUser,
  PortalBranding,
  PortalInvitationCheckResponse,
} from '@/types/portal';

export function usePortalAuth() {
  const [user, setUser] = useState<ClientPortalUser | null>(null);
  const [branding, setBranding] = useState<PortalBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          setLoading(false);
          return;
        }

        // Get portal user profile
        const { data: portalUser, error: userError } = await supabase
          .from('client_portal_users')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .eq('portal_status', 'active')
          .single();

        if (userError || !portalUser) {
          setError('No portal access');
          setLoading(false);
          return;
        }

        setUser(portalUser as ClientPortalUser);

        // Get branding
        if (portalUser.branding_id) {
          const { data: brandingData } = await supabase
            .from('portal_branding')
            .select('*')
            .eq('id', portalUser.branding_id)
            .eq('is_active', true)
            .single();

          if (brandingData) {
            setBranding(brandingData as PortalBranding);
          }
        }

        // Log login activity via RPC
        await supabase.rpc('log_my_portal_activity', {
          p_activity_type: 'login',
          p_activity_data: {}
        });

      } catch (err) {
        console.error('Auth error:', err);
        setError('Authentication error');
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setBranding(null);
          navigate('/portal/login');
        } else if (event === 'SIGNED_IN' && session) {
          checkSession();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Check if email has valid invitation BEFORE sending magic link
  const checkInvitation = useCallback(async (email: string): Promise<PortalInvitationCheckResponse> => {
    const { data, error } = await supabase.functions.invoke('check-portal-access', {
      body: { email },
    });

    if (error) {
      console.error('Invitation check error:', error);
      return { allowed: false, reason: 'no_invitation' };
    }

    return data as PortalInvitationCheckResponse;
  }, []);

  // Sign in with magic link - INVITE REQUIRED
  const signInWithMagicLink = useCallback(async (email: string) => {
    // First check if email has valid invitation
    const invitationCheck = await checkInvitation(email);

    if (!invitationCheck.allowed) {
      return {
        error: {
          message: invitationCheck.reason === 'account_disabled'
            ? 'Your account has been disabled. Please contact your agency.'
            : 'No invitation found for this email. Please contact your insurance agency to request portal access.'
        }
      };
    }

    // CRITICAL: shouldCreateUser: false prevents random signups
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/portal/dashboard`,
      },
    });

    return { error, invitationCheck };
  }, [checkInvitation]);

  const signOut = useCallback(async () => {
    // Log logout before signing out
    try {
      await supabase.rpc('log_my_portal_activity', {
        p_activity_type: 'logout',
        p_activity_data: {}
      });
    } catch (err) {
      console.error('Failed to log logout:', err);
    }

    await supabase.auth.signOut();
  }, []);

  return {
    user,
    branding,
    loading,
    error,
    checkInvitation,
    signInWithMagicLink,
    signOut,
    isAuthenticated: !!user,
  };
}
