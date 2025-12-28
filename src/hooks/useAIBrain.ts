import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useAIBrain() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const queryKnowledge = async (
    query: string, 
    carrier?: string, 
    program?: string, 
    jurisdiction?: string
  ) => {
    setLoading(true);
    try {
      // Try the RPC endpoint first
      const { data, error } = await supabase.rpc('kb_resolve_answer', {
        q: query,
        in_carrier: carrier || null,
        in_program: program || null,
        in_jurisdiction: jurisdiction || null
      });

      if (error) {
        logger.warn('RPC failed, falling back to knowledge_base table:', error);

        // Fallback to reading from knowledge_base table
        const { data: viewData, error: viewError } = await supabase
          .from('knowledge_base')
          .select('title, content, category, tags, source')
          .or(`content.ilike.%${query}%,title.ilike.%${query}%`)
          .limit(5);

        if (viewError) {
          logger.error('Fallback query failed:', viewError);
          throw viewError;
        }

        return {
          shortAnswer: 'Found matching knowledge entries',
          fullAnswer: null,
          sources: viewData || [],
          fallback: true
        };
      }

      // RPC returns an array, get first result
      const result = Array.isArray(data) ? data[0] : data;
      return {
        shortAnswer: result?.faq_short_answer || 'No answer found',
        fullAnswer: result?.answer_canonical_markdown || null,
        sources: [],
        confidence: result?.confidence || 0,
        fallback: false
      };
    } catch (error) {
      toast({
        title: "Query Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
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
    } catch (error) {
      toast({
        title: "Failed to add knowledge",
        description: error instanceof Error ? error.message : 'Unknown error',
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
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
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
