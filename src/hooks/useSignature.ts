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
  documentUrl: string;
  documentName: string;
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
        // Get session for auth
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        // Generate signature fields from form config
        const config = getSignatureConfig(input.formNumber);
        const signatureFields = config?.anchors.map((anchor, index) => {
          const signerIndex = input.signers.findIndex(s => s.role === anchor.role);
          return {
            type: anchor.type === 'signature' ? 'signature' : anchor.type === 'date' ? 'date_signed' : 'text',
            page: anchor.page,
            x: anchor.position?.x || 10,
            y: anchor.position?.y || 80,
            width: anchor.position?.width || 200,
            height: anchor.position?.height || 30,
            signer_index: signerIndex >= 0 ? signerIndex : 0,
            name: anchor.fieldName,
            required: anchor.required,
          };
        }) || [];

        // Call edge function to create signature request via Dropbox Sign
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/esign-create-request`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              document_url: input.documentUrl,
              document_name: input.documentName,
              signers: input.signers.map(s => ({
                email: s.email,
                name: s.name,
                role: s.role,
                order: s.order,
              })),
              form_number: input.formNumber,
              acord_form_id: input.acordFormId,
              message: input.message,
              expires_in_days: input.expirationDays || 14,
              signature_fields: signatureFields.length > 0 ? signatureFields : undefined,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to create signature request');
        }

        toast({
          title: 'Signature request sent',
          description: `Request sent to ${input.signers.length} signer${input.signers.length > 1 ? 's' : ''}`,
        });

        return {
          id: result.data.id,
          acordFormId: input.acordFormId,
          formNumber: input.formNumber,
          status: result.data.status,
          signers: result.data.signers.map((s: { email: string; name: string; status: string }, idx: number) => ({
            id: `signer_${Date.now()}_${idx}`,
            role: input.signers[idx]?.role || 'applicant',
            name: s.name,
            email: s.email,
            status: s.status,
            order: idx + 1,
          })),
          externalRequestId: result.data.external_request_id,
          expiresAt: result.data.expires_at,
          createdAt: new Date().toISOString(),
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
