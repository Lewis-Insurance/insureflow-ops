import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface TaskReminder {
  id: string;
  task_id: string;
  remind_at: string;
  reminder_type: 'email' | 'in_app' | 'both';
  status: 'pending' | 'sent' | 'cancelled';
  sent_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export function useTaskReminders() {
  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReminders = useCallback(async (taskId?: string) => {
    try {
      setLoading(true);
      let query = supabase
        .from('task_reminders')
        .select('*')
        .order('remind_at', { ascending: true });

      if (taskId) {
        query = query.eq('task_id', taskId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReminders((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching reminders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load reminders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const createReminder = useCallback(async (reminderData: Partial<TaskReminder>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('task_reminders')
        .insert({
          task_id: reminderData.task_id!,
          remind_at: reminderData.remind_at!,
          reminder_type: reminderData.reminder_type!,
          created_by: user?.id,
        } as any)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Reminder created successfully',
      });

      return data;
    } catch (error: any) {
      console.error('Error creating reminder:', error);
      toast({
        title: 'Error',
        description: 'Failed to create reminder',
        variant: 'destructive',
      });
      return null;
    }
  }, []);

  const updateReminder = useCallback(async (reminderId: string, updates: Partial<TaskReminder>) => {
    try {
      const { error } = await supabase
        .from('task_reminders')
        .update(updates)
        .eq('id', reminderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Reminder updated successfully',
      });

      return true;
    } catch (error: any) {
      console.error('Error updating reminder:', error);
      toast({
        title: 'Error',
        description: 'Failed to update reminder',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  const deleteReminder = useCallback(async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from('task_reminders')
        .delete()
        .eq('id', reminderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Reminder deleted successfully',
      });

      return true;
    } catch (error: any) {
      console.error('Error deleting reminder:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete reminder',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  return {
    reminders,
    loading,
    fetchReminders,
    createReminder,
    updateReminder,
    deleteReminder,
  };
}
