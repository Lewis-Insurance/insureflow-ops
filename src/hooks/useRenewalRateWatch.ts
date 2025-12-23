/**
 * React Query hooks for Renewal Rate Watch module
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// =============================================================================
// TYPES
// =============================================================================

export interface RateWatchWorkspace {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  account_id: string | null;
  policy_id: string | null;
  status: 'draft' | 'processing' | 'ready' | 'reviewed' | 'sent' | 'archived';
  recommendation_status: 'pending' | 'switch_recommended' | 'stay_recommended' | 'options_presented' | 'no_better_option' | null;
  recommendation_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  accounts?: any;
}

export interface BundleSnapshot {
  id: string;
  workspace_id: string;
  bundle_role: 'CURRENT' | 'RENEWAL' | 'QUOTE';
  carrier_name: string | null;
  document_ids: string[];
  snapshot_json: Record<string, any>;
  term_premium: number | null;
  effective_date: string | null;
  expiration_date: string | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  fields_extracted: number;
}

export interface ComparisonResult {
  id: string;
  workspace_id: string;
  current_term_premium: number | null;
  renewal_term_premium: number | null;
  renewal_increase_amount: number | null;
  renewal_increase_percent: number | null;
  quote_comparisons: QuoteComparison[];
  best_alternative_carrier: string | null;
  best_alternative_savings: number | null;
  recommendation_type: 'switch' | 'stay' | 'review_options' | 'insufficient_data' | null;
  recommendation_reason: string | null;
  computed_at: string;
}

export interface QuoteComparison {
  carrier: string;
  bundle_id: string;
  term_premium: number | null;
  savings_vs_renewal: number | null;
  parity_score: number;
  critical_differences: string[];
  recommendation: string;
}

export interface ReportArtifact {
  id: string;
  workspace_id: string;
  artifact_type: 'summary_pdf' | 'summary_html' | 'full_report_pdf' | 'internal_appendix';
  storage_path: string | null;
  content_html: string | null;
  generated_at: string;
  version: number;
}

export interface EmailDraft {
  id: string;
  workspace_id: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  to_email: string | null;
  to_name: string | null;
  status: 'draft' | 'edited' | 'approved' | 'sent' | 'failed';
  generated_at: string;
  edited_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
}

// =============================================================================
// WORKSPACE HOOKS
// =============================================================================

/**
 * Get all Rate Watch workspaces
 */
export const useRateWatchWorkspaces = () => {
  return useQuery({
    queryKey: ['rate-watch-workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*, accounts(*)')
        .eq('task_type', 'renewal_rate_watch')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as RateWatchWorkspace[];
    },
  });
};

/**
 * Get a single Rate Watch workspace with full details
 */
export const useRateWatchWorkspace = (workspaceId: string | null) => {
  return useQuery({
    queryKey: ['rate-watch-workspace', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from('workspaces')
        .select('*, accounts(*)')
        .eq('id', workspaceId)
        .single();

      if (error) throw error;
      return data as RateWatchWorkspace;
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      const data = query.state.data as RateWatchWorkspace | null;
      if (data?.status === 'processing') return 2000;
      return false;
    },
  });
};

/**
 * Create a new Rate Watch workspace
 */
export const useCreateRateWatchWorkspace = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      account_id?: string;
      policy_id?: string;
      ao_renewal_id?: string;
      lob?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // NOTE: public.workspaces does NOT have ao_renewal_id or lob columns.
      // We store config in analysis_output JSON, and we link ao_renewals separately (below).
      const analysis_output = {
        rate_watch: {
          lob: params.lob ?? null,
          ao_renewal_id: params.ao_renewal_id ?? null,
        },
      };

      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          name: params.name,
          task_type: 'renewal_rate_watch',
          account_id: params.account_id || null,
          policy_id: params.policy_id || null,
          status: 'draft',
          created_by: user.id,
          client_name: null,
          analysis_output,
        })
        .select()
        .single();

      if (error) throw error;

      // Link to ao_renewal if provided
      if (params.ao_renewal_id) {
        await supabase
          .from('ao_renewals')
          .update({ rate_watch_workspace_id: data.id, rate_watch_status: 'pending' })
          .eq('id', params.ao_renewal_id);
      }

      return data as RateWatchWorkspace;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['ao-renewals'] });
      toast({
        title: 'Rate Watch Created',
        description: `Created ${data.name}`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// =============================================================================
// DOCUMENT HOOKS
// =============================================================================

/**
 * Get documents for a Rate Watch workspace
 */
export const useRateWatchDocuments = (workspaceId: string | null) => {
  return useQuery({
    queryKey: ['rate-watch-documents', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from('workspace_documents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Add a document to a Rate Watch workspace
 */
export const useAddRateWatchDocument = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      workspace_id: string;
      doc_role: 'CURRENT' | 'RENEWAL' | 'QUOTE';
      carrier_name?: string;
      file: File;
    }) => {
      // Upload to storage
      const fileName = `${Date.now()}-${params.file.name}`;
      const storagePath = `rate-watch/${params.workspace_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, params.file);

      if (uploadError) throw uploadError;

      // Create workspace_document record
      const { data, error } = await supabase
        .from('workspace_documents')
        .insert({
          workspace_id: params.workspace_id,
          doc_role: params.doc_role,
          carrier_name: params.carrier_name || null,
          filename: params.file.name,
          storage_path: storagePath,
          file_size_bytes: params.file.size,
          mime_type: params.file.type,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-documents', data.workspace_id] });
      toast({ title: 'Document uploaded' });
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// =============================================================================
// COMPARISON HOOKS
// =============================================================================

/**
 * Get bundle snapshots for a workspace
 */
export const useBundleSnapshots = (workspaceId: string | null) => {
  return useQuery({
    queryKey: ['bundle-snapshots', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from('bundle_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('bundle_role', { ascending: true });

      if (error) throw error;
      return data as BundleSnapshot[];
    },
    enabled: !!workspaceId,
  });
};

/**
 * Get comparison results for a workspace
 */
export const useComparisonResult = (workspaceId: string | null) => {
  return useQuery({
    queryKey: ['comparison-result', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from('renewal_comparison_results')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) throw error;
      return data as ComparisonResult | null;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Run the Rate Watch pipeline
 */
export const useRunRateWatchPipeline = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      workspace_id: string;
      action: 'process_documents' | 'compute_comparison' | 'generate_report' | 'generate_email' | 'full_pipeline';
    }) => {
      const response = await supabase.functions.invoke('renewal-rate-watch', {
        body: params,
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-workspace', variables.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['bundle-snapshots', variables.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['comparison-result', variables.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['rate-watch-report', variables.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ['rate-watch-email', variables.workspace_id] });
      toast({
        title: 'Pipeline Complete',
        description: data.recommendation 
          ? `Recommendation: ${data.recommendation}` 
          : 'Processing complete',
      });
    },
    onError: (error) => {
      toast({
        title: 'Pipeline Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// =============================================================================
// REPORT & EMAIL HOOKS
// =============================================================================

/**
 * Get report artifacts for a workspace
 */
export const useRateWatchReport = (workspaceId: string | null) => {
  return useQuery({
    queryKey: ['rate-watch-report', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from('renewal_report_artifacts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('artifact_type', 'summary_html')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ReportArtifact | null;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Get email draft for a workspace
 */
export const useRateWatchEmail = (workspaceId: string | null) => {
  return useQuery({
    queryKey: ['rate-watch-email', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from('renewal_email_drafts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as EmailDraft | null;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Update email draft
 */
export const useUpdateEmailDraft = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      email_id: string;
      subject?: string;
      body_html?: string;
      body_text?: string;
      status?: EmailDraft['status'];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('renewal_email_drafts')
        .update({
          subject: params.subject,
          body_html: params.body_html,
          body_text: params.body_text,
          status: params.status,
          edited_at: new Date().toISOString(),
          edited_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.email_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-email', data.workspace_id] });
      toast({ title: 'Email draft saved' });
    },
    onError: (error) => {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};


