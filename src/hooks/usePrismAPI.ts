/**
 * Prism AI API Hooks
 * 
 * React Query hooks for interacting with the Prism API
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  PrismRunRequest,
  PrismRunResponse,
  PrismRunStatus,
  PrismUsageStats,
  PrismMode,
  PrismDepth,
  PrismAPIError,
} from '@/types/prism-api';

// Get Supabase project URL from environment
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lrqajzwcmdwahnjyidgv.supabase.co';
const PRISM_API_BASE = `${SUPABASE_URL}/functions/v1/prism-api`;

// =============================================================================
// HELPER: Get API Key
// =============================================================================

async function getPrismAPIKey(): Promise<string> {
  // Check if user has API key in their profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('prism_api_key')
    .eq('id', (await supabase.auth.getUser()).data.user?.id)
    .single();

  if (profile?.prism_api_key) {
    return profile.prism_api_key;
  }

  // Fallback to system-wide key (if stored in env or config)
  const systemKey = import.meta.env.VITE_PRISM_API_KEY;
  if (systemKey) {
    return systemKey;
  }

  throw new Error('Prism API key not found. Please configure your API key in settings.');
}

// =============================================================================
// RUN PRISM REQUEST
// =============================================================================

export function usePrismRun() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: PrismRunRequest): Promise<PrismRunResponse> => {
      const apiKey = await getPrismAPIKey();

      const response = await fetch(`${PRISM_API_BASE}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          mode: request.mode || 'sequential',
          depth: request.depth || 'synthesis',
          webhook_url: request.webhook_url,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new PrismAPIError(
          error.error || `Request failed: ${response.statusText}`,
          response.status,
          error.code
        );
      }

      const data = await response.json();

      // Store run in local database for tracking
      const user = (await supabase.auth.getUser()).data.user;
      if (user && data.run_id) {
        await supabase.from('prism_runs').insert({
          user_id: user.id,
          prompt: request.prompt,
          mode: request.mode || 'sequential',
          depth: request.depth || 'synthesis',
          run_id: data.run_id,
          status: data.status || 'pending',
          cycles_completed: data.cycles_completed || 0,
          final_output: data.final_output || null,
          tokens_used: data.usage?.total_tokens || null,
          cost: data.usage?.estimated_cost || null,
        });
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prism-runs'] });
      queryClient.invalidateQueries({ queryKey: ['prism-usage'] });
      
      if (data.status === 'complete') {
        toast({
          title: 'Prism analysis complete',
          description: `Completed ${data.cycles_completed || 0} cycles`,
        });
      } else {
        toast({
          title: 'Prism run started',
          description: 'Analysis is in progress...',
        });
      }
    },
    onError: (error: PrismAPIError) => {
      let message = error.message;
      if (error.statusCode === 401) {
        message = 'Invalid API key. Please check your Prism API key in settings.';
      } else if (error.statusCode === 429) {
        message = 'Rate limit exceeded. Please try again later.';
      } else if (error.statusCode === 413) {
        message = 'Prompt too large. Maximum 50,000 characters.';
      }

      toast({
        title: 'Prism API Error',
        description: message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// GET RUN STATUS
// =============================================================================

export function usePrismRunStatus(runId: string | null) {
  return useQuery({
    queryKey: ['prism-run', runId],
    queryFn: async (): Promise<PrismRunStatus> => {
      if (!runId) throw new Error('Run ID is required');

      const apiKey = await getPrismAPIKey();

      const response = await fetch(`${PRISM_API_BASE}/run/${runId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new PrismAPIError(
          `Failed to fetch run status: ${response.statusText}`,
          response.status
        );
      }

      return response.json();
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data as PrismRunStatus | undefined;
      // Poll every 2 seconds if still running
      return data?.status === 'running' || data?.status === 'pending' ? 2000 : false;
    },
  });
}

// =============================================================================
// GET USAGE STATS
// =============================================================================

export function usePrismUsage() {
  return useQuery({
    queryKey: ['prism-usage'],
    queryFn: async (): Promise<PrismUsageStats> => {
      const apiKey = await getPrismAPIKey();

      const response = await fetch(`${PRISM_API_BASE}/usage`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new PrismAPIError(
          `Failed to fetch usage stats: ${response.statusText}`,
          response.status
        );
      }

      return response.json();
    },
  });
}

// =============================================================================
// GET USER'S RUN HISTORY
// =============================================================================

export function usePrismRunHistory(limit = 20) {
  return useQuery({
    queryKey: ['prism-runs', limit],
    queryFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return [];

      const { data, error } = await supabase
        .from('prism_runs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

// =============================================================================
// SAVE RUN TO FAVORITES
// =============================================================================

export function useSavePrismRun() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase
        .from('prism_runs')
        .update({ is_favorite: true })
        .eq('id', runId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prism-runs'] });
      toast({
        title: 'Saved',
        description: 'Run saved to favorites',
      });
    },
  });
}

