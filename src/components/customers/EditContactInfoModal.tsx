import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const accountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  tin_last4: z.string().max(4, 'TIN last 4 digits only').optional(),
  source: z.string().optional(),
  lead_source_detail: z.string().optional(),
  notes: z.string().optional(),
});

interface Account {
  id: string;
  name: string;
  type: string;
  account_type?: string;
  account_status?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  tin_last4?: string;
  source?: string;
  lead_source_detail?: string;
  notes?: string;
}

interface EditContactInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
  onSuccess?: () => void;
}

export function EditContactInfoModal({ open, onOpenChange, account, onSuccess }: EditContactInfoModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    tin_last4: '',
    source: '',
    lead_source_detail: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (account && open) {
      setFormData({
        name: account.name || '',
        email: account.email || '',
        phone: account.phone || '',
        address_line1: account.address_line1 || '',
        address_line2: account.address_line2 || '',
        city: account.city || '',
        state: account.state || '',
        zip_code: account.zip_code || '',
        tin_last4: account.tin_last4 || '',
        source: account.source || '',
        lead_source_detail: account.lead_source_detail || '',
        notes: account.notes || '',
      });
      setErrors({});
    }
  }, [account, open]);

  const validateForm = () => {
    try {
      accountSchema.parse(formData);
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
      const updateData = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        address_line1: formData.address_line1.trim() || null,
        address_line2: formData.address_line2.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        zip_code: formData.zip_code.trim() || null,
        tin_last4: formData.tin_last4.trim() || null,
        source: formData.source.trim() || null,
        lead_source_detail: formData.lead_source_detail.trim() || null,
        notes: formData.notes.trim() || null,
      };

      const { error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('id', account.id);

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
        description: 'Customer information updated successfully',
      });
      
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update customer information',
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Customer Information</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div>
            <Label htmlFor="name">Customer Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="John Doe"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-sm text-destructive mt-1">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="john@example.com"
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email}</p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address_line1">Address Line 1</Label>
            <Input
              id="address_line1"
              value={formData.address_line1}
              onChange={(e) => handleInputChange('address_line1', e.target.value)}
              placeholder="123 Main Street"
            />
          </div>

          <div>
            <Label htmlFor="address_line2">Address Line 2</Label>
            <Input
              id="address_line2"
              value={formData.address_line2}
              onChange={(e) => handleInputChange('address_line2', e.target.value)}
              placeholder="Apt 4B"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="New York"
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => handleInputChange('state', e.target.value)}
                placeholder="NY"
              />
            </div>
            <div>
              <Label htmlFor="zip_code">ZIP Code</Label>
              <Input
                id="zip_code"
                value={formData.zip_code}
                onChange={(e) => handleInputChange('zip_code', e.target.value)}
                placeholder="10001"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tin_last4">TIN (Last 4 digits)</Label>
              <Input
                id="tin_last4"
                value={formData.tin_last4}
                onChange={(e) => handleInputChange('tin_last4', e.target.value)}
                placeholder="1234"
                maxLength={4}
                className={errors.tin_last4 ? 'border-destructive' : ''}
              />
              {errors.tin_last4 && (
                <p className="text-sm text-destructive mt-1">{errors.tin_last4}</p>
              )}
            </div>
            <div>
              <Label htmlFor="source">Lead Source</Label>
              <Input
                id="source"
                value={formData.source}
                onChange={(e) => handleInputChange('source', e.target.value)}
                placeholder="Website, Referral, etc."
              />
            </div>
          </div>

          <div>
            <Label htmlFor="lead_source_detail">Source Details</Label>
            <Input
              id="lead_source_detail"
              value={formData.lead_source_detail}
              onChange={(e) => handleInputChange('lead_source_detail', e.target.value)}
              placeholder="Specific campaign or referrer details"
            />
          </div>

          <div>
            <Label htmlFor="notes">Customer Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Additional notes about this customer..."
              className="min-h-[80px]"
            />
          </div>

          </div>

        {/* Sticky Footer with Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t bg-background sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-green-600 hover:bg-green-700">
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}