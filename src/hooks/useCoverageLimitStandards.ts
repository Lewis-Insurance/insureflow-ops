/**
 * Coverage Limit Standards Hooks
 *
 * Manage coverage limit thresholds for quote scoring.
 * Standards define minimum, good, and excellent limits for each coverage type.
 *
 * Priority: Agency-specific > System default (null agency_workspace_id)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface CoverageLimitStandard {
  id: string;
  agency_workspace_id: string | null;
  coverage_type: string;
  line_of_business: string;
  min_recommended: number;
  good_limit: number;
  excellent_limit: number;
  limit_parse_mode: 'single' | 'per_person' | 'per_occurrence' | 'aggregate';
  is_active: boolean;
  created_at: string;
}

export interface CreateCoverageLimitStandardInput {
  coverage_type: string;
  line_of_business: string;
  min_recommended: number;
  good_limit: number;
  excellent_limit: number;
  limit_parse_mode?: 'single' | 'per_person' | 'per_occurrence' | 'aggregate';
}

export interface UpdateCoverageLimitStandardInput {
  id: string;
  min_recommended?: number;
  good_limit?: number;
  excellent_limit?: number;
  limit_parse_mode?: 'single' | 'per_person' | 'per_occurrence' | 'aggregate';
  is_active?: boolean;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch coverage limit standards for a line of business.
 * Returns effective standards (agency overrides + system defaults).
 */
export function useCoverageLimitStandards(lineOfBusiness: string) {
  const { agency } = useActiveAgency();

  return useQuery<CoverageLimitStandard[]>({
    queryKey: ['coverage-limit-standards', lineOfBusiness, agency?.id],
    queryFn: async () => {
      // Try RPC function first for effective standards resolution
      const { data, error } = await supabase.rpc('get_coverage_limit_standards', {
        p_line_of_business: lineOfBusiness.toLowerCase(),
        p_agency_workspace_id: agency?.id || null,
      });

      if (error) {
        logger.warn('RPC failed, falling back to direct query', { error: error.message });

        // Fallback: direct query for agency + system defaults
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('coverage_limit_standards')
          .select('*')
          .eq('line_of_business', lineOfBusiness.toLowerCase())
          .eq('is_active', true)
          .or(`agency_workspace_id.is.null,agency_workspace_id.eq.${agency?.id || '00000000-0000-0000-0000-000000000000'}`)
          .order('coverage_type');

        if (fallbackError) throw fallbackError;
        return fallbackData || [];
      }

      return data || [];
    },
    enabled: !!lineOfBusiness,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch all coverage limit standards for an agency (including system defaults).
 * Used for the settings editor to show all available standards.
 */
export function useAllCoverageLimitStandards() {
  const { agency } = useActiveAgency();

  return useQuery<CoverageLimitStandard[]>({
    queryKey: ['all-coverage-limit-standards', agency?.id],
    queryFn: async () => {
      // Get system defaults
      const { data: systemDefaults, error: systemError } = await supabase
        .from('coverage_limit_standards')
        .select('*')
        .is('agency_workspace_id', null)
        .eq('is_active', true)
        .order('line_of_business', { ascending: true })
        .order('coverage_type', { ascending: true });

      if (systemError) throw systemError;

      // Get agency overrides
      let agencyOverrides: CoverageLimitStandard[] = [];
      if (agency?.id) {
        const { data, error } = await supabase
          .from('coverage_limit_standards')
          .select('*')
          .eq('agency_workspace_id', agency.id)
          .order('line_of_business', { ascending: true })
          .order('coverage_type', { ascending: true });

        if (error) throw error;
        agencyOverrides = data || [];
      }

      // Merge: agency overrides take precedence over system defaults
      const overrideKeys = new Set(
        agencyOverrides.map(o => `${o.line_of_business}:${o.coverage_type}`)
      );

      const mergedStandards = [
        ...agencyOverrides,
        ...(systemDefaults || []).filter(
          s => !overrideKeys.has(`${s.line_of_business}:${s.coverage_type}`)
        ),
      ];

      return mergedStandards;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new coverage limit standard for the current agency.
 * This creates an agency-specific override.
 */
export function useCreateCoverageLimitStandard() {
  const queryClient = useQueryClient();
  const { agency } = useActiveAgency();

  return useMutation<CoverageLimitStandard, Error, CreateCoverageLimitStandardInput>({
    mutationFn: async (input) => {
      if (!agency?.id) {
        throw new Error('No active agency selected');
      }

      const { data, error } = await supabase
        .from('coverage_limit_standards')
        .insert({
          agency_workspace_id: agency.id,
          ...input,
          limit_parse_mode: input.limit_parse_mode || 'single',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coverage-limit-standards'] });
      queryClient.invalidateQueries({ queryKey: ['all-coverage-limit-standards'] });

      toast.success('Coverage standard created', {
        description: `${data.coverage_type} limits for ${data.line_of_business} have been set.`,
      });
    },
    onError: (error) => {
      logger.error('Failed to create coverage limit standard', { error });
      toast.error('Failed to create standard', { description: error.message });
    },
  });
}

/**
 * Update an existing coverage limit standard.
 */
export function useUpdateCoverageLimitStandard() {
  const queryClient = useQueryClient();

  return useMutation<CoverageLimitStandard, Error, UpdateCoverageLimitStandardInput>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase
        .from('coverage_limit_standards')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coverage-limit-standards'] });
      queryClient.invalidateQueries({ queryKey: ['all-coverage-limit-standards'] });

      toast.success('Coverage standard updated', {
        description: `${data.coverage_type} limits have been updated.`,
      });
    },
    onError: (error) => {
      logger.error('Failed to update coverage limit standard', { error });
      toast.error('Failed to update standard', { description: error.message });
    },
  });
}

/**
 * Delete a coverage limit standard (agency-specific only).
 * System defaults cannot be deleted, only overridden.
 */
export function useDeleteCoverageLimitStandard() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('coverage_limit_standards')
        .delete()
        .eq('id', id)
        .not('agency_workspace_id', 'is', null); // Only allow deleting agency-specific

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-limit-standards'] });
      queryClient.invalidateQueries({ queryKey: ['all-coverage-limit-standards'] });

      toast.success('Coverage standard deleted', {
        description: 'Standard removed. System defaults will now apply.',
      });
    },
    onError: (error) => {
      logger.error('Failed to delete coverage limit standard', { error });
      toast.error('Failed to delete standard', { description: error.message });
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a limit amount for display (e.g., 250000 -> "$250K")
 */
export function formatLimitAmount(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

/**
 * Get tier color class based on adequacy tier
 */
export function getTierColorClass(tier: string): string {
  switch (tier) {
    case 'excellent':
      return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
    case 'good':
      return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
    case 'at_minimum':
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
    case 'below_minimum':
      return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
    default:
      return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
  }
}

/**
 * Get tier label for display
 */
export function getTierLabel(tier: string): string {
  switch (tier) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'at_minimum':
      return 'Minimum';
    case 'below_minimum':
      return 'Below Minimum';
    default:
      return tier;
  }
}
