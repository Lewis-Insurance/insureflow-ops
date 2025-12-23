/**
 * Document Collection Portal Page
 * 
 * Public-facing page for clients to upload required documents.
 * Accessible via secure token link.
 */

import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Shield,
  Building2,
  Phone,
  Mail,
  Check,
  X,
} from 'lucide-react';
import { usePortalPacket, usePortalUpload, CollectionRequirement } from '@/hooks/useDocumentCollection';
import { cn } from '@/lib/utils';
import { getDocType, PORTAL_INTRO_TEXT } from '@/config/documentTypes';

// =============================================================================
// STATUS CONFIG
// =============================================================================

const statusConfig: Record<string, { color: string; bg: string; icon: React.ElementType; label: string; clientLabel: string }> = {
  not_requested: { color: 'text-gray-500', bg: 'bg-gray-50', icon: Clock, label: 'Not Requested', clientLabel: 'Not needed' },
  requested: { color: 'text-blue-600', bg: 'bg-blue-50', icon: Upload, label: 'Requested', clientLabel: 'Upload needed' },
  uploaded: { color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock, label: 'Uploaded', clientLabel: 'Under review' },
  processing: { color: 'text-purple-600', bg: 'bg-purple-50', icon: Loader2, label: 'Processing', clientLabel: 'Processing...' },
  needs_review: { color: 'text-orange-600', bg: 'bg-orange-50', icon: Clock, label: 'Needs Review', clientLabel: 'Under review' },
  accepted: { color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2, label: 'Accepted', clientLabel: 'Accepted ✓' },
  rejected: { color: 'text-red-600', bg: 'bg-red-50', icon: XCircle, label: 'Rejected', clientLabel: 'Please re-upload' },
  expired: { color: 'text-gray-400', bg: 'bg-gray-100', icon: AlertTriangle, label: 'Expired', clientLabel: 'Expired' },
};

// Helper to get icon from doc type config
function getDocTypeIcon(docTypeKey: string): React.ElementType {
  const docType = getDocType(docTypeKey.toUpperCase());
  return docType?.icon || FileText;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DocumentCollectionPortal() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error, refetch } = usePortalPacket(token || null);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading your document request...</p>
        </div>
      </PortalLayout>
    );
  }

  if (error || !data) {
    return (
      <PortalLayout>
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>Link Invalid or Expired</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              This document collection link is no longer valid. It may have expired or been revoked.
            </p>
            <p className="text-sm text-muted-foreground">
              Please contact your insurance agent for a new link.
            </p>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  const { workspace, requirements, status_summary, branding } = data;
  const accountName = workspace?.accounts?.name || 'Your Insurance Agent';

  return (
    <PortalLayout branding={branding}>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Document Upload Portal</h1>
        <p className="text-muted-foreground">
          {workspace?.name || 'Document Request'} for {accountName}
        </p>
      </div>

      {/* Progress Card */}
      {status_summary && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Your Progress</span>
              <span className="text-sm text-muted-foreground">
                {status_summary.completed_count} of {status_summary.required_count} required documents
              </span>
            </div>
            <Progress value={status_summary.progress_percent} className="h-3" />
            
            {status_summary.all_required_complete && (
              <Alert className="mt-4 bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  All required documents have been submitted! Your agent will review them shortly.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Requirements List */}
      <div className="space-y-4">
        {requirements?.map((req: CollectionRequirement) => (
          <RequirementCard 
            key={req.id} 
            requirement={req} 
            token={token!}
            onUploadComplete={() => refetch()}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p className="flex items-center justify-center gap-1">
          <Shield className="h-4 w-4" />
          Your documents are transmitted securely and handled in accordance with privacy laws.
        </p>
      </div>
    </PortalLayout>
  );
}

// =============================================================================
// PORTAL LAYOUT
// =============================================================================

function PortalLayout({ 
  children, 
  branding 
}: { 
  children: React.ReactNode; 
  branding?: any;
}) {
  const agencyName = branding?.agency_name || 'Lewis Insurance';
  const primaryColor = branding?.primary_color || '#1e40af';
  const logoUrl = branding?.logo_url;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header 
        className="border-b py-4"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="max-w-2xl mx-auto px-4 flex items-center justify-between">
          {logoUrl ? (
            <img src={logoUrl} alt={agencyName} className="h-8" />
          ) : (
            <div className="flex items-center gap-2 text-white">
              <Building2 className="h-6 w-6" />
              <span className="font-semibold">{agencyName}</span>
            </div>
          )}
          
          <div className="flex items-center gap-4 text-white/80 text-sm">
            <a href="tel:+13867550050" className="flex items-center gap-1 hover:text-white">
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">(386) 755-0050</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-6 mt-auto">
        <div className="max-w-2xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {agencyName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

// =============================================================================
// REQUIREMENT CARD
// =============================================================================

interface RequirementCardProps {
  requirement: CollectionRequirement;
  token: string;
  onUploadComplete: () => void;
}

function RequirementCard({ requirement, token, onUploadComplete }: RequirementCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portalUpload = usePortalUpload();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const status = statusConfig[requirement.status] || statusConfig.requested;
  const StatusIcon = status.icon;
  const uploads = requirement.collection_uploads || [];
  const latestUpload = uploads[0];

  const canUpload = ['requested', 'rejected'].includes(requirement.status);
  const isComplete = requirement.status === 'accepted';
  const isRejected = requirement.status === 'rejected';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadProgress(0);

    try {
      // Check file size
      const maxSize = (requirement.max_file_size_mb || 25) * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error(`File is too large. Maximum size is ${requirement.max_file_size_mb}MB.`);
      }

      // Check file type
      const acceptedTypes = requirement.accepted_file_types || ['pdf', 'jpg', 'jpeg', 'png'];
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension && !acceptedTypes.includes(extension)) {
        throw new Error(`File type not accepted. Please upload: ${acceptedTypes.join(', ')}`);
      }

      setUploadProgress(50);

      await portalUpload.mutateAsync({
        token,
        requirement_id: requirement.id,
        file,
      });

      setUploadProgress(100);
      onUploadComplete();

      // Reset after delay
      setTimeout(() => setUploadProgress(null), 1500);
    } catch (error: any) {
      setUploadError(error.message || 'Upload failed. Please try again.');
      setUploadProgress(null);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className={cn(
      "transition-all",
      isComplete && "border-green-200 bg-green-50/30",
      isRejected && "border-red-200 bg-red-50/30"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn("p-2 rounded-lg", status.bg)}>
              <FileText className={cn("h-5 w-5", status.color)} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {requirement.label}
                {requirement.is_required && (
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                )}
              </CardTitle>
              {requirement.instructions && (
                <CardDescription className="mt-1">
                  {requirement.instructions}
                </CardDescription>
              )}
            </div>
          </div>
          
          <div className={cn("flex items-center gap-1.5 text-sm", status.color)}>
            <StatusIcon className={cn("h-4 w-4", requirement.status === 'processing' && 'animate-spin')} />
            <span className="font-medium">{status.clientLabel}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Rejection Message */}
        {isRejected && latestUpload?.rejection_reason && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Please re-upload:</strong> {latestUpload.rejection_reason}
            </AlertDescription>
          </Alert>
        )}

        {/* Needs Changes Message */}
        {latestUpload?.review_status === 'needs_changes' && latestUpload.client_feedback && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Changes requested:</strong> {latestUpload.client_feedback}
            </AlertDescription>
          </Alert>
        )}

        {/* Upload Progress */}
        {uploadProgress !== null && (
          <div className="space-y-1">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {uploadProgress < 100 ? 'Uploading...' : 'Upload complete!'}
            </p>
          </div>
        )}

        {/* Upload Error */}
        {uploadError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}

        {/* Uploaded Files */}
        {uploads.length > 0 && !isRejected && (
          <div className="text-sm text-muted-foreground">
            <p className="flex items-center gap-1">
              <Check className="h-4 w-4 text-green-600" />
              Uploaded: {latestUpload?.filename}
            </p>
          </div>
        )}

        {/* Upload Button */}
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={requirement.accepted_file_types?.map(t => `.${t}`).join(',') || '*'}
              onChange={handleFileSelect}
            />
            <Button
              className="w-full"
              variant={isRejected ? 'destructive' : 'default'}
              onClick={() => fileInputRef.current?.click()}
              disabled={portalUpload.isPending}
            >
              {portalUpload.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {isRejected ? 'Re-upload Document' : 'Upload Document'}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Accepted: {(requirement.accepted_file_types || ['pdf', 'jpg', 'png']).join(', ').toUpperCase()} 
              {' '}• Max {requirement.max_file_size_mb || 25}MB
            </p>
          </>
        )}

        {/* Complete State */}
        {isComplete && (
          <div className="flex items-center justify-center gap-2 py-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Document accepted</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

