// HolderField (blueprint D Section 3.4, doc 06 Section 4.7) - left block 2.
//
// Debounced (250ms) typeahead over useAdditionalInsuredSearch. Picking a result
// sets the holder from its full directory row (fetched by id so the snapshot/
// preview address is accurate). "Create new holder" opens AdditionalInsuredDrawer
// in create mode; onSaved sets the holder DIRECTLY from the full saved row.
// Changing (or clearing) the holder fires the caller's R3 endorsement reset.
//
// Calm Command: cc-* tokens both themes, SectionLabel, names never truncate,
// tabular figures where numeric, no em or en dashes.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Loader2, X, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/cc';
import {
  useAdditionalInsuredSearch,
  type AdditionalInsuredSavedRow,
} from '@/hooks/useAdditionalInsureds';
import {
  AdditionalInsuredDrawer,
} from '@/components/additional-insureds/AdditionalInsuredDrawer';
import { composeAddressBlock, fetchHolderById, type SelectedHolder } from './holderUtils';

interface HolderFieldProps {
  value: SelectedHolder | null;
  onChange: (holder: SelectedHolder | null) => void;
  /** Suppress the built-in "Certificate holder" label when the caller renders its own header. */
  hideLabel?: boolean;
}

export function HolderField({ value, onChange, hideLabel = false }: HolderFieldProps) {
  const { results, loading, search, clear } = useAdditionalInsuredSearch();
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced alias-aware search (250ms), matching the CustomerPickerEmptyState.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (query.trim()) search(query);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, search, clear]);

  const pick = async (additionalInsuredId: string) => {
    setResolvingId(additionalInsuredId);
    const holder = await fetchHolderById(additionalInsuredId);
    setResolvingId(null);
    if (holder) {
      onChange(holder);
      setQuery('');
      clear();
    }
  };

  const onSaved = (saved: AdditionalInsuredSavedRow) => {
    onChange({
      id: saved.id,
      name: saved.name,
      addressBlock: composeAddressBlock(saved),
    });
    setDrawerOpen(false);
    setQuery('');
    clear();
  };

  // Selected state: a tile with the holder name + address and a change control.
  if (value) {
    return (
      <div className="space-y-2">
        {!hideLabel && <SectionLabel>Certificate holder</SectionLabel>}
        <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-cc-text-primary">
                {value.name}
              </p>
              {value.addressBlock && (
                <p className="mt-0.5 whitespace-pre-line text-sm text-cc-text-secondary">
                  {value.addressBlock}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-cc-text-muted hover:text-cc-text-primary"
              aria-label="Change holder"
              onClick={() => onChange(null)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <Link
            to="/additional-insureds"
            className="mt-2 inline-block text-xs text-cc-text-muted underline-offset-2 hover:text-cc-text-secondary hover:underline"
          >
            View in Additional Insureds
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <SectionLabel>Certificate holder</SectionLabel>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search holders by name, city, email, phone"
          aria-label="Search certificate holders"
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
            {query.trim() ? 'No matching holders.' : 'Type to search the directory.'}
          </p>
        ) : (
          <ul className="divide-y divide-cc-border-subtle">
            {results.map((r) => {
              const addr = [r.city, r.state].filter(Boolean).join(', ');
              return (
                <li key={r.additional_insured_id}>
                  <button
                    type="button"
                    disabled={resolvingId !== null}
                    onClick={() => void pick(r.additional_insured_id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm text-cc-text-primary">{r.name}</p>
                      <p className="truncate text-xs text-cc-text-muted">
                        {addr || 'No address on file'}
                        {r.match_reason && r.match_reason !== 'name'
                          ? ` · ${r.match_reason}`
                          : ''}
                      </p>
                    </div>
                    {resolvingId === r.additional_insured_id && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cc-text-muted" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-cc-border-subtle p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-cc-text-secondary hover:text-cc-text-primary"
            onClick={() => setDrawerOpen(true)}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Create new holder
          </Button>
        </div>
      </div>

      <AdditionalInsuredDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        initial={null}
        initialName={query.trim()}
        onSaved={onSaved}
      />
    </div>
  );
}
