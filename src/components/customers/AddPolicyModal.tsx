import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCarriers, useLinesOfBusiness } from '@/hooks/useLookupData';
import { z } from 'zod';

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
});

interface AddPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

export function AddPolicyModal({ open, onOpenChange, accountId, onSuccess }: AddPolicyModalProps) {
  const [formData, setFormData] = useState({
    policy_number: '',
    carrier: '',
    line_of_business: '',
    premium: '',
    effective_date: '',
    expiration_date: '',
    billing_frequency: 'annual',
    policy_term: '',
    status: 'active',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  
  // Fetch carriers and lines of business
  const { data: carriers = [], isLoading: carriersLoading } = useCarriers();
  const { data: linesOfBusiness = [], isLoading: lobLoading } = useLinesOfBusiness();

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
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to add policies',
          variant: 'destructive',
        });
        return;
      }

      const policyData = {
        account_id: accountId,
        insured_user_id: user.id, // Set to current user creating the policy
        policy_number: formData.policy_number.trim(),
        carrier: formData.carrier.trim(),
        line_of_business: formData.line_of_business.trim(),
        premium: formData.premium ? parseFloat(formData.premium) : null,
        effective_date: formData.effective_date,
        expiration_date: formData.expiration_date,
        billing_frequency: formData.billing_frequency as 'annual' | 'monthly' | 'quarterly' | 'semiannual',
        policy_term: formData.policy_term || null,
        status: formData.status,
      };

      const { error } = await supabase.from('policies').insert([policyData]);

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
        description: 'Policy added successfully',
      });
      
      // Reset form
      setFormData({
        policy_number: '',
        carrier: '',
        line_of_business: '',
        premium: '',
        effective_date: '',
        expiration_date: '',
        billing_frequency: 'annual',
        policy_term: '',
        status: 'active',
      });
      setErrors({});
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add policy',
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
          <DialogTitle>Add New Policy</DialogTitle>
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

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Adding...' : 'Add Policy'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}