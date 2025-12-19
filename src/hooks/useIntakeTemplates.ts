// ============================================
// useIntakeTemplates Hook
// Manages intake template CRUD operations
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  IntakeTemplate,
  IntakeQuestion,
  IntakeSettings,
  IntakeBranding,
  IntakeType,
  IntakeAcordMapping
} from '@/types/intake';

// ============================================
// TYPES
// ============================================

export interface UseIntakeTemplatesReturn {
  templates: IntakeTemplate[];
  loading: boolean;
  error: string | null;
  fetchTemplates: (options?: FetchTemplatesOptions) => Promise<void>;
  fetchTemplateById: (id: string) => Promise<IntakeTemplate | null>;
  createTemplate: (template: CreateTemplateInput) => Promise<IntakeTemplate | null>;
  updateTemplate: (id: string, updates: UpdateTemplateInput) => Promise<boolean>;
  duplicateTemplate: (id: string, newName?: string) => Promise<IntakeTemplate | null>;
  deleteTemplate: (id: string) => Promise<boolean>;
  archiveTemplate: (id: string) => Promise<boolean>;
  publishTemplate: (id: string) => Promise<boolean>;
  unpublishTemplate: (id: string) => Promise<boolean>;
  addQuestion: (templateId: string, question: Omit<IntakeQuestion, 'id' | 'order'>) => Promise<IntakeQuestion | null>;
  updateQuestion: (templateId: string, questionId: string, updates: Partial<IntakeQuestion>) => Promise<boolean>;
  deleteQuestion: (templateId: string, questionId: string) => Promise<boolean>;
  reorderQuestions: (templateId: string, questionIds: string[]) => Promise<boolean>;
  fetchMappings: (templateId: string) => Promise<IntakeAcordMapping[]>;
  createMapping: (mapping: Omit<IntakeAcordMapping, 'id' | 'created_at'>) => Promise<IntakeAcordMapping | null>;
  updateMapping: (mappingId: string, updates: Partial<IntakeAcordMapping>) => Promise<boolean>;
  deleteMapping: (mappingId: string) => Promise<boolean>;
}

export interface FetchTemplatesOptions {
  includeArchived?: boolean;
  intakeType?: IntakeType;
  publishedOnly?: boolean;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  intake_type: IntakeType;
  questions?: IntakeQuestion[];
  settings?: Partial<IntakeSettings>;
  branding?: Partial<IntakeBranding>;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  intake_type?: IntakeType;
  questions?: IntakeQuestion[];
  dynamic_sections?: Record<string, string[]>;
  settings?: Partial<IntakeSettings>;
  branding?: Partial<IntakeBranding>;
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_SETTINGS: IntakeSettings = {
  allowSaveDraft: true,
  showProgressBar: true,
  requireEmail: true,
  sendConfirmationEmail: true,
  notifyOnSubmission: [],
  expirationDays: 30,
  rateLimit: {
    maxRequests: 10,
    windowHours: 1,
  },
};

const DEFAULT_BRANDING: IntakeBranding = {
  primaryColor: '#3B82F6',
  secondaryColor: '#1E40AF',
};

// ============================================
// HOOK
// ============================================

export function useIntakeTemplates(): UseIntakeTemplatesReturn {
  const [templates, setTemplates] = useState<IntakeTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // ============================================
  // FETCH OPERATIONS
  // ============================================

  const fetchTemplates = useCallback(
    async (options: FetchTemplatesOptions = {}) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('intake_templates')
          .select('*')
          .order('updated_at', { ascending: false });

        if (!options.includeArchived) {
          query = query.eq('is_archived', false);
        }

        if (options.intakeType) {
          query = query.eq('intake_type', options.intakeType);
        }

        if (options.publishedOnly) {
          query = query.eq('is_published', true);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setTemplates(data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch templates';
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

  const fetchTemplateById = useCallback(
    async (id: string): Promise<IntakeTemplate | null> => {
      try {
        const { data, error: fetchError } = await supabase
          .from('intake_templates')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        return data;
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
  // CREATE / UPDATE / DELETE
  // ============================================

  const createTemplate = useCallback(
    async (input: CreateTemplateInput): Promise<IntakeTemplate | null> => {
      setLoading(true);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error: createError } = await supabase
          .from('intake_templates')
          .insert({
            name: input.name,
            description: input.description || '',
            intake_type: input.intake_type,
            questions: input.questions || [],
            dynamic_sections: {},
            settings: { ...DEFAULT_SETTINGS, ...input.settings },
            branding: { ...DEFAULT_BRANDING, ...input.branding },
            is_published: false,
            is_archived: false,
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) throw createError;

        setTemplates(prev => [data, ...prev]);
        toast({
          title: 'Template created',
          description: `"${input.name}" has been created`,
        });

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create template';
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

  const updateTemplate = useCallback(
    async (id: string, updates: UpdateTemplateInput): Promise<boolean> => {
      try {
        const updateData: any = { ...updates, updated_at: new Date().toISOString() };

        // Merge settings/branding if partial updates
        if (updates.settings) {
          const template = templates.find(t => t.id === id);
          updateData.settings = { ...template?.settings, ...updates.settings };
        }
        if (updates.branding) {
          const template = templates.find(t => t.id === id);
          updateData.branding = { ...template?.branding, ...updates.branding };
        }

        const { error: updateError } = await supabase
          .from('intake_templates')
          .update(updateData)
          .eq('id', id);

        if (updateError) throw updateError;

        setTemplates(prev =>
          prev.map(t => (t.id === id ? { ...t, ...updateData } : t))
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update template';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [templates, toast]
  );

  const duplicateTemplate = useCallback(
    async (id: string, newName?: string): Promise<IntakeTemplate | null> => {
      setLoading(true);

      try {
        const original = await fetchTemplateById(id);
        if (!original) throw new Error('Template not found');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error: createError } = await supabase
          .from('intake_templates')
          .insert({
            name: newName || `${original.name} (Copy)`,
            description: original.description,
            intake_type: original.intake_type,
            questions: original.questions,
            dynamic_sections: original.dynamic_sections,
            settings: original.settings,
            branding: original.branding,
            is_published: false,
            is_archived: false,
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) throw createError;

        setTemplates(prev => [data, ...prev]);
        toast({
          title: 'Template duplicated',
          description: `"${data.name}" has been created`,
        });

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to duplicate template';
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
    [fetchTemplateById, toast]
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase
          .from('intake_templates')
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;

        setTemplates(prev => prev.filter(t => t.id !== id));
        toast({
          title: 'Template deleted',
          description: 'The template has been permanently removed',
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

  const archiveTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      const success = await updateTemplate(id, {} as UpdateTemplateInput);
      if (success) {
        // Update is_archived separately
        const { error } = await supabase
          .from('intake_templates')
          .update({ is_archived: true, is_published: false })
          .eq('id', id);

        if (!error) {
          setTemplates(prev =>
            prev.map(t => (t.id === id ? { ...t, is_archived: true, is_published: false } : t))
          );
          toast({
            title: 'Template archived',
            description: 'The template has been archived',
          });
          return true;
        }
      }
      return false;
    },
    [updateTemplate, toast]
  );

  const publishTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('intake_templates')
          .update({ is_published: true })
          .eq('id', id);

        if (error) throw error;

        setTemplates(prev =>
          prev.map(t => (t.id === id ? { ...t, is_published: true } : t))
        );
        toast({
          title: 'Template published',
          description: 'The template is now available for use',
        });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to publish template';
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

  const unpublishTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('intake_templates')
          .update({ is_published: false })
          .eq('id', id);

        if (error) throw error;

        setTemplates(prev =>
          prev.map(t => (t.id === id ? { ...t, is_published: false } : t))
        );
        toast({
          title: 'Template unpublished',
          description: 'The template is no longer available for use',
        });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to unpublish template';
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
  // QUESTION OPERATIONS
  // ============================================

  const addQuestion = useCallback(
    async (
      templateId: string,
      question: Omit<IntakeQuestion, 'id' | 'order'>
    ): Promise<IntakeQuestion | null> => {
      try {
        const template = templates.find(t => t.id === templateId);
        if (!template) throw new Error('Template not found');

        const newQuestion: IntakeQuestion = {
          ...question,
          id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          order: template.questions.length,
        };

        const updatedQuestions = [...template.questions, newQuestion];
        const success = await updateTemplate(templateId, { questions: updatedQuestions });

        return success ? newQuestion : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add question';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      }
    },
    [templates, updateTemplate, toast]
  );

  const updateQuestion = useCallback(
    async (
      templateId: string,
      questionId: string,
      updates: Partial<IntakeQuestion>
    ): Promise<boolean> => {
      try {
        const template = templates.find(t => t.id === templateId);
        if (!template) throw new Error('Template not found');

        const updatedQuestions = template.questions.map(q =>
          q.id === questionId ? { ...q, ...updates } : q
        );

        return await updateTemplate(templateId, { questions: updatedQuestions });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update question';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [templates, updateTemplate, toast]
  );

  const deleteQuestion = useCallback(
    async (templateId: string, questionId: string): Promise<boolean> => {
      try {
        const template = templates.find(t => t.id === templateId);
        if (!template) throw new Error('Template not found');

        const updatedQuestions = template.questions
          .filter(q => q.id !== questionId)
          .map((q, index) => ({ ...q, order: index }));

        return await updateTemplate(templateId, { questions: updatedQuestions });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete question';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [templates, updateTemplate, toast]
  );

  const reorderQuestions = useCallback(
    async (templateId: string, questionIds: string[]): Promise<boolean> => {
      try {
        const template = templates.find(t => t.id === templateId);
        if (!template) throw new Error('Template not found');

        const questionMap = new Map(template.questions.map(q => [q.id, q]));
        const updatedQuestions = questionIds
          .map((id, index) => {
            const question = questionMap.get(id);
            return question ? { ...question, order: index } : null;
          })
          .filter((q): q is IntakeQuestion => q !== null);

        return await updateTemplate(templateId, { questions: updatedQuestions });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to reorder questions';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [templates, updateTemplate, toast]
  );

  // ============================================
  // MAPPING OPERATIONS
  // ============================================

  const fetchMappings = useCallback(
    async (templateId: string): Promise<IntakeAcordMapping[]> => {
      try {
        const { data, error: fetchError } = await supabase
          .from('intake_acord_mappings')
          .select('*')
          .eq('intake_template_id', templateId);

        if (fetchError) throw fetchError;
        return data || [];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch mappings';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return [];
      }
    },
    [toast]
  );

  const createMapping = useCallback(
    async (
      mapping: Omit<IntakeAcordMapping, 'id' | 'created_at'>
    ): Promise<IntakeAcordMapping | null> => {
      try {
        const { data, error: createError } = await supabase
          .from('intake_acord_mappings')
          .insert(mapping)
          .select()
          .single();

        if (createError) throw createError;

        toast({
          title: 'Mapping created',
          description: 'Field mapping has been saved',
        });

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create mapping';
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

  const updateMapping = useCallback(
    async (mappingId: string, updates: Partial<IntakeAcordMapping>): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('intake_acord_mappings')
          .update(updates)
          .eq('id', mappingId);

        if (updateError) throw updateError;

        toast({
          title: 'Mapping updated',
          description: 'Field mapping has been updated',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update mapping';
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

  const deleteMapping = useCallback(
    async (mappingId: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase
          .from('intake_acord_mappings')
          .delete()
          .eq('id', mappingId);

        if (deleteError) throw deleteError;

        toast({
          title: 'Mapping deleted',
          description: 'Field mapping has been removed',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete mapping';
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
    templates,
    loading,
    error,
    fetchTemplates,
    fetchTemplateById,
    createTemplate,
    updateTemplate,
    duplicateTemplate,
    deleteTemplate,
    archiveTemplate,
    publishTemplate,
    unpublishTemplate,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    fetchMappings,
    createMapping,
    updateMapping,
    deleteMapping,
  };
}

export default useIntakeTemplates;
