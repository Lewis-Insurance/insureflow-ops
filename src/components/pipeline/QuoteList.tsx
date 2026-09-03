/**
 * The quotes on an item.
 *
 * A quote is a carrier, a line, a number and a term. The term matters: a six month
 * premium and a twelve month premium are not the same sale, so the term is stored
 * and shown, and the yearly figure is what the board totals.
 *
 * Adding a quote is a ghost action. The one lime action on this panel is Bind.
 */

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { CarrierCombobox, type CarrierResolution } from '@/components/add-policy/CarrierCombobox';
import { Chip, SectionLabel } from '@/components/cc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ALL_LINES, lineLabel } from '@/config/intake/lineConfig';
import { useAddPipelineQuote, useUpdatePipelineQuote, type PipelineItem } from '@/hooks/usePipeline';
import { todayLocalDate } from '@/lib/date/localDate';
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, type QuoteStatus } from '@/lib/pipeline/stages';
import { annualizedPremium, bestQuoteForLine, formatMoney } from './PipelineCard';

const TERM_LABELS: Record<'semiannual' | 'annual', string> = {
  semiannual: '6 month',
  annual: '12 month',
};

export function QuoteList({ item }: { item: PipelineItem }) {
  const addQuote = useAddPipelineQuote();
  const updateQuote = useUpdatePipelineQuote();

  const [formOpen, setFormOpen] = useState(false);
  const [line, setLine] = useState<string>(item.lines_wanted[0] ?? 'auto');
  const [carrierName, setCarrierName] = useState('');
  const [carrier, setCarrier] = useState<CarrierResolution | null>(null);
  const [premium, setPremium] = useState('');
  const [term, setTerm] = useState<'semiannual' | 'annual'>('annual');
  const [note, setNote] = useState('');

  // Lines the client asked for come first, then everything else, so the common
  // choice is the first one in the list.
  const lineOptions = useMemo(() => {
    const wanted = item.lines_wanted.filter((l) => !!l);
    const rest = ALL_LINES.filter((l) => !wanted.includes(l));
    return [...wanted, ...rest];
  }, [item.lines_wanted]);

  /**
   * "Cheapest" only means something between two quotes on the SAME line. Comparing a
   * home premium against an auto premium says nothing, so the marker is only shown when
   * a line actually has more than one live quote to choose between.
   */
  const cheapestPerContestedLine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of item.quotes) {
      if (q.status === 'declined' || annualizedPremium(q) === null) continue;
      counts.set(q.line, (counts.get(q.line) ?? 0) + 1);
    }
    const marked = new Set<string>();
    counts.forEach((count, line) => {
      if (count < 2) return;
      const winner = bestQuoteForLine(item, line);
      if (winner) marked.add(winner.id);
    });
    return marked;
  }, [item]);
  const canSubmit = !!line && carrierName.trim().length > 0 && !addQuote.isPending;

  const resetForm = () => {
    setCarrierName('');
    setCarrier(null);
    setPremium('');
    setTerm('annual');
    setNote('');
  };

  const submit = () => {
    if (!canSubmit) return;
    const parsed = Number(premium.replace(/[^0-9.]/g, ''));
    addQuote.mutate(
      {
        itemId: item.id,
        line,
        carrierId: carrier?.id ?? null,
        carrierText: carrier?.id ? null : carrierName.trim(),
        premium: premium.trim() && Number.isFinite(parsed) ? parsed : null,
        term,
        quotedDate: todayLocalDate(),
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          resetForm();
          setFormOpen(false);
        },
      },
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Quotes</SectionLabel>
        {item.quotes.length > 0 && !formOpen && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFormOpen(true)}
            className="h-8 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add quote
          </Button>
        )}
      </div>

      {item.quotes.length === 0 && !formOpen ? (
        <div className="flex flex-col items-start gap-3 rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-4">
          <p className="text-sm text-cc-text-secondary">
            No quotes yet. Add the first one when a carrier comes back.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFormOpen(true)}
            className="h-8 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add quote
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {item.quotes.map((quote) => {
            const yearly = annualizedPremium(quote);
            return (
              <li
                key={quote.id}
                className="rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Chip>{lineLabel(quote.line)}</Chip>
                    <Chip>{quote.carrier_name ?? 'Carrier not set'}</Chip>
                    {quote.term && <Chip>{TERM_LABELS[quote.term]}</Chip>}
                    {cheapestPerContestedLine.has(quote.id) && (
                      <Chip>Cheapest on this line</Chip>
                    )}
                  </div>
                  <span className="cc-num text-sm font-semibold text-cc-text-primary">
                    {quote.premium === null ? (
                      <span className="text-xs font-normal text-cc-text-muted">No premium</span>
                    ) : (
                      <>
                        {formatMoney(quote.premium)}
                        {yearly !== null && yearly !== quote.premium && (
                          <span className="ml-1 text-xs font-normal text-cc-text-muted">
                            {formatMoney(yearly)} per year
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>

                {quote.note && <p className="mt-2 text-sm text-cc-text-secondary">{quote.note}</p>}

                <div className="mt-2 flex items-center gap-2">
                  <Select
                    value={quote.status}
                    onValueChange={(value) =>
                      updateQuote.mutate({
                        id: quote.id,
                        itemId: item.id,
                        status: value as QuoteStatus,
                      })
                    }
                  >
                    <SelectTrigger
                      aria-label={`Status of the ${lineLabel(quote.line)} quote`}
                      className="h-8 w-40 rounded-cc-md border-cc-border-interactive bg-cc-surface text-sm text-cc-text-primary"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUOTE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {QUOTE_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {quote.quoted_date && (
                    <span className="cc-num text-xs text-cc-text-muted">
                      Quoted {quote.quoted_date}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <div className="space-y-3 rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-3">
          <div className="flex items-center justify-between">
            <SectionLabel>New quote</SectionLabel>
            <button
              type="button"
              aria-label="Close the new quote form"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-cc-md text-cc-text-muted transition-colors duration-fast hover:bg-cc-surface-overlay hover:text-cc-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="quote-line" className="text-sm text-cc-text-secondary">
                Line
              </Label>
              <Select value={line} onValueChange={setLine}>
                <SelectTrigger
                  id="quote-line"
                  className="h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface text-cc-text-primary"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lineOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {lineLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="quote-term" className="text-sm text-cc-text-secondary">
                Term
              </Label>
              <Select value={term} onValueChange={(value) => setTerm(value as 'semiannual' | 'annual')}>
                <SelectTrigger
                  id="quote-term"
                  className="h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface text-cc-text-primary"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">12 month</SelectItem>
                  <SelectItem value="semiannual">6 month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="quote-carrier" className="text-sm text-cc-text-secondary">
                Carrier
              </Label>
              <CarrierCombobox
                id="quote-carrier"
                value={carrierName}
                resolution={carrier}
                onChange={(name, resolution) => {
                  setCarrierName(name);
                  setCarrier(resolution);
                }}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="quote-premium" className="text-sm text-cc-text-secondary">
                Premium
              </Label>
              <Input
                id="quote-premium"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                className="cc-num h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface text-cc-text-primary"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="quote-note" className="text-sm text-cc-text-secondary">
                Note
              </Label>
              <Input
                id="quote-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the next person needs"
                className="h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface text-cc-text-primary placeholder:text-cc-text-muted"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="h-8 rounded-cc-md text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canSubmit}
              onClick={submit}
              className="h-8 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {addQuote.isPending ? 'Saving' : 'Save quote'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
