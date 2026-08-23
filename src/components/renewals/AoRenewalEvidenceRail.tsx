import { useNavigate } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { AoRenewalExtractSignalLink } from '@/components/renewals/AoRenewalExtractSignalLink';
import type { AoRenewalEvidence } from '@/lib/aoRenewalEvidence';

interface AoRenewalEvidenceRailProps {
  evidence: AoRenewalEvidence | null | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onLogContact?: () => void;
}

const chipClass = 'inline-flex min-h-6 items-center rounded-full bg-cc-surface-overlay px-2.5 py-1 text-xs leading-none text-cc-text-secondary tabular-nums';

function formatEvidenceDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function AoRenewalEvidenceRail({ evidence, isLoading = false, isError = false, onLogContact }: AoRenewalEvidenceRailProps) {
  const navigate = useNavigate();

  if (isError) return null;
  if (isLoading || !evidence) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Loading renewal evidence">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="h-6 w-20 animate-pulse rounded-full bg-cc-skeleton-base motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  const decDate = formatEvidenceDate(evidence.dec.newestAt);
  const decTitle = evidence.dec.state === 'none'
    ? 'No current dec on file'
    : decDate
      ? `Newest dec: ${decDate}`
      : 'Current dec proven by this-term extract';
  const touchDate = formatEvidenceDate(evidence.touch.lastTouchAt);
  const extractLabel = evidence.extract?.label ?? 'No extract';
  const quoteLabel = evidence.openQuoteCount === 0
    ? 'No quotes'
    : `${evidence.openQuoteCount} ${evidence.openQuoteCount === 1 ? 'quote' : 'quotes'} in`;
  const itemsLabel = evidence.items
    ? evidence.items.missingCount > 0
      ? `${evidence.items.missingCount} ${evidence.items.missingCount === 1 ? 'item' : 'items'} missing`
      : evidence.items.inReviewCount > 0
        ? `${evidence.items.inReviewCount} in review`
        : 'All items in'
    : null;
  const touchLabel = evidence.touch.state === 'today'
    ? 'Touched today'
    : evidence.touch.state === 'never'
      ? 'Never touched'
      : evidence.touch.state === 'stale'
        ? `No touch ${evidence.touch.daysAgo}d`
        : `Touched ${evidence.touch.daysAgo}d ago`;
  const isConfirmAction = evidence.nextHole.kind === 'confirm_extract';

  const runAction = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (evidence.nextHole.kind === 'ready' || evidence.nextHole.kind === 'confirm_extract') return;
    if (evidence.nextHole.kind === 'log_contact' && onLogContact) {
      onLogContact();
      return;
    }
    navigate(evidence.nextHole.href);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      <span className={chipClass} title={decTitle}>
        {evidence.dec.state === 'on_file' ? 'Dec on file' : 'No dec'}
      </span>

      {evidence.extract ? (
        <span
          className={isConfirmAction
            ? '[&>button]:m-0'
            : '[&>button]:m-0 [&>button]:rounded-full [&>button]:bg-cc-surface-overlay [&>button]:px-2.5 [&>button]:py-1 [&>button]:font-normal [&>button]:text-cc-text-secondary [&>button:hover]:text-cc-text-primary'}
          title="Extract matched this term"
        >
          <AoRenewalExtractSignalLink signal={evidence.extract} />
        </span>
      ) : (
        <span className={chipClass}>{extractLabel}</span>
      )}

      <span className={chipClass} title="Open quotes on this line">{quoteLabel}</span>
      {itemsLabel && (
        <span
          className={chipClass}
          title={`Checklist: ${evidence.items!.missingCount + evidence.items!.inReviewCount} of ${evidence.items!.totalCount} outstanding`}
        >
          {itemsLabel}
        </span>
      )}
      <span className={chipClass} title={touchDate ? `Last touch: ${touchDate}` : 'No client touch recorded'}>{touchLabel}</span>

      {evidence.nextHole.kind === 'ready' ? (
        <span className="inline-flex min-h-6 items-center rounded-full bg-cc-success/10 px-2.5 py-1 text-xs font-medium leading-none text-cc-success">Ready</span>
      ) : !isConfirmAction ? (
        <button
          type="button"
          onClick={runAction}
          className="inline-flex min-h-6 items-center rounded-cc-sm px-1 text-xs font-semibold text-cc-accent transition-colors hover:text-cc-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent/40"
        >
          {evidence.nextHole.label}
        </button>
      ) : null}
    </div>
  );
}
