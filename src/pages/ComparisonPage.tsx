import React from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentComparisonUploader } from '@/components/documents/DocumentComparisonUploader';
import { DocumentComparisonResults } from '@/components/documents/DocumentComparisonResults';
import { useComparisonSessionQuery } from '@/hooks/useDocumentAnalysis';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ComparisonPage() {
  const { sessionId } = useParams();
  const { data: session, isLoading } = useComparisonSessionQuery(sessionId || null);

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Document Comparison</h1>
          <p className="text-muted-foreground">
            Compare insurance quotes and policies side-by-side
          </p>
        </div>

        {!sessionId ? (
          <div className="max-w-2xl mx-auto">
            <DocumentComparisonUploader />
          </div>
        ) : (
          <div className="space-y-6">
            {isLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading comparison results...</p>
                </CardContent>
              </Card>
            ) : session ? (
              <DocumentComparisonResults
                comparisonData={session.comparison_results}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Comparison session not found
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
