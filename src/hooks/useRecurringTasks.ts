import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface RecurrenceRule {
  id: string;
  task_id: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  days_of_week?: number[];
  day_of_month?: number;
  month_of_year?: number;
  start_date: string;
  end_date?: string;
  next_occurrence: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useRecurringTasks() {
  const [recurrenceRules, setRecurrenceRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecurrenceRules = useCallback(async (taskId?: string) => {
    try {
      setLoading(true);
      let query: any = supabase
        .from('task_recurrence_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (taskId) {
        query = query.eq('task_id', taskId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRecurrenceRules((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching recurrence rules:', error);
      toast({
        title: 'Error',
        description: 'Failed to load recurrence rules',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const createRecurrenceRule = useCallback(async (ruleData: Partial<RecurrenceRule>) => {
    try {
      const { data, error } = await supabase
        .from('task_recurrence_rules')
        .insert(ruleData as any)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Recurring task created successfully',
      });

      return data;
    } catch (error: any) {
      console.error('Error creating recurrence rule:', error);
      toast({
        title: 'Error',
        description: 'Failed to create recurring task',
        variant: 'destructive',
      });
      return null;
    }
  }, []);

  const updateRecurrenceRule = useCallback(async (ruleId: string, updates: Partial<RecurrenceRule>) => {
    try {
      const { error } = await supabase
        .from('task_recurrence_rules')
        .update(updates as any)
        .eq('id', ruleId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Recurrence rule updated successfully',
      });

      return true;
    } catch (error: any) {
      console.error('Error updating recurrence rule:', error);
      toast({
        title: 'Error',
        description: 'Failed to update recurrence rule',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  const deleteRecurrenceRule = useCallback(async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('task_recurrence_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Recurring task removed successfully',
      });

      return true;
    } catch (error: any) {
      console.error('Error deleting recurrence rule:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove recurring task',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  const generateNextInstance = useCallback(async (taskId: string, dueDate: string) => {
    try {
      const { data, error } = await supabase.rpc('generate_recurring_task_instance', {
        p_template_task_id: taskId,
        p_due_date: dueDate,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Next task instance generated',
      });

      return data;
    } catch (error: any) {
      console.error('Error generating task instance:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate next task',
        variant: 'destructive',
      });
      return null;
    }
  }, []);

  return {
    recurrenceRules,
    loading,
    fetchRecurrenceRules,
    createRecurrenceRule,
    updateRecurrenceRule,
    deleteRecurrenceRule,
    generateNextInstance,
  };
}
