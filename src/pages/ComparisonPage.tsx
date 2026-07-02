import React from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentComparisonUploader } from '@/components/documents/DocumentComparisonUploader';
import { DocumentComparisonResults } from '@/components/documents/DocumentComparisonResults';
import { useComparisonSessionQuery } from '@/hooks/useDocumentAnalysis';

export default function ComparisonPage() {
  const { sessionId } = useParams();
  const { data: session, isLoading } = useComparisonSessionQuery(sessionId || null);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Quote comparison</h1>
          <p className="mt-1 text-sm text-cc-text-muted">
            Line up a current policy against quotes to see price and coverage side by side.
          </p>
        </header>

        {!sessionId ? (
          <div className="max-w-2xl">
            <DocumentComparisonUploader />
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center shadow-card">
            <Loader2 className="h-7 w-7 animate-spin text-cc-text-muted" aria-hidden="true" />
            <p className="text-sm text-cc-text-secondary">Loading comparison results</p>
          </div>
        ) : session ? (
          <DocumentComparisonResults comparisonData={session.comparison_results} />
        ) : (
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center text-sm text-cc-text-secondary shadow-card">
            Comparison session not found.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
