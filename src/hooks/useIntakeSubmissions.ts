// ============================================
// useIntakeSubmissions Hook
// Manages intake submissions and ACORD form generation
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { IntakeSubmission, IntakeTemplate, IntakeAcordMapping } from '@/types/intake';
import type { AcordForm } from '@/types/acord';
import { processMultiFormMapping } from '@/lib/mapping/mappingProcessor';
import { generateAccessToken, hashAccessToken } from '@/types/intake';

// ============================================
// TYPES
// ============================================

export interface UseIntakeSubmissionsReturn {
  submissions: IntakeSubmission[];
  loading: boolean;
  error: string | null;
  fetchSubmissions: (templateId?: string, accountId?: string) => Promise<void>;
  fetchSubmissionById: (id: string) => Promise<IntakeSubmission | null>;
  createSubmission: (templateId: string, options?: CreateSubmissionOptions) => Promise<CreateSubmissionResult | null>;
  updateSubmission: (id: string, updates: Partial<IntakeSubmission>) => Promise<boolean>;
  processSubmission: (submissionId: string) => Promise<ProcessSubmissionResult | null>;
  generateIntakeLink: (submissionId: string) => Promise<string | null>;
  cancelSubmission: (submissionId: string) => Promise<boolean>;
  deleteSubmission: (submissionId: string) => Promise<boolean>;
}

export interface CreateSubmissionOptions {
  accountId?: string;
  clientEmail?: string;
  clientName?: string;
  expirationDays?: number;
  prefillResponses?: Record<string, any>;
}

export interface CreateSubmissionResult {
  submission: IntakeSubmission;
  accessToken: string;
  intakeUrl: string;
}

export interface ProcessSubmissionResult {
  success: boolean;
  acordForms: AcordForm[];
  errors: string[];
  warnings: string[];
}

// ============================================
// HOOK
// ============================================

export function useIntakeSubmissions(): UseIntakeSubmissionsReturn {
  const [submissions, setSubmissions] = useState<IntakeSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // ============================================
  // FETCH OPERATIONS
  // ============================================

  const fetchSubmissions = useCallback(
    async (templateId?: string, accountId?: string) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('intake_submissions')
          .select(`
            *,
            intake_templates (
              id,
              name,
              intake_type
            )
          `)
          .order('created_at', { ascending: false });

        if (templateId) {
          query = query.eq('template_id', templateId);
        }

        if (accountId) {
          query = query.eq('account_id', accountId);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setSubmissions(data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch submissions';
        setError(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const fetchSubmissionById = useCallback(
    async (id: string): Promise<IntakeSubmission | null> => {
      try {
        const { data, error: fetchError } = await supabase
          .from('intake_submissions')
          .select(`
            *,
            intake_templates (*)
          `)
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch submission';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      }
    },
    [toast]
  );

  // ============================================
  // CREATE SUBMISSION
  // ============================================

  const createSubmission = useCallback(
    async (
      templateId: string,
      options: CreateSubmissionOptions = {}
    ): Promise<CreateSubmissionResult | null> => {
      setLoading(true);

      try {
        // Generate access token
        const accessToken = generateAccessToken();
        const tokenHash = await hashAccessToken(accessToken);

        // Calculate expiration
        const expirationDays = options.expirationDays || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);

        // Create submission record
        const { data: submission, error: createError } = await supabase
          .from('intake_submissions')
          .insert({
            template_id: templateId,
            account_id: options.accountId || null,
            access_token_hash: tokenHash,
            token_expires_at: expiresAt.toISOString(),
            client_email: options.clientEmail || null,
            client_name: options.clientName || null,
            responses: options.prefillResponses || {},
            status: 'draft',
          })
          .select()
          .single();

        if (createError) throw createError;

        // Generate intake URL
        const baseUrl = window.location.origin;
        const intakeUrl = `${baseUrl}/intake?token=${accessToken}`;

        // Update local state
        setSubmissions(prev => [submission, ...prev]);

        toast({
          title: 'Intake created',
          description: 'A new intake link has been generated',
        });

        return {
          submission,
          accessToken,
          intakeUrl,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create submission';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  // ============================================
  // UPDATE SUBMISSION
  // ============================================

  const updateSubmission = useCallback(
    async (id: string, updates: Partial<IntakeSubmission>): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('intake_submissions')
          .update(updates)
          .eq('id', id);

        if (updateError) throw updateError;

        setSubmissions(prev =>
          prev.map(s => (s.id === id ? { ...s, ...updates } : s))
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update submission';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast]
  );

  // ============================================
  // PROCESS SUBMISSION → ACORD FORMS
  // ============================================

  const processSubmission = useCallback(
    async (submissionId: string): Promise<ProcessSubmissionResult | null> => {
      setLoading(true);

      try {
        // Fetch submission with template and mappings
        const { data: submission, error: subError } = await supabase
          .from('intake_submissions')
          .select(`
            *,
            intake_templates (
              id,
              name,
              questions
            )
          `)
          .eq('id', submissionId)
          .single();

        if (subError) throw subError;
        if (!submission.responses || Object.keys(submission.responses).length === 0) {
          throw new Error('No responses to process');
        }

        // Fetch mappings for this template
        const { data: mappings, error: mapError } = await supabase
          .from('intake_acord_mappings')
          .select('*')
          .eq('intake_template_id', submission.template_id);

        if (mapError) throw mapError;
        if (!mappings || mappings.length === 0) {
          throw new Error('No mappings configured for this template');
        }

        // Get unique form numbers from mappings
        const formNumbers = [...new Set(mappings.map(m => m.acord_form_number))];

        // Process mappings
        const mappingResult = processMultiFormMapping(
          submission.responses,
          mappings,
          formNumbers,
          {
            submissionId: submission.id,
            accountId: submission.account_id,
          }
        );

        const acordForms: AcordForm[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        // Create ACORD form records for each form number
        for (const formNumber of formNumbers) {
          const formResult = mappingResult.forms[formNumber];
          if (!formResult) continue;

          // Collect errors and warnings
          errors.push(...formResult.errors.map(e => `${formNumber}: ${e.message}`));
          warnings.push(...formResult.warnings);

          // Get the template for this form
          const { data: template, error: tplError } = await supabase
            .from('acord_templates')
            .select('id')
            .eq('form_number', formNumber)
            .eq('is_current', true)
            .single();

          if (tplError || !template) {
            errors.push(`Template not found for ACORD ${formNumber}`);
            continue;
          }

          // Create ACORD form record
          const { data: acordForm, error: formError } = await supabase
            .from('acord_forms')
            .insert({
              account_id: submission.account_id,
              template_id: template.id,
              intake_submission_id: submissionId,
              field_values: formResult.fieldValues,
              submission_status: 'draft',
              signature_status: 'unsigned',
              created_by: user?.id,
            })
            .select()
            .single();

          if (formError) {
            errors.push(`Failed to create ACORD ${formNumber}: ${formError.message}`);
            continue;
          }

          acordForms.push(acordForm);
        }

        // Update submission status
        await supabase
          .from('intake_submissions')
          .update({ status: 'processed' })
          .eq('id', submissionId);

        setSubmissions(prev =>
          prev.map(s => (s.id === submissionId ? { ...s, status: 'processed' } : s))
        );

        const success = acordForms.length > 0 && errors.length === 0;

        toast({
          title: success ? 'Submission processed' : 'Processed with errors',
          description: `Created ${acordForms.length} ACORD form${acordForms.length !== 1 ? 's' : ''}${
            errors.length > 0 ? ` with ${errors.length} error${errors.length !== 1 ? 's' : ''}` : ''
          }`,
          variant: success ? 'default' : 'destructive',
        });

        return {
          success,
          acordForms,
          errors,
          warnings,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process submission';
        toast({
          title: 'Processing failed',
          description: message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  // ============================================
  // GENERATE NEW INTAKE LINK
  // ============================================

  const generateIntakeLink = useCallback(
    async (submissionId: string): Promise<string | null> => {
      try {
        // Generate new token
        const accessToken = generateAccessToken();
        const tokenHash = await hashAccessToken(accessToken);

        // Update expiration (30 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const { error: updateError } = await supabase
          .from('intake_submissions')
          .update({
            access_token_hash: tokenHash,
            token_expires_at: expiresAt.toISOString(),
          })
          .eq('id', submissionId);

        if (updateError) throw updateError;

        const baseUrl = window.location.origin;
        const intakeUrl = `${baseUrl}/intake?token=${accessToken}`;

        toast({
          title: 'New link generated',
          description: 'The intake link has been refreshed',
        });

        return intakeUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate link';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      }
    },
    [toast]
  );

  // ============================================
  // CANCEL / DELETE
  // ============================================

  const cancelSubmission = useCallback(
    async (submissionId: string): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('intake_submissions')
          .update({ status: 'cancelled' })
          .eq('id', submissionId);

        if (updateError) throw updateError;

        setSubmissions(prev =>
          prev.map(s => (s.id === submissionId ? { ...s, status: 'cancelled' } : s))
        );

        toast({
          title: 'Submission cancelled',
          description: 'The intake link has been invalidated',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel submission';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast]
  );

  const deleteSubmission = useCallback(
    async (submissionId: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase
          .from('intake_submissions')
          .delete()
          .eq('id', submissionId);

        if (deleteError) throw deleteError;

        setSubmissions(prev => prev.filter(s => s.id !== submissionId));

        toast({
          title: 'Submission deleted',
          description: 'The submission has been permanently removed',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete submission';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast]
  );

  return {
    submissions,
    loading,
    error,
    fetchSubmissions,
    fetchSubmissionById,
    createSubmission,
    updateSubmission,
    processSubmission,
    generateIntakeLink,
    cancelSubmission,
    deleteSubmission,
  };
}

export default useIntakeSubmissions;
