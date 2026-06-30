/**
 * Rate Watch Detail Page
 * 
 * View and manage a rate watch job:
 * - Upload current policy, renewal, and quote documents
 * - View extraction results
 * - Run analysis and generate comparison
 * - Generate client email
 */

import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  Upload,
  FileText,
  Trash2,
  Play,
  Mail,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Copy,
  Edit3,
  Send,
  Clock,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useRateWatchJobWithDocuments,
  useUploadRateWatchDocument,
  useDeleteRateWatchDocument,
  useUpdateRateWatchJob,
  getRateWatchDocumentUrl,
  RateWatchDocument,
  RATE_WATCH_STATUS_CONFIG,
} from '@/hooks/useRateWatch';

export default function RateWatchDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { job, documents, isLoading, error, refetch } = useRateWatchJobWithDocuments(jobId || null);
  const uploadDocument = useUploadRateWatchDocument();
  const deleteDocument = useDeleteRateWatchDocument();
  const updateJob = useUpdateRateWatchJob();

  // File input refs
  const currentPolicyRef = useRef<HTMLInputElement>(null);
  const renewalRef = useRef<HTMLInputElement>(null);
  const quoteRef = useRef<HTMLInputElement>(null);

  // Quote carrier name for new quote uploads
  const [quoteCarrier, setQuoteCarrier] = useState('');
  const [carrierDialogOpen, setCarrierDialogOpen] = useState(false);
  const [pendingQuoteFile, setPendingQuoteFile] = useState<File | null>(null);

  // Email editing
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Document preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Group documents by type
  const currentPolicyDocs = documents.filter((d) => d.document_type === 'current_policy');
  const renewalDocs = documents.filter((d) => d.document_type === 'renewal');
  const quoteDocs = documents.filter((d) => d.document_type === 'quote');

  const handleFileUpload = async (
    file: File,
    documentType: 'current_policy' | 'renewal' | 'quote',
    carrierName?: string
  ) => {
    if (!jobId) return;

    await uploadDocument.mutateAsync({
      job_id: jobId,
      document_type: documentType,
      file,
      carrier_name: carrierName,
    });
  };

  const handleCurrentPolicyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'current_policy');
    e.target.value = '';
  };

  const handleRenewalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'renewal');
    e.target.value = '';
  };

  const handleQuoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingQuoteFile(file);
      setCarrierDialogOpen(true);
    }
    e.target.value = '';
  };

  const handleConfirmQuoteUpload = async () => {
    if (pendingQuoteFile && quoteCarrier.trim()) {
      await handleFileUpload(pendingQuoteFile, 'quote', quoteCarrier.trim());
      setPendingQuoteFile(null);
      setQuoteCarrier('');
      setCarrierDialogOpen(false);
    }
  };

  const handleDeleteDocument = async (doc: RateWatchDocument) => {
    await deleteDocument.mutateAsync({
      documentId: doc.id,
      filePath: doc.file_path,
      jobId: doc.job_id,
    });
  };

  const handlePreviewDocument = async (doc: RateWatchDocument) => {
    const url = await getRateWatchDocumentUrl(doc.file_path);
    if (url) {
      setPreviewUrl(url);
      setPreviewOpen(true);
    } else {
      toast({
        title: 'Error',
        description: 'Could not generate preview URL',
        variant: 'destructive',
      });
    }
  };

  const handleRunAnalysis = async () => {
    if (!jobId) return;
    
    // Update status to processing
    await updateJob.mutateAsync({
      jobId,
      updates: { status: 'processing' },
    });

    toast({
      title: 'Analysis Started',
      description: 'Processing documents and running comparison analysis...',
    });

    // TODO: Call edge function to process documents
  };

  const handleCopyEmail = () => {
    if (job?.email_body) {
      navigator.clipboard.writeText(job.email_body);
      toast({ title: 'Copied', description: 'Email copied to clipboard' });
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

  if (error || !job) {
    return (
      <AppLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error?.message || 'Job not found'}
            </AlertDescription>
          </Alert>
          <Button variant="ghost" className="mt-4" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </AppLayout>
    );
  }

  const statusConfig = RATE_WATCH_STATUS_CONFIG[job.status] || RATE_WATCH_STATUS_CONFIG.draft;
  const canRunAnalysis = currentPolicyDocs.length > 0 && renewalDocs.length > 0;
  const hasResults = job.status === 'completed' && job.comparison_result;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{job.job_name}</h1>
              <p className="text-muted-foreground">
                {job.accounts?.name || 'Unknown Customer'} • {job.line_of_business}
              </p>
            </div>
          </div>
          <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.label}
          </Badge>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Document Upload Sections */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Policy */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Current Policy
                </CardTitle>
                <CardDescription>
                  Upload the current in-force policy declaration page
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={currentPolicyRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleCurrentPolicyChange}
                />

                {currentPolicyDocs.length === 0 ? (
                  <Button
                    variant="outline"
                    className="w-full h-24 border-dashed"
                    onClick={() => currentPolicyRef.current?.click()}
                    disabled={uploadDocument.isPending}
                  >
                    {uploadDocument.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 mr-2" />
                        Upload Current Policy
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    {currentPolicyDocs.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        document={doc}
                        onPreview={() => handlePreviewDocument(doc)}
                        onDelete={() => handleDeleteDocument(doc)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Renewal Document */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-warning" />
                  Renewal Document
                </CardTitle>
                <CardDescription>
                  Upload the renewal declaration showing new premium
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={renewalRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleRenewalChange}
                />

                {renewalDocs.length === 0 ? (
                  <Button
                    variant="outline"
                    className="w-full h-24 border-dashed"
                    onClick={() => renewalRef.current?.click()}
                    disabled={uploadDocument.isPending}
                  >
                    {uploadDocument.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 mr-2" />
                        Upload Renewal Document
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    {renewalDocs.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        document={doc}
                        onPreview={() => handlePreviewDocument(doc)}
                        onDelete={() => handleDeleteDocument(doc)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alternative Quotes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-success" />
                  Alternative Quotes
                </CardTitle>
                <CardDescription>
                  Upload quotes from other carriers (optional but recommended)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={quoteRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleQuoteChange}
                />

                <div className="space-y-2">
                  {quoteDocs.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      document={doc}
                      onPreview={() => handlePreviewDocument(doc)}
                      onDelete={() => handleDeleteDocument(doc)}
                      showCarrier
                    />
                  ))}

                  <Button
                    variant="outline"
                    className="w-full h-16 border-dashed"
                    onClick={() => quoteRef.current?.click()}
                    disabled={uploadDocument.isPending}
                  >
                    {uploadDocument.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 mr-2" />
                        Add Quote from Another Carrier
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar - Actions & Results */}
          <div className="space-y-6">
            {/* Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full"
                  onClick={handleRunAnalysis}
                  disabled={!canRunAnalysis || updateJob.isPending || job.status === 'processing'}
                >
                  {job.status === 'processing' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Analysis
                    </>
                  )}
                </Button>

                {!canRunAnalysis && (
                  <p className="text-xs text-muted-foreground text-center">
                    Upload current policy and renewal to run analysis
                  </p>
                )}

                {hasResults && (
                  <>
                    <Separator />
                    <Button variant="outline" className="w-full" onClick={handleCopyEmail}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Email Draft
                    </Button>
                    <Button variant="outline" className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Download Report
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Premium Comparison (if available) */}
            {(job.current_premium || job.renewal_premium) && (
              <Card>
                <CardHeader>
                  <CardTitle>Premium Comparison</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Current</span>
                    <span className="font-mono font-semibold">
                      ${job.current_premium?.toLocaleString() || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Renewal</span>
                    <span className="font-mono font-semibold">
                      ${job.renewal_premium?.toLocaleString() || '—'}
                    </span>
                  </div>
                  {job.premium_change_pct !== null && (
                    <>
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Change</span>
                        <span
                          className={`font-mono font-semibold flex items-center gap-1 ${
                            job.premium_change_pct > 0
                              ? 'text-destructive'
                              : job.premium_change_pct < 0
                              ? 'text-success'
                              : ''
                          }`}
                        >
                          {job.premium_change_pct > 0 ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : job.premium_change_pct < 0 ? (
                            <TrendingDown className="h-4 w-4" />
                          ) : (
                            <Minus className="h-4 w-4" />
                          )}
                          {job.premium_change_pct > 0 ? '+' : ''}
                          {job.premium_change_pct}%
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recommendation (if available) */}
            {job.recommendation && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Recommendation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{job.recommendation}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Carrier Name Dialog for Quotes */}
        <Dialog open={carrierDialogOpen} onOpenChange={setCarrierDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Carrier Name</DialogTitle>
              <DialogDescription>
                What insurance carrier is this quote from?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="carrierName">Carrier Name</Label>
              <Input
                id="carrierName"
                placeholder="e.g., Progressive, GEICO, Nationwide..."
                value={quoteCarrier}
                onChange={(e) => setQuoteCarrier(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quoteCarrier.trim()) {
                    handleConfirmQuoteUpload();
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCarrierDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmQuoteUpload}
                disabled={!quoteCarrier.trim() || uploadDocument.isPending}
              >
                {uploadDocument.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Upload'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Document Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle>Document Preview</DialogTitle>
            </DialogHeader>
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full rounded-md border"
                title="Document Preview"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

// =============================================================================
// DOCUMENT ROW COMPONENT
// =============================================================================

interface DocumentRowProps {
  document: RateWatchDocument;
  onPreview: () => void;
  onDelete: () => void;
  showCarrier?: boolean;
}

function DocumentRow({ document, onPreview, onDelete, showCarrier }: DocumentRowProps) {
  const extractionStatusConfig: Record<string, { icon: React.ElementType; color: string }> = {
    pending: { icon: Clock, color: 'text-cc-text-muted' },
    processing: { icon: Loader2, color: 'text-info' },
    completed: { icon: CheckCircle2, color: 'text-success' },
    failed: { icon: AlertTriangle, color: 'text-destructive' },
  };

  const status = extractionStatusConfig[document.extraction_status] || extractionStatusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{document.file_name}</span>
            {showCarrier && document.carrier_name && (
              <Badge variant="secondary" className="text-xs">
                {document.carrier_name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusIcon className={`h-3 w-3 ${status.color} ${document.extraction_status === 'processing' ? 'animate-spin' : ''}`} />
            <span className="capitalize">{document.extraction_status}</span>
            {document.extracted_premium && (
              <span>• ${document.extracted_premium.toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onPreview}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}


