import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Create a short-lived signed URL for a private Storage object (Batch 6A).
 *
 * Replaces `supabase.storage.from(bucket).getPublicUrl(path)` now that the PII buckets
 * (documents, certificates, acord-forms, acord-templates, portal-documents, workspace-documents)
 * are being made private. Signed URLs are valid for `expiresIn` seconds and must be generated at
 * read/display time — never persisted to the DB (store the object PATH instead and sign on read).
 *
 * Tolerant of callers that still hold a legacy full public URL: the object path is extracted.
 * Returns null on failure; callers must handle null.
 */
export async function getSignedStorageUrl(
  bucket: string,
  pathOrUrl: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  // Accept either a bare object path or a legacy /object/[public|sign]/<bucket>/<path>[?query] URL.
  const stripped = pathOrUrl.replace(/^.*\/object\/(?:public\/|sign\/)?[^/]+\//, '').split('?')[0];
  const cleanPath = stripped || pathOrUrl;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, expiresIn);
  if (error) {
    logger.error('getSignedStorageUrl failed', { bucket, path: cleanPath, error: error.message });
    return null;
  }
  return data?.signedUrl ?? null;
}
