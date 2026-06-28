// ============================================
// Document Import Modal for ACORD Forms
// Upload and extract data from insurance documents
// V2 with confidence tiers and document type selection
// ============================================

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
  X,
  Sparkles,
  Eye,
  FileSearch,
  ChevronDown,
  Brain,
  Target,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getSignedStorageUrl } from '@/lib/storageUrl';

const DOCUMENT_TYPES = [
  { value: 'dec_page', label: 'Declaration Page' },
  { value: 'prior_policy', label: 'Prior Policy' },
  { value: 'application', label: 'Application' },
  { value: 'certificate', label: 'Certificate of Insurance' },
  { value: 'loss_run', label: 'Loss Run Report' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'other', label: 'Other Document' },
];

// Field row component for the review list
function FieldRow({
  field,
  onToggle,
}: {
  field: { name: string; value: any; confidence: number; selected: boolean };
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg border ${
        field.selected ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Checkbox checked={field.selected} onCheckedChange={onToggle} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{field.name}</p>
          <p className="text-xs text-muted-foreground truncate">{String(field.value)}</p>
        </div>
      </div>
      <Badge variant="outline" className="text-xs ml-2 shrink-0">
        {Math.round(field.confidence * 100)}%
      </Badge>
    </div>
  );
}

interface DocumentImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  acordFormId: string;
  templateFormNumber?: string;
  onFieldsExtracted: (fields: Record<string, any>) => void;
}

type ExtractionStatus = 'idle' | 'uploading' | 'extracting' | 'reviewing' | 'error';

interface ExtractedField {
  name: string;
  value: any;
  confidence: number;
  selected: boolean;
  tier: 'high' | 'medium' | 'low';
}

interface ExtractionResult {
  confidenceTier: string;
  matchedTemplate: any;
  detectedCarrier: string;
  detectedLob: string;
  processingTimeMs: number;
}

export function DocumentImportModal({
  open,
  onOpenChange,
  accountId,
  acordFormId,
  templateFormNumber,
  onFieldsExtracted,
}: DocumentImportModalProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [documentType, setDocumentType] = useState<string>('');
  const [selectedDocType, setSelectedDocType] = useState<string>('dec_page');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({
    high: true,
    medium: true,
    low: true,
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a PDF or image file (PNG, JPEG, TIFF)',
          variant: 'destructive',
        });
        return;
      }

      // Validate file size (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Maximum file size is 20MB',
          variant: 'destructive',
        });
        return;
      }

      setSelectedFile(file);
      setStatus('idle');
      setErrorMessage(null);
      setExtractedFields([]);
    }
  }, [toast]);

  const handleExtract = async () => {
    if (!selectedFile) return;

    setStatus('uploading');
    setProgress(10);
    setErrorMessage(null);

    try {
      // Upload file to Supabase Storage
      const fileName = `extractions/${accountId}/${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      setProgress(30);
      setStatus('extracting');

      // Get signed URL
      const signedUrl = await getSignedStorageUrl('documents', fileName);

      // Call extraction edge function (v2 with ensemble)
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acord-document-extractor-v2`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            document_url: signedUrl,
            document_name: selectedFile.name,
            account_id: accountId,
            acord_form_id: acordFormId,
            target_form_number: templateFormNumber,
            document_type: selectedDocType,
            use_template_matching: true,
            use_ensemble: true,
            enable_learning: true,
          }),
        }
      );

      setProgress(70);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Extraction failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Extraction returned unsuccessful');
      }

      setProgress(100);

      // Categorize fields by confidence tier
      const getTier = (confidence: number): 'high' | 'medium' | 'low' => {
        if (confidence >= 0.9) return 'high';
        if (confidence >= 0.7) return 'medium';
        return 'low';
      };

      // Convert extracted fields to review format with tiers
      const fields: ExtractedField[] = Object.entries(result.extracted_fields || {}).map(
        ([name, value]) => {
          const confidence = result.confidence_scores?.[name] || 0.8;
          return {
            name,
            value,
            confidence,
            selected: confidence >= 0.7, // Auto-select high and medium confidence
            tier: getTier(confidence),
          };
        }
      );

      // Sort by confidence (highest first)
      fields.sort((a, b) => b.confidence - a.confidence);

      setExtractedFields(fields);
      setSuggestions(result.suggestions || []);
      setDocumentType(result.document_type || 'unknown');
      setExtractionResult({
        confidenceTier: result.confidence_tier,
        matchedTemplate: result.matched_template,
        detectedCarrier: result.detected_carrier,
        detectedLob: result.detected_lob,
        processingTimeMs: result.processing_time_ms,
      });
      setStatus('reviewing');

      const highCount = fields.filter(f => f.tier === 'high').length;
      const mediumCount = fields.filter(f => f.tier === 'medium').length;
      const lowCount = fields.filter(f => f.tier === 'low').length;

      toast({
        title: 'Extraction complete',
        description: `Found ${fields.length} fields: ${highCount} high, ${mediumCount} medium, ${lowCount} low confidence`,
      });

    } catch (error) {
      console.error('Extraction error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Extraction failed');
      toast({
        title: 'Extraction failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const toggleField = (fieldName: string) => {
    setExtractedFields(prev =>
      prev.map(f => f.name === fieldName ? { ...f, selected: !f.selected } : f)
    );
  };

  const selectAll = () => {
    setExtractedFields(prev => prev.map(f => ({ ...f, selected: true })));
  };

  const deselectAll = () => {
    setExtractedFields(prev => prev.map(f => ({ ...f, selected: false })));
  };

  const handleApply = () => {
    const selectedFields: Record<string, any> = {};
    extractedFields
      .filter(f => f.selected)
      .forEach(f => {
        selectedFields[f.name] = f.value;
      });

    onFieldsExtracted(selectedFields);
    onOpenChange(false);
    resetState();

    toast({
      title: 'Fields applied',
      description: `${Object.keys(selectedFields).length} fields imported to form`,
    });
  };

  const resetState = () => {
    setStatus('idle');
    setProgress(0);
    setErrorMessage(null);
    setSelectedFile(null);
    setExtractedFields([]);
    setSuggestions([]);
    setDocumentType('');
    setSelectedDocType('dec_page');
    setExtractionResult(null);
    setExpandedTiers({ high: true, medium: true, low: true });
  };

  const toggleTier = (tier: string) => {
    setExpandedTiers(prev => ({ ...prev, [tier]: !prev[tier] }));
  };

  const selectByTier = (tier: 'high' | 'medium' | 'low', select: boolean) => {
    setExtractedFields(prev =>
      prev.map(f => f.tier === tier ? { ...f, selected: select } : f)
    );
  };

  const getFieldsByTier = (tier: 'high' | 'medium' | 'low') => {
    return extractedFields.filter(f => f.tier === tier);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) return <Badge variant="default" className="bg-green-600">High</Badge>;
    if (confidence >= 0.7) return <Badge variant="secondary">Medium</Badge>;
    return <Badge variant="outline" className="text-yellow-600">Low</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Import from Document
          </DialogTitle>
          <DialogDescription>
            Upload a prior policy, dec page, or application to auto-fill the ACORD form
          </DialogDescription>
        </DialogHeader>

        {status === 'idle' && (
          <div className="space-y-4">
            {/* Document Type Selector */}
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                Selecting the correct type helps improve extraction accuracy
              </p>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff"
                onChange={handleFileSelect}
                className="hidden"
                id="document-upload"
              />
              <label htmlFor="document-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">
                  {selectedFile ? selectedFile.name : 'Drop a file or click to upload'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Supports PDF, PNG, JPEG, TIFF (max 20MB)
                </p>
              </label>
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                AI-Powered Multi-Model Extraction
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Multiple Azure DI models for comprehensive extraction</li>
                <li>• Claude AI for intelligent ACORD field mapping</li>
                <li>• Template matching for known carrier formats</li>
                <li>• Learning from your corrections to improve over time</li>
              </ul>
            </div>
          </div>
        )}

        {(status === 'uploading' || status === 'extracting') && (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium">
                {status === 'uploading' ? 'Uploading document...' : 'Extracting data with AI...'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                This may take 30-60 seconds for multi-page documents
              </p>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {status === 'error' && (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center">
              <AlertTriangle className="h-12 w-12 text-red-500" />
            </div>
            <div className="text-center">
              <p className="font-medium text-red-600">Extraction Failed</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
            </div>
            <div className="flex justify-center">
              <Button variant="outline" onClick={resetState}>Try Again</Button>
            </div>
          </div>
        )}

        {status === 'reviewing' && (
          <div className="space-y-4">
            {/* Summary Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium">
                  Found {extractedFields.length} fields
                </span>
                {documentType && (
                  <Badge variant="outline" className="capitalize">
                    {documentType.replace('_', ' ')}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>Deselect All</Button>
              </div>
            </div>

            {/* Extraction metadata */}
            {extractionResult && (
              <div className="flex flex-wrap gap-2 text-sm">
                {extractionResult.matchedTemplate && (
                  <Badge className="bg-purple-100 text-purple-800">
                    <Target className="h-3 w-3 mr-1" />
                    Template: {extractionResult.matchedTemplate.carrier}
                  </Badge>
                )}
                {extractionResult.detectedCarrier && (
                  <Badge variant="outline">
                    Carrier: {extractionResult.detectedCarrier}
                  </Badge>
                )}
                {extractionResult.detectedLob && (
                  <Badge variant="outline">
                    {extractionResult.detectedLob}
                  </Badge>
                )}
                {extractionResult.processingTimeMs && (
                  <Badge variant="secondary">
                    {(extractionResult.processingTimeMs / 1000).toFixed(1)}s
                  </Badge>
                )}
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Suggestions:</p>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  {suggestions.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}

            <ScrollArea className="h-72 border rounded-lg">
              <div className="p-2 space-y-2">
                {/* High Confidence Tier */}
                {getFieldsByTier('high').length > 0 && (
                  <Collapsible open={expandedTiers.high} onOpenChange={() => toggleTier('high')}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg bg-green-50 hover:bg-green-100">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-800">
                          High Confidence ({getFieldsByTier('high').length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={(e) => { e.stopPropagation(); selectByTier('high', true); }}
                        >
                          All
                        </Button>
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedTiers.high ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pt-1">
                      {getFieldsByTier('high').map(field => (
                        <FieldRow key={field.name} field={field} onToggle={() => toggleField(field.name)} />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Medium Confidence Tier */}
                {getFieldsByTier('medium').length > 0 && (
                  <Collapsible open={expandedTiers.medium} onOpenChange={() => toggleTier('medium')}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg bg-yellow-50 hover:bg-yellow-100">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="font-medium text-yellow-800">
                          Needs Review ({getFieldsByTier('medium').length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={(e) => { e.stopPropagation(); selectByTier('medium', true); }}
                        >
                          All
                        </Button>
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedTiers.medium ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pt-1">
                      {getFieldsByTier('medium').map(field => (
                        <FieldRow key={field.name} field={field} onToggle={() => toggleField(field.name)} />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Low Confidence Tier */}
                {getFieldsByTier('low').length > 0 && (
                  <Collapsible open={expandedTiers.low} onOpenChange={() => toggleTier('low')}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg bg-red-50 hover:bg-red-100">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="font-medium text-red-800">
                          Low Confidence ({getFieldsByTier('low').length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={(e) => { e.stopPropagation(); selectByTier('low', false); }}
                        >
                          None
                        </Button>
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedTiers.low ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pt-1">
                      {getFieldsByTier('low').map(field => (
                        <FieldRow key={field.name} field={field} onToggle={() => toggleField(field.name)} />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {extractedFields.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No fields were extracted from this document
                  </p>
                )}
              </div>
            </ScrollArea>

            {/* Learning notice */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Brain className="h-4 w-4" />
              <span>Your corrections help improve future extractions</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetState(); onOpenChange(false); }}>
            Cancel
          </Button>

          {status === 'idle' && (
            <Button onClick={handleExtract} disabled={!selectedFile}>
              <FileSearch className="h-4 w-4 mr-2" />
              Extract Data
            </Button>
          )}

          {status === 'reviewing' && (
            <Button
              onClick={handleApply}
              disabled={extractedFields.filter(f => f.selected).length === 0}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Apply {extractedFields.filter(f => f.selected).length} Fields
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
