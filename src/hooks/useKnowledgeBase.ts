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
  metadata?: Record<string, unknown>;
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

      // Fetch both sources in parallel: structured kb_entries and general knowledge_base
      const [kbBaseRes, kbEntriesRes] = await Promise.all([
        supabase.from('knowledge_base').select('*').order('updated_at', { ascending: false }),
        supabase.from('kb_entries').select('*')
      ]);

      if (kbBaseRes.error) throw kbBaseRes.error;
      if (kbEntriesRes.error) throw kbEntriesRes.error;

      const baseData = (kbBaseRes.data || []);
      const entriesFromKnowledgeBase = baseData as KnowledgeEntry[];

      // Map kb_entries rows to KnowledgeEntry shape
      const mapCategory = (product_line?: string | null, topic?: string | null, question?: string | null): string => {
        const pl = (product_line || '').toLowerCase();
        const tp = (topic || '').toLowerCase();
        const hasQuestion = Boolean(question && question.trim().length > 0);
        if (tp.includes('process') || pl === 'claims') return 'claims';
        if (tp.includes('coverage') || tp.includes('policy')) return 'policies';
        if (tp.includes('regulation') || pl.includes('state')) return 'regulations';
        if (tp.includes('procedure') || tp.includes('how to')) return 'procedures';
        if (hasQuestion) return 'faqs';
        return 'products';
      };

      const entriesFromKbEntries: KnowledgeEntry[] = (kbEntriesRes.data || []).map((row: Record<string, unknown>) => {
        const tagsRaw: string = (row.tags as string) || '';
        const tags = tagsRaw
          ? tagsRaw.split(/[|,]/).map((t: string) => t.trim()).filter(Boolean)
          : [];
        const questionCanonical = row.question_canonical as string | null;
        const productLine = row.product_line as string | null;
        const topic = row.topic as string | null;
        const title = questionCanonical && questionCanonical.trim().length > 0
          ? questionCanonical
          : `${productLine || 'General'}: ${topic || 'Topic'}`;
        const category = mapCategory(productLine, topic, questionCanonical);
        const nowIso = new Date().toISOString();
        const carrier = row.carrier as string | null;
        const programOrForm = row.program_or_form as string | null;
        return {
          id: row.record_id as string,
          title,
          content: (row.answer_canonical_markdown as string) || (row.faq_short_answer as string) || '',
          category,
          tags,
          source: carrier ? `${carrier}${programOrForm ? ' • ' + programOrForm : ''}` : ((row.source_type as string) || 'Import'),
          created_at: nowIso,
          updated_at: nowIso,
          metadata: {
            product_line: productLine,
            topic: topic,
            jurisdiction: row.jurisdiction,
            confidence: row.confidence,
            seo_snippet: row.seo_snippet,
            citations: row.citations,
          }
        } as KnowledgeEntry;
      });

      const combined = [...entriesFromKnowledgeBase, ...entriesFromKbEntries];
      setEntries(combined);

      // Calculate stats based on combined data
      const uniqueCategories = new Set(combined.map(entry => entry.category));
      setStats({
        totalEntries: combined.length,
        categories: uniqueCategories.size,
        lastUpdated: (entriesFromKnowledgeBase[0]?.updated_at) || new Date().toISOString(),
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Unknown error',
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Unknown error',
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Unknown error',
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