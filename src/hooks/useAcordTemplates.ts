// ============================================
// useAcordTemplates Hook
// Manages ACORD form templates CRUD operations
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import type { AcordTemplate, FieldInventoryItem, FieldSchemaItem, SectionDefinition } from '@/types/acord';
import { ingestAcordTemplate, validatePdfForAcord, IngestionOptions } from '@/lib/acord/templateIngestion';

// ============================================
// TYPES
// ============================================

export interface UseAcordTemplatesReturn {
  templates: AcordTemplate[];
  currentTemplates: AcordTemplate[];
  loading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  fetchTemplateById: (id: string) => Promise<AcordTemplate | null>;
  fetchTemplateByFormNumber: (formNumber: string, version?: string) => Promise<AcordTemplate | null>;
  uploadTemplate: (file: File, options: IngestionOptions) => Promise<AcordTemplate | null>;
  updateTemplate: (id: string, updates: Partial<AcordTemplate>) => Promise<AcordTemplate | null>;
  setCurrentVersion: (id: string) => Promise<boolean>;
  archiveTemplate: (id: string) => Promise<boolean>;
  deleteTemplate: (id: string) => Promise<boolean>;
  validatePdf: (file: File) => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
}

// ============================================
// HOOK
// ============================================

export function useAcordTemplates(): UseAcordTemplatesReturn {
  const [templates, setTemplates] = useState<AcordTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Computed: Only current templates
  const currentTemplates = templates.filter(t => t.is_current);

  // ============================================
  // FETCH OPERATIONS
  // ============================================

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('acord_templates')
        .select('*')
        .order('form_number')
        .order('version', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform JSONB fields
      const transformed = (data || []).map(transformTemplate);
      setTemplates(transformed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch templates';
      setError(message);
      toast({
        title: 'Error fetching templates',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchTemplateById = useCallback(async (id: string): Promise<AcordTemplate | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('acord_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      return data ? transformTemplate(data) : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch template';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const fetchTemplateByFormNumber = useCallback(
    async (formNumber: string, version?: string): Promise<AcordTemplate | null> => {
      try {
        let query = supabase
          .from('acord_templates')
          .select('*')
          .eq('form_number', formNumber);

        if (version) {
          query = query.eq('version', version);
        } else {
          query = query.eq('is_current', true);
        }

        const { data, error: fetchError } = await query.single();

        if (fetchError) throw fetchError;
        return data ? transformTemplate(data) : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch template';
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
  // UPLOAD & CREATE
  // ============================================

  const uploadTemplate = useCallback(
    async (file: File, options: IngestionOptions): Promise<AcordTemplate | null> => {
      setLoading(true);
      setError(null);

      try {
        // Read file bytes
        const arrayBuffer = await file.arrayBuffer();
        const pdfBytes = new Uint8Array(arrayBuffer);

        // Validate PDF first
        const validation = await validatePdfForAcord(pdfBytes);
        if (!validation.valid) {
          throw new Error(validation.errors.join(', '));
        }

        // Ingest the template
        const result = await ingestAcordTemplate(pdfBytes, options);
        if (!result.success || !result.template) {
          throw new Error(result.errors.join(', '));
        }

        // Upload PDF to storage. Store the sanitized (XFA-stripped) bytes when
        // available so the persisted template is a clean AcroForm-only copy.
        const fileName = `acord-templates/${options.formNumber}/${options.version}/${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, result.sanitizedBytes ?? pdfBytes, {
            contentType: 'application/pdf',
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);

        // Before inserting, check if there's an existing current version
        // and mark it as not current
        const { error: updateError } = await supabase
          .from('acord_templates')
          .update({ is_current: false })
          .eq('form_number', options.formNumber)
          .eq('is_current', true);

        if (updateError) {
          logger.warn('Failed to update existing current template:', updateError);
        }

        // Insert template record
        const templateData = {
          form_number: result.template.form_number,
          form_name: result.template.form_name,
          version: result.template.version,
          is_current: true,
          pdf_type: result.template.pdf_type,
          pdf_template_url: urlData.publicUrl,
          field_inventory: result.template.field_inventory,
          field_schema: result.template.field_schema,
          section_definitions: result.template.section_definitions,
          validation_rules: result.template.validation_rules || [],
          signature_anchors: result.template.signature_anchors || [],
          repeater_configs: result.template.repeater_configs || [],
          template_source: result.template.template_source,
          license_notes: result.template.license_notes,
        };

        const { data: insertData, error: insertError } = await supabase
          .from('acord_templates')
          .insert(templateData)
          .select()
          .single();

        if (insertError) throw insertError;

        const newTemplate = transformTemplate(insertData);

        // Update local state
        setTemplates(prev => [newTemplate, ...prev.filter(t => t.id !== newTemplate.id)]);

        // Show warnings if any
        if (result.warnings.length > 0) {
          toast({
            title: 'Template uploaded with warnings',
            description: result.warnings.join('; '),
            variant: 'default',
          });
        } else {
          toast({
            title: 'Template uploaded successfully',
            description: `ACORD ${options.formNumber} v${options.version} - ${result.fieldInventory.length} fields detected`,
          });
        }

        return newTemplate;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload template';
        setError(message);
        toast({
          title: 'Upload failed',
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
  // UPDATE OPERATIONS
  // ============================================

  const updateTemplate = useCallback(
    async (id: string, updates: Partial<AcordTemplate>): Promise<AcordTemplate | null> => {
      setLoading(true);

      try {
        const { data, error: updateError } = await supabase
          .from('acord_templates')
          .update({
            form_name: updates.form_name,
            validation_rules: updates.validation_rules,
            signature_anchors: updates.signature_anchors,
            repeater_configs: updates.repeater_configs,
            license_notes: updates.license_notes,
          })
          .eq('id', id)
          .select()
          .single();

        if (updateError) throw updateError;

        const updated = transformTemplate(data);
        setTemplates(prev => prev.map(t => (t.id === id ? updated : t)));

        toast({
          title: 'Template updated',
          description: `ACORD ${updated.form_number} has been updated`,
        });

        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update template';
        toast({
          title: 'Update failed',
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

  const setCurrentVersion = useCallback(
    async (id: string): Promise<boolean> => {
      setLoading(true);

      try {
        // Get the template to know its form_number
        const template = templates.find(t => t.id === id);
        if (!template) throw new Error('Template not found');

        // Unset current for all versions of this form
        const { error: unsetError } = await supabase
          .from('acord_templates')
          .update({ is_current: false })
          .eq('form_number', template.form_number);

        if (unsetError) throw unsetError;

        // Set this version as current
        const { error: setError } = await supabase
          .from('acord_templates')
          .update({ is_current: true })
          .eq('id', id);

        if (setError) throw setError;

        // Update local state
        setTemplates(prev =>
          prev.map(t => ({
            ...t,
            is_current: t.id === id ? true : t.form_number === template.form_number ? false : t.is_current,
          }))
        );

        toast({
          title: 'Version set as current',
          description: `ACORD ${template.form_number} v${template.version} is now the current version`,
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to set current version';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [templates, toast]
  );

  const archiveTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: archiveError } = await supabase
          .from('acord_templates')
          .update({ is_current: false })
          .eq('id', id);

        if (archiveError) throw archiveError;

        setTemplates(prev => prev.map(t => (t.id === id ? { ...t, is_current: false } : t)));

        toast({
          title: 'Template archived',
          description: 'Template has been archived',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to archive template';
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

  const deleteTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase.from('acord_templates').delete().eq('id', id);

        if (deleteError) throw deleteError;

        setTemplates(prev => prev.filter(t => t.id !== id));

        toast({
          title: 'Template deleted',
          description: 'Template has been permanently deleted',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete template';
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
  // VALIDATION
  // ============================================

  const validatePdf = useCallback(async (file: File): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);
      const result = await validatePdfForAcord(pdfBytes);
      return { valid: result.valid, errors: result.errors, warnings: result.warnings ?? [] };
    } catch (err) {
      return {
        valid: false,
        errors: [err instanceof Error ? err.message : 'Failed to validate PDF'],
        warnings: [],
      };
    }
  }, []);

  // ============================================
  // INITIAL LOAD
  // ============================================

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    currentTemplates,
    loading,
    error,
    fetchTemplates,
    fetchTemplateById,
    fetchTemplateByFormNumber,
    uploadTemplate,
    updateTemplate,
    setCurrentVersion,
    archiveTemplate,
    deleteTemplate,
    validatePdf,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformTemplate(data: any): AcordTemplate {
  return {
    id: data.id,
    form_number: data.form_number,
    form_name: data.form_name,
    version: data.version,
    is_current: data.is_current,
    effective_date: data.effective_date,
    sunset_date: data.sunset_date,
    pdf_type: data.pdf_type,
    pdf_template_url: data.pdf_template_url,
    field_inventory: (data.field_inventory as FieldInventoryItem[]) || [],
    field_schema: (data.field_schema as FieldSchemaItem[]) || [],
    section_definitions: (data.section_definitions as SectionDefinition[]) || [],
    validation_rules: data.validation_rules || [],
    signature_anchors: data.signature_anchors || [],
    repeater_configs: data.repeater_configs || [],
    template_source: data.template_source,
    license_notes: data.license_notes,
    uploaded_by: data.uploaded_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
