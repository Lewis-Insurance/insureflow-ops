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

  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.status === 'selected') || quotes.find((quote) => quote.status === 'quoted') || null,
    [quotes],
  );

  const quoteCountLabel = `${quotes.length} quote${quotes.length === 1 ? '' : 's'}`;

  const getStatusBadge = (status: AORenewalQuote['status']) => {
    const variants: Record<typeof status, { variant: any; label: string }> = {
      quoted: { variant: 'secondary', label: 'Quoted' },
      denied: { variant: 'destructive', label: 'Denied' },
      selected: { variant: 'default', label: 'Selected' },
      expired: { variant: 'outline', label: 'Expired' },
    };
    
    const { variant, label } = variants[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const calculateAnnualPremium = (quote: AORenewalQuote) => {
    return quote.term_months === 6 ? quote.premium * 2 : quote.premium;
  };

  const calculateSavings = (quote: AORenewalQuote, currentPremiumValue: number | null, currentTermMonths: 6 | 12 | null) => {
    if (!currentPremiumValue || !currentTermMonths) return null;
    
    // Normalize both to annual premiums
    const annualAutoOwners = currentTermMonths === 6 ? currentPremiumValue * 2 : currentPremiumValue;
    const annualQuote = quote.term_months === 6 ? quote.premium * 2 : quote.premium;
    
    const difference = annualAutoOwners - annualQuote;
    const percentage = (difference / annualAutoOwners) * 100;
    return { amount: difference, percentage };
  };

  const handleDelete = (id: string) => {
    setDeleteQuoteId(id);
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
        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>Competitive Quotes</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 normal-case tracking-normal text-slate-300">{quoteCountLabel}</span>
            </div>
            {selectedQuote ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-2xl font-semibold text-white">{selectedQuote.carrier}</div>
                  {getStatusBadge(selectedQuote.status)}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><ShieldCheck className="h-4 w-4 text-lime-300" />{formatCurrency(selectedQuote.premium)}</span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><Clock3 className="h-4 w-4 text-sky-300" />{selectedQuote.term_months} month term</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-semibold text-white">No quote entered yet</div>
                <p className="mt-2 text-sm text-slate-400">Add the first market option here so the selling surface starts where the work starts.</p>
              </div>
            )}
          </div>

          <Button onClick={() => setShowAddModal(true)} className="h-11 rounded-2xl bg-white text-slate-950 hover:bg-slate-100">
            <Plus className="mr-2 h-4 w-4" />
            Add Quote
          </Button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0f1728]/80 p-4">
          {!currentTermMonths && (
            <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
              <p className="text-sm text-amber-100">
                ⚠️ Please set the Auto-Owners policy term (6-month or 12-month) above to see accurate quote comparisons.
              </p>
            </div>
          )}
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">
              Loading quotes...
            </div>
          ) : quotes.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              No quotes added yet. Click "Add Quote" to enter a competitive quote.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0b1020]">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-slate-300">Carrier</TableHead>
                    <TableHead className="text-slate-300">Premium</TableHead>
                    <TableHead className="text-slate-300">Term</TableHead>
                    <TableHead className="text-slate-300">Annual</TableHead>
                    {currentPremium && currentTermMonths && <TableHead className="text-slate-300">Savings</TableHead>}
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Document</TableHead>
                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => {
                    const annualPremium = calculateAnnualPremium(quote);
                    const savings = calculateSavings(quote, currentPremium ?? null, currentTermMonths ?? null);

                    return (
                      <TableRow key={quote.id} className="border-white/10 hover:bg-white/5">
                        <TableCell className="font-medium text-white">{quote.carrier}</TableCell>
                        <TableCell className="text-slate-200">{formatCurrency(quote.premium)}</TableCell>
                        <TableCell className="text-slate-300">{quote.term_months} months</TableCell>
                        <TableCell className="text-slate-200">{formatCurrency(annualPremium)}</TableCell>
                        {currentPremium && currentTermMonths && (
                          <TableCell>
                            {savings && (
                              <div className="flex items-center gap-1.5">
                                {savings.amount > 0 ? (
                                  <>
                                    <TrendingDown className="h-4 w-4 text-emerald-300" />
                                    <span className="font-medium text-emerald-300">
                                      Save {formatCurrency(savings.amount)}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <TrendingUp className="h-4 w-4 text-rose-300" />
                                    <span className="font-medium text-rose-300">
                                      +{formatCurrency(Math.abs(savings.amount))}
                                    </span>
                                  </>
                                )}
                                <span className="text-xs text-slate-500">({Math.abs(savings.percentage).toFixed(1)}%)</span>
                              </div>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="space-y-1">
                            {getStatusBadge(quote.status)}
                            {quote.status === 'denied' && quote.denial_reason && (
                              <div className="text-xs text-slate-500">
                                {quote.denial_reason}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {quote.document_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-300 hover:bg-white/10 hover:text-white"
                              asChild
                            >
                              <a href={quote.document_url} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-4 w-4 mr-1" />
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-300 hover:bg-white/10 hover:text-white"
                              onClick={() => setEditQuote(quote)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-300 hover:bg-white/10 hover:text-white"
                              onClick={() => handleDelete(quote.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {quotes.some(q => q.notes) && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium text-slate-200">Notes</h4>
                  {quotes.filter(q => q.notes).map((quote) => (
                    <div key={quote.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                      <span className="font-medium text-white">{quote.carrier}:</span> {quote.notes}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AddQuoteModal 
        open={showAddModal}
        onOpenChange={setShowAddModal}
        renewalId={renewalId}
      />

      {editQuote && (
        <EditQuoteModal 
          open={!!editQuote}
          onOpenChange={(open) => !open && setEditQuote(null)}
          quote={editQuote}
        />
      )}

      <AlertDialog open={!!deleteQuoteId} onOpenChange={() => setDeleteQuoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quote? This action cannot be undone.
            </AlertDialogDescription>
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
