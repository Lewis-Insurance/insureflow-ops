import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/cc';
import { Search, Link2, Check, Loader2 } from 'lucide-react';
import {
  useAccountSearch,
  linkAccounts,
  accountTypeLabel,
  formatPremium,
  type AccountSearchResult,
} from '@/hooks/useRelationshipGraph';

interface LinkAccountDrawerProps {
  accountId: string;
  accountName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

/**
 * Directional link options phrased from the current account's perspective, so the
 * canonical edge direction (owner = from) is always recorded correctly.
 */
const LINK_OPTIONS = [
  { id: 'owns', relType: 'owns', label: 'Owns', verb: 'owns', fromCurrent: true },
  { id: 'owned_by', relType: 'owns', label: 'Is owned by', verb: 'is owned by', fromCurrent: false },
  { id: 'spouse', relType: 'spouse', label: 'Is spouse of', verb: 'is spouse of', fromCurrent: true },
  { id: 'parent', relType: 'parent_company', label: 'Is parent company of', verb: 'is parent company of', fromCurrent: true },
  { id: 'subsidiary', relType: 'parent_company', label: 'Is a subsidiary of', verb: 'is a subsidiary of', fromCurrent: false },
  { id: 'related', relType: 'related', label: 'Is related to', verb: 'is related to', fromCurrent: true },
] as const;

export function LinkAccountDrawer({ accountId, accountName, open, onOpenChange, onLinked }: LinkAccountDrawerProps) {
  const { results, loading, search, clear } = useAccountSearch();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AccountSearchResult | null>(null);
  const [optionId, setOptionId] = useState<string>('owns');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);

  // Debounced alias-aware search.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      if (query.trim()) search(query);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, search, clear]);

  // Reset when the drawer closes.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(null);
      setOptionId('owns');
      setRole('');
      clear();
    }
  }, [open, clear]);

  const option = useMemo(() => LINK_OPTIONS.find((o) => o.id === optionId) ?? LINK_OPTIONS[0], [optionId]);

  const visibleResults = results.filter((r) => r.account_id !== accountId);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    const fromAccount = option.fromCurrent ? accountId : selected.account_id;
    const toAccount = option.fromCurrent ? selected.account_id : accountId;
    const ok = await linkAccounts({
      fromAccount,
      toAccount,
      relType: option.relType,
      role: role.trim() || null,
    });
    setSaving(false);
    if (ok) {
      onLinked();
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[480px]"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="space-y-1 border-b border-cc-border-subtle p-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-cc-text-primary">
              <Link2 className="h-4 w-4 text-cc-accent" />
              Link account
            </SheetTitle>
            <SheetDescription className="text-cc-text-muted">
              Connect <span className="text-cc-text-secondary">{accountName}</span> to another record. One link is written.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* Relationship type */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                {accountName} …
              </label>
              <div className="flex flex-wrap gap-2">
                {LINK_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOptionId(o.id)}
                    className={
                      'rounded-pill px-3 py-1 text-sm transition-colors ' +
                      (o.id === optionId
                        ? 'border border-l-2 border-cc-border-subtle border-l-cc-accent bg-cc-surface-raised text-cc-text-primary'
                        : 'border border-cc-border-subtle bg-cc-surface text-cc-text-secondary hover:bg-cc-surface-overlay')
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target search */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">Find the account</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                  }}
                  placeholder="Search name, nickname, email, phone…"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface pl-9 text-cc-text-primary"
                />
              </div>

              {selected ? (
                <div className="flex items-center justify-between rounded-cc-md border border-l-2 border-cc-border-subtle border-l-cc-accent bg-cc-surface-raised px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cc-text-primary">{selected.name}</p>
                    <p className="truncate text-xs text-cc-text-muted">
                      {accountTypeLabel(selected.type)} · {selected.policies_count} polic
                      {selected.policies_count === 1 ? 'y' : 'ies'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(null)}
                    className="text-cc-text-muted hover:text-cc-text-primary"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-cc-md border border-cc-border-subtle bg-cc-surface">
                  {loading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-cc-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                    </div>
                  ) : visibleResults.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-cc-text-muted">
                      {query.trim() ? 'No matching accounts.' : 'Type to search the book.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-cc-border-subtle">
                      {visibleResults.map((r) => (
                        <li key={r.account_id}>
                          <button
                            type="button"
                            onClick={() => setSelected(r)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-cc-text-primary">{r.name}</p>
                              <p className="truncate text-xs text-cc-text-muted">
                                {accountTypeLabel(r.type)}
                                {r.owned_business_count > 0
                                  ? ` · owns ${r.owned_business_count} ${r.owned_business_count === 1 ? 'company' : 'companies'}`
                                  : ''}
                                {r.match_reason && r.match_reason !== 'name' ? ` · ${r.match_reason}` : ''}
                              </p>
                            </div>
                            <Chip>{r.policies_count} pol</Chip>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Optional role */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Role <span className="normal-case text-cc-text-faint">(optional)</span>
              </label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Managing Member, Guarantor, Additional Insured…"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
            </div>

            {selected && (
              <p className="rounded-cc-md bg-cc-surface-raised px-3 py-2 text-sm text-cc-text-secondary">
                <span className="text-cc-text-primary">{accountName}</span> {option.verb}{' '}
                <span className="text-cc-text-primary">{selected.name}</span>.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-cc-border-subtle p-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              Cancel
            </Button>
            <Button
              data-primary
              disabled={!selected || saving}
              onClick={handleConfirm}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Link account
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
