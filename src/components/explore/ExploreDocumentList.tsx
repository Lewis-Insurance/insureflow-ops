/**
 * Explore Document List
 * 
 * Displays uploaded documents with processing status, retry capability,
 * and document type classification results.
 */

import React from 'react';
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Eye,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ExploreDocument,
  useRetryExploreDocument,
} from '@/hooks/useExploreSessions';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ExploreDocumentListProps {
  documents: ExploreDocument[];
  selectedDocumentId: string | null;
  onSelectDocument: (doc: ExploreDocument) => void;
  onDeleteDocument?: (docId: string) => void;
}

// Document type display names
const DOC_TYPE_LABELS: Record<string, string> = {
  dec_page: 'Declarations',
  policy: 'Policy',
  quote: 'Quote',
  endorsement: 'Endorsement',
  certificate: 'Certificate',
  loss_run: 'Loss Run',
  binder: 'Binder',
  application: 'Application',
  unknown: 'Unknown',
};

// LOB badges
const LOB_COLORS: Record<string, string> = {
  GL: 'bg-blue-100 text-blue-700',
  AUTO: 'bg-green-100 text-green-700',
  WC: 'bg-orange-100 text-orange-700',
  PROP: 'bg-purple-100 text-purple-700',
  UMBRELLA: 'bg-indigo-100 text-indigo-700',
  BOP: 'bg-pink-100 text-pink-700',
  EPLI: 'bg-red-100 text-red-700',
  CYBER: 'bg-cyan-100 text-cyan-700',
  PROF: 'bg-teal-100 text-teal-700',
};

export const ExploreDocumentList: React.FC<ExploreDocumentListProps> = ({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onDeleteDocument,
}) => {
  const retryMutation = useRetryExploreDocument();

  const getStatusIcon = (status: ExploreDocument['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-amber-500" />;
      case 'ready':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusLabel = (status: ExploreDocument['status']) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'ready':
        return 'Ready';
      case 'error':
        return 'Error';
    }
  };

  const getQualityColor = (score: number | null) => {
    if (score === null) return 'bg-gray-200';
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No documents uploaded yet</p>
        <p className="text-sm">Drop files above to start</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-1">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={cn(
              'p-3 rounded-lg border cursor-pointer transition-all',
              selectedDocumentId === doc.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
            onClick={() => onSelectDocument(doc)}
          >
            <div className="flex items-start gap-3">
              {/* Status icon */}
              <div className="mt-0.5">{getStatusIcon(doc.status)}</div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Filename */}
                <p className="text-sm font-medium truncate" title={doc.filename}>
                  {doc.filename}
                </p>

                {/* Status / Classification */}
                <div className="flex items-center gap-2 mt-1">
                  {doc.status === 'ready' ? (
                    <>
                      {/* Document type */}
                      {doc.predicted_doc_type && (
                        <Badge variant="secondary" className="text-xs">
                          {DOC_TYPE_LABELS[doc.predicted_doc_type] || doc.predicted_doc_type}
                        </Badge>
                      )}

                      {/* LOBs */}
                      {doc.lob_detected?.map((lob) => (
                        <Badge
                          key={lob}
                          className={cn('text-xs', LOB_COLORS[lob] || 'bg-gray-100 text-gray-700')}
                        >
                          {lob}
                        </Badge>
                      ))}
                    </>
                  ) : doc.status === 'error' ? (
                    <span className="text-xs text-red-600 truncate" title={doc.error_message || ''}>
                      {doc.error_message || 'Processing failed'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {getStatusLabel(doc.status)}
                    </span>
                  )}
                </div>

                {/* Stats for ready documents */}
                {doc.status === 'ready' && (
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{doc.page_count || 0} pages</span>
                    <span>{doc.evidence_count || 0} evidence items</span>
                    <span>{doc.chunk_count || 0} chunks</span>
                  </div>
                )}

                {/* Progress bar for processing */}
                {doc.status === 'processing' && (
                  <div className="mt-2">
                    <Progress value={30} className="h-1" />
                  </div>
                )}

                {/* Quality indicator */}
                {doc.status === 'ready' && doc.quality_score !== null && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 mt-2">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              getQualityColor(doc.quality_score)
                            )}
                          />
                          <span className="text-xs text-muted-foreground">
                            Quality: {Math.round((doc.quality_score || 0) * 100)}%
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>OCR confidence and evidence quality</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {doc.status === 'error' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryMutation.mutate(doc.id);
                          }}
                          disabled={retryMutation.isPending}
                        >
                          <RefreshCw className={cn('w-4 h-4', retryMutation.isPending && 'animate-spin')} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Retry processing</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {onDeleteDocument && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteDocument(doc.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove document</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* Carrier */}
            {doc.status === 'ready' && doc.carrier_detected && (
              <div className="mt-2 pl-7 text-xs text-muted-foreground">
                Carrier: {doc.carrier_detected}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

