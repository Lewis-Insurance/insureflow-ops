import { useState } from 'react';
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
  line_of_business?: string;
  premium?: string;
  notes?: string;
}

export function AIQuoteAssistant({ accountId, onSuggestion }: AIQuoteAssistantProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      // Fetch documents for this account
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, name, kind, storage_path')
        .eq('account_id', accountId)
        .limit(5);

      if (docsError) throw docsError;

      if (!docs || docs.length === 0) {
        toast({
          title: 'No documents found',
          description: 'Upload documents first to get AI suggestions',
          variant: 'destructive',
        });
        return;
      }

      // Call AI to analyze documents and suggest quote details
      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          type: 'quote_suggestion',
          accountId,
          documentIds: docs.map(d => d.id),
          conversationHistory: [],
          message: `Analyze these documents and suggest insurance quote details. Extract: carrier name, line of business (auto/home/life/business), estimated premium if mentioned, and any relevant notes. Return JSON with fields: carrier, line_of_business, premium, notes.`,
        },
      });

      if (error) throw error;

      // Parse AI response
      const response = data?.response || '';
      
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const suggestion = JSON.parse(jsonMatch[0]) as QuoteSuggestion;
        onSuggestion(suggestion);
        
        toast({
          title: 'AI suggestions applied',
          description: 'Review and adjust the suggested quote details',
        });
      } else {
        // Fallback: extract information from text response
        const suggestion: QuoteSuggestion = {
          notes: response,
        };
        onSuggestion(suggestion);
        
        toast({
          title: 'AI analysis complete',
          description: 'Added AI insights to notes field',
        });
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Failed to analyze documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleAnalyze}
      disabled={loading}
      className="w-full"
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
