/**
 * Document Viewer with BBox Highlighting
 * 
 * Features:
 * - PDF/image rendering
 * - Click citation -> highlight bbox region
 * - Page navigation
 * - Zoom controls
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Loader2,
  AlertCircle,
  MousePointerClick,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HighlightRegion {
  evidenceId: string;
  pageIndex: number;
  bbox: BBox;
  snippet?: string;
  label?: string;
}

interface Props {
  documentId?: string;
  storagePath?: string;
  storageBucket?: string;
  pageCount?: number;
  evidenceCatalog?: Array<{
    evidence_id: string;
    page_index: number;
    bbox?: BBox;
    snippet_text?: string;
    label?: string;
  }>;
  activeHighlight?: { evidenceId: string; pageIndex: number } | null;
  onHighlightClick?: (evidenceId: string, pageIndex: number) => void;
}

export function ExploreDocumentViewer({
  documentId,
  storagePath,
  storageBucket = 'documents',
  pageCount = 1,
  evidenceCatalog = [],
  activeHighlight,
  onHighlightClick,
}: Props) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Load document URL
  useEffect(() => {
    if (!storagePath) return;

    const loadDocument = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Clean storage path
        let cleanPath = storagePath;
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
        if (cleanPath.startsWith('documents/')) cleanPath = cleanPath.slice(10);

        const { data, error: signedUrlError } = await supabase.storage
          .from(storageBucket)
          .createSignedUrl(cleanPath, 3600); // 1 hour expiry

        if (signedUrlError) throw signedUrlError;
        setDocumentUrl(data.signedUrl);

        // For PDFs, we'd ideally render each page separately
        // For now, we'll use the signed URL directly
        setPageUrls([data.signedUrl]);
      } catch (err) {
        console.error('Failed to load document:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [storagePath, storageBucket]);

  // Scroll to highlighted region when activeHighlight changes
  useEffect(() => {
    if (!activeHighlight) return;

    // Navigate to the correct page
    if (activeHighlight.pageIndex !== currentPage) {
      setCurrentPage(activeHighlight.pageIndex);
    }

    // Scroll highlight into view after page change
    setTimeout(() => {
      const highlightEl = highlightRefs.current.get(activeHighlight.evidenceId);
      if (highlightEl) {
        highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [activeHighlight]);

  // Get highlights for current page
  const currentPageHighlights = evidenceCatalog.filter(
    (e) => e.page_index === currentPage && e.bbox
  );

  const goToPage = (page: number) => {
    if (page >= 0 && page < pageCount) {
      setCurrentPage(page);
    }
  };

  const handleZoomChange = (value: number[]) => {
    setZoom(value[0]);
  };

  const handleHighlightClick = useCallback(
    (evidenceId: string) => {
      if (onHighlightClick) {
        onHighlightClick(evidenceId, currentPage);
      }
    },
    [onHighlightClick, currentPage]
  );

  if (!storagePath) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground p-8">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a document to view</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header with controls */}
      <CardHeader className="flex-shrink-0 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm min-w-[80px] text-center">
              Page {currentPage + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= pageCount - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={50}
              max={200}
              step={10}
              onValueChange={handleZoomChange}
              className="w-24"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground min-w-[40px]">
              {zoom}%
            </span>
          </div>

          {currentPageHighlights.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <MousePointerClick className="h-3 w-3" />
              {currentPageHighlights.length} evidence items
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Document content */}
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div
            ref={containerRef}
            className="relative min-h-full flex items-start justify-center p-4"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-[600px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-[600px] text-destructive">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p className="text-sm">{error}</p>
              </div>
            ) : documentUrl ? (
              <div className="relative bg-white shadow-lg">
                {/* PDF rendering using embed/iframe for now */}
                {documentUrl.includes('.pdf') || storagePath?.endsWith('.pdf') ? (
                  <iframe
                    src={`${documentUrl}#page=${currentPage + 1}`}
                    className="w-[800px] h-[1000px] border-0"
                    title="Document viewer"
                  />
                ) : (
                  <img
                    src={documentUrl}
                    alt="Document page"
                    className="max-w-full"
                  />
                )}

                {/* Overlay for bbox highlights */}
                <div className="absolute inset-0 pointer-events-none">
                  {currentPageHighlights.map((evidence) => {
                    if (!evidence.bbox) return null;
                    const isActive = activeHighlight?.evidenceId === evidence.evidence_id;

                    return (
                      <div
                        key={evidence.evidence_id}
                        ref={(el) => {
                          if (el) {
                            highlightRefs.current.set(evidence.evidence_id, el);
                          }
                        }}
                        className={`absolute pointer-events-auto cursor-pointer transition-all ${
                          isActive
                            ? 'ring-4 ring-blue-500 bg-blue-500/30'
                            : 'bg-yellow-400/20 hover:bg-yellow-400/40'
                        }`}
                        style={{
                          left: `${evidence.bbox.x * 100}%`,
                          top: `${evidence.bbox.y * 100}%`,
                          width: `${evidence.bbox.w * 100}%`,
                          height: `${evidence.bbox.h * 100}%`,
                        }}
                        onClick={() => handleHighlightClick(evidence.evidence_id)}
                        title={evidence.snippet_text || evidence.label || evidence.evidence_id}
                      >
                        {isActive && evidence.snippet_text && (
                          <div className="absolute top-full left-0 mt-1 p-2 bg-white shadow-lg rounded border text-xs max-w-[300px] z-10">
                            {evidence.label && (
                              <span className="font-semibold text-blue-600 mr-1">
                                {evidence.label}:
                              </span>
                            )}
                            {evidence.snippet_text}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[600px] text-muted-foreground">
                <p>No preview available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Evidence list for current page */}
      {currentPageHighlights.length > 0 && (
        <div className="flex-shrink-0 border-t p-2 bg-muted/50">
          <ScrollArea className="max-h-24">
            <div className="flex gap-2 flex-wrap">
              {currentPageHighlights.map((evidence) => (
                <Badge
                  key={evidence.evidence_id}
                  variant={
                    activeHighlight?.evidenceId === evidence.evidence_id
                      ? 'default'
                      : 'outline'
                  }
                  className="cursor-pointer text-xs"
                  onClick={() => handleHighlightClick(evidence.evidence_id)}
                >
                  {evidence.label || evidence.evidence_id.slice(0, 8)}
                </Badge>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </Card>
  );
}


