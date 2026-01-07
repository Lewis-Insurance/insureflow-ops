import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { z } from 'zod';
import { AlertTriangle, Calendar, Building2, DollarSign, XCircle, Clock, Ban, TrendingDown, ArrowRightLeft } from 'lucide-react';

export type TerminalStatusType = 'cancelled' | 'lapsed' | 'non_renewed' | 'lost' | 'moved';

// Reason options per status type
const REASON_OPTIONS: Record<TerminalStatusType, { value: string; label: string }[]> = {
  cancelled: [
    { value: 'customer_request', label: 'Customer Request' },
    { value: 'non_payment', label: 'Non-Payment' },
    { value: 'policy_change', label: 'Policy Change' },
    { value: 'duplicate_coverage', label: 'Duplicate Coverage' },
    { value: 'other', label: 'Other' },
  ],
  lapsed: [
    { value: 'non_payment', label: 'Non-Payment' },
    { value: 'customer_abandoned', label: 'Customer Abandoned' },
    { value: 'administrative', label: 'Administrative' },
    { value: 'other', label: 'Other' },
  ],
  non_renewed: [
    { value: 'carrier_decision', label: 'Carrier Decision' },
    { value: 'high_claims', label: 'High Claims History' },
    { value: 'risk_profile', label: 'Risk Profile Change' },
    { value: 'market_exit', label: 'Carrier Market Exit' },
    { value: 'other', label: 'Other' },
  ],
  lost: [
    { value: 'price', label: 'Price/Premium' },
    { value: 'coverage_inadequate', label: 'Coverage Inadequate' },
    { value: 'service_issues', label: 'Service Issues' },
    { value: 'competitor', label: 'Went to Competitor' },
    { value: 'unresponsive', label: 'Customer Unresponsive' },
    { value: 'other', label: 'Other' },
  ],
  moved: [
    { value: 'price', label: 'Better Price' },
    { value: 'coverage', label: 'Better Coverage' },
    { value: 'service', label: 'Better Service' },
    { value: 'relationship', label: 'Existing Relationship' },
    { value: 'bundling', label: 'Bundling Opportunity' },
    { value: 'other', label: 'Other' },
  ],
};

// Status display configuration
const STATUS_CONFIG: Record<TerminalStatusType, { label: string; icon: typeof XCircle; color: string; description: string }> = {
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    color: 'text-red-600',
    description: 'The customer cancelled their policy.',
  },
  lapsed: {
    label: 'Lapsed',
    icon: Clock,
    color: 'text-orange-600',
    description: 'The policy lapsed due to non-payment or administrative issues.',
  },
  non_renewed: {
    label: 'Non-Renewed',
    icon: Ban,
    color: 'text-yellow-600',
    description: 'The carrier chose not to renew this policy.',
  },
  lost: {
    label: 'Lost',
    icon: TrendingDown,
    color: 'text-red-500',
    description: 'We lost this renewal to a competitor or customer decision.',
  },
  moved: {
    label: 'Moved to Another Carrier',
    icon: ArrowRightLeft,
    color: 'text-blue-600',
    description: 'The customer moved their policy to a different carrier.',
  },
};

// Helper function to format date from YYYY-MM-DD to MM/DD/YYYY
const formatDateForDisplay = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
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

const terminalStatusSchema = z.object({
  reason: z.string().min(1, 'Please select a reason'),
  termination_date: z.string().min(1, 'Termination date is required'),
  notes: z.string().optional(),
  // Moved-specific fields
  new_carrier: z.string().optional(),
  new_premium: z.string().optional(),
  new_term: z.string().optional(),
}).refine((data) => {
  // If this were for 'moved' status, we'd validate carrier is required
  // But we'll handle that in the component based on statusType
  return true;
});

export interface TerminalStatusData {
  reason: string;
  terminationDate: string;
  notes?: string;
  movedData?: {
    carrier: string;
    premium: number;
    term: '6_month' | 'annual';
  };
}

interface TerminalStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: TerminalStatusData) => void;
  isLoading?: boolean;
  statusType: TerminalStatusType;
  currentExpirationDate?: string | null;
}

export function TerminalStatusModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  statusType,
  currentExpirationDate = null,
}: TerminalStatusModalProps) {
  const [formData, setFormData] = useState({
    reason: '',
    termination_date: '',
    notes: '',
    new_carrier: '',
    new_premium: '',
    new_term: 'annual',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const config = STATUS_CONFIG[statusType];
  const StatusIcon = config.icon;
  const reasons = REASON_OPTIONS[statusType];

  // Initialize form when modal opens
  useEffect(() => {
    if (open) {
      setFormData({
        reason: '',
        termination_date: currentExpirationDate ? formatDateForDisplay(currentExpirationDate) : '',
        notes: '',
        new_carrier: '',
        new_premium: '',
        new_term: 'annual',
      });
      setErrors({});
    }
  }, [open, currentExpirationDate]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.reason) {
      newErrors.reason = 'Please select a reason';
    }
    if (!formData.termination_date) {
      newErrors.termination_date = 'Termination date is required';
    }

    // Additional validation for 'moved' status
    if (statusType === 'moved') {
      if (!formData.new_carrier) {
        newErrors.new_carrier = 'New carrier is required';
      }
      if (!formData.new_premium) {
        newErrors.new_premium = 'New premium is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (!validateForm()) return;

    const data: TerminalStatusData = {
      reason: formData.reason,
      terminationDate: formatDateForStorage(formData.termination_date),
      notes: formData.notes.trim() || undefined,
    };

    // Add moved-specific data if applicable
    if (statusType === 'moved' && formData.new_carrier && formData.new_premium) {
      data.movedData = {
        carrier: formData.new_carrier.trim(),
        premium: parseFloat(formData.new_premium),
        term: formData.new_term as '6_month' | 'annual',
      };
    }

    onConfirm(data);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${config.color}`}>
            <StatusIcon className="h-5 w-5" />
            {config.label}
          </DialogTitle>
          <DialogDescription>
            {config.description} Please provide the details below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reason */}
          <div>
            <Label htmlFor="reason" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Reason *
            </Label>
            <Select value={formData.reason} onValueChange={(v) => handleInputChange('reason', v)}>
              <SelectTrigger className={errors.reason ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason && (
              <p className="text-sm text-destructive mt-1">{errors.reason}</p>
            )}
          </div>

          {/* Termination Date */}
          <div>
            <Label htmlFor="termination_date" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Termination Effective Date *
            </Label>
            <Input
              id="termination_date"
              type="text"
              placeholder="MM/DD/YYYY"
              value={formData.termination_date}
              onChange={(e) => handleInputChange('termination_date', formatDateInput(e.target.value))}
              className={errors.termination_date ? 'border-destructive' : ''}
            />
            {errors.termination_date && (
              <p className="text-sm text-destructive mt-1">{errors.termination_date}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              The date when the policy termination takes effect
            </p>
          </div>

          {/* Moved-specific fields */}
          {statusType === 'moved' && (
            <>
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  New Carrier Details
                </h4>

                {/* New Carrier */}
                <div className="mb-3">
                  <Label htmlFor="new_carrier">New Carrier *</Label>
                  <Input
                    id="new_carrier"
                    value={formData.new_carrier}
                    onChange={(e) => handleInputChange('new_carrier', e.target.value)}
                    placeholder="e.g., Progressive, State Farm..."
                    className={errors.new_carrier ? 'border-destructive' : ''}
                  />
                  {errors.new_carrier && (
                    <p className="text-sm text-destructive mt-1">{errors.new_carrier}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* New Premium */}
                  <div>
                    <Label htmlFor="new_premium" className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      New Premium *
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                      <Input
                        id="new_premium"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.new_premium}
                        onChange={(e) => handleInputChange('new_premium', e.target.value)}
                        placeholder="1,500.00"
                        className={`pl-7 ${errors.new_premium ? 'border-destructive' : ''}`}
                      />
                    </div>
                    {errors.new_premium && (
                      <p className="text-sm text-destructive mt-1">{errors.new_premium}</p>
                    )}
                  </div>

                  {/* New Term */}
                  <div>
                    <Label htmlFor="new_term">New Term</Label>
                    <Select value={formData.new_term} onValueChange={(v) => handleInputChange('new_term', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6_month">6-Month</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Add any additional notes about this status change..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            variant="destructive"
          >
            {isLoading ? 'Saving...' : `Confirm ${config.label}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
