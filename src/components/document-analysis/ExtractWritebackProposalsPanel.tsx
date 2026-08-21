import { Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, StatusPill } from '@/components/cc';
import { useExtractWritebackProposals } from '@/hooks/useExtractWritebackProposals';
import {
  proposalCoverageCount,
  proposalPremiumFromPayload,
  type ProposedQuotePayload,
} from '@/lib/extractWritebackProposal';
import type { LineCategory } from '@/lib/extractAccountMatch';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import { formatCurrency } from '@/lib/utils';

interface ExtractWritebackProposalsPanelProps {
  analysisId: string;
  accountId: string;
  snapshot: ExtractSnapshotV1;
  lineCategory: LineCategory;
}

function formatPremium(payload: ProposedQuotePayload): string {
  const premium = proposalPremiumFromPayload(payload);
  if (premium === null) return 'Premium not extracted';
  return formatCurrency(premium);
}

export function ExtractWritebackProposalsPanel({
  analysisId,
  accountId,
  snapshot,
  lineCategory,
}: ExtractWritebackProposalsPanelProps) {
  const {
    proposals,
    proposalsLoading,
    proposalsError,
    ensuring,
    rejecting,
    rejectProposal,
  } = useExtractWritebackProposals({
    analysisId,
    accountId,
    snapshot,
    lineCategory,
  });

  if (proposalsLoading || ensuring) {
    return (
      <Card className="border-cc-border bg-cc-surface">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-cc-text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-cc-accent" />
          Building write-back proposals...
        </CardContent>
      </Card>
    );
  }

  if (proposalsError) {
    return (
      <Card className="border-cc-border bg-cc-surface">
        <CardContent className="py-6">
          <p className="text-sm text-destructive">
            {proposalsError instanceof Error
              ? proposalsError.message
              : 'Could not load write-back proposals.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (proposals.length === 0) {
    return null;
  }

  return (
    <Card className="border-cc-border bg-cc-surface" data-testid="writeback-proposals-panel">
      <CardHeader>
        <CardTitle className="text-cc-text">Write-back proposals</CardTitle>
        <p className="text-sm text-cc-text-muted">
          Review extracted quote data before it is written to the account. Reject dismisses a
          proposal; confirm is not available in this phase.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposals.map((proposal) => {
          const payload = proposal.proposed_quote;
          const coverageCount = proposalCoverageCount(payload);

          return (
            <div
              key={proposal.id}
              className="flex flex-col gap-3 rounded-cc-lg border border-cc-border p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`writeback-proposal-${proposal.id}`}
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-cc-text">{proposal.carrier_name}</p>
                  <StatusPill
                    override={{
                      label: 'Pending',
                      tone: 'neutral',
                    }}
                  />
                  <Chip>{proposal.line_class}</Chip>
                </div>
                <p className="text-sm text-cc-text-muted">
                  {formatPremium(payload)}
                  {' · '}
                  {coverageCount} coverage{coverageCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rejecting}
                  onClick={() => rejectProposal(proposal.id)}
                >
                  {rejecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
                <Button type="button" size="sm" disabled title="Confirm writes quotes next.">
                  Confirm writes quotes next.
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
