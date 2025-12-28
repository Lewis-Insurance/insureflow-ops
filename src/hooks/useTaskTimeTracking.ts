import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useTaskTimeTracking(taskId: string) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!taskId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('task_time_entries')
        .select('*')
        .eq('task_id', taskId)
        .order('started_at', { ascending: false });

      if (error) throw error;
      
      const timeEntries = data || [];
      setEntries(timeEntries);
      
      // Find active entry (one without end time)
      const active = timeEntries.find(e => !e.ended_at);
      setActiveEntry(active || null);
    } catch (error) {
      logger.error('Error fetching time entries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load time entries',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const startTimer = useCallback(async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('task_time_entries')
        .insert({
          task_id: taskId,
          user_id: user.user?.id,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      
      setActiveEntry(data);
      await fetchEntries();
      
      toast({
        title: 'Timer Started',
        description: 'Time tracking has begun for this task',
      });
      
      return data;
    } catch (error) {
      logger.error('Error starting timer:', error);
      toast({
        title: 'Error',
        description: 'Failed to start timer',
        variant: 'destructive',
      });
      return null;
    }
  }, [taskId, fetchEntries]);

  const stopTimer = useCallback(async (notes?: string) => {
    if (!activeEntry) return;
    
    try {
      const endTime = new Date();
      const startTime = new Date(activeEntry.started_at);
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

      const { error } = await supabase
        .from('task_time_entries')
        .update({
          ended_at: endTime.toISOString(),
          duration_minutes: durationMinutes,
          notes: notes || null,
        })
        .eq('id', activeEntry.id);

      if (error) throw error;
      
      setActiveEntry(null);
      await fetchEntries();
      
      toast({
        title: 'Timer Stopped',
        description: `Logged ${durationMinutes} minutes`,
      });
      
      return true;
    } catch (error) {
      logger.error('Error stopping timer:', error);
      toast({
        title: 'Error',
        description: 'Failed to stop timer',
        variant: 'destructive',
      });
      return false;
    }
  }, [activeEntry, fetchEntries]);

  const deleteEntry = useCallback(async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('task_time_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;
      
      await fetchEntries();
      
      toast({
        title: 'Success',
        description: 'Time entry deleted',
      });
      
      return true;
    } catch (error) {
      logger.error('Error deleting time entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete time entry',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchEntries]);

  const getTotalTime = useCallback(() => {
    return entries.reduce((total, entry) => {
      return total + (entry.duration_minutes || 0);
    }, 0);
  }, [entries]);

  return {
    entries,
    loading,
    activeEntry,
    fetchEntries,
    startTimer,
    stopTimer,
    deleteEntry,
    getTotalTime,
  };
}