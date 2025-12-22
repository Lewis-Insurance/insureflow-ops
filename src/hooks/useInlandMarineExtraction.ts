/**
 * Inland Marine Extraction Hook
 *
 * Provides functionality to extract IM policy details from uploaded documents
 * and manage Inland Marine-specific data including scheduled items.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  InlandMarineExtractedData,
  InlandMarineDetails,
  ScheduledItem,
  BlanketCoverage,
  CoveredLocation,
  IMAdditionalInterest,
  InlandMarineEndorsement,
} from '@/types/commercial-inland-marine';

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractIMOptions {
  documentId: string;
  policyId: string;
  documentType?: string;
}

export function useExtractInlandMarinePolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractIMOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-inland-marine-policy', {
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
        title: 'IM Details Extracted',
        description: `Extracted ${data.scheduled_items_count} scheduled items, ${data.blanket_coverages_count} blanket coverages`,
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['inland-marine-details', policyId] });
      queryClient.invalidateQueries({ queryKey: ['im-scheduled-items', policyId] });
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
// IM DETAILS QUERY
// =============================================================================

export function useInlandMarineDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['inland-marine-details', policyId],
    queryFn: async (): Promise<InlandMarineDetails | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('inland_marine_details')
        .select('*')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        policy_id: data.policy_id,
        extracted_data: data.extracted_data as InlandMarineExtractedData,
        field_status: data.field_status as Record<string, any>,
        field_confidence: data.field_confidence as Record<string, number>,
        evidence_references: data.evidence_references as Record<string, any>,
        verified_by: data.verified_by,
        verified_at: data.verified_at,
        verification_notes: data.verification_notes,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// SCHEDULED ITEMS QUERY
// =============================================================================

export function useIMScheduledItems(policyId: string | undefined) {
  return useQuery({
    queryKey: ['im-scheduled-items', policyId],
    queryFn: async (): Promise<ScheduledItem[]> => {
      if (!policyId) return [];

      // First get the details ID
      const { data: details } = await supabase
        .from('inland_marine_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('inland_marine_scheduled_items')
        .select('*')
        .eq('inland_marine_details_id', details.id)
        .order('description', { ascending: true });

      if (error) throw error;

      return data.map((item) => ({
        item_id: item.item_id,
        description: item.description,
        manufacturer: item.manufacturer,
        model: item.model,
        serial_number: item.serial_number,
        vin: item.vin,
        year: item.year,
        scheduled_value: parseFloat(item.scheduled_value),
        valuation_basis: item.valuation_basis as ScheduledItem['valuation_basis'],
        deductible: item.deductible ? parseFloat(item.deductible) : undefined,
        primary_location: item.primary_location,
        assigned_jobsite: item.assigned_jobsite,
        loss_payee: item.loss_payee,
        leased: item.leased,
        lessor_name: item.lessor_name,
        theft_coverage_included: item.theft_coverage_included,
        mysterious_disappearance_included: item.mysterious_disappearance_included,
        condition: item.condition as ScheduledItem['condition'],
        acquisition_date: item.acquisition_date,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// BLANKET COVERAGES QUERY
// =============================================================================

export function useIMBlanketCoverages(policyId: string | undefined) {
  return useQuery({
    queryKey: ['im-blanket-coverages', policyId],
    queryFn: async (): Promise<BlanketCoverage[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('inland_marine_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('inland_marine_blanket_coverages')
        .select('*')
        .eq('inland_marine_details_id', details.id);

      if (error) throw error;

      return data.map((cov) => ({
        category: cov.category,
        blanket_limit: parseFloat(cov.blanket_limit),
        per_item_limit: cov.per_item_limit ? parseFloat(cov.per_item_limit) : undefined,
        valuation_basis: cov.valuation_basis as BlanketCoverage['valuation_basis'],
        deductible: parseFloat(cov.deductible),
        description: cov.description,
        sublimits: cov.sublimits,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// LOCATIONS QUERY
// =============================================================================

export function useIMLocations(policyId: string | undefined) {
  return useQuery({
    queryKey: ['im-locations', policyId],
    queryFn: async (): Promise<CoveredLocation[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('inland_marine_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('inland_marine_locations')
        .select('*')
        .eq('inland_marine_details_id', details.id)
        .order('location_number', { ascending: true });

      if (error) throw error;

      return data.map((loc) => ({
        location_id: loc.location_id,
        location_number: loc.location_number,
        name: loc.name,
        address: {
          street: loc.address_line1,
          street2: loc.address_line2,
          city: loc.city,
          state: loc.state,
          zip: loc.zip_code,
          country: loc.country,
        },
        location_type: loc.location_type as CoveredLocation['location_type'],
        location_limit: loc.location_limit ? parseFloat(loc.location_limit) : undefined,
        deductible: loc.deductible ? parseFloat(loc.deductible) : undefined,
        security_features: loc.security_features,
        project_name: loc.project_name,
        project_start_date: loc.project_start_date,
        project_end_date: loc.project_end_date,
        general_contractor: loc.general_contractor,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ADDITIONAL INTERESTS QUERY
// =============================================================================

export function useIMAdditionalInterests(policyId: string | undefined) {
  return useQuery({
    queryKey: ['im-additional-interests', policyId],
    queryFn: async (): Promise<IMAdditionalInterest[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('inland_marine_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('inland_marine_additional_interests')
        .select('*')
        .eq('inland_marine_details_id', details.id);

      if (error) throw error;

      return data.map((int) => ({
        interest_id: int.interest_id,
        name: int.name,
        address: {
          street: int.address_line1,
          street2: int.address_line2,
          city: int.city,
          state: int.state,
          zip: int.zip_code,
        },
        interest_type: int.interest_type as IMAdditionalInterest['interest_type'],
        applies_to: int.applies_to as IMAdditionalInterest['applies_to'],
        scheduled_item_ids: int.scheduled_item_ids,
        loan_number: int.loan_number,
        lease_number: int.lease_number,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ENDORSEMENTS QUERY
// =============================================================================

export function useIMEndorsements(policyId: string | undefined) {
  return useQuery({
    queryKey: ['im-endorsements', policyId],
    queryFn: async (): Promise<InlandMarineEndorsement[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('inland_marine_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('inland_marine_endorsements')
        .select('*')
        .eq('inland_marine_details_id', details.id)
        .order('high_impact', { ascending: false });

      if (error) throw error;

      return data.map((end) => ({
        endorsement_number: end.endorsement_number,
        endorsement_name: end.endorsement_name,
        form_number: end.form_number,
        edition_date: end.edition_date,
        endorsement_type: end.endorsement_type as InlandMarineEndorsement['endorsement_type'],
        high_impact: end.high_impact,
        impact_description: end.impact_description,
        excluded_perils: end.excluded_perils,
        excluded_property: end.excluded_property,
        excluded_locations: end.excluded_locations,
        affects_coverage: end.affects_coverage,
        new_limit: end.new_limit ? parseFloat(end.new_limit) : undefined,
        new_deductible: end.new_deductible ? parseFloat(end.new_deductible) : undefined,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// UPDATE IM DETAILS
// =============================================================================

export function useUpdateIMDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      extractedData,
    }: {
      policyId: string;
      extractedData: Partial<InlandMarineExtractedData>;
    }) => {
      const { data: existing } = await supabase
        .from('inland_marine_details')
        .select('extracted_data')
        .eq('policy_id', policyId)
        .single();

      const merged = {
        ...((existing?.extracted_data as object) || {}),
        ...extractedData,
      };

      const { error } = await supabase
        .from('inland_marine_details')
        .update({ extracted_data: merged })
        .eq('policy_id', policyId);

      if (error) throw error;
      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'IM Details Updated',
        description: 'Inland Marine details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['inland-marine-details', policyId] });
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
// ADD SCHEDULED ITEM
// =============================================================================

export function useAddIMScheduledItem() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      item,
    }: {
      policyId: string;
      item: Omit<ScheduledItem, 'item_id'>;
    }) => {
      const { data: details } = await supabase
        .from('inland_marine_details')
        .select('id')
        .eq('policy_id', policyId)
        .single();

      if (!details) throw new Error('IM details not found');

      const itemId = `ITEM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      const { data, error } = await supabase
        .from('inland_marine_scheduled_items')
        .insert({
          inland_marine_details_id: details.id,
          item_id: itemId,
          description: item.description,
          manufacturer: item.manufacturer,
          model: item.model,
          serial_number: item.serial_number,
          vin: item.vin,
          year: item.year,
          scheduled_value: item.scheduled_value,
          valuation_basis: item.valuation_basis,
          deductible: item.deductible,
          primary_location: item.primary_location,
          loss_payee: item.loss_payee,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Item Added',
        description: 'Scheduled item has been added.',
      });
      queryClient.invalidateQueries({ queryKey: ['im-scheduled-items', policyId] });
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
// HELPER FUNCTIONS
// =============================================================================

export function isInlandMarinePolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return lob.includes('inland') ||
    lob.includes('marine') ||
    lob.includes('equipment') ||
    lob.includes('floater') ||
    lob === 'im';
}

export function calculateTotalScheduledValue(items: ScheduledItem[]): number {
  return items.reduce((sum, item) => sum + (item.scheduled_value || 0), 0);
}

export function getHighImpactEndorsements(endorsements: InlandMarineEndorsement[]): InlandMarineEndorsement[] {
  return endorsements.filter(e => e.high_impact);
}
