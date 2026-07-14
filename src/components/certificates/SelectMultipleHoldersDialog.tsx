// Select-multiple certificate holders (batch COI download).
//
// A picker over the whole Additional Insureds directory (list_additional_insureds,
// agency-wide, already name-sorted): a search box filtering by name, a checkable
// row per holder (name only, no address), and a Select-all that acts on the
// current filter. Confirming hands the caller the chosen { id, name } list; the
// generator then builds one ACORD 25 per holder and zips them.
//
// Calm Command: cc-* tokens (both themes), one primary action (Add selected),
// tabular figures on counts, no em or en dashes.

import { useEffect, useMemo, useState } from 'react';
import { Search, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface SelectableHolder {
  id: string;
  name: string;
}

interface SelectMultipleHoldersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ids already chosen, so re-opening the dialog restores the selection. */
  initialSelectedIds: string[];
  /** Called with the final { id, name } list when the user confirms. */
  onConfirm: (holders: SelectableHolder[]) => void;
}

interface ListRow {
  additional_insured_id: string;
  name: string;
}

export function SelectMultipleHoldersDialog({
  open,
  onOpenChange,
  initialSelectedIds,
  onConfirm,
}: SelectMultipleHoldersDialogProps) {
  const [holders, setHolders] = useState<SelectableHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<string, SelectableHolder>>(new Map());

  // Load the full directory (name-sorted server-side) each time the dialog opens,
  // and seed the selection from the caller's current choice.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setLoading(true);
    setError(null);
    let active = true;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('list_additional_insureds', {
        p_q: null,
        p_kind: null,
        p_cohort: null,
        p_limit: 2000,
        p_offset: 0,
      });
      if (!active) return;
      if (rpcError) {
        logger.error('select-multiple holders list error', rpcError);
        setError('Could not load the additional insureds.');
        setHolders([]);
      } else {
        const rows = ((data || []) as unknown as ListRow[]).map((r) => ({
          id: r.additional_insured_id,
          name: r.name,
        }));
        setHolders(rows);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open]);

  // Seed the checked set from the caller once per open (kept separate from the
  // fetch so it applies even while the list is still loading).
  useEffect(() => {
    if (!open) return;
    setSelected(new Map(initialSelectedIds.map((id) => [id, { id, name: id }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Once the directory arrives, backfill display names onto any pre-seeded ids.
  useEffect(() => {
    if (holders.length === 0) return;
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const byId = new Map(holders.map((h) => [h.id, h]));
      const next = new Map(prev);
      for (const [id] of prev) {
        const full = byId.get(id);
        if (full) next.set(id, full);
      }
      return next;
    });
  }, [holders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return holders;
    return holders.filter((h) => h.name.toLowerCase().includes(q));
  }, [holders, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((h) => selected.has(h.id));

  const toggle = (holder: SelectableHolder) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(holder.id)) next.delete(holder.id);
      else next.set(holder.id, holder);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allFilteredSelected) {
        for (const h of filtered) next.delete(h.id);
      } else {
        for (const h of filtered) next.set(h.id, h);
      }
      return next;
    });
  };

  const confirm = () => {
    // Preserve the directory's alphabetical order in the returned list.
    const chosen = holders.filter((h) => selected.has(h.id));
    onConfirm(chosen);
    onOpenChange(false);
  };

  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 bg-cc-surface-raised sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-cc-text-primary">Select multiple additional insureds</DialogTitle>
          <DialogDescription className="text-cc-text-muted">
            Choose the holders to issue this certificate to. Each one downloads as its own PDF inside a single zip.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            aria-label="Search additional insureds by name"
            className="rounded-cc-md border-cc-border-interactive bg-cc-surface pl-9 text-cc-text-primary placeholder:text-cc-text-muted"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={filtered.length === 0}
            className="text-sm font-medium text-cc-accent underline-offset-2 hover:underline disabled:opacity-50"
          >
            {allFilteredSelected ? 'Clear all' : 'Select all'}
            {query.trim() ? ` (${filtered.length})` : ''}
          </button>
          <span className="[font-variant-numeric:tabular-nums] text-sm text-cc-text-muted">
            {selectedCount} selected
          </span>
        </div>

        <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-cc-md border border-cc-border-subtle bg-cc-surface">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-cc-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading
            </div>
          ) : error ? (
            <p className="px-3 py-4 text-sm text-destructive">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-cc-text-muted">
              {query.trim() ? 'No matching additional insureds.' : 'No additional insureds on file.'}
            </p>
          ) : (
            <ul className="divide-y divide-cc-border-subtle">
              {filtered.map((h) => {
                const checked = selected.has(h.id);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(h)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-cc-surface-overlay"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-cc-sm border transition-colors ${
                          checked
                            ? 'border-cc-accent bg-cc-accent text-cc-on-accent'
                            : 'border-cc-border-interactive bg-cc-surface'
                        }`}
                      >
                        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="break-words text-sm text-cc-text-primary">{h.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button data-primary onClick={confirm} disabled={selectedCount === 0}>
            Add {selectedCount > 0 ? selectedCount : ''} selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
