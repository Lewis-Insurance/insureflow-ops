// Condensed Master COI card for the customer record.
//
// The customer page shows only a compact summary of the certificate profile:
// readiness, named insured, how many coverage lines are ready, the carriers, and
// when it was last reviewed. The full editable Master COI (all lines, the
// coverage-line drawer, insurer table, certificate defaults) lives on its own
// page at /master-coi/:accountId, reached via "Open full Master COI" - the same
// pattern as "View full policy". This keeps the record scannable and moves the
// heavy panel to a dedicated surface.
//
// Calm Command binding: cc-* tokens only, tabular figures via cc-num, carriers as
// name Chips (never colored), readiness via the shared ReadinessPill, no lime here
// (the one lime primary in the feature is the drawer's Save on the full page).

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/cc';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { useMasterCoi } from '@/hooks/useMasterCoi';
import { ReadinessPill } from '@/components/master-coi/ReadinessPill';
import type { COILineKey } from '@/types/master-coi';

export interface MasterCOISummaryCardProps {
  accountId: string;
  accountName?: string;
}

/** The five ACORD 25 coverage lines (the unclassified `other` bucket excluded). */
const LINE_ORDER: Array<Exclude<COILineKey, 'other'>> = [
  'gl',
  'auto',
  'umbrella',
  'wc',
  'property',
];

/** Calm Command card recipe, matching the full panel's shell verbatim. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      {children}
    </div>
  );
}

export function MasterCOISummaryCard({ accountId }: MasterCOISummaryCardProps) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useMasterCoi(accountId);

  const summary = useMemo(() => {
    if (!data) return null;
    const blockedLines = new Set(
      (data.readiness?.blockers ?? [])
        .map((b) => b.line)
        .filter(
          (l): l is Exclude<COILineKey, 'other'> => Boolean(l) && l !== 'other',
        ),
    );
    const present = LINE_ORDER.filter((k) => data.lines?.[k]?.present);
    const ready = present.filter((k) => !blockedLines.has(k));
    const carriers = (data.insurers ?? [])
      .map((i) => (i.name?.v ?? '').trim())
      .filter(Boolean);
    return {
      presentCount: present.length,
      readyCount: ready.length,
      carriers,
      lastReviewed: data.review?.last_reviewed_at ?? null,
    };
  }, [data]);

  const openFull = () => navigate(`/master-coi/${accountId}`);
  const generate = () => navigate(`/certificates?accountId=${accountId}`);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
        <h3 className="text-base font-semibold text-cc-text-primary">
          Certificate of insurance
        </h3>
        {data?.readiness && <ReadinessPill readiness={data.readiness} />}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={openFull}
        className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
      >
        Open full Master COI
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <Shell>
        <div className="space-y-3">
          {header}
          <p className="text-sm text-cc-text-muted">
            Loading certificate profile...
          </p>
        </div>
      </Shell>
    );
  }

  if (error || !data || !summary) {
    return (
      <Shell>
        <div className="space-y-3">
          {header}
          <p className="text-sm text-cc-text-muted">
            Certificate profile could not be loaded. Open the full Master COI to
            review.
          </p>
        </div>
      </Shell>
    );
  }

  const namedInsured = (data.named_insured?.name?.v ?? '').trim();
  const { presentCount, readyCount, carriers, lastReviewed } = summary;
  const shownCarriers = carriers.slice(0, 3);
  const extraCarriers = carriers.length - shownCarriers.length;

  return (
    <Shell>
      <div className="space-y-4">
        {header}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-cc-text-muted">
              Named insured
            </div>
            <div className="break-words text-sm text-cc-text-primary">
              {namedInsured || (
                <span className="text-cc-text-muted">Not on file</span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-cc-text-muted">
              Coverage lines
            </div>
            <div className="cc-num text-sm text-cc-text-primary">
              {presentCount === 0 ? (
                <span className="text-cc-text-muted">None yet</span>
              ) : (
                `${readyCount} of ${presentCount} ready`
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-cc-text-muted">
              Last reviewed
            </div>
            <div className="cc-num text-sm text-cc-text-primary">
              {lastReviewed ? (
                formatLocalDateDisplay(lastReviewed)
              ) : (
                <span className="text-cc-text-muted">Never</span>
              )}
            </div>
          </div>
        </div>

        {carriers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {shownCarriers.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
            {extraCarriers > 0 && (
              <span className="text-xs text-cc-text-muted">
                +{extraCarriers} more
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Award className="h-4 w-4" aria-hidden="true" />
            Generate COI
          </Button>
        </div>
      </div>
    </Shell>
  );
}
