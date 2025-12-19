// ============================================================================
// HOUSEHOLD MANAGEMENT HOOK
// ============================================================================
// Household management with RPC-based invite
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  HouseholdMember,
  HouseholdPermissions,
  HouseholdRelationship,
} from '@/types/portal';

export function useHousehold() {
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ['portal-household-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_household_members')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as HouseholdMember[];
    },
  });

  // Invite household member via RPC
  const inviteMember = useMutation({
    mutationFn: async (params: {
      member_email: string;
      member_name?: string | null;
      relationship?: HouseholdRelationship | null;
      permissions?: Partial<HouseholdPermissions> | null;
    }) => {
      const { data, error } = await supabase.rpc('invite_household_member', {
        p_member_email: params.member_email,
        p_member_name: params.member_name ?? null,
        p_relationship: params.relationship ?? null,
        p_permissions: params.permissions ?? null,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-household-members'] });
    },
  });

  // Update household member permissions
  const updatePermissions = useMutation({
    mutationFn: async ({
      memberId,
      permissions
    }: {
      memberId: string;
      permissions: Partial<HouseholdPermissions>;
    }) => {
      const { data, error } = await supabase
        .from('portal_household_members')
        .update({ permissions })
        .eq('id', memberId)
        .select()
        .single();

      if (error) throw error;
      return data as HouseholdMember;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-household-members'] });
    },
  });

  // Remove (disable) household member
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('portal_household_members')
        .update({ status: 'disabled' })
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-household-members'] });
    },
  });

  return {
    members: membersQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    error: membersQuery.error,
    refetch: membersQuery.refetch,
    inviteMember,
    updatePermissions,
    removeMember,
  };
}
