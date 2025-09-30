import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ChecklistItem {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  item_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export function useChecklistItems(taskId: string) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!taskId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId)
        .order('item_order', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      console.error('Error fetching checklist items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load checklist items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const addItem = useCallback(async (title: string) => {
    try {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.item_order)) : -1;
      
      const { data, error } = await supabase
        .from('task_checklist_items')
        .insert({
          task_id: taskId,
          title,
          item_order: maxOrder + 1,
          is_completed: false,
        })
        .select()
        .single();

      if (error) throw error;
      
      setItems(prev => [...prev, data]);
      toast({
        title: 'Success',
        description: 'Checklist item added',
      });
      return data;
    } catch (error: any) {
      console.error('Error adding checklist item:', error);
      toast({
        title: 'Error',
        description: 'Failed to add checklist item',
        variant: 'destructive',
      });
      return null;
    }
  }, [taskId, items]);

  const toggleItem = useCallback(async (itemId: string, isCompleted: boolean) => {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .update({ is_completed: isCompleted })
        .eq('id', itemId);

      if (error) throw error;
      
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, is_completed: isCompleted } : item
      ));
    } catch (error: any) {
      console.error('Error toggling checklist item:', error);
      toast({
        title: 'Error',
        description: 'Failed to update checklist item',
        variant: 'destructive',
      });
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .update({ title })
        .eq('id', itemId);

      if (error) throw error;
      
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, title } : item
      ));
      
      toast({
        title: 'Success',
        description: 'Checklist item updated',
      });
    } catch (error: any) {
      console.error('Error updating checklist item:', error);
      toast({
        title: 'Error',
        description: 'Failed to update checklist item',
        variant: 'destructive',
      });
    }
  }, []);

  const deleteItem = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      
      setItems(prev => prev.filter(item => item.id !== itemId));
      
      toast({
        title: 'Success',
        description: 'Checklist item deleted',
      });
    } catch (error: any) {
      console.error('Error deleting checklist item:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete checklist item',
        variant: 'destructive',
      });
    }
  }, []);

  return {
    items,
    loading,
    fetchItems,
    addItem,
    toggleItem,
    updateItem,
    deleteItem,
  };
}