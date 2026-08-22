import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { QuoteIncumbentComparisonTable } from '@/components/quotes/QuoteIncumbentComparisonTable';
import {
  incumbentProposalLabel,
  type IncumbentPolicyCandidate,
} from '@/lib/quoteIncumbent/proposeIncumbentPolicy';
import { useQuoteIncumbentComparison } from '@/hooks/useQuoteIncumbentComparison';

interface QuoteVsIncumbentComparisonProps {
  accountId: string;
  quoteId: string;
  quoteLineOfBusiness: string;
  policyNumberHint?: string | null;
  carrierHint?: string | null;
  claimsMade?: boolean | null;
  defenseInsideLimits?: boolean | null;
}

export function QuoteVsIncumbentComparison({
  accountId,
  quoteId,
  quoteLineOfBusiness,
  policyNumberHint,
  carrierHint,
  claimsMade,
  defenseInsideLimits,
}: QuoteVsIncumbentComparisonProps) {
  const {
    policiesLoading,
    quoteLoading,
    incumbentCandidates,
    suggestedPolicyId,
    selectedPolicyId,
    setSelectedPolicyId,
    skipComparison,
    setSkipComparison,
    diffResult,
    hasIncumbentOptions,
  } = useQuoteIncumbentComparison({
    accountId,
    quoteId,
    quoteLineOfBusiness,
    policyNumberHint,
    carrierHint,
    claimsMade,
    defenseInsideLimits,
  });

  const isLoading = policiesLoading || quoteLoading;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-cc-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading incumbent comparison...
      </div>
    );
  }

  if (!hasIncumbentOptions) {
    return (
      <p className="text-sm text-cc-text-muted py-4">
        No open incumbent policy on this account matches this quote line. Link or add a policy before
        comparing.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="quote-vs-incumbent-panel">
      <div className="rounded-cc-lg border border-cc-border bg-cc-surface p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-cc-text-primary">Incumbent policy</p>
          <p className="text-sm text-cc-text-muted">
            We propose the best-matching open policy. Override if this is not the incumbent.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 min-w-[240px] max-w-md">
            <Label htmlFor="incumbent-policy-select">Compare against</Label>
            <Select
              value={selectedPolicyId ?? undefined}
              onValueChange={(value) => {
                setSkipComparison(false);
                setSelectedPolicyId(value);
              }}
              disabled={skipComparison}
            >
              <SelectTrigger id="incumbent-policy-select" className="rounded-cc-md">
                <SelectValue placeholder="Select incumbent policy" />
              </SelectTrigger>
              <SelectContent>
                {incumbentCandidates.map((candidate: IncumbentPolicyCandidate) => (
                  <SelectItem key={candidate.policy.id} value={candidate.policy.id}>
                    {incumbentProposalLabel(candidate)}
                    {candidate.policy.id === suggestedPolicyId ? ' (proposed)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="skip-incumbent-comparison"
              checked={skipComparison}
              onCheckedChange={(checked) => setSkipComparison(checked === true)}
            />
            <Label htmlFor="skip-incumbent-comparison" className="text-sm text-cc-text-muted">
              This is not an incumbent comparison
            </Label>
          </div>
        </div>

        {!skipComparison && suggestedPolicyId && selectedPolicyId === suggestedPolicyId ? (
          <p className="text-xs text-cc-text-muted">
            Proposed incumbent based on line of business
            {policyNumberHint ? ' and extract policy number.' : '.'}
          </p>
        ) : null}

        {!skipComparison && selectedPolicyId && selectedPolicyId !== suggestedPolicyId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-cc-md"
            onClick={() => {
              setSkipComparison(false);
              setSelectedPolicyId(suggestedPolicyId);
            }}
          >
            Use proposed incumbent
          </Button>
        ) : null}
      </div>

      {!skipComparison && diffResult ? <QuoteIncumbentComparisonTable diffResult={diffResult} /> : null}
    </div>
  );
}
