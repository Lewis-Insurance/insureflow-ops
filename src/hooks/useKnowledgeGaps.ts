import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface KnowledgeGap {
  id: string;
  question: string;
  frequency: number;
  answered: boolean;
  context?: string;
  created_at: string;
  updated_at: string;
  last_asked_at: string;
}

export function useKnowledgeGaps() {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchGaps = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('knowledge_gaps')
        .select('*')
        .order('frequency', { ascending: false });

      if (error) throw error;
      setGaps(data || []);
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

  const markAsAnswered = async (id: string) => {
    try {
      const { error } = await supabase
        .from('knowledge_gaps')
        .update({ answered: true, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Question marked as answered",
      });

      fetchGaps();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteGap = async (id: string) => {
    try {
      const { error } = await supabase
        .from('knowledge_gaps')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Knowledge gap deleted",
      });

      fetchGaps();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchGaps();
  }, []);

  return {
    gaps,
    loading,
    fetchGaps,
    markAsAnswered,
    deleteGap,
  };
}
