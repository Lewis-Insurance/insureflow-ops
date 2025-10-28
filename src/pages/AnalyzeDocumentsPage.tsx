import React from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentUploadWithAnalysis } from '@/components/documents/DocumentUploadWithAnalysis';
import { DocumentAnalysisResults } from '@/components/documents/DocumentAnalysisResults';
import { AzureDiagnostics } from '@/components/diagnostics/AzureDiagnostics';
import { useDocumentAnalysisQuery } from '@/hooks/useDocumentAnalysis';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function AnalyzeDocumentsPage() {
  const { analysisId } = useParams();
  const { data: analysis, isLoading } = useDocumentAnalysisQuery(analysisId || null);

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Document Analysis</h1>
          <p className="text-muted-foreground">
            Upload and analyze insurance documents with AI
          </p>
        </div>

        {!analysisId ? (
          <div className="max-w-2xl mx-auto">
            <AzureDiagnostics />
            <DocumentUploadWithAnalysis />
          </div>
        ) : (
          <div className="space-y-6">
            {isLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading analysis results...</p>
                </CardContent>
              </Card>
            ) : analysis ? (
              <DocumentAnalysisResults
                analysis={analysis}
                mode="all"
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Analysis not found
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
