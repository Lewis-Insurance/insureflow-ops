import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { SectionLabel } from '@/components/cc';
import { humanizeEnum } from '@/lib/format';
import { useCommunicationHistory } from '@/hooks/useEmailComposer';
import type { Renewal } from '@/hooks/useRenewalWorkflow';

function shortDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Recent contact for this renewal, read from the shared account-level
 * `communication_history` store (same data the customer page uses).
 */
export function RenewalContactPanel({ renewal }: { renewal: Renewal }) {
  const { data: history = [] } = useCommunicationHistory(renewal.account_id);
  const recent = (history as any[]).slice(0, 5);

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6 shadow-card">
      <div className="flex items-center justify-between">
        <SectionLabel>Recent contact</SectionLabel>
        <Link
          to={`/customers/${renewal.account_id}`}
          className="inline-flex items-center gap-1 text-xs text-cc-text-muted hover:text-cc-text-primary"
        >
          Log / view <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="mt-3 text-sm text-cc-text-muted">No contact logged yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recent.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 border-b border-cc-border-subtle pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-cc-text-secondary">
                  {c.subject || humanizeEnum(c.communication_type)}
                </p>
                <p className="text-xs text-cc-text-muted">{humanizeEnum(c.communication_type)}</p>
              </div>
              <span className="cc-num shrink-0 text-xs text-cc-text-muted">{shortDate(c.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
