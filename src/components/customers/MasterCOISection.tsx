// Master COI panel (blueprint Section 2.2 + Section 6).
//
// The composition root for the Certificate of insurance panel on the customer
// record. It owns the single get_master_coi read query (via useMasterCoi), the
// one controlled coverage-line drawer, and the openLineKey state; every child
// block is a pure presenter fed from the read-model. It renders four honest
// states and never throws:
//   - loading: a content-shaped skeleton (header + five line tiles + insurer
//     table rows), never a bare spinner.
//   - empty:   one sentence + one action, when the account has no lines
//     (readiness.blockers includes 'no_lines').
//   - error:   the panel chrome plus a danger-toned inline error with a "Try
//     again" retry, never a blank card.
//   - data:    the full panel, rendering sparse or absent data honestly
//     ("Missing" / "Not on file"), never fabricated.
//
// Calm Command binding: cc-* tokens only; tabular figures via cc-num on every
// number; zero lime in this panel (the one lime primary in the whole feature is
// the drawer's Save button); provenance is small muted text, never a success
// pill; carriers are name Chips, never colored; no truncation (content wraps);
// no em/en dashes in code or copy. Dates render through formatLocalDateDisplay
// and edit through DateField, never a native date input (all inside children).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionLabel, Skeleton } from '@/components/cc';
import { useMasterCoi } from '@/hooks/useMasterCoi';
import { ReadinessPill } from '@/components/master-coi/ReadinessPill';
import { NamedInsuredBlock } from '@/components/master-coi/NamedInsuredBlock';
import { CoverageLineRow } from '@/components/master-coi/CoverageLineRow';
import { InsurerTablePreview } from '@/components/master-coi/InsurerTablePreview';
import { CertificateDefaultsBlock } from '@/components/master-coi/CertificateDefaultsBlock';
import { ReviewStampRow } from '@/components/master-coi/ReviewStampRow';
import { CoverageLineDrawer } from '@/components/master-coi/CoverageLineDrawer';
import type {
  COILineKey,
  COIReadinessBlocker,
  MasterCOI,
} from '@/types/master-coi';

export interface MasterCOISectionProps {
  accountId: string;
  accountName?: string;
}

/**
 * Minimal structural check on the get_master_coi payload. The RPC is bound
 * through an unchecked cast (untyped jsonb), so before the panel dereferences
 * its core sub-objects we confirm they exist. A partial payload is surfaced as
 * the honest error state rather than crashing render.
 */
function isWellFormed(data: MasterCOI | undefined): data is MasterCOI {
  return Boolean(
    data &&
      data.readiness &&
      Array.isArray(data.readiness.blockers) &&
      Array.isArray(data.readiness.warnings) &&
      data.named_insured &&
      data.lines &&
      Array.isArray(data.insurers) &&
      data.review &&
      data.description_of_operations,
  );
}

/** The five ACORD 25 coverage lines, rendered in this fixed order. */
const LINE_ORDER: Array<Exclude<COILineKey, 'other'>> = [
  'gl',
  'auto',
  'umbrella',
  'wc',
  'property',
];

/**
 * Panel shell: the Calm Command card recipe (Section 5). A styled container
 * rather than the shadcn Card so the cc-* surface, border, radius, padding, and
 * card shadow are applied verbatim and nothing pulls in a default color.
 */
function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      {children}
    </div>
  );
}

/** Panel header: icon + title + readiness pill (+ optional warnings suffix). */
function PanelHeader({
  accountId,
  right,
  readinessSlot,
}: {
  accountId: string;
  right?: React.ReactNode;
  readinessSlot?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
        <h3 className="text-base font-semibold text-cc-text-primary">
          Certificate of insurance
        </h3>
        {readinessSlot}
      </div>
      <div className="flex items-center gap-2">
        {right}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/certificates?accountId=${accountId}`)}
          className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
        >
          New certificate
        </Button>
      </div>
    </div>
  );
}

/**
 * Content-shaped loading state (Section 6). Header row + five coverage-line
 * sized tiles + a three-row insurer-table skeleton. Never a bare spinner.
 */
function LoadingSkeleton({ accountId }: { accountId: string }) {
  return (
    <PanelShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-24 rounded-pill" />
          </div>
          <Skeleton className="h-8 w-32 rounded-cc-md" />
        </div>

        <div className="space-y-3">
          {LINE_ORDER.map((key) => (
            <div
              key={key}
              className="space-y-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-cc-md border border-cc-border-subtle p-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </PanelShell>
  );
}

/**
 * Error state (Section 6). Renders the panel chrome plus a danger-toned inline
 * error and a ghost "Try again" retry, never a blank card.
 */
function ErrorState({
  accountId,
  onRetry,
}: {
  accountId: string;
  onRetry: () => void;
}) {
  return (
    <PanelShell>
      <div className="space-y-4">
        <PanelHeader accountId={accountId} />
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-cc-md border border-cc-danger bg-cc-surface-raised p-3"
          role="alert"
        >
          <div className="inline-flex items-start gap-2 text-sm text-cc-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-words">
              This customer's certificate profile could not be loaded.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            Try again
          </Button>
        </div>
      </div>
    </PanelShell>
  );
}

/**
 * Empty state (Section 6). One sentence + one outline action. Shown when the
 * account has no coverage lines (readiness carries the 'no_lines' blocker).
 */
function EmptyState({ accountId }: { accountId: string }) {
  return (
    <PanelShell>
      <div className="space-y-4">
        <PanelHeader accountId={accountId} />
        <div className="space-y-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-4">
          <p className="text-sm text-cc-text-secondary">
            Add a policy to build this customer's certificate profile.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              document
                .getElementById('policies')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
            className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            Go to policies
          </Button>
        </div>
      </div>
    </PanelShell>
  );
}

/**
 * Unclassified-policies block (Section 6). Rendered only when lines.other is
 * non-empty. These policies are not classified into a certificate line and will
 * not print; we surface them honestly rather than hiding them.
 */
function UnclassifiedPoliciesBlock({ data }: { data: MasterCOI }) {
  const other = data.lines.other ?? [];
  if (other.length === 0) return null;

  return (
    <div className="space-y-2">
      <SectionLabel>Unclassified policies</SectionLabel>
      <div className="space-y-2">
        {other.map((entry) => {
          const carrier = (entry.carrier ?? '').trim();
          const policyNumber = (entry.policy_number ?? '').trim();
          const status = (entry.status ?? '').trim();
          return (
            <div
              key={entry.policy_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3 text-sm"
            >
              {policyNumber ? (
                <span className="cc-num font-mono text-cc-text-secondary">
                  {policyNumber}
                </span>
              ) : (
                <span className="text-cc-text-muted">Unnumbered policy</span>
              )}
              {carrier && (
                <span className="break-words text-cc-text-secondary">{carrier}</span>
              )}
              {status && (
                <span className="text-cc-text-muted">{status}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-cc-text-muted">
        These policies are not classified into a certificate line and will not
        print.
      </p>
    </div>
  );
}

/**
 * Issuance-log placeholder (Section 6). The compact CertificateIssuanceLog is
 * owned by doc 04 and not yet built; this is an honest stand-in, not a parallel
 * log. Swap for the real component when 04 ships.
 */
function IssuanceLogPlaceholder({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  // TODO(04): replace with CertificateIssuanceLog compact variant
  //   <CertificateIssuanceLog accountId={accountId} variant="compact" limit={5} />
  return (
    <div className="space-y-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3">
      <SectionLabel>Recent certificates</SectionLabel>
      <p className="text-sm text-cc-text-muted">
        Certificate history appears here once certificates are issued.
      </p>
      <button
        type="button"
        onClick={() => navigate(`/certificates?accountId=${accountId}#issuance-log`)}
        className="text-sm text-cc-text-secondary underline-offset-2 hover:text-cc-text-primary hover:underline"
      >
        View all certificates
      </button>
    </div>
  );
}

export function MasterCOISection({ accountId }: MasterCOISectionProps) {
  const { data, isLoading, error, refetch } = useMasterCoi(accountId);
  const [openLineKey, setOpenLineKey] = useState<COILineKey | null>(null);

  // Group blockers by line once so each row gets only its own, and the "Review
  // blockers" action can jump to the first blocked line.
  const blockersByLine = useMemo(() => {
    const map = new Map<Exclude<COILineKey, 'other'>, COIReadinessBlocker[]>();
    for (const key of LINE_ORDER) map.set(key, []);
    for (const blocker of data?.readiness?.blockers ?? []) {
      const line = blocker.line;
      if (line && line !== 'other' && map.has(line)) {
        map.get(line)!.push(blocker);
      }
    }
    return map;
  }, [data]);

  const firstBlockedLineKey = useMemo(() => {
    for (const key of LINE_ORDER) {
      if ((blockersByLine.get(key)?.length ?? 0) > 0) return key;
    }
    return null;
  }, [blockersByLine]);

  if (isLoading) return <LoadingSkeleton accountId={accountId} />;
  // Treat a malformed payload the same as a fetch error rather than throwing in
  // render: get_master_coi is bound through an unchecked cast, so guard that the
  // core sub-objects this panel dereferences are actually present.
  if (error || !isWellFormed(data)) {
    return <ErrorState accountId={accountId} onRetry={() => refetch()} />;
  }

  const hasNoLines = data.readiness.blockers.some((b) => b.code === 'no_lines');
  if (hasNoLines) return <EmptyState accountId={accountId} />;

  const warningCount = data.readiness.warnings.length;
  const isReady = data.readiness.ready;

  // "Review blockers" scrolls to the first blocked line row and opens its drawer.
  const reviewBlockers = () => {
    if (!firstBlockedLineKey) return;
    document
      .getElementById(`master-coi-line-${firstBlockedLineKey}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setOpenLineKey(firstBlockedLineKey);
  };

  const readinessSuffix = isReady ? (
    warningCount > 0 ? (
      <span className="cc-num text-xs text-cc-text-muted">
        {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
      </span>
    ) : null
  ) : (
    <button
      type="button"
      onClick={reviewBlockers}
      className="text-sm text-cc-text-secondary underline-offset-2 hover:text-cc-text-primary hover:underline"
    >
      Review blockers
    </button>
  );

  return (
    <>
      <PanelShell>
        <div className="space-y-4">
          <PanelHeader
            accountId={accountId}
            readinessSlot={
              <div className="flex flex-wrap items-center gap-2">
                <ReadinessPill readiness={data.readiness} />
                {readinessSuffix}
              </div>
            }
          />

          <NamedInsuredBlock named={data.named_insured} accountId={accountId} />

          <div className="space-y-3">
            {LINE_ORDER.map((key) => (
              <div key={key} id={`master-coi-line-${key}`} className="scroll-mt-24">
                <CoverageLineRow
                  lineKey={key}
                  line={data.lines[key]}
                  insurers={data.insurers}
                  blockers={blockersByLine.get(key) ?? []}
                  onEdit={(lineKey) => setOpenLineKey(lineKey)}
                />
              </div>
            ))}
          </div>

          <UnclassifiedPoliciesBlock data={data} />

          <InsurerTablePreview
            insurers={data.insurers}
            overflow={data.insurer_overflow ?? []}
          />

          <CertificateDefaultsBlock
            accountId={accountId}
            ops={data.description_of_operations}
          />

          <ReviewStampRow accountId={accountId} review={data.review} />

          <IssuanceLogPlaceholder accountId={accountId} />
        </div>
      </PanelShell>

      <CoverageLineDrawer
        accountId={accountId}
        open={openLineKey !== null}
        lineKey={openLineKey}
        masterCoi={data}
        onClose={() => setOpenLineKey(null)}
      />
    </>
  );
}
