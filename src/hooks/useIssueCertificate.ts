// ============================================================================
// ISSUE CERTIFICATE MUTATION (blueprint D Section 5.2, R1)
// ============================================================================
// Thin supabase.functions.invoke('generate-certificate') wrapper. The server
// (04's generate-certificate) rebuilds everything from DB truth: re-reads
// get_master_coi, calls resolve_holder_endorsements, enforces readiness (R6),
// recomputes letters (R7), fills the PDF with 05's Deno port, uploads to the
// private coi-certificates bucket, and commits via the service-role-only
// finalize_certificate_issue. The client does ZERO storage/DB writes: NO pdfBytes,
// NO storage upload, NO documents insert, NO certificate insert (R1).
//
// Request/response types come from src/types/certificates.ts (04 owns them).
//
// Error mapping (blueprint D Section 7.6):
//   422 -> structured issue list for the ValidationStrip (parsed from the body).
//   409 -> the re-preview flow (data changed since preview, R9).
//   5xx/network -> a generic transport failure.
// The thrown IssueCertificateError carries { status, issues } so the page routes
// the failure without re-parsing the Response.
//
// On success invalidate ['certificates', accountId], ['documents'],
// ['master-coi', accountId] (blueprint D Section 8).
// ============================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type {
  GenerateCertificateRequest,
  GenerateCertificateResponse,
} from '@/types/certificates';

/** One structured issue as returned in a 422 body (05 / 04 shared vocabulary). */
export interface IssueCertificateIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  lineKey?: string;
}

/** A typed failure that preserves the HTTP status and any structured issues. */
export class IssueCertificateError extends Error {
  readonly status: number | null;
  readonly issues: IssueCertificateIssue[];

  constructor(message: string, status: number | null, issues: IssueCertificateIssue[]) {
    super(message);
    this.name = 'IssueCertificateError';
    this.status = status;
    this.issues = issues;
  }
}

/**
 * supabase-js FunctionsHttpError carries the raw Response on `context`. Pull the
 * status and parse the JSON body for a structured issue list (422) or a message.
 */
async function toIssueError(error: unknown): Promise<IssueCertificateError> {
  const ctx = (error as { context?: unknown } | null)?.context;
  const response = ctx instanceof Response ? ctx : null;
  const status = response?.status ?? null;

  let issues: IssueCertificateIssue[] = [];
  let message =
    error instanceof Error ? error.message : 'Certificate generation failed.';

  if (response) {
    try {
      const body = (await response.clone().json()) as {
        issues?: IssueCertificateIssue[];
        error?: string;
        message?: string;
      };
      if (Array.isArray(body.issues)) issues = body.issues;
      if (body.error) message = body.error;
      else if (body.message) message = body.message;
    } catch {
      // Body was not JSON; keep the default message.
    }
  }

  return new IssueCertificateError(message, status, issues);
}

export function useIssueCertificate(): UseMutationResult<
  GenerateCertificateResponse,
  IssueCertificateError,
  GenerateCertificateRequest
> {
  const queryClient = useQueryClient();

  return useMutation<
    GenerateCertificateResponse,
    IssueCertificateError,
    GenerateCertificateRequest
  >({
    mutationFn: async (body: GenerateCertificateRequest) => {
      const { data, error } = await supabase.functions.invoke<GenerateCertificateResponse>(
        'generate-certificate',
        { body },
      );
      if (error) {
        const mapped = await toIssueError(error);
        logger.warn('generate-certificate failed', {
          status: mapped.status,
          issueCount: mapped.issues.length,
        });
        throw mapped;
      }
      if (!data) {
        throw new IssueCertificateError('The server returned no certificate.', null, []);
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['certificates', variables.account_id] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['master-coi', variables.account_id] });
    },
  });
}
