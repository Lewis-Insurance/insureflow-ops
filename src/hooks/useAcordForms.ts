// ============================================
// useAcordForms Hook
// Manages ACORD form instances CRUD and PDF generation
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  AcordForm,
  AcordFormSection,
  AcordFieldAudit,
  ValidationResult,
  ValidationError,
  SignatureStatus,
  SubmissionStatus,
} from '@/types/acord';
import { fillAcordPdf, extractFieldValues } from '@/lib/acord/pdfFiller';

// ============================================
// TYPES
// ============================================

export interface UseAcordFormsReturn {
  forms: AcordForm[];
  loading: boolean;
  generating: boolean;
  error: string | null;
  fetchForms: (accountId?: string) => Promise<void>;
  fetchFormById: (id: string) => Promise<AcordForm | null>;
  createForm: (templateId: string, accountId: string, fieldValues?: Record<string, any>) => Promise<AcordForm | null>;
  updateFieldValues: (formId: string, fieldValues: Record<string, any>, source?: string) => Promise<boolean>;
  generatePdf: (formId: string, flatten?: boolean) => Promise<string | null>;
  cloneForm: (formId: string, targetAccountId?: string) => Promise<AcordForm | null>;
  validateForm: (formId: string) => Promise<ValidationResult>;
  updateSignatureStatus: (formId: string, status: SignatureStatus, requestId?: string) => Promise<boolean>;
  updateSubmissionStatus: (formId: string, status: SubmissionStatus, carrier?: string) => Promise<boolean>;
  deleteForm: (formId: string) => Promise<boolean>;
  getFormSections: (formId: string) => Promise<AcordFormSection[]>;
  updateSectionStatus: (sectionId: string, status: string, notes?: string) => Promise<boolean>;
  getAuditHistory: (formId: string) => Promise<AcordFieldAudit[]>;
}

// ============================================
// HOOK
// ============================================

export function useAcordForms(): UseAcordFormsReturn {
  const [forms, setForms] = useState<AcordForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // ============================================
  // FETCH OPERATIONS
  // ============================================

  const fetchForms = useCallback(async (accountId?: string) => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('acord_forms')
        .select(`
          *,
          acord_templates (
            form_number,
            form_name,
            version
          )
        `)
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const transformed = (data || []).map(transformForm);
      setForms(transformed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch forms';
      setError(message);
      toast({
        title: 'Error fetching forms',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchFormById = useCallback(async (id: string): Promise<AcordForm | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('acord_forms')
        .select(`
          *,
          acord_templates (
            form_number,
            form_name,
            version,
            field_schema,
            validation_rules
          )
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      return data ? transformForm(data) : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch form';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  // ============================================
  // CREATE & UPDATE
  // ============================================

  const createForm = useCallback(
    async (templateId: string, accountId: string, fieldValues?: Record<string, any>): Promise<AcordForm | null> => {
      setLoading(true);

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error: insertError } = await supabase
          .from('acord_forms')
          .insert({
            template_id: templateId,
            account_id: accountId,
            field_values: fieldValues || {},
            created_by: user.id,
            submission_status: 'draft',
            signature_status: 'unsigned',
          })
          .select(`
            *,
            acord_templates (
              form_number,
              form_name,
              version,
              section_definitions
            )
          `)
          .single();

        if (insertError) throw insertError;

        // Create section tracking records if template has sections
        const template = data.acord_templates;
        if (template?.section_definitions?.length > 0) {
          const sectionInserts = template.section_definitions.map((section: any) => ({
            acord_form_id: data.id,
            section_number: section.sectionNumber,
            section_name: section.sectionName,
            status: 'incomplete',
          }));

          await supabase.from('acord_form_sections').insert(sectionInserts);
        }

        const newForm = transformForm(data);
        setForms(prev => [newForm, ...prev]);

        toast({
          title: 'Form created',
          description: `ACORD ${template?.form_number || ''} form created`,
        });

        return newForm;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create form';
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

  const updateFieldValues = useCallback(
    async (formId: string, fieldValues: Record<string, any>, source: string = 'manual'): Promise<boolean> => {
      try {
        // Get current user and existing form
        const { data: { user } } = await supabase.auth.getUser();
        const existingForm = forms.find(f => f.id === formId);

        // Get existing field values
        const { data: currentData } = await supabase
          .from('acord_forms')
          .select('field_values, row_version')
          .eq('id', formId)
          .single();

        if (!currentData) throw new Error('Form not found');

        const existingValues = currentData.field_values || {};
        const newRowVersion = (currentData.row_version || 0) + 1;

        // Merge field values
        const mergedValues = { ...existingValues, ...fieldValues };

        // Update form
        const { error: updateError } = await supabase
          .from('acord_forms')
          .update({
            field_values: mergedValues,
            row_version: newRowVersion,
          })
          .eq('id', formId)
          .eq('row_version', currentData.row_version); // Optimistic locking

        if (updateError) throw updateError;

        // Create audit records for changed fields
        const auditRecords = Object.entries(fieldValues)
          .filter(([key, value]) => existingValues[key] !== value)
          .map(([fieldName, newValue]) => ({
            acord_form_id: formId,
            field_name: fieldName,
            old_value: existingValues[fieldName]?.toString() || null,
            new_value: newValue?.toString() || null,
            changed_by: user?.id,
            change_source: source,
          }));

        if (auditRecords.length > 0) {
          await supabase.from('acord_field_audit').insert(auditRecords);
        }

        // Update local state
        setForms(prev =>
          prev.map(f =>
            f.id === formId
              ? { ...f, field_values: mergedValues, row_version: newRowVersion }
              : f
          )
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update form';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [forms, toast]
  );

  // ============================================
  // PDF GENERATION
  // ============================================

  const generatePdf = useCallback(
    async (formId: string, flatten: boolean = true): Promise<string | null> => {
      setGenerating(true);

      try {
        // Fetch form with template
        const { data: form, error: formError } = await supabase
          .from('acord_forms')
          .select(`
            *,
            acord_templates (
              pdf_template_url,
              form_number,
              form_name
            )
          `)
          .eq('id', formId)
          .single();

        if (formError) throw formError;
        if (!form.acord_templates?.pdf_template_url) {
          throw new Error('Template PDF not found');
        }

        // Fetch the template PDF
        const templateResponse = await fetch(form.acord_templates.pdf_template_url);
        if (!templateResponse.ok) {
          throw new Error('Failed to fetch template PDF');
        }
        const templateBytes = new Uint8Array(await templateResponse.arrayBuffer());

        // Fill the PDF
        const result = await fillAcordPdf(templateBytes, {
          fieldValues: form.field_values,
          flatten,
          updateAppearances: true,
        });

        if (!result.success || !result.pdfBytes) {
          throw new Error(result.errors.join(', '));
        }

        // Upload generated PDF
        const fileName = `acord-forms/${form.account_id}/${formId}/${form.acord_templates.form_number}_${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, result.pdfBytes, {
            contentType: 'application/pdf',
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);

        // Update form record
        const { error: updateError } = await supabase
          .from('acord_forms')
          .update({
            pdf_url: urlData.publicUrl,
            pdf_generated_at: new Date().toISOString(),
          })
          .eq('id', formId);

        if (updateError) throw updateError;

        // Update local state
        setForms(prev =>
          prev.map(f =>
            f.id === formId
              ? { ...f, pdf_url: urlData.publicUrl, pdf_generated_at: new Date().toISOString() }
              : f
          )
        );

        toast({
          title: 'PDF generated',
          description: `ACORD ${form.acord_templates.form_number} PDF is ready`,
        });

        return urlData.publicUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate PDF';
        toast({
          title: 'PDF generation failed',
          description: message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [toast]
  );

  // ============================================
  // CLONE
  // ============================================

  const cloneForm = useCallback(
    async (formId: string, targetAccountId?: string): Promise<AcordForm | null> => {
      setLoading(true);

      try {
        // Get source form
        const sourceForm = await fetchFormById(formId);
        if (!sourceForm) throw new Error('Source form not found');

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Create clone
        const { data, error: insertError } = await supabase
          .from('acord_forms')
          .insert({
            template_id: sourceForm.template_id,
            account_id: targetAccountId || sourceForm.account_id,
            field_values: sourceForm.field_values,
            cloned_from: formId,
            created_by: user.id,
            submission_status: 'draft',
            signature_status: 'unsigned',
          })
          .select(`
            *,
            acord_templates (
              form_number,
              form_name,
              version
            )
          `)
          .single();

        if (insertError) throw insertError;

        const newForm = transformForm(data);
        setForms(prev => [newForm, ...prev]);

        // Create audit record
        await supabase.from('acord_field_audit').insert({
          acord_form_id: newForm.id,
          field_name: '_clone',
          old_value: null,
          new_value: formId,
          changed_by: user.id,
          change_source: 'clone',
        });

        toast({
          title: 'Form cloned',
          description: 'A copy of the form has been created',
        });

        return newForm;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to clone form';
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
    [fetchFormById, toast]
  );

  // ============================================
  // VALIDATION
  // ============================================

  const validateForm = useCallback(async (formId: string): Promise<ValidationResult> => {
    try {
      const { data: form, error: formError } = await supabase
        .from('acord_forms')
        .select(`
          field_values,
          acord_templates (
            field_schema,
            validation_rules
          )
        `)
        .eq('id', formId)
        .single();

      if (formError) throw formError;

      const fieldSchema = form.acord_templates?.field_schema || [];
      const validationRules = form.acord_templates?.validation_rules || [];
      const fieldValues = form.field_values || {};

      const errors: ValidationError[] = [];
      const warnings: ValidationError[] = [];
      let totalFields = 0;
      let completedFields = 0;

      // Check required fields from schema
      for (const field of fieldSchema) {
        totalFields++;
        const value = fieldValues[field.name];

        if (value !== null && value !== undefined && value !== '') {
          completedFields++;
        } else if (field.required) {
          errors.push({
            field: field.name,
            message: `${field.label || field.name} is required`,
          });
        }

        // Check validation patterns
        if (field.validation?.pattern && value) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(String(value))) {
            errors.push({
              field: field.name,
              message: `${field.label || field.name} has invalid format`,
            });
          }
        }
      }

      // Check custom validation rules
      for (const rule of validationRules) {
        const value = fieldValues[rule.field];

        if (rule.type === 'required' && (value === null || value === undefined || value === '')) {
          const item = { field: rule.field, message: rule.message, rule };
          if (rule.severity === 'warning') {
            warnings.push(item);
          } else {
            errors.push(item);
          }
        }

        if (rule.type === 'conditional_required' && rule.condition) {
          const dependsOnValue = fieldValues[rule.condition.dependsOn];
          let conditionMet = false;

          switch (rule.condition.operator) {
            case 'equals':
              conditionMet = dependsOnValue === rule.condition.value;
              break;
            case 'not_equals':
              conditionMet = dependsOnValue !== rule.condition.value;
              break;
            case 'checked':
              conditionMet = dependsOnValue === true;
              break;
            case 'unchecked':
              conditionMet = dependsOnValue === false;
              break;
          }

          if (conditionMet && (value === null || value === undefined || value === '')) {
            const item = { field: rule.field, message: rule.message, rule };
            if (rule.severity === 'warning') {
              warnings.push(item);
            } else {
              errors.push(item);
            }
          }
        }
      }

      const completionPercentage = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        completionPercentage,
      };
    } catch (err) {
      return {
        valid: false,
        errors: [{ field: '_general', message: 'Validation failed' }],
        warnings: [],
        completionPercentage: 0,
      };
    }
  }, []);

  // ============================================
  // STATUS UPDATES
  // ============================================

  const updateSignatureStatus = useCallback(
    async (formId: string, status: SignatureStatus, requestId?: string): Promise<boolean> => {
      try {
        const updates: any = { signature_status: status };
        if (requestId) updates.signature_request_id = requestId;
        if (status === 'signed') updates.signed_at = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('acord_forms')
          .update(updates)
          .eq('id', formId);

        if (updateError) throw updateError;

        setForms(prev =>
          prev.map(f => (f.id === formId ? { ...f, ...updates } : f))
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update signature status';
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

  const updateSubmissionStatus = useCallback(
    async (formId: string, status: SubmissionStatus, carrier?: string): Promise<boolean> => {
      try {
        const updates: any = { submission_status: status };
        if (carrier) updates.submitted_to_carrier = carrier;
        if (status === 'submitted') updates.submitted_at = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('acord_forms')
          .update(updates)
          .eq('id', formId);

        if (updateError) throw updateError;

        setForms(prev =>
          prev.map(f => (f.id === formId ? { ...f, ...updates } : f))
        );

        toast({
          title: 'Status updated',
          description: `Form status changed to ${status}`,
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update submission status';
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
  // DELETE
  // ============================================

  const deleteForm = useCallback(
    async (formId: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase.from('acord_forms').delete().eq('id', formId);

        if (deleteError) throw deleteError;

        setForms(prev => prev.filter(f => f.id !== formId));

        toast({
          title: 'Form deleted',
          description: 'Form has been permanently deleted',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete form';
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
  // SECTIONS
  // ============================================

  const getFormSections = useCallback(async (formId: string): Promise<AcordFormSection[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('acord_form_sections')
        .select('*')
        .eq('acord_form_id', formId)
        .order('section_number');

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      return [];
    }
  }, []);

  const updateSectionStatus = useCallback(
    async (sectionId: string, status: string, notes?: string): Promise<boolean> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        const updates: any = { status };
        if (notes !== undefined) updates.notes = notes;
        if (status === 'complete') {
          updates.completed_by = user?.id;
          updates.completed_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
          .from('acord_form_sections')
          .update(updates)
          .eq('id', sectionId);

        if (updateError) throw updateError;
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update section';
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
  // AUDIT
  // ============================================

  const getAuditHistory = useCallback(async (formId: string): Promise<AcordFieldAudit[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('acord_field_audit')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('acord_form_id', formId)
        .order('changed_at', { ascending: false });

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      return [];
    }
  }, []);

  return {
    forms,
    loading,
    generating,
    error,
    fetchForms,
    fetchFormById,
    createForm,
    updateFieldValues,
    generatePdf,
    cloneForm,
    validateForm,
    updateSignatureStatus,
    updateSubmissionStatus,
    deleteForm,
    getFormSections,
    updateSectionStatus,
    getAuditHistory,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformForm(data: any): AcordForm {
  return {
    id: data.id,
    account_id: data.account_id,
    template_id: data.template_id,
    intake_submission_id: data.intake_submission_id,
    field_values: data.field_values || {},
    pdf_url: data.pdf_url,
    pdf_generated_at: data.pdf_generated_at,
    has_addendum: data.has_addendum || false,
    addendum_url: data.addendum_url,
    cloned_from: data.cloned_from,
    signature_status: data.signature_status || 'unsigned',
    signature_request_id: data.signature_request_id,
    signed_pdf_url: data.signed_pdf_url,
    signed_at: data.signed_at,
    submission_status: data.submission_status || 'draft',
    submitted_to_carrier: data.submitted_to_carrier,
    submitted_at: data.submitted_at,
    created_by: data.created_by,
    row_version: data.row_version || 1,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
