/**
 * Workers' Compensation Extraction Hook
 *
 * Provides functionality to extract WC policy details from uploaded documents
 * and manage WC-specific data.
 *
 * UPGRADED: Now includes evidence catalog support for click-to-highlight.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { WCPolicyDetails, WCClassification, WCOfficerElection } from '@/types/workers-comp';

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

export interface WCEvidenceCatalog {
  id: string;
  policyId: string;
  documentId: string | null;
  entries: Record<string, EvidenceEntry>;
  byWCField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
  createdAt: string;
}

export interface ExtractionJob {
  id: string;
  policyId: string;
  documentId: string | null;
  status: 'pending' | 'ocr_processing' | 'extracting' | 'completed' | 'failed';
  ocrStartedAt: string | null;
  ocrCompletedAt: string | null;
  extractionStartedAt: string | null;
  extractionCompletedAt: string | null;
  classificationsExtracted: number;
  officersExtracted: number;
  statesExtracted: number;
  overallConfidence: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractWCOptions {
  documentId: string;
  policyId: string;
  documentType?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement';
}

export function useExtractWCPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractWCOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-wc-policy', {
        body: {
          document_id: documentId,
          policy_id: policyId,
          document_type: documentType,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
    onSuccess: (data, { policyId }) => {
      toast({
        title: 'WC Details Extracted',
        description: `Extracted ${data.classifications_count} classifications, ${data.officers_count} officers, ${data.states_count} states`,
      });
      // Invalidate policy queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['wc-classifications', policyId] });
      queryClient.invalidateQueries({ queryKey: ['wc-officers', policyId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Extraction Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// WC DETAILS QUERY
// =============================================================================

export function useWCPolicyDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-details', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policies')
        .select('wc_details, extraction_source, extraction_confidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return {
        wcDetails: data.wc_details as WCPolicyDetails | null,
        extractionSource: data.extraction_source,
        extractionConfidence: data.extraction_confidence,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// CLASSIFICATIONS QUERY
// =============================================================================

export function useWCClassifications(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-classifications', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_wc_classifications')
        .select('*')
        .eq('policy_id', policyId)
        .order('state', { ascending: true })
        .order('class_code', { ascending: true });

      if (error) throw error;

      return data as WCClassification[];
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// OFFICERS QUERY
// =============================================================================

export function useWCOfficers(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-officers', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_wc_officers')
        .select('*')
        .eq('policy_id', policyId)
        .order('name', { ascending: true });

      if (error) throw error;

      return data.map((o) => ({
        name: o.name,
        title: o.title,
        ownership_percent: o.ownership_percent,
        included: o.is_included,
        annual_remuneration: o.annual_remuneration,
        duties: o.duties,
      })) as WCOfficerElection[];
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// COVERED STATES QUERY
// =============================================================================

export function useWCStates(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-states', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_wc_states')
        .select('*')
        .eq('policy_id', policyId)
        .order('state', { ascending: true });

      if (error) throw error;

      return data;
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EXPERIENCE MOD HISTORY
// =============================================================================

export function useWCExperienceMods(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-experience-mods', policyId],
    queryFn: async () => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_wc_experience_mods')
        .select('*')
        .eq('policy_id', policyId)
        .order('effective_date', { ascending: false });

      if (error) throw error;

      return data;
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// UPDATE WC DETAILS
// =============================================================================

export function useUpdateWCDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      wcDetails,
    }: {
      policyId: string;
      wcDetails: Partial<WCPolicyDetails>;
    }) => {
      // Get existing details
      const { data: existing, error: fetchError } = await supabase
        .from('policies')
        .select('wc_details')
        .eq('id', policyId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing
      const merged = {
        ...(existing.wc_details as object || {}),
        ...wcDetails,
        last_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('policies')
        .update({ wc_details: merged })
        .eq('id', policyId);

      if (updateError) throw updateError;

      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'WC Details Updated',
        description: 'Workers\' Compensation details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['wc-details', policyId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// ADD CLASSIFICATION
// =============================================================================

export function useAddWCClassification() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      classification,
    }: {
      policyId: string;
      classification: Omit<WCClassification, 'id'>;
    }) => {
      const { data, error } = await supabase
        .from('policy_wc_classifications')
        .insert({
          policy_id: policyId,
          state: classification.state,
          class_code: classification.class_code,
          description: classification.description,
          exposure_basis: classification.exposure_basis,
          estimated_payroll: classification.estimated_payroll,
          rate: classification.rate,
          premium: classification.premium,
          is_governing_class: classification.is_governing_class,
          is_standard_exception: classification.is_standard_exception,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Classification Added',
        description: 'WC classification has been added.',
      });
      queryClient.invalidateQueries({ queryKey: ['wc-classifications', policyId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Add',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// ADD OFFICER
// =============================================================================

export function useAddWCOfficer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      officer,
    }: {
      policyId: string;
      officer: WCOfficerElection;
    }) => {
      const { data, error } = await supabase
        .from('policy_wc_officers')
        .insert({
          policy_id: policyId,
          name: officer.name,
          title: officer.title,
          ownership_percent: officer.ownership_percent,
          is_included: officer.included,
          annual_remuneration: officer.annual_remuneration,
          duties: officer.duties,
          officer_type: 'officer',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Officer Added',
        description: 'Officer election has been added.',
      });
      queryClient.invalidateQueries({ queryKey: ['wc-officers', policyId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Add',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// CHECK IF WC POLICY
// =============================================================================

export function isWorkersCompPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (lob.includes('work') && lob.includes('comp')) ||
    lob === 'wc' ||
    lob === 'workers compensation' ||
    lob === 'workers\' compensation';
}

// =============================================================================
// EVIDENCE CATALOG QUERY
// =============================================================================

export function useWCEvidenceCatalog(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-evidence-catalog', policyId],
    queryFn: async (): Promise<WCEvidenceCatalog | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_wc_evidence_catalog')
        .select('*')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        policyId: data.policy_id,
        documentId: data.document_id,
        entries: data.evidence_entries as Record<string, EvidenceEntry>,
        byWCField: data.evidence_by_field as Record<string, string[]>,
        stats: {
          totalEntries: data.total_entries || 0,
          avgConfidence: data.azure_avg_confidence || 0,
          pageCount: data.azure_page_count || 0,
        },
        createdAt: data.created_at,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// FIELD EVIDENCE QUERY
// =============================================================================

export function useWCFieldEvidence(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-field-evidence', policyId],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (!policyId) return {};

      const { data, error } = await supabase
        .from('policies')
        .select('wc_field_evidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return (data.wc_field_evidence as Record<string, string[]>) || {};
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// GET EVIDENCE BY IDS
// =============================================================================

export function useEvidenceByIds(
  policyId: string | undefined,
  evidenceIds: string[]
) {
  const { data: catalog } = useWCEvidenceCatalog(policyId);

  if (!catalog || evidenceIds.length === 0) {
    return { entries: [], boundingBoxes: {} };
  }

  const entries = evidenceIds
    .map(id => catalog.entries[id])
    .filter(Boolean);

  const boundingBoxes: Record<string, BoundingBox> = {};
  for (const entry of entries) {
    if (entry.boundingBox) {
      boundingBoxes[entry.evidenceId] = entry.boundingBox;
    }
  }

  return { entries, boundingBoxes };
}

// =============================================================================
// EXTRACTION JOB STATUS
// =============================================================================

export function useWCExtractionJob(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-extraction-job', policyId],
    queryFn: async (): Promise<ExtractionJob | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_wc_extraction_jobs')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        policyId: data.policy_id,
        documentId: data.document_id,
        status: data.status as ExtractionJob['status'],
        ocrStartedAt: data.ocr_started_at,
        ocrCompletedAt: data.ocr_completed_at,
        extractionStartedAt: data.extraction_started_at,
        extractionCompletedAt: data.extraction_completed_at,
        classificationsExtracted: data.classifications_extracted || 0,
        officersExtracted: data.officers_extracted || 0,
        statesExtracted: data.states_extracted || 0,
        overallConfidence: data.overall_confidence,
        errorMessage: data.error_message,
        createdAt: data.created_at,
      };
    },
    enabled: !!policyId,
    refetchInterval: (data) => {
      // Poll every 2 seconds while extraction is in progress
      if (data?.status === 'pending' || data?.status === 'ocr_processing' || data?.status === 'extracting') {
        return 2000;
      }
      return false;
    },
  });
}

// =============================================================================
// EXTRACTION HISTORY
// =============================================================================

export function useWCExtractionHistory(policyId: string | undefined) {
  return useQuery({
    queryKey: ['wc-extraction-history', policyId],
    queryFn: async (): Promise<ExtractionJob[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_wc_extraction_jobs')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return data.map(job => ({
        id: job.id,
        policyId: job.policy_id,
        documentId: job.document_id,
        status: job.status as ExtractionJob['status'],
        ocrStartedAt: job.ocr_started_at,
        ocrCompletedAt: job.ocr_completed_at,
        extractionStartedAt: job.extraction_started_at,
        extractionCompletedAt: job.extraction_completed_at,
        classificationsExtracted: job.classifications_extracted || 0,
        officersExtracted: job.officers_extracted || 0,
        statesExtracted: job.states_extracted || 0,
        overallConfidence: job.overall_confidence,
        errorMessage: job.error_message,
        createdAt: job.created_at,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// HELPER: GET BOUNDING BOXES FOR CLICK-TO-HIGHLIGHT
// =============================================================================

export function getBoundingBoxesForField(
  catalog: WCEvidenceCatalog | null,
  fieldEvidence: Record<string, string[]>,
  fieldName: string
): { evidenceIds: string[]; boundingBoxes: Record<string, BoundingBox> } {
  if (!catalog) {
    return { evidenceIds: [], boundingBoxes: {} };
  }

  const evidenceIds = fieldEvidence[fieldName] || [];
  const boundingBoxes: Record<string, BoundingBox> = {};

  for (const id of evidenceIds) {
    const entry = catalog.entries[id];
    if (entry?.boundingBox) {
      boundingBoxes[id] = entry.boundingBox;
    }
  }

  return { evidenceIds, boundingBoxes };
}

// =============================================================================
// HELPER: GET EVIDENCE ENTRIES FOR CLASSIFICATION
// =============================================================================

export function getClassificationEvidence(
  catalog: WCEvidenceCatalog | null,
  evidenceIds: string[]
): EvidenceEntry[] {
  if (!catalog || evidenceIds.length === 0) {
    return [];
  }

  return evidenceIds
    .map(id => catalog.entries[id])
    .filter(Boolean);
}

// =============================================================================
// HELPER: GET EVIDENCE ENTRIES FOR OFFICER
// =============================================================================

export function getOfficerEvidence(
  catalog: WCEvidenceCatalog | null,
  evidenceIds: string[]
): EvidenceEntry[] {
  if (!catalog || evidenceIds.length === 0) {
    return [];
  }

  return evidenceIds
    .map(id => catalog.entries[id])
    .filter(Boolean);
}
