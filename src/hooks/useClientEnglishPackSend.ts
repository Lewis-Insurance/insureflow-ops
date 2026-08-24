import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createClientSendApproval } from '@/lib/clientSendApproval';
import { logger } from '@/lib/logger';

const STORAGE_BUCKET = 'portal-documents';
const STALE_EXTRACT_MESSAGE = 'This extract changed after it was confirmed. Re-confirm before sending.';

export interface StageClientEnglishPackInput {
  pdfBytes: Uint8Array;
  currentSnapshotHash: string;
  confirmedSnapshotHash: string;
  accountId: string;
  policyId?: string | null;
  portalEmail?: string | null;
  accountEmail?: string | null;
  recipientFirstName?: string | null;
  agencyName: string;
  agencyPhone: string;
  portalUrl: string;
}

export interface StagedClientEnglishPackSend {
  accountId: string;
  policyId: string | null;
  documentId: string;
  documentName: string;
  storagePath: string;
  pdfSha256: string;
  snapshotHash: string;
  fileSizeBytes: number;
  recipient: string;
  subject: string;
  body: string;
}

export interface SentClientEnglishPack {
  recipient: string;
  documentId: string;
  portalDocumentId: string;
  sentAt: string;
}

export class ClientEnglishPackDeliveryError extends Error {
  constructor(message: string, public readonly outcome: 'unknown' | 'not_sent') { super(message); }
}

function hasHttpResponseContext(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const context = (error as { context?: unknown }).context;
  return Boolean(context && typeof context === 'object' && typeof (context as { status?: unknown }).status === 'number');
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requiredRecipient(portalEmail?: string | null, accountEmail?: string | null): string {
  const recipient = portalEmail?.trim() || accountEmail?.trim();
  if (!recipient) throw new Error('A client email address is required to queue this summary.');
  return recipient;
}

async function removeStagedArtifact(staged: Pick<StagedClientEnglishPackSend, 'documentId' | 'storagePath'>): Promise<void> {
  const { data: deleted, error: documentDeleteError } = await (supabase.rpc as any)('delete_client_english_pack_document', {
    p_document_id: staged.documentId, p_path: staged.storagePath,
  });
  if (documentDeleteError || !deleted) throw new Error(`Client summary cleanup failed: ${documentDeleteError?.message ?? 'document was not deleted'}`);
  const { error: objectDeleteError } = await supabase.storage.from(STORAGE_BUCKET).remove([staged.storagePath]);
  if (objectDeleteError) throw new Error(`Client summary cleanup failed: ${objectDeleteError.message}`);
}

async function verifyStagedArtifact(staged: StagedClientEnglishPackSend): Promise<void> {
  const references = [...staged.body.matchAll(/Document reference: ([a-f0-9]{12})\./g)];
  if (references.length !== 1 || references[0][1] !== staged.pdfSha256.slice(0, 12)) {
    throw new Error('The staged client summary no longer matches its email. Queue it again.');
  }

  const { data: document, error } = await (supabase.rpc as any)('verify_client_english_pack_document', {
    p_document_id: staged.documentId, p_account_id: staged.accountId, p_policy_id: staged.policyId,
    p_path: staged.storagePath, p_sha256: staged.pdfSha256, p_recipient: staged.recipient,
  });
  if (error) throw error;
  if (!document) {
    throw new Error('The staged client summary artifact changed. Queue it again.');
  }
}

export function useClientEnglishPackSend() {
  const [isStaging, setIsStaging] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const stageSend = useCallback(async (input: StageClientEnglishPackInput): Promise<StagedClientEnglishPackSend> => {
    if (input.currentSnapshotHash !== input.confirmedSnapshotHash) {
      throw new Error(STALE_EXTRACT_MESSAGE);
    }

    const recipient = requiredRecipient(input.portalEmail, input.accountEmail);
    setIsStaging(true);
    let storagePath: string | null = null;
    try {
      const pdfSha256 = await sha256Hex(input.pdfBytes);
      const suffix = crypto.randomUUID();
      storagePath = `${input.accountId}/client-english-pack/${pdfSha256.slice(0, 12)}-${suffix}.pdf`;
      const documentName = 'Client coverage summary.pdf';
      const file = new Blob([new Uint8Array(input.pdfBytes)], { type: 'application/pdf' });

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
        cacheControl: '3600',
        contentType: 'application/pdf',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: documentId, error: documentError } = await (supabase.rpc as any)('finalize_client_english_pack_document', {
        p_account_id: input.accountId, p_policy_id: input.policyId ?? null, p_path: storagePath,
        p_sha256: pdfSha256, p_size: input.pdfBytes.byteLength,
      });
      if (documentError || !documentId) throw documentError ?? new Error('Client summary document was not recorded');

      const greeting = input.recipientFirstName?.trim() || 'there';
      const digest = pdfSha256.slice(0, 12);
      return {
        accountId: input.accountId,
        policyId: input.policyId ?? null,
        documentId,
        documentName,
        storagePath,
        pdfSha256,
        snapshotHash: input.confirmedSnapshotHash,
        fileSizeBytes: input.pdfBytes.byteLength,
        recipient,
        subject: `Your coverage summary from ${input.agencyName}`,
        body: `Hi ${greeting}, your coverage summary is ready. Sign in to your portal to view it: ${input.portalUrl}. Questions? Call us at ${input.agencyPhone}. Document reference: ${digest}.`,
      };
    } catch (error) {
      if (storagePath) {
        const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        if (cleanupError) throw new Error(`Client summary cleanup failed: ${cleanupError.message}`);
      }
      throw error;
    } finally {
      setIsStaging(false);
    }
  }, []);

  const approveAndSend = useCallback(async (staged: StagedClientEnglishPackSend): Promise<SentClientEnglishPack> => {
    setIsApproving(true);
    let portalDocumentId: string | null = null;
    let artifactVerified = false;
    let sendCompleted = false;
    try {
      await verifyStagedArtifact(staged);
      artifactVerified = true;
      const sendPayload = { to: staged.recipient, subject: staged.subject, body: staged.body };
      const client_send_approval = await createClientSendApproval('email-send', sendPayload);

      const { data: portalDocument, error: publishError } = await (supabase.rpc as any)('publish_client_english_pack_document', {
        p_document_id: staged.documentId, p_account_id: staged.accountId, p_policy_id: staged.policyId,
        p_path: staged.storagePath, p_sha256: staged.pdfSha256,
      });
      if (publishError || !portalDocument) throw publishError ?? new Error('Client summary was not published');
      portalDocumentId = portalDocument;

      const { data: sendResult, error: sendError } = await supabase.functions.invoke('email-send', {
        body: { ...sendPayload, client_send_approval },
      });
      if (sendError) {
        if (hasHttpResponseContext(sendError)) {
          throw new ClientEnglishPackDeliveryError('Email was not sent. Review and queue it again.', 'not_sent');
        }
        sendCompleted = true;
        throw new ClientEnglishPackDeliveryError('Email delivery could not be confirmed. The client summary remains published and should not be sent again.', 'unknown');
      }
      if (sendResult?.delivery_outcome === 'unknown') {
        sendCompleted = true;
        throw new ClientEnglishPackDeliveryError('Email delivery could not be confirmed. The client summary remains published and should not be sent again.', 'unknown');
      }
      if (sendResult?.success !== true || sendResult?.delivery_outcome !== 'sent') {
        throw new ClientEnglishPackDeliveryError(sendResult?.error ?? 'Email was not sent', 'not_sent');
      }
      sendCompleted = true;

      const sentAt = new Date().toISOString();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: auditError } = await supabase.from('communications').insert({
          account_id: staged.accountId,
          agent_id: user?.id ?? null,
          type: 'email',
          direction: 'outbound',
          subject: 'Client coverage summary sent',
          body: null,
          occurred_at: sentAt,
          meta: {
            pack_document_id: staged.documentId,
            snapshot_hash: staged.snapshotHash,
          },
        });
        if (auditError) logger.error('Client English Pack audit log failed', auditError);
      } catch (auditFailure) {
        // Delivery already succeeded. Audit failures must never retract client access.
        logger.error('Client English Pack audit log failed', auditFailure);
      }

      return { recipient: staged.recipient, documentId: staged.documentId, portalDocumentId, sentAt };
    } catch (error) {
      if (sendCompleted) throw error;
      if (!artifactVerified) throw error;
      if (portalDocumentId) {
        const { data: unpublished, error: unpublishError } = await (supabase.rpc as any)('unpublish_client_english_pack_document', {
          p_portal_document_id: portalDocumentId, p_document_id: staged.documentId,
        });
        if (unpublishError || !unpublished) throw new Error(`Client summary unpublish failed: ${unpublishError?.message ?? 'document remained published'}`);
      }
      await removeStagedArtifact(staged);
      throw error;
    } finally {
      setIsApproving(false);
    }
  }, []);

  const discardStaged = useCallback(async (staged: StagedClientEnglishPackSend): Promise<void> => {
    await removeStagedArtifact(staged);
  }, []);

  return { stageSend, approveAndSend, discardStaged, isStaging, isApproving };
}

export { STALE_EXTRACT_MESSAGE };
