/**
 * Professional Liability / Errors & Omissions (E&O) Extraction Hook
 *
 * Provides functionality to extract E&O policy details from uploaded documents
 * and manage E&O-specific data including:
 * - Policy identity and dates
 * - Claims-made specifics (retroactive date, ERP/Tail)
 * - Limits (per claim, aggregate, defense costs)
 * - Deductible/retention details
 * - Exclusions and endorsements
 * - Premium breakdown
 *
 * Uses Azure Document Intelligence + Claude for evidence-backed extraction.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  EOPolicyDetails,
  EOExclusion,
  EOEndorsement,
  EOPriorAct,
  EOEvidenceCatalog,
  EOExtractionJob,
  EOPolicyDetailsCreateInput,
  EOPolicyDetailsUpdateInput,
} from '@/types/professional-liability-eo';

// =============================================================================
// EVIDENCE TYPES
// =============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export interface EvidenceEntry {
  evidenceId: string;
  sourceType: 'key_value' | 'table_cell' | 'text_span' | 'layout_element';
  label: string | null;
  value: string;
  normalizedValue: string;
  confidence: number;
  pageNumber: number;
  boundingBox: BoundingBox | null;
  tableContext?: {
    tableIndex: number;
    rowIndex: number;
    columnIndex: number;
    columnHeader?: string;
    rowHeader?: string;
  };
  tags: string[];
}

export interface EOEvidenceCatalogHook {
  id: string;
  policy_id: string;
  document_id: string | null;
  entries: Record<string, EvidenceEntry>;
  by_field: Record<string, string[]>;
  stats: {
    total_entries: number;
    avg_confidence: number;
    page_count: number;
  };
  created_at: string;
}

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractEOOptions {
  documentId: string;
  policyId: string;
  documentType?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page';
}

export function useExtractEOPolicy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (options: ExtractEOOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-eo-policy', {
        body: {
          document_id: options.documentId,
          policy_id: options.policyId,
          document_type: options.documentType || 'policy',
        },
      });

      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || 'Extraction failed');
      }

      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['eo-details', variables.policyId] });
      queryClient.invalidateQueries({ queryKey: ['eo-extraction-jobs', variables.policyId] });
      queryClient.invalidateQueries({ queryKey: ['eo-evidence-catalog', variables.policyId] });
      toast({
        title: 'E&O extraction started',
        description: 'Document is being processed. Results will appear shortly.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Extraction failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// E&O DETAILS QUERY
// =============================================================================

export function useEOPolicyDetails(policyId: string | null) {
  return useQuery({
    queryKey: ['eo-details', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_eo_details')
        .select('*')
        .eq('policy_id', policyId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as EOPolicyDetails;
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// E&O DETAILS MUTATIONS
// =============================================================================

export function useUpdateEOPolicyDetails(policyId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: EOPolicyDetailsUpdateInput) => {
      const { data, error } = await supabase
        .from('policy_eo_details')
        .update(input)
        .eq('policy_id', policyId)
        .select()
        .single();

      if (error) throw error;
      return data as EOPolicyDetails;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eo-details', policyId] });
      toast({
        title: 'E&O details updated',
        description: 'Policy details have been saved.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// EXCLUSIONS
// =============================================================================

export function useEOExclusions(policyId: string | null) {
  return useQuery({
    queryKey: ['eo-exclusions', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_eo_exclusions')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as EOExclusion[];
    },
    enabled: !!policyId,
  });
}

export function useCreateEOExclusion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { policy_id: string; exclusion_type: string; description: string }) => {
      const { data, error } = await supabase
        .from('policy_eo_exclusions')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as EOExclusion;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['eo-exclusions', variables.policy_id] });
      toast({
        title: 'Exclusion added',
        description: 'Exclusion has been added to the policy.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add exclusion',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// ENDORSEMENTS
// =============================================================================

export function useEOEndorsements(policyId: string | null) {
  return useQuery({
    queryKey: ['eo-endorsements', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_eo_endorsements')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as EOEndorsement[];
    },
    enabled: !!policyId,
  });
}

export function useCreateEOEndorsement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { policy_id: string; title: string; form_number?: string }) => {
      const { data, error } = await supabase
        .from('policy_eo_endorsements')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as EOEndorsement;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['eo-endorsements', variables.policy_id] });
      toast({
        title: 'Endorsement added',
        description: 'Endorsement has been added to the policy.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add endorsement',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// PRIOR ACTS
// =============================================================================

export function useEOPriorActs(policyId: string | null) {
  return useQuery({
    queryKey: ['eo-prior-acts', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_eo_prior_acts')
        .select('*')
        .eq('policy_id', policyId)
        .order('act_date', { ascending: false });

      if (error) throw error;
      return (data || []) as EOPriorAct[];
    },
    enabled: !!policyId,
  });
}

export function useCreateEOPriorAct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { policy_id: string; description?: string; act_date?: string }) => {
      const { data, error } = await supabase
        .from('policy_eo_prior_acts')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as EOPriorAct;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['eo-prior-acts', variables.policy_id] });
      toast({
        title: 'Prior act added',
        description: 'Prior act has been recorded.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add prior act',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// EVIDENCE CATALOG
// =============================================================================

export function useEOEvidenceCatalog(policyId: string | null) {
  return useQuery({
    queryKey: ['eo-evidence-catalog', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_eo_evidence_catalog')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as EOEvidenceCatalog;
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EXTRACTION JOBS
// =============================================================================

export function useEOExtractionJobs(policyId: string | null) {
  return useQuery({
    queryKey: ['eo-extraction-jobs', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_eo_extraction_jobs')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as EOExtractionJob[];
    },
    enabled: !!policyId,
    refetchInterval: (query) => {
      const jobs = query.state.data as EOExtractionJob[] | undefined;
      const hasActiveJob = jobs?.some(
        (job) => job.status === 'pending' || job.status === 'ocr_processing' || job.status === 'extracting'
      );
      return hasActiveJob ? 3000 : false; // Poll every 3 seconds if active
    },
  });
}

export function useLatestEOExtractionJob(policyId: string | null) {
  return useQuery({
    queryKey: ['eo-extraction-job-latest', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_eo_extraction_jobs')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as EOExtractionJob;
    },
    enabled: !!policyId,
    refetchInterval: (query) => {
      const job = query.state.data as EOExtractionJob | undefined;
      const isActive = job?.status === 'pending' || job?.status === 'ocr_processing' || job?.status === 'extracting';
      return isActive ? 3000 : false; // Poll every 3 seconds if active
    },
  });
}

// =============================================================================
// POLICY TYPE DETECTION
// =============================================================================

/**
 * Check if a policy is Professional Liability / E&O based on line of business
 */
export function isEOPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('professional') ||
    lob.includes('errors') ||
    lob.includes('omissions') ||
    lob.includes('e&o') ||
    lob.includes('eo') ||
    lob.includes('e & o') ||
    lob.includes('professional liability') ||
    lob.includes('tech eo') ||
    lob.includes('media eo') ||
    lob.includes('architects') ||
    lob.includes('engineers') ||
    lob.includes('real estate eo') ||
    lob.includes('insurance agents eo') ||
    lob.includes('medical professional') ||
    lob.includes('legal professional') ||
    lob.includes('accounting eo')
  );
}

