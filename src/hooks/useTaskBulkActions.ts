import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TaskStatus, TaskPriority } from './useTasks';

export function useTaskBulkActions() {
  const [processing, setProcessing] = useState(false);

  const bulkUpdateStatus = useCallback(async (taskIds: string[], status: TaskStatus) => {
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .in('id', taskIds);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Updated ${taskIds.length} task(s)`,
      });
      return true;
    } catch (error: any) {
      console.error('Error bulk updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update tasks',
        variant: 'destructive',
      });
      return false;
    } finally {
      setProcessing(false);
    }
  }, []);

  const bulkUpdatePriority = useCallback(async (taskIds: string[], priority: TaskPriority) => {
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('tasks')
        .update({ priority })
        .in('id', taskIds);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Updated priority for ${taskIds.length} task(s)`,
      });
      return true;
    } catch (error: any) {
      console.error('Error bulk updating priority:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task priority',
        variant: 'destructive',
      });
      return false;
    } finally {
      setProcessing(false);
    }
  }, []);

  const bulkAssign = useCallback(async (taskIds: string[], userId: string) => {
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('tasks')
        .update({ assignee_id: userId })
        .in('id', taskIds);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Assigned ${taskIds.length} task(s)`,
      });
      return true;
    } catch (error: any) {
      console.error('Error bulk assigning tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign tasks',
        variant: 'destructive',
      });
      return false;
    } finally {
      setProcessing(false);
    }
  }, []);

  const bulkDelete = useCallback(async (taskIds: string[]) => {
    try {
      setProcessing(true);
      const { error } = await supabase
        .from('tasks')
        .delete()
        .in('id', taskIds);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Deleted ${taskIds.length} task(s)`,
      });
      return true;
    } catch (error: any) {
      console.error('Error bulk deleting tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete tasks',
        variant: 'destructive',
      });
      return false;
    } finally {
      setProcessing(false);
    }
  }, []);

  return {
    processing,
    bulkUpdateStatus,
    bulkUpdatePriority,
    bulkAssign,
    bulkDelete,
  };
}