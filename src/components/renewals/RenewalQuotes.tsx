import { useState } from 'react';
import { format } from 'date-fns';
import { parseLocalDate, todayLocalDate } from '@/lib/date/localDate';
import { Plus, CheckCircle, Trash2, DollarSign, FileText, ExternalLink, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import {
  useRenewalQuotes,
  useAddRenewalQuote,
  useSelectRenewalQuote,
  useDeleteRenewalQuote,
  RenewalQuote,
  QuoteStatus,
} from '@/hooks/useRenewalWorkflow';
import { useMovedCarriers } from '@/hooks/useMovedCarriers';

interface RenewalQuotesProps {
  renewalId: string;
  currentPremium: number | null;
}

const QUOTE_STATUSES: { value: QuoteStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'bg-gray-100 text-gray-700' },
  { value: 'presented', label: 'Presented', color: 'bg-blue-100 text-blue-700' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-700' },
  { value: 'declined', label: 'Declined', color: 'bg-red-100 text-red-700' },
  { value: 'expired', label: 'Expired', color: 'bg-orange-100 text-orange-700' },
];

function getStatusBadge(status: QuoteStatus) {
  const config = QUOTE_STATUSES.find((s) => s.value === status);
  return (
    <Badge className={config?.color || 'bg-gray-100 text-gray-700'}>
      {config?.label || status}
    </Badge>
  );
}

export function RenewalQuotes({ renewalId, currentPremium }: RenewalQuotesProps) {
  const { data: quotes, isLoading, error } = useRenewalQuotes(renewalId);
  const { data: carriers = [] } = useMovedCarriers();
  const addQuote = useAddRenewalQuote();
  const selectQuote = useSelectRenewalQuote();
  const deleteQuote = useDeleteRenewalQuote();

  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RenewalQuote | null>(null);
  const [newQuote, setNewQuote] = useState({
    carrier: '',
    premium: '',
    term_months: '12',
    coverage_summary: '',
    quote_date: todayLocalDate(),
    expiration_date: '',
    notes: '',
  });

  const handleAddQuote = () => {
    const premium = parseFloat(newQuote.premium);
    if (!newQuote.carrier || isNaN(premium) || premium <= 0) return;

    addQuote.mutate(
      {
        renewalId,
        carrier: newQuote.carrier,
        premium,
        term_months: parseInt(newQuote.term_months) || 12,
        coverage_summary: newQuote.coverage_summary || undefined,
        quote_date: newQuote.quote_date || undefined,
        expiration_date: newQuote.expiration_date || undefined,
        notes: newQuote.notes || undefined,
      },
      {
        onSuccess: () => {
          setShowAddModal(false);
          setNewQuote({
            carrier: '',
            premium: '',
            term_months: '12',
            coverage_summary: '',
            quote_date: todayLocalDate(),
            expiration_date: '',
            notes: '',
          });
        },
      }
    );
  };

  const handleSelectQuote = (quote: RenewalQuote) => {
    selectQuote.mutate({ quoteId: quote.id, renewalId });
  };

  const handleDeleteQuote = () => {
    if (!deleteTarget) return;
    deleteQuote.mutate(
      { quoteId: deleteTarget.id, renewalId },
      {
        onSuccess: () => setDeleteTarget(null),
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Competitive Quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          <p>Failed to load quotes</p>
        </CardContent>
      </Card>
    );
  }

  // Sort quotes: selected first, then by premium
  const sortedQuotes = [...(quotes || [])].sort((a, b) => {
    if (a.is_selected !== b.is_selected) return a.is_selected ? -1 : 1;
    return a.premium - b.premium;
  });

  const lowestPremium = quotes?.length ? Math.min(...quotes.map((q) => q.premium)) : null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Competitive Quotes</CardTitle>
            {currentPremium && (
              <p className="text-sm text-muted-foreground mt-1">
                Current premium: {formatCurrency(currentPremium)}
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Quote
          </Button>
        </CardHeader>
        <CardContent>
          {sortedQuotes.length > 0 ? (
            <div className="space-y-4">
              {sortedQuotes.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  quote={quote}
                  currentPremium={currentPremium}
                  isLowest={quote.premium === lowestPremium}
                  onSelect={() => handleSelectQuote(quote)}
                  onDelete={() => setDeleteTarget(quote)}
                  isSelecting={selectQuote.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No quotes yet</p>
              <p className="text-sm mt-1">Add competitive quotes to compare options</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Quote Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Quote</DialogTitle>
            <DialogDescription>
              Add a competitive quote from a carrier
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Carrier */}
              <div className="space-y-2">
                <Label htmlFor="carrier">Carrier *</Label>
                <Select
                  value={newQuote.carrier}
                  onValueChange={(value) =>
                    setNewQuote((prev) => ({ ...prev, carrier: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select carrier" />
                  </SelectTrigger>
                  <SelectContent>
                    {carriers.map((carrier) => (
                      <SelectItem key={carrier.id} value={carrier.name}>
                        {carrier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Premium */}
              <div className="space-y-2">
                <Label htmlFor="premium">Premium *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="premium"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newQuote.premium}
                    onChange={(e) =>
                      setNewQuote((prev) => ({ ...prev, premium: e.target.value }))
                    }
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Term */}
              <div className="space-y-2">
                <Label htmlFor="term">Term (months)</Label>
                <Select
                  value={newQuote.term_months}
                  onValueChange={(value) =>
                    setNewQuote((prev) => ({ ...prev, term_months: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 months</SelectItem>
                    <SelectItem value="12">12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quote Date */}
              <div className="space-y-2">
                <Label htmlFor="quote_date">Quote Date</Label>
                <Input
                  id="quote_date"
                  type="date"
                  value={newQuote.quote_date}
                  onChange={(e) =>
                    setNewQuote((prev) => ({ ...prev, quote_date: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Expiration Date */}
            <div className="space-y-2">
              <Label htmlFor="expiration_date">Quote Expires</Label>
              <Input
                id="expiration_date"
                type="date"
                value={newQuote.expiration_date}
                onChange={(e) =>
                  setNewQuote((prev) => ({ ...prev, expiration_date: e.target.value }))
                }
              />
            </div>

            {/* Coverage Summary */}
            <div className="space-y-2">
              <Label htmlFor="coverage_summary">Coverage Summary</Label>
              <Textarea
                id="coverage_summary"
                placeholder="Briefly describe the coverage..."
                rows={2}
                value={newQuote.coverage_summary}
                onChange={(e) =>
                  setNewQuote((prev) => ({ ...prev, coverage_summary: e.target.value }))
                }
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes..."
                rows={2}
                value={newQuote.notes}
                onChange={(e) =>
                  setNewQuote((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddQuote}
              disabled={addQuote.isPending || !newQuote.carrier || !newQuote.premium}
            >
              {addQuote.isPending ? 'Saving...' : 'Add Quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the quote from {deleteTarget?.carrier}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteQuote}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuoteCard({
  quote,
  currentPremium,
  isLowest,
  onSelect,
  onDelete,
  isSelecting,
}: {
  quote: RenewalQuote;
  currentPremium: number | null;
  isLowest: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isSelecting: boolean;
}) {
  const savings = currentPremium ? currentPremium - quote.premium : null;
  const savingsPercent = currentPremium && savings ? (savings / currentPremium) * 100 : null;

  return (
    <div
      className={`p-4 rounded-lg border ${
        quote.is_selected
          ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
          : isLowest
          ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/20'
          : 'bg-card'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{quote.carrier}</span>
            {quote.is_selected && (
              <Badge className="bg-green-100 text-green-700">
                <CheckCircle className="h-3 w-3 mr-1" />
                Selected
              </Badge>
            )}
            {isLowest && !quote.is_selected && (
              <Badge className="bg-blue-100 text-blue-700">Lowest</Badge>
            )}
            {getStatusBadge(quote.status)}
          </div>

          <div className="flex items-baseline gap-3 mt-2">
            <span className="text-2xl font-bold">{formatCurrency(quote.premium)}</span>
            <span className="text-sm text-muted-foreground">
              / {quote.term_months === 6 ? '6 months' : 'year'}
            </span>
            {savings !== null && (
              <span
                className={`text-sm font-medium flex items-center gap-1 ${
                  savings > 0 ? 'text-green-600' : savings < 0 ? 'text-red-600' : ''
                }`}
              >
                {savings > 0 ? (
                  <>
                    <TrendingDown className="h-3 w-3" />
                    Save {formatCurrency(savings)} ({savingsPercent?.toFixed(1)}%)
                  </>
                ) : savings < 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3" />+{formatCurrency(Math.abs(savings))} (
                    {Math.abs(savingsPercent || 0).toFixed(1)}%)
                  </>
                ) : (
                  'Same as current'
                )}
              </span>
            )}
          </div>

          {quote.coverage_summary && (
            <p className="text-sm text-muted-foreground mt-2">{quote.coverage_summary}</p>
          )}

          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            {quote.quote_date && (
              <span>Quoted: {format(parseLocalDate(quote.quote_date), 'MMM d, yyyy')}</span>
            )}
            {quote.expiration_date && (
              <span>Expires: {format(parseLocalDate(quote.expiration_date), 'MMM d, yyyy')}</span>
            )}
          </div>

          {quote.notes && (
            <p className="text-sm text-muted-foreground mt-2 italic">{quote.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {quote.document_url && (
            <Button variant="outline" size="icon" asChild>
              <a href={quote.document_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          {!quote.is_selected && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSelect}
              disabled={isSelecting}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Select
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
