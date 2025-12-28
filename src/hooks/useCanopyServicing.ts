import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

type ServicingActionType =
  | 'add_vehicle'
  | 'remove_vehicle'
  | 'update_vehicle'
  | 'add_driver'
  | 'remove_driver'
  | 'update_driver'
  | 'update_coverages'
  | 'update_address'
  | 'request_id_card'
  | 'request_declarations';

interface ServicingAction {
  id: string;
  action_type: ServicingActionType;
  status: 'pending' | 'submitted' | 'waiting_confirmation' | 'completed' | 'error';
  requested_at: string;
  completed_at?: string;
  confirmation_required: boolean;
  pull_id: string;
  canopy_pull_id?: string;
}

interface ServicingActionDetail extends ServicingAction {
  request_data?: Record<string, unknown>;
  carrier_response?: Record<string, unknown>;
  confirmation_url?: string;
  confirmation_deadline?: string;
}

interface CarrierCapabilities {
  success: boolean;
  capabilities: string[];
  carrier_name: string;
  cached?: boolean;
}

interface SubmitActionRequest {
  pullId?: string;
  canopyPullId?: string;
  policyId?: string;
  actionType: ServicingActionType;
  actionData: Record<string, unknown>;
}

interface SubmitActionResponse {
  success: boolean;
  action_id: string;
  canopy_action_id?: string;
  status: string;
  confirmation_required: boolean;
  confirmation_url?: string;
  error?: string;
}

export function useServicingActions(pullId?: string) {
  return useQuery<{ actions: ServicingAction[]; total: number }>({
    queryKey: ['canopy-servicing', 'list', pullId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('canopy-servicing', {
        body: {
          action: 'list',
          pull_id: pullId,
        },
      });

      if (error) {
        logger.error('Failed to fetch servicing actions', { error: error.message });
        throw error;
      }

      return data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useServicingActionStatus(actionId: string) {
  return useQuery<{ success: boolean; action: ServicingActionDetail }>({
    queryKey: ['canopy-servicing', 'status', actionId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('canopy-servicing', {
        body: {
          action: 'status',
          servicing_action_id: actionId,
        },
      });

      if (error) {
        logger.error('Failed to fetch action status', { error: error.message });
        throw error;
      }

      return data;
    },
    enabled: !!actionId,
    refetchInterval: (data) => {
      // Poll every 5 seconds if action is pending/submitted
      const status = data?.action?.status;
      if (status === 'pending' || status === 'submitted' || status === 'waiting_confirmation') {
        return 5000;
      }
      return false;
    },
  });
}

export function useCarrierCapabilities(pullId?: string, canopyPullId?: string) {
  return useQuery<CarrierCapabilities>({
    queryKey: ['canopy-servicing', 'capabilities', pullId || canopyPullId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('canopy-servicing', {
        body: {
          action: 'capabilities',
          pull_id: pullId,
          canopy_pull_id: canopyPullId,
        },
      });

      if (error) {
        logger.error('Failed to fetch carrier capabilities', { error: error.message });
        throw error;
      }

      return data as CarrierCapabilities;
    },
    enabled: !!(pullId || canopyPullId),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours (capabilities rarely change)
  });
}

export function useSubmitServicingAction() {
  const queryClient = useQueryClient();

  return useMutation<SubmitActionResponse, Error, SubmitActionRequest>({
    mutationFn: async ({ pullId, canopyPullId, policyId, actionType, actionData }) => {
      const { data, error } = await supabase.functions.invoke('canopy-servicing', {
        body: {
          action: 'submit',
          pull_id: pullId,
          canopy_pull_id: canopyPullId,
          policy_id: policyId,
          action_type: actionType,
          action_data: actionData,
        },
      });

      if (error) {
        logger.error('Failed to submit servicing action', { error: error.message });
        throw error;
      }

      return data as SubmitActionResponse;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['canopy-servicing', 'list', variables.pullId],
      });
    },
  });
}

export function useConfirmServicingAction() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message?: string; error?: string }, Error, string>({
    mutationFn: async (actionId) => {
      const { data, error } = await supabase.functions.invoke('canopy-servicing', {
        body: {
          action: 'confirm',
          servicing_action_id: actionId,
        },
      });

      if (error) {
        logger.error('Failed to confirm servicing action', { error: error.message });
        throw error;
      }

      return data;
    },
    onSuccess: (_, actionId) => {
      queryClient.invalidateQueries({
        queryKey: ['canopy-servicing', 'status', actionId],
      });
      queryClient.invalidateQueries({
        queryKey: ['canopy-servicing', 'list'],
      });
    },
  });
}

// Helper hook for common servicing actions
export function useAddVehicle(pullId: string) {
  const submitAction = useSubmitServicingAction();

  return {
    ...submitAction,
    addVehicle: (vehicleData: {
      year: number;
      make: string;
      model: string;
      vin?: string;
      usage_type?: string;
      annual_mileage?: number;
    }) => {
      return submitAction.mutateAsync({
        pullId,
        actionType: 'add_vehicle',
        actionData: vehicleData,
      });
    },
  };
}

export function useRemoveVehicle(pullId: string) {
  const submitAction = useSubmitServicingAction();

  return {
    ...submitAction,
    removeVehicle: (vehicleId: string, vin?: string) => {
      return submitAction.mutateAsync({
        pullId,
        actionType: 'remove_vehicle',
        actionData: { vehicle_id: vehicleId, vin },
      });
    },
  };
}

export function useAddDriver(pullId: string) {
  const submitAction = useSubmitServicingAction();

  return {
    ...submitAction,
    addDriver: (driverData: {
      first_name: string;
      last_name: string;
      date_of_birth: string;
      license_number?: string;
      license_state?: string;
    }) => {
      return submitAction.mutateAsync({
        pullId,
        actionType: 'add_driver',
        actionData: driverData,
      });
    },
  };
}

export function useRequestIdCard(pullId: string) {
  const submitAction = useSubmitServicingAction();

  return {
    ...submitAction,
    requestIdCard: (email?: string) => {
      return submitAction.mutateAsync({
        pullId,
        actionType: 'request_id_card',
        actionData: { email, delivery_method: 'email' },
      });
    },
  };
}

export function useRequestDeclarations(pullId: string) {
  const submitAction = useSubmitServicingAction();

  return {
    ...submitAction,
    requestDeclarations: (email?: string) => {
      return submitAction.mutateAsync({
        pullId,
        actionType: 'request_declarations',
        actionData: { email, delivery_method: 'email' },
      });
    },
  };
}
