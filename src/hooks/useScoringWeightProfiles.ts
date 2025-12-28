/**
 * Scoring Weight Profiles Hooks
 *
 * Manage customizable scoring weight profiles for quote ranking.
 * Weights must sum to 100 and are applied to raw dimension scores.
 *
 * Priority: Account override > Agency default > System default
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface ScoringWeightProfile {
  id: string;
  agency_workspace_id: string | null;
  account_id: string | null;
  name: string;
  price_weight: number;
  coverage_weight: number;
  carrier_weight: number;
  deductible_weight: number;
  value_weight: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface CreateScoringWeightProfileInput {
  name: string;
  price_weight: number;
  coverage_weight: number;
  carrier_weight: number;
  deductible_weight: number;
  value_weight: number;
  is_default?: boolean;
  account_id?: string; // If set, creates an account-specific profile
}

export interface UpdateScoringWeightProfileInput {
  id: string;
  name?: string;
  price_weight?: number;
  coverage_weight?: number;
  carrier_weight?: number;
  deductible_weight?: number;
  value_weight?: number;
  is_default?: boolean;
  is_active?: boolean;
}

// Default weights used when no profile exists
export const DEFAULT_WEIGHTS: Omit<ScoringWeightProfile, 'id' | 'agency_workspace_id' | 'account_id' | 'name' | 'is_default' | 'is_active' | 'created_at'> = {
  price_weight: 30,
  coverage_weight: 25,
  carrier_weight: 20,
  deductible_weight: 15,
  value_weight: 10,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all scoring weight profiles for the current agency.
 */
export function useAgencyScoringProfiles() {
  const { agency } = useActiveAgency();

  return useQuery<ScoringWeightProfile[]>({
    queryKey: ['scoring-weight-profiles', agency?.id],
    queryFn: async () => {
      if (!agency?.id) return [];

      const { data, error } = await supabase
        .from('scoring_weight_profiles')
        .select('*')
        .eq('agency_workspace_id', agency.id)
        .is('account_id', null) // Agency-level profiles only
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!agency?.id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch the effective scoring profile for an account.
 * Priority: Account override > Agency default > System default
 */
export function useEffectiveScoringProfile(accountId: string | null | undefined) {
  const { agency } = useActiveAgency();

  return useQuery<ScoringWeightProfile | null>({
    queryKey: ['effective-scoring-profile', accountId, agency?.id],
    queryFn: async () => {
      // Try RPC function for resolution
      const { data, error } = await supabase.rpc('get_effective_weight_profile', {
        p_account_id: accountId || null,
        p_agency_workspace_id: agency?.id || null,
      });

      if (error) {
        logger.warn('RPC failed for effective profile', { error: error.message });

        // Fallback: Check account-specific first
        if (accountId) {
          const { data: accountProfile } = await supabase
            .from('scoring_weight_profiles')
            .select('*')
            .eq('account_id', accountId)
            .eq('is_active', true)
            .single();

          if (accountProfile) return accountProfile;
        }

        // Fallback: Agency default
        if (agency?.id) {
          const { data: agencyProfile } = await supabase
            .from('scoring_weight_profiles')
            .select('*')
            .eq('agency_workspace_id', agency.id)
            .is('account_id', null)
            .eq('is_default', true)
            .eq('is_active', true)
            .single();

          if (agencyProfile) return agencyProfile;
        }

        return null;
      }

      return data || null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch scoring profile for a specific account (if it has a custom profile).
 */
export function useAccountScoringProfile(accountId: string | null | undefined) {
  return useQuery<ScoringWeightProfile | null>({
    queryKey: ['account-scoring-profile', accountId],
    queryFn: async () => {
      if (!accountId) return null;

      const { data, error } = await supabase
        .from('scoring_weight_profiles')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No rows
        throw error;
      }

      return data;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new scoring weight profile.
 */
export function useCreateScoringProfile() {
  const queryClient = useQueryClient();
  const { agency } = useActiveAgency();

  return useMutation<ScoringWeightProfile, Error, CreateScoringWeightProfileInput>({
    mutationFn: async (input) => {
      // Validate weights sum to 100
      const total = input.price_weight + input.coverage_weight + input.carrier_weight +
                    input.deductible_weight + input.value_weight;
      if (total !== 100) {
        throw new Error(`Weights must sum to 100 (currently ${total})`);
      }

      const { data, error } = await supabase
        .from('scoring_weight_profiles')
        .insert({
          agency_workspace_id: input.account_id ? null : agency?.id, // Account profiles don't need agency
          account_id: input.account_id || null,
          name: input.name,
          price_weight: input.price_weight,
          coverage_weight: input.coverage_weight,
          carrier_weight: input.carrier_weight,
          deductible_weight: input.deductible_weight,
          value_weight: input.value_weight,
          is_default: input.is_default || false,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scoring-weight-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['effective-scoring-profile'] });
      queryClient.invalidateQueries({ queryKey: ['account-scoring-profile'] });

      toast.success('Scoring profile created', {
        description: `"${data.name}" is now available for quote scoring.`,
      });
    },
    onError: (error) => {
      logger.error('Failed to create scoring profile', { error });
      toast.error('Failed to create profile', { description: error.message });
    },
  });
}

/**
 * Update an existing scoring weight profile.
 */
export function useUpdateScoringProfile() {
  const queryClient = useQueryClient();

  return useMutation<ScoringWeightProfile, Error, UpdateScoringWeightProfileInput>({
    mutationFn: async ({ id, ...input }) => {
      // If updating weights, validate they sum to 100
      if (input.price_weight !== undefined || input.coverage_weight !== undefined ||
          input.carrier_weight !== undefined || input.deductible_weight !== undefined ||
          input.value_weight !== undefined) {
        // Need to fetch current values and merge
        const { data: current } = await supabase
          .from('scoring_weight_profiles')
          .select('price_weight, coverage_weight, carrier_weight, deductible_weight, value_weight')
          .eq('id', id)
          .single();

        if (current) {
          const newWeights = {
            price_weight: input.price_weight ?? current.price_weight,
            coverage_weight: input.coverage_weight ?? current.coverage_weight,
            carrier_weight: input.carrier_weight ?? current.carrier_weight,
            deductible_weight: input.deductible_weight ?? current.deductible_weight,
            value_weight: input.value_weight ?? current.value_weight,
          };
          const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
          if (total !== 100) {
            throw new Error(`Weights must sum to 100 (currently ${total})`);
          }
        }
      }

      const { data, error } = await supabase
        .from('scoring_weight_profiles')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scoring-weight-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['effective-scoring-profile'] });
      queryClient.invalidateQueries({ queryKey: ['account-scoring-profile'] });

      toast.success('Scoring profile updated', {
        description: `"${data.name}" has been updated.`,
      });
    },
    onError: (error) => {
      logger.error('Failed to update scoring profile', { error });
      toast.error('Failed to update profile', { description: error.message });
    },
  });
}

/**
 * Delete a scoring weight profile.
 */
export function useDeleteScoringProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('scoring_weight_profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoring-weight-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['effective-scoring-profile'] });
      queryClient.invalidateQueries({ queryKey: ['account-scoring-profile'] });

      toast.success('Scoring profile deleted');
    },
    onError: (error) => {
      logger.error('Failed to delete scoring profile', { error });
      toast.error('Failed to delete profile', { description: error.message });
    },
  });
}

/**
 * Set a profile as the default for the agency.
 */
export function useSetDefaultProfile() {
  const queryClient = useQueryClient();
  const { agency } = useActiveAgency();

  return useMutation<void, Error, string>({
    mutationFn: async (profileId) => {
      if (!agency?.id) throw new Error('No active agency');

      // First, unset current default
      await supabase
        .from('scoring_weight_profiles')
        .update({ is_default: false })
        .eq('agency_workspace_id', agency.id)
        .is('account_id', null)
        .eq('is_default', true);

      // Set new default
      const { error } = await supabase
        .from('scoring_weight_profiles')
        .update({ is_default: true })
        .eq('id', profileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoring-weight-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['effective-scoring-profile'] });

      toast.success('Default profile updated');
    },
    onError: (error) => {
      logger.error('Failed to set default profile', { error });
      toast.error('Failed to set default', { description: error.message });
    },
  });
}

/**
 * Assign a profile to a specific account.
 */
export function useAssignProfileToAccount() {
  const queryClient = useQueryClient();

  return useMutation<ScoringWeightProfile, Error, { accountId: string; profileId: string }>({
    mutationFn: async ({ accountId, profileId }) => {
      // Get the profile to copy
      const { data: sourceProfile, error: fetchError } = await supabase
        .from('scoring_weight_profiles')
        .select('*')
        .eq('id', profileId)
        .single();

      if (fetchError) throw fetchError;

      // Delete any existing account profile
      await supabase
        .from('scoring_weight_profiles')
        .delete()
        .eq('account_id', accountId);

      // Create account-specific copy
      const { data, error } = await supabase
        .from('scoring_weight_profiles')
        .insert({
          account_id: accountId,
          name: `${sourceProfile.name} (Account Override)`,
          price_weight: sourceProfile.price_weight,
          coverage_weight: sourceProfile.coverage_weight,
          carrier_weight: sourceProfile.carrier_weight,
          deductible_weight: sourceProfile.deductible_weight,
          value_weight: sourceProfile.value_weight,
          is_default: false,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-scoring-profile'] });
      queryClient.invalidateQueries({ queryKey: ['effective-scoring-profile'] });

      toast.success('Profile assigned to account');
    },
    onError: (error) => {
      logger.error('Failed to assign profile to account', { error });
      toast.error('Failed to assign profile', { description: error.message });
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate that weights sum to 100
 */
export function validateWeightsSum(weights: {
  price_weight: number;
  coverage_weight: number;
  carrier_weight: number;
  deductible_weight: number;
  value_weight: number;
}): { valid: boolean; total: number; difference: number } {
  const total = weights.price_weight + weights.coverage_weight + weights.carrier_weight +
                weights.deductible_weight + weights.value_weight;
  return {
    valid: total === 100,
    total,
    difference: 100 - total,
  };
}

/**
 * Get display name for a weight dimension
 */
export function getWeightDimensionLabel(dimension: string): string {
  const labels: Record<string, string> = {
    price_weight: 'Price',
    coverage_weight: 'Coverage',
    carrier_weight: 'Carrier Quality',
    deductible_weight: 'Deductible',
    value_weight: 'Value',
  };
  return labels[dimension] || dimension;
}

/**
 * Get color for a weight dimension (for charts/visualizations)
 */
export function getWeightDimensionColor(dimension: string): string {
  const colors: Record<string, string> = {
    price_weight: '#22c55e', // green
    coverage_weight: '#3b82f6', // blue
    carrier_weight: '#a855f7', // purple
    deductible_weight: '#f59e0b', // amber
    value_weight: '#ec4899', // pink
  };
  return colors[dimension] || '#6b7280';
}
