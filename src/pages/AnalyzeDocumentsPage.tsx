import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentAnalysisUpload } from '@/components/document-analysis/DocumentAnalysisUpload';
import {
  DocumentAnalysisResults,
  documentAnalysisRecordToDisplayResult,
} from '@/components/document-analysis/DocumentAnalysisResults';
import { ExtractAccountMatchPanel } from '@/components/document-analysis/ExtractAccountMatchPanel';
import { StorageDiagnostics } from '@/components/document-analysis/StorageDiagnostics';
import { useDocumentAnalysisQuery } from '@/hooks/useDocumentAnalysis';
import { Skeleton } from '@/components/cc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; status?: number };
  if (err.code === '42501' || err.status === 403) return true;
  const message = err.message?.toLowerCase() ?? '';
  return (
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('not authorized')
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; status?: number };
  return err.code === 'PGRST116' || err.status === 404;
}

const PROCESSING_STATUSES = new Set(['pending', 'processing', 'ocr_complete']);
const FAILED_STATUSES = new Set(['failed', 'error']);
const COMPLETED_STATUSES = new Set(['completed', 'complete']);

function normalizeProcessingStatus(status: string | null | undefined): 'processing' | 'failed' | 'completed' | 'unknown' {
  if (!status) return 'unknown';
  if (PROCESSING_STATUSES.has(status)) return 'processing';
  if (FAILED_STATUSES.has(status)) return 'failed';
  if (COMPLETED_STATUSES.has(status)) return 'completed';
  return 'unknown';
}

export default function AnalyzeDocumentsPage() {
  const { analysisId } = useParams<{ analysisId?: string }>();
  const { data, isLoading, isFetching, error, refetch } = useDocumentAnalysisQuery(
    analysisId ?? null,
  );
  const normalizedStatus = normalizeProcessingStatus(data?.processing_status);

  const showUpload = !analysisId;

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-cc-text">Document Analysis</h1>
            <p className="text-cc-text-muted">
              Upload and analyze insurance documents with AI
            </p>
          </div>
          {analysisId && (
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/analyze-documents">Analyze another</Link>
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {showUpload && <DocumentAnalysisUpload />}

          {analysisId && isLoading && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-cc-text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading analysis...</span>
              </div>
              <Skeleton className="h-32 w-full rounded-cc-xl" />
              <Skeleton className="h-64 w-full rounded-cc-xl" />
            </div>
          )}

          {analysisId && !isLoading && error && (
            <Alert variant="destructive" className="border-cc-border bg-cc-surface">
              <AlertTitle className="text-cc-text">
                {isUnauthorizedError(error) ? 'Unauthorized' : isNotFoundError(error) ? 'Not found' : 'Error'}
              </AlertTitle>
              <AlertDescription className="text-cc-text-muted">
                {isUnauthorizedError(error)
                  ? 'You do not have permission to view this analysis.'
                  : isNotFoundError(error)
                    ? 'No analysis was found for this ID.'
                    : error instanceof Error
                      ? error.message
                      : 'Failed to load analysis.'}
              </AlertDescription>
              <div className="mt-4 flex gap-2">
                {!isNotFoundError(error) && (
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Try again
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm">
                  <Link to="/analyze-documents">Back to upload</Link>
                </Button>
              </div>
            </Alert>
          )}

          {analysisId && !isLoading && !error && data && normalizedStatus === 'processing' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-6 rounded-cc-xl border border-cc-border bg-cc-surface">
                <Loader2 className="h-6 w-6 animate-spin text-cc-accent" />
                <div>
                  <p className="font-medium text-cc-text">Analysis in progress</p>
                  <p className="text-sm text-cc-text-muted">
                    {isFetching ? 'Checking for updates...' : 'Waiting for analysis to complete.'}
                  </p>
                </div>
              </div>
              <Skeleton className="h-48 w-full rounded-cc-xl" />
            </div>
          )}

          {analysisId && !isLoading && !error && data && normalizedStatus === 'failed' && (
            <Alert variant="destructive" className="border-cc-border bg-cc-surface">
              <AlertTitle className="text-cc-text">Analysis failed</AlertTitle>
              <AlertDescription className="text-cc-text-muted">
                {data.error_message ?? data.analysis_error ?? 'The document analysis could not be completed.'}
              </AlertDescription>
              <div className="mt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to="/analyze-documents">Try another document</Link>
                </Button>
              </div>
            </Alert>
          )}

          {analysisId &&
            !isLoading &&
            !error &&
            data &&
            normalizedStatus === 'completed' && (
              <>
                <ExtractAccountMatchPanel analysis={data} />
                <DocumentAnalysisResults
                  result={documentAnalysisRecordToDisplayResult(data)}
                />
              </>
            )}

          {analysisId && !isLoading && !error && data && normalizedStatus === 'unknown' && (
            <Alert variant="destructive" className="border-cc-border bg-cc-surface">
              <AlertTitle className="text-cc-text">Unknown analysis status</AlertTitle>
              <AlertDescription className="text-cc-text-muted">
                This analysis has status &quot;{data.processing_status}&quot;, which is not recognized. Try refreshing or upload again.
              </AlertDescription>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Refresh
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/analyze-documents">Back to upload</Link>
                </Button>
              </div>
            </Alert>
          )}

          {showUpload && <StorageDiagnostics />}
        </div>
      </div>
    </AppLayout>
  );
}
