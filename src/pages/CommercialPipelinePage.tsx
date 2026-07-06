// ============================================================================
// COMMERCIAL PIPELINE (Commercial Lines SOW v3, closing rigor)
// ============================================================================
// One destination for running the commercial desk: the submission funnel,
// per-carrier hit ratio, created-to-bound cycle time, and the 90/60/30
// renewal runway over the commercial book. Every runway row links to the
// policy (Remarket lives there) and the customer. Read-only aggregation -
// the calcs are pure and unit-tested in lib/commercial/pipeline.ts.
// Calm Command: cc-* tokens, NO lime except the single page action, cc-num
// tabular figures, no em or en dashes, content-shaped loading.
// ============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CalendarClock, Target } from 'lucide-react';
import {
  useCommercialRunwayPolicies,
  usePipelineBoundTimes,
  usePipelineQuotes,
  usePipelineSubmissions,
} from '@/hooks/useCommercialPipeline';
import {
  FUNNEL_STAGES,
  carrierHitRatio,
  funnelCounts,
  localDateIso,
  medianDaysToBind,
  renewalRunway,
  type RunwayBucket,
} from '@/lib/commercial/pipeline';

const STAGE_LABELS: Record<(typeof FUNNEL_STAGES)[number], string> = {
  draft: 'Draft',
  intake: 'Intake',
  packet_ready: 'Packet ready',
  signing: 'Signing',
  submitted: 'Submitted',
  quoted: 'Quoted',
  proposed: 'Proposed',
  bound: 'Bound',
  lost: 'Lost',
  abandoned: 'Abandoned',
};

const money = (n: number | null | undefined): string =>
  n == null ? '' : `$${Number(n).toLocaleString('en-US')}`;

const BUCKET_STYLES: Record<RunwayBucket, string> = {
  overdue: 'bg-destructive/10 text-destructive',
  '30': 'bg-warning/10 text-warning',
  '60': 'bg-cc-surface-overlay text-cc-text-primary',
  '90': 'bg-cc-surface-overlay text-cc-text-secondary',
  later: 'bg-cc-surface-overlay text-cc-text-muted',
};

const bucketLabel = (bucket: RunwayBucket, daysOut: number): string =>
  bucket === 'overdue' ? `${Math.abs(daysOut)}d past` : `${daysOut}d`;

export default function CommercialPipelinePage() {
  const { data: submissions = [], isLoading: subsLoading } = usePipelineSubmissions();
  const { data: quotes = [], isLoading: quotesLoading } = usePipelineQuotes();
  const { data: policies = [], isLoading: runwayLoading } = useCommercialRunwayPolicies();
  const { data: boundTimes = {} } = usePipelineBoundTimes();

  const funnel = useMemo(() => funnelCounts(submissions), [submissions]);
  const carriers = useMemo(() => carrierHitRatio(quotes), [quotes]);
  const cycleDays = useMemo(() => medianDaysToBind(submissions, boundTimes), [submissions, boundTimes]);
  const runway = useMemo(
    () => renewalRunway(policies, localDateIso(new Date())),
    [policies],
  );

  const loading = subsLoading || quotesLoading || runwayLoading;
  const activeFunnel = funnel.filter((f) => !['lost', 'abandoned'].includes(f.stage));
  const closedFunnel = funnel.filter((f) => ['lost', 'abandoned'].includes(f.stage));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-cc-text-muted" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-semibold text-cc-text-primary">Commercial pipeline</h1>
          <p className="text-sm text-cc-text-muted">
            Submissions, hit ratio, and the renewal runway across the commercial book.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-cc-xl bg-cc-surface-raised" />
          ))}
        </div>
      ) : (
        <>
          {/* Funnel */}
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold text-cc-text-primary">Submission funnel</h2>
            <div className="flex flex-wrap gap-2">
              {activeFunnel.map((f) => (
                <div key={f.stage} className="min-w-24 rounded-cc-md border border-cc-border-subtle px-3 py-2">
                  <div className="cc-num text-lg font-semibold text-cc-text-primary [font-variant-numeric:tabular-nums]">
                    {f.count}
                  </div>
                  <div className="text-xs text-cc-text-muted">{STAGE_LABELS[f.stage]}</div>
                </div>
              ))}
              <div className="ml-auto flex gap-2">
                {closedFunnel.map((f) => (
                  <div key={f.stage} className="min-w-20 rounded-cc-md px-3 py-2">
                    <div className="cc-num text-lg font-semibold text-cc-text-muted [font-variant-numeric:tabular-nums]">
                      {f.count}
                    </div>
                    <div className="text-xs text-cc-text-muted">{STAGE_LABELS[f.stage]}</div>
                  </div>
                ))}
              </div>
            </div>
            {submissions.length === 0 && (
              <p className="mt-3 text-sm text-cc-text-muted">
                No submissions yet. Start one from a business customer's Commercial section
                or with Remarket on a commercial policy.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Hit ratio by carrier */}
            <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-cc-text-primary">Hit ratio by carrier</h2>
              </div>
              {carriers.length === 0 ? (
                <p className="text-sm text-cc-text-muted">No submission quotes recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-cc-text-muted">
                      <th className="pb-2 font-medium">Carrier</th>
                      <th className="pb-2 text-right font-medium">Quoted</th>
                      <th className="pb-2 text-right font-medium">Won</th>
                      <th className="pb-2 text-right font-medium">Hit ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carriers.map((c) => (
                      <tr key={c.carrier} className="border-t border-cc-border-subtle">
                        <td className="py-2 text-cc-text-primary">{c.carrier}</td>
                        <td className="cc-num py-2 text-right text-cc-text-secondary [font-variant-numeric:tabular-nums]">{c.quoted}</td>
                        <td className="cc-num py-2 text-right text-cc-text-secondary [font-variant-numeric:tabular-nums]">{c.won}</td>
                        <td className="cc-num py-2 text-right text-cc-text-primary [font-variant-numeric:tabular-nums]">
                          {c.ratio == null ? 'open' : `${Math.round(c.ratio * 100)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Cycle time */}
            <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-cc-text-primary">Cycle time</h2>
              </div>
              <div className="cc-num text-3xl font-semibold text-cc-text-primary [font-variant-numeric:tabular-nums]">
                {cycleDays == null ? 'n/a' : `${cycleDays}d`}
              </div>
              <p className="mt-1 text-sm text-cc-text-muted">
                Median days from submission created to bound
                {cycleDays == null ? ' - shows once the first submission binds.' : '.'}
              </p>
            </div>
          </div>

          {/* Renewal runway */}
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
            <h2 className="mb-1 text-sm font-semibold text-cc-text-primary">Renewal runway (next 120 days)</h2>
            <p className="mb-3 text-xs text-cc-text-muted">
              The 90/60/30 checkpoints on the commercial book. Open the policy to remarket it;
              E&S placements need the 90-day head start.
            </p>
            {runway.length === 0 ? (
              <p className="text-sm text-cc-text-muted">Nothing expiring in the window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-cc-text-muted">
                      <th className="pb-2 font-medium">Due</th>
                      <th className="pb-2 font-medium">X-date</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">Policy</th>
                      <th className="pb-2 font-medium">Carrier</th>
                      <th className="pb-2 font-medium">Line</th>
                      <th className="pb-2 text-right font-medium">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runway.map(({ policy: p, daysOut, bucket }) => (
                      <tr key={p.id} className="border-t border-cc-border-subtle">
                        <td className="py-2">
                          <span className={`cc-num inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium [font-variant-numeric:tabular-nums] ${BUCKET_STYLES[bucket]}`}>
                            {bucketLabel(bucket, daysOut)}
                          </span>
                        </td>
                        <td className="cc-num py-2 text-cc-text-secondary [font-variant-numeric:tabular-nums]">
                          {p.expiration_date}
                        </td>
                        <td className="py-2">
                          {p.account ? (
                            <Link to={`/customers/${p.account.id}`} className="text-cc-text-primary hover:underline">
                              {p.account.name || '(unnamed)'}
                            </Link>
                          ) : (
                            <span className="text-cc-text-muted">(no customer)</span>
                          )}
                        </td>
                        <td className="py-2">
                          <Link to={`/policies/${p.id}`} className="cc-num text-cc-text-primary hover:underline [font-variant-numeric:tabular-nums]">
                            {p.policy_number || '(no number)'}
                          </Link>
                        </td>
                        <td className="py-2 text-cc-text-secondary">{p.carrier || ''}</td>
                        <td className="py-2 text-cc-text-secondary">{p.line_of_business || ''}</td>
                        <td className="cc-num py-2 text-right text-cc-text-primary [font-variant-numeric:tabular-nums]">
                          {money(p.premium)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
