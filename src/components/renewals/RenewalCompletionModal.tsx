import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { z } from 'zod';
import { CheckCircle, DollarSign, Calendar, FileText } from 'lucide-react';
import { parseLocalDate, addDaysLocalDate, extractLocalDate } from '@/lib/date/localDate';

// Helper function to format date from YYYY-MM-DD to MM/DD/YYYY using local timezone
// (avoids UTC-midnight off-by-one when parsing date-only strings).
const formatDateForDisplay = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const date = parseLocalDate(dateStr);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

// Helper function to convert MM/DD/YYYY to YYYY-MM-DD for storage
const formatDateForStorage = (dateStr: string): string => {
  if (!dateStr || dateStr.length !== 10) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return dateStr;
};

const renewalCompletionSchema = z.object({
  policy_number: z.string().min(1, 'Policy number is required'),
  premium: z.string().min(1, 'Premium is required'),
  effective_date: z.string().min(1, 'Effective date is required'),
  expiration_date: z.string().min(1, 'Expiration date is required'),
  notes: z.string().optional(),
});

export interface RenewalCompletionData {
  policyNumber: string;
  premium: number;
  effectiveDate: string;
  expirationDate: string;
  notes?: string;
}

interface RenewalCompletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: RenewalCompletionData) => void;
  isLoading?: boolean;
  currentPolicyNumber?: string;
  currentPremium?: number;
  currentExpirationDate?: string | null;
  policyTerm?: string;
}

export function RenewalCompletionModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  currentPolicyNumber = '',
  currentPremium = 0,
  currentExpirationDate = null,
  policyTerm = 'annual',
}: RenewalCompletionModalProps) {
  const [formData, setFormData] = useState({
    policy_number: '',
    premium: '',
    effective_date: '',
    expiration_date: '',
    policy_term: 'annual',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form with current policy data when modal opens
  useEffect(() => {
    if (open) {
      // Calculate new effective date (day after current expiration)
      let newEffectiveDate = '';
      if (currentExpirationDate) {
        const nextDay = addDaysLocalDate(extractLocalDate(currentExpirationDate), 1);
        newEffectiveDate = formatDateForDisplay(nextDay);
      }

      // Calculate new expiration date based on term
      let newExpirationDate = '';
      if (newEffectiveDate) {
        const parts = newEffectiveDate.split('/');
        if (parts.length === 3) {
          const startDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
          const term = policyTerm || 'annual';

          if (term === 'semiannual' || term === '6_month') {
            startDate.setMonth(startDate.getMonth() + 6);
          } else {
            startDate.setFullYear(startDate.getFullYear() + 1);
          }

          const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
          const day = startDate.getDate().toString().padStart(2, '0');
          const year = startDate.getFullYear();
          newExpirationDate = `${month}/${day}/${year}`;
        }
      }

      setFormData({
        policy_number: currentPolicyNumber || '',
        premium: currentPremium ? currentPremium.toString() : '',
        effective_date: newEffectiveDate,
        expiration_date: newExpirationDate,
        policy_term: policyTerm || 'annual',
        notes: '',
      });
      setErrors({});
    }
  }, [open, currentPolicyNumber, currentPremium, currentExpirationDate, policyTerm]);

  const validateForm = () => {
    try {
      renewalCompletionSchema.parse(formData);
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

  const handleConfirm = () => {
    if (!validateForm()) return;

    onConfirm({
      policyNumber: formData.policy_number.trim(),
      premium: parseFloat(formData.premium),
      effectiveDate: formatDateForStorage(formData.effective_date),
      expirationDate: formatDateForStorage(formData.expiration_date),
      notes: formData.notes.trim() || undefined,
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Auto-format date input
  const formatDateInput = (value: string): string => {
    let formatted = value.replace(/\D/g, ''); // Remove non-digits
    if (formatted.length >= 3) {
      formatted = formatted.substring(0, 2) + '/' + formatted.substring(2);
    }
    if (formatted.length >= 6) {
      formatted = formatted.substring(0, 5) + '/' + formatted.substring(5, 9);
    }
    return formatted;
  };

  // Auto-calculate expiration when effective date or term changes
  const handleEffectiveDateChange = (value: string) => {
    const formatted = formatDateInput(value);
    handleInputChange('effective_date', formatted);

    if (formatted.length === 10) {
      const parts = formatted.split('/');
      if (parts.length === 3) {
        const startDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));

        if (formData.policy_term === 'semiannual' || formData.policy_term === '6_month') {
          startDate.setMonth(startDate.getMonth() + 6);
        } else {
          startDate.setFullYear(startDate.getFullYear() + 1);
        }

        const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
        const day = startDate.getDate().toString().padStart(2, '0');
        const year = startDate.getFullYear();
        const newExpDate = `${month}/${day}/${year}`;

        setFormData(prev => ({ ...prev, effective_date: formatted, expiration_date: newExpDate }));
      }
    }
  };

  const handleTermChange = (term: string) => {
    handleInputChange('policy_term', term);

    // Recalculate expiration if we have a valid effective date
    if (formData.effective_date.length === 10) {
      const parts = formData.effective_date.split('/');
      if (parts.length === 3) {
        const startDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));

        if (term === 'semiannual' || term === '6_month') {
          startDate.setMonth(startDate.getMonth() + 6);
        } else {
          startDate.setFullYear(startDate.getFullYear() + 1);
        }

        const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
        const day = startDate.getDate().toString().padStart(2, '0');
        const year = startDate.getFullYear();
        const newExpDate = `${month}/${day}/${year}`;

        setFormData(prev => ({ ...prev, policy_term: term, expiration_date: newExpDate }));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Complete Renewal
          </DialogTitle>
          <DialogDescription>
            Update the policy details for the new term. This will update the existing policy record and mark the renewal as completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Policy Number */}
          <div>
            <Label htmlFor="policy_number" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Policy Number *
            </Label>
            <Input
              id="policy_number"
              value={formData.policy_number}
              onChange={(e) => handleInputChange('policy_number', e.target.value)}
              placeholder="POL-2025-001"
              className={errors.policy_number ? 'border-destructive' : ''}
            />
            {errors.policy_number && (
              <p className="text-sm text-destructive mt-1">{errors.policy_number}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Update if the policy number changed for the new term
            </p>
          </div>

          {/* Premium */}
          <div>
            <Label htmlFor="premium" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              New Premium *
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <Input
                id="premium"
                type="number"
                step="0.01"
                min="0"
                value={formData.premium}
                onChange={(e) => handleInputChange('premium', e.target.value)}
                placeholder="1,500.00"
                className={`pl-7 ${errors.premium ? 'border-destructive' : ''}`}
              />
            </div>
            {errors.premium && (
              <p className="text-sm text-destructive mt-1">{errors.premium}</p>
            )}
            {currentPremium > 0 && formData.premium && (
              <p className="text-xs text-muted-foreground mt-1">
                Previous: ${currentPremium.toLocaleString()}
                {parseFloat(formData.premium) !== currentPremium && (
                  <span className={parseFloat(formData.premium) > currentPremium ? 'text-red-600 ml-1' : 'text-green-600 ml-1'}>
                    ({parseFloat(formData.premium) > currentPremium ? '+' : ''}
                    {(((parseFloat(formData.premium) - currentPremium) / currentPremium) * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Policy Term */}
          <div>
            <Label htmlFor="policy_term">Policy Term</Label>
            <Select value={formData.policy_term} onValueChange={handleTermChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semiannual">6-Month (Semi-Annual)</SelectItem>
                <SelectItem value="annual">12-Month (Annual)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="effective_date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Effective Date *
              </Label>
              <Input
                id="effective_date"
                type="text"
                placeholder="MM/DD/YYYY"
                value={formData.effective_date}
                onChange={(e) => handleEffectiveDateChange(e.target.value)}
                className={errors.effective_date ? 'border-destructive' : ''}
              />
              {errors.effective_date && (
                <p className="text-sm text-destructive mt-1">{errors.effective_date}</p>
              )}
            </div>
            <div>
              <Label htmlFor="expiration_date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Expiration Date *
              </Label>
              <Input
                id="expiration_date"
                type="text"
                placeholder="MM/DD/YYYY"
                value={formData.expiration_date}
                onChange={(e) => handleInputChange('expiration_date', formatDateInput(e.target.value))}
                className={errors.expiration_date ? 'border-destructive' : ''}
              />
              {errors.expiration_date && (
                <p className="text-sm text-destructive mt-1">{errors.expiration_date}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Add any notes about this renewal..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
            {isLoading ? 'Completing...' : 'Complete Renewal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
