// ============================================
// useSignature Hook
// Manages signature requests and tracking for ACORD forms
// ============================================

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  getSignatureConfig,
  getSignatureAnchors,
  getRequiredSigners,
  generateSignatureRequest,
  type SignatureAnchor,
  type SignatureConfig,
  type SignerRole,
} from '@/lib/acord/signatureAnchors';

// ============================================
// TYPES
// ============================================

export interface SignatureRequest {
  id: string;
  acordFormId: string;
  formNumber: string;
  status: SignatureRequestStatus;
  signers: SignerInfo[];
  externalRequestId?: string; // ID from eSignature provider
  documentUrl?: string;
  signedDocumentUrl?: string;
  expiresAt?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SignerInfo {
  id: string;
  role: SignerRole;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
  signedAt?: string;
  order: number;
}

export type SignatureRequestStatus =
  | 'draft'
  | 'pending'
  | 'sent'
  | 'partial'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'cancelled';

export interface CreateSignatureRequestInput {
  acordFormId: string;
  formNumber: string;
  signers: Omit<SignerInfo, 'id' | 'status' | 'signedAt'>[];
  message?: string;
  expirationDays?: number;
}

export interface UseSignatureReturn {
  // Configuration
  getConfig: (formNumber: string) => SignatureConfig | null;
  getAnchors: (formNumber: string) => SignatureAnchor[];
  getRequiredRoles: (formNumber: string) => SignerRole[];

  // Request Management
  createRequest: (input: CreateSignatureRequestInput) => Promise<SignatureRequest | null>;
  cancelRequest: (requestId: string) => Promise<boolean>;
  resendRequest: (requestId: string, signerId: string) => Promise<boolean>;
  getRequest: (requestId: string) => Promise<SignatureRequest | null>;
  getRequestsForForm: (acordFormId: string) => Promise<SignatureRequest[]>;

  // Status
  isLoading: boolean;
  error: string | null;
}

// ============================================
// HOOK
// ============================================

export function useSignature(): UseSignatureReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // ============================================
  // CONFIGURATION
  // ============================================

  const getConfig = useCallback((formNumber: string): SignatureConfig | null => {
    return getSignatureConfig(formNumber);
  }, []);

  const getAnchors = useCallback((formNumber: string): SignatureAnchor[] => {
    return getSignatureAnchors(formNumber);
  }, []);

  const getRequiredRoles = useCallback((formNumber: string): SignerRole[] => {
    return getRequiredSigners(formNumber);
  }, []);

  // ============================================
  // REQUEST MANAGEMENT
  // ============================================

  const createRequest = useCallback(
    async (input: CreateSignatureRequestInput): Promise<SignatureRequest | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Generate signature request structure
        const { anchors, signerAssignments } = generateSignatureRequest(
          input.formNumber,
          input.signers.map(s => ({ role: s.role, email: s.email, name: s.name }))
        );

        // Calculate expiration
        const expirationDays = input.expirationDays || 14;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);

        // Create signers with IDs
        const signers: SignerInfo[] = input.signers.map((s, idx) => ({
          id: `signer_${Date.now()}_${idx}`,
          ...s,
          status: 'pending',
        }));

        // Create request record
        const { data, error: createError } = await supabase
          .from('signature_requests')
          .insert({
            acord_form_id: input.acordFormId,
            form_number: input.formNumber,
            status: 'draft',
            signers,
            anchors,
            message: input.message,
            expires_at: expiresAt.toISOString(),
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) throw createError;

        // In production, this would integrate with Dropbox Sign/DocuSign:
        // 1. Upload the PDF to the eSignature provider
        // 2. Create signature request with signer info
        // 3. Store the external request ID
        // 4. Update status to 'sent'

        toast({
          title: 'Signature request created',
          description: `Request sent to ${signers.length} signer${signers.length > 1 ? 's' : ''}`,
        });

        return {
          id: data.id,
          acordFormId: data.acord_form_id,
          formNumber: data.form_number,
          status: data.status,
          signers,
          expiresAt: data.expires_at,
          createdAt: data.created_at,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create request';
        setError(message);
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const cancelRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('signature_requests')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('id', requestId);

        if (error) throw error;

        // In production, also cancel with eSignature provider

        toast({
          title: 'Request cancelled',
          description: 'The signature request has been cancelled',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel request';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast]
  );

  const resendRequest = useCallback(
    async (requestId: string, signerId: string): Promise<boolean> => {
      try {
        // Get current request
        const { data: request, error: fetchError } = await supabase
          .from('signature_requests')
          .select('*')
          .eq('id', requestId)
          .single();

        if (fetchError) throw fetchError;

        // In production, this would resend via eSignature provider

        toast({
          title: 'Request resent',
          description: 'The signature request has been resent',
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to resend request';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast]
  );

  const getRequest = useCallback(
    async (requestId: string): Promise<SignatureRequest | null> => {
      try {
        const { data, error } = await supabase
          .from('signature_requests')
          .select('*')
          .eq('id', requestId)
          .single();

        if (error) throw error;

        return {
          id: data.id,
          acordFormId: data.acord_form_id,
          formNumber: data.form_number,
          status: data.status,
          signers: data.signers || [],
          externalRequestId: data.external_request_id,
          documentUrl: data.document_url,
          signedDocumentUrl: data.signed_document_url,
          expiresAt: data.expires_at,
          createdAt: data.created_at,
          completedAt: data.completed_at,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get request';
        setError(message);
        return null;
      }
    },
    []
  );

  const getRequestsForForm = useCallback(
    async (acordFormId: string): Promise<SignatureRequest[]> => {
      try {
        const { data, error } = await supabase
          .from('signature_requests')
          .select('*')
          .eq('acord_form_id', acordFormId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(d => ({
          id: d.id,
          acordFormId: d.acord_form_id,
          formNumber: d.form_number,
          status: d.status,
          signers: d.signers || [],
          externalRequestId: d.external_request_id,
          documentUrl: d.document_url,
          signedDocumentUrl: d.signed_document_url,
          expiresAt: d.expires_at,
          createdAt: d.created_at,
          completedAt: d.completed_at,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get requests';
        setError(message);
        return [];
      }
    },
    []
  );

  return {
    // Configuration
    getConfig,
    getAnchors,
    getRequiredRoles,

    // Request Management
    createRequest,
    cancelRequest,
    resendRequest,
    getRequest,
    getRequestsForForm,

    // Status
    isLoading,
    error,
  };
}

export default useSignature;
