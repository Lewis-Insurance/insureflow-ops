/**
 * Agency Workspace Hooks
 *
 * M0 Foundation - Unified agency tenant management
 *
 * These hooks provide:
 * - useActiveAgency: Determines current agency from URL slug or profile preference
 * - useAgencyMemberships: Fetches all agencies the user belongs to
 * - useAgencyWorkspace: CRUD operations for agency workspaces
 * - useAgencyMembers: Manage agency team members
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface AgencyWorkspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  settings: Record<string, unknown>;
  logo_url: string | null;
  primary_color: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  status: 'active' | 'suspended' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface AgencyMembership {
  id: string;
  agency_workspace_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'producer' | 'csr' | 'accounting' | 'viewer';
  permissions: Record<string, boolean>;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  status: 'pending' | 'active' | 'suspended' | 'removed';
  created_at: string;
  updated_at: string;
  agency?: AgencyWorkspace;
}

export interface AgencyMember extends AgencyMembership {
  user?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface CreateAgencyInput {
  name: string;
  slug?: string;
  settings?: Record<string, unknown>;
  logo_url?: string;
  primary_color?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
}

export interface UpdateAgencyInput extends Partial<CreateAgencyInput> {
  id: string;
}

export interface InviteMemberInput {
  agency_workspace_id: string;
  email: string;
  role: AgencyMembership['role'];
  permissions?: Record<string, boolean>;
}

// ============================================================================
// useAgencyMemberships - Fetch all agencies user belongs to
// ============================================================================

export function useAgencyMemberships() {
  const { user } = useAuth();

  return useQuery<AgencyMembership[]>({
    queryKey: ['agency-memberships', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('agency_workspace_memberships')
        .select(`
          *,
          agency:agency_workspaces(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Failed to fetch agency memberships', { error: error.message });
        throw error;
      }

      return data as AgencyMembership[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================================
// useActiveAgency - Determine current agency from URL or preference
// ============================================================================

interface UseActiveAgencyOptions {
  /** If true, will redirect to default agency if no slug in URL */
  requireAgency?: boolean;
}

export function useActiveAgency(options: UseActiveAgencyOptions = {}) {
  const { requireAgency = false } = options;
  const params = useParams<{ agencySlug?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: memberships, isLoading: membershipsLoading } = useAgencyMemberships();

  // Fetch user's profile for default agency preference
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('default_agency_workspace_id')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Failed to fetch profile', { error: error.message });
      }

      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = membershipsLoading || profileLoading;

  // Determine active agency
  let activeAgency: AgencyMembership | null = null;
  let source: 'url' | 'preference' | 'fallback' | null = null;

  if (memberships && memberships.length > 0) {
    // Priority 1: URL slug
    if (params.agencySlug) {
      const slugMatch = memberships.find(m => m.agency?.slug === params.agencySlug);
      if (slugMatch) {
        activeAgency = slugMatch;
        source = 'url';
      }
    }

    // Priority 2: Profile preference
    if (!activeAgency && profile?.default_agency_workspace_id) {
      const preferenceMatch = memberships.find(
        m => m.agency_workspace_id === profile.default_agency_workspace_id
      );
      if (preferenceMatch) {
        activeAgency = preferenceMatch;
        source = 'preference';
      }
    }

    // Priority 3: First membership (fallback)
    if (!activeAgency) {
      activeAgency = memberships[0];
      source = 'fallback';
    }
  }

  // Handle redirect if required but no agency in URL
  const shouldRedirect = requireAgency && !params.agencySlug && activeAgency && !isLoading;

  return {
    /** The currently active agency membership (includes agency details) */
    activeAgency,
    /** The active agency workspace object */
    agency: activeAgency?.agency ?? null,
    /** The user's role in the active agency */
    role: activeAgency?.role ?? null,
    /** How the active agency was determined */
    source,
    /** All agencies the user belongs to */
    memberships: memberships ?? [],
    /** Whether the data is still loading */
    isLoading,
    /** Whether user has no agencies */
    hasNoAgencies: !isLoading && (!memberships || memberships.length === 0),
    /** Whether a redirect to the default agency is needed */
    shouldRedirect,
    /** Navigate to a specific agency by slug */
    navigateToAgency: (slug: string, path: string = '') => {
      navigate(`/app/${slug}${path ? `/${path}` : ''}`);
    },
    /** Set the active agency as user's default */
    setAsDefault: async (agencyId: string) => {
      if (!user?.id) return;

      const { error } = await supabase
        .from('profiles')
        .update({ default_agency_workspace_id: agencyId })
        .eq('id', user.id);

      if (error) {
        logger.error('Failed to set default agency', { error: error.message });
        throw error;
      }
    },
  };
}

// ============================================================================
// useAgencyWorkspace - CRUD operations for agency workspaces
// ============================================================================

export function useAgencyWorkspace(agencyId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch single agency
  const agency = useQuery<AgencyWorkspace>({
    queryKey: ['agency-workspace', agencyId],
    queryFn: async () => {
      if (!agencyId) throw new Error('Agency ID required');

      const { data, error } = await supabase
        .from('agency_workspaces')
        .select('*')
        .eq('id', agencyId)
        .single();

      if (error) {
        logger.error('Failed to fetch agency', { error: error.message });
        throw error;
      }

      return data as AgencyWorkspace;
    },
    enabled: !!agencyId,
  });

  // Create agency
  const createAgency = useMutation<AgencyWorkspace, Error, CreateAgencyInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('agency_workspaces')
        .insert({
          ...input,
          owner_id: user?.id,
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create agency', { error: error.message });
        throw error;
      }

      return data as AgencyWorkspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency-memberships'] });
    },
  });

  // Update agency
  const updateAgency = useMutation<AgencyWorkspace, Error, UpdateAgencyInput>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase
        .from('agency_workspaces')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update agency', { error: error.message });
        throw error;
      }

      return data as AgencyWorkspace;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agency-workspace', data.id] });
      queryClient.invalidateQueries({ queryKey: ['agency-memberships'] });
    },
  });

  // Delete agency
  const deleteAgency = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('agency_workspaces')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Failed to delete agency', { error: error.message });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency-memberships'] });
    },
  });

  return {
    agency,
    createAgency,
    updateAgency,
    deleteAgency,
  };
}

// ============================================================================
// useAgencyMembers - Manage agency team members
// ============================================================================

export function useAgencyMembers(agencyId?: string) {
  const queryClient = useQueryClient();

  // Fetch all members of an agency
  const members = useQuery<AgencyMember[]>({
    queryKey: ['agency-members', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      const { data, error } = await supabase
        .from('agency_workspace_memberships')
        .select(`
          *,
          user:profiles!user_id(id, full_name, avatar_url)
        `)
        .eq('agency_workspace_id', agencyId)
        .neq('status', 'removed')
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Failed to fetch agency members', { error: error.message });
        throw error;
      }

      // Also get email from auth.users via a separate query or RPC
      // For now, return without email (can be added via RPC function)
      return data as AgencyMember[];
    },
    enabled: !!agencyId,
  });

  // Invite a new member
  const inviteMember = useMutation<AgencyMembership, Error, InviteMemberInput>({
    mutationFn: async (input) => {
      // First, find or create the user by email
      // This would typically be done via an edge function for security
      // For now, we'll assume the user exists and we have their ID

      // TODO: Implement invite flow via edge function
      // The edge function should:
      // 1. Check if user exists by email
      // 2. If not, create an invitation record
      // 3. Send invitation email
      // 4. Create pending membership

      const { data, error } = await supabase
        .from('agency_workspace_memberships')
        .insert({
          agency_workspace_id: input.agency_workspace_id,
          user_id: input.email, // This should be the user_id, not email
          role: input.role,
          permissions: input.permissions ?? {},
          status: 'pending',
          invited_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to invite member', { error: error.message });
        throw error;
      }

      return data as AgencyMembership;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency-members', agencyId] });
    },
  });

  // Update member role/permissions
  const updateMember = useMutation<
    AgencyMembership,
    Error,
    { memberId: string; role?: AgencyMembership['role']; permissions?: Record<string, boolean> }
  >({
    mutationFn: async ({ memberId, role, permissions }) => {
      const updates: Partial<AgencyMembership> = {};
      if (role) updates.role = role;
      if (permissions) updates.permissions = permissions;

      const { data, error } = await supabase
        .from('agency_workspace_memberships')
        .update(updates)
        .eq('id', memberId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update member', { error: error.message });
        throw error;
      }

      return data as AgencyMembership;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency-members', agencyId] });
    },
  });

  // Remove member
  const removeMember = useMutation<void, Error, string>({
    mutationFn: async (memberId) => {
      const { error } = await supabase
        .from('agency_workspace_memberships')
        .update({ status: 'removed' })
        .eq('id', memberId);

      if (error) {
        logger.error('Failed to remove member', { error: error.message });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency-members', agencyId] });
    },
  });

  return {
    members,
    inviteMember,
    updateMember,
    removeMember,
  };
}

// ============================================================================
// useAgencyPermission - Check specific permission in active agency
// ============================================================================

export function useAgencyPermission(permission: string) {
  const { activeAgency, role, isLoading } = useActiveAgency();

  if (isLoading) {
    return { hasPermission: false, isLoading: true };
  }

  if (!activeAgency || !role) {
    return { hasPermission: false, isLoading: false };
  }

  // Owner and admin have all permissions
  if (role === 'owner' || role === 'admin') {
    return { hasPermission: true, isLoading: false };
  }

  // Check explicit permission override
  if (activeAgency.permissions && permission in activeAgency.permissions) {
    return { hasPermission: activeAgency.permissions[permission], isLoading: false };
  }

  // Default permissions by role
  const defaultPermissions: Record<string, string[]> = {
    producer: [
      'view_policies', 'edit_policies', 'view_leads', 'edit_leads',
      'view_commissions', 'view_accounts', 'edit_accounts', 'view_tasks',
      'edit_tasks', 'view_documents', 'upload_documents',
    ],
    csr: [
      'view_policies', 'view_leads', 'edit_leads', 'create_tasks',
      'view_accounts', 'edit_accounts', 'view_tasks', 'edit_tasks',
      'view_documents', 'upload_documents',
    ],
    accounting: [
      'view_policies', 'view_commissions', 'edit_commissions',
      'view_accounts', 'view_reports',
    ],
    viewer: [
      'view_policies', 'view_leads', 'view_accounts', 'view_tasks',
      'view_documents',
    ],
  };

  const rolePermissions = defaultPermissions[role] ?? [];
  return { hasPermission: rolePermissions.includes(permission), isLoading: false };
}
