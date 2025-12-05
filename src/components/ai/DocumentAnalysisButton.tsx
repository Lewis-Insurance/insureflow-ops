import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Brain, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { useDocumentAnalysisTaskGeneration } from '@/hooks/useAutoTaskGeneration';

interface DocumentAnalysisButtonProps {
  documentId?: string;
  documentName?: string;
  accountId?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  maxDocs?: number;
  promptOverride?: string;
}

export function DocumentAnalysisButton({
  documentId,
  documentName,
  accountId,
  variant = 'outline',
  size = 'sm',
  maxDocs = 5,
  promptOverride,
}: DocumentAnalysisButtonProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { generateFromAnalysis } = useDocumentAnalysisTaskGeneration();

  useEffect(() => () => abortRef.current?.abort(), []);

  const safeLocalDate = (d?: string | null) => {
    const t = d ? new Date(d) : null;
    return t && !isNaN(+t) ? t.toLocaleDateString() : '—';
  };

  const analyzeDocument = useCallback(async () => {
    if (!documentId && !accountId) {
      toast({ title: 'Error', description: 'No document or account specified', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    setIsDialogOpen(true);
    setAnalysisResult(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    try {
      let documentsToAnalyze: any[] = [];

      if (documentId) {
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .select('id, filename, name, size_bytes, mime_type, category, uploaded_at, created_at')
          .eq('id', documentId)
          .single();
        if (docError) throw docError;
        documentsToAnalyze = doc ? [doc] : [];
      } else if (accountId) {
        const { data: docs, error: docsError } = await supabase
          .from('documents')
          .select('id, filename, name, size_bytes, mime_type, category, uploaded_at, created_at')
          .eq('account_id', accountId)
          .order('uploaded_at', { ascending: false })
          .limit(maxDocs);
        if (docsError) throw docsError;
        documentsToAnalyze = docs || [];
      }

      if (documentsToAnalyze.length === 0) {
        toast({ title: 'No documents found', description: 'There are no documents to analyze.' });
        setIsDialogOpen(false);
        return;
      }

      const documents = documentsToAnalyze.map((doc) => ({
        name: doc.filename || doc.name || 'Untitled',
        size: doc.size_bytes ?? 0,
        type: doc.mime_type || 'application/octet-stream',
        content: [
          `Document: ${doc.filename || doc.name || 'Untitled'}`,
          `Category: ${doc.category || 'Unknown'}`,
          `Uploaded: ${safeLocalDate(doc.uploaded_at ?? doc.created_at)}`,
        ].join('\n'),
      }));

      const multi = documentsToAnalyze.length > 1;
      const message =
        promptOverride ||
        (multi
          ? 'Please compare these insurance documents and highlight key differences.'
          : 'Please analyze this insurance document and provide a comprehensive summary.');

      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: { action: multi ? 'compare_quotes' : 'analyze_policy', documents, message, conversationHistory: [] },
      });

      if (signal.aborted) return;
      if (error) throw error;

      const responseText =
        typeof data?.response === 'string'
          ? data.response
          : 'Analysis completed, but the response format was unexpected.';

      setAnalysisResult(responseText);
      toast({ title: 'Analysis Complete', description: 'Document analysis has been generated.' });

      // Auto-generate follow-up task
      if (documentId && documentsToAnalyze.length > 0) {
        generateFromAnalysis({
          accountId,
          documentId,
          documentName: documentsToAnalyze[0].filename || documentsToAnalyze[0].name || 'Document',
          analysisResults: {
            summary: responseText.substring(0, 200) + '...', // First 200 chars
            document_count: documentsToAnalyze.length,
            analysis_type: multi ? 'comparison' : 'single',
          },
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Document analysis error:', err);
      toast({
        title: 'Analysis Failed',
        description: err?.message || 'Failed to analyze documents. Please try again.',
        variant: 'destructive',
      });
      setIsDialogOpen(false);
    } finally {
      if (!signal.aborted) setIsAnalyzing(false);
    }
  }, [accountId, documentId, maxDocs, promptOverride, toast]);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={analyzeDocument}
        disabled={isAnalyzing}
        className="gap-2"
        aria-label="AI Analyze"
      >
        {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        {size !== 'icon' && <span>AI Analyze</span>}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" aria-busy={isAnalyzing}>
          <DialogHeader>
            <DialogTitle>Document Analysis</DialogTitle>
            <DialogDescription>{documentName || 'AI-powered analysis of your documents'}</DialogDescription>
          </DialogHeader>

          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing documents with AI...</p>
            </div>
          ) : analysisResult ? (
            <Card className="p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div className="whitespace-pre-wrap">{analysisResult}</div>
              </div>
            </Card>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
