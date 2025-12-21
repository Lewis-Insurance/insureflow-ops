import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Save,
  Loader2,
  FileText,
  Brain,
  Edit2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sparkles,
  Info,
  RefreshCw,
  Target,
  MousePointer,
  Crosshair,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ExtractionDetail {
  id: string;
  document_url: string;
  document_name: string;
  document_type: string;
  page_count: number;
  status: string;
  confidence_tier: string;
  review_status: string;
  extracted_fields: Record<string, any>;
  claude_confidence_scores: Record<string, number>;
  auto_applied_fields: string[];
  needs_review_fields: string[];
  flagged_fields: string[];
  claude_suggestions: string[];
  azure_text_content: string;
  account_id: string;
  acord_form_id: string;
  created_at: string;
}

interface Evidence {
  id: string;
  page_index: number;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  snippet_text: string;
  extraction_method: string;
  ocr_confidence: number;
}

interface FieldCandidate {
  id: string;
  acord_field_name: string;
  raw_value: string;
  normalized_value: string;
  score_overall: number;
  rank: number;
  is_selected: boolean;
  evidence_ids: string[];
}

interface FieldOutput {
  id: string;
  field_name: string;
  raw_value: string | null;
  normalized_value: string | null;
  status: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'NEEDS_VERIFICATION' | 'NOT_FOUND' | 'CONFLICT';
  confidence_raw: number;
  confidence_calibrated: number;
  evidence_ids: string[];
  candidate_ids: string[];
  conflict_reason?: string;
  validations: any[];
}

interface ReviewQueueItem {
  id: string;
  field_output_id: string;
  review_type: 'quick_confirm' | 'select_candidate' | 'resolve_conflict' | 'manual_entry' | 'verify_low_conf';
  question_text: string;
  choices?: any[];
  highlight_page_index?: number;
  highlight_bbox?: { x: number; y: number; width: number; height: number };
}

interface FieldCorrection {
  field: string;
  originalValue: string;
  correctedValue: string;
  errorType?: string;
}

export default function ExtractionReviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const documentContainerRef = useRef<HTMLDivElement>(null);

  const [extraction, setExtraction] = useState<ExtractionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Field editing state
  const [editedFields, setEditedFields] = useState<Record<string, any>>({});
  const [corrections, setCorrections] = useState<FieldCorrection[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  // Evidence and candidates state
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [fieldOutputs, setFieldOutputs] = useState<FieldOutput[]>([]);
  const [candidates, setCandidates] = useState<FieldCandidate[]>([]);
  const [reviewQueueItems, setReviewQueueItems] = useState<ReviewQueueItem[]>([]);

  // Highlight state
  const [highlightedEvidence, setHighlightedEvidence] = useState<Evidence | null>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  // Document viewer state
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentImageUrls, setDocumentImageUrls] = useState<string[]>([]);

  // Candidate selection dialog
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [candidateDialogField, setCandidateDialogField] = useState<string | null>(null);

  // Error type dialog for corrections
  const [errorTypeDialogOpen, setErrorTypeDialogOpen] = useState(false);
  const [pendingCorrection, setPendingCorrection] = useState<FieldCorrection | null>(null);

  useEffect(() => {
    if (id) {
      loadExtraction(id);
    }
  }, [id]);

  const loadExtraction = async (extractionId: string) => {
    setIsLoading(true);
    try {
      // Load main extraction
      const { data, error } = await supabase
        .from('document_extractions')
        .select('*')
        .eq('id', extractionId)
        .single();

      if (error) throw error;

      setExtraction(data);
      setEditedFields(data.extracted_fields || {});

      // Auto-select high-confidence fields
      const autoSelected = new Set<string>(data.auto_applied_fields || []);
      setSelectedFields(autoSelected);

      // Load evidence for this extraction
      const { data: evidenceData } = await supabase
        .from('extraction_evidence')
        .select('*')
        .eq('extraction_id', extractionId);
      if (evidenceData) setEvidence(evidenceData);

      // Load field outputs
      const { data: fieldOutputData } = await supabase
        .from('acord_field_outputs')
        .select('*')
        .eq('extraction_id', extractionId);
      if (fieldOutputData) setFieldOutputs(fieldOutputData);

      // Load candidates
      const { data: candidateData } = await supabase
        .from('field_candidates')
        .select('*')
        .eq('extraction_id', extractionId)
        .order('rank', { ascending: true });
      if (candidateData) setCandidates(candidateData);

      // Load review queue items
      const { data: reviewData } = await supabase
        .from('review_queue_items')
        .select('*')
        .eq('extraction_id', extractionId)
        .eq('queue_status', 'pending')
        .order('priority_score', { ascending: false });
      if (reviewData) setReviewQueueItems(reviewData);

      // Get signed URL for document
      if (data.document_url) {
        if (data.document_url.includes('supabase') && data.document_url.includes('/storage/')) {
          const urlParts = data.document_url.split('/documents/');
          if (urlParts.length === 2) {
            const storagePath = urlParts[1];
            const { data: signedUrlData } = await supabase.storage
              .from('documents')
              .createSignedUrl(storagePath, 3600);
            if (signedUrlData) {
              setDocumentUrl(signedUrlData.signedUrl);
            }
          }
        } else {
          setDocumentUrl(data.document_url);
        }
      }

      // Log document access for audit
      await supabase.rpc('log_document_access', {
        p_extraction_id: extractionId,
        p_access_type: 'view',
        p_fields_accessed: Object.keys(data.extracted_fields || {}),
      }).catch(() => {}); // Silently fail if function doesn't exist
    } catch (error: any) {
      toast({
        title: 'Error loading extraction',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get evidence for a specific field
  const getFieldEvidence = (fieldName: string): Evidence[] => {
    const fieldOutput = fieldOutputs.find(fo => fo.field_name === fieldName);
    if (!fieldOutput?.evidence_ids?.length) return [];
    return evidence.filter(e => fieldOutput.evidence_ids.includes(e.id));
  };

  // Get candidates for a specific field
  const getFieldCandidates = (fieldName: string): FieldCandidate[] => {
    return candidates.filter(c => c.acord_field_name === fieldName);
  };

  // Handle clicking on a field to highlight its source
  const handleFieldClick = (fieldName: string) => {
    const fieldEvid = getFieldEvidence(fieldName);
    if (fieldEvid.length > 0) {
      const primaryEvidence = fieldEvid[0];
      setHighlightedEvidence(primaryEvidence);

      // Navigate to the correct page
      if (primaryEvidence.page_index !== undefined) {
        setCurrentPage(primaryEvidence.page_index + 1);
      }
    }
  };

  // Request reprocessing for a specific field
  const handleReprocessField = async (fieldName: string) => {
    if (!extraction) return;
    setIsReprocessing(true);

    try {
      await supabase.from('reprocessing_queue').insert({
        extraction_id: extraction.id,
        reprocess_type: 'field_candidates',
        target_field_names: [fieldName],
        trigger_reason: 'user_request',
        status: 'queued',
      });

      toast({
        title: 'Reprocessing queued',
        description: `Field "${fieldName}" has been queued for reprocessing`,
      });
    } catch (error: any) {
      toast({
        title: 'Error queuing reprocess',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  // Open candidate selection dialog
  const handleSelectCandidate = (fieldName: string) => {
    setCandidateDialogField(fieldName);
    setCandidateDialogOpen(true);
  };

  // Apply selected candidate
  const handleApplyCandidate = (candidateId: string) => {
    if (!candidateDialogField) return;

    const candidate = candidates.find(c => c.id === candidateId);
    if (candidate) {
      handleFieldChange(candidateDialogField, candidate.normalized_value || candidate.raw_value);
    }
    setCandidateDialogOpen(false);
    setCandidateDialogField(null);
  };

  const handleFieldChange = (field: string, value: string) => {
    const originalValue = extraction?.extracted_fields[field] || '';

    setEditedFields(prev => ({ ...prev, [field]: value }));

    // Track correction if value changed
    if (value !== originalValue) {
      // Store pending correction and prompt for error type
      const correction: FieldCorrection = { field, originalValue, correctedValue: value };

      // Check if this is a significant change that needs error type classification
      const significantChange = originalValue && value && originalValue !== value;

      if (significantChange) {
        setPendingCorrection(correction);
        setErrorTypeDialogOpen(true);
      } else {
        // For minor changes or new entries, just add the correction
        setCorrections(prev => {
          const existing = prev.findIndex(c => c.field === field);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = correction;
            return updated;
          }
          return [...prev, correction];
        });
      }
    } else {
      // Remove from corrections if reverted
      setCorrections(prev => prev.filter(c => c.field !== field));
    }
  };

  const handleErrorTypeSelect = (errorType: string) => {
    if (pendingCorrection) {
      const correctionWithType = { ...pendingCorrection, errorType };
      setCorrections(prev => {
        const existing = prev.findIndex(c => c.field === pendingCorrection.field);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = correctionWithType;
          return updated;
        }
        return [...prev, correctionWithType];
      });
    }
    setErrorTypeDialogOpen(false);
    setPendingCorrection(null);
  };

  const handleFieldSelect = (field: string, checked: boolean) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(field);
      } else {
        next.delete(field);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFields(new Set(Object.keys(editedFields)));
    } else {
      setSelectedFields(new Set());
    }
  };

  const handleRevertField = (field: string) => {
    const originalValue = extraction?.extracted_fields[field] || '';
    setEditedFields(prev => ({ ...prev, [field]: originalValue }));
    setCorrections(prev => prev.filter(c => c.field !== field));
  };

  const handleApprove = async () => {
    if (!extraction) return;
    setIsSaving(true);

    try {
      // Record corrections for learning (with error types)
      for (const correction of corrections) {
        // Get text context for this field
        const textContent = extraction.azure_text_content || '';
        const valueIndex = textContent.indexOf(correction.originalValue);
        const contextStart = Math.max(0, valueIndex - 50);
        const contextEnd = Math.min(textContent.length, valueIndex + correction.originalValue.length + 50);
        const sourceSnippet = textContent.substring(contextStart, contextEnd);

        // Get evidence bbox if available for learning
        const fieldEvid = getFieldEvidence(correction.field);
        const highlightBbox = fieldEvid.length > 0 ? {
          x: fieldEvid[0].bbox_x,
          y: fieldEvid[0].bbox_y,
          width: fieldEvid[0].bbox_width,
          height: fieldEvid[0].bbox_height,
        } : null;

        // Use enhanced correction recording if available
        try {
          await supabase.from('extraction_corrections').insert({
            extraction_id: extraction.id,
            field_name: correction.field,
            original_value: correction.originalValue,
            corrected_value: correction.correctedValue,
            source_snippet: sourceSnippet,
            document_type: extraction.document_type,
            error_type: correction.errorType || 'WRONG_CANDIDATE',
            user_highlighted_bbox: highlightBbox,
            model_versions: {
              ocr: 'azure-di-2023-07-31',
              llm: 'claude-3-5-sonnet',
              scoring: '1.0',
            },
          });
        } catch {
          // Fall back to RPC if direct insert fails
          await supabase.rpc('record_extraction_correction', {
            p_extraction_id: extraction.id,
            p_field_name: correction.field,
            p_original_value: correction.originalValue,
            p_corrected_value: correction.correctedValue,
            p_source_snippet: sourceSnippet,
            p_document_type: extraction.document_type,
            p_carrier_name: null,
          });
        }
      }

      // Update extraction with corrections and approval
      await supabase
        .from('document_extractions')
        .update({
          extracted_fields: editedFields,
          user_corrections: corrections.length > 0 ? corrections : null,
          review_status: 'approved',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', extraction.id);

      // If linked to an ACORD form, apply selected fields
      if (extraction.acord_form_id && selectedFields.size > 0) {
        const fieldsToApply: Record<string, any> = {};
        for (const field of selectedFields) {
          fieldsToApply[field] = editedFields[field];
        }

        // Get current form values
        const { data: formData } = await supabase
          .from('acord_forms')
          .select('field_values')
          .eq('id', extraction.acord_form_id)
          .single();

        if (formData) {
          const updatedValues = {
            ...formData.field_values,
            ...fieldsToApply,
          };

          await supabase
            .from('acord_forms')
            .update({ field_values: updatedValues })
            .eq('id', extraction.acord_form_id);
        }
      }

      toast({
        title: 'Extraction approved',
        description: corrections.length > 0
          ? `${corrections.length} correction(s) recorded for learning`
          : 'All fields approved as-is',
      });

      navigate('/extraction-review');
    } catch (error: any) {
      toast({
        title: 'Error approving extraction',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = async () => {
    if (!extraction) return;

    try {
      await supabase
        .from('document_extractions')
        .update({
          review_status: 'rejected',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', extraction.id);

      toast({ title: 'Extraction rejected' });
      navigate('/extraction-review');
    } catch (error: any) {
      toast({
        title: 'Error rejecting extraction',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600 bg-green-50';
    if (confidence >= 0.7) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getFieldStatus = (field: string) => {
    if (extraction?.flagged_fields?.includes(field)) return 'flagged';
    if (extraction?.needs_review_fields?.includes(field)) return 'review';
    if (extraction?.auto_applied_fields?.includes(field)) return 'auto';
    return 'normal';
  };

  const getFieldIcon = (status: string) => {
    switch (status) {
      case 'auto':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'review':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'flagged':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!extraction) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Extraction not found</h2>
          <Button onClick={() => navigate('/extraction-review')} className="mt-4">
            Back to Queue
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/extraction-review')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {extraction.document_name}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{extraction.document_type?.replace('_', ' ')}</Badge>
                <span>•</span>
                <span>{extraction.page_count || 1} page(s)</span>
                {corrections.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-blue-600">
                      <Brain className="h-3 w-3 inline mr-1" />
                      {corrections.length} correction(s)
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleReject}
              className="text-red-600"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button onClick={handleApprove} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve {selectedFields.size > 0 && `(${selectedFields.size} fields)`}
            </Button>
          </div>
        </div>

        {/* Suggestions Banner */}
        {extraction.claude_suggestions && extraction.claude_suggestions.length > 0 && (
          <Card className="mb-4 border-blue-200 bg-blue-50">
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">AI Suggestions</p>
                  <ul className="text-sm text-blue-800 mt-1 space-y-1">
                    {extraction.claude_suggestions.map((suggestion, i) => (
                      <li key={i}>• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Resizable Panels */}
        <ResizablePanelGroup direction="horizontal" className="flex-1 border rounded-lg">
          {/* Document Viewer */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-3 border-b bg-gray-50">
                <span className="font-medium text-sm">Document Preview</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  {(extraction.page_count || 1) > 1 && (
                    <>
                      <Separator orientation="vertical" className="h-6" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage(currentPage - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        {currentPage} / {extraction.page_count}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={currentPage >= (extraction.page_count || 1)}
                        onClick={() => setCurrentPage(currentPage + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <ScrollArea className="flex-1 p-4 bg-gray-100">
                {documentUrl ? (
                  <div
                    ref={documentContainerRef}
                    className="mx-auto bg-white shadow-lg relative"
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top center',
                    }}
                  >
                    {documentUrl.endsWith('.pdf') ? (
                      <iframe
                        src={`${documentUrl}#page=${currentPage}`}
                        className="w-full h-[800px]"
                        title="Document Preview"
                      />
                    ) : (
                      <img
                        src={documentUrl}
                        alt="Document"
                        className="max-w-full"
                      />
                    )}

                    {/* Bbox overlays for evidence highlighting */}
                    {evidence
                      .filter(e => e.page_index === currentPage - 1)
                      .map((evid) => {
                        const isHighlighted = highlightedEvidence?.id === evid.id;
                        const isHovered = hoveredField &&
                          getFieldEvidence(hoveredField).some(e => e.id === evid.id);

                        return (
                          <div
                            key={evid.id}
                            className={`absolute pointer-events-none transition-all duration-200 ${
                              isHighlighted
                                ? 'bg-yellow-400/40 border-2 border-yellow-500 ring-2 ring-yellow-300'
                                : isHovered
                                  ? 'bg-blue-400/30 border border-blue-500'
                                  : 'bg-transparent border border-transparent hover:bg-gray-200/20'
                            }`}
                            style={{
                              left: `${evid.bbox_x}%`,
                              top: `${evid.bbox_y}%`,
                              width: `${evid.bbox_width}%`,
                              height: `${evid.bbox_height}%`,
                            }}
                          >
                            {isHighlighted && (
                              <div className="absolute -top-6 left-0 bg-yellow-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                                <Target className="h-3 w-3 inline mr-1" />
                                {evid.snippet_text.substring(0, 30)}...
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {/* Highlight indicator */}
                    {highlightedEvidence && highlightedEvidence.page_index === currentPage - 1 && (
                      <div className="absolute top-2 right-2 bg-yellow-100 border border-yellow-300 rounded px-2 py-1 text-xs flex items-center gap-1">
                        <Crosshair className="h-3 w-3 text-yellow-600" />
                        <span>Source highlighted</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1"
                          onClick={() => setHighlightedEvidence(null)}
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <FileText className="h-12 w-12 mx-auto mb-2" />
                      <p>Document preview not available</p>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Extracted Fields */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-3 border-b bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Extracted Fields</span>
                  <Badge variant="secondary">{Object.keys(editedFields).length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedFields.size === Object.keys(editedFields).length}
                    onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                  />
                  <Label htmlFor="select-all" className="text-sm">
                    Select all
                  </Label>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {/* Group by confidence tier */}
                  {['auto', 'review', 'flagged', 'normal'].map(tier => {
                    const fields = Object.entries(editedFields).filter(
                      ([field]) => getFieldStatus(field) === tier
                    );

                    if (fields.length === 0) return null;

                    return (
                      <div key={tier}>
                        <div className="flex items-center gap-2 mb-2">
                          {tier === 'auto' && (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium text-green-700">
                                High Confidence (Auto-Apply)
                              </span>
                            </>
                          )}
                          {tier === 'review' && (
                            <>
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              <span className="text-sm font-medium text-yellow-700">
                                Needs Review
                              </span>
                            </>
                          )}
                          {tier === 'flagged' && (
                            <>
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span className="text-sm font-medium text-red-700">
                                Low Confidence (Flagged)
                              </span>
                            </>
                          )}
                          {tier === 'normal' && (
                            <span className="text-sm font-medium text-muted-foreground">
                              Other Fields
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {fields.map(([field, value]) => {
                            const confidence = extraction.claude_confidence_scores?.[field] || 0;
                            const isEdited = corrections.some(c => c.field === field);
                            const fieldEvid = getFieldEvidence(field);
                            const fieldCands = getFieldCandidates(field);
                            const hasEvidence = fieldEvid.length > 0;
                            const hasMultipleCandidates = fieldCands.length > 1;
                            const isLowConfidence = confidence < 0.7;

                            return (
                              <Card
                                key={field}
                                className={`cursor-pointer transition-all ${
                                  isEdited ? 'border-blue-300 bg-blue-50' : ''
                                } ${
                                  selectedFields.has(field) ? 'ring-2 ring-primary' : ''
                                } ${
                                  hoveredField === field ? 'shadow-md border-blue-200' : ''
                                }`}
                                onMouseEnter={() => setHoveredField(field)}
                                onMouseLeave={() => setHoveredField(null)}
                                onClick={() => hasEvidence && handleFieldClick(field)}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start gap-3">
                                    <Checkbox
                                      checked={selectedFields.has(field)}
                                      onCheckedChange={(checked) =>
                                        handleFieldSelect(field, checked as boolean)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-1"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                          <Label className="text-sm font-medium">
                                            {field}
                                          </Label>
                                          {hasEvidence && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <MousePointer className="h-3 w-3 text-blue-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  Click to highlight source in document
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          {/* Reprocess button for low confidence */}
                                          {isLowConfidence && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-orange-500"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleReprocessField(field);
                                                    }}
                                                    disabled={isReprocessing}
                                                  >
                                                    <RefreshCw className={`h-3 w-3 ${isReprocessing ? 'animate-spin' : ''}`} />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  Reprocess this field
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}

                                          {/* Candidate selector for multiple options */}
                                          {hasMultipleCandidates && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-purple-500"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleSelectCandidate(field);
                                                    }}
                                                  >
                                                    <Target className="h-3 w-3" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  {fieldCands.length} candidates available
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}

                                          {isEdited && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleRevertField(field);
                                                    }}
                                                  >
                                                    <RotateCcw className="h-3 w-3" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  Revert to original
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                          <Badge
                                            className={`text-xs ${getConfidenceColor(confidence)}`}
                                          >
                                            {Math.round(confidence * 100)}%
                                          </Badge>
                                        </div>
                                      </div>
                                      <Input
                                        value={editedFields[field] || ''}
                                        onChange={(e) =>
                                          handleFieldChange(field, e.target.value)
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm"
                                      />

                                      {/* Evidence snippet */}
                                      {hasEvidence && (
                                        <p className="text-xs text-gray-500 mt-1 truncate">
                                          <span className="text-gray-400">Source: </span>
                                          "{fieldEvid[0].snippet_text.substring(0, 50)}..."
                                        </p>
                                      )}

                                      {isEdited && (
                                        <p className="text-xs text-blue-600 mt-1">
                                          Original: "{extraction.extracted_fields[field]}"
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Action Footer */}
              <div className="p-3 border-t bg-gray-50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {selectedFields.size} of {Object.keys(editedFields).length} fields selected
                  </span>
                  {corrections.length > 0 && (
                    <span className="text-blue-600 flex items-center gap-1">
                      <Brain className="h-4 w-4" />
                      {corrections.length} correction(s) will improve future extractions
                    </span>
                  )}
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Error Type Selection Dialog */}
        <Dialog open={errorTypeDialogOpen} onOpenChange={setErrorTypeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>What type of error was this?</DialogTitle>
              <DialogDescription>
                Help us improve by categorizing the correction. This helps train the system.
              </DialogDescription>
            </DialogHeader>
            {pendingCorrection && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                <p><strong>Field:</strong> {pendingCorrection.field}</p>
                <p><strong>Original:</strong> "{pendingCorrection.originalValue}"</p>
                <p><strong>Corrected:</strong> "{pendingCorrection.correctedValue}"</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleErrorTypeSelect('OCR_ERROR')}
              >
                <XCircle className="h-4 w-4 mr-2 text-red-500" />
                OCR Misread
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleErrorTypeSelect('WRONG_CANDIDATE')}
              >
                <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                Wrong Selection
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleErrorTypeSelect('MISSING_FIELD')}
              >
                <Eye className="h-4 w-4 mr-2 text-blue-500" />
                Field Not Found
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleErrorTypeSelect('FALSE_POSITIVE')}
              >
                <Info className="h-4 w-4 mr-2 text-orange-500" />
                Shouldn't Exist
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleErrorTypeSelect('NORMALIZATION')}
              >
                <Edit2 className="h-4 w-4 mr-2 text-purple-500" />
                Format Issue
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleErrorTypeSelect('VALIDATION')}
              >
                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                Validation Error
              </Button>
            </div>
            <DialogFooter className="mt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setErrorTypeDialogOpen(false);
                  // Add correction without error type
                  if (pendingCorrection) {
                    setCorrections(prev => [...prev, pendingCorrection]);
                  }
                  setPendingCorrection(null);
                }}
              >
                Skip Classification
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Candidate Selection Dialog */}
        <Dialog open={candidateDialogOpen} onOpenChange={setCandidateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Select Value for {candidateDialogField}</DialogTitle>
              <DialogDescription>
                Multiple candidates were found. Select the correct value.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {candidateDialogField && getFieldCandidates(candidateDialogField).map((candidate) => (
                <Card
                  key={candidate.id}
                  className={`cursor-pointer hover:border-primary transition-all ${
                    candidate.is_selected ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => handleApplyCandidate(candidate.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {candidate.normalized_value || candidate.raw_value}
                        </p>
                        {candidate.normalized_value !== candidate.raw_value && (
                          <p className="text-xs text-muted-foreground">
                            Raw: "{candidate.raw_value}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Rank #{candidate.rank}
                        </Badge>
                        <Badge
                          className={`text-xs ${getConfidenceColor(candidate.score_overall)}`}
                        >
                          {Math.round(candidate.score_overall * 100)}%
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCandidateDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
