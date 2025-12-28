/**
 * CEO Digest Hook
 *
 * Manages CEO digest settings and runs.
 * Used by admin pages to view/edit settings and view digest history.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface CEODigestSettings {
  id: string;
  agency_workspace_id: string;
  enabled: boolean;
  timezone: string;
  send_day_of_week: number;
  send_time_local: string;
  recipients: string[];
  include_pii: boolean;
  thresholds: {
    leads_drop_pct: number;
    quotes_drop_pct: number;
    overdue_tasks_critical: number;
    aging_quotes_days: number;
    canopy_reconnects_critical: number;
    canopy_errors_critical: number;
  };
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CEODigestRun {
  id: string;
  agency_workspace_id: string;
  period_start: string;
  period_end: string;
  timezone: string;
  week_label: string | null;
  recipients: string[];
  facts: FactsPacket | null;
  ai_output: AIOutput | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_tokens_used: number | null;
  status: 'created' | 'computing' | 'generating' | 'sending' | 'sent' | 'skipped' | 'failed';
  idempotency_key: string;
  email_provider: string | null;
  email_result: Record<string, unknown> | null;
  emails_sent: number;
  error: string | null;
  error_code: string | null;
  triggered_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface FactsPacket {
  meta: {
    period_start: string;
    period_end: string;
    timezone: string;
    week_label: string;
    generated_at: string;
    agency_workspace_id: string;
  };
  kpis: Record<string, number>;
  deltas_vs_previous_week: Record<string, {
    current: number;
    previous: number;
    change: number;
    change_pct: number | null;
  }>;
  funnel: Record<string, Record<string, number>>;
  lists: Record<string, Array<Record<string, unknown>>>;
  service_ops: Record<string, unknown>;
  integration_health: Record<string, unknown>;
  alerts: Array<{
    severity: 'critical' | 'warning' | 'info';
    category: string;
    title: string;
    message: string;
    evidence: Record<string, unknown>;
  }>;
  missing_data: string[];
}

export interface AIOutput {
  subject: string;
  preview: string;
  markdown: string;
  critical_alerts: Array<{
    title: string;
    description: string;
    action: string;
  }>;
  ceo_actions: Array<{
    priority: number;
    action: string;
    rationale: string;
    deep_link?: string;
  }>;
}

interface UpdateSettingsPayload {
  enabled?: boolean;
  timezone?: string;
  send_day_of_week?: number;
  send_time_local?: string;
  recipients?: string[];
  include_pii?: boolean;
  thresholds?: Partial<CEODigestSettings['thresholds']>;
}

// ============================================================================
// Hook: useCEODigestSettings
// ============================================================================

export function useCEODigestSettings(agencyWorkspaceId: string | null) {
  const queryClient = useQueryClient();

  // Fetch settings
  const settingsQuery = useQuery({
    queryKey: ['ceo-digest-settings', agencyWorkspaceId],
    queryFn: async () => {
      if (!agencyWorkspaceId) return null;

      const { data, error } = await supabase
        .from('ceo_digest_settings')
        .select('*')
        .eq('agency_workspace_id', agencyWorkspaceId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to fetch CEO digest settings', error);
        throw error;
      }

      return data as CEODigestSettings | null;
    },
    enabled: !!agencyWorkspaceId,
  });

  // Create settings (if none exist)
  const createSettingsMutation = useMutation({
    mutationFn: async (recipients: string[]) => {
      if (!agencyWorkspaceId) throw new Error('Agency workspace ID required');

      const { data, error } = await supabase
        .from('ceo_digest_settings')
        .insert({
          agency_workspace_id: agencyWorkspaceId,
          recipients,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CEODigestSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ceo-digest-settings', agencyWorkspaceId] });
      toast({
        title: 'Settings Created',
        description: 'CEO digest settings have been created.',
      });
    },
    onError: (error: Error) => {
      logger.error('Failed to create CEO digest settings', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: UpdateSettingsPayload) => {
      if (!agencyWorkspaceId) throw new Error('Agency workspace ID required');

      const { data, error } = await supabase
        .from('ceo_digest_settings')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('agency_workspace_id', agencyWorkspaceId)
        .select()
        .single();

      if (error) throw error;
      return data as CEODigestSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ceo-digest-settings', agencyWorkspaceId] });
      toast({
        title: 'Settings Updated',
        description: 'CEO digest settings have been saved.',
      });
    },
    onError: (error: Error) => {
      logger.error('Failed to update CEO digest settings', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    error: settingsQuery.error,
    createSettings: createSettingsMutation.mutate,
    updateSettings: updateSettingsMutation.mutate,
    isCreating: createSettingsMutation.isPending,
    isUpdating: updateSettingsMutation.isPending,
  };
}

// ============================================================================
// Hook: useCEODigestRuns
// ============================================================================

export function useCEODigestRuns(agencyWorkspaceId: string | null, limit = 20) {
  const queryClient = useQueryClient();

  // Fetch runs
  const runsQuery = useQuery({
    queryKey: ['ceo-digest-runs', agencyWorkspaceId, limit],
    queryFn: async () => {
      if (!agencyWorkspaceId) return [];

      const { data, error } = await supabase
        .from('ceo_digest_runs')
        .select('*')
        .eq('agency_workspace_id', agencyWorkspaceId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to fetch CEO digest runs', error);
        throw error;
      }

      return data as CEODigestRun[];
    },
    enabled: !!agencyWorkspaceId,
  });

  // Trigger manual run
  const triggerRunMutation = useMutation({
    mutationFn: async ({ force = false, test = false }: { force?: boolean; test?: boolean }) => {
      if (!agencyWorkspaceId) throw new Error('Agency workspace ID required');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const params = new URLSearchParams({
        agency_workspace_id: agencyWorkspaceId,
      });
      if (force) params.append('force', 'true');
      if (test) params.append('test', 'true');

      const response = await fetch(
        `${supabaseUrl}/functions/v1/weekly-ceo-digest?${params}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            // Note: CRON_SECRET would be needed for production, but for manual trigger
            // we rely on user auth + admin check in the function
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to trigger digest');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ceo-digest-runs', agencyWorkspaceId] });
      toast({
        title: 'Digest Triggered',
        description: `Run ID: ${data.run_id}, Status: ${data.status}`,
      });
    },
    onError: (error: Error) => {
      logger.error('Failed to trigger CEO digest', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    runs: runsQuery.data || [],
    isLoading: runsQuery.isLoading,
    error: runsQuery.error,
    triggerRun: triggerRunMutation.mutate,
    isTriggering: triggerRunMutation.isPending,
    refetch: runsQuery.refetch,
  };
}

// ============================================================================
// Hook: useCEODigestRunDetail
// ============================================================================

export function useCEODigestRunDetail(runId: string | null) {
  return useQuery({
    queryKey: ['ceo-digest-run', runId],
    queryFn: async () => {
      if (!runId) return null;

      const { data, error } = await supabase
        .from('ceo_digest_runs')
        .select('*')
        .eq('id', runId)
        .single();

      if (error) {
        logger.error('Failed to fetch CEO digest run', error);
        throw error;
      }

      return data as CEODigestRun;
    },
    enabled: !!runId,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'UTC', label: 'UTC' },
];

export function getStatusColor(status: CEODigestRun['status']): string {
  switch (status) {
    case 'sent':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'skipped':
      return 'bg-yellow-100 text-yellow-800';
    case 'created':
    case 'computing':
    case 'generating':
    case 'sending':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getSeverityColor(severity: 'critical' | 'warning' | 'info'): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'info':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}
