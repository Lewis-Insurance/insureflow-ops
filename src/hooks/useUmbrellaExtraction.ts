/**
 * Commercial Umbrella / Excess Liability Extraction Hook
 *
 * Provides functionality to extract Umbrella/Excess policy details from
 * uploaded documents and manage Umbrella-specific data including:
 * - Limits (per occurrence, aggregate, defense)
 * - Retention/SIR
 * - Underlying policy schedule with compliance checks
 * - Drop-down coverage
 * - Additional insureds
 * - Endorsements with high-impact flags
 * - Premium breakdown
 *
 * Uses Azure Document Intelligence + Claude for evidence-backed extraction.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  UmbrellaPolicyDetails,
  UnderlyingPolicy,
  UnderlyingRequirements,
  UmbrellaAdditionalInsured,
  UmbrellaEndorsement,
  UnderlyingComplianceFlags,
  UnderlyingComplianceIssue,
  UnderlyingPolicyType,
} from '@/types/commercial-umbrella';

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

export interface UmbrellaEvidenceCatalog {
  id: string;
  policyId: string;
  documentId: string | null;
  entries: Record<string, EvidenceEntry>;
  byUmbrellaField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
  createdAt: string;
}

export interface UmbrellaExtractionJob {
  id: string;
  policyId: string;
  documentId: string | null;
  status: 'pending' | 'ocr_processing' | 'extracting' | 'completed' | 'failed';
  ocrStartedAt: string | null;
  ocrCompletedAt: string | null;
  extractionStartedAt: string | null;
  extractionCompletedAt: string | null;
  underlyingPoliciesExtracted: number;
  additionalInsuredsExtracted: number;
  endorsementsExtracted: number;
  complianceIssuesCount: number;
  overallConfidence: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractUmbrellaOptions {
  documentId: string;
  policyId: string;
  documentType?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page' | 'schedule';
}

export function useExtractUmbrellaPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractUmbrellaOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-umbrella-policy', {
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
        title: 'Umbrella Details Extracted',
        description: `Extracted ${data.underlying_count} underlying policies, ${data.endorsements_count} endorsements${data.compliance_issues_count > 0 ? `, ${data.compliance_issues_count} compliance issues` : ''}`,
      });
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['umbrella-underlying', policyId] });
      queryClient.invalidateQueries({ queryKey: ['umbrella-requirements', policyId] });
      queryClient.invalidateQueries({ queryKey: ['umbrella-additional-insureds', policyId] });
      queryClient.invalidateQueries({ queryKey: ['umbrella-endorsements', policyId] });
      queryClient.invalidateQueries({ queryKey: ['umbrella-details', policyId] });
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
// UMBRELLA DETAILS QUERY (from policies.umbrella_details JSONB)
// =============================================================================

export function useUmbrellaPolicyDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-details', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policies')
        .select('umbrella_details, extraction_source, extraction_confidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return {
        umbrellaDetails: data.umbrella_details as UmbrellaPolicyDetails | null,
        extractionSource: data.extraction_source,
        extractionConfidence: data.extraction_confidence,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// UNDERLYING POLICIES QUERY
// =============================================================================

export function useUmbrellaUnderlyingPolicies(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-underlying', policyId],
    queryFn: async (): Promise<UnderlyingPolicy[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_umbrella_underlying')
        .select('*')
        .eq('policy_id', policyId)
        .order('underlying_type', { ascending: true });

      if (error) throw error;

      return data.map((underlying) => ({
        type: underlying.underlying_type as UnderlyingPolicyType,
        carrier: underlying.carrier,
        policy_number: underlying.underlying_policy_number || '',
        effective_date: underlying.effective_date || '',
        expiration_date: underlying.expiration_date || '',
        limits: {
          each_occurrence: underlying.each_occurrence,
          general_aggregate: underlying.general_aggregate,
          auto_csl: underlying.auto_csl,
          auto_bi_per_person: underlying.auto_bi_per_person,
          auto_bi_per_accident: underlying.auto_bi_per_accident,
          auto_pd: underlying.auto_pd,
          el_per_accident: underlying.el_per_accident,
          el_disease_policy: underlying.el_disease_policy,
          el_disease_employee: underlying.el_disease_employee,
          limit: underlying.other_limit,
        },
        meets_requirements: underlying.meets_requirements,
        notes: underlying.compliance_notes,
        evidence_ids: underlying.evidence_ids || [],
        extraction_confidence: underlying.extraction_confidence,
        extraction_status: underlying.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// UNDERLYING REQUIREMENTS QUERY
// =============================================================================

export function useUmbrellaRequirements(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-requirements', policyId],
    queryFn: async (): Promise<UnderlyingRequirements | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_umbrella_requirements')
        .select('*')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        gl_each_occurrence: data.gl_each_occurrence,
        gl_general_aggregate: data.gl_general_aggregate,
        auto_liability: data.auto_liability,
        el_per_accident: data.el_per_accident,
        el_disease_policy: data.el_disease_policy,
        el_disease_employee: data.el_disease_employee,
        other_requirements: data.other_requirements,
        evidence_ids: data.evidence_ids || [],
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ADDITIONAL INSUREDS QUERY
// =============================================================================

export function useUmbrellaAdditionalInsureds(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-additional-insureds', policyId],
    queryFn: async (): Promise<UmbrellaAdditionalInsured[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_umbrella_additional_insureds')
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
        ai_type: ai.ai_type as 'blanket' | 'scheduled' | 'follow_underlying',
        primary_noncontributory: ai.primary_noncontributory,
        waiver_of_subrogation: ai.waiver_of_subrogation,
        project_name: ai.project_name,
        evidence_ids: ai.evidence_ids || [],
        extraction_confidence: ai.extraction_confidence,
        extraction_status: ai.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ENDORSEMENTS QUERY
// =============================================================================

export function useUmbrellaEndorsements(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-endorsements', policyId],
    queryFn: async (): Promise<UmbrellaEndorsement[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_umbrella_endorsements')
        .select('*')
        .eq('policy_id', policyId)
        .order('is_limitation', { ascending: false }) // Limitations first
        .order('form_number', { ascending: true });

      if (error) throw error;

      return data.map((end) => ({
        form_number: end.form_number,
        title: end.title,
        edition_date: end.edition_date,
        effective_date: end.effective_date,
        category: end.category,
        is_limitation: end.is_limitation,
        is_enhancement: end.is_enhancement,
        premium_impact: end.premium_impact,
        impact_description: end.impact_description,
        evidence_ids: end.evidence_ids || [],
        extraction_confidence: end.extraction_confidence,
        extraction_status: end.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EVIDENCE CATALOG QUERY
// =============================================================================

export function useUmbrellaEvidenceCatalog(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-evidence-catalog', policyId],
    queryFn: async (): Promise<UmbrellaEvidenceCatalog | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_umbrella_evidence_catalog')
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
        byUmbrellaField: data.evidence_by_field as Record<string, string[]>,
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

export function useUmbrellaFieldEvidence(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-field-evidence', policyId],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (!policyId) return {};

      const { data, error } = await supabase
        .from('policies')
        .select('umbrella_field_evidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return (data.umbrella_field_evidence as Record<string, string[]>) || {};
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EXTRACTION JOB STATUS
// =============================================================================

export function useUmbrellaExtractionJob(policyId: string | undefined) {
  return useQuery({
    queryKey: ['umbrella-extraction-job', policyId],
    queryFn: async (): Promise<UmbrellaExtractionJob | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_umbrella_extraction_jobs')
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
        status: data.status as UmbrellaExtractionJob['status'],
        ocrStartedAt: data.ocr_started_at,
        ocrCompletedAt: data.ocr_completed_at,
        extractionStartedAt: data.extraction_started_at,
        extractionCompletedAt: data.extraction_completed_at,
        underlyingPoliciesExtracted: data.underlying_policies_extracted || 0,
        additionalInsuredsExtracted: data.additional_insureds_extracted || 0,
        endorsementsExtracted: data.endorsements_extracted || 0,
        complianceIssuesCount: data.compliance_issues_count || 0,
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
// COMPLIANCE ANALYSIS
// =============================================================================

export function useUmbrellaCompliance(
  policyId: string | undefined,
  umbrellaDetails: UmbrellaPolicyDetails | null,
  underlyingPolicies: UnderlyingPolicy[],
  requirements: UnderlyingRequirements | null
) {
  return useQuery({
    queryKey: ['umbrella-compliance', policyId, underlyingPolicies.length, !!requirements],
    queryFn: async (): Promise<UnderlyingComplianceFlags> => {
      const issues: UnderlyingComplianceIssue[] = [];

      if (!umbrellaDetails || !requirements || underlyingPolicies.length === 0) {
        return {
          all_underlying_scheduled: underlyingPolicies.length > 0,
          terms_aligned: true,
          limits_sufficient: true,
          has_coverage_gaps: false,
          issues: [],
        };
      }

      const umbrellaExp = new Date(umbrellaDetails.dates.expiration_date);

      // Check GL requirements
      if (requirements.gl_each_occurrence) {
        const glPolicy = underlyingPolicies.find((p) => p.type === 'general_liability');
        if (!glPolicy) {
          issues.push({
            type: 'missing_underlying',
            severity: 'high',
            underlying_type: 'general_liability',
            message: 'Required General Liability underlying not scheduled',
          });
        } else if (
          glPolicy.limits.each_occurrence &&
          glPolicy.limits.each_occurrence < requirements.gl_each_occurrence
        ) {
          issues.push({
            type: 'limit_insufficient',
            severity: 'high',
            underlying_type: 'general_liability',
            message: `GL limit below required minimum`,
          });
        }
      }

      // Check Auto requirements
      if (requirements.auto_liability) {
        const autoPolicy = underlyingPolicies.find((p) => p.type === 'commercial_auto');
        if (!autoPolicy) {
          issues.push({
            type: 'missing_underlying',
            severity: 'high',
            underlying_type: 'commercial_auto',
            message: 'Required Commercial Auto underlying not scheduled',
          });
        } else if (
          autoPolicy.limits.auto_csl &&
          autoPolicy.limits.auto_csl < requirements.auto_liability
        ) {
          issues.push({
            type: 'limit_insufficient',
            severity: 'high',
            underlying_type: 'commercial_auto',
            message: `Auto limit below required minimum`,
          });
        }
      }

      // Check EL requirements
      if (requirements.el_per_accident) {
        const elPolicy = underlyingPolicies.find((p) => p.type === 'employers_liability');
        if (!elPolicy) {
          issues.push({
            type: 'missing_underlying',
            severity: 'medium',
            underlying_type: 'employers_liability',
            message: "Employer's Liability underlying not scheduled",
          });
        }
      }

      // Check term alignment
      for (const underlying of underlyingPolicies) {
        if (underlying.expiration_date) {
          const underlyingExp = new Date(underlying.expiration_date);
          if (underlyingExp < umbrellaExp) {
            issues.push({
              type: 'term_mismatch',
              severity: 'high',
              underlying_type: underlying.type,
              message: `Expires before umbrella policy`,
            });
          }
        }
      }

      const hasTermMismatch = issues.some((i) => i.type === 'term_mismatch');
      const hasLimitIssue = issues.some((i) => i.type === 'limit_insufficient');
      const hasMissingUnderlying = issues.some((i) => i.type === 'missing_underlying');

      return {
        all_underlying_scheduled: !hasMissingUnderlying,
        terms_aligned: !hasTermMismatch,
        limits_sufficient: !hasLimitIssue,
        has_coverage_gaps: issues.length > 0,
        issues,
      };
    },
    enabled: !!policyId && !!umbrellaDetails,
  });
}

// =============================================================================
// UPDATE UMBRELLA DETAILS
// =============================================================================

export function useUpdateUmbrellaDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      umbrellaDetails,
    }: {
      policyId: string;
      umbrellaDetails: Partial<UmbrellaPolicyDetails>;
    }) => {
      // Get existing details
      const { data: existing, error: fetchError } = await supabase
        .from('policies')
        .select('umbrella_details')
        .eq('id', policyId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing
      const merged = {
        ...((existing.umbrella_details as object) || {}),
        ...umbrellaDetails,
        last_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('policies')
        .update({ umbrella_details: merged })
        .eq('id', policyId);

      if (updateError) throw updateError;

      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Umbrella Details Updated',
        description: 'Commercial Umbrella/Excess details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['umbrella-details', policyId] });
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
// ADD UNDERLYING POLICY
// =============================================================================

export function useAddUnderlyingPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      underlying,
    }: {
      policyId: string;
      underlying: Omit<UnderlyingPolicy, 'evidence_ids' | 'extraction_confidence' | 'extraction_status'>;
    }) => {
      const { data, error } = await supabase
        .from('policy_umbrella_underlying')
        .insert({
          policy_id: policyId,
          underlying_type: underlying.type,
          carrier: underlying.carrier,
          underlying_policy_number: underlying.policy_number,
          effective_date: underlying.effective_date,
          expiration_date: underlying.expiration_date,
          each_occurrence: underlying.limits.each_occurrence,
          general_aggregate: underlying.limits.general_aggregate,
          auto_csl: underlying.limits.auto_csl,
          el_per_accident: underlying.limits.el_per_accident,
          el_disease_policy: underlying.limits.el_disease_policy,
          el_disease_employee: underlying.limits.el_disease_employee,
          extraction_status: 'MANUAL',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Underlying Policy Added',
        description: 'Underlying policy has been added to the schedule.',
      });
      queryClient.invalidateQueries({ queryKey: ['umbrella-underlying', policyId] });
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
// CHECK IF UMBRELLA POLICY
// =============================================================================

export function isUmbrellaPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('umbrella') ||
    lob.includes('excess') ||
    lob === 'umb' ||
    lob === 'ul' ||
    lob === 'el' ||
    lob.includes('excess liability')
  );
}

// =============================================================================
// HELPER: FORMAT UMBRELLA LIMIT
// =============================================================================

export function formatUmbrellaLimit(amount: number | undefined | null): string {
  if (amount == null) return 'N/A';
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return millions === Math.floor(millions)
      ? `$${millions}M`
      : `$${millions.toFixed(1)}M`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// =============================================================================
// HELPER: GET UNDERLYING TYPE LABEL
// =============================================================================

export const UNDERLYING_TYPE_LABELS: Record<string, string> = {
  general_liability: 'General Liability (CGL)',
  commercial_auto: 'Commercial Auto',
  employers_liability: "Employer's Liability",
  workers_compensation: "Workers' Compensation",
  professional_liability: 'Professional Liability',
  hired_non_owned_auto: 'Hired & Non-Owned Auto',
  employee_benefits: 'Employee Benefits Liability',
  other: 'Other',
};

export function getUnderlyingTypeLabel(type: string): string {
  return UNDERLYING_TYPE_LABELS[type] || type;
}

// =============================================================================
// HELPER: GET ENDORSEMENT CATEGORY LABEL
// =============================================================================

export const ENDORSEMENT_CATEGORY_LABELS: Record<string, string> = {
  designated_underlying: 'Designated Underlying',
  auto_liability: 'Auto Limitation',
  employers_liability: "Employer's Liability",
  professional_liability: 'Professional Liability',
  pollution: 'Pollution',
  abuse_molestation: 'Abuse/Molestation',
  assault_battery: 'Assault & Battery',
  communicable_disease: 'Communicable Disease',
  residential_work: 'Residential Work',
  height_limitation: 'Height Limitation',
  eifs_stucco: 'EIFS/Stucco',
  liquor_liability: 'Liquor Liability',
  cyber: 'Cyber',
  territory_limitation: 'Territory',
  aircraft_watercraft: 'Aircraft/Watercraft',
  other: 'Other',
};

export function getEndorsementCategoryLabel(category: string | undefined): string {
  if (!category) return 'Other';
  return ENDORSEMENT_CATEGORY_LABELS[category] || category;
}

// =============================================================================
// HELPER: GET BOUNDING BOXES FOR CLICK-TO-HIGHLIGHT
// =============================================================================

export function getBoundingBoxesForField(
  catalog: UmbrellaEvidenceCatalog | null,
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
  catalog: UmbrellaEvidenceCatalog | null,
  evidenceIds: string[]
): EvidenceEntry[] {
  if (!catalog || evidenceIds.length === 0) {
    return [];
  }

  return evidenceIds.map((id) => catalog.entries[id]).filter(Boolean);
}
