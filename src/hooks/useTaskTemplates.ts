// @ts-nocheck
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TaskCategory, TaskPriority } from './useTasks';

export type TriggerEvent = 
  | 'quote_requested'
  | 'quote_accepted'
  | 'policy_issued'
  | 'policy_renewal_due'
  | 'claim_filed'
  | 'payment_overdue'
  | 'service_request'
  | 'manual';

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  category: TaskCategory;
  trigger_event: TriggerEvent;
  default_assignee_role?: string;
  priority: TaskPriority;
  estimated_duration_hours?: number;
  task_order: number;
  dependencies?: any;
  is_active: boolean;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export function useTaskTemplates() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = useCallback(async (filters?: {
    triggerEvent?: TriggerEvent;
    isActive?: boolean;
  }) => {
    try {
      setLoading(true);
      let query = supabase
        .from('task_templates')
        .select('*')
        .order('task_order', { ascending: true });

      if (filters?.triggerEvent) {
        query = query.eq('trigger_event', filters.triggerEvent);
      }

      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTemplates(data as TaskTemplate[] || []);
      return (data as TaskTemplate[]) || [];
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load task templates',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createTemplate = useCallback(async (templateData: Partial<TaskTemplate>) => {
    try {
      const insertData: any = {
        name: templateData.name,
        description: templateData.description,
        category: templateData.category || 'general',
        trigger_event: templateData.trigger_event || 'manual',
        priority: templateData.priority || 'medium',
        estimated_duration_hours: templateData.estimated_duration_hours,
        task_order: templateData.task_order ?? 0,
        is_active: templateData.is_active ?? true,
        metadata: templateData.metadata || {},
      };

      const { data, error } = await supabase
        .from('task_templates')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task template created successfully',
      });

      await fetchTemplates();
      return data;
    } catch (error: any) {
      console.error('Error creating template:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create task template',
        variant: 'destructive',
      });
      return null;
    }
  }, [fetchTemplates]);

  const updateTemplate = useCallback(async (templateId: string, updates: Partial<TaskTemplate>) => {
    try {
      const { error } = await supabase
        .from('task_templates')
        .update(updates)
        .eq('id', templateId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task template updated successfully',
      });

      await fetchTemplates();
      return true;
    } catch (error: any) {
      console.error('Error updating template:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update task template',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task template deleted successfully',
      });

      await fetchTemplates();
      return true;
    } catch (error: any) {
      console.error('Error deleting template:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete task template',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchTemplates]);

  const generateTasksFromEvent = useCallback(async (
    triggerEvent: TriggerEvent,
    accountId: string,
    entityType?: string,
    entityId?: string
  ) => {
    try {
      const { data, error } = await supabase.rpc('generate_tasks_from_templates', {
        p_trigger_event: triggerEvent,
        p_account_id: accountId,
        p_entity_type: entityType || null,
        p_entity_id: entityId || null,
      });

      if (error) throw error;

      const result = data;
      if (result?.generated_count > 0) {
        toast({
          title: 'Tasks Generated',
          description: `Created ${result.generated_count} task${result.generated_count !== 1 ? 's' : ''} from templates`,
        });
      }

      return result;
    } catch (error: any) {
      console.error('Error generating tasks:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate tasks from templates',
        variant: 'destructive',
      });
      return null;
    }
  }, []);

  return {
    templates,
    loading,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    generateTasksFromEvent,
  };
}
