// ============================================================================
// BOUND TERMS CARD (Commercial Lines SOW v3, closing rigor - policy checking)
// ============================================================================
// Renders only when this policy has a 'bound' submission event: each term
// the bind wrote is compared against the policy's live blob value. Match is
// quiet; DRIFTED means the file no longer says what was bound (carrier
// issued different limits, a manual edit, or an extraction overwrite) and
// warrants a look; MISSING means the bound value has since been emptied.
// Extraction-independent today; extraction landing later makes the diff
// sharper, not required. Calm Command: cc-* tokens, tabular figures.
// ============================================================================

import { ShieldCheck } from 'lucide-react';
import { usePolicyBoundEvents } from '@/hooks/useCommercialPipeline';
import { compareBoundTerms } from '@/lib/commercial/boundCheck';

const fmt = (v: unknown): string => {
  if (v == null || v === '') return 'empty';
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (Number.isFinite(n) && String(v).trim() !== '') return `$${n.toLocaleString('en-US')}`;
  return String(v);
};

export function BoundTermsCard({
  policyId,
  policy,
}: {
  policyId: string;
  policy: Record<string, unknown> | null;
}) {
  const { data: events = [] } = usePolicyBoundEvents(policyId);
  const bound = events[0];
  if (!bound) return null;

  const rows = compareBoundTerms(bound.metadata, policy);
  if (rows.length === 0) return null;

  const drifted = rows.filter((r) => r.state !== 'match');
  const boundDate = new Date(bound.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-cc-text-primary">Bound terms check</h3>
        <span className="text-xs text-cc-text-muted">bound {boundDate}</span>
        {drifted.length === 0 ? (
          <span className="ml-auto inline-flex items-center rounded-pill bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            matches the bind
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center rounded-pill bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
            {drifted.length} of {rows.length} changed since bind
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.path} className="flex flex-wrap items-center gap-2.5 text-sm">
            <span className="text-cc-text-secondary">{r.label}</span>
            <span className="cc-num text-cc-text-primary [font-variant-numeric:tabular-nums]">{fmt(r.value)}</span>
            {r.state === 'match' ? (
              <span className="text-xs text-cc-text-muted">matches</span>
            ) : r.state === 'drifted' ? (
              <span className="inline-flex items-center rounded-pill bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                now {fmt(r.current)}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-pill bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                missing on the policy
              </span>
            )}
          </li>
        ))}
      </ul>

      {drifted.length > 0 && (
        <p className="mt-3 text-xs text-cc-text-muted">
          The policy no longer says what was bound. Check the issued policy against the quote,
          then either correct the line details below or document the change.
        </p>
      )}
    </div>
  );
}
