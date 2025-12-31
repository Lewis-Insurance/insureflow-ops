import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { fromZonedTime } from 'date-fns-tz';
import { logger } from '@/lib/logger';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskCategory = 'quote' | 'policy' | 'claim' | 'renewal' | 'service' | 'general';

export interface Task {
  id: string;
  account_id?: string;
  policy_id?: string;
  quote_id?: string;
  title: string;
  description?: string;
  details?: string;
  category?: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  due_at?: string;
  completed_at?: string;
  assignee_id?: string;
  assigned_by?: string;
  created_by?: string;
  parent_task_id?: string;
  dependencies?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  notes?: string;
  created_at: string;
  updated_at: string;
  entity_type?: string;
  entity_id?: string;
  customer_id?: string;
  // Joined data
  account?: { id: string; name: string } | null;
  policy?: { id: string; policy_number: string; carrier: string; line_of_business: string } | null;
  assignee?: { id: string; full_name: string } | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
  };
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  document_id: string;
  attached_by?: string;
  attached_at: string;
  document?: {
    id: string;
    filename: string;
    mime_type?: string;
    size_bytes?: number;
  };
}

export function useTasks(accountId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFiltersRef = useRef<{ status?: TaskStatus; category?: TaskCategory; assignedTo?: string } | undefined>(undefined);

  const fetchTasks = useCallback(async (filters?: {
    status?: TaskStatus;
    category?: TaskCategory;
    assignedTo?: string;
  }) => {
    try {
      setLoading(true);
      lastFiltersRef.current = filters;
      let query = supabase
        .from('tasks')
        .select(`
          *,
          account:accounts(id, name),
          policy:policies(id, policy_number, carrier, line_of_business),
          assignee:profiles!tasks_assignee_id_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.assignedTo) {
        query = query.eq('assignee_id', filters.assignedTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTasks(data as Task[] || []);
      return (data as Task[]) || [];
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load tasks',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const createTask = useCallback(async (taskData: Partial<Task>) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const insertData = {
        account_id: taskData.account_id,
        policy_id: taskData.policy_id,
        quote_id: taskData.quote_id,
        title: taskData.title || 'Untitled Task',
        description: taskData.description,
        details: taskData.details,
        notes: taskData.notes,
        category: taskData.category || 'general',
        status: taskData.status || 'pending',
        priority: taskData.priority || 'medium',
        due_at: taskData.due_at,
        assignee_id: taskData.assignee_id,
        assigned_by: user.user?.id,
        created_by: user.user?.id,
        parent_task_id: taskData.parent_task_id,
        entity_type: taskData.entity_type,
        entity_id: taskData.entity_id,
        customer_id: taskData.customer_id,
        metadata: taskData.metadata,
        dependencies: taskData.dependencies,
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task created successfully',
      });

      await fetchTasks(lastFiltersRef.current);
      return data;
    } catch (error) {
      logger.error('Error creating task:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create task',
        variant: 'destructive',
      });
      return null;
    }
  }, [fetchTasks]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task updated successfully',
      });

      await fetchTasks(lastFiltersRef.current);
      return true;
    } catch (error) {
      logger.error('Error updating task:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update task',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task deleted successfully',
      });

      await fetchTasks(lastFiltersRef.current);
      return true;
    } catch (error) {
      logger.error('Error deleting task:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete task',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchTasks]);

  const fetchComments = useCallback(async (taskId: string): Promise<TaskComment[]> => {
    try {
      const { data: commentsData, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch user details separately
      const comments = await Promise.all(
        (commentsData || []).map(async (comment) => {
          const { data: userData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('id', comment.user_id)
            .single();
          
          return {
            ...comment,
            user: userData || undefined,
          };
        })
      );

      return comments;
    } catch (error) {
      logger.error('Error fetching comments:', error);
      return [];
    }
  }, []);

  const addComment = useCallback(async (taskId: string, commentText: string) => {
    try {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('task_comments')
        .insert({
          task_id: taskId,
          user_id: user.user?.id,
          comment_text: commentText,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Comment added successfully',
      });

      return true;
    } catch (error) {
      logger.error('Error adding comment:', error);
      toast({
        title: 'Error',
        description: 'Failed to add comment',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  const fetchAttachments = useCallback(async (taskId: string): Promise<TaskAttachment[]> => {
    try {
      const { data, error } = await supabase
        .from('task_attachments')
        .select(`
          *,
          document:documents(id, filename, mime_type, size_bytes)
        `)
        .eq('task_id', taskId)
        .order('attached_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error fetching attachments:', error);
      return [];
    }
  }, []);

  const addAttachment = useCallback(async (taskId: string, documentId: string) => {
    try {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('task_attachments')
        .insert({
          task_id: taskId,
          document_id: documentId,
          attached_by: user.user?.id,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Document attached successfully',
      });

      return true;
    } catch (error) {
      logger.error('Error attaching document:', error);
      toast({
        title: 'Error',
        description: 'Failed to attach document',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  const removeAttachment = useCallback(async (attachmentId: string) => {
    try {
      const { error } = await supabase
        .from('task_attachments')
        .delete()
        .eq('id', attachmentId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Attachment removed successfully',
      });

      return true;
    } catch (error) {
      logger.error('Error removing attachment:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove attachment',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  const backfillAssignmentsForUser = useCallback(async (userId: string) => {
    try {
      // Assign ALL unassigned tasks to the current user
      // This includes auto-generated tasks from templates
      const { data, error } = await supabase
        .from('tasks')
        .update({ assignee_id: userId })
        .is('assignee_id', null)
        .in('status', ['pending', 'in_progress'])
        .select('id');

      if (error) throw error;

      const count = data?.length || 0;
      if (count > 0) {
        await fetchTasks(lastFiltersRef.current);
        toast({
          title: 'Tasks Assigned',
          description: `${count} unassigned task${count !== 1 ? 's' : ''} assigned to you`,
        });
      }
      return true;
    } catch (error) {
      logger.error('Error backfilling assignments:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign unassigned tasks',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchTasks]);

  const backfillDueDatesForUser = useCallback(async (userId: string) => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const { error } = await supabase
        .from('tasks')
        .update({ due_at: tomorrow.toISOString() })
        .is('due_at', null)
        .eq('assignee_id', userId);

      if (error) throw error;

      toast({
        title: 'Updated',
        description: 'Set default due dates for tasks without dates',
      });
      return true;
    } catch (error) {
      logger.error('Error backfilling due dates:', error);
      return false;
    }
  }, []);

  return {
    tasks,
    loading,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    fetchComments,
    addComment,
    fetchAttachments,
    addAttachment,
    removeAttachment,
    backfillAssignmentsForUser,
    backfillDueDatesForUser,
  };
}
