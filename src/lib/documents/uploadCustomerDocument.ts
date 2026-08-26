import { supabase } from '@/integrations/supabase/client';

/**
 * One upload path for customer documents.
 *
 * Every customer-facing surface that puts a file on an account (the Upload
 * Document modal, the drag/click control on a policy card) writes the same
 * storage object and the same `documents` row through here. Duplicating the
 * storage upload plus insert in each surface is how the columns drift, and a
 * drifted row is a document that a downstream reader cannot open.
 */

const DOCUMENTS_BUCKET = 'documents';

/**
 * File types the customer document surfaces accept. Kept here so the modal
 * picker and the policy card control cannot disagree.
 */
export const CUSTOMER_DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg';

export type CustomerDocumentUploadStage = 'auth' | 'storage' | 'database';

/** Carries which step failed so callers can word the toast correctly. */
export class CustomerDocumentUploadError extends Error {
  readonly stage: CustomerDocumentUploadStage;

  constructor(stage: CustomerDocumentUploadStage, message: string) {
    super(message);
    this.name = 'CustomerDocumentUploadError';
    this.stage = stage;
  }
}

export interface UploadCustomerDocumentInput {
  file: File;
  accountId: string;
  /**
   * When set, the row is written with `documents.policy_id`. That is what ties
   * the file to one policy and puts the Policy # chip on it in the Documents
   * panel. Leave it out for an account-level document.
   */
  policyId?: string | null;
  /** Display name. Falls back to the file name. */
  name?: string;
  /** `documents.kind`. Defaults to the customer document kind. */
  kind?: string;
  /** `documents.category`. Left unset when the surface does not ask for one. */
  category?: string;
}

export interface UploadedCustomerDocument {
  id: string;
  account_id: string | null;
  policy_id: string | null;
  storage_path: string;
  name: string | null;
  filename: string;
  [key: string]: unknown;
}

function buildStoragePath(accountId: string, file: File): string {
  const unique = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  const lastDot = file.name.lastIndexOf('.');
  // A file with no extension must not have its whole name used as one.
  const ext = lastDot > 0 ? file.name.slice(lastDot + 1) : '';
  return ext ? `${accountId}/${unique}.${ext}` : `${accountId}/${unique}`;
}

/**
 * Uploads the file to the documents bucket and inserts the matching row.
 * Throws `CustomerDocumentUploadError` on failure; on a failed insert the
 * storage object is removed first so a dead file is never left in the bucket.
 */
export async function uploadCustomerDocument({
  file,
  accountId,
  policyId,
  name,
  kind = 'customer_document',
  category,
}: UploadCustomerDocumentInput): Promise<UploadedCustomerDocument> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new CustomerDocumentUploadError('auth', 'You must be logged in to upload documents');
  }

  const storagePath = buildStoragePath(accountId, file);

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, file);

  if (uploadError) {
    throw new CustomerDocumentUploadError('storage', uploadError.message);
  }

  const { data: document, error: dbError } = await supabase
    .from('documents')
    .insert({
      account_id: accountId,
      uploaded_by: user.id,
      storage_path: storagePath,
      // Some readers (extract-wc-policy) resolve the file via file_path; keep
      // both in sync so freshly uploaded docs are extractable.
      file_path: storagePath,
      storage_bucket: DOCUMENTS_BUCKET,
      file_missing: false,
      filename: file.name,
      name: name?.trim() || file.name,
      mime_type: file.type,
      size_bytes: file.size,
      kind,
      ...(category ? { category: category as never } : {}),
      ...(policyId ? { policy_id: policyId } : {}),
    })
    .select()
    .single();

  if (dbError) {
    // Clean up the uploaded file so a failed insert leaves no orphan object.
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    throw new CustomerDocumentUploadError('database', dbError.message);
  }

  return document as unknown as UploadedCustomerDocument;
}
