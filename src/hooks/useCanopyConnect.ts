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
    console.log('[Canopy SDK] Checking if already loaded...');
    if (window.CanopyConnect) {
      console.log('[Canopy SDK] Already loaded');
      resolve();
      return;
    }

    console.log('[Canopy SDK] Creating script element...');
    const script = document.createElement('script');
    script.src = 'https://cdn.usecanopy.com/v2/canopy-connect.js';
    script.async = true;

    script.onload = () => {
      console.log('[Canopy SDK] Script loaded, checking window.CanopyConnect...');
      console.log('[Canopy SDK] window.CanopyConnect =', window.CanopyConnect);
      // Give it a moment to initialize
      setTimeout(() => {
        console.log('[Canopy SDK] After timeout, window.CanopyConnect =', window.CanopyConnect);
        resolve();
      }, 100);
    };

    script.onerror = (e) => {
      console.error('[Canopy SDK] Script failed to load:', e);
      reject(new Error('Failed to load Canopy SDK'));
    };

    console.log('[Canopy SDK] Appending script to head...');
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
    console.log('[Canopy] initiatePull called');
    setIsLoading(true);
    setStatus('initiating');
    setError(null);

    try {
      // Load Canopy SDK if not already loaded
      console.log('[Canopy] Loading SDK...');
      await loadCanopySDK();
      console.log('[Canopy] SDK loaded');

      if (!window.CanopyConnect) {
        throw new Error('Canopy SDK not available');
      }

      // Get public alias from environment
      const publicAlias = import.meta.env.VITE_CANOPY_PUBLIC_ALIAS;
      console.log('[Canopy] Public alias:', publicAlias);

      if (!publicAlias) {
        throw new Error('VITE_CANOPY_PUBLIC_ALIAS not configured');
      }

      // Generate a unique session ID to track this pull
      const sessionId = crypto.randomUUID();
      console.log('[Canopy] Session ID:', sessionId);

      setStatus('pending');

      // Initialize Canopy widget with public alias
      // See: https://docs.usecanopy.com/reference/using-the-sdk
      const handler = window.CanopyConnect.create({
        publicAlias: publicAlias,
        pullMetaData: {
          sessionId: sessionId,
          leadId: options.leadId || null,
          accountId: options.accountId || null,
          mode: options.mode || 'create_lead',
          initiatedAt: new Date().toISOString(),
        },
        onSuccess: (pullData: unknown) => {
          console.log('[Canopy] Pull successful:', pullData);
          setStatus('processing');
          // The webhook will receive the full data and store it
          // We just show success to the user
          toast({
            title: 'Import started',
            description: 'Processing insurance data...',
          });
        },
        onError: (err: Error) => {
          console.error('[Canopy] Error:', err);
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
          console.log('[Canopy] Widget closed');
          setIsLoading(false);
          options.onExit?.();
        }
      });

      // Open the Canopy widget
      console.log('[Canopy] Opening widget...');
      handler.open();

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
