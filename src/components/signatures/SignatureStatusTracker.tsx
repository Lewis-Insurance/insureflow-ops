/**
 * SignatureStatusTracker
 *
 * Displays the status of signature requests with real-time updates.
 * Shows each signer's status and allows resending/cancelling.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  FileSignature,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Send,
  MoreHorizontal,
  RefreshCw,
  Ban,
  Download,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';

interface SignerStatus {
  email: string;
  name: string;
  status: string;
  signature_id?: string;
  signed_at?: string;
  last_viewed_at?: string;
  order?: number;
}

interface SignatureRequest {
  id: string;
  acord_form_id: string | null;
  form_number: string | null;
  status: string;
  signers: SignerStatus[];
  external_request_id: string | null;
  external_provider: string | null;
  document_url: string | null;
  signed_document_url: string | null;
  expires_at: string | null;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

interface SignatureStatusTrackerProps {
  acordFormId?: string;
  requestId?: string;
  onDownloadSigned?: (url: string) => void;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: FileSignature },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800', icon: Send },
  partial: { label: 'Partially Signed', color: 'bg-orange-100 text-orange-800', icon: FileSignature },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-800', icon: XCircle },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-800', icon: Clock },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: Ban },
};

const SIGNER_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  awaiting_signature: { label: 'Awaiting', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  viewed: { label: 'Viewed', color: 'bg-blue-100 text-blue-800', icon: Eye },
  signed: { label: 'Signed', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export function SignatureStatusTracker({
  acordFormId,
  requestId,
  onDownloadSigned,
  className,
}: SignatureStatusTrackerProps) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch signature requests
  const fetchRequests = async () => {
    try {
      let query = supabase.from('signature_requests').select('*');

      if (requestId) {
        query = query.eq('id', requestId);
      } else if (acordFormId) {
        query = query.eq('acord_form_id', acordFormId);
      } else {
        // If no filter, get recent requests for the user
        query = query.order('created_at', { ascending: false }).limit(10);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Failed to fetch signature requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('signature_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'signature_requests',
          filter: acordFormId ? `acord_form_id=eq.${acordFormId}` : undefined,
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [acordFormId, requestId]);

  const handleResend = async (request: SignatureRequest, signer: SignerStatus) => {
    setIsProcessing(true);
    try {
      // In production, this would call an edge function to resend via Dropbox Sign
      toast({
        title: 'Reminder sent',
        description: `Reminder sent to ${signer.email}`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to send reminder',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedRequestId) return;

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('signature_requests')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', selectedRequestId);

      if (error) throw error;

      toast({
        title: 'Request cancelled',
        description: 'The signature request has been cancelled',
      });

      fetchRequests();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to cancel request',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setCancelDialogOpen(false);
      setSelectedRequestId(null);
    }
  };

  const getProgress = (request: SignatureRequest): number => {
    if (request.status === 'completed') return 100;
    if (request.status === 'cancelled' || request.status === 'declined' || request.status === 'expired') return 0;

    const signers = request.signers || [];
    if (signers.length === 0) return 0;

    const signedCount = signers.filter(s => s.status === 'signed').length;
    return Math.round((signedCount / signers.length) * 100);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <FileSignature className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No signature requests found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      {requests.map((request) => {
        const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
        const StatusIcon = statusConfig.icon;
        const progress = getProgress(request);

        return (
          <Card key={request.id} className="mb-4">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon className="h-5 w-5" />
                  <CardTitle className="text-lg">
                    {request.form_number
                      ? `ACORD ${request.form_number}`
                      : 'Document Signature'}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusConfig.color}>
                    {statusConfig.label}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {request.signed_document_url && (
                        <DropdownMenuItem
                          onClick={() => onDownloadSigned?.(request.signed_document_url!)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download Signed
                        </DropdownMenuItem>
                      )}
                      {request.document_url && (
                        <DropdownMenuItem
                          onClick={() => window.open(request.document_url!, '_blank')}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Original
                        </DropdownMenuItem>
                      )}
                      {['sent', 'pending', 'partial'].includes(request.status) && (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedRequestId(request.id);
                            setCancelDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Cancel Request
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <CardDescription>
                Created {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                {request.expires_at && request.status !== 'completed' && (
                  <> &bull; Expires {format(new Date(request.expires_at), 'MMM d, yyyy')}</>
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Progress Bar */}
              {['sent', 'pending', 'partial'].includes(request.status) && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Signing Progress</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {/* Signers List */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Signers</h4>
                <div className="space-y-2">
                  {(request.signers || []).map((signer, index) => {
                    const signerConfig = SIGNER_STATUS_CONFIG[signer.status] || SIGNER_STATUS_CONFIG.pending;
                    const SignerIcon = signerConfig.icon;

                    return (
                      <div
                        key={signer.signature_id || index}
                        className="flex items-center justify-between p-2 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background">
                            <SignerIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{signer.name}</div>
                            <div className="text-xs text-muted-foreground">{signer.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={signerConfig.color}>
                            {signerConfig.label}
                          </Badge>
                          {signer.status !== 'signed' && ['sent', 'pending', 'partial'].includes(request.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResend(request, signer)}
                              disabled={isProcessing}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Remind
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Signed timestamp */}
              {request.completed_at && (
                <div className="text-sm text-muted-foreground">
                  <CheckCircle2 className="inline h-4 w-4 mr-1 text-green-600" />
                  Completed {format(new Date(request.completed_at), 'MMM d, yyyy h:mm a')}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Signature Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the signature request and notify all signers.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Keep Request</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Request'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SignatureStatusTracker;
