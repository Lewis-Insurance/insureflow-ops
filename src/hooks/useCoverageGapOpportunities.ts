import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface CoverageGapRationale {
  rule_key: string;
  trigger_reason: string;
  current_lines: string[];
  missing_lines: string[];
}

interface CoverageGapOpportunity {
  id: string;
  created_at: string;
  updated_at: string;
  agency_workspace_id: string | null;
  account_id: string;
  related_policy_id: string | null;
  opportunity_key: string;
  rule_id: string | null;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  rationale: CoverageGapRationale;
  current_coverage_summary: {
    lines: string[];
    policy_count: number;
    total_premium: number;
  };
  recommended_next_step: string | null;
  estimated_premium: number | null;
  status: 'new' | 'suggested_task_created' | 'contacted' | 'quoted' | 'dismissed' | 'converted';
  dismissed_reason: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  converted_policy_id: string | null;
  converted_at: string | null;
  detection_version: string;
  last_detected_at: string;
}

interface CoverageGapRule {
  id: string;
  created_at: string;
  updated_at: string;
  agency_workspace_id: string | null;
  enabled: boolean;
  rule_key: string;
  name: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high';
  logic: {
    requires?: string[];
    requires_liability_min?: number;
    missing?: string[];
    max_lines?: number;
    eligible_for_bundle?: boolean;
  };
  applies_to_lines: string[];
  recommended_action: string | null;
}

interface InsuranceProfile {
  account_id: string;
  lines_held: string[];
  policy_count: number;
  total_premium: number;
  tenure_days: number;
  max_liability_limit: number;
  has_auto: boolean;
  has_home: boolean;
  has_renters: boolean;
  has_umbrella: boolean;
  has_commercial: boolean;
  has_cyber: boolean;
  has_workers_comp: boolean;
}

interface ListOpportunitiesResult {
  id: string;
  account_id: string;
  account_name: string;
  opportunity_key: string;
  severity: string;
  confidence: number;
  rationale: CoverageGapRationale;
  recommended_next_step: string | null;
  estimated_premium: number | null;
  status: string;
  created_at: string;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * List coverage gap opportunities with filters
 */
export function useCoverageGapOpportunities(params: {
  agencyWorkspaceId: string;
  status?: string;
  severity?: string;
  accountId?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['coverage-gap-opportunities', params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_coverage_gap_opportunities', {
        p_agency_workspace_id: params.agencyWorkspaceId,
        p_status: params.status || null,
        p_severity: params.severity || null,
        p_account_id: params.accountId || null,
        p_limit: params.limit || 100,
        p_offset: params.offset || 0,
      });

      if (error) throw error;
      return data as ListOpportunitiesResult[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!params.agencyWorkspaceId,
  });
}

/**
 * Get a single coverage gap opportunity by ID
 */
export function useCoverageGapOpportunity(opportunityId: string) {
  return useQuery({
    queryKey: ['coverage-gap-opportunity', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coverage_gap_opportunities')
        .select('*')
        .eq('id', opportunityId)
        .single();

      if (error) throw error;
      return data as CoverageGapOpportunity;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!opportunityId,
  });
}

/**
 * Get coverage gap rules
 */
export function useCoverageGapRules(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['coverage-gap-rules', agencyWorkspaceId],
    queryFn: async () => {
      let query = supabase
        .from('coverage_gap_rules')
        .select('*')
        .order('severity', { ascending: false });

      if (agencyWorkspaceId) {
        query = query.or(`agency_workspace_id.is.null,agency_workspace_id.eq.${agencyWorkspaceId}`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CoverageGapRule[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Get account insurance profile
 */
export function useAccountInsuranceProfile(accountId: string) {
  return useQuery({
    queryKey: ['account-insurance-profile', accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_account_insurance_profile', {
        p_account_id: accountId,
      });

      if (error) throw error;
      return data as InsuranceProfile;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!accountId,
  });
}

/**
 * Update opportunity status
 */
export function useUpdateOpportunityStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      opportunityId: string;
      status: 'new' | 'contacted' | 'quoted' | 'dismissed' | 'converted';
      dismissedReason?: string;
      convertedPolicyId?: string;
    }) => {
      const updates: Record<string, unknown> = {
        status: params.status,
        updated_at: new Date().toISOString(),
      };

      if (params.status === 'dismissed') {
        updates.dismissed_reason = params.dismissedReason;
        updates.dismissed_at = new Date().toISOString();
        // dismissed_by will be set by RLS or trigger
      }

      if (params.status === 'converted' && params.convertedPolicyId) {
        updates.converted_policy_id = params.convertedPolicyId;
        updates.converted_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('coverage_gap_opportunities')
        .update(updates)
        .eq('id', params.opportunityId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-opportunity', variables.opportunityId] });

      const statusMessages: Record<string, string> = {
        contacted: 'Opportunity marked as contacted',
        quoted: 'Opportunity marked as quoted',
        dismissed: 'Opportunity dismissed',
        converted: 'Opportunity converted to policy!',
      };

      toast.success(statusMessages[variables.status] || 'Status updated');
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });
}

/**
 * Create or update a coverage gap rule
 */
export function useUpsertCoverageGapRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Partial<CoverageGapRule> & { rule_key: string; name: string }) => {
      const { data, error } = await supabase
        .from('coverage_gap_rules')
        .upsert(rule, {
          onConflict: 'agency_workspace_id,rule_key',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-rules'] });
      toast.success('Coverage gap rule saved');
    },
    onError: (error) => {
      toast.error(`Failed to save rule: ${error.message}`);
    },
  });
}

/**
 * Toggle coverage gap rule enabled status
 */
export function useToggleCoverageGapRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { ruleId: string; enabled: boolean }) => {
      const { data, error } = await supabase
        .from('coverage_gap_rules')
        .update({ enabled: params.enabled })
        .eq('id', params.ruleId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-rules'] });
      toast.success(`Rule ${variables.enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (error) => {
      toast.error(`Failed to toggle rule: ${error.message}`);
    },
  });
}

/**
 * Get coverage gap summary statistics
 */
export function useCoverageGapSummary(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['coverage-gap-summary', agencyWorkspaceId],
    queryFn: async () => {
      let query = supabase
        .from('coverage_gap_opportunities')
        .select('status, severity, estimated_premium');

      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const opportunities = data || [];

      return {
        total: opportunities.length,
        byStatus: {
          new: opportunities.filter(o => o.status === 'new').length,
          contacted: opportunities.filter(o => o.status === 'contacted').length,
          quoted: opportunities.filter(o => o.status === 'quoted').length,
          dismissed: opportunities.filter(o => o.status === 'dismissed').length,
          converted: opportunities.filter(o => o.status === 'converted').length,
        },
        bySeverity: {
          high: opportunities.filter(o => o.severity === 'high').length,
          medium: opportunities.filter(o => o.severity === 'medium').length,
          low: opportunities.filter(o => o.severity === 'low').length,
        },
        potentialPremium: opportunities
          .filter(o => o.status !== 'dismissed' && o.status !== 'converted')
          .reduce((sum, o) => sum + (o.estimated_premium || 0), 0),
        convertedPremium: opportunities
          .filter(o => o.status === 'converted')
          .reduce((sum, o) => sum + (o.estimated_premium || 0), 0),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get opportunities for a specific account
 */
export function useAccountCoverageGaps(accountId: string) {
  return useQuery({
    queryKey: ['account-coverage-gaps', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coverage_gap_opportunities')
        .select('*')
        .eq('account_id', accountId)
        .order('severity', { ascending: false });

      if (error) throw error;
      return data as CoverageGapOpportunity[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!accountId,
  });
}
