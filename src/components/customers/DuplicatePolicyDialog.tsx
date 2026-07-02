import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Chip, SectionLabel } from '@/components/cc';
import { humanizeLine, humanizeCarrier, humanizeStatus } from '@/lib/format';
import { AlertTriangle, GitMerge, FileText, Loader2 } from 'lucide-react';

/** The policy the user is trying to add (values from the Add Policy form). */
export interface AttemptedPolicyInfo {
  policy_number: string;
  carrier: string;
  line_of_business: string;
}

/** The active policy already on file that owns this policy number. */
export interface ExistingPolicyInfo {
  id: string;
  policy_number: string;
  carrier: string | null;
  line_of_business: string | null;
  status: string | null;
  account_id: string;
  account_name: string;
}

interface DuplicatePolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attempted: AttemptedPolicyInfo;
  existing: ExistingPolicyInfo | null;
  loading?: boolean;
  /** The customer whose record we are on (the left / "adding" side). */
  currentCustomerName: string;
  currentAccountId: string;
  /** Different customer owns the number: open the merge page with both prefilled. */
  onMerge: (existingAccountId: string) => void;
  /** Same customer already has the number: jump straight to that policy. */
  onSeePolicy: (policyId: string) => void;
}

/** One side of the compare. Carriers are name chips, never colors (constitution). */
function PolicyCard({
  heading,
  customerName,
  policyNumber,
  line,
  carrier,
  status,
  emphasis,
}: {
  heading: string;
  customerName: string;
  policyNumber: string;
  line?: string | null;
  carrier?: string | null;
  status?: string | null;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex-1 rounded-cc-md border bg-cc-surface-raised p-4 ${
        emphasis ? 'border-cc-accent/40' : 'border-cc-border-subtle'
      }`}
    >
      <SectionLabel>{heading}</SectionLabel>
      <p className="mt-2 truncate text-sm font-semibold text-cc-text-primary" title={customerName}>
        {customerName}
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-cc-text-muted">Policy #</dt>
          <dd className="cc-num truncate text-right font-medium text-cc-text-primary" title={policyNumber}>
            {policyNumber}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-cc-text-muted">Type</dt>
          <dd className="truncate text-right text-cc-text-secondary">{humanizeLine(line) || 'Not set'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-cc-text-muted">Carrier</dt>
          <dd className="text-right">
            {carrier ? <Chip>{humanizeCarrier(carrier)}</Chip> : <span className="text-cc-text-secondary">Not set</span>}
          </dd>
        </div>
        {status && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-cc-text-muted">Status</dt>
            <dd className="text-right text-cc-text-secondary">{humanizeStatus(status)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * Shown instead of a raw DB error when a policy number is already in use. The
 * number is globally unique across accounts, so the collision is one of two
 * things, and we handle each differently:
 *   - Different customer -> likely the same client twice: offer "Merge Clients".
 *   - Same customer -> a true duplicate the CSR just did not see: offer "See
 *     Policy" to jump to the record that already exists.
 * Only rendered from the customer record pages (never the renewals workflow).
 */
export function DuplicatePolicyDialog({
  open,
  onOpenChange,
  attempted,
  existing,
  loading,
  currentCustomerName,
  currentAccountId,
  onMerge,
  onSeePolicy,
}: DuplicatePolicyDialogProps) {
  const sameCustomer = existing != null && existing.account_id === currentAccountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {sameCustomer ? 'This policy already exists for this customer' : 'Policy number already in use'}
          </DialogTitle>
          <DialogDescription>
            {sameCustomer
              ? 'This customer already has an active policy with this number. Open the existing policy instead of adding a duplicate.'
              : 'This policy number is already on file for another customer. If these are the same client, merge the two records to keep one clean history.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-cc-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Looking up the existing policy...
          </div>
        ) : sameCustomer ? (
          // True duplicate on the same customer: show the one policy on file.
          <PolicyCard
            heading="Already on this customer"
            customerName={existing?.account_name ?? (currentCustomerName || 'This customer')}
            policyNumber={existing?.policy_number ?? attempted.policy_number}
            line={existing?.line_of_business}
            carrier={existing?.carrier}
            status={existing?.status}
          />
        ) : (
          // Different customer owns the number: compare the two, side by side.
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <PolicyCard
              heading="Policy you're adding"
              customerName={currentCustomerName || 'This customer'}
              policyNumber={attempted.policy_number}
              line={attempted.line_of_business}
              carrier={attempted.carrier}
              emphasis
            />
            <div className="flex shrink-0 justify-center">
              <span className="inline-flex items-center rounded-pill bg-cc-surface-overlay px-2.5 py-1 text-xs font-medium text-cc-text-secondary">
                Same policy #
              </span>
            </div>
            <PolicyCard
              heading="Already on file"
              customerName={existing?.account_name ?? 'Unknown customer'}
              policyNumber={existing?.policy_number ?? attempted.policy_number}
              line={existing?.line_of_business}
              carrier={existing?.carrier}
              status={existing?.status}
            />
          </div>
        )}

        <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-cc-md text-cc-text-secondary hover:text-cc-text-primary"
          >
            {sameCustomer ? 'Close' : 'Cancel'}
          </Button>
          {existing && sameCustomer && (
            <Button
              data-primary
              onClick={() => onSeePolicy(existing.id)}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <FileText className="h-4 w-4" />
              See Policy
            </Button>
          )}
          {existing && !sameCustomer && (
            <Button
              data-primary
              onClick={() => onMerge(existing.account_id)}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <GitMerge className="h-4 w-4" />
              Merge Clients
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
