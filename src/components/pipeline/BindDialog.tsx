/**
 * Bind. The one screen that turns a won sale into policies on a customer file.
 *
 * It asks for the least possible. Carrier, premium and term are already on the quote,
 * so they are shown read only and never re-asked. The only new facts a bind needs are
 * which quotes were bound, the policy number the carrier issued, and the effective date.
 * Expiration is derived from the term and can be corrected.
 *
 * The whole bind is one database call (pipeline_bind), so it either all lands or none
 * of it does. That is why a failure says "Nothing was saved." and shows the database
 * error verbatim: there is no half written state to go clean up.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AccentSpine, Chip, DateField, SectionLabel, Skeleton, StatusPill } from '@/components/cc';
import { accountTypeLabel, useAccountSearch } from '@/hooks/useRelationshipGraph';
import {
  useBindPipelineItem,
  type BindPolicyInput,
  type PipelineItem,
  type PipelineQuote,
} from '@/hooks/usePipeline';
import { QUOTE_STATUS_LABELS } from '@/lib/pipeline/stages';
import { lineLabel } from '@/config/intake/lineConfig';
import { formatLocalDateDisplay, parseLocalDate, todayLocalDate } from '@/lib/date/localDate';
import { cn, formatCurrency } from '@/lib/utils';

interface BindResult {
  item_id: string;
  account_id: string;
  policy_ids: string[];
  policy_count: number;
  premium_total: number;
  renewal_outcome: string | null;
  already_bound: boolean;
}

interface RowState {
  checked: boolean;
  policyNumber: string;
  effective: string;
  expiration: string;
  /** Once the user sets an expiration by hand, the term stops overwriting it. */
  expirationEdited: boolean;
  showExpiration: boolean;
}

const FIELD_CLS =
  'h-10 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Effective date plus the term. Six months for a semiannual quote, a year otherwise.
 * parseLocalDate anchors at local noon so no date renders a day early, and the month
 * end rollover is pulled back (Aug 31 plus six months is Feb 28, not Mar 3).
 */
function deriveExpiration(effective: string, term: PipelineQuote['term']): string {
  if (!effective) return '';
  const base = parseLocalDate(effective);
  const day = base.getDate();
  const months = term === 'semiannual' ? 6 : 12;
  const shifted = new Date(base.getFullYear(), base.getMonth() + months, day, 12, 0, 0, 0);
  if (shifted.getDate() !== day) shifted.setDate(0);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}-${pad2(shifted.getDate())}`;
}

function defaultRow(quote: PipelineQuote): RowState {
  const checked = quote.status === 'accepted';
  const effective = checked ? todayLocalDate() : '';
  return {
    checked,
    policyNumber: '',
    effective,
    expiration: effective ? deriveExpiration(effective, quote.term) : '',
    expirationEdited: false,
    showExpiration: false,
  };
}

/** A quote with no carrier record cannot become a policy. Carrier data is never invented. */
function blockReason(quote: PipelineQuote): string | null {
  if (quote.carrier_id) return null;
  if (quote.carrier_text && quote.carrier_text.trim()) {
    return `Add ${quote.carrier_text.trim()} to the carrier list, or pick the matching carrier, before binding.`;
  }
  return 'This quote has no carrier on it yet. Pick the carrier on the quote before binding.';
}

/** Postgres errors arrive as plain objects, not Error instances. Read them verbatim. */
function readError(err: unknown): { message: string; extra: string[] } {
  if (!err) return { message: 'The bind did not go through.', extra: [] };
  if (typeof err === 'string') return { message: err, extra: [] };
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const extra = [e.details, e.hint, e.code ? `Code ${e.code}` : null].filter(
    (v): v is string => !!v && v.trim().length > 0,
  );
  return { message: e.message?.trim() || 'The bind did not go through.', extra };
}

function termLabel(term: PipelineQuote['term']): string | null {
  if (term === 'semiannual') return '6 month term';
  if (term === 'annual') return '12 month term';
  return null;
}

interface BindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PipelineItem;
}

export function BindDialog({ open, onOpenChange, item }: BindDialogProps) {
  const bind = useBindPipelineItem();
  const { results, loading: searching, search, clear } = useAccountSearch();

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [note, setNote] = useState('');
  const [partyMode, setPartyMode] = useState<'create' | 'attach'>('create');
  const [attachTo, setAttachTo] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [errorText, setErrorText] = useState<{ message: string; extra: string[] } | null>(null);
  const [result, setResult] = useState<BindResult | null>(null);

  // A prospect with no customer file yet is the only case that has to answer this.
  const needsParty = !item.account_id && item.party?.kind === 'lead';

  useEffect(() => {
    if (!open) return;
    const seeded: Record<string, RowState> = {};
    for (const quote of item.quotes) seeded[quote.id] = defaultRow(quote);
    setRows(seeded);
    setNote('');
    setPartyMode('create');
    setAttachTo(null);
    setQuery('');
    setErrorText(null);
    setResult(null);
    clear();
    // Seeding is deliberately tied to the dialog opening, so a background refetch
    // never wipes what the user has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id]);

  useEffect(() => {
    if (!open || partyMode !== 'attach') return;
    const handle = setTimeout(() => {
      if (query.trim()) search(query);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [open, partyMode, query, search, clear]);

  const rowFor = (quote: PipelineQuote): RowState => rows[quote.id] ?? defaultRow(quote);

  const patchRow = (quote: PipelineQuote, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [quote.id]: { ...(prev[quote.id] ?? defaultRow(quote)), ...patch },
    }));
  };

  const toggleQuote = (quote: PipelineQuote, next: boolean) => {
    const row = rowFor(quote);
    if (!next) {
      patchRow(quote, { checked: false });
      return;
    }
    const effective = row.effective || todayLocalDate();
    patchRow(quote, {
      checked: true,
      effective,
      expiration: row.expirationEdited ? row.expiration : deriveExpiration(effective, quote.term),
    });
  };

  const changeEffective = (quote: PipelineQuote, iso: string) => {
    const row = rowFor(quote);
    patchRow(quote, {
      effective: iso,
      expiration: row.expirationEdited
        ? row.expiration
        : iso
          ? deriveExpiration(iso, quote.term)
          : '',
    });
  };

  const selected = item.quotes.filter((quote) => rowFor(quote).checked);
  const blocked = selected.filter((quote) => blockReason(quote) !== null);
  const incomplete = selected.filter((quote) => {
    const row = rowFor(quote);
    return !row.policyNumber.trim() || !row.effective;
  });
  const partyReady = !needsParty || partyMode === 'create' || !!attachTo;
  const canBind =
    selected.length > 0 &&
    blocked.length === 0 &&
    incomplete.length === 0 &&
    partyReady &&
    !bind.isPending;

  const customerName = needsParty
    ? partyMode === 'attach'
      ? (attachTo?.name ?? null)
      : (item.party?.name ?? null)
    : (item.party?.name ?? null);

  const handleBind = async () => {
    if (!canBind) return;
    setErrorText(null);
    const policies: BindPolicyInput[] = selected.map((quote) => {
      const row = rowFor(quote);
      return {
        quote_id: quote.id,
        policy_number: row.policyNumber.trim(),
        effective_date: row.effective,
        expiration_date: row.expiration || null,
      };
    });
    try {
      const res = (await bind.mutateAsync({
        itemId: item.id,
        policies,
        partyMode: needsParty ? partyMode : null,
        accountId: needsParty && partyMode === 'attach' ? (attachTo?.id ?? null) : null,
        note: note.trim() || null,
      })) as BindResult;
      setResult(res);
    } catch (err) {
      setErrorText(readError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 rounded-cc-xl border-cc-border-subtle bg-cc-surface-overlay p-0 shadow-lift">
        <div className="px-6 pt-6">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">
              {result ? 'Bound' : 'Bind this sale'}
            </DialogTitle>
            <DialogDescription className="text-cc-text-secondary">
              {result
                ? 'Here is what it produced.'
                : 'Pick what was bound and enter the policy number. Everything else comes from the quote.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[62vh] space-y-5 overflow-y-auto px-6 py-5">
          {result ? (
            <BindSummary
              result={result}
              customerName={customerName}
              policies={selected.map((quote) => ({ quote, row: rowFor(quote) }))}
            />
          ) : item.quotes.length === 0 ? (
            <div className="rounded-cc-lg border border-cc-border-subtle bg-cc-surface p-8 text-center">
              <p className="text-sm text-cc-text-secondary">
                There are no quotes on this sale yet. Add the carrier quote you are binding, then
                bind it here.
              </p>
              <Button
                type="button"
                data-primary
                onClick={() => onOpenChange(false)}
                className="mt-4 h-10 rounded-cc-md bg-cc-accent text-cc-on-accent hover:bg-cc-accent-hover"
              >
                Back to the quotes
              </Button>
            </div>
          ) : (
            <>
              {needsParty && (
                <section className="space-y-2">
                  <SectionLabel>Customer file</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    <ModeChip
                      label="Create customer"
                      selected={partyMode === 'create'}
                      onClick={() => setPartyMode('create')}
                    />
                    <ModeChip
                      label="Attach to existing"
                      selected={partyMode === 'attach'}
                      onClick={() => setPartyMode('attach')}
                    />
                  </div>

                  {partyMode === 'create' ? (
                    <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface p-3">
                      <p className="text-sm font-semibold text-cc-text-primary">
                        {item.party?.name ?? 'This prospect'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Chip>New customer file</Chip>
                        {item.lines_wanted.map((line) => (
                          <Chip key={line}>{lineLabel(line)}</Chip>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attachTo ? (
                        <div className="flex items-center justify-between gap-3 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-3">
                          <p className="text-sm font-semibold text-cc-text-primary">
                            {attachTo.name}
                          </p>
                          <button
                            type="button"
                            onClick={() => setAttachTo(null)}
                            className="text-xs text-cc-text-muted underline-offset-2 hover:text-cc-text-primary hover:underline"
                          >
                            Change customer
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Search
                              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted"
                              aria-hidden="true"
                            />
                            <Input
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              placeholder="Search name, nickname, email, phone"
                              aria-label="Search customers to attach this sale to"
                              className={cn(FIELD_CLS, 'pl-9')}
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto rounded-cc-md border border-cc-border-subtle bg-cc-surface">
                            {searching ? (
                              <div className="space-y-2 p-3">
                                <Skeleton className="h-8 w-full rounded-cc-md" />
                                <Skeleton className="h-8 w-4/5 rounded-cc-md" />
                              </div>
                            ) : results.length === 0 ? (
                              <p className="px-3 py-3 text-sm text-cc-text-muted">
                                {query.trim()
                                  ? 'No matching customers. Create the customer instead.'
                                  : 'Type to search the book.'}
                              </p>
                            ) : (
                              <ul className="divide-y divide-cc-border-subtle">
                                {results.map((r) => (
                                  <li key={r.account_id}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAttachTo({ id: r.account_id, name: r.name });
                                        setQuery('');
                                        clear();
                                      }}
                                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay"
                                    >
                                      <span className="min-w-0">
                                        <span className="block text-sm text-cc-text-primary">
                                          {r.name}
                                        </span>
                                        <span className="block text-xs text-cc-text-muted">
                                          {accountTypeLabel(r.type)}
                                        </span>
                                      </span>
                                      <Chip>
                                        <span className="cc-num">{r.policies_count}</span> pol
                                      </Chip>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section className="space-y-2">
                <SectionLabel>What was bound</SectionLabel>
                <div className="space-y-3">
                  {item.quotes.map((quote) => {
                    const row = rowFor(quote);
                    const reason = blockReason(quote);
                    const showBlock = row.checked && !!reason;
                    return (
                      <AccentSpine key={quote.id} active={row.checked} className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`bind-quote-${quote.id}`}
                            checked={row.checked}
                            onCheckedChange={(v) => toggleQuote(quote, v === true)}
                            className="mt-1 border-cc-border-interactive data-[state=checked]:border-cc-accent data-[state=checked]:bg-transparent data-[state=checked]:text-cc-accent"
                          />
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`bind-quote-${quote.id}`}
                              className="flex cursor-pointer flex-wrap items-center gap-2"
                            >
                              <span className="text-sm font-semibold text-cc-text-primary">
                                {lineLabel(quote.line)}
                              </span>
                              <Chip>{quote.carrier_name ?? 'No carrier'}</Chip>
                              {quote.premium !== null && (
                                <Chip>
                                  <span className="cc-num">{formatCurrency(quote.premium)}</span>
                                </Chip>
                              )}
                              {termLabel(quote.term) && <Chip>{termLabel(quote.term)}</Chip>}
                              <StatusPill
                                override={{
                                  label: QUOTE_STATUS_LABELS[quote.status] ?? quote.status,
                                  tone:
                                    quote.status === 'accepted'
                                      ? 'success'
                                      : quote.status === 'declined'
                                        ? 'neutral'
                                        : 'info',
                                }}
                              />
                            </label>

                            {showBlock && (
                              <div
                                role="alert"
                                className="mt-3 flex items-start gap-2 rounded-cc-md border border-cc-danger/40 bg-cc-surface p-3"
                              >
                                <AlertTriangle
                                  className="mt-0.5 h-4 w-4 shrink-0 text-cc-danger"
                                  aria-hidden="true"
                                />
                                <div className="min-w-0 text-xs">
                                  <p className="font-semibold text-cc-danger">
                                    Carrier not on the list
                                  </p>
                                  <p className="mt-1 text-cc-text-secondary">{reason}</p>
                                  <Link
                                    to="/carriers"
                                    className="mt-1.5 inline-block text-cc-text-primary underline underline-offset-2 hover:text-cc-accent"
                                  >
                                    Open the carrier list
                                  </Link>
                                </div>
                              </div>
                            )}

                            {row.checked && !reason && (
                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <div>
                                  <Label
                                    htmlFor={`bind-number-${quote.id}`}
                                    className="text-cc-text-muted"
                                  >
                                    Policy number
                                  </Label>
                                  <Input
                                    id={`bind-number-${quote.id}`}
                                    value={row.policyNumber}
                                    onChange={(e) =>
                                      patchRow(quote, { policyNumber: e.target.value })
                                    }
                                    placeholder="From the carrier"
                                    className={cn(FIELD_CLS, 'mt-1.5 cc-num')}
                                  />
                                </div>
                                <div>
                                  <Label
                                    htmlFor={`bind-effective-${quote.id}`}
                                    className="text-cc-text-muted"
                                  >
                                    Effective
                                  </Label>
                                  <DateField
                                    id={`bind-effective-${quote.id}`}
                                    value={row.effective}
                                    onChange={(iso) => changeEffective(quote, iso)}
                                    aria-label={`Effective date for the ${lineLabel(quote.line)} policy`}
                                    containerClassName="mt-1.5"
                                    className={cn(FIELD_CLS, 'cc-num')}
                                  />
                                </div>
                                <div>
                                  <Label
                                    htmlFor={`bind-expiration-${quote.id}`}
                                    className="text-cc-text-muted"
                                  >
                                    Expires
                                  </Label>
                                  {row.showExpiration ? (
                                    <DateField
                                      id={`bind-expiration-${quote.id}`}
                                      value={row.expiration}
                                      onChange={(iso) =>
                                        patchRow(quote, { expiration: iso, expirationEdited: true })
                                      }
                                      aria-label={`Expiration date for the ${lineLabel(quote.line)} policy`}
                                      containerClassName="mt-1.5"
                                      className={cn(FIELD_CLS, 'cc-num')}
                                    />
                                  ) : (
                                    <div className="mt-1.5 flex h-10 items-center gap-2">
                                      <span className="cc-num text-sm text-cc-text-secondary">
                                        {formatLocalDateDisplay(row.expiration) || 'Set effective'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => patchRow(quote, { showExpiration: true })}
                                        aria-label={`Change the expiration date for the ${lineLabel(quote.line)} policy`}
                                        className="text-xs text-cc-text-muted underline-offset-2 hover:text-cc-text-primary hover:underline"
                                      >
                                        change
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </AccentSpine>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2">
                <Label htmlFor="bind-note" className="text-cc-text-muted">
                  Note (optional)
                </Label>
                <Textarea
                  id="bind-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anything the file should carry forward"
                  className="rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted"
                />
              </section>

              {errorText && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-cc-md border border-cc-danger/40 bg-cc-surface p-4"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-cc-danger"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-cc-danger">
                      The bind did not go through
                    </p>
                    <p className="mt-1 break-words text-sm text-cc-text-primary">
                      {errorText.message}
                    </p>
                    {errorText.extra.map((line) => (
                      <p key={line} className="mt-1 break-words text-xs text-cc-text-secondary">
                        {line}
                      </p>
                    ))}
                    <p className="mt-2 text-xs text-cc-text-muted">
                      Nothing was saved. The bind is one transaction, so it rolls all the way back.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-cc-border-subtle px-6 py-4">
          {!result && item.quotes.length > 0 && (
            <p className="mr-auto text-xs text-cc-text-muted">
              {selected.length === 0
                ? 'Pick at least one quote to bind.'
                : blocked.length > 0
                  ? 'Fix the carrier on the flagged quote first.'
                  : incomplete.length > 0
                    ? 'Every bound quote needs a policy number and an effective date.'
                    : !partyReady
                      ? 'Pick the customer to attach this to.'
                      : ''}
            </p>
          )}
          {result ? (
            <Button
              type="button"
              data-primary
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-cc-md bg-cc-accent text-cc-on-accent hover:bg-cc-accent-hover"
            >
              Done
            </Button>
          ) : (
            item.quotes.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="h-10 rounded-cc-md text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  data-primary
                  disabled={!canBind}
                  onClick={handleBind}
                  className="h-10 rounded-cc-md bg-cc-accent text-cc-on-accent hover:bg-cc-accent-hover"
                >
                  {bind.isPending ? 'Binding...' : 'Bind'}
                </Button>
              </>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-8 rounded-cc-md border px-3 text-xs transition-colors',
        selected
          ? 'border-cc-accent bg-cc-surface-overlay text-cc-text-primary'
          : 'border-transparent bg-cc-surface-overlay text-cc-text-secondary hover:text-cc-text-primary',
      )}
    >
      {label}
    </button>
  );
}

function BindSummary({
  result,
  customerName,
  policies,
}: {
  result: BindResult;
  customerName: string | null;
  policies: { quote: PipelineQuote; row: RowState }[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-cc-md border border-cc-border-subtle bg-cc-surface p-4">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cc-success" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cc-text-primary">
            {result.already_bound
              ? 'This sale was already bound'
              : `${result.policy_count} ${result.policy_count === 1 ? 'policy' : 'policies'} written`}
          </p>
          <p className="mt-1 text-sm text-cc-text-secondary">
            <span className="cc-num">{result.policy_count}</span>
            {result.policy_count === 1 ? ' policy' : ' policies'} on the file, premium{' '}
            <span className="cc-num">{formatCurrency(result.premium_total ?? 0)}</span>.
          </p>
        </div>
      </div>

      {customerName && (
        <div>
          <SectionLabel>Customer</SectionLabel>
          <p className="mt-1 text-sm font-semibold text-cc-text-primary">{customerName}</p>
        </div>
      )}

      {!result.already_bound && policies.length > 0 && (
        <div>
          <SectionLabel>Policies written</SectionLabel>
          <ul className="mt-2 divide-y divide-cc-border-subtle rounded-cc-md border border-cc-border-subtle bg-cc-surface">
            {policies.map(({ quote, row }) => (
              <li key={quote.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="text-sm font-semibold text-cc-text-primary">
                  {lineLabel(quote.line)}
                </span>
                <Chip>{quote.carrier_name ?? 'No carrier'}</Chip>
                <span className="cc-num text-sm text-cc-text-secondary">{row.policyNumber}</span>
                <span className="cc-num ml-auto text-xs text-cc-text-muted">
                  {formatLocalDateDisplay(row.effective)}
                  {row.expiration ? ` to ${formatLocalDateDisplay(row.expiration)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.renewal_outcome && (
        <p className="text-xs text-cc-text-muted">
          The renewal this came from was closed as {result.renewal_outcome}.
        </p>
      )}
    </div>
  );
}
