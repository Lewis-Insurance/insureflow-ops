import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Chip, SectionLabel, StatusPill } from '@/components/cc';
import { humanizeCarrier, humanizeLine } from '@/lib/format';
import { useQuotesByAccount } from '@/hooks/useQuotes';
import type { Renewal } from '@/hooks/useRenewalWorkflow';

function money(amount: number | null | undefined): string {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Relevant quotes for this renewal, read from the shared account-level `quotes` store
 * (same data the customer page uses). Management lives on the customer page; this is the
 * highly-relevant read view with a link through.
 */
export function RenewalQuotesPanel({ renewal }: { renewal: Renewal }) {
  const { data: quotes = [] } = useQuotesByAccount(renewal.account_id);
  // Surface the most recent few; open quotes are the active rate-shop.
  const relevant = [...quotes]
    .sort((a: any, b: any) => (a.status === 'open' ? -1 : 0) - (b.status === 'open' ? -1 : 0))
    .slice(0, 5);

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6 shadow-card">
      <div className="flex items-center justify-between">
        <SectionLabel>Quotes</SectionLabel>
        <Link
          to={`/customers/${renewal.account_id}`}
          className="inline-flex items-center gap-1 text-xs text-cc-text-muted hover:text-cc-text-primary"
        >
          Manage <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {relevant.length === 0 ? (
        <p className="mt-3 text-sm text-cc-text-muted">No quotes on this account yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {relevant.map((q: any) => (
            <li key={q.id} className="flex items-center justify-between gap-3 rounded-cc-md bg-cc-surface-raised px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Chip>{humanizeCarrier(q.carrier_info?.name || q.competitor_carrier || 'Carrier')}</Chip>
                  <StatusPill status={q.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-cc-text-muted">{humanizeLine(q.line_of_business)}</p>
              </div>
              <span className="cc-num shrink-0 text-sm text-cc-text-primary">{money(q.premium)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
