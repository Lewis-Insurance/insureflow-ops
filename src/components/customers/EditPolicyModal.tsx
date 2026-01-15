import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCarriers, useLinesOfBusiness } from '@/hooks/useLookupData';
import { calcExpirationDate, parsePolicyTerm } from '@/lib/policyDates';
import { format, parse } from 'date-fns';
import { z } from 'zod';
import { CalendarIcon } from 'lucide-react';

// Helper function to format date from YYYY-MM-DD to MM/DD/YYYY
const formatDateForDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  // Parse YYYY-MM-DD manually to avoid timezone issues
  // new Date('2026-01-15') interprets as UTC midnight, which shifts in local timezone
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    return `${month}/${day}/${year}`;
  }
  // Fallback for other formats (shouldn't happen but just in case)
  const date = new Date(dateStr);
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
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

const policySchema = z.object({
  policy_number: z.string().min(1, 'Policy number is required').max(50, 'Policy number too long'),
  carrier: z.string().min(1, 'Carrier is required').max(100, 'Carrier name too long'),
  line_of_business: z.string().min(1, 'Line of business is required').max(100, 'Line of business too long'),
  premium: z.string().optional(),
  effective_date: z.string().min(1, 'Effective date is required'),
  expiration_date: z.string().min(1, 'Expiration date is required'),
  billing_frequency: z.string().optional(),
  policy_term: z.string().optional(),
  status: z.string().min(1, 'Status is required'),
  payment_type: z.string().optional(),
});

interface Policy {
  id: string;
  policy_number: string;
  carrier: string;
  line_of_business: string;
  premium: number | null;
  effective_date: string;
  expiration_date: string;
  billing_frequency: string | null;
  billing_method: string | null;
  policy_term: string | null;
  status: string;
  payment_type: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

interface EditPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: Policy | null;
  onSuccess?: () => void;
}

export function EditPolicyModal({ open, onOpenChange, policy, onSuccess }: EditPolicyModalProps) {
  const [formData, setFormData] = useState({
    policy_number: '',
    carrier: '',
    line_of_business: '',
    premium: '',
    effective_date: '',
    expiration_date: '',
    billing_frequency: 'annual',
    billing_method: '',
    policy_term: '',
    status: 'active',
    payment_type: 'direct',
    cancelled_at: '',
    cancellation_reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Fetch carriers and lines of business
  const { data: carriers = [], isLoading: carriersLoading } = useCarriers();
  const { data: linesOfBusiness = [], isLoading: lobLoading } = useLinesOfBusiness();

  useEffect(() => {
    if (policy) {
      setFormData({
        policy_number: policy.policy_number || '',
        carrier: policy.carrier || '',
        line_of_business: policy.line_of_business || '',
        premium: policy.premium ? policy.premium.toString() : '',
        effective_date: policy.effective_date ? formatDateForDisplay(policy.effective_date) : '',
        expiration_date: policy.expiration_date ? formatDateForDisplay(policy.expiration_date) : '',
        billing_frequency: policy.billing_frequency || 'annual',
        billing_method: policy.billing_method || '',
        policy_term: policy.policy_term || '',
        status: policy.status || 'active',
        payment_type: policy.payment_type || 'direct',
        cancelled_at: policy.cancelled_at ? formatDateForDisplay(policy.cancelled_at) : '',
        cancellation_reason: policy.cancellation_reason || '',
      });
    }
  }, [policy]);

  const validateForm = () => {
    try {
      policySchema.parse(formData);
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
    if (!policy || !validateForm()) return;

    setLoading(true);
    try {
      // Determine actual status based on cancellation date
      let actualStatus = formData.status;
      const cancelledAtDate = formData.cancelled_at ? formatDateForStorage(formData.cancelled_at) : null;

      // If there's a cancellation date, check if it's in the future
      if (cancelledAtDate) {
        const cancelDate = new Date(cancelledAtDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (cancelDate > today) {
          // Future cancellation - keep policy active
          actualStatus = 'active';
        } else {
          // Past/today - mark as cancelled
          actualStatus = 'cancelled';
        }
      }

      const policyData = {
        policy_number: formData.policy_number.trim(),
        carrier: formData.carrier.trim(),
        line_of_business: formData.line_of_business.trim(),
        premium: formData.premium ? parseFloat(formData.premium) : null,
        effective_date: formatDateForStorage(formData.effective_date),
        expiration_date: formatDateForStorage(formData.expiration_date),
        billing_frequency: formData.billing_frequency as 'annual' | 'monthly' | 'quarterly' | 'semiannual',
        billing_method: formData.billing_method ? formData.billing_method as 'direct_bill' | 'agency_bill' : null,
        policy_term: formData.policy_term || null,
        status: actualStatus,
        payment_type: formData.payment_type as 'direct' | 'agency',
        cancelled_at: cancelledAtDate,
        cancellation_reason: formData.cancellation_reason || null,
      };

      const { error } = await supabase
        .from('policies')
        .update(policyData)
        .eq('id', policy.id);

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Policy updated successfully',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update policy',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (field: string, value: string) => {
    // Handle status change - show cancellation modal if changing to cancelled
    if (field === 'status' && value === 'cancelled') {
      setPendingStatus(value);
      setShowCancellationModal(true);
      return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-calculate expiration date when effective date or policy term changes
    if (field === 'effective_date' || field === 'policy_term') {
      const effectiveDate = field === 'effective_date' ? value : formData.effective_date;
      const policyTerm = field === 'policy_term' ? value : formData.policy_term;

      if (effectiveDate && policyTerm) {
        // Parse MM/DD/YYYY format
        const dateParts = effectiveDate.split('/');
        if (dateParts.length === 3 && dateParts[2].length === 4) {
          const startDate = new Date(
            parseInt(dateParts[2]),
            parseInt(dateParts[0]) - 1,
            parseInt(dateParts[1])
          );
          const term = parsePolicyTerm(policyTerm);
          const expirationDate = calcExpirationDate(startDate, term);
          const formattedDate = format(expirationDate, 'MM/dd/yyyy');
          setFormData(prev => ({ ...prev, [field]: value, expiration_date: formattedDate }));
        }
      }
    }
  };

  const handleCancellationConfirm = () => {
    const cancelDate = formData.cancelled_at;
    if (!cancelDate) {
      toast({
        title: 'Error',
        description: 'Please select a cancellation date',
        variant: 'destructive',
      });
      return;
    }

    // Parse the date to check if it's in the future
    const dateParts = cancelDate.split('/');
    if (dateParts.length === 3) {
      const cancelDateObj = new Date(
        parseInt(dateParts[2]),
        parseInt(dateParts[0]) - 1,
        parseInt(dateParts[1])
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (cancelDateObj > today) {
        // Future date - keep active, just set the scheduled cancellation
        setFormData(prev => ({ ...prev, status: 'active' }));
        toast({
          title: 'Scheduled Cancellation',
          description: `Policy will be cancelled on ${cancelDate}`,
        });
      } else {
        // Today or past - mark as cancelled
        setFormData(prev => ({ ...prev, status: 'cancelled' }));
      }
    }

    setShowCancellationModal(false);
    setPendingStatus(null);
  };

  const handleCancellationCancel = () => {
    setShowCancellationModal(false);
    setPendingStatus(null);
    setFormData(prev => ({ ...prev, cancelled_at: '', cancellation_reason: '' }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Policy</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="policy_number">Policy Number *</Label>
              <Input
                id="policy_number"
                value={formData.policy_number}
                onChange={(e) => handleInputChange('policy_number', e.target.value)}
                placeholder="POL-2024-001"
                className={errors.policy_number ? 'border-destructive' : ''}
              />
              {errors.policy_number && (
                <p className="text-sm text-destructive mt-1">{errors.policy_number}</p>
              )}
            </div>
            <div>
              <Label htmlFor="carrier">Carrier *</Label>
              <Select value={formData.carrier} onValueChange={(value) => handleInputChange('carrier', value)}>
                <SelectTrigger className={errors.carrier ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriersLoading ? (
                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                  ) : (
                    carriers.map(carrier => (
                      <SelectItem key={carrier.id} value={carrier.name}>{carrier.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.carrier && (
                <p className="text-sm text-destructive mt-1">{errors.carrier}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="line_of_business">Line of Business *</Label>
            <Select value={formData.line_of_business} onValueChange={(value) => handleInputChange('line_of_business', value)}>
              <SelectTrigger className={errors.line_of_business ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select line of business" />
              </SelectTrigger>
              <SelectContent>
                {lobLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : (
                  linesOfBusiness.map(lob => (
                    <SelectItem key={lob.id} value={lob.name}>{lob.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.line_of_business && (
              <p className="text-sm text-destructive mt-1">{errors.line_of_business}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="premium">Premium Amount</Label>
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
              <Label htmlFor="billing_method">Billing Method</Label>
              <Select value={formData.billing_method} onValueChange={(value) => handleInputChange('billing_method', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select billing method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct_bill">Direct Bill</SelectItem>
                  <SelectItem value="agency_bill">Agency Bill</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="policy_term">Policy Term</Label>
              <Select value={formData.policy_term} onValueChange={(value) => handleInputChange('policy_term', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semiannual">Semi-Annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="effective_date">Effective Date *</Label>
              <Input
                id="effective_date"
                type="text"
                placeholder="MM/DD/YYYY"
                value={formData.effective_date}
                onChange={(e) => {
                  let value = e.target.value;
                  // Auto-format as user types MM/DD/YYYY
                  value = value.replace(/\D/g, ''); // Remove non-digits
                  if (value.length >= 3) {
                    value = value.substring(0, 2) + '/' + value.substring(2);
                  }
                  if (value.length >= 6) {
                    value = value.substring(0, 5) + '/' + value.substring(5, 9);
                  }
                  
                  // Convert MM/DD/YYYY to YYYY-MM-DD for validation and storage
                  let formattedForStorage = value;
                  if (value.length === 10) {
                    const parts = value.split('/');
                    if (parts.length === 3) {
                      formattedForStorage = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                    }
                  }
                  
                  setFormData(prev => ({ ...prev, effective_date: value }));
                  if (errors.effective_date) {
                    setErrors(prev => ({ ...prev, effective_date: '' }));
                  }
                  
                  // Auto-calculate expiration if we have a complete date and policy term
                  if (value.length === 10 && formData.policy_term) {
                    const parts = value.split('/');
                    if (parts.length === 3) {
                      const startDate = new Date(
                        parseInt(parts[2]),
                        parseInt(parts[0]) - 1,
                        parseInt(parts[1])
                      );
                      const term = parsePolicyTerm(formData.policy_term);
                      const expirationDate = calcExpirationDate(startDate, term);
                      const formattedExpDate = format(expirationDate, 'MM/dd/yyyy');
                      setFormData(prev => ({ ...prev, effective_date: value, expiration_date: formattedExpDate }));
                    }
                  }
                }}
                className={errors.effective_date ? 'border-destructive' : ''}
              />
              {errors.effective_date && (
                <p className="text-sm text-destructive mt-1">{errors.effective_date}</p>
              )}
            </div>
            <div>
              <Label htmlFor="expiration_date">Expiration Date *</Label>
              <Input
                id="expiration_date"
                type="text"
                placeholder="MM/DD/YYYY"
                value={formData.expiration_date}
                onChange={(e) => {
                  let value = e.target.value;
                  // Auto-format as user types MM/DD/YYYY
                  value = value.replace(/\D/g, ''); // Remove non-digits
                  if (value.length >= 3) {
                    value = value.substring(0, 2) + '/' + value.substring(2);
                  }
                  if (value.length >= 6) {
                    value = value.substring(0, 5) + '/' + value.substring(5, 9);
                  }
                  handleInputChange('expiration_date', value);
                }}
                className={errors.expiration_date ? 'border-destructive' : ''}
              />
              {errors.expiration_date && (
                <p className="text-sm text-destructive mt-1">{errors.expiration_date}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">Status *</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger className={errors.status ? 'border-destructive' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="bound">Bound</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && (
                <p className="text-sm text-destructive mt-1">{errors.status}</p>
              )}
            </div>
            <div>
              <Label htmlFor="payment_type">Payment Type</Label>
              <Select value={formData.payment_type} onValueChange={(value) => handleInputChange('payment_type', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cancellation Info - Show if there's a scheduled cancellation */}
          {formData.cancelled_at && (
            <div className="border border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-4 space-y-3">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                <CalendarIcon className="h-4 w-4" />
                <span className="font-medium">Scheduled Cancellation</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cancelled_at">Cancellation Date</Label>
                  <Input
                    id="cancelled_at"
                    type="text"
                    placeholder="MM/DD/YYYY"
                    value={formData.cancelled_at}
                    onChange={(e) => {
                      let value = e.target.value;
                      value = value.replace(/\D/g, '');
                      if (value.length >= 3) {
                        value = value.substring(0, 2) + '/' + value.substring(2);
                      }
                      if (value.length >= 6) {
                        value = value.substring(0, 5) + '/' + value.substring(5, 9);
                      }
                      setFormData(prev => ({ ...prev, cancelled_at: value }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="cancellation_reason">Reason</Label>
                  <Input
                    id="cancellation_reason"
                    value={formData.cancellation_reason}
                    onChange={(e) => setFormData(prev => ({ ...prev, cancellation_reason: e.target.value }))}
                    placeholder="Optional reason for cancellation"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormData(prev => ({ ...prev, cancelled_at: '', cancellation_reason: '', status: 'active' }))}
              >
                Remove Scheduled Cancellation
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Cancellation Date Modal */}
      <AlertDialog open={showCancellationModal} onOpenChange={setShowCancellationModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule Policy Cancellation</AlertDialogTitle>
            <AlertDialogDescription>
              When should this policy be cancelled? If you select a future date, the policy will remain active until that date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="cancel_date_modal">Cancellation Date *</Label>
              <Input
                id="cancel_date_modal"
                type="text"
                placeholder="MM/DD/YYYY"
                value={formData.cancelled_at}
                onChange={(e) => {
                  let value = e.target.value;
                  value = value.replace(/\D/g, '');
                  if (value.length >= 3) {
                    value = value.substring(0, 2) + '/' + value.substring(2);
                  }
                  if (value.length >= 6) {
                    value = value.substring(0, 5) + '/' + value.substring(5, 9);
                  }
                  setFormData(prev => ({ ...prev, cancelled_at: value }));
                }}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Select today for immediate cancellation, or a future date to schedule.
              </p>
            </div>
            <div>
              <Label htmlFor="cancel_reason_modal">Reason (optional)</Label>
              <Input
                id="cancel_reason_modal"
                value={formData.cancellation_reason}
                onChange={(e) => setFormData(prev => ({ ...prev, cancellation_reason: e.target.value }))}
                placeholder="e.g., Non-payment, Moved out of state"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancellationCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCancellationConfirm}>
              Confirm Cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}