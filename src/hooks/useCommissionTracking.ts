// ============================================================================
// Commission Tracking Hooks
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  CommissionStructure,
  CommissionStructureCreateInput,
  CommissionStructureUpdateInput,
  CommissionCalculation,
  CommissionCalculationCreateInput,
  CommissionPayment,
  CommissionPaymentCreateInput,
  CommissionPaymentAllocation,
  CommissionPaymentAllocationCreateInput,
  CommissionReport,
  CommissionReportCreateInput,
} from '@/types/commission';

// ============================================================================
// Commission Structures
// ============================================================================

export function useCommissionStructures(accountId?: string, carrierId?: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['commission-structures', accountId, carrierId],
    queryFn: async () => {
      let query = supabase
        .from('commission_structures')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      if (carrierId) {
        query = query.eq('carrier_id', carrierId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CommissionStructure[];
    },
    enabled: !!accountId || !!carrierId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CommissionStructureCreateInput) => {
      const { data, error } = await supabase
        .from('commission_structures')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as CommissionStructure;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-structures'] });
      toast.success('Commission structure created successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to create commission structure: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CommissionStructureUpdateInput }) => {
      const { data, error } = await supabase
        .from('commission_structures')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CommissionStructure;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-structures'] });
      toast.success('Commission structure updated successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to update commission structure: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('commission_structures')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-structures'] });
      toast.success('Commission structure deleted successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete commission structure: ${err.message}`);
    },
  });

  return {
    data,
    isLoading,
    error,
    create: createMutation.mutate,
    update: updateMutation.mutate,
    delete: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============================================================================
// Commission Calculations
// ============================================================================

export function useCommissionCalculations(
  sourceType?: 'policy' | 'quote' | 'renewal',
  sourceId?: string
) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['commission-calculations', sourceType, sourceId],
    queryFn: async () => {
      let query = supabase
        .from('commission_calculations')
        .select('*')
        .order('calculated_at', { ascending: false });

      if (sourceType) {
        query = query.eq('source_type', sourceType);
      }
      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CommissionCalculation[];
    },
    enabled: !!sourceType && !!sourceId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CommissionCalculationCreateInput) => {
      const { data, error } = await supabase
        .from('commission_calculations')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as CommissionCalculation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-calculations'] });
      toast.success('Commission calculated successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to calculate commission: ${err.message}`);
    },
  });

  return {
    data,
    isLoading,
    error,
    create: createMutation.mutate,
    isCreating: createMutation.isPending,
  };
}

// ============================================================================
// Commission Payments
// ============================================================================

export function useCommissionPayments(carrierId?: string, periodStart?: string, periodEnd?: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['commission-payments', carrierId, periodStart, periodEnd],
    queryFn: async () => {
      let query = supabase
        .from('commission_payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (carrierId) {
        query = query.eq('carrier_id', carrierId);
      }
      if (periodStart) {
        query = query.gte('payment_date', periodStart);
      }
      if (periodEnd) {
        query = query.lte('payment_date', periodEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CommissionPayment[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CommissionPaymentCreateInput) => {
      const { data, error } = await supabase
        .from('commission_payments')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as CommissionPayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
      toast.success('Commission payment recorded successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to record commission payment: ${err.message}`);
    },
  });

  return {
    data,
    isLoading,
    error,
    create: createMutation.mutate,
    isCreating: createMutation.isPending,
  };
}

// ============================================================================
// Commission Reports
// ============================================================================

export function useCommissionReports(
  reportType?: string,
  periodStart?: string,
  periodEnd?: string
) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['commission-reports', reportType, periodStart, periodEnd],
    queryFn: async () => {
      let query = supabase
        .from('commission_reports')
        .select('*')
        .order('period_start_date', { ascending: false });

      if (reportType) {
        query = query.eq('report_type', reportType);
      }
      if (periodStart) {
        query = query.gte('period_start_date', periodStart);
      }
      if (periodEnd) {
        query = query.lte('period_end_date', periodEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CommissionReport[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CommissionReportCreateInput) => {
      const { data, error } = await supabase
        .from('commission_reports')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as CommissionReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-reports'] });
      toast.success('Commission report generated successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to generate commission report: ${err.message}`);
    },
  });

  return {
    data,
    isLoading,
    error,
    create: createMutation.mutate,
    isCreating: createMutation.isPending,
  };
}

