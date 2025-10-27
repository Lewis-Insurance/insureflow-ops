import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Trash2, ExternalLink, TrendingDown, TrendingUp } from 'lucide-react';
import { useAORenewalQuotes, useDeleteAORenewalQuote, type AORenewalQuote } from '@/hooks/useAORenewalQuotes';
import { AddQuoteModal } from './AddQuoteModal';
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
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null);
  
  const { data: quotes = [], isLoading } = useAORenewalQuotes(renewalId);
  const deleteMutation = useDeleteAORenewalQuote();

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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Competitive Quotes</CardTitle>
          <Button onClick={() => setShowAddModal(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Quote
          </Button>
        </CardHeader>
        <CardContent>
          {!currentTermMonths && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Please set the Auto-Owners policy term (6-month or 12-month) above to see accurate quote comparisons.
              </p>
            </div>
          )}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading quotes...
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No quotes added yet. Click "Add Quote" to enter a competitive quote.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Premium</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Annual Premium</TableHead>
                    {currentPremium && currentTermMonths && <TableHead>vs Auto-Owners</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => {
                    const annualPremium = calculateAnnualPremium(quote);
                    const savings = calculateSavings(quote, currentPremium ?? null, currentTermMonths ?? null);

                    return (
                      <TableRow key={quote.id}>
                        <TableCell className="font-medium">{quote.carrier}</TableCell>
                        <TableCell>{formatCurrency(quote.premium)}</TableCell>
                        <TableCell>{quote.term_months} months</TableCell>
                        <TableCell>{formatCurrency(annualPremium)}</TableCell>
                        {currentPremium && currentTermMonths && (
                          <TableCell>
                            {savings && (
                              <div className="flex items-center gap-1">
                                {savings.amount > 0 ? (
                                  <>
                                    <TrendingDown className="h-4 w-4 text-green-600" />
                                    <span className="text-green-600 font-medium">
                                      Save {formatCurrency(savings.amount)} ({savings.percentage.toFixed(1)}%)
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <TrendingUp className="h-4 w-4 text-red-600" />
                                    <span className="text-red-600 font-medium">
                                      +{formatCurrency(Math.abs(savings.amount))} (+{Math.abs(savings.percentage).toFixed(1)}%)
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="space-y-1">
                            {getStatusBadge(quote.status)}
                            {quote.status === 'denied' && quote.denial_reason && (
                              <div className="text-xs text-muted-foreground">
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(quote.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {quotes.some(q => q.notes) && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium">Notes:</h4>
                  {quotes.filter(q => q.notes).map((quote) => (
                    <div key={quote.id} className="text-sm p-2 bg-muted rounded">
                      <span className="font-medium">{quote.carrier}:</span> {quote.notes}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AddQuoteModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        renewalId={renewalId}
      />

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
