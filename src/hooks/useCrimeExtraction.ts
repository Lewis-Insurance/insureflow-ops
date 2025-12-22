/**
 * Commercial Crime / Fidelity Extraction Hook
 *
 * Provides functionality to extract crime policy details from uploaded documents
 * and manage crime-specific data including insuring agreements and ERISA plans.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CommercialCrimeExtractedData,
  CommercialCrimeDetails,
  CrimeCoverages,
  CrimeCoverageType,
  CrimeEndorsement,
  CRIME_COVERAGE_LABELS,
} from '@/types/commercial-crime';

// =============================================================================
// TYPES FOR QUERY RESULTS
// =============================================================================

export interface CrimeCoverage {
  coverage_type: CrimeCoverageType;
  included: boolean;
  limit?: number;
  deductible?: number;
  coverage_form?: string;
  includes_leased_employees?: boolean;
  includes_volunteers?: boolean;
  includes_directors?: boolean;
  erisa_plan_covered?: boolean;
  direct_loss_only?: boolean;
  virus_coverage?: boolean;
  wire_transfer_covered?: boolean;
  ach_transfer_covered?: boolean;
  callback_verification_required?: boolean;
  discovery_period_days?: number;
}

export interface CrimeERISAPlan {
  plan_name: string;
  plan_number?: string;
  plan_assets?: number;
  required_bond_amount?: number;
  actual_bond_amount?: number;
  meets_dol_requirements?: boolean;
}

export interface CrimeConditions {
  discovery_period_days?: number;
  loss_sustained_retroactive_date?: string;
  territory?: string;
  acquisition_automatic_days?: number;
  joint_insured_provision?: boolean;
  other_insurance?: string;
}

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractCrimeOptions {
  documentId: string;
  policyId: string;
  documentType?: string;
}

export function useExtractCrimePolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractCrimeOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-crime-policy', {
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
      const flags = data.high_impact_flags?.length || 0;
      toast({
        title: 'Crime Details Extracted',
        description: flags > 0
          ? `Extracted ${data.coverages_count} coverages. ${flags} high-impact items flagged.`
          : `Extracted ${data.coverages_count} insuring agreements.`,
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['crime-details', policyId] });
      queryClient.invalidateQueries({ queryKey: ['crime-coverages', policyId] });
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
// CRIME DETAILS QUERY
// =============================================================================

export function useCrimeDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['crime-details', policyId],
    queryFn: async (): Promise<CommercialCrimeDetails | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('commercial_crime_details')
        .select('*')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        policy_id: data.policy_id,
        extracted_data: data.extracted_data as CommercialCrimeExtractedData,
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
// COVERAGES (INSURING AGREEMENTS) QUERY
// =============================================================================

export function useCrimeCoverages(policyId: string | undefined) {
  return useQuery({
    queryKey: ['crime-coverages', policyId],
    queryFn: async (): Promise<CrimeCoverage[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('commercial_crime_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('crime_coverages')
        .select('*')
        .eq('crime_details_id', details.id)
        .order('coverage_type', { ascending: true });

      if (error) throw error;

      return data.map((cov) => ({
        coverage_type: cov.coverage_type as CrimeCoverageType,
        included: cov.included,
        limit: cov.coverage_limit ? parseFloat(cov.coverage_limit) : undefined,
        deductible: cov.deductible ? parseFloat(cov.deductible) : undefined,
        coverage_form: cov.coverage_form,
        includes_leased_employees: cov.includes_leased_employees,
        includes_volunteers: cov.includes_volunteers,
        includes_directors: cov.includes_directors,
        erisa_plan_covered: cov.erisa_plan_covered,
        direct_loss_only: cov.direct_loss_only,
        virus_coverage: cov.virus_coverage,
        wire_transfer_covered: cov.wire_transfer_covered,
        ach_transfer_covered: cov.ach_transfer_covered,
        callback_verification_required: cov.callback_verification_required,
        discovery_period_days: cov.discovery_period_days,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ERISA PLANS QUERY
// =============================================================================

export function useCrimeERISAPlans(policyId: string | undefined) {
  return useQuery({
    queryKey: ['crime-erisa-plans', policyId],
    queryFn: async (): Promise<CrimeERISAPlan[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('commercial_crime_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('crime_erisa_plans')
        .select('*')
        .eq('crime_details_id', details.id);

      if (error) throw error;

      return data.map((plan) => ({
        plan_name: plan.plan_name,
        plan_number: plan.plan_number,
        plan_assets: plan.plan_assets ? parseFloat(plan.plan_assets) : undefined,
        required_bond_amount: plan.required_bond_amount ? parseFloat(plan.required_bond_amount) : undefined,
        actual_bond_amount: plan.actual_bond_amount ? parseFloat(plan.actual_bond_amount) : undefined,
        meets_dol_requirements: plan.meets_dol_requirements,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// CONDITIONS QUERY
// =============================================================================

export function useCrimeConditions(policyId: string | undefined) {
  return useQuery({
    queryKey: ['crime-conditions', policyId],
    queryFn: async (): Promise<CrimeConditions | null> => {
      if (!policyId) return null;

      const { data: details } = await supabase
        .from('commercial_crime_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return null;

      const { data, error } = await supabase
        .from('crime_conditions')
        .select('*')
        .eq('crime_details_id', details.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        discovery_period_days: data.discovery_period_days,
        loss_sustained_retroactive_date: data.loss_sustained_retroactive_date,
        territory: data.territory,
        acquisition_automatic_days: data.acquisition_automatic_days,
        joint_insured_provision: data.joint_insured_provision,
        other_insurance: data.other_insurance,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ENDORSEMENTS QUERY
// =============================================================================

export function useCrimeEndorsements(policyId: string | undefined) {
  return useQuery({
    queryKey: ['crime-endorsements', policyId],
    queryFn: async (): Promise<CrimeEndorsement[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('commercial_crime_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('crime_endorsements')
        .select('*')
        .eq('crime_details_id', details.id)
        .order('high_impact', { ascending: false });

      if (error) throw error;

      return data.map((end) => ({
        endorsement_number: end.endorsement_number,
        endorsement_name: end.endorsement_name,
        form_number: end.form_number,
        edition_date: end.edition_date,
        endorsement_type: end.endorsement_type as CrimeEndorsement['endorsement_type'],
        high_impact: end.high_impact || false,
        impact_description: end.impact_description,
        new_limit: end.new_limit ? parseFloat(end.new_limit) : undefined,
        new_deductible: end.new_deductible ? parseFloat(end.new_deductible) : undefined,
        applies_to_coverage: end.applies_to_coverage as CrimeCoverageType | undefined,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// UPDATE CRIME DETAILS
// =============================================================================

export function useUpdateCrimeDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      extractedData,
    }: {
      policyId: string;
      extractedData: Partial<CommercialCrimeExtractedData>;
    }) => {
      const { data: existing } = await supabase
        .from('commercial_crime_details')
        .select('extracted_data')
        .eq('policy_id', policyId)
        .single();

      const merged = {
        ...((existing?.extracted_data as object) || {}),
        ...extractedData,
      };

      const { error } = await supabase
        .from('commercial_crime_details')
        .update({ extracted_data: merged })
        .eq('policy_id', policyId);

      if (error) throw error;
      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Crime Details Updated',
        description: 'Commercial crime details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['crime-details', policyId] });
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
// HELPER FUNCTIONS
// =============================================================================

export function isCrimePolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return lob.includes('crime') ||
    lob.includes('fidelity') ||
    lob.includes('dishonesty') ||
    lob.includes('erisa bond');
}

export function hasEmployeeDishonesty(coverages: CrimeCoverage[]): boolean {
  return coverages.some(c => c.coverage_type === 'employee_dishonesty' && c.included);
}

export function hasComputerFraud(coverages: CrimeCoverage[]): boolean {
  return coverages.some(c => c.coverage_type === 'computer_fraud' && c.included);
}

export function hasFundsTransferFraud(coverages: CrimeCoverage[]): boolean {
  return coverages.some(c => c.coverage_type === 'funds_transfer_fraud' && c.included);
}

export function hasSocialEngineering(coverages: CrimeCoverage[]): boolean {
  return coverages.some(c => c.coverage_type === 'social_engineering' && c.included);
}

export function getHighImpactEndorsements(endorsements: CrimeEndorsement[]): CrimeEndorsement[] {
  return endorsements.filter(e => e.high_impact);
}

export function getIncludedCoverages(coverages: CrimeCoverage[]): CrimeCoverage[] {
  return coverages.filter(c => c.included);
}

export function getCoverageLabel(coverageType: CrimeCoverageType): string {
  const labels: Record<CrimeCoverageType, string> = {
    employee_dishonesty: 'Employee Dishonesty / Fidelity',
    forgery_alteration: 'Forgery or Alteration',
    inside_premises_theft: 'Inside the Premises - Theft',
    inside_premises_robbery: 'Inside the Premises - Robbery/Safe Burglary',
    outside_premises: 'Outside the Premises',
    computer_fraud: 'Computer Fraud',
    funds_transfer_fraud: 'Funds Transfer Fraud',
    money_orders_counterfeit: 'Money Orders & Counterfeit Money',
    credit_card_fraud: 'Credit Card Fraud',
    erisa_fidelity: 'ERISA Fidelity',
    social_engineering: 'Social Engineering Fraud',
    client_property: 'Client Property',
    impersonation_fraud: 'Impersonation Fraud',
    telephone_fraud: 'Telephone Fraud',
    invoice_manipulation: 'Invoice Manipulation',
  };
  return labels[coverageType] || coverageType;
}

/**
 * Calculate required ERISA bond amount based on DOL requirements
 * DOL requires 10% of plan assets, minimum $1,000, maximum $500,000 (or $1M with broker-dealer)
 */
export function calculateRequiredERISABond(planAssets: number, hasBrokerDealer: boolean = false): number {
  const maxBond = hasBrokerDealer ? 1000000 : 500000;
  const calculatedBond = planAssets * 0.10;
  return Math.max(1000, Math.min(calculatedBond, maxBond));
}

export function checkERISACompliance(planAssets: number, actualBond: number, hasBrokerDealer: boolean = false): boolean {
  const required = calculateRequiredERISABond(planAssets, hasBrokerDealer);
  return actualBond >= required;
}
