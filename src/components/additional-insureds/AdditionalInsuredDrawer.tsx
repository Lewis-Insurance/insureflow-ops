import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Chip } from '@/components/cc';
import { UserPlus, Pencil, Check, Loader2, ShieldQuestion } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  useAdditionalInsuredSearch,
  resolveAdditionalInsured,
  type AdditionalInsuredSearchResult,
  type AdditionalInsuredSavedRow,
} from '@/hooks/useAdditionalInsureds';

/**
 * Add / edit an additional insured (certificate holder). Forked from
 * LinkAccountDrawer: the Sheet shell, the 250ms debounce effect, and the
 * selected-record card are the account version's patterns kept intact.
 *
 * NET-NEW vs the link drawer: a live duplicate typeahead under the Name field
 * (create mode only). As the name is typed we search the live book and surface
 * possible existing entries with a match reason. Saving ALWAYS routes through
 * resolve_additional_insured (never a raw insert) so two concurrent identical
 * creates still land exactly one row. Edit mode is a direct update by id.
 */

/** The row the drawer edits. Superset of the saved-row the caller receives back. */
export interface AdditionalInsuredEditRow {
  id: string;
  name: string;
  kind: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

interface AdditionalInsuredDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode (typeahead on); a row = edit mode (typeahead off). */
  initial?: AdditionalInsuredEditRow | null;
  /** Seeds the Name in create mode when opened from the certificate generator. */
  initialName?: string;
  /** Fires with the FULL saved row so callers never need to re-fetch. */
  onSaved: (saved: AdditionalInsuredSavedRow) => void;
}

const KIND_OPTIONS = [
  { value: 'business', label: 'Business' },
  { value: 'individual', label: 'Individual' },
  { value: 'government', label: 'Government' },
  { value: 'lender', label: 'Lender' },
  { value: 'other', label: 'Other' },
] as const;

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label]),
);

interface FormState {
  name: string;
  kind: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  email: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'business',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip_code: '',
  email: '',
  phone: '',
  notes: '',
};

function fromRow(row: AdditionalInsuredEditRow): FormState {
  return {
    name: row.name ?? '',
    kind: row.kind ?? 'business',
    address_line1: row.address_line1 ?? '',
    address_line2: row.address_line2 ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    zip_code: row.zip_code ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    notes: row.notes ?? '',
  };
}

/**
 * Hydrate the full saved row by id so callers get a complete record on save.
 * additional_insureds is not in the generated Supabase types yet (types regen is
 * a separate step), so we use the repo's `.from('<table>' as any)` drift pattern.
 */
async function hydrateSavedRow(id: string): Promise<AdditionalInsuredSavedRow | null> {
  const { data, error } = await supabase
    .from('additional_insureds' as any)
    .select('id, name, kind, address_line1, address_line2, city, state, zip_code')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('additional insured hydrate error', error);
    return null;
  }
  return (data as unknown as AdditionalInsuredSavedRow) ?? null;
}

export function AdditionalInsuredDrawer({
  open,
  onOpenChange,
  initial = null,
  initialName,
  onSaved,
}: AdditionalInsuredDrawerProps) {
  const isEdit = initial != null;
  const { results, loading: searching, search, clear } = useAdditionalInsuredSearch();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedMatch, setSelectedMatch] = useState<AdditionalInsuredSearchResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the form each time the drawer opens (edit row, seeded name, or blank).
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm(fromRow(initial));
    } else {
      setForm({ ...EMPTY_FORM, name: initialName?.trim() ? initialName.trim() : '' });
    }
    setSelectedMatch(null);
  }, [open, initial, initialName]);

  // Reset transient state when the drawer closes.
  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setSelectedMatch(null);
      clear();
    }
  }, [open, clear]);

  // Live duplicate typeahead (create mode only). Debounce cloned from
  // LinkAccountDrawer: same 250ms, same stable search/clear deps.
  useEffect(() => {
    if (!open || isEdit) return;
    const handle = setTimeout(() => {
      if (form.name.trim().length >= 2) search(form.name);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [form.name, open, isEdit, search, clear]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const finish = (saved: AdditionalInsuredSavedRow) => {
    onSaved(saved);
    onOpenChange(false);
  };

  // Create path: resolve-or-create (never a raw insert). Race-safe server-side.
  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const resolved = await resolveAdditionalInsured({
      name: form.name.trim(),
      kind: form.kind,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip_code.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (!resolved) {
      setSaving(false);
      return;
    }
    if (resolved.matched) {
      toast({ title: 'Matched an existing record', description: 'Reused the record already on file.' });
    }
    const saved = await hydrateSavedRow(resolved.id);
    setSaving(false);
    if (saved) finish(saved);
    else onOpenChange(false);
  };

  // "Use selected" path: adopt an existing record surfaced by the typeahead.
  const handleUseSelected = async () => {
    if (!selectedMatch) return;
    setSaving(true);
    const saved = await hydrateSavedRow(selectedMatch.additional_insured_id);
    setSaving(false);
    if (saved) finish(saved);
    else onOpenChange(false);
  };

  // Edit path: direct update by id.
  const handleUpdate = async () => {
    if (!initial || !form.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('additional_insureds' as any)
      .update({
        name: form.name.trim(),
        kind: form.kind,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip_code: form.zip_code.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq('id', initial.id);
    if (error) {
      toast({ title: 'Could not save changes', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    const saved = await hydrateSavedRow(initial.id);
    setSaving(false);
    if (saved) finish(saved);
    else onOpenChange(false);
  };

  const nameEntered = form.name.trim().length > 0;
  // In create mode a selected match takes over the primary action.
  const primaryDisabled = saving || !nameEntered;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[480px]"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="space-y-1 border-b border-cc-border-subtle p-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-cc-text-primary">
              {isEdit ? (
                <Pencil className="h-4 w-4 text-cc-accent" />
              ) : (
                <UserPlus className="h-4 w-4 text-cc-accent" />
              )}
              {isEdit ? 'Edit additional insured' : 'Add additional insured'}
            </SheetTitle>
            <SheetDescription className="text-cc-text-muted">
              {isEdit
                ? 'Update this shared certificate holder. Changes apply everywhere it is used.'
                : 'One shared record across every customer. We check for existing entries as you type.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* Name + live duplicate typeahead */}
            <div className="space-y-2">
              <label htmlFor="ai-name" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Name
              </label>
              <Input
                id="ai-name"
                autoFocus
                value={form.name}
                onChange={(e) => {
                  set('name', e.target.value);
                  setSelectedMatch(null);
                }}
                placeholder="Company or person on the certificate"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />

              {!isEdit && selectedMatch ? (
                <div className="space-y-2 rounded-cc-md border border-l-2 border-cc-border-subtle border-l-cc-accent bg-cc-surface-raised px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                    Use this existing record
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-cc-text-primary">{selectedMatch.name}</p>
                      <p className="text-xs text-cc-text-muted">
                        {KIND_LABEL[selectedMatch.kind] ?? selectedMatch.kind}
                        {selectedMatch.city || selectedMatch.state
                          ? ` · ${[selectedMatch.city, selectedMatch.state].filter(Boolean).join(', ')}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedMatch(null)}
                      className="text-cc-text-muted hover:text-cc-text-primary"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : !isEdit && form.name.trim().length >= 2 ? (
                <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface">
                  <div className="flex items-center gap-2 border-b border-cc-border-subtle px-3 py-2 text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                    <ShieldQuestion className="h-3.5 w-3.5" />
                    Possible existing entries
                  </div>
                  {searching ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-cc-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching the book
                    </div>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-cc-text-muted">
                      No matches yet. This will create a new record.
                    </p>
                  ) : (
                    <ul className="max-h-56 divide-y divide-cc-border-subtle overflow-y-auto">
                      {results.map((r) => (
                        <li key={r.additional_insured_id}>
                          <button
                            type="button"
                            onClick={() => setSelectedMatch(r)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-cc-text-primary">{r.name}</p>
                              <p className="flex flex-wrap items-center gap-x-2 text-xs text-cc-text-muted">
                                <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
                                {(r.city || r.state) && (
                                  <span>{[r.city, r.state].filter(Boolean).join(', ')}</span>
                                )}
                                {r.match_reason && (
                                  <Chip className="lowercase first-letter:uppercase">{r.match_reason}</Chip>
                                )}
                              </p>
                            </div>
                            <Chip>
                              <span className="cc-num">{r.usage_count}</span>&nbsp;certs
                            </Chip>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {/* Kind */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">Kind</label>
              <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                <SelectTrigger
                  aria-label="Kind"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <label htmlFor="ai-addr1" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Address <span className="normal-case text-cc-text-faint">(prints on the COI)</span>
              </label>
              <Input
                id="ai-addr1"
                value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                placeholder="Street address"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
              <Input
                aria-label="Address line 2"
                value={form.address_line2}
                onChange={(e) => set('address_line2', e.target.value)}
                placeholder="Suite, unit, floor (optional)"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
              <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                <Input
                  aria-label="City"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  placeholder="City"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                />
                <Input
                  aria-label="State"
                  value={form.state}
                  onChange={(e) => set('state', e.target.value)}
                  placeholder="ST"
                  maxLength={2}
                  className="w-16 rounded-cc-md border-cc-border-subtle bg-cc-surface text-center uppercase text-cc-text-primary"
                />
                <Input
                  aria-label="ZIP"
                  value={form.zip_code}
                  onChange={(e) => set('zip_code', e.target.value)}
                  placeholder="ZIP"
                  className="w-24 rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary [font-variant-numeric:tabular-nums]"
                />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="ai-email" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  Email
                </label>
                <Input
                  id="ai-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="name@company.com"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="ai-phone" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                  Phone
                </label>
                <Input
                  id="ai-phone"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="555 555 5555"
                  className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary [font-variant-numeric:tabular-nums]"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label htmlFor="ai-notes" className="text-xs font-medium uppercase tracking-wide text-cc-text-muted">
                Notes <span className="normal-case text-cc-text-faint">(optional)</span>
              </label>
              <Textarea
                id="ai-notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Internal notes about this holder"
                rows={3}
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface text-cc-text-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-cc-border-subtle p-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2">
              {/* Create-anyway stays available while a match is selected. */}
              {!isEdit && selectedMatch && (
                <Button
                  variant="ghost"
                  disabled={saving || !nameEntered}
                  onClick={() => {
                    setSelectedMatch(null);
                    handleCreate();
                  }}
                  className="rounded-cc-md text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                >
                  Create new anyway
                </Button>
              )}

              <Button
                data-primary
                disabled={
                  isEdit
                    ? saving || !nameEntered
                    : selectedMatch
                      ? saving
                      : primaryDisabled
                }
                onClick={
                  isEdit ? handleUpdate : selectedMatch ? handleUseSelected : handleCreate
                }
                className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : selectedMatch ? 'Use selected' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
