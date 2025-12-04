import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { generateTasks } from '@/lib/taskAutomation';
import { useAutoScoreQuote } from '@/hooks/useQuoteScoring';
import { useTriggerFollowUpProcessor } from '@/hooks/useQuoteFollowups';
import { useCreateQuote } from '@/hooks/useQuotes';
import { z } from 'zod';
import { AIQuoteAssistant, type QuoteSuggestion } from '@/components/quotes/AIQuoteAssistant';

const quoteSchema = z.object({
  quote_number: z.string().min(1, 'Quote number is required').max(50, 'Quote number too long'),
  carrier: z.string().min(1, 'Carrier is required').max(100, 'Carrier name too long'),
  line_of_business: z.string().min(1, 'Line of business is required').max(100, 'Line of business too long'),
  premium: z.string().optional(),
  effective_date: z.string().min(1, 'Effective date is required'),
  expiration_date: z.string().min(1, 'Quote expiration is required'),
  billing_frequency: z.string().optional(),
});

interface AddQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

export function AddQuoteModal({ open, onOpenChange, accountId, onSuccess }: AddQuoteModalProps) {
  const [formData, setFormData] = useState({
    quote_number: '',
    carrier: '',
    line_of_business: '',
    premium: '',
    effective_date: '',
    expiration_date: '',
    billing_frequency: 'annual',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const createQuote = useCreateQuote();
  const autoScoreQuote = useAutoScoreQuote();
  const triggerFollowUps = useTriggerFollowUpProcessor();

  const validateForm = () => {
    try {
      quoteSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  async function handleSave() {
    if (!validateForm()) return;

    try {
      // Create quote in the quotes table
      const quoteInput = {
        account_id: accountId,
        quote_ref: formData.quote_number.trim(),
        competitor_carrier: formData.carrier.trim(),
        line_of_business: formData.line_of_business.trim() as any, // Will be enum type
        premium: formData.premium ? parseFloat(formData.premium) : undefined,
        expires_at: formData.expiration_date,
        status: 'open' as const,
      };

      const newQuote = await new Promise<any>((resolve, reject) => {
        createQuote.mutate(quoteInput, {
          onSuccess: (data) => resolve(data),
          onError: (error) => reject(error),
        });
      });

      // Auto-generate tasks for quote
      await generateTasks('quote_requested', accountId, 'quote', newQuote.id);

      // Auto-score the quote (silent, no toast)
      autoScoreQuote.mutate(newQuote.id);

      // Trigger follow-up processor
      triggerFollowUps.mutate({ quote_id: newQuote.id });

      toast({
        title: 'Success',
        description: 'Quote added successfully. Auto-scoring in progress...',
      });

      // Reset form
      setFormData({
        quote_number: '',
        carrier: '',
        line_of_business: '',
        premium: '',
        effective_date: '',
        expiration_date: '',
        billing_frequency: 'annual',
        notes: '',
      });
      setErrors({});
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error toast already shown by createQuote hook
      console.error('Failed to add quote:', error);
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleAISuggestion = (suggestion: QuoteSuggestion) => {
    setFormData(prev => ({
      ...prev,
      ...(suggestion.carrier && { carrier: suggestion.carrier }),
      ...(suggestion.line_of_business && { line_of_business: suggestion.line_of_business }),
      ...(suggestion.premium && { premium: suggestion.premium }),
      ...(suggestion.notes && { notes: prev.notes ? `${prev.notes}\n\nAI Insights:\n${suggestion.notes}` : `AI Insights:\n${suggestion.notes}` }),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Quote</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <AIQuoteAssistant accountId={accountId} onSuggestion={handleAISuggestion} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quote_number">Quote Number *</Label>
              <Input
                id="quote_number"
                value={formData.quote_number}
                onChange={(e) => handleInputChange('quote_number', e.target.value)}
                placeholder="QTE-2024-001"
                className={errors.quote_number ? 'border-destructive' : ''}
              />
              {errors.quote_number && (
                <p className="text-sm text-destructive mt-1">{errors.quote_number}</p>
              )}
            </div>
            <div>
              <Label htmlFor="carrier">Carrier *</Label>
              <Input
                id="carrier"
                value={formData.carrier}
                onChange={(e) => handleInputChange('carrier', e.target.value)}
                placeholder="State Farm"
                className={errors.carrier ? 'border-destructive' : ''}
              />
              {errors.carrier && (
                <p className="text-sm text-destructive mt-1">{errors.carrier}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="line_of_business">Line of Business *</Label>
            <Input
              id="line_of_business"
              value={formData.line_of_business}
              onChange={(e) => handleInputChange('line_of_business', e.target.value)}
              placeholder="Auto Insurance"
              className={errors.line_of_business ? 'border-destructive' : ''}
            />
            {errors.line_of_business && (
              <p className="text-sm text-destructive mt-1">{errors.line_of_business}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="premium">Quoted Premium</Label>
              <Input
                id="premium"
                type="number"
                step="0.01"
                min="0"
                value={formData.premium}
                onChange={(e) => handleInputChange('premium', e.target.value)}
                placeholder="1200.00"
              />
            </div>
            <div>
              <Label htmlFor="billing_frequency">Billing Frequency</Label>
              <Select value={formData.billing_frequency} onValueChange={(value) => handleInputChange('billing_frequency', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semiannual">Semi-Annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="effective_date">Proposed Effective Date *</Label>
              <Input
                id="effective_date"
                type="date"
                value={formData.effective_date}
                onChange={(e) => handleInputChange('effective_date', e.target.value)}
                className={errors.effective_date ? 'border-destructive' : ''}
              />
              {errors.effective_date && (
                <p className="text-sm text-destructive mt-1">{errors.effective_date}</p>
              )}
            </div>
            <div>
              <Label htmlFor="expiration_date">Quote Expires *</Label>
              <Input
                id="expiration_date"
                type="date"
                value={formData.expiration_date}
                onChange={(e) => handleInputChange('expiration_date', e.target.value)}
                className={errors.expiration_date ? 'border-destructive' : ''}
              />
              {errors.expiration_date && (
                <p className="text-sm text-destructive mt-1">{errors.expiration_date}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Quote Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Additional details about the quote..."
              className="min-h-[80px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createQuote.isPending}>
              {createQuote.isPending ? 'Adding...' : 'Add Quote'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}