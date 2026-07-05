// ============================================================================
// CLIENT INTAKE CARD (staff side of the intake portal - SOW v3 feeder #3)
// ============================================================================
// Mint/revoke tokenized intake links and review the STAGED client submissions
// field by field (proposed vs current). Apply writes the profile through the
// standard save with provenance src='client' for every applied field; nothing
// the client sent touches the record before this review (Invariant 4).
// Calm Command: cc-* tokens, NO lime, tabular figures, no em or en dashes.
// ============================================================================

import { useMemo, useState } from 'react';
import { Copy, Link2, UserRoundCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { maskTaxId } from '@/components/cc/mask';
import {
  intakePortalUrl,
  useCreateIntakeLink,
  useIntakeLinks,
  useIntakeSubmissions,
  useRevokeIntakeLink,
  useSetIntakeSubmissionStatus,
  type IntakeStagedSubmission,
} from '@/hooks/useCommercialIntake';
import {
  useCommercialProfile,
  useSaveCommercialProfile,
  type CommercialProfileInput,
} from '@/hooks/useCommercialProfile';

const FIELD_LABEL: Record<string, string> = {
  legal_name: 'Legal name',
  dba: 'DBA',
  fein: 'FEIN',
  entity_type: 'Entity type',
  naics_code: 'NAICS',
  years_in_business: 'Years in business',
  employee_count: 'Employees',
  annual_revenue: 'Annual revenue',
  website: 'Website',
  description_of_operations: 'Operations',
};

const isoToUs = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};

export function ClientIntakeCard({ accountId }: { accountId: string }) {
  const { data: links = [] } = useIntakeLinks(accountId);
  const { data: staged = [] } = useIntakeSubmissions(accountId);
  const { data: profile } = useCommercialProfile(accountId);
  const createLink = useCreateIntakeLink();
  const revokeLink = useRevokeIntakeLink();
  const setStatus = useSetIntakeSubmissionStatus();
  const saveProfile = useSaveCommercialProfile();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const activeLinks = useMemo(
    () => links.filter((l) => !l.revoked_at && new Date(l.expires_at).getTime() > Date.now()),
    [links],
  );
  const pending = useMemo(() => staged.filter((s) => s.status === 'pending'), [staged]);

  const handleCreate = () => {
    createLink.mutate(
      { accountId },
      {
        onSuccess: (res) => {
          void navigator.clipboard.writeText(intakePortalUrl(res.token));
          toast.success('Link copied to the clipboard. Send it to the client.');
        },
      },
    );
  };

  const handleApply = (row: IntakeStagedSubmission) => {
    setApplyingId(row.id);
    const changes = row.payload as CommercialProfileInput;
    const sources = Object.fromEntries(Object.keys(row.payload).map((k) => [k, 'client' as const]));
    saveProfile.mutate(
      { accountId, existing: profile ?? null, changes, sources },
      {
        onSuccess: () =>
          setStatus.mutate(
            { accountId, stagedId: row.id, status: 'applied' },
            { onSettled: () => setApplyingId(null) },
          ),
        onError: () => setApplyingId(null),
      },
    );
  };

  const display = (key: string, value: unknown): string => {
    if (value == null || value === '') return '';
    if (key === 'fein') return maskTaxId(String(value));
    if (key === 'annual_revenue') return `$${Number(value).toLocaleString('en-US')}`;
    return String(value);
  };

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserRoundCheck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-cc-text-primary">Client intake</h3>
          {pending.length > 0 && (
            <span className="inline-flex items-center rounded-pill bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
              {pending.length} to review
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCreate}
          disabled={createLink.isPending}
          className="text-cc-text-secondary hover:text-cc-text-primary"
        >
          <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {createLink.isPending ? 'Creating' : 'New intake link'}
        </Button>
      </div>

      {/* Active links */}
      {activeLinks.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {activeLinks.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-cc-text-muted">Link expires</span>
              <span className="cc-num text-cc-text-secondary [font-variant-numeric:tabular-nums]">
                {isoToUs(l.expires_at)}
              </span>
              {l.last_submitted_at && (
                <span className="text-cc-text-muted">
                  last submission {isoToUs(l.last_submitted_at)}
                </span>
              )}
              <Button
                variant="ghost" size="sm"
                onClick={() => { void navigator.clipboard.writeText(intakePortalUrl(l.token)); toast.success('Link copied'); }}
                className="text-cc-text-secondary hover:text-cc-text-primary"
              >
                <Copy className="mr-1 h-3 w-3" aria-hidden="true" /> Copy
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => revokeLink.mutate({ accountId, linkId: l.id })}
                disabled={revokeLink.isPending}
                className="text-cc-text-muted hover:text-destructive"
              >
                <X className="mr-1 h-3 w-3" aria-hidden="true" /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Staged submissions */}
      {pending.length === 0 ? (
        <p className="text-sm text-cc-text-muted">
          {activeLinks.length > 0
            ? 'Waiting on the client. Submissions land here for your review.'
            : 'Create a link and send it to the client; what they fill in lands here for review before anything is saved.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map((row) => (
            <li key={row.id} className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-cc-text-primary">
                  Client submission{' '}
                  <span className="cc-num font-normal text-cc-text-muted [font-variant-numeric:tabular-nums]">
                    {isoToUs(row.submitted_at)}
                  </span>
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => handleApply(row)}
                    disabled={applyingId === row.id || saveProfile.isPending}
                  >
                    {applyingId === row.id ? 'Applying' : 'Apply all'}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setStatus.mutate({ accountId, stagedId: row.id, status: 'dismissed' })}
                    disabled={setStatus.isPending}
                    className="text-cc-text-muted hover:text-cc-text-primary"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                {Object.entries(row.payload).map(([key, value]) => {
                  const current = (profile as Record<string, unknown> | null | undefined)?.[key];
                  const changed = String(current ?? '') !== String(value ?? '');
                  return (
                    <div key={key} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="w-36 shrink-0 text-xs font-medium text-cc-text-muted">
                        {FIELD_LABEL[key] ?? key}
                      </span>
                      <span className={changed ? 'text-cc-text-primary' : 'text-cc-text-secondary'}>
                        {display(key, value)}
                      </span>
                      {changed && current != null && String(current) !== '' && (
                        <span className="text-xs text-cc-text-muted line-through">
                          {display(key, current)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {row.client_note && (
                  <div className="mt-1 text-sm text-cc-text-secondary">
                    <span className="text-xs font-medium text-cc-text-muted">Client note: </span>
                    {row.client_note}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
