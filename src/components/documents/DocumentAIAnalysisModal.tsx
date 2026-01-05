import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, FileText, Send, Loader2, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Document } from '@/hooks/useDocuments';

interface DocumentAIAnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
}

const QUICK_PROMPTS = [
  { label: 'Summarize', prompt: 'Provide a brief summary of this document.' },
  { label: 'Key Details', prompt: 'Extract all key details from this document including dates, amounts, names, and policy numbers.' },
  { label: 'Coverage Analysis', prompt: 'Analyze the coverage details in this document. What is covered and what are the limits?' },
  { label: 'Exclusions', prompt: 'List any exclusions, limitations, or conditions mentioned in this document.' },
  { label: 'Action Items', prompt: 'What action items or follow-ups are needed based on this document?' },
  { label: 'Compare to Standard', prompt: 'How does this document compare to standard industry practices? Any unusual terms?' },
];

export function DocumentAIAnalysisModal({
  open,
  onOpenChange,
  document: doc,
}: DocumentAIAnalysisModalProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load document content when modal opens
  useEffect(() => {
    if (open && doc) {
      loadDocumentContent();
    } else {
      setDocumentContent(null);
      setResponse(null);
      setQuestion('');
    }
  }, [open, doc]);

  const loadDocumentContent = async () => {
    if (!doc?.storage_path) return;

    setLoadingContent(true);
    try {
      // For PDFs, we'll need to use an extraction service
      // For now, we'll use the document metadata and filename
      // In production, this would call a document extraction edge function
      
      const { data: signedUrl } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 3600);

      if (signedUrl?.signedUrl) {
        // Store the URL for potential extraction
        setDocumentContent(`Document: ${doc.filename}\nType: ${doc.kind}\nURL: ${signedUrl.signedUrl}`);
      }
    } catch (error) {
      console.error('Error loading document:', error);
    } finally {
      setLoadingContent(false);
    }
  };

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
  };

  const handleAnalyze = async (promptText?: string) => {
    const queryText = promptText || question;
    if (!queryText.trim() || !doc) return;

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller with 60 second timeout
    abortControllerRef.current = new AbortController();
    const timeoutId = setTimeout(() => {
      abortControllerRef.current?.abort();
    }, 60000); // 60 second timeout

    setIsAnalyzing(true);
    setResponse(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please log in to use AI analysis');
      }

      // Build context string
      const contextParts: string[] = [];
      if (doc.account?.name) contextParts.push(`Account: ${doc.account.name}`);
      if (doc.policy?.policy_number) contextParts.push(`Policy: ${doc.policy.policy_number}`);
      if (doc.policy?.line_of_business) contextParts.push(`Line of Business: ${doc.policy.line_of_business}`);

      // Call Azure Document Q&A for fast analysis
      const azureResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-qa-azure`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            document_id: doc.id,
            storage_path: doc.storage_path,
            storage_bucket: (doc as any).storage_bucket || 'documents', // Use actual bucket
            filename: doc.filename,
            question: queryText,
            context: contextParts.length > 0 ? contextParts.join(', ') : undefined,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!azureResponse.ok) {
        const errorData = await azureResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'AI analysis failed');
      }

      const result = await azureResponse.json();
      
      if (result.success && result.answer) {
        setResponse(result.answer);
      } else if (result.error) {
        throw new Error(result.error);
      } else {
        setResponse('Analysis completed but no response was generated. Please try again.');
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        toast({
          title: 'Request Cancelled',
          description: 'The analysis was cancelled or timed out.',
        });
        return;
      }
      
      console.error('AI analysis error:', error);
      toast({
        title: 'Analysis Error',
        description: error.message || 'Failed to analyze document',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopy = async () => {
    if (response) {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Document Analysis
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {doc.filename}
            <Badge variant="outline" className="ml-2">{doc.kind}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((qp) => (
              <Button
                key={qp.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuestion(qp.prompt);
                  handleAnalyze(qp.prompt);
                }}
                disabled={isAnalyzing}
              >
                {qp.label}
              </Button>
            ))}
          </div>

          {/* Custom Question */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask a question about this document..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 min-h-[80px]"
              disabled={isAnalyzing}
            />
            <Button
              onClick={() => handleAnalyze()}
              disabled={!question.trim() || isAnalyzing}
              className="self-end"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Response */}
          {(isAnalyzing || response) && (
            <Card className="flex-1">
              <CardContent className="pt-4">
                {isAnalyzing ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-muted-foreground">Analyzing document...</span>
                    </div>
                    <p className="text-xs text-muted-foreground">This may take up to 60 seconds</p>
                    <Button variant="outline" size="sm" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </div>
                ) : response ? (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        className="gap-2"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <ScrollArea className="h-[300px] pr-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                        {response}
                      </div>
                    </ScrollArea>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DocumentAIAnalysisModal;

