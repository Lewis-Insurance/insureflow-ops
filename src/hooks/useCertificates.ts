// ============================================================================
// CERTIFICATE ISSUANCE-LOG HOOK
// ============================================================================
// Data layer for the certificate issuance log (04-issuance-and-snapshots.md
// Section 9.1). Read-only over the `list_certificates` reader plus the narrow
// SECURITY DEFINER RPCs `void_certificate`, `restore_certificate_document`, and
// `log_certificate_event`. The client NEVER inserts/updates certificate rows;
// all writes go through those RPCs or the `generate-certificate` edge function
// (owned by 06's useIssueCertificate; not here).
//
// The four certificate tables are NOT in the generated Supabase types, so RPC
// results are cast exactly like Phase 4's useAdditionalInsureds.ts does
// (`as unknown as X`). Types are NOT regenerated here.
//
// React Query keys: ['certificates', accountId] and
// ['certificate-events', certificateId] (Section 9.1). Download/preview verify
// the stored pdf_sha256 (R5) before handing bytes to the user and log a
// 'downloaded'/'previewed' event fire-and-forget after the signed URL succeeds.
// ============================================================================

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { CertificateEvent, CertificateListItem } from '@/types/certificates';

// ---------------------------------------------------------------------------
// sha256 integrity helper (R5): hex digest of raw bytes via Web Crypto.
// ---------------------------------------------------------------------------

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Fire-and-forget: log a client-side view/download event; never blocks the UX. */
async function logEvent(
  certificateId: string,
  action: 'downloaded' | 'previewed',
): Promise<void> {
  const { error } = await supabase.rpc('log_certificate_event', {
    p_certificate_id: certificateId,
    p_action: action,
    p_metadata: {},
  });
  if (error) {
    // Non-fatal: the artifact already reached the user. Just record it.
    logger.warn('certificate event log failed', { certificateId, action, error });
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface UseCertificatesResult {
  certificates: CertificateListItem[];
  isLoading: boolean;
  refetch: () => Promise<void>;
  downloadCertificate: (cert: CertificateListItem) => Promise<void>;
  previewCertificate: (cert: CertificateListItem) => Promise<void>;
  voidCertificate: (id: string, reason: string) => Promise<boolean>;
  restoreDocument: (id: string) => Promise<boolean>;
  fetchEvents: (certificateId: string) => Promise<CertificateEvent[]>;
}

export function useCertificates(accountId: string): UseCertificatesResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['certificates', accountId],
    queryFn: async (): Promise<CertificateListItem[]> => {
      const { data, error } = await supabase.rpc('list_certificates', {
        p_account_id: accountId,
        p_limit: null,
      });
      if (error) throw error;
      // list_certificates is not in the generated types; bind its SETOF rows to
      // the reader contract (Section 9.1), matching the Phase 4 cast pattern.
      return (data || []) as unknown as CertificateListItem[];
    },
    enabled: !!accountId,
    staleTime: 30 * 1000,
  });

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['certificates', accountId] });
  }, [queryClient, accountId]);

  // -------------------------------------------------------------------------
  // Download: signed URL from the private coi-certificates bucket, fetch bytes,
  // VERIFY sha256 === cert.pdf_sha256 (abort + toast on mismatch, R5), save.
  // -------------------------------------------------------------------------
  const downloadCertificate = useCallback(
    async (cert: CertificateListItem): Promise<void> => {
      try {
        const { data, error } = await supabase.storage
          .from(cert.storage_bucket)
          .createSignedUrl(cert.storage_path, 3600);
        if (error || !data?.signedUrl) {
          toast.error('Could not open the certificate file.');
          return;
        }

        const res = await fetch(data.signedUrl);
        if (!res.ok) {
          toast.error('Could not download the certificate file.');
          return;
        }
        const bytes = await res.arrayBuffer();

        const digest = await sha256Hex(bytes);
        if (digest !== cert.pdf_sha256) {
          logger.error('certificate integrity check failed', {
            certificateId: cert.id,
            expected: cert.pdf_sha256,
            actual: digest,
          });
          toast.error(
            'Certificate download blocked: the file failed its integrity check.',
          );
          return;
        }

        const blob = new Blob([bytes], { type: 'application/pdf' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `${cert.certificate_number}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);

        void logEvent(cert.id, 'downloaded');
      } catch (err) {
        logger.error('certificate download error', err);
        toast.error('Could not download the certificate.');
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Preview: signed URL opened in a new tab (unverified view path); log it.
  // -------------------------------------------------------------------------
  const previewCertificate = useCallback(
    async (cert: CertificateListItem): Promise<void> => {
      try {
        const { data, error } = await supabase.storage
          .from(cert.storage_bucket)
          .createSignedUrl(cert.storage_path, 3600);
        if (error || !data?.signedUrl) {
          toast.error('Could not open the certificate file.');
          return;
        }
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        void logEvent(cert.id, 'previewed');
      } catch (err) {
        logger.error('certificate preview error', err);
        toast.error('Could not open the certificate.');
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Void: rpc void_certificate. Refetches the log on success.
  // -------------------------------------------------------------------------
  const voidCertificate = useCallback(
    async (id: string, reason: string): Promise<boolean> => {
      const { error } = await supabase.rpc('void_certificate', {
        p_certificate_id: id,
        p_reason: reason,
      });
      if (error) {
        toast.error(`Could not void certificate: ${error.message}`);
        return false;
      }
      toast.success('Certificate voided.');
      await refetch();
      return true;
    },
    [refetch],
  );

  // -------------------------------------------------------------------------
  // Restore to Documents: rpc restore_certificate_document. Invalidates the
  // Documents-tab query (['documents']) plus the log.
  // -------------------------------------------------------------------------
  const restoreDocument = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase.rpc('restore_certificate_document', {
        p_certificate_id: id,
      });
      if (error) {
        toast.error(`Could not restore to Documents: ${error.message}`);
        return false;
      }
      toast.success('Restored to the Documents tab.');
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
      ]);
      return true;
    },
    [refetch, queryClient],
  );

  // -------------------------------------------------------------------------
  // Events: lazy fetch on expand (['certificate-events', certificateId]).
  // -------------------------------------------------------------------------
  const fetchEvents = useCallback(
    async (certificateId: string): Promise<CertificateEvent[]> => {
      return queryClient.fetchQuery({
        queryKey: ['certificate-events', certificateId],
        queryFn: async (): Promise<CertificateEvent[]> => {
          // certificate_events is not in the generated types (drift); the `as any`
          // table cast mirrors useAutoDrivers.ts / useAutoVehicles.ts. RLS
          // (is_staff() + is_agency_member) still applies to the caller.
          const { data, error } = await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('certificate_events' as any)
            .select('*')
            .eq('certificate_id', certificateId)
            .order('created_at', { ascending: false });
          if (error) throw error;
          return (data || []) as unknown as CertificateEvent[];
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient],
  );

  return {
    certificates: query.data ?? [],
    isLoading: query.isLoading,
    refetch,
    downloadCertificate,
    previewCertificate,
    voidCertificate,
    restoreDocument,
    fetchEvents,
  };
}
