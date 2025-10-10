import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Brain, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';

interface DocumentAnalysisButtonProps {
  documentId?: string;
  documentName?: string;
  accountId?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function DocumentAnalysisButton({
  documentId,
  documentName,
  accountId,
  variant = 'outline',
  size = 'sm',
}: DocumentAnalysisButtonProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const analyzeDocument = async () => {
    if (!documentId && !accountId) {
      toast({
        title: 'Error',
        description: 'No document or account specified',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setIsDialogOpen(true);

    try {
      // Fetch document(s) from database
      let documentsToAnalyze: any[] = [];

      if (documentId) {
        // Analyze single document
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .select('*')
          .eq('id', documentId)
          .single();

        if (docError) throw docError;
        documentsToAnalyze = [doc];
      } else if (accountId) {
        // Analyze all documents for account
        const { data: docs, error: docsError } = await supabase
          .from('documents')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (docsError) throw docsError;
        documentsToAnalyze = docs || [];
      }

      if (documentsToAnalyze.length === 0) {
        toast({
          title: 'No documents found',
          description: 'There are no documents to analyze.',
        });
        setIsDialogOpen(false);
        return;
      }

      // Prepare documents for AI analysis
      const documents = documentsToAnalyze.map(doc => ({
        name: doc.filename || doc.name || 'Untitled',
        size: doc.size_bytes || 0,
        type: doc.mime_type || 'application/octet-stream',
        content: `Document: ${doc.filename || doc.name}\nCategory: ${doc.category || 'Unknown'}\nUploaded: ${new Date(doc.uploaded_at).toLocaleDateString()}\nStorage: ${doc.storage_bucket}/${doc.storage_path}`,
      }));

      // Call AI analysis
      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          action: documentsToAnalyze.length > 1 ? 'compare_quotes' : 'analyze_policy',
          documents,
          message: documentsToAnalyze.length > 1
            ? 'Please compare these insurance documents and highlight key differences.'
            : 'Please analyze this insurance document and provide a comprehensive summary.',
          conversationHistory: [],
        },
      });

      if (error) throw error;

      const responseText = typeof data?.response === 'string'
        ? data.response
        : 'Analysis completed, but the response format was unexpected.';

      setAnalysisResult(responseText);

      toast({
        title: 'Analysis Complete',
        description: 'Document analysis has been generated.',
      });
    } catch (error) {
      console.error('Document analysis error:', error);
      toast({
        title: 'Analysis Failed',
        description: 'Failed to analyze documents. Please try again.',
        variant: 'destructive',
      });
      setIsDialogOpen(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={analyzeDocument}
        disabled={isAnalyzing}
        className="gap-2"
      >
        {isAnalyzing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Brain className="h-4 w-4" />
        )}
        <span>AI Analyze</span>
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Analysis</DialogTitle>
            <DialogDescription>
              {documentName || 'AI-powered analysis of your documents'}
            </DialogDescription>
          </DialogHeader>

          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Analyzing documents with AI...
              </p>
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
