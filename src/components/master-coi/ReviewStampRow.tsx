// Master COI review stamp row (blueprint Section 2.11).
//
// The panel footer: who last reviewed this certificate profile and when, plus a
// staleness warning when policy data changed after that review. "Mark reviewed"
// is a ghost button (zero lime in the panel; the one lime primary lives in the
// drawer's Save). The review date renders through formatLocalDateDisplay with
// cc-num so it stays tabular. "Never reviewed" is rendered honestly rather than
// as a fabricated date. Consumes COIReview from src/types/master-coi.ts verbatim.

import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { useMarkMasterCoiReviewed } from '@/hooks/useMasterCoi';
import type { COIReview } from '@/types/master-coi';

export interface ReviewStampRowProps {
  accountId: string;
  review: COIReview;
}

export function ReviewStampRow({ accountId, review }: ReviewStampRowProps) {
  const markReviewed = useMarkMasterCoiReviewed();

  const reviewedDate = formatLocalDateDisplay(review.last_reviewed_at);
  const reviewedBy = (review.last_reviewed_by ?? '').trim();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {reviewedDate ? (
          <p className="text-sm text-cc-text-muted">
            Last reviewed <span className="cc-num text-cc-text-secondary">{reviewedDate}</span>
            {reviewedBy && <> by {reviewedBy}</>}
          </p>
        ) : (
          <p className="text-sm text-cc-text-muted">Never reviewed</p>
        )}

        {review.stale && (
          <div
            className="inline-flex items-start gap-1 text-xs text-cc-warning"
            role="note"
          >
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Policy data changed after the last review.</span>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={markReviewed.isPending}
        onClick={() => markReviewed.mutate({ accountId })}
        className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
      >
        {markReviewed.isPending ? 'Marking reviewed...' : 'Mark reviewed'}
      </Button>
    </div>
  );
}
