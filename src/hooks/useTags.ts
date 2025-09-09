import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface Tag {
  id: string;
  account_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export function useTags(accountId?: string) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = async () => {
    if (!accountId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('account_id', accountId)
        .order('name');

      if (error) throw error;
      setTags(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error loading tags",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createTag = async (name: string, color: string = '#3b82f6') => {
    if (!accountId) return;

    try {
      const { data, error } = await supabase
        .from('tags')
        .insert([{ account_id: accountId, name, color }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Tag created",
        description: `Tag "${name}" has been created successfully.`,
      });

      await fetchTags();
      return data;
    } catch (err: any) {
      toast({
        title: "Error creating tag",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateTag = async (id: string, updates: { name?: string; color?: string }) => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Tag updated",
        description: "Tag has been updated successfully.",
      });

      await fetchTags();
      return data;
    } catch (err: any) {
      toast({
        title: "Error updating tag",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteTag = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Tag deleted",
        description: "Tag has been removed successfully.",
      });

      await fetchTags();
    } catch (err: any) {
      toast({
        title: "Error deleting tag",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const addTagToCustomer = async (customerId: string, tagName: string, tagColor?: string) => {
    if (!accountId) return;

    try {
      const { data, error } = await supabase.rpc('add_tag_to_customer', {
        p_account_id: accountId,
        p_customer_id: customerId,
        p_tag_name: tagName,
        p_color: tagColor || '#3b82f6'
      });

      if (error) throw error;

      toast({
        title: "Tag added",
        description: `Tag "${tagName}" has been added to customer.`,
      });

      await fetchTags();
      return data;
    } catch (err: any) {
      toast({
        title: "Error adding tag",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const removeTagFromCustomer = async (customerId: string, tagId: string) => {
    try {
      const { error } = await supabase
        .from('customer_tags')
        .delete()
        .eq('customer_id', customerId)
        .eq('tag_id', tagId);

      if (error) throw error;

      toast({
        title: "Tag removed",
        description: "Tag has been removed from customer.",
      });
    } catch (err: any) {
      toast({
        title: "Error removing tag",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const seedDefaultTags = async () => {
    if (!accountId) return;

    try {
      const { data, error } = await supabase.rpc('seed_default_tags', {
        p_account_id: accountId
      });

      if (error) throw error;

      toast({
        title: "Default tags created",
        description: "Lead, Active, and High Value tags have been created.",
      });

      await fetchTags();
      return data;
    } catch (err: any) {
      toast({
        title: "Error creating default tags",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  useEffect(() => {
    fetchTags();
  }, [accountId]);

  return {
    tags,
    loading,
    error,
    fetchTags,
    createTag,
    updateTag,
    deleteTag,
    addTagToCustomer,
    removeTagFromCustomer,
    seedDefaultTags,
    refetch: fetchTags
  };
}