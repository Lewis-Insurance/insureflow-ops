/**
 * Cyber Liability Extraction Hook
 *
 * Provides functionality to extract cyber liability policy details from
 * uploaded documents and manage first-party/third-party cyber coverages.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CyberLiabilityExtractedData,
  CyberLiabilityDetails,
  FirstPartyCoverages,
  ThirdPartyCoverages,
  ClaimsMadeProvisions,
  IncidentResponsePanel,
  CyberEndorsement,
} from '@/types/cyber-liability';

// =============================================================================
// EXTRACTION MUTATION
// =============================================================================

interface ExtractCyberOptions {
  documentId: string;
  policyId: string;
  documentType?: string;
}

export function useExtractCyberPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, policyId, documentType = 'policy' }: ExtractCyberOptions) => {
      const { data, error } = await supabase.functions.invoke('extract-cyber-policy', {
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
        title: 'Cyber Details Extracted',
        description: flags > 0
          ? `Extraction complete. ${flags} high-impact items flagged.`
          : 'Cyber liability details extracted successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      queryClient.invalidateQueries({ queryKey: ['cyber-details', policyId] });
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
// CYBER DETAILS QUERY
// =============================================================================

export function useCyberDetails(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cyber-details', policyId],
    queryFn: async (): Promise<CyberLiabilityDetails | null> => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from('cyber_liability_details')
        .select('*')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        policy_id: data.policy_id,
        extracted_data: data.extracted_data as CyberLiabilityExtractedData,
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
// FIRST-PARTY COVERAGES QUERY
// =============================================================================

export function useCyberFirstPartyCoverages(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cyber-first-party', policyId],
    queryFn: async (): Promise<FirstPartyCoverages | null> => {
      if (!policyId) return null;

      const { data: details } = await supabase
        .from('cyber_liability_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return null;

      const { data, error } = await supabase
        .from('cyber_first_party_coverages')
        .select('*')
        .eq('cyber_details_id', details.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        data_breach_response: {
          included: data.breach_response_included || false,
          limit: data.breach_response_limit ? parseFloat(data.breach_response_limit) : undefined,
          forensic_investigation: data.forensic_investigation_limit
            ? { included: true, limit: parseFloat(data.forensic_investigation_limit) }
            : undefined,
          notification_costs: data.notification_costs_limit
            ? { included: true, limit: parseFloat(data.notification_costs_limit) }
            : undefined,
          credit_monitoring: data.credit_monitoring_limit
            ? { included: true, limit: parseFloat(data.credit_monitoring_limit), duration_months: data.credit_monitoring_months }
            : undefined,
          breach_coach: { included: data.breach_coach_required || false },
        },
        cyber_extortion: {
          included: data.extortion_included || false,
          limit: data.extortion_limit ? parseFloat(data.extortion_limit) : undefined,
          ransom_payment: data.ransom_payment_included
            ? { included: true, limit: data.ransom_payment_limit ? parseFloat(data.ransom_payment_limit) : undefined, cryptocurrency_allowed: data.cryptocurrency_allowed }
            : undefined,
          waiting_period_hours: data.extortion_waiting_hours,
        },
        business_interruption: {
          included: data.bi_included || false,
          limit: data.bi_limit ? parseFloat(data.bi_limit) : undefined,
          waiting_period_hours: data.bi_waiting_hours || 0,
          restoration_period_days: data.bi_restoration_days,
          daily_limit: data.bi_daily_limit ? parseFloat(data.bi_daily_limit) : undefined,
          system_failure: data.system_failure_included
            ? { included: true, limit: data.system_failure_limit ? parseFloat(data.system_failure_limit) : undefined }
            : undefined,
          contingent_bi: data.contingent_bi_included
            ? { included: true, limit: data.contingent_bi_limit ? parseFloat(data.contingent_bi_limit) : undefined }
            : undefined,
        },
        data_restoration: {
          included: data.data_restoration_included || false,
          limit: data.data_restoration_limit ? parseFloat(data.data_restoration_limit) : undefined,
          bricking_coverage: data.bricking_included
            ? { included: true, limit: data.bricking_limit ? parseFloat(data.bricking_limit) : undefined }
            : undefined,
        },
        social_engineering: data.social_engineering_included
          ? {
              included: true,
              limit: data.social_engineering_limit ? parseFloat(data.social_engineering_limit) : undefined,
              funds_transfer_fraud: data.funds_transfer_fraud,
              invoice_manipulation: data.invoice_manipulation,
              callback_verification_required: data.callback_verification_required,
            }
          : undefined,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// THIRD-PARTY COVERAGES QUERY
// =============================================================================

export function useCyberThirdPartyCoverages(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cyber-third-party', policyId],
    queryFn: async (): Promise<ThirdPartyCoverages | null> => {
      if (!policyId) return null;

      const { data: details } = await supabase
        .from('cyber_liability_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return null;

      const { data, error } = await supabase
        .from('cyber_third_party_coverages')
        .select('*')
        .eq('cyber_details_id', details.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        network_security_liability: {
          included: data.network_security_included || false,
          limit: data.network_security_limit ? parseFloat(data.network_security_limit) : undefined,
          defense_costs: (data.network_security_defense_costs as 'inside_limits' | 'outside_limits') || 'inside_limits',
        },
        privacy_liability: {
          included: data.privacy_liability_included || false,
          limit: data.privacy_liability_limit ? parseFloat(data.privacy_liability_limit) : undefined,
          defense_costs: (data.privacy_defense_costs as 'inside_limits' | 'outside_limits') || 'inside_limits',
          regulatory_defense: data.regulatory_defense_included
            ? { included: true, limit: data.regulatory_defense_limit ? parseFloat(data.regulatory_defense_limit) : undefined }
            : undefined,
          regulatory_fines: data.regulatory_fines_included
            ? { included: true, limit: data.regulatory_fines_limit ? parseFloat(data.regulatory_fines_limit) : undefined }
            : undefined,
          pci_dss_fines: data.pci_dss_fines_included
            ? { included: true, limit: data.pci_dss_fines_limit ? parseFloat(data.pci_dss_fines_limit) : undefined }
            : undefined,
        },
        media_liability: data.media_liability_included
          ? {
              included: true,
              limit: data.media_liability_limit ? parseFloat(data.media_liability_limit) : undefined,
              defense_costs: (data.media_defense_costs as 'inside_limits' | 'outside_limits') || 'inside_limits',
              defamation: data.defamation_covered,
              copyright_infringement: data.copyright_infringement_covered,
              digital_only: data.digital_only,
            }
          : undefined,
        technology_eo: data.tech_eo_included
          ? {
              included: true,
              limit: data.tech_eo_limit ? parseFloat(data.tech_eo_limit) : undefined,
              defense_costs: (data.tech_eo_defense_costs as 'inside_limits' | 'outside_limits') || 'inside_limits',
            }
          : undefined,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// CLAIMS-MADE PROVISIONS QUERY
// =============================================================================

export function useCyberClaimsMade(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cyber-claims-made', policyId],
    queryFn: async (): Promise<ClaimsMadeProvisions | null> => {
      if (!policyId) return null;

      const { data: details } = await supabase
        .from('cyber_liability_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return null;

      const { data, error } = await supabase
        .from('cyber_claims_made_provisions')
        .select('*')
        .eq('cyber_details_id', details.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        retroactive_date: data.retroactive_date,
        full_prior_acts: data.full_prior_acts || false,
        continuity_date: data.continuity_date,
        pending_prior_date: data.pending_prior_date,
        erp_available: data.erp_available || false,
        basic_erp_days: data.basic_erp_days,
        supplemental_erp_options: data.supplemental_erp_options as ClaimsMadeProvisions['supplemental_erp_options'],
        automatic_erp_on_nonrenewal: data.automatic_erp_on_nonrenewal,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// INCIDENT RESPONSE PANEL QUERY
// =============================================================================

export function useCyberIncidentResponse(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cyber-incident-response', policyId],
    queryFn: async (): Promise<IncidentResponsePanel | null> => {
      if (!policyId) return null;

      const { data: details } = await supabase
        .from('cyber_liability_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return null;

      const { data, error } = await supabase
        .from('cyber_incident_response_panel')
        .select('*')
        .eq('cyber_details_id', details.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        breach_coach_required: data.breach_coach_required || false,
        breach_coach_firms: data.breach_coach_firms as string[],
        forensic_vendors: data.forensic_vendors as string[],
        notification_vendors: data.notification_vendors as string[],
        pr_firms: data.pr_firms as string[],
        legal_firms: data.legal_firms as string[],
        credit_monitoring_vendors: data.credit_monitoring_vendors as string[],
        pre_approval_required: data.pre_approval_required,
        pre_approval_threshold: data.pre_approval_threshold ? parseFloat(data.pre_approval_threshold) : undefined,
        claims_hotline: data.claims_hotline,
        incident_hotline: data.incident_hotline,
      };
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// ENDORSEMENTS QUERY
// =============================================================================

export function useCyberEndorsements(policyId: string | undefined) {
  return useQuery({
    queryKey: ['cyber-endorsements', policyId],
    queryFn: async (): Promise<CyberEndorsement[]> => {
      if (!policyId) return [];

      const { data: details } = await supabase
        .from('cyber_liability_details')
        .select('id')
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!details) return [];

      const { data, error } = await supabase
        .from('cyber_endorsements')
        .select('*')
        .eq('cyber_details_id', details.id)
        .order('high_impact', { ascending: false });

      if (error) throw error;

      return data.map((end) => ({
        endorsement_number: end.endorsement_number,
        endorsement_name: end.endorsement_name,
        form_number: end.form_number,
        edition_date: end.edition_date,
        endorsement_type: end.endorsement_type as CyberEndorsement['endorsement_type'],
        high_impact: end.high_impact || false,
        impact_description: end.impact_description,
      }));
    },
    enabled: !!policyId,
  });
}

// =============================================================================
// UPDATE CYBER DETAILS
// =============================================================================

export function useUpdateCyberDetails() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      extractedData,
    }: {
      policyId: string;
      extractedData: Partial<CyberLiabilityExtractedData>;
    }) => {
      const { data: existing } = await supabase
        .from('cyber_liability_details')
        .select('extracted_data')
        .eq('policy_id', policyId)
        .single();

      const merged = {
        ...((existing?.extracted_data as object) || {}),
        ...extractedData,
      };

      const { error } = await supabase
        .from('cyber_liability_details')
        .update({ extracted_data: merged })
        .eq('policy_id', policyId);

      if (error) throw error;
      return merged;
    },
    onSuccess: (_, { policyId }) => {
      toast({
        title: 'Cyber Details Updated',
        description: 'Cyber liability details have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['cyber-details', policyId] });
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

export function isCyberPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return lob.includes('cyber') ||
    lob.includes('data breach') ||
    lob.includes('network security') ||
    lob.includes('privacy');
}

export function hasRansomwareCoverage(firstParty: FirstPartyCoverages | null): boolean {
  return Boolean(
    firstParty?.cyber_extortion?.included &&
    firstParty?.cyber_extortion?.ransom_payment?.included
  );
}

export function hasSocialEngineeringCoverage(firstParty: FirstPartyCoverages | null): boolean {
  return Boolean(firstParty?.social_engineering?.included);
}

export function hasSystemFailureCoverage(firstParty: FirstPartyCoverages | null): boolean {
  return Boolean(firstParty?.business_interruption?.system_failure?.included);
}

export function getHighImpactEndorsements(endorsements: CyberEndorsement[]): CyberEndorsement[] {
  return endorsements.filter(e => e.high_impact);
}

export function isClaimsMadePolicy(extractedData: CyberLiabilityExtractedData | null): boolean {
  return extractedData?.policy_form === 'claims_made';
}
