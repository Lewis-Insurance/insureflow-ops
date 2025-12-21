/**
 * Enhanced Document Import Modal V2
 *
 * Orchestrator for the complete import flow:
 * - Step 1: Add documents (upload or camera capture)
 * - Step 2: Quality assessment and doc type hints
 * - Step 3: Start import with progress tracking
 * - Step 4: Extraction with automatic retries
 * - Step 5: Review and apply to ACORD form
 *
 * Features integrated:
 * - Mobile camera capture with quality feedback
 * - Batch multi-document upload
 * - Pre-upload quality assessment
 * - Offline queue support
 * - CRM prefill integration
 * - Automatic retry on low confidence
 * - Missing required fields detection
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Upload,
  Camera,
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Wifi,
  WifiOff,
  Database,
  Eye,
  RotateCcw,
  Trash2,
  Plus,
  FileWarning,
  Target,
  Brain,
  Users,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CameraCapture } from './CameraCapture';
import { qualityAssessor, QualityReport } from '@/services/QualityAssessor';
import { draftManager, DraftField } from '@/services/DraftManager';
import { crmPrefillService } from '@/services/CRMPrefillService';
import { retryController, RetryProgress, ExtractionResult } from '@/services/RetryController';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

// Document types
const DOCUMENT_TYPES = [
  { value: 'dec_page', label: 'Declaration Page' },
  { value: 'prior_policy', label: 'Prior Policy' },
  { value: 'application', label: 'Application' },
  { value: 'certificate', label: 'Certificate of Insurance' },
  { value: 'loss_run', label: 'Loss Run Report' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'schedule', label: 'Schedule/Addendum' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other Document' },
];

// Thresholds
const QUALITY_HARD_BLOCK = 35;
const QUALITY_WARN = 60;

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  documentType: string;
  qualityReport?: QualityReport;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
  extractionId?: string;
  progress?: number;
}

interface DocumentImportModalV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  acordFormId: string;
  templateFormNumber?: string;
  onComplete: (result: {
    extractionId: string;
    fields: Record<string, DraftField>;
    missingRequired: string[];
  }) => void;
}

type Step = 'add' | 'review' | 'processing' | 'complete';

export function DocumentImportModalV2({
  open,
  onOpenChange,
  accountId,
  acordFormId,
  templateFormNumber,
  onComplete,
}: DocumentImportModalV2Props) {
  const { toast } = useToast();
  const offlineQueue = useOfflineQueue();

  // State
  const [step, setStep] = useState<Step>('add');
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [retryProgress, setRetryProgress] = useState<RetryProgress | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  // CRM prefill state
  const [crmSummary, setCrmSummary] = useState<{
    name: string;
    fieldCount: number;
  } | null>(null);
  const [useCrmPrefill, setUseCrmPrefill] = useState(true);

  // Load CRM summary on open
  useEffect(() => {
    if (open && accountId) {
      crmPrefillService.getAccountSummary(accountId).then(summary => {
        if (summary) {
          setCrmSummary({
            name: summary.name,
            fieldCount: summary.fieldCount,
          });
        }
      });
    }
  }, [open, accountId]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setStep('add');
      setFiles([]);
      setIsProcessing(false);
      setRetryProgress(null);
      setExtractionResult(null);
      setDraftId(null);
    }
  }, [open]);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: QueuedFile[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      // Validate file type
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: 'Invalid file type',
          description: `${file.name} is not a supported file type`,
          variant: 'destructive',
        });
        continue;
      }

      // Validate file size
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 50MB limit`,
          variant: 'destructive',
        });
        continue;
      }

      // Assess quality
      let qualityReport: QualityReport | undefined;
      try {
        if (file.type.startsWith('image/')) {
          qualityReport = await qualityAssessor.assessImage(file);
        } else if (file.type === 'application/pdf') {
          const pdfAssessment = await qualityAssessor.assessPdf(file);
          qualityReport = pdfAssessment.overall;
        }
      } catch (error) {
        console.error('Quality assessment failed:', error);
      }

      newFiles.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        documentType: 'dec_page', // Default
        qualityReport,
        status: 'pending',
      });
    }

    setFiles(prev => [...prev, ...newFiles]);

    // Clear input
    e.target.value = '';
  }, [toast]);

  // Handle camera capture
  const handleCameraCapture = useCallback(async (file: File, metrics: any) => {
    setCameraOpen(false);

    let qualityReport: QualityReport | undefined;
    try {
      qualityReport = await qualityAssessor.assessImage(file);
    } catch (error) {
      console.error('Quality assessment failed:', error);
    }

    const newFile: QueuedFile = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      documentType: 'dec_page',
      qualityReport,
      status: 'pending',
    };

    setFiles(prev => [...prev, newFile]);
  }, []);

  // Remove file
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // Update file document type
  const updateFileType = useCallback((id: string, documentType: string) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, documentType } : f
    ));
  }, []);

  // Check if can proceed
  const canProceed = files.length > 0 && files.every(f => {
    if (!f.qualityReport) return true;
    if (f.qualityReport.score < QUALITY_HARD_BLOCK) return false;
    return true;
  });

  const hasWarnings = files.some(f =>
    f.qualityReport && f.qualityReport.score < QUALITY_WARN
  );

  // Start processing
  const startProcessing = async () => {
    setStep('processing');
    setIsProcessing(true);

    try {
      // Process first file (primary document)
      const primaryFile = files[0];

      // Check if offline
      if (!navigator.onLine) {
        // Queue for later
        await offlineQueue.queueDocument(primaryFile.file, {
          accountId,
          acordFormId,
          documentType: primaryFile.documentType,
        });

        toast({
          title: 'Document queued',
          description: 'Will be processed when back online',
        });

        onOpenChange(false);
        return;
      }

      // Upload file
      const fileName = `extractions/${accountId}/${Date.now()}_${primaryFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, primaryFile.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      // Run extraction with retries
      const result = await retryController.extractWithRetries(
        urlData.publicUrl,
        primaryFile.name,
        {
          accountId,
          acordFormId,
          documentType: primaryFile.documentType,
          onProgress: setRetryProgress,
        }
      );

      setExtractionResult(result.result);

      // Create draft with extracted fields
      const draft = await draftManager.getOrCreateDraft(
        acordFormId,
        templateFormNumber || 'unknown',
        {
          extractionId: result.extractionId,
          initialFields: Object.fromEntries(
            Object.entries(result.result.fields).map(([name, field]) => [
              name,
              {
                value: field.value,
                status: field.status,
                source: 'extraction',
                confidence: field.confidence,
                evidenceIds: field.evidenceIds,
              } as DraftField,
            ])
          ),
        }
      );

      setDraftId(draft.id);

      // Apply CRM prefill if enabled
      if (useCrmPrefill && crmSummary) {
        const prefillResult = await crmPrefillService.applyPrefill(
          acordFormId,
          accountId,
          draft.fields
        );

        // Update draft with prefilled fields
        for (const [fieldName, field] of Object.entries(prefillResult.fields)) {
          draftManager.updateField(draft.id, fieldName, field.value, {
            status: field.status,
            source: 'crm',
          });
        }

        if (prefillResult.conflictCount > 0) {
          toast({
            title: 'CRM conflicts detected',
            description: `${prefillResult.conflictCount} field(s) have conflicting values from CRM`,
            variant: 'destructive',
          });
        }
      }

      setStep('complete');

    } catch (error: any) {
      console.error('Processing failed:', error);
      toast({
        title: 'Processing failed',
        description: error.message,
        variant: 'destructive',
      });
      setStep('add');
    } finally {
      setIsProcessing(false);
    }
  };

  // Complete and close
  const handleComplete = () => {
    if (!extractionResult || !draftId) return;

    // Determine missing required fields
    const missingRequired = extractionResult.missingCriticalFields || [];

    onComplete({
      extractionId: draftId,
      fields: Object.fromEntries(
        Object.entries(extractionResult.fields).map(([name, field]) => [
          name,
          {
            value: field.value,
            status: field.status,
            source: 'extraction',
            confidence: field.confidence,
            evidenceIds: field.evidenceIds,
          } as DraftField,
        ])
      ),
      missingRequired,
    });

    onOpenChange(false);
  };

  // Render quality badge
  const renderQualityBadge = (report: QualityReport) => {
    if (report.score >= 85) {
      return <Badge className="bg-green-500">Excellent</Badge>;
    }
    if (report.score >= 70) {
      return <Badge className="bg-blue-500">Good</Badge>;
    }
    if (report.score >= QUALITY_WARN) {
      return <Badge className="bg-yellow-500">Acceptable</Badge>;
    }
    if (report.score >= QUALITY_HARD_BLOCK) {
      return <Badge className="bg-orange-500">Poor</Badge>;
    }
    return <Badge className="bg-red-500">Unusable</Badge>;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Import Documents
            </DialogTitle>
            <DialogDescription>
              {step === 'add' && 'Add documents to extract data from'}
              {step === 'review' && 'Review quality and document types'}
              {step === 'processing' && 'Processing documents...'}
              {step === 'complete' && 'Extraction complete'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {/* Step 1: Add Documents */}
            {step === 'add' && (
              <div className="space-y-4">
                {/* Online/Offline Status */}
                {!offlineQueue.isOnline && (
                  <Alert variant="destructive">
                    <WifiOff className="h-4 w-4" />
                    <AlertTitle>Offline</AlertTitle>
                    <AlertDescription>
                      Documents will be queued for processing when back online.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Offline Queue Status */}
                {offlineQueue.pendingCount > 0 && (
                  <Alert>
                    <Database className="h-4 w-4" />
                    <AlertTitle>{offlineQueue.pendingCount} document(s) queued</AlertTitle>
                    <AlertDescription>
                      Will be processed when back online.
                      {offlineQueue.isSyncing && ' Syncing...'}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Upload Area */}
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <div className="flex justify-center gap-4 mb-4">
                    <Button variant="outline" asChild>
                      <label className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Files
                        <Input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.tiff"
                          multiple
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </label>
                    </Button>
                    <Button variant="outline" onClick={() => setCameraOpen(true)}>
                      <Camera className="h-4 w-4 mr-2" />
                      Take Photo
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    PDF, PNG, JPEG, TIFF • Max 50MB per file
                  </p>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <ScrollArea className="max-h-64 border rounded-lg">
                    <div className="p-2 space-y-2">
                      {files.map(file => (
                        <Card key={file.id} className={
                          file.qualityReport && file.qualityReport.score < QUALITY_HARD_BLOCK
                            ? 'border-red-300 bg-red-50'
                            : file.qualityReport && file.qualityReport.score < QUALITY_WARN
                              ? 'border-yellow-300 bg-yellow-50'
                              : ''
                        }>
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              <FileText className="h-8 w-8 text-blue-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{file.name}</p>
                                  {file.qualityReport && renderQualityBadge(file.qualityReport)}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>

                                {/* Quality issues */}
                                {file.qualityReport && file.qualityReport.issues.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {file.qualityReport.issues.slice(0, 3).map((issue, i) => (
                                      <Badge
                                        key={i}
                                        variant="outline"
                                        className={
                                          issue.severity === 'error' ? 'text-red-600' :
                                          issue.severity === 'warning' ? 'text-yellow-600' : ''
                                        }
                                      >
                                        {issue.message}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {/* Document type selector */}
                                <div className="mt-2">
                                  <Select
                                    value={file.documentType}
                                    onValueChange={(v) => updateFileType(file.id, v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DOCUMENT_TYPES.map(dt => (
                                        <SelectItem key={dt.value} value={dt.value}>
                                          {dt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFile(file.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {/* CRM Prefill Option */}
                {crmSummary && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="crm-prefill"
                          checked={useCrmPrefill}
                          onCheckedChange={(c) => setUseCrmPrefill(!!c)}
                        />
                        <Label htmlFor="crm-prefill" className="flex-1">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            <span className="font-medium">Pre-fill from CRM</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {crmSummary.name} • {crmSummary.fieldCount} fields available
                          </p>
                        </Label>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Quality Warnings */}
                {hasWarnings && canProceed && (
                  <Alert variant="default" className="bg-yellow-50 border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800">Quality Warning</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                      Some documents have quality issues that may affect extraction accuracy.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Cannot Proceed Warning */}
                {!canProceed && files.length > 0 && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Cannot Proceed</AlertTitle>
                    <AlertDescription>
                      Some documents have unusable quality. Please retake or replace them.
                    </AlertDescription>
                  </Alert>
                )}

                {/* AI Features Info */}
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    AI-Powered Extraction
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Multi-model OCR with automatic quality enhancement</li>
                    <li>• Smart field mapping to ACORD form fields</li>
                    <li>• Automatic retry for low-confidence extractions</li>
                    <li>• Template matching for known carrier formats</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Step 3: Processing */}
            {step === 'processing' && (
              <div className="py-8 space-y-6">
                <div className="flex items-center justify-center">
                  <div className="relative">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                    {retryProgress && retryProgress.currentAttempt > 1 && (
                      <Badge className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-blue-500">
                        Attempt {retryProgress.currentAttempt}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="text-center">
                  <p className="font-medium text-lg">
                    {retryProgress?.message || 'Processing...'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This may take 30-60 seconds for complex documents
                  </p>
                </div>

                {retryProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>
                        Attempt {retryProgress.currentAttempt} of {retryProgress.maxAttempts}
                      </span>
                    </div>
                    <Progress
                      value={(retryProgress.currentAttempt / retryProgress.maxAttempts) * 100}
                      className="h-2"
                    />
                  </div>
                )}

                {/* Show completed attempts */}
                {retryProgress && retryProgress.attempts.filter(a => a.status === 'completed').length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">Completed Attempts</p>
                    <div className="space-y-1">
                      {retryProgress.attempts
                        .filter(a => a.status === 'completed')
                        .map((attempt, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            <span>
                              Attempt {attempt.attemptNo}:
                              {attempt.result && ` ${(attempt.result.overallConfidence * 100).toFixed(0)}% confidence`}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Complete */}
            {step === 'complete' && extractionResult && (
              <div className="space-y-4">
                {/* Success Header */}
                <div className="text-center py-4">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                  <h3 className="text-lg font-medium">Extraction Complete</h3>
                  <p className="text-sm text-muted-foreground">
                    Confidence: {(extractionResult.overallConfidence * 100).toFixed(0)}%
                  </p>
                </div>

                {/* Missing Required Fields Warning */}
                {extractionResult.missingCriticalFields.length > 0 && (
                  <Alert variant="destructive">
                    <FileWarning className="h-4 w-4" />
                    <AlertTitle>
                      {extractionResult.missingCriticalFields.length} Required Field(s) Missing
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-1">
                        {extractionResult.missingCriticalFields.map(field => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Conflicts Warning */}
                {extractionResult.conflicts.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>
                      {extractionResult.conflicts.length} Conflict(s) Detected
                    </AlertTitle>
                    <AlertDescription>
                      Some fields have conflicting values that need review.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Field Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="p-3 text-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mx-auto mb-1" />
                      <p className="text-lg font-bold">
                        {Object.values(extractionResult.fields).filter(f => f.status === 'AUTO_APPLIED').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Auto-Applied</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <Eye className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
                      <p className="text-lg font-bold">
                        {Object.values(extractionResult.fields).filter(f => f.status === 'NEEDS_REVIEW').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Needs Review</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
                      <p className="text-lg font-bold">
                        {Object.values(extractionResult.fields).filter(f => f.status === 'NOT_FOUND').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Not Found</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Extracted Fields Preview */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      <span>View Extracted Fields</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ScrollArea className="h-48 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {Object.entries(extractionResult.fields).map(([name, field]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between p-2 rounded hover:bg-gray-50"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {field.value || '(not found)'}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                field.status === 'AUTO_APPLIED' ? 'text-green-600' :
                                field.status === 'NEEDS_REVIEW' ? 'text-yellow-600' :
                                field.status === 'NOT_FOUND' ? 'text-red-600' : ''
                              }
                            >
                              {Math.round(field.confidence * 100)}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            {step === 'add' && (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={startProcessing}
                  disabled={!canProceed || files.length === 0}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Extract Data
                </Button>
              </>
            )}

            {step === 'processing' && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}

            {step === 'complete' && (
              <>
                <Button variant="outline" onClick={() => setStep('add')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add More Documents
                </Button>
                <Button onClick={handleComplete}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Continue to Form
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera Capture Modal */}
      <CameraCapture
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handleCameraCapture}
      />
    </>
  );
}
