// ============================================================================
// CANOPY CONNECT HOOK
// ============================================================================
// React hook for integrating Canopy Connect insurance data import
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type CanopyPullStatus = 'idle' | 'initiating' | 'pending' | 'authenticated' | 'processing' | 'complete' | 'error';

export interface CanopyPullResult {
  pullId: string;
  canopyPullId: string;
  status: CanopyPullStatus;
  policyCount?: number;
  carrierCount?: number;
  leadId?: string;
  accountId?: string;
  error?: string;
}

export interface UseCanopyConnectOptions {
  leadId?: string;
  accountId?: string;
  mode?: 'create_lead' | 'attach_account';
  onSuccess?: (result: CanopyPullResult) => void;
  onError?: (error: Error) => void;
  onExit?: () => void;
}

export interface UseCanopyConnectReturn {
  initiatePull: () => Promise<void>;
  isLoading: boolean;
  status: CanopyPullStatus;
  pullId: string | null;
  result: CanopyPullResult | null;
  error: Error | null;
  reset: () => void;
}

declare global {
  interface Window {
    CanopyConnect?: {
      create: (config: {
        clientId: string;
        environment: 'sandbox' | 'production';
        onSuccess?: (pullId: string) => void;
        onError?: (error: Error) => void;
        onExit?: () => void;
      }) => {
        open: (options: { linkToken: string }) => void;
        close: () => void;
      };
    };
  }
}

// Load Canopy SDK script
function loadCanopySDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.CanopyConnect) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.canopyconnect.com/v1/sdk.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Canopy SDK'));
    document.head.appendChild(script);
  });
}

export function useCanopyConnect(options: UseCanopyConnectOptions = {}): UseCanopyConnectReturn {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<CanopyPullStatus>('idle');
  const [pullId, setPullId] = useState<string | null>(null);
  const [result, setResult] = useState<CanopyPullResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to pull status updates via realtime
  useEffect(() => {
    if (!pullId) return;

    const channel = supabase
      .channel(`canopy_pull_${pullId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'canopy_pulls',
          filter: `id=eq.${pullId}`
        },
        (payload) => {
          const newStatus = payload.new.status as CanopyPullStatus;
          setStatus(newStatus);

          if (newStatus === 'complete') {
            const pullResult: CanopyPullResult = {
              pullId: payload.new.id,
              canopyPullId: payload.new.canopy_pull_id,
              status: 'complete',
              policyCount: payload.new.policy_count,
              leadId: payload.new.lead_id,
              accountId: payload.new.account_id,
            };
            setResult(pullResult);
            options.onSuccess?.(pullResult);

            toast({
              title: 'Insurance data imported',
              description: `Successfully imported ${payload.new.policy_count || 0} policies`,
            });
          } else if (newStatus === 'error') {
            const errorResult = new Error(payload.new.error_message || 'Import failed');
            setError(errorResult);
            options.onError?.(errorResult);

            toast({
              title: 'Import failed',
              description: payload.new.error_message || 'Failed to import insurance data',
              variant: 'destructive',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pullId, options, toast]);

  const initiatePull = useCallback(async () => {
    setIsLoading(true);
    setStatus('initiating');
    setError(null);

    try {
      // Load Canopy SDK if not already loaded
      await loadCanopySDK();

      if (!window.CanopyConnect) {
        throw new Error('Canopy SDK not available');
      }

      // Call our edge function to create a pull session
      const { data, error: invokeError } = await supabase.functions.invoke('canopy-initiate', {
        body: {
          lead_id: options.leadId,
          account_id: options.accountId,
          mode: options.mode,
        }
      });

      if (invokeError) {
        throw new Error(invokeError.message || 'Failed to initiate Canopy pull');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to create pull session');
      }

      setPullId(data.pull_id);
      setStatus('pending');

      // Initialize Canopy widget
      const handler = window.CanopyConnect.create({
        clientId: data.client_id,
        environment: data.environment || 'sandbox',
        onSuccess: (canopyPullId: string) => {
          console.log('Canopy pull successful:', canopyPullId);
          setStatus('processing');
          // Status will be updated via realtime subscription
        },
        onError: (err: Error) => {
          console.error('Canopy error:', err);
          setError(err);
          setStatus('error');
          options.onError?.(err);

          toast({
            title: 'Import error',
            description: err.message || 'An error occurred during import',
            variant: 'destructive',
          });
        },
        onExit: () => {
          setIsLoading(false);
          options.onExit?.();
        }
      });

      // Open the Canopy widget
      handler.open({ linkToken: data.link_token });

    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Unknown error');
      setError(errorObj);
      setStatus('error');
      setIsLoading(false);
      options.onError?.(errorObj);

      toast({
        title: 'Failed to start import',
        description: errorObj.message,
        variant: 'destructive',
      });
    }
  }, [options, toast]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setStatus('idle');
    setPullId(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    initiatePull,
    isLoading,
    status,
    pullId,
    result,
    error,
    reset,
  };
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

// Hook to fetch Canopy pull data
export function useCanopyPull(pullId: string | null) {
  const [data, setData] = useState<CanopyPullResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!pullId) {
      setData(null);
      return;
    }

    setIsLoading(true);

    const fetchPull = async () => {
      try {
        const { data: pull, error: fetchError } = await supabase
          .from('canopy_pulls')
          .select('*')
          .eq('id', pullId)
          .single();

        if (fetchError) throw fetchError;

        setData({
          pullId: pull.id,
          canopyPullId: pull.canopy_pull_id,
          status: pull.status,
          policyCount: pull.policy_count,
          leadId: pull.lead_id,
          accountId: pull.account_id,
          error: pull.error_message,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch pull'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPull();
  }, [pullId]);

  return { data, isLoading, error };
}

// Hook to fetch Canopy policies for a pull
export function useCanopyPolicies(pullId: string | null) {
  const [policies, setPolicies] = useState<unknown[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!pullId) {
      setPolicies([]);
      return;
    }

    setIsLoading(true);

    const fetchPolicies = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('canopy_policies')
          .select(`
            *,
            canopy_vehicles (*),
            canopy_drivers (*),
            canopy_dwellings (*),
            canopy_claims (*)
          `)
          .eq('pull_id', pullId);

        if (fetchError) throw fetchError;

        setPolicies(data || []);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch policies'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPolicies();
  }, [pullId]);

  return { policies, isLoading, error };
}

// Hook to get quote prefill data from Canopy
export function useCanopyQuotePrefill(pullId: string | null) {
  const [prefillData, setPrefillData] = useState<unknown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!pullId) {
      setPrefillData(null);
      return;
    }

    setIsLoading(true);

    const fetchPrefill = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .rpc('get_canopy_quote_prefill', { p_pull_id: pullId });

        if (fetchError) throw fetchError;

        setPrefillData(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch prefill data'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrefill();
  }, [pullId]);

  return { prefillData, isLoading, error };
}
