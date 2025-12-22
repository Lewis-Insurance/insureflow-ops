/**
 * Commercial Property Extraction Hook
 *
 * Provides functionality to extract Commercial Property policy details from
 * uploaded documents and manage Property-specific data including:
 * - Locations and buildings schedule
 * - Building coverages (Building, BPP, TIB, Stock)
 * - Deductibles (AOP, Wind/Hail, Named Storm, Flood, Earthquake)
 * - Business Income & Extra Expense
 * - Ordinance or Law (Coverages A, B, C)
 * - Mortgagees/Loss Payees
 * - Endorsements with high-impact flags
 * - Premium breakdown
 *
 * Uses Azure Document Intelligence + Claude for evidence-backed extraction.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  PropertyPolicyDetails,
  PropertyLocation,
  PropertyBuilding,
  BuildingCoverageLimits,
  PropertyDeductible,
  PropertyInterest,
  PropertyEndorsement,
} from '@/types/commercial-property';

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

export interface PropertyEvidenceCatalog {
  id: string;
  policyId: string;
  documentId: string | null;
  entries: Record<string, EvidenceEntry>;
  byPropertyField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
  createdAt: string;
}

export interface PropertyExtractionJob {
  id: string;
  policyId: string;
  documentId: string | null;
  status: 'pending' | 'ocr_processing' | 'extracting' | 'completed' | 'failed';
  ocrStartedAt: string | null;
  ocrCompletedAt: string | null;
  extractionStartedAt: string | null;
  extractionCompletedAt: string | null;
  locationsExtracted: number;
  buildingsExtracted: number;
  deductiblesExtracted: number;
  interestsExtracted: number;
  endorsementsExtracted: number;
  overallConfidence: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractPropertyOptions {
  documentId: string;
  policyId: string;
  documentType?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page' | 'schedule';
}

export function useExtractPropertyPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractPropertyOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-property-policy', {
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
        title: 'Property Details Extracted',
        description: `Extracted ${data.buildings_count} buildings, ${data.deductibles_count} deductibles, ${data.interests_count} interests`,
      });
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['property-locations', policyId] });
      queryClient.invalidateQueries({ queryKey: ['property-buildings', policyId] });
      queryClient.invalidateQueries({ queryKey: ['property-deductibles', policyId] });
      queryClient.invalidateQueries({ queryKey: ['property-interests', policyId] });
      queryClient.invalidateQueries({ queryKey: ['property-endorsements', policyId] });
      queryClient.invalidateQueries({ queryKey: ['property-details', policyId] });
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
// PROPERTY DETAILS QUERY (from policies.property_details JSONB)
// =============================================================================

export function usePropertyPolicyDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-details', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policies')
        .select('property_details, extraction_source, extraction_confidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return {
        propertyDetails: data.property_details as PropertyPolicyDetails | null,
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

export function usePropertyLocations(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-locations', policyId],
    queryFn: async (): Promise<PropertyLocation[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_property_locations')
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
        county: loc.county,
        territory: loc.territory,
        protection_class: loc.protection_class,
        fire_district: loc.fire_district,
        fire_department: loc.fire_department,
        hydrant_distance_feet: loc.hydrant_distance_feet,
        occupancy: loc.occupancy,
        evidence_ids: loc.evidence_ids || [],
        extraction_confidence: loc.extraction_confidence,
        extraction_status: loc.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// BUILDINGS QUERY
// =============================================================================

export function usePropertyBuildings(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-buildings', policyId],
    queryFn: async (): Promise<PropertyBuilding[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_property_buildings')
        .select('*')
        .eq('policy_id', policyId)
        .order('location_number', { ascending: true })
        .order('building_number', { ascending: true });

      if (error) throw error;

      return data.map((bldg) => ({
        building_number: bldg.building_number,
        location_number: bldg.location_number,
        description: bldg.description,
        construction_type: bldg.construction_type,
        construction_class: bldg.iso_construction_class,
        occupancy: bldg.occupancy,
        year_built: bldg.year_built,
        square_footage: bldg.square_footage,
        stories: bldg.stories,
        roof_type: bldg.roof_type,
        roof_age: bldg.roof_age,
        roof_updated_year: bldg.roof_updated_year,
        electrical_update_year: bldg.electrical_update_year,
        plumbing_update_year: bldg.plumbing_update_year,
        hvac_update_year: bldg.hvac_update_year,
        has_sprinklers: bldg.has_sprinklers,
        sprinkler_type: bldg.sprinkler_type,
        has_burglar_alarm: bldg.has_burglar_alarm,
        has_fire_alarm: bldg.has_fire_alarm,
        alarm_type: bldg.alarm_type,
        valuation_basis: bldg.valuation_basis,
        coinsurance_percent: bldg.coinsurance_percent,
        is_agreed_value: bldg.is_agreed_value,
        agreed_value_expiration: bldg.agreed_value_expiration,
        evidence_ids: bldg.evidence_ids || [],
        extraction_confidence: bldg.extraction_confidence,
        extraction_status: bldg.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// BUILDING COVERAGES QUERY
// =============================================================================

export function usePropertyBuildingCoverages(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-building-coverages', policyId],
    queryFn: async (): Promise<BuildingCoverageLimits[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_property_building_coverages')
        .select('*')
        .eq('policy_id', policyId)
        .order('location_number', { ascending: true })
        .order('building_number', { ascending: true });

      if (error) throw error;

      return data.map((cov) => ({
        building_number: cov.building_number,
        location_number: cov.location_number,
        building_limit: cov.building_limit,
        bpp_limit: cov.bpp_limit,
        tenant_improvements_limit: cov.tenant_improvements_limit,
        stock_limit: cov.stock_limit,
        property_of_others_limit: cov.property_of_others_limit,
        outdoor_property_limit: cov.outdoor_property_limit,
        signs_limit: cov.signs_limit,
        valuable_papers_limit: cov.valuable_papers_limit,
        accounts_receivable_limit: cov.accounts_receivable_limit,
        edp_equipment_limit: cov.edp_equipment_limit,
        edp_media_limit: cov.edp_media_limit,
        special_equipment_limit: cov.special_equipment_limit,
        special_equipment_description: cov.special_equipment_description,
        evidence_ids: cov.evidence_ids || [],
        extraction_confidence: cov.extraction_confidence,
        extraction_status: cov.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// DEDUCTIBLES QUERY
// =============================================================================

export function usePropertyDeductibles(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-deductibles', policyId],
    queryFn: async (): Promise<PropertyDeductible[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_property_deductibles')
        .select('*')
        .eq('policy_id', policyId)
        .order('peril', { ascending: true });

      if (error) throw error;

      return data.map((ded) => ({
        id: ded.id,
        name: ded.name,
        peril: ded.peril,
        amount: ded.amount,
        deductible_type: ded.deductible_type,
        percentage: ded.percentage,
        applies_to: ded.applies_to,
        state_conditions: ded.state_conditions,
        evidence_ids: ded.evidence_ids || [],
        extraction_confidence: ded.extraction_confidence,
        extraction_status: ded.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// INTERESTS (MORTGAGEES/LOSS PAYEES) QUERY
// =============================================================================

export function usePropertyInterests(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-interests', policyId],
    queryFn: async (): Promise<PropertyInterest[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_property_interests')
        .select('*')
        .eq('policy_id', policyId)
        .order('interest_type', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      return data.map((interest) => ({
        id: interest.id,
        interest_type: interest.interest_type,
        name: interest.name,
        address: interest.street
          ? {
              street: interest.street || '',
              city: interest.city || '',
              state: interest.state || '',
              zip: interest.zip || '',
            }
          : undefined,
        loan_number: interest.loan_number,
        location_number: interest.location_number,
        building_number: interest.building_number,
        evidence_ids: interest.evidence_ids || [],
        extraction_confidence: interest.extraction_confidence,
        extraction_status: interest.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ENDORSEMENTS QUERY
// =============================================================================

export function usePropertyEndorsements(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-endorsements', policyId],
    queryFn: async (): Promise<PropertyEndorsement[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_property_endorsements')
        .select('*')
        .eq('policy_id', policyId)
        .order('form_number', { ascending: true });

      if (error) throw error;

      return data.map((end) => ({
        id: end.id,
        form_number: end.form_number,
        title: end.title,
        edition_date: end.edition_date,
        effective_date: end.effective_date,
        category: end.category,
        is_limitation: end.is_limitation,
        premium_impact: end.premium_impact,
        location_number: end.location_number,
        building_number: end.building_number,
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

export function usePropertyEvidenceCatalog(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-evidence-catalog', policyId],
    queryFn: async (): Promise<PropertyEvidenceCatalog | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_property_evidence_catalog')
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
        byPropertyField: data.evidence_by_field as Record<string, string[]>,
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

export function usePropertyFieldEvidence(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-field-evidence', policyId],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (!policyId) return {};

      const { data, error } = await supabase
        .from('policies')
        .select('property_field_evidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return (data.property_field_evidence as Record<string, string[]>) || {};
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EXTRACTION JOB STATUS
// =============================================================================

export function usePropertyExtractionJob(policyId: string | undefined) {
  return useQuery({
    queryKey: ['property-extraction-job', policyId],
    queryFn: async (): Promise<PropertyExtractionJob | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_property_extraction_jobs')
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
        status: data.status as PropertyExtractionJob['status'],
        ocrStartedAt: data.ocr_started_at,
        ocrCompletedAt: data.ocr_completed_at,
        extractionStartedAt: data.extraction_started_at,
        extractionCompletedAt: data.extraction_completed_at,
        locationsExtracted: data.locations_extracted || 0,
        buildingsExtracted: data.buildings_extracted || 0,
        deductiblesExtracted: data.deductibles_extracted || 0,
        interestsExtracted: data.interests_extracted || 0,
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
// UPDATE PROPERTY DETAILS
// =============================================================================

export function useUpdatePropertyDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      propertyDetails,
    }: {
      policyId: string;
      propertyDetails: Partial<PropertyPolicyDetails>;
    }) => {
      // Get existing details
      const { data: existing, error: fetchError } = await supabase
        .from('policies')
        .select('property_details')
        .eq('id', policyId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing
      const merged = {
        ...((existing.property_details as object) || {}),
        ...propertyDetails,
        last_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('policies')
        .update({ property_details: merged })
        .eq('id', policyId);

      if (updateError) throw updateError;

      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Property Details Updated',
        description: 'Commercial Property details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['property-details', policyId] });
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
// ADD PROPERTY INTEREST
// =============================================================================

export function useAddPropertyInterest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      interest,
    }: {
      policyId: string;
      interest: Omit<PropertyInterest, 'id' | 'evidence_ids' | 'extraction_confidence' | 'extraction_status'>;
    }) => {
      const { data, error } = await supabase
        .from('policy_property_interests')
        .insert({
          policy_id: policyId,
          interest_type: interest.interest_type,
          name: interest.name,
          street: interest.address?.street,
          city: interest.address?.city,
          state: interest.address?.state,
          zip: interest.address?.zip,
          loan_number: interest.loan_number,
          location_number: interest.location_number,
          building_number: interest.building_number,
          extraction_status: 'MANUAL',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Interest Added',
        description: 'Mortgagee/Loss Payee has been added to the policy.',
      });
      queryClient.invalidateQueries({ queryKey: ['property-interests', policyId] });
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
// ADD DEDUCTIBLE
// =============================================================================

export function useAddPropertyDeductible() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      deductible,
    }: {
      policyId: string;
      deductible: Omit<PropertyDeductible, 'id' | 'evidence_ids' | 'extraction_confidence' | 'extraction_status'>;
    }) => {
      const { data, error } = await supabase
        .from('policy_property_deductibles')
        .insert({
          policy_id: policyId,
          name: deductible.name,
          peril: deductible.peril,
          amount: deductible.amount,
          deductible_type: deductible.deductible_type,
          percentage: deductible.percentage,
          applies_to: deductible.applies_to,
          state_conditions: deductible.state_conditions,
          extraction_status: 'MANUAL',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Deductible Added',
        description: 'Deductible has been added to the policy.',
      });
      queryClient.invalidateQueries({ queryKey: ['property-deductibles', policyId] });
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
// CHECK IF PROPERTY POLICY
// =============================================================================

export function isPropertyPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('property') ||
    lob.includes('bop') ||
    lob.includes('building') ||
    lob.includes('fire') ||
    lob === 'cp' ||
    lob.includes('commercial property')
  );
}

// =============================================================================
// HELPER: GET BOUNDING BOXES FOR CLICK-TO-HIGHLIGHT
// =============================================================================

export function getBoundingBoxesForField(
  catalog: PropertyEvidenceCatalog | null,
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
  catalog: PropertyEvidenceCatalog | null,
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

// =============================================================================
// HELPER: FORMAT DEDUCTIBLE
// =============================================================================

export function formatDeductible(deductible: PropertyDeductible): string {
  if (deductible.deductible_type === 'flat') {
    return formatLimit(deductible.amount);
  }

  if (deductible.percentage) {
    const pctLabel = deductible.deductible_type === 'percentage_tiv'
      ? 'of TIV'
      : deductible.deductible_type === 'percentage_building'
        ? 'per building'
        : 'of claim';
    return `${deductible.percentage}% ${pctLabel}`;
  }

  return formatLimit(deductible.amount);
}

// =============================================================================
// HELPER: GET PERIL LABEL
// =============================================================================

export const PERIL_LABELS: Record<string, string> = {
  aop: 'All Other Perils',
  wind_hail: 'Wind/Hail',
  named_storm: 'Named Storm',
  hurricane: 'Hurricane',
  flood: 'Flood',
  earthquake: 'Earthquake',
  water_damage: 'Water Damage',
  theft: 'Theft',
  vandalism: 'Vandalism',
  freeze: 'Freeze',
};

export function getPerilLabel(peril: string): string {
  return PERIL_LABELS[peril] || peril;
}

// =============================================================================
// HELPER: GET CONSTRUCTION CLASS LABEL
// =============================================================================

export const CONSTRUCTION_CLASS_LABELS: Record<number, string> = {
  1: 'Class 1 - Frame',
  2: 'Class 2 - Joisted Masonry',
  3: 'Class 3 - Non-Combustible',
  4: 'Class 4 - Masonry Non-Combustible',
  5: 'Class 5 - Modified Fire Resistive',
  6: 'Class 6 - Fire Resistive',
};

export function getConstructionClassLabel(classNum: number | null | undefined): string {
  if (classNum == null) return 'Unknown';
  return CONSTRUCTION_CLASS_LABELS[classNum] || `Class ${classNum}`;
}

// =============================================================================
// HELPER: GET INTEREST TYPE LABEL
// =============================================================================

export const INTEREST_TYPE_LABELS: Record<string, string> = {
  mortgagee: 'Mortgagee',
  loss_payee: 'Loss Payee',
  lenders_loss_payable: "Lender's Loss Payable",
  additional_insured: 'Additional Insured',
  additional_interest: 'Additional Interest',
};

export function getInterestTypeLabel(type: string): string {
  return INTEREST_TYPE_LABELS[type] || type;
}
