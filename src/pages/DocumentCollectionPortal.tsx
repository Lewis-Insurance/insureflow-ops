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
import { usePortalPacket, usePortalUpload, usePortalSubmitComplete } from '@/hooks/useDocumentCollection';
import { cn } from '@/lib/utils';
import { getDocType, PORTAL_INTRO_TEXT } from '@/config/documentTypes';

// =============================================================================
// PORTAL-SAFE REQUIREMENT TYPE (client-facing data only)
// =============================================================================

interface PortalRequirement {
  id: string;
  doc_type: string;
  label: string;
  instructions: string | null;
  is_required: boolean;
  min_quantity: number;
  max_quantity: number;
  accepted_file_types: string[];
  max_file_size_mb: number;
  display_order: number;
  status: string; // Client-safe status
  rejection_reason: string | null;
  client_feedback: string | null;
  files_received: number;
  uploads: Array<{
    id: string;
    filename: string;
    uploaded_at: string;
    status: string;
  }> | null;
}

// =============================================================================
// STATUS CONFIG (using portal-safe status values)
// =============================================================================

const statusConfig: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  not_needed: { color: 'text-gray-500', bg: 'bg-gray-50', icon: Clock, label: 'Not needed' },
  upload_needed: { color: 'text-blue-600', bg: 'bg-blue-50', icon: Upload, label: 'Upload needed' },
  under_review: { color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock, label: 'Under review' },
  processing: { color: 'text-purple-600', bg: 'bg-purple-50', icon: Loader2, label: 'Processing...' },
  received: { color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2, label: 'Received ✓' },
  needs_replacement: { color: 'text-red-600', bg: 'bg-red-50', icon: XCircle, label: 'Please re-upload' },
  expired: { color: 'text-gray-400', bg: 'bg-gray-100', icon: AlertTriangle, label: 'Expired' },
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
    const errorMessage = error instanceof Error ? error.message : 'This document collection link is no longer valid.';
    
    return (
      <PortalLayout>
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>Link Issue</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground">
              Please contact your insurance agent for assistance.
            </p>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  // Extract data from new secure response format
  const { packet, requirements, progress, branding, allowed_actions } = data;
  const clientName = packet?.client_name || packet?.account_name || 'Your Insurance Agent';

  const submitComplete = usePortalSubmitComplete();
  const progressPercent = progress?.total > 0 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  return (
    <PortalLayout branding={branding}>
      {/* Welcome Section */}
      <div className="text-center mb-10">
        {packet?.client_name && (
          <p className="text-sm font-medium text-blue-600 mb-2">
            Welcome back, {packet.client_name}
          </p>
        )}
        <h1 className="text-3xl font-bold text-slate-800 mb-3">
          {packet?.title || 'Document Request'}
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto leading-relaxed">
          {packet?.description || PORTAL_INTRO_TEXT}
        </p>
      </div>

      {/* Progress Card */}
      {progress && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Your Progress</h3>
                <p className="text-sm text-slate-500">
                  {progress.completed} of {progress.required} required documents uploaded
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-blue-600">{progressPercent}%</span>
            </div>
          </div>
          
          <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          
          {progress.all_required_complete && (
            <div className="mt-4 flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="p-2 bg-emerald-100 rounded-full">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-emerald-800">All required documents submitted!</p>
                <p className="text-sm text-emerald-600">Your agent will review them shortly.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section Header */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Requested Documents</h2>
        <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">
          {requirements?.length || 0} items
        </span>
      </div>

      {/* Requirements List */}
      <div className="space-y-4">
        {requirements?.map((req: PortalRequirement) => (
          <RequirementCard 
            key={req.id} 
            requirement={req} 
            token={token!}
            canUpload={allowed_actions?.upload !== false}
            onUploadComplete={() => refetch()}
          />
        ))}
      </div>

      {/* Submit Complete Button */}
      {progress?.all_required_complete && (
        <div className="mt-8 text-center">
          <Button 
            size="lg"
            onClick={() => submitComplete.mutate(token!)}
            disabled={submitComplete.isPending}
          >
            {submitComplete.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                I'm Done - Submit for Review
              </>
            )}
          </Button>
          {submitComplete.isSuccess && (
            <p className="mt-2 text-green-600 text-sm">
              ✓ Your documents have been submitted for review.
            </p>
          )}
        </div>
      )}

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

interface PortalBranding {
  agency_name?: string;
  logo_url?: string;
  primary_color?: string;
  accent_color?: string;
  contact_phone?: string;
  contact_email?: string;
  footer_text?: string;
}

function PortalLayout({ 
  children, 
  branding 
}: { 
  children: React.ReactNode; 
  branding?: PortalBranding;
}) {
  const agencyName = branding?.agency_name || 'Lewis Insurance';
  const primaryColor = branding?.primary_color || '#1e40af';
  const logoUrl = branding?.logo_url;
  const contactPhone = branding?.contact_phone || '(386) 755-0050';
  const contactEmail = branding?.contact_email;
  const footerText = branding?.footer_text;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      {/* Header with gradient overlay */}
      <header 
        className="relative overflow-hidden shadow-lg"
        style={{ backgroundColor: primaryColor }}
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="relative max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            {logoUrl ? (
              <img src={logoUrl} alt={agencyName} className="h-10 drop-shadow-sm" />
            ) : (
              <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Building2 className="h-6 w-6" />
                </div>
                <span className="text-xl font-bold tracking-tight">{agencyName}</span>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              {contactPhone && (
                <a 
                  href={`tel:${contactPhone.replace(/[^0-9+]/g, '')}`} 
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm font-medium transition-all backdrop-blur-sm border border-white/20"
                >
                  <Phone className="h-4 w-4" />
                  <span className="hidden sm:inline">{contactPhone}</span>
                </a>
              )}
              {contactEmail && (
                <a 
                  href={`mailto:${contactEmail}`} 
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm font-medium transition-all backdrop-blur-sm border border-white/20"
                >
                  <Mail className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/50 backdrop-blur-sm py-8 mt-auto">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-slate-500">
              <Shield className="h-4 w-4" />
              <span className="text-sm">Your documents are encrypted and secure</span>
            </div>
            <p className="text-sm text-slate-400">
              {footerText || `© ${new Date().getFullYear()} ${agencyName}. All rights reserved.`}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// =============================================================================
// REQUIREMENT CARD
// =============================================================================

interface RequirementCardProps {
  requirement: PortalRequirement;
  token: string;
  canUpload?: boolean;
  onUploadComplete: () => void;
}

function RequirementCard({ requirement, token, canUpload: canUploadProp = true, onUploadComplete }: RequirementCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portalUpload = usePortalUpload();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Use portal-safe status values
  const status = statusConfig[requirement.status] || statusConfig.upload_needed;
  const StatusIcon = status.icon;
  const uploads = requirement.uploads || [];
  const latestUpload = uploads[0];

  // Determine if upload is allowed based on status and token permissions
  const showUploadButton = canUploadProp && ['upload_needed', 'needs_replacement'].includes(requirement.status);
  const isComplete = requirement.status === 'received';
  const isRejected = requirement.status === 'needs_replacement';

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
    <div className={cn(
      "bg-white rounded-xl border-2 transition-all duration-300 hover:shadow-md overflow-hidden",
      isComplete && "border-emerald-300 bg-gradient-to-r from-emerald-50 to-white",
      isRejected && "border-red-300 bg-gradient-to-r from-red-50 to-white",
      !isComplete && !isRejected && "border-slate-200 hover:border-slate-300"
    )}>
      {/* Header Section */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={cn(
              "p-3 rounded-xl transition-colors",
              isComplete ? "bg-emerald-100" : isRejected ? "bg-red-100" : "bg-slate-100"
            )}>
              <FileText className={cn(
                "h-6 w-6",
                isComplete ? "text-emerald-600" : isRejected ? "text-red-600" : "text-slate-600"
              )} />
            </div>
            
            {/* Title & Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-800 text-lg">
                  {requirement.label}
                </h3>
                {requirement.is_required && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-md">
                    Required
                  </span>
                )}
              </div>
              {requirement.instructions && (
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                  {requirement.instructions}
                </p>
              )}
            </div>
          </div>
          
          {/* Status Badge */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium shrink-0",
            isComplete ? "bg-emerald-100 text-emerald-700" :
            isRejected ? "bg-red-100 text-red-700" :
            requirement.status === 'processing' ? "bg-purple-100 text-purple-700" :
            requirement.status === 'under_review' ? "bg-amber-100 text-amber-700" :
            "bg-blue-100 text-blue-700"
          )}>
            <StatusIcon className={cn("h-4 w-4", requirement.status === 'processing' && 'animate-spin')} />
            <span>{status.label}</span>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="px-5 pb-5 space-y-4">
        {/* Rejection Message */}
        {isRejected && requirement.rejection_reason && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-800">Please re-upload</p>
              <p className="text-sm text-red-600 mt-0.5">{requirement.rejection_reason}</p>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploadProgress !== null && (
          <div className="space-y-2">
            <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center font-medium">
              {uploadProgress < 100 ? 'Uploading your document...' : '✓ Upload complete!'}
            </p>
          </div>
        )}

        {/* Upload Error */}
        {uploadError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-800">Upload failed</p>
              <p className="text-sm text-red-600 mt-0.5">{uploadError}</p>
            </div>
          </div>
        )}

        {/* Uploaded Files */}
        {uploads.length > 0 && !isRejected && !isComplete && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Check className="h-5 w-5 text-emerald-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{latestUpload?.filename}</p>
              <p className="text-xs text-slate-500">Under review</p>
            </div>
          </div>
        )}

        {/* Upload Button */}
        {showUploadButton && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={requirement.accepted_file_types?.map(t => `.${t}`).join(',') || '*'}
              onChange={handleFileSelect}
            />
            <button
              className={cn(
                "w-full py-4 px-6 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2",
                isRejected 
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200" 
                  : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-200",
                portalUpload.isPending && "opacity-70 cursor-not-allowed"
              )}
              onClick={() => fileInputRef.current?.click()}
              disabled={portalUpload.isPending}
            >
              {portalUpload.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>{isRejected ? 'Re-upload Document' : 'Upload Document'}</span>
                </>
              )}
            </button>
            <p className="text-xs text-slate-400 text-center">
              {(requirement.accepted_file_types || ['pdf', 'jpg', 'png']).join(', ').toUpperCase()} 
              {' '}• Max {requirement.max_file_size_mb || 25}MB
            </p>
          </div>
        )}

        {/* Complete State */}
        {isComplete && (
          <div className="flex items-center justify-center gap-3 py-3 bg-emerald-50 rounded-xl">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-emerald-700">Document received</span>
          </div>
        )}
      </div>
    </div>
  );
}

