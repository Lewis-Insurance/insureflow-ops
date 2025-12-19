// ============================================================================
// SERVICE REQUESTS HOOK
// ============================================================================
// Service requests with RPC-based creation
// ============================================================================

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  PortalServiceRequest,
  ServiceRequestMessage,
  ServiceRequestType,
} from '@/types/portal';

export function useServiceRequests() {
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['portal-service-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_service_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PortalServiceRequest[];
    },
  });

  // Create service request via RPC
  const createRequest = useMutation({
    mutationFn: async (params: {
      request_type: ServiceRequestType;
      request_title: string;
      request_data: Record<string, unknown>;
      policy_id?: string | null;
      prefilled_data?: Record<string, unknown> | null;
    }) => {
      const { data, error } = await supabase.rpc('create_my_service_request', {
        p_request_type: params.request_type,
        p_request_title: params.request_title,
        p_request_data: params.request_data,
        p_policy_id: params.policy_id ?? null,
        p_prefilled_data: params.prefilled_data ?? null,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-service-requests'] });
    },
  });

  // Get messages for a request
  const getRequestMessages = useCallback(async (requestId: string): Promise<ServiceRequestMessage[]> => {
    const { data, error } = await supabase
      .from('portal_service_request_messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data as ServiceRequestMessage[];
  }, []);

  // Add message to a request
  const addMessage = useMutation({
    mutationFn: async ({ requestId, message }: { requestId: string; message: string }) => {
      const { data, error } = await supabase
        .from('portal_service_request_messages')
        .insert({
          request_id: requestId,
          author_type: 'client',
          message_text: message,
          is_internal: false,
          attachments: [],
        })
        .select()
        .single();

      if (error) throw error;
      return data as ServiceRequestMessage;
    },
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({
        queryKey: ['portal-service-request-messages', requestId]
      });
    },
  });

  return {
    requests: requestsQuery.data ?? [],
    isLoading: requestsQuery.isLoading,
    error: requestsQuery.error,
    refetch: requestsQuery.refetch,
    createRequest,
    getRequestMessages,
    addMessage,
  };
}
