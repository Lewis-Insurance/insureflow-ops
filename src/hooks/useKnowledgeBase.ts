import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  created_at: string;
  updated_at: string;
  metadata?: any;
}

export function useKnowledgeBase() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEntries: 0,
    categories: 0,
    lastUpdated: new Date().toISOString(),
  });
  const { toast } = useToast();

  const fetchKnowledgeBase = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setEntries(data as KnowledgeEntry[]);
        
        // Calculate stats
        const uniqueCategories = new Set(data.map(entry => entry.category));
        setStats({
          totalEntries: data.length,
          categories: uniqueCategories.size,
          lastUpdated: data[0]?.updated_at || new Date().toISOString(),
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Knowledge entry deleted successfully",
      });

      // Refresh the list
      fetchKnowledgeBase();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateEntry = async (id: string, updates: Partial<KnowledgeEntry>) => {
    try {
      const { error } = await supabase
        .from('knowledge_base')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Knowledge entry updated successfully",
      });

      // Refresh the list
      fetchKnowledgeBase();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getEntriesByCategory = (category: string) => {
    return entries.filter(entry => 
      entry.category.toLowerCase() === category.toLowerCase()
    );
  };

  useEffect(() => {
    fetchKnowledgeBase();
  }, []);

  return {
    entries,
    loading,
    stats,
    fetchKnowledgeBase,
    deleteEntry,
    updateEntry,
    getEntriesByCategory,
  };
}