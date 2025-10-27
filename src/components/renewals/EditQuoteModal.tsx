import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useUpdateAORenewalQuote, type AORenewalQuote } from '@/hooks/useAORenewalQuotes';

const CARRIERS = ['Progressive', 'Geico', 'Nationwide', 'Allstate', 'State Farm', 'Liberty Mutual', 'Farmers', 'USAA', 'Other'];

interface EditQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: AORenewalQuote;
}

export function EditQuoteModal({ open, onOpenChange, quote }: EditQuoteModalProps) {
  const updateMutation = useUpdateAORenewalQuote();
  
  const [carrier, setCarrier] = useState(quote.carrier);
  const [premium, setPremium] = useState(quote.premium.toString());
  const [termMonths, setTermMonths] = useState<'6' | '12'>(quote.term_months.toString() as '6' | '12');
  const [status, setStatus] = useState<'quoted' | 'denied' | 'selected' | 'expired'>(quote.status);
  const [denialReason, setDenialReason] = useState(quote.denial_reason || '');
  const [notes, setNotes] = useState(quote.notes || '');

  useEffect(() => {
    if (quote) {
      setCarrier(quote.carrier);
      setPremium(quote.premium.toString());
      setTermMonths(quote.term_months.toString() as '6' | '12');
      setStatus(quote.status);
      setDenialReason(quote.denial_reason || '');
      setNotes(quote.notes || '');
    }
  }, [quote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const premiumValue = parseFloat(premium);
    if (isNaN(premiumValue) || premiumValue <= 0) {
      return;
    }

    await updateMutation.mutateAsync({
      id: quote.id,
      updates: {
        carrier,
        premium: premiumValue,
        term_months: parseInt(termMonths) as 6 | 12,
        status,
        denial_reason: status === 'denied' ? denialReason : undefined,
        notes: notes || undefined,
      },
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Quote</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="carrier">Carrier *</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="premium">Premium *</Label>
              <Input
                id="premium"
                type="number"
                step="0.01"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="term">Term *</Label>
              <Select value={termMonths} onValueChange={(v) => setTermMonths(v as '6' | '12')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status *</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="selected">Selected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {status === 'denied' && (
            <div>
              <Label htmlFor="denial_reason">Denial Reason</Label>
              <Input
                id="denial_reason"
                value={denialReason}
                onChange={(e) => setDenialReason(e.target.value)}
                placeholder="e.g., MVR, Claims History, etc."
              />
            </div>
          )}

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this quote"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Quote
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
