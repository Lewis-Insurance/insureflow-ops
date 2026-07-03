import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Chip, SectionLabel } from '@/components/cc';
import { useAccountSearch, accountTypeLabel } from '@/hooks/useRelationshipGraph';

/**
 * Certificates landing state when no ?accountId is present (command-palette entry).
 * One sentence plus one control: a debounced customer combobox backed by the same
 * search_accounts RPC LinkAccountDrawer uses. Selecting a customer navigates in
 * place to /certificates?accountId={id}; the page then renders the account scaffold.
 *
 * Per Calm Command: zero lime here (the page's single lime is the Phase 5 Generate
 * button, not present yet), cc-* tokens only, tabular figures on the policy count.
 */
export function CustomerPickerEmptyState() {
  const navigate = useNavigate();
  const { results, loading, search, clear } = useAccountSearch();
  const [query, setQuery] = useState('');

  // Debounced alias-aware search (250ms), matching LinkAccountDrawer.tsx:45-52.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (query.trim()) search(query);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, search, clear]);

  const pick = (accountId: string) => {
    navigate(`/certificates?accountId=${accountId}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-xl rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-8 shadow-card">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-cc-md bg-cc-surface-raised text-cc-text-secondary">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-cc-text-secondary">Pick a customer to issue a certificate.</p>
      </div>

      <div className="mt-6 space-y-2">
        <SectionLabel>Customer</SectionLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, nickname, email, phone"
            aria-label="Search customers"
            className="rounded-cc-md border-cc-border-interactive bg-cc-surface-raised pl-9 text-cc-text-primary placeholder:text-cc-text-muted"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-cc-md border border-cc-border-subtle bg-cc-surface">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-cc-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-cc-text-muted">
              {query.trim() ? 'No matching customers.' : 'Type to search the book.'}
            </p>
          ) : (
            <ul className="divide-y divide-cc-border-subtle">
              {results.map((r) => (
                <li key={r.account_id}>
                  <button
                    type="button"
                    onClick={() => pick(r.account_id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-cc-text-primary break-words">{r.name}</p>
                      <p className="truncate text-xs text-cc-text-muted">
                        {accountTypeLabel(r.type)}
                        {r.match_reason && r.match_reason !== 'name' ? ` · ${r.match_reason}` : ''}
                      </p>
                    </div>
                    <Chip>
                      <span className="cc-num">{r.policies_count}</span> pol
                    </Chip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
