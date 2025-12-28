import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface MonitorablePull {
  id: string;
  canopy_pull_id: string;
  status: string;
  lead_id?: string;
  account_id?: string;
  completed_at?: string;
  policy_count: number;
  carrier_count: number;
  monitoring_status: string;
  last_refresh?: string;
  next_refresh_due?: string;
  is_due_for_refresh: boolean;
  requires_reconnect: boolean;
  refresh_count: number;
}

interface MonitoringListResponse {
  success: boolean;
  pulls: MonitorablePull[];
  total: number;
  due_count: number;
}

interface RefreshResponse {
  success: boolean;
  message?: string;
  pull_id?: string;
  canopy_pull_id?: string;
  next_refresh_due?: string;
  error?: string;
  status?: string;
}

interface DuePullsResponse {
  success: boolean;
  due_pulls: Array<{
    pull_id: string;
    canopy_pull_id: string;
    lead_id?: string;
    last_refresh?: string;
    due_since: string;
  }>;
  count: number;
  checked_at: string;
}

export function useMonitorablePulls() {
  return useQuery<MonitoringListResponse>({
    queryKey: ['canopy-monitoring', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('canopy-monitoring', {
        body: { action: 'list' },
      });

      if (error) {
        logger.error('Failed to fetch monitorable pulls', { error: error.message });
        throw error;
      }

      return data as MonitoringListResponse;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useDuePulls() {
  return useQuery<DuePullsResponse>({
    queryKey: ['canopy-monitoring', 'due'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('canopy-monitoring', {
        body: { action: 'check_due' },
      });

      if (error) {
        logger.error('Failed to check due pulls', { error: error.message });
        throw error;
      }

      return data as DuePullsResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRefreshPull() {
  const queryClient = useQueryClient();

  return useMutation<RefreshResponse, Error, { pullId?: string; canopyPullId?: string }>({
    mutationFn: async ({ pullId, canopyPullId }) => {
      const { data, error } = await supabase.functions.invoke('canopy-monitoring', {
        body: {
          action: 'refresh',
          pull_id: pullId,
          canopy_pull_id: canopyPullId,
        },
      });

      if (error) {
        logger.error('Failed to trigger refresh', { error: error.message });
        throw error;
      }

      return data as RefreshResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canopy-monitoring'] });
      queryClient.invalidateQueries({ queryKey: ['canopy-pulls'] });
    },
  });
}

export function useRefreshAllDue() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; refreshed: number; total: number }>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('canopy-monitoring', {
        body: { action: 'refresh_all_due' },
      });

      if (error) {
        logger.error('Failed to refresh all due pulls', { error: error.message });
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canopy-monitoring'] });
      queryClient.invalidateQueries({ queryKey: ['canopy-pulls'] });
    },
  });
}

export function useMonitoringStatus(pullId: string) {
  return useQuery({
    queryKey: ['canopy-monitoring', 'status', pullId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_monitorings')
        .select('*')
        .eq('pull_id', pullId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Failed to fetch monitoring status', { error: error.message });
        throw error;
      }

      return data;
    },
    enabled: !!pullId,
  });
}
