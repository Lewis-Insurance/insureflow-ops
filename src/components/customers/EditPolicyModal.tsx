import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const policySchema = z.object({
  policy_number: z.string().min(1, 'Policy number is required').max(50, 'Policy number too long'),
  carrier: z.string().min(1, 'Carrier is required').max(100, 'Carrier name too long'),
  line_of_business: z.string().min(1, 'Line of business is required').max(100, 'Line of business too long'),
  premium: z.string().optional(),
  effective_date: z.string().min(1, 'Effective date is required'),
  expiration_date: z.string().min(1, 'Expiration date is required'),
  billing_frequency: z.string().optional(),
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
  status: string;
  payment_type: string | null;
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
    status: 'active',
    payment_type: 'direct',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (policy) {
      setFormData({
        policy_number: policy.policy_number || '',
        carrier: policy.carrier || '',
        line_of_business: policy.line_of_business || '',
        premium: policy.premium ? policy.premium.toString() : '',
        effective_date: policy.effective_date || '',
        expiration_date: policy.expiration_date || '',
        billing_frequency: policy.billing_frequency || 'annual',
        status: policy.status || 'active',
        payment_type: policy.payment_type || 'direct',
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
      const policyData = {
        policy_number: formData.policy_number.trim(),
        carrier: formData.carrier.trim(),
        line_of_business: formData.line_of_business.trim(),
        premium: formData.premium ? parseFloat(formData.premium) : null,
        effective_date: formData.effective_date,
        expiration_date: formData.expiration_date,
        billing_frequency: formData.billing_frequency as 'annual' | 'monthly' | 'quarterly' | 'semiannual',
        status: formData.status,
        payment_type: formData.payment_type as 'direct' | 'agency',
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
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
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
              <Label htmlFor="effective_date">Effective Date *</Label>
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
              <Label htmlFor="expiration_date">Expiration Date *</Label>
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
    </Dialog>
  );
}