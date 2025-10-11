import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useAIBrain() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const queryKnowledge = async (query: string, category?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-brain-rag', {
        body: {
          action: 'query',
          query,
          category,
          context: window.location.pathname
        }
      });

      if (error) throw error;
      
      // Log knowledge gap if confidence is low or no answer found
      if (data && (data.confidence < 0.5 || !data.answer)) {
        await supabase.rpc('log_knowledge_gap', {
          p_question: query,
          p_context: category || window.location.pathname
        });
      }
      
      return data;
    } catch (error: any) {
      toast({
        title: "Query Failed",
        description: error.message,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const addKnowledge = async (knowledge: {
    title: string;
    content: string;
    category: string;
    tags?: string[];
    source?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-brain-rag', {
        body: {
          action: 'add_knowledge',
          knowledge
        }
      });

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Knowledge added successfully"
      });
      
      return data;
    } catch (error: any) {
      toast({
        title: "Failed to add knowledge",
        description: error.message,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateEmbeddings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-brain-rag', {
        body: { action: 'update_embeddings' }
      });

      if (error) throw error;
      
      toast({
        title: "Embeddings Updated",
        description: `Updated ${data.updated} knowledge entries`
      });
      
      return data;
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    queryKnowledge,
    addKnowledge,
    updateEmbeddings,
    loading
  };
}
