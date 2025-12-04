import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
        console.warn('RPC failed, falling back to knowledge_base table:', error);
        
        // Fallback to reading from knowledge_base table
        const { data: viewData, error: viewError } = await supabase
          .from('knowledge_base')
          .select('title, content, category, tags, source')
          .or(`content.ilike.%${query}%,title.ilike.%${query}%`)
          .limit(5);
        
        if (viewError) {
          console.error('Fallback query failed:', viewError);
          throw viewError;
        }
        
        return {
          shortAnswer: 'Found matching knowledge entries',
          fullAnswer: null,
          sources: viewData || [],
          fallback: true
        };
      }
      
      const result = data;
      return {
        shortAnswer: result?.faq_short_answer || 'No answer found',
        fullAnswer: result?.answer_canonical_markdown || null,
        sources: result?.sources || [],
        confidence: result?.confidence || 0,
        fallback: false
      };
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
