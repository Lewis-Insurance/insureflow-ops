import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AIQuoteAssistantProps {
  accountId: string;
  onSuggestion: (suggestion: QuoteSuggestion) => void;
}

export interface QuoteSuggestion {
  carrier?: string;
  line_of_business?: 'auto' | 'home' | 'life' | 'business' | string;
  premium?: string;
  notes?: string;
}

export function AIQuoteAssistant({ accountId, onSuggestion }: AIQuoteAssistantProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const normalizeLOB = (lob?: string) => {
    if (!lob) return undefined;
    const v = lob.trim().toLowerCase();
    if (['auto', 'auto insurance', 'personal auto'].includes(v)) return 'auto';
    if (['home', 'homeowners', 'home insurance', 'property'].includes(v)) return 'home';
    if (['life', 'life insurance'].includes(v)) return 'life';
    if (['business', 'commercial', 'commercial lines', 'gl', 'bop'].includes(v)) return 'business';
    return lob;
  };

  const normalizePremium = (p?: string) => {
    if (!p) return undefined;
    const s = String(p).replace(/`+/g, '').trim();
    const raw = s.replace(/[^0-9.]/g, '');
    if (!raw) return s;
    const [intPart, decPart] = raw.split('.');
    const intFmt = Number(intPart || '0').toLocaleString();
    const decFmt = decPart ? `.${decPart.slice(0, 2)}` : '';
    return `$${intFmt}${decFmt}`;
  };

  const safeParseJSON = (text: string): any | null => {
    try {
      const unfenced = text.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      try { return JSON.parse(unfenced); } catch {}
      const match = unfenced.match(/```json[\s\S]*?```/i);
      if (match) {
        const inner = match[0].replace(/```json|```/gi, '');
        try { return JSON.parse(inner); } catch {}
      }
      const objOrArray = unfenced.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (objOrArray) return JSON.parse(objOrArray[0]);
    } catch {}
    return null;
  };

  const coerceSuggestion = (raw: any): QuoteSuggestion => {
    if (!raw || typeof raw !== 'object') return {};
    const carrier = typeof raw.carrier === 'string' ? raw.carrier.trim() : undefined;
    const line_of_business = normalizeLOB(
      typeof raw.line_of_business === 'string' ? raw.line_of_business : undefined
    );
    const premium = normalizePremium(
      typeof raw.premium === 'string' ? raw.premium : undefined
    );
    const notes = typeof raw.notes === 'string' ? raw.notes : undefined;
    return { carrier, line_of_business, premium, notes };
  };

  const handleAnalyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    try {
      if (!accountId) throw new Error('Missing account id');

      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, name, kind, uploaded_at, created_at')
        .eq('account_id', accountId)
        .order('uploaded_at', { ascending: false })
        .limit(5);

      if (signal.aborted) return;
      if (docsError) throw docsError;

      if (!docs || docs.length === 0) {
        toast({
          title: 'No documents found',
          description: 'Upload documents first to get AI suggestions.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          type: 'quote_suggestion',
          accountId,
          documentIds: docs.map((d) => d.id),
          conversationHistory: [],
          message:
            'Analyze these documents and suggest insurance quote details. Extract: carrier name, line of business (auto/home/life/business), estimated premium if mentioned, and any relevant notes. Return a single JSON object **or** a JSON array of objects with fields: carrier, line_of_business, premium, notes. Do not include extra prose.',
        },
      });

      if (signal.aborted) return;
      if (error) throw error;

      const responseText: string = typeof data?.response === 'string' ? data.response : '';
      const parsed = safeParseJSON(responseText);

      let suggestion: QuoteSuggestion | null = null;
      if (Array.isArray(parsed)) {
        suggestion = coerceSuggestion(parsed[0]);
      } else if (parsed && typeof parsed === 'object') {
        suggestion = coerceSuggestion(parsed);
      }

      if (!suggestion || Object.keys(suggestion).length === 0) {
        onSuggestion({ notes: responseText || 'AI returned no structured fields.' });
        toast({ title: 'AI analysis complete', description: 'Added AI insights to notes field.' });
        return;
      }

      onSuggestion(suggestion);
      toast({ title: 'AI suggestions applied', description: 'Review and adjust the suggested quote details.' });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('AI analysis error:', err);
      toast({
        title: 'Analysis failed',
        description: err?.message || 'Failed to analyze documents',
        variant: 'destructive',
      });
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [accountId, loading, onSuggestion, toast]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleAnalyze}
      disabled={loading}
      className="w-full"
      aria-label="AI Suggest Quote Details"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Analyzing documents...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-2" />
          AI Suggest Quote Details
        </>
      )}
    </Button>
  );
}
