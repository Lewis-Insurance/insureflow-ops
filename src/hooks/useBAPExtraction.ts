/**
 * Commercial Auto / Business Auto Policy Extraction Hook
 *
 * Provides functionality to extract BAP policy details from uploaded documents
 * and manage Commercial Auto-specific data including:
 * - Vehicle schedule with VINs
 * - Driver schedule
 * - Coverage forms with symbols
 * - Additional interests (loss payees, lienholders)
 * - Premium breakdown
 *
 * Uses Azure Document Intelligence + Claude for evidence-backed extraction.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  BAPPolicyDetails,
  BAPVehicle,
  BAPDriver,
  BAPAdditionalInsured,
  BAPCoverageItem,
} from '@/types/commercial-auto';

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

export interface BAPEvidenceCatalog {
  id: string;
  policyId: string;
  documentId: string | null;
  entries: Record<string, EvidenceEntry>;
  byBAPField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
  createdAt: string;
}

export interface BAPExtractionJob {
  id: string;
  policyId: string;
  documentId: string | null;
  status: 'pending' | 'ocr_processing' | 'extracting' | 'completed' | 'failed';
  ocrStartedAt: string | null;
  ocrCompletedAt: string | null;
  extractionStartedAt: string | null;
  extractionCompletedAt: string | null;
  vehiclesExtracted: number;
  driversExtracted: number;
  coveragesExtracted: number;
  interestsExtracted: number;
  overallConfidence: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractBAPOptions {
  documentId: string;
  policyId: string;
  documentType?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page';
}

export function useExtractBAPPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractBAPOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-bap-policy', {
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
        title: 'Commercial Auto Details Extracted',
        description: `Extracted ${data.vehicles_count} vehicles, ${data.drivers_count} drivers, ${data.coverages_count} coverages`,
      });
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['bap-vehicles', policyId] });
      queryClient.invalidateQueries({ queryKey: ['bap-drivers', policyId] });
      queryClient.invalidateQueries({ queryKey: ['bap-coverages', policyId] });
      queryClient.invalidateQueries({ queryKey: ['bap-interests', policyId] });
      queryClient.invalidateQueries({ queryKey: ['bap-details', policyId] });
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
// BAP DETAILS QUERY (from policies.bap_details JSONB)
// =============================================================================

export function useBAPPolicyDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-details', policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policies')
        .select('bap_details, extraction_source, extraction_confidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return {
        bapDetails: data.bap_details as BAPPolicyDetails | null,
        extractionSource: data.extraction_source,
        extractionConfidence: data.extraction_confidence,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// VEHICLES QUERY
// =============================================================================

export function useBAPVehicles(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-vehicles', policyId],
    queryFn: async (): Promise<BAPVehicle[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_bap_vehicles')
        .select('*')
        .eq('policy_id', policyId)
        .order('unit_number', { ascending: true });

      if (error) throw error;

      return data.map((v) => ({
        unit_number: v.unit_number,
        year: v.year,
        make: v.make,
        model: v.model,
        vin: v.vin,
        body_type: v.body_type,
        gvw: v.gvw,
        vehicle_class: v.vehicle_class,
        use_type: v.use_type,
        garaging_zip: v.garaging_zip,
        garaging_state: v.garaging_state,
        cost_new: v.cost_new,
        stated_amount: v.stated_amount,
        actual_cash_value: v.actual_cash_value,
        comprehensive_deductible: v.comprehensive_deductible,
        collision_deductible: v.collision_deductible,
        special_equipment_coverage: v.special_equipment_coverage,
        primary_driver_name: v.primary_driver_name,
        endorsements: v.endorsements || [],
        evidence_ids: v.evidence_ids || [],
        extraction_confidence: v.extraction_confidence,
        extraction_status: v.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// DRIVERS QUERY
// =============================================================================

export function useBAPDrivers(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-drivers', policyId],
    queryFn: async (): Promise<BAPDriver[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_bap_drivers')
        .select('*')
        .eq('policy_id', policyId)
        .order('name', { ascending: true });

      if (error) throw error;

      return data.map((d) => ({
        name: d.name,
        date_of_birth: d.date_of_birth,
        license_number: d.license_number,
        license_state: d.license_state,
        relationship: d.relationship,
        driver_type: d.driver_type,
        violations_points: d.violations_points,
        accidents_count: d.accidents_count,
        mvr_status: d.mvr_status,
        sr22_required: d.sr22_required,
        evidence_ids: d.evidence_ids || [],
        extraction_confidence: d.extraction_confidence,
        extraction_status: d.extraction_status,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// COVERAGES QUERY
// =============================================================================

export function useBAPCoverages(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-coverages', policyId],
    queryFn: async (): Promise<BAPCoverageItem[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_bap_coverages')
        .select('*')
        .eq('policy_id', policyId)
        .order('coverage_name', { ascending: true });

      if (error) throw error;

      return data.map((c) => ({
        coverage_name: c.coverage_name,
        symbols: c.symbols || [],
        limit: c.limit_amount,
        limit_type: c.limit_type,
        deductible: c.deductible,
        applies_to: c.applies_to,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ADDITIONAL INTERESTS QUERY
// =============================================================================

export function useBAPInterests(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-interests', policyId],
    queryFn: async (): Promise<BAPAdditionalInsured[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_bap_interests')
        .select('*')
        .eq('policy_id', policyId)
        .order('name', { ascending: true });

      if (error) throw error;

      return data.map((i) => ({
        name: i.name,
        address: i.address ? {
          street: i.address.street || '',
          city: i.address.city || '',
          state: i.address.state || '',
          zip: i.address.zip || '',
        } : undefined,
        relationship: i.relationship,
        vehicle_vins: i.vehicle_vins || [],
        vehicle_unit_numbers: i.vehicle_unit_numbers || [],
        coverage_type: i.interest_type,
        evidence_ids: i.evidence_ids || [],
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EVIDENCE CATALOG QUERY
// =============================================================================

export function useBAPEvidenceCatalog(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-evidence-catalog', policyId],
    queryFn: async (): Promise<BAPEvidenceCatalog | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_bap_evidence_catalog')
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
        byBAPField: data.evidence_by_field as Record<string, string[]>,
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

export function useBAPFieldEvidence(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-field-evidence', policyId],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (!policyId) return {};

      const { data, error } = await supabase
        .from('policies')
        .select('bap_field_evidence')
        .eq('id', policyId)
        .single();

      if (error) throw error;

      return (data.bap_field_evidence as Record<string, string[]>) || {};
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// EXTRACTION JOB STATUS
// =============================================================================

export function useBAPExtractionJob(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-extraction-job', policyId],
    queryFn: async (): Promise<BAPExtractionJob | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('policy_bap_extraction_jobs')
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
        status: data.status as BAPExtractionJob['status'],
        ocrStartedAt: data.ocr_started_at,
        ocrCompletedAt: data.ocr_completed_at,
        extractionStartedAt: data.extraction_started_at,
        extractionCompletedAt: data.extraction_completed_at,
        vehiclesExtracted: data.vehicles_extracted || 0,
        driversExtracted: data.drivers_extracted || 0,
        coveragesExtracted: data.coverages_extracted || 0,
        interestsExtracted: data.interests_extracted || 0,
        overallConfidence: data.overall_confidence,
        errorMessage: data.error_message,
        createdAt: data.created_at,
      };
    },
    enabled: !!policyId,
    refetchInterval: (query) => {
      const data = query.state.data;
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

export function useBAPExtractionHistory(policyId: string | undefined) {
  return useQuery({
    queryKey: ['bap-extraction-history', policyId],
    queryFn: async (): Promise<BAPExtractionJob[]> => {
      if (!policyId) return [];

      const { data, error } = await supabase
        .from('policy_bap_extraction_jobs')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return data.map((job) => ({
        id: job.id,
        policyId: job.policy_id,
        documentId: job.document_id,
        status: job.status as BAPExtractionJob['status'],
        ocrStartedAt: job.ocr_started_at,
        ocrCompletedAt: job.ocr_completed_at,
        extractionStartedAt: job.extraction_started_at,
        extractionCompletedAt: job.extraction_completed_at,
        vehiclesExtracted: job.vehicles_extracted || 0,
        driversExtracted: job.drivers_extracted || 0,
        coveragesExtracted: job.coverages_extracted || 0,
        interestsExtracted: job.interests_extracted || 0,
        overallConfidence: job.overall_confidence,
        errorMessage: job.error_message,
        createdAt: job.created_at,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// UPDATE BAP DETAILS
// =============================================================================

export function useUpdateBAPDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      bapDetails,
    }: {
      policyId: string;
      bapDetails: Partial<BAPPolicyDetails>;
    }) => {
      // Get existing details
      const { data: existing, error: fetchError } = await supabase
        .from('policies')
        .select('bap_details')
        .eq('id', policyId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing
      const merged = {
        ...((existing.bap_details as object) || {}),
        ...bapDetails,
        last_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('policies')
        .update({ bap_details: merged })
        .eq('id', policyId);

      if (updateError) throw updateError;

      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Commercial Auto Details Updated',
        description: 'Business Auto details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['bap-details', policyId] });
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
// ADD VEHICLE
// =============================================================================

export function useAddBAPVehicle() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      vehicle,
    }: {
      policyId: string;
      vehicle: Omit<BAPVehicle, 'evidence_ids' | 'extraction_confidence' | 'extraction_status'>;
    }) => {
      const { data, error } = await supabase
        .from('policy_bap_vehicles')
        .insert({
          policy_id: policyId,
          unit_number: vehicle.unit_number,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          vin: vehicle.vin,
          body_type: vehicle.body_type,
          gvw: vehicle.gvw,
          vehicle_class: vehicle.vehicle_class,
          use_type: vehicle.use_type,
          garaging_zip: vehicle.garaging_zip,
          garaging_state: vehicle.garaging_state,
          cost_new: vehicle.cost_new,
          stated_amount: vehicle.stated_amount,
          actual_cash_value: vehicle.actual_cash_value,
          comprehensive_deductible: vehicle.comprehensive_deductible,
          collision_deductible: vehicle.collision_deductible,
          special_equipment_coverage: vehicle.special_equipment_coverage,
          primary_driver_name: vehicle.primary_driver_name,
          endorsements: vehicle.endorsements,
          extraction_status: 'MANUAL',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Vehicle Added',
        description: 'Vehicle has been added to the schedule.',
      });
      queryClient.invalidateQueries({ queryKey: ['bap-vehicles', policyId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Add Vehicle',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// ADD DRIVER
// =============================================================================

export function useAddBAPDriver() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      driver,
    }: {
      policyId: string;
      driver: Omit<BAPDriver, 'evidence_ids' | 'extraction_confidence' | 'extraction_status'>;
    }) => {
      const { data, error } = await supabase
        .from('policy_bap_drivers')
        .insert({
          policy_id: policyId,
          name: driver.name,
          date_of_birth: driver.date_of_birth,
          license_number: driver.license_number,
          license_state: driver.license_state,
          relationship: driver.relationship,
          driver_type: driver.driver_type,
          violations_points: driver.violations_points,
          accidents_count: driver.accidents_count,
          mvr_status: driver.mvr_status,
          sr22_required: driver.sr22_required,
          extraction_status: 'MANUAL',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Driver Added',
        description: 'Driver has been added to the schedule.',
      });
      queryClient.invalidateQueries({ queryKey: ['bap-drivers', policyId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Add Driver',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// CHECK IF COMMERCIAL AUTO POLICY
// =============================================================================

export function isCommercialAutoPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('commercial auto') ||
    lob.includes('business auto') ||
    lob === 'bap' ||
    lob === 'ca' ||
    lob.includes('auto liability') ||
    (lob.includes('auto') && (lob.includes('commercial') || lob.includes('business')))
  );
}

// =============================================================================
// HELPER: GET BOUNDING BOXES FOR CLICK-TO-HIGHLIGHT
// =============================================================================

export function getBoundingBoxesForField(
  catalog: BAPEvidenceCatalog | null,
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
// HELPER: GET EVIDENCE ENTRIES FOR VEHICLE
// =============================================================================

export function getVehicleEvidence(
  catalog: BAPEvidenceCatalog | null,
  evidenceIds: string[]
): EvidenceEntry[] {
  if (!catalog || evidenceIds.length === 0) {
    return [];
  }

  return evidenceIds.map((id) => catalog.entries[id]).filter(Boolean);
}

// =============================================================================
// HELPER: GET EVIDENCE ENTRIES FOR DRIVER
// =============================================================================

export function getDriverEvidence(
  catalog: BAPEvidenceCatalog | null,
  evidenceIds: string[]
): EvidenceEntry[] {
  if (!catalog || evidenceIds.length === 0) {
    return [];
  }

  return evidenceIds.map((id) => catalog.entries[id]).filter(Boolean);
}

// =============================================================================
// HELPER: FORMAT VEHICLE DESCRIPTION
// =============================================================================

export function formatVehicleDescription(vehicle: BAPVehicle): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}
