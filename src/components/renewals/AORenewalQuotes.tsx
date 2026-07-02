import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Trash2, ExternalLink, TrendingDown, TrendingUp, Pencil, ShieldCheck, Clock3 } from 'lucide-react';
import { useAORenewalQuotes, useDeleteAORenewalQuote, type AORenewalQuote } from '@/hooks/useAORenewalQuotes';
import { AddQuoteModal } from './AddQuoteModal';
import { EditQuoteModal } from './EditQuoteModal';
import { formatCurrency } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AORenewalQuotesProps {
  renewalId: string;
  currentPremium?: number | null;
  currentTermMonths?: 6 | 12 | null;
}

export function AORenewalQuotes({ renewalId, currentPremium, currentTermMonths }: AORenewalQuotesProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editQuote, setEditQuote] = useState<AORenewalQuote | null>(null);
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null);

  const { data: quotes = [], isLoading } = useAORenewalQuotes(renewalId);
  const deleteMutation = useDeleteAORenewalQuote();

  const priceableQuotes = useMemo(
    () => quotes.filter((q) => q.status !== 'denied' && q.premium != null),
    [quotes],
  );

  const selectedQuote = useMemo(
    () =>
      priceableQuotes.find((q) => q.status === 'selected') ||
      priceableQuotes.find((q) => q.status === 'quoted') ||
      quotes[0] ||
      null,
    [priceableQuotes, quotes],
  );

  const quoteCountLabel = `${quotes.length} quote${quotes.length === 1 ? '' : 's'}`;

  const getStatusBadge = (status: AORenewalQuote['status']) => {
    const variants: Record<typeof status, { variant: any; label: string }> = {
      quoted:   { variant: 'secondary', label: 'Quoted' },
      denied:   { variant: 'destructive', label: 'Denied' },
      selected: { variant: 'default', label: 'Selected' },
      expired:  { variant: 'outline', label: 'Expired' },
    };
    const { variant, label } = variants[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const calculateAnnualPremium = (quote: AORenewalQuote) => {
    if (quote.premium == null || quote.term_months == null) return null;
    return quote.term_months === 6 ? quote.premium * 2 : quote.premium;
  };

  const formatQuotePremium = (quote: AORenewalQuote) => {
    if (quote.premium == null) return quote.status === 'denied' ? 'Declined' : '—';
    return formatCurrency(quote.premium);
  };

  const calculateSavings = (
    quote: AORenewalQuote,
    currentPremiumValue: number | null,
    currentTermMonths: 6 | 12 | null,
  ) => {
    if (!currentPremiumValue || !currentTermMonths || quote.premium == null || quote.term_months == null) return null;
    const annualAO = currentTermMonths === 6 ? currentPremiumValue * 2 : currentPremiumValue;
    const annualQuote = quote.term_months === 6 ? quote.premium * 2 : quote.premium;
    const difference = annualAO - annualQuote;
    return { amount: difference, percentage: (difference / annualAO) * 100 };
  };

  const confirmDelete = async () => {
    if (deleteQuoteId) {
      await deleteMutation.mutateAsync(deleteQuoteId);
      setDeleteQuoteId(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-4 rounded-3xl border border-cc-border-subtle bg-cc-surface-raised p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-cc-text-muted">
              <span>Competitive Quotes</span>
              <span className="rounded-full border border-cc-border-subtle bg-cc-surface-overlay px-2.5 py-1 normal-case tracking-normal text-cc-text-secondary">{quoteCountLabel}</span>
            </div>
            {selectedQuote ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-2xl font-semibold text-cc-text-primary">{selectedQuote.carrier}</div>
                  {getStatusBadge(selectedQuote.status)}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-cc-text-secondary">
                  <span className="inline-flex items-center gap-2 rounded-full border border-cc-border-subtle bg-cc-surface-overlay px-3 py-1.5">
                    <ShieldCheck className="h-4 w-4 text-cc-accent" />{formatQuotePremium(selectedQuote)}
                  </span>
                  {selectedQuote.term_months != null && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-cc-border-subtle bg-cc-surface-overlay px-3 py-1.5">
                      <Clock3 className="h-4 w-4 text-info" />{selectedQuote.term_months} month term
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-semibold text-cc-text-primary">No quote entered yet</div>
                <p className="mt-2 text-sm text-cc-text-muted">
                  Add the first market option here so the selling surface starts where the work starts.
                </p>
              </div>
            )}
          </div>
          <Button onClick={() => setShowAddModal(true)} className="h-11 rounded-2xl bg-cc-surface-raised text-cc-text-primary hover:bg-cc-surface-overlay">
            <Plus className="mr-2 h-4 w-4" />Add Quote
          </Button>
        </div>

        <div className="rounded-3xl border border-cc-border-subtle bg-cc-surface p-4">
          {!currentTermMonths && (
            <div className="mb-4 rounded-2xl border border-warning/30 bg-warning/10 p-3">
              <p className="text-sm text-warning">
                ⚠️ Please set the Auto-Owners policy term (6-month or 12-month) above to see accurate quote comparisons.
              </p>
            </div>
          )}
          {isLoading ? (
            <div className="py-8 text-center text-cc-text-muted">Loading quotes...</div>
          ) : quotes.length === 0 ? (
            <div className="py-8 text-center text-cc-text-muted">
              No quotes added yet. Click "Add Quote" to enter a competitive quote.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-cc-border-subtle bg-cc-surface-raised">
                <Table>
                  <TableHeader>
                    <TableRow className="border-cc-border-subtle hover:bg-transparent">
                      <TableHead className="text-cc-text-secondary">Carrier</TableHead>
                      <TableHead className="text-cc-text-secondary">Premium</TableHead>
                      <TableHead className="text-cc-text-secondary">Term</TableHead>
                      <TableHead className="text-cc-text-secondary">Annual</TableHead>
                      {currentPremium && currentTermMonths && <TableHead className="text-cc-text-secondary">Savings</TableHead>}
                      <TableHead className="text-cc-text-secondary">Status</TableHead>
                      <TableHead className="text-cc-text-secondary">Document</TableHead>
                      <TableHead className="text-right text-cc-text-secondary">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((quote) => {
                      const isDenied = quote.status === 'denied';
                      const annualPremium = calculateAnnualPremium(quote);
                      const savings = isDenied ? null : calculateSavings(quote, currentPremium ?? null, currentTermMonths ?? null);
                      const rowClass = isDenied
                        ? 'border-cc-border-subtle border-l-2 border-l-destructive/70 bg-destructive/[0.07] text-cc-text-muted hover:bg-destructive/10'
                        : 'border-cc-border-subtle hover:bg-cc-surface-raised';
                      const cellMuted = isDenied ? 'text-cc-text-muted' : 'text-cc-text-secondary';
                      return (
                        <TableRow key={quote.id} className={rowClass}>
                          <TableCell className={isDenied ? 'font-medium text-cc-text-muted line-through decoration-destructive/50' : 'font-medium text-cc-text-primary'}>
                            {quote.carrier}
                          </TableCell>
                          <TableCell className={cellMuted}>
                            {formatQuotePremium(quote)}
                          </TableCell>
                          <TableCell className={isDenied ? 'text-cc-text-muted' : 'text-cc-text-secondary'}>
                            {quote.term_months == null ? '—' : `${quote.term_months} months`}
                          </TableCell>
                          <TableCell className={cellMuted}>
                            {annualPremium != null ? formatCurrency(annualPremium) : '—'}
                          </TableCell>
                          {currentPremium && currentTermMonths && (
                            <TableCell>
                              {savings ? (
                                <div className="flex items-center gap-1.5">
                                  {savings.amount > 0 ? (
                                    <>
                                      <TrendingDown className="h-4 w-4 text-success" />
                                      <span className="font-medium text-success">Save {formatCurrency(savings.amount)}</span>
                                    </>
                                  ) : (
                                    <>
                                      <TrendingUp className="h-4 w-4 text-destructive" />
                                      <span className="font-medium text-destructive">+{formatCurrency(Math.abs(savings.amount))}</span>
                                    </>
                                  )}
                                  <span className="text-xs text-cc-text-muted">({savings.percentage.toFixed(1)}%)</span>
                                </div>
                              ) : (
                                <span className="text-cc-text-muted">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="space-y-1">
                              {getStatusBadge(quote.status)}
                              {isDenied && quote.denial_reason && (
                                <div className="text-xs text-destructive/70">{quote.denial_reason}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {quote.document_url && (
                              <Button variant="ghost" size="sm" className="text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary" asChild>
                                <a href={quote.document_url} target="_blank" rel="noopener noreferrer">
                                  <FileText className="h-4 w-4 mr-1" /><ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" className="text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary" onClick={() => setEditQuote(quote)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary" onClick={() => setDeleteQuoteId(quote.id)} disabled={deleteMutation.isPending}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {quotes.some((q) => q.notes) && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium text-cc-text-secondary">Notes</h4>
                  {quotes.filter((q) => q.notes).map((quote) => (
                    <div key={quote.id} className="rounded-2xl border border-cc-border-subtle bg-cc-surface-raised p-3 text-sm text-cc-text-secondary">
                      <span className="font-medium text-cc-text-primary">{quote.carrier}:</span> {quote.notes}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddQuoteModal open={showAddModal} onOpenChange={setShowAddModal} renewalId={renewalId} />

      {editQuote && (
        <EditQuoteModal open={!!editQuote} onOpenChange={(open) => !open && setEditQuote(null)} quote={editQuote} />
      )}

      <AlertDialog open={!!deleteQuoteId} onOpenChange={() => setDeleteQuoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this quote? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
