import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentUploadWithAnalysis } from '@/components/documents/DocumentUploadWithAnalysis';
import { DocumentAnalysisResults } from '@/components/documents/DocumentAnalysisResults';

export default function DocumentAnalysisPage() {
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Document Intelligence</h1>
          <p className="text-muted-foreground">
            Upload and analyze insurance documents with AI
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <DocumentUploadWithAnalysis
            onComplete={(result) => {
              setAnalysisResult(result.analysis);
            }}
          />

          {analysisResult?.analysis && (
            <DocumentAnalysisResults
              analysis={analysisResult.analysis}
              mode={analysisResult.mode || 'all'}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
