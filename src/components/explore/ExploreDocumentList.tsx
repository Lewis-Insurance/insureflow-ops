/**
 * Document List for Explore Session
 * 
 * Shows uploaded documents with:
 * - Processing status (pending/processing/completed/error)
 * - Detected document type and LOB
 * - Retry failed processing
 * - Select document for viewing
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  ChevronRight,
  FileWarning,
  Car,
  Home,
  Building2,
  Shield,
} from 'lucide-react';
import { ExploreDocument, useRetryDocumentProcessing } from '@/hooks/useExploreSessions';

interface Props {
  documents: ExploreDocument[];
  selectedDocumentId?: string;
  onSelectDocument: (doc: ExploreDocument) => void;
  conversationId: string;
}

// LOB icons
const LOB_ICONS: Record<string, React.ReactNode> = {
  auto: <Car className="h-3 w-3" />,
  home: <Home className="h-3 w-3" />,
  homeowners: <Home className="h-3 w-3" />,
  commercial: <Building2 className="h-3 w-3" />,
  gl: <Shield className="h-3 w-3" />,
  liability: <Shield className="h-3 w-3" />,
};

function StatusIndicator({ status }: { status: ExploreDocument['processing_status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-amber-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

function DocumentCard({
  doc,
  isSelected,
  onSelect,
  onRetry,
  isRetrying,
}: {
  doc: ExploreDocument;
  isSelected: boolean;
  onSelect: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const isClickable = doc.processing_status !== 'error';

  return (
    <div
      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      } ${!isClickable ? 'opacity-75' : ''}`}
      onClick={isClickable ? onSelect : undefined}
    >
      <div className="flex items-start gap-3">
        <StatusIndicator status={doc.processing_status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" title={doc.filename}>
              {doc.filename}
            </p>
            {isSelected && <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />}
          </div>

          {/* Status message */}
          <p className="text-xs text-muted-foreground mt-1">
            {doc.processing_status === 'pending' && 'Waiting to process...'}
            {doc.processing_status === 'processing' && 'Extracting and analyzing...'}
            {doc.processing_status === 'completed' && (
              <>
                {doc.page_count || 0} pages
                {doc.chunk_count ? ` • ${doc.chunk_count} chunks indexed` : ''}
              </>
            )}
            {doc.processing_status === 'error' && (
              <span className="text-red-500">{doc.error_message || 'Processing failed'}</span>
            )}
          </p>

          {/* Progress bar for processing */}
          {doc.processing_status === 'processing' && (
            <Progress className="h-1 mt-2" value={undefined} />
          )}

          {/* Document type and LOB badges */}
          {doc.processing_status === 'completed' && (
            <div className="flex flex-wrap gap-1 mt-2">
              {doc.doc_type && (
                <Badge variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {doc.doc_type}
                </Badge>
              )}
              {doc.lob_detected?.map((lob) => (
                <Badge key={lob} variant="secondary" className="text-xs gap-1">
                  {LOB_ICONS[lob.toLowerCase()] || <Shield className="h-3 w-3" />}
                  {lob}
                </Badge>
              ))}
              {doc.quality_score !== undefined && doc.quality_score < 0.6 && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-600 gap-1">
                  <FileWarning className="h-3 w-3" />
                  Low quality
                </Badge>
              )}
            </div>
          )}

          {/* Retry button for errors */}
          {doc.processing_status === 'error' && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExploreDocumentList({
  documents,
  selectedDocumentId,
  onSelectDocument,
  conversationId,
}: Props) {
  const retryMutation = useRetryDocumentProcessing();

  const handleRetry = (doc: ExploreDocument) => {
    retryMutation.mutate({
      extractionId: doc.id,
      conversationId,
    });
  };

  // Stats
  const completedCount = documents.filter((d) => d.processing_status === 'completed').length;
  const processingCount = documents.filter((d) => d.processing_status === 'processing' || d.processing_status === 'pending').length;
  const errorCount = documents.filter((d) => d.processing_status === 'error').length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 py-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <div className="flex gap-2">
            {completedCount > 0 && (
              <Badge variant="default" className="bg-green-600">
                {completedCount} ready
              </Badge>
            )}
            {processingCount > 0 && (
              <Badge variant="secondary">
                {processingCount} processing
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive">
                {errorCount} failed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
            <FileText className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm text-center">
              Upload documents to get started
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDocumentId === doc.id}
                  onSelect={() => onSelectDocument(doc)}
                  onRetry={() => handleRetry(doc)}
                  isRetrying={
                    retryMutation.isPending &&
                    retryMutation.variables?.extractionId === doc.id
                  }
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
