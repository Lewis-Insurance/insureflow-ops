// ============================================
// Section-Level Completion Tracking Hook
// Tracks completion status of ACORD form sections
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { SectionDefinition, AcordFormSection, SectionStatus } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface SectionProgress {
  sectionNumber: number;
  sectionName: string;
  description: string;
  status: SectionStatus;
  fieldsTotal: number;
  fieldsCompleted: number;
  completionPercentage: number;
  requiredForSubmission: boolean;
  assignedTo?: string;
  assignedToName?: string;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  estimatedMinutes: number;
  blockedBy?: number[]; // Section numbers that must be completed first
}

export interface FormProgress {
  formId: string;
  formNumber: string;
  formName: string;
  totalSections: number;
  completedSections: number;
  overallProgress: number;
  sections: SectionProgress[];
  canSubmit: boolean;
  blockers: string[];
  estimatedTimeRemaining: number; // minutes
}

export interface UseSectionTrackingReturn {
  progress: FormProgress | null;
  isLoading: boolean;
  error: string | null;
  refreshProgress: () => Promise<void>;
  updateSectionStatus: (sectionNumber: number, status: SectionStatus, notes?: string) => Promise<boolean>;
  assignSection: (sectionNumber: number, userId: string) => Promise<boolean>;
  unassignSection: (sectionNumber: number) => Promise<boolean>;
  markSectionComplete: (sectionNumber: number) => Promise<boolean>;
  flagSection: (sectionNumber: number, reason: string) => Promise<boolean>;
}

// ============================================
// SECTION DEFINITIONS
// ============================================

/**
 * Get section definitions for an ACORD form number
 */
export function getSectionDefinitions(formNumber: string): SectionDefinition[] {
  const sectionMappings: Record<string, SectionDefinition[]> = {
    '125': [
      {
        sectionNumber: 1,
        sectionName: 'Applicant Information',
        description: 'Business name, address, and contact information',
        fields: ['applicant_name', 'applicant_address', 'applicant_city', 'applicant_state', 'applicant_zip', 'phone', 'fax', 'email'],
        requiredForSubmission: true,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 2,
        sectionName: 'Agency Information',
        description: 'Producer/agency details and codes',
        fields: ['agency_name', 'agency_code', 'agent_name', 'producer_phone', 'producer_email'],
        requiredForSubmission: true,
        estimatedMinutes: 3,
      },
      {
        sectionNumber: 3,
        sectionName: 'Business Information',
        description: 'Nature of business, SIC/NAICS codes, years in business',
        fields: ['business_description', 'sic_code', 'naics_code', 'years_in_business', 'fein'],
        requiredForSubmission: true,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 4,
        sectionName: 'Coverage Information',
        description: 'Requested coverage types and effective dates',
        fields: ['effective_date', 'expiration_date', 'coverage_gl', 'coverage_auto', 'coverage_wc', 'coverage_property'],
        requiredForSubmission: true,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 5,
        sectionName: 'Prior Insurance',
        description: 'Current and prior carrier information',
        fields: ['current_carrier', 'current_policy_number', 'current_premium', 'current_expiration'],
        requiredForSubmission: false,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 6,
        sectionName: 'Loss History',
        description: 'Claims and losses in the past 5 years',
        fields: ['losses_5_years', 'loss_details'],
        requiredForSubmission: true,
        estimatedMinutes: 10,
      },
      {
        sectionNumber: 7,
        sectionName: 'Locations',
        description: 'Business locations and property information',
        fields: ['location_1', 'location_2', 'location_3'],
        requiredForSubmission: false,
        estimatedMinutes: 8,
      },
      {
        sectionNumber: 8,
        sectionName: 'Signatures',
        description: 'Applicant and agent signatures',
        fields: ['applicant_signature', 'applicant_signature_date', 'agent_signature', 'agent_signature_date'],
        requiredForSubmission: true,
        estimatedMinutes: 2,
      },
    ],
    '126': [
      {
        sectionNumber: 1,
        sectionName: 'General Liability Information',
        description: 'Classification and exposure bases',
        fields: ['class_code', 'classification_description', 'premises_operations', 'products_completed_ops'],
        requiredForSubmission: true,
        estimatedMinutes: 8,
      },
      {
        sectionNumber: 2,
        sectionName: 'Limits & Coverages',
        description: 'Coverage limits and deductibles',
        fields: ['occurrence_limit', 'aggregate_limit', 'personal_injury', 'medical_payments', 'deductible'],
        requiredForSubmission: true,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 3,
        sectionName: 'Premises Information',
        description: 'Details about business premises',
        fields: ['owned_premises', 'leased_premises', 'premises_area'],
        requiredForSubmission: false,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 4,
        sectionName: 'Operations',
        description: 'Business operations and exposures',
        fields: ['gross_sales', 'payroll', 'subcontractor_costs'],
        requiredForSubmission: true,
        estimatedMinutes: 8,
      },
    ],
    '127': [
      {
        sectionNumber: 1,
        sectionName: 'Vehicle Schedule',
        description: 'List of all covered vehicles',
        fields: ['vehicle_1', 'vehicle_2', 'vehicle_3'],
        requiredForSubmission: true,
        estimatedMinutes: 10,
      },
      {
        sectionNumber: 2,
        sectionName: 'Driver Information',
        description: 'Driver details and MVR information',
        fields: ['driver_1', 'driver_2', 'driver_3'],
        requiredForSubmission: true,
        estimatedMinutes: 10,
      },
      {
        sectionNumber: 3,
        sectionName: 'Coverage & Limits',
        description: 'Auto liability, physical damage coverage',
        fields: ['liability_limit', 'comp_ded', 'coll_ded', 'um_uim'],
        requiredForSubmission: true,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 4,
        sectionName: 'Radius of Operations',
        description: 'Vehicle usage and territory',
        fields: ['radius', 'state_of_operation', 'farthest_one_way'],
        requiredForSubmission: false,
        estimatedMinutes: 3,
      },
    ],
    '130': [
      {
        sectionNumber: 1,
        sectionName: 'Employer Information',
        description: 'Basic employer details',
        fields: ['employer_name', 'employer_address', 'fein', 'nature_of_business'],
        requiredForSubmission: true,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 2,
        sectionName: 'Classification & Payroll',
        description: 'Class codes and estimated payroll',
        fields: ['class_code_1', 'payroll_1', 'class_code_2', 'payroll_2'],
        requiredForSubmission: true,
        estimatedMinutes: 10,
      },
      {
        sectionNumber: 3,
        sectionName: 'Experience Modification',
        description: 'Experience mod and rating information',
        fields: ['experience_mod', 'mod_effective_date', 'interstate_risk'],
        requiredForSubmission: false,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 4,
        sectionName: 'Prior Coverage',
        description: 'Workers comp claims history',
        fields: ['prior_carrier', 'prior_policy', 'claims_history'],
        requiredForSubmission: true,
        estimatedMinutes: 8,
      },
    ],
    '140': [
      {
        sectionNumber: 1,
        sectionName: 'Property Information',
        description: 'Building and contents details',
        fields: ['building_value', 'contents_value', 'construction_type', 'year_built'],
        requiredForSubmission: true,
        estimatedMinutes: 8,
      },
      {
        sectionNumber: 2,
        sectionName: 'Coverage & Valuation',
        description: 'Coverage forms and valuation methods',
        fields: ['coverage_form', 'valuation', 'coinsurance', 'deductible'],
        requiredForSubmission: true,
        estimatedMinutes: 5,
      },
      {
        sectionNumber: 3,
        sectionName: 'Protection',
        description: 'Fire protection and security',
        fields: ['fire_district', 'protection_class', 'sprinklered', 'alarm_type'],
        requiredForSubmission: false,
        estimatedMinutes: 5,
      },
    ],
  };

  return sectionMappings[formNumber] || [];
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useSectionTracking(formId: string): UseSectionTrackingReturn {
  const [progress, setProgress] = useState<FormProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  /**
   * Calculate section completion based on field values
   */
  const calculateSectionCompletion = useCallback(
    (section: SectionDefinition, fieldValues: Record<string, any>): { total: number; completed: number } => {
      let completed = 0;
      for (const field of section.fields) {
        const value = fieldValues[field];
        if (value !== undefined && value !== null && value !== '') {
          completed++;
        }
      }
      return { total: section.fields.length, completed };
    },
    []
  );

  /**
   * Load form progress
   */
  const refreshProgress = useCallback(async () => {
    if (!formId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get form with template
      const { data: form, error: formError } = await supabase
        .from('acord_forms')
        .select(`
          *,
          template:template_id(form_number, form_name, section_definitions)
        `)
        .eq('id', formId)
        .single();

      if (formError) throw formError;

      const formNumber = (form.template as any)?.form_number;
      const formName = (form.template as any)?.form_name;
      const fieldValues = form.field_values || {};

      // Get section definitions
      const sectionDefs = getSectionDefinitions(formNumber);
      if (sectionDefs.length === 0) {
        setProgress(null);
        return;
      }

      // Get saved section statuses
      const { data: savedSections } = await supabase
        .from('acord_form_sections')
        .select('*')
        .eq('acord_form_id', formId);

      const savedSectionMap = new Map(
        (savedSections || []).map(s => [s.section_number, s])
      );

      // Build section progress
      const sections: SectionProgress[] = [];
      let completedSections = 0;
      let estimatedTimeRemaining = 0;

      for (const def of sectionDefs) {
        const { total, completed } = calculateSectionCompletion(def, fieldValues);
        const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        const savedSection = savedSectionMap.get(def.sectionNumber);

        // Determine status
        let status: SectionStatus = 'incomplete';
        if (savedSection?.status === 'flagged') {
          status = 'flagged';
        } else if (savedSection?.status === 'complete' || completionPercentage === 100) {
          status = 'complete';
          completedSections++;
        } else if (completionPercentage > 0) {
          status = 'in_progress';
          estimatedTimeRemaining += Math.round(def.estimatedMinutes * (1 - completionPercentage / 100));
        } else {
          estimatedTimeRemaining += def.estimatedMinutes;
        }

        sections.push({
          sectionNumber: def.sectionNumber,
          sectionName: def.sectionName,
          description: def.description,
          status,
          fieldsTotal: total,
          fieldsCompleted: completed,
          completionPercentage,
          requiredForSubmission: def.requiredForSubmission,
          assignedTo: savedSection?.assigned_to,
          completedBy: savedSection?.completed_by,
          completedAt: savedSection?.completed_at,
          notes: savedSection?.notes,
          estimatedMinutes: def.estimatedMinutes,
        });
      }

      // Calculate blockers
      const blockers: string[] = [];
      sections.forEach(s => {
        if (s.requiredForSubmission && s.status !== 'complete') {
          blockers.push(`${s.sectionName} is incomplete`);
        }
        if (s.status === 'flagged') {
          blockers.push(`${s.sectionName} is flagged for review`);
        }
      });

      const overallProgress = Math.round(
        (sections.reduce((sum, s) => sum + s.completionPercentage, 0) / sections.length)
      );

      setProgress({
        formId,
        formNumber,
        formName,
        totalSections: sections.length,
        completedSections,
        overallProgress,
        sections,
        canSubmit: blockers.length === 0,
        blockers,
        estimatedTimeRemaining,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load progress';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [formId, calculateSectionCompletion]);

  /**
   * Update section status
   */
  const updateSectionStatus = useCallback(
    async (sectionNumber: number, status: SectionStatus, notes?: string): Promise<boolean> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check if section record exists
        const { data: existing } = await supabase
          .from('acord_form_sections')
          .select('id')
          .eq('acord_form_id', formId)
          .eq('section_number', sectionNumber)
          .single();

        const updates: any = {
          status,
          notes,
        };

        if (status === 'complete') {
          updates.completed_by = user.id;
          updates.completed_at = new Date().toISOString();
        }

        if (existing) {
          const { error } = await supabase
            .from('acord_form_sections')
            .update(updates)
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          // Get section name from definitions
          const section = progress?.sections.find(s => s.sectionNumber === sectionNumber);

          const { error } = await supabase
            .from('acord_form_sections')
            .insert({
              acord_form_id: formId,
              section_number: sectionNumber,
              section_name: section?.sectionName || `Section ${sectionNumber}`,
              ...updates,
            });

          if (error) throw error;
        }

        await refreshProgress();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update status';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [formId, progress, refreshProgress, toast]
  );

  /**
   * Assign section to a user
   */
  const assignSection = useCallback(
    async (sectionNumber: number, userId: string): Promise<boolean> => {
      try {
        const { data: existing } = await supabase
          .from('acord_form_sections')
          .select('id')
          .eq('acord_form_id', formId)
          .eq('section_number', sectionNumber)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('acord_form_sections')
            .update({ assigned_to: userId })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          const section = progress?.sections.find(s => s.sectionNumber === sectionNumber);

          const { error } = await supabase
            .from('acord_form_sections')
            .insert({
              acord_form_id: formId,
              section_number: sectionNumber,
              section_name: section?.sectionName || `Section ${sectionNumber}`,
              status: 'incomplete',
              assigned_to: userId,
            });

          if (error) throw error;
        }

        toast({
          title: 'Section assigned',
          description: 'User will be notified of the assignment',
        });

        await refreshProgress();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to assign section';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [formId, progress, refreshProgress, toast]
  );

  /**
   * Unassign section
   */
  const unassignSection = useCallback(
    async (sectionNumber: number): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('acord_form_sections')
          .update({ assigned_to: null })
          .eq('acord_form_id', formId)
          .eq('section_number', sectionNumber);

        if (error) throw error;

        await refreshProgress();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to unassign section';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [formId, refreshProgress, toast]
  );

  /**
   * Mark section as complete
   */
  const markSectionComplete = useCallback(
    async (sectionNumber: number): Promise<boolean> => {
      return updateSectionStatus(sectionNumber, 'complete');
    },
    [updateSectionStatus]
  );

  /**
   * Flag section for review
   */
  const flagSection = useCallback(
    async (sectionNumber: number, reason: string): Promise<boolean> => {
      return updateSectionStatus(sectionNumber, 'flagged', reason);
    },
    [updateSectionStatus]
  );

  // Load on mount
  useEffect(() => {
    refreshProgress();
  }, [refreshProgress]);

  return {
    progress,
    isLoading,
    error,
    refreshProgress,
    updateSectionStatus,
    assignSection,
    unassignSection,
    markSectionComplete,
    flagSection,
  };
}

export default useSectionTracking;
