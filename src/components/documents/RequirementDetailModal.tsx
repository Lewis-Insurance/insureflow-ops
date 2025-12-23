/**
 * Requirement Detail Modal
 * 
 * Shows details of a specific requirement including uploaded documents.
 * Allows reviewing, accepting, rejecting uploads.
 */

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Download,
  MessageSquare,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import {
  CollectionRequirement,
  CollectionUpload,
  useUpdateUploadStatus,
  useAgentUpload,
} from '@/hooks/useDocumentCollection';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

// =============================================================================
// COMPONENT
// =============================================================================

interface RequirementDetailModalProps {
  requirement: CollectionRequirement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequirementDetailModal({
  requirement,
  open,
  onOpenChange,
}: RequirementDetailModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateStatus = useUpdateUploadStatus();
  const agentUpload = useAgentUpload();
  
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const uploads = requirement.collection_uploads || [];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await agentUpload.mutateAsync({
      requirement_id: requirement.id,
      file,
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAccept = async (uploadId: string) => {
    await updateStatus.mutateAsync({
      id: uploadId,
      status: 'accepted',
    });
  };

  const handleReject = async () => {
    if (!selectedUploadId) return;

    await updateStatus.mutateAsync({
      id: selectedUploadId,
      status: 'rejected',
      rejection_reason: rejectionReason,
    });

    setRejectDialogOpen(false);
    setSelectedUploadId(null);
    setRejectionReason('');
  };

  const handleNeedsChanges = async (uploadId: string, notes: string) => {
    await updateStatus.mutateAsync({
      id: uploadId,
      status: 'needs_changes',
      notes,
    });
  };

  const handleViewDocument = async (upload: CollectionUpload) => {
    try {
      const { data, error } = await supabase.storage
        .from(upload.storage_bucket || 'customer-docs')
        .createSignedUrl(upload.file_path, 3600);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not open document',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (upload: CollectionUpload) => {
    try {
      const { data, error } = await supabase.storage
        .from(upload.storage_bucket || 'customer-docs')
        .download(upload.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = upload.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not download document',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending Review' },
      in_review: { variant: 'outline', label: 'In Review' },
      accepted: { variant: 'default', label: 'Accepted' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      needs_changes: { variant: 'outline', label: 'Needs Changes' },
    };
    const config = configs[status] || configs.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {requirement.label}
            </DialogTitle>
            <DialogDescription>
              {requirement.instructions || 'No special instructions provided.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Requirement Info */}
            <div className="flex items-center gap-3 text-sm">
              <Badge variant={requirement.is_required ? 'destructive' : 'secondary'}>
                {requirement.is_required ? 'Required' : 'Optional'}
              </Badge>
              <span className="text-muted-foreground">
                {requirement.doc_type.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>

            <Separator />

            {/* Uploads List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Uploaded Documents</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={agentUpload.isPending}
                >
                  {agentUpload.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={requirement.accepted_file_types?.map(t => `.${t}`).join(',') || '*'}
                  onChange={handleFileSelect}
                />
              </div>

              <ScrollArea className="max-h-[300px]">
                {uploads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No documents uploaded yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {uploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="p-3 rounded-lg border bg-card space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {upload.filename}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {upload.file_size_bytes 
                                  ? `${(upload.file_size_bytes / 1024).toFixed(1)} KB`
                                  : 'Unknown size'}
                              </span>
                              <span>•</span>
                              <span>
                                {formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}
                              </span>
                              <span>•</span>
                              <span className="capitalize">{upload.upload_channel.replace('_', ' ')}</span>
                            </div>
                          </div>
                          {getStatusBadge(upload.review_status)}
                        </div>

                        {/* Processing status */}
                        {upload.processing_status === 'processing' && (
                          <div className="flex items-center gap-2 text-sm text-purple-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Extracting document data...</span>
                          </div>
                        )}

                        {/* Rejection reason */}
                        {upload.review_status === 'rejected' && upload.rejection_reason && (
                          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{upload.rejection_reason}</span>
                          </div>
                        )}

                        {/* Needs changes feedback */}
                        {upload.review_status === 'needs_changes' && upload.review_notes && (
                          <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded">
                            <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{upload.review_notes}</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDocument(upload)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(upload)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>

                          {upload.review_status === 'pending' && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleAccept(upload.id)}
                                disabled={updateStatus.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Accept
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setSelectedUploadId(upload.id);
                                  setRejectDialogOpen(true);
                                }}
                                disabled={updateStatus.isPending}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Document</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejection. This will be visible to the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Document is illegible, wrong document type, missing pages..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setSelectedUploadId(null);
              setRejectionReason('');
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-red-600 hover:bg-red-700"
              disabled={!rejectionReason.trim()}
            >
              Reject Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


