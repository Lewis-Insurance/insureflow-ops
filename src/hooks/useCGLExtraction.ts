/**
 * Commercial General Liability (CGL) Extraction Hook
 *
 * Provides functionality to extract CGL policy details from uploaded documents
 * and manage CGL-specific data including:
 * - Limits (each occurrence, general aggregate, products/completed ops, etc.)
 * - Locations/premises schedule
 * - Classifications/exposures
 * - Additional insureds schedule
 * - Endorsements
 * - Premium breakdown
 *
 * Uses Azure Document Intelligence + Claude for evidence-backed extraction.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CGLPolicyDetails,
  CGLLocation,
  CGLClassification,
  CGLAdditionalInsured,
  CGLAdditionalInterest,
  CGLEndorsement,
} from '@/types/commercial-gl';

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

export interface CGLEvidenceCatalog {
  id: string;
  policyId: string;
  documentId: string | null;
  entries: Record<string, EvidenceEntry>;
  byCGLField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
  createdAt: string;
}

export interface CGLExtractionJob {
  id: string;
  policyId: string;
  documentId: string | null;
  status: 'pending' | 'ocr_processing' | 'extracting' | 'completed' | 'failed';
  ocrStartedAt: string | null;
  ocrCompletedAt: string | null;
  extractionStartedAt: string | null;
  extractionCompletedAt: string | null;
  locationsExtracted: number;
  classificationsExtracted: number;
  additionalInsuredsExtracted: number;
  endorsementsExtracted: number;
  overallConfidence: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractCGLOptions {
  documentId: string;
  policyId: string;
  documentType?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page';
}

export function useExtractCGLPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractCGLOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-cgl-policy', {
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
        title: 'CGL Details Extracted',
        description: `Extracted ${data.locations_count} locations, ${data.classifications_count} classifications, ${data.additional_insureds_count} additional insureds`,
      });
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['cgl-locations', policyId] });
      queryClient.invalidateQueries({ queryKey: ['cgl-classifications', policyId] });
      queryClient.invalidateQueries({ queryKey: ['cgl-additional-insureds', policyId] });
      queryClient.invalidateQueries({ queryKey: ['cgl-endorsements', policyId] });
      queryClient.invalidateQueries({ queryKey: ['cgl-details', policyId] });
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
// CGL DETAILS QUERY (from policies.cgl_details JSONB)
// =============================================================================

export function useCGLPolicyDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-details', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policies')
        .select('cgl_details, extraction_source, extraction_confidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return {
        cglDetails: data.cgl_details as CGLPolicyDetails | null,
        extractionSource: data.extraction_source,
        extractionConfidence: data.extraction_confidence,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// LOCATIONS QUERY
// =============================================================================

export function useCGLLocations(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-locations', policyId],
    queryFn: async (): Promise<CGLLocation[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_cgl_locations')
        .select('*')
        .eq('policy_id', policyId)
        .order('location_number', { ascending: true });

      if (error) throw error;

      return data.map((loc) => ({
        location_number: loc.location_number,
        address: {
          street: loc.street || '',
          city: loc.city || '',
          state: loc.state || '',
          zip: loc.zip || '',
        },
        description: loc.description,
        territory: loc.territory,
        county: loc.county,
        building_type: loc.building_type,
        square_footage: loc.square_footage,
        year_built: loc.year_built,
        construction_type: loc.construction_type,
        is_primary: loc.is_primary,
        evidence_ids: loc.evidence_ids || [],
        extraction_confidence: loc.extraction_confidence,
        extraction_status: loc.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// CLASSIFICATIONS QUERY
// =============================================================================

export function useCGLClassifications(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-classifications', policyId],
    queryFn: async (): Promise<CGLClassification[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_cgl_classifications')
        .select('*')
        .eq('policy_id', policyId)
        .order('class_code', { ascending: true });

      if (error) throw error;

      return data.map((cls) => ({
        class_code: cls.class_code,
        description: cls.description,
        exposure_basis: cls.exposure_basis,
        exposure_amount: cls.exposure_amount,
        rate: cls.rate,
        premium: cls.premium,
        is_products_completed_ops: cls.is_products_completed_ops,
        location_number: cls.location_number,
        subcontractor_costs_included: cls.subcontractor_costs_included,
        percent_subcontracted: cls.percent_subcontracted,
        evidence_ids: cls.evidence_ids || [],
        extraction_confidence: cls.extraction_confidence,
        extraction_status: cls.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ADDITIONAL INSUREDS QUERY
// =============================================================================

export function useCGLAdditionalInsureds(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-additional-insureds', policyId],
    queryFn: async (): Promise<CGLAdditionalInsured[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_cgl_additional_insureds')
        .select('*')
        .eq('policy_id', policyId)
        .order('name', { ascending: true });

      if (error) throw error;

      return data.map((ai) => ({
        name: ai.name,
        address: ai.street
          ? {
              street: ai.street || '',
              city: ai.city || '',
              state: ai.state || '',
              zip: ai.zip || '',
            }
          : undefined,
        ai_type: ai.ai_type,
        primary_noncontributory: ai.primary_noncontributory,
        waiver_of_subrogation: ai.waiver_of_subrogation,
        per_project: ai.per_project,
        per_location: ai.per_location,
        project_name: ai.project_name,
        location_number: ai.location_number,
        effective_date: ai.effective_date,
        expiration_date: ai.expiration_date,
        endorsement_form: ai.endorsement_form,
        evidence_ids: ai.evidence_ids || [],
        extraction_confidence: ai.extraction_confidence,
        extraction_status: ai.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ADDITIONAL INTERESTS QUERY
// =============================================================================

export function useCGLAdditionalInterests(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-additional-interests', policyId],
    queryFn: async (): Promise<CGLAdditionalInterest[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_cgl_additional_interests')
        .select('*')
        .eq('policy_id', policyId)
        .order('name', { ascending: true });

      if (error) throw error;

      return data.map((interest) => ({
        name: interest.name,
        address: interest.street
          ? {
              street: interest.street || '',
              city: interest.city || '',
              state: interest.state || '',
              zip: interest.zip || '',
            }
          : undefined,
        interest_type: interest.interest_type,
        reference_number: interest.reference_number,
        location_number: interest.location_number,
        evidence_ids: interest.evidence_ids || [],
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ENDORSEMENTS QUERY
// =============================================================================

export function useCGLEndorsements(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-endorsements', policyId],
    queryFn: async (): Promise<CGLEndorsement[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_cgl_endorsements')
        .select('*')
        .eq('policy_id', policyId)
        .order('form_number', { ascending: true });

      if (error) throw error;

      return data.map((end) => ({
        form_number: end.form_number,
        edition_date: end.edition_date,
        description: end.description,
        premium_impact: end.premium_impact,
        location_number: end.location_number,
        additional_insured_name: end.additional_insured_name,
        evidence_ids: end.evidence_ids || [],
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EVIDENCE CATALOG QUERY
// =============================================================================

export function useCGLEvidenceCatalog(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-evidence-catalog', policyId],
    queryFn: async (): Promise<CGLEvidenceCatalog | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_cgl_evidence_catalog')
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
        byCGLField: data.evidence_by_field as Record<string, string[]>,
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

export function useCGLFieldEvidence(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-field-evidence', policyId],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (!policyId) return {};

      const { data, error } = await supabase
        .from('policies')
        .select('cgl_field_evidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return (data.cgl_field_evidence as Record<string, string[]>) || {};
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EXTRACTION JOB STATUS
// =============================================================================

export function useCGLExtractionJob(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cgl-extraction-job', policyId],
    queryFn: async (): Promise<CGLExtractionJob | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_cgl_extraction_jobs')
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
        status: data.status as CGLExtractionJob['status'],
        ocrStartedAt: data.ocr_started_at,
        ocrCompletedAt: data.ocr_completed_at,
        extractionStartedAt: data.extraction_started_at,
        extractionCompletedAt: data.extraction_completed_at,
        locationsExtracted: data.locations_extracted || 0,
        classificationsExtracted: data.classifications_extracted || 0,
        additionalInsuredsExtracted: data.additional_insureds_extracted || 0,
        endorsementsExtracted: data.endorsements_extracted || 0,
        overallConfidence: data.overall_confidence,
        errorMessage: data.error_message,
        createdAt: data.created_at,
      };
    },
    enabled: !!policyId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 2 seconds while extraction is in progress
      if (
        data?.status === 'pending' ||
        data?.status === 'ocr_processing' ||
        data?.status === 'extracting'
      ) {
        return 2000;
      }
      return false;
    },
  });
}

// =============================================================================
// UPDATE CGL DETAILS
// =============================================================================

export function useUpdateCGLDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      cglDetails,
    }: {
      policyId: string;
      cglDetails: Partial<CGLPolicyDetails>;
    }) => {
      // Get existing details
      const { data: existing, error: fetchError } = await supabase
        .from('policies')
        .select('cgl_details')
        .eq('id', policyId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing
      const merged = {
        ...((existing.cgl_details as object) || {}),
        ...cglDetails,
        last_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('policies')
        .update({ cgl_details: merged })
        .eq('id', policyId);

      if (updateError) throw updateError;

      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'CGL Details Updated',
        description: 'Commercial General Liability details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['cgl-details', policyId] });
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
// ADD ADDITIONAL INSURED
// =============================================================================

export function useAddCGLAdditionalInsured() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      additionalInsured,
    }: {
      policyId: string;
      additionalInsured: Omit<CGLAdditionalInsured, 'evidence_ids' | 'extraction_confidence' | 'extraction_status'>;
    }) => {
      const { data, error } = await supabase
        .from('policy_cgl_additional_insureds')
        .insert({
          policy_id: policyId,
          name: additionalInsured.name,
          street: additionalInsured.address?.street,
          city: additionalInsured.address?.city,
          state: additionalInsured.address?.state,
          zip: additionalInsured.address?.zip,
          ai_type: additionalInsured.ai_type,
          primary_noncontributory: additionalInsured.primary_noncontributory,
          waiver_of_subrogation: additionalInsured.waiver_of_subrogation,
          per_project: additionalInsured.per_project,
          project_name: additionalInsured.project_name,
          endorsement_form: additionalInsured.endorsement_form,
          extraction_status: 'MANUAL',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Additional Insured Added',
        description: 'Additional insured has been added to the policy.',
      });
      queryClient.invalidateQueries({ queryKey: ['cgl-additional-insureds', policyId] });
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
// CHECK IF CGL POLICY
// =============================================================================

export function isCGLPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('general liability') ||
    lob.includes('cgl') ||
    lob === 'gl' ||
    lob.includes('commercial general') ||
    (lob.includes('liability') && !lob.includes('auto') && !lob.includes('professional'))
  );
}

// =============================================================================
// HELPER: GET BOUNDING BOXES FOR CLICK-TO-HIGHLIGHT
// =============================================================================

export function getBoundingBoxesForField(
  catalog: CGLEvidenceCatalog | null,
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
// HELPER: GET EVIDENCE ENTRIES
// =============================================================================

export function getEvidenceEntries(
  catalog: CGLEvidenceCatalog | null,
  evidenceIds: string[]
): EvidenceEntry[] {
  if (!catalog || evidenceIds.length === 0) {
    return [];
  }

  return evidenceIds.map((id) => catalog.entries[id]).filter(Boolean);
}

// =============================================================================
// HELPER: FORMAT LIMIT
// =============================================================================

export function formatLimit(amount: number | undefined | null): string {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
