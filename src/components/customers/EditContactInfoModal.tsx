import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { type EntityType } from '@/lib/insuredNames';
import { z } from 'zod';

const accountSchema = z.object({
  name: z.string().max(200, 'Name too long').optional().or(z.literal('')),
  date_of_birth: z.string().optional().or(z.literal('')),
  spouse_name: z.string().max(200, 'Spouse name too long').optional().or(z.literal('')),
  spouse_date_of_birth: z.string().optional().or(z.literal('')),
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
  // Trust/Estate fields
  hasPrimaryEntity: z.boolean().optional(),
  primary_entity_type: z.enum(['trust', 'estate']).nullable().optional(),
  primary_entity_name: z.string().max(200).optional().or(z.literal('')),
  trustee_name: z.string().max(200).optional().or(z.literal('')),
  trust_date: z.string().optional().or(z.literal('')),
  hasSecondaryEntity: z.boolean().optional(),
  secondary_entity_type: z.enum(['trust', 'estate']).nullable().optional(),
  secondary_entity_name: z.string().max(200).optional().or(z.literal('')),
});

interface Account {
  id: string;
  name: string;
  date_of_birth?: string;
  spouse_name?: string;
  spouse_date_of_birth?: string;
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
  // Trust/Estate fields
  primary_entity_type?: 'trust' | 'estate' | null;
  primary_entity_name?: string;
  trustee_name?: string;
  trust_date?: string;
  secondary_entity_type?: 'trust' | 'estate' | null;
  secondary_entity_name?: string;
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
    date_of_birth: '',
    spouse_name: '',
    spouse_date_of_birth: '',
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
    // Trust/Estate fields
    hasPrimaryEntity: false,
    primary_entity_type: null as EntityType,
    primary_entity_name: '',
    trustee_name: '',
    trust_date: '',
    hasSecondaryEntity: false,
    secondary_entity_type: null as EntityType,
    secondary_entity_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (account && open) {
      const hasPrimaryEntity = !!(account.primary_entity_type && account.primary_entity_name);
      const hasSecondaryEntity = !!(account.secondary_entity_type && account.secondary_entity_name);

      setFormData({
        name: account.name || '',
        date_of_birth: account.date_of_birth || '',
        spouse_name: account.spouse_name || '',
        spouse_date_of_birth: account.spouse_date_of_birth || '',
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
        // Trust/Estate fields
        hasPrimaryEntity,
        primary_entity_type: account.primary_entity_type || null,
        primary_entity_name: account.primary_entity_name || '',
        trustee_name: account.trustee_name || '',
        trust_date: account.trust_date || '',
        hasSecondaryEntity,
        secondary_entity_type: account.secondary_entity_type || null,
        secondary_entity_name: account.secondary_entity_name || '',
      });
      setErrors({});
    }
  }, [account, open]);

  const validateForm = () => {
    try {
      accountSchema.parse(formData);
      const newErrors: Record<string, string> = {};

      // Custom validation: require either name OR entity name
      const hasName = formData.name.trim().length > 0;
      const hasEntity = formData.hasPrimaryEntity && formData.primary_entity_name.trim().length > 0;

      if (!hasName && !hasEntity) {
        newErrors.name = 'Either customer name or trust/estate name is required';
      }

      // If entity toggle is on, require entity name
      if (formData.hasPrimaryEntity && !formData.primary_entity_name.trim()) {
        newErrors.primary_entity_name = 'Trust/Estate name is required';
      }

      // If secondary entity toggle is on, require secondary entity name
      if (formData.hasSecondaryEntity && !formData.secondary_entity_name.trim()) {
        newErrors.secondary_entity_name = 'Trust/Estate name is required';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return false;
      }

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
        name: formData.name.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        spouse_name: account.type === 'household' && formData.spouse_name.trim() ? formData.spouse_name.trim() : null,
        spouse_date_of_birth: account.type === 'household' && formData.spouse_date_of_birth ? formData.spouse_date_of_birth : null,
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
        // Trust/Estate fields for primary insured
        primary_entity_type: formData.hasPrimaryEntity ? formData.primary_entity_type : null,
        primary_entity_name: formData.hasPrimaryEntity && formData.primary_entity_name.trim() ? formData.primary_entity_name.trim() : null,
        trustee_name: formData.hasPrimaryEntity && formData.primary_entity_type === 'trust' && formData.trustee_name.trim() ? formData.trustee_name.trim() : null,
        trust_date: formData.hasPrimaryEntity && formData.primary_entity_type === 'trust' && formData.trust_date ? formData.trust_date : null,
        // Trust/Estate fields for secondary insured
        secondary_entity_type: account.type === 'household' && formData.hasSecondaryEntity ? formData.secondary_entity_type : null,
        secondary_entity_name: account.type === 'household' && formData.hasSecondaryEntity && formData.secondary_entity_name.trim() ? formData.secondary_entity_name.trim() : null,
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
          <div className={account.type === 'household' ? 'grid grid-cols-2 gap-4' : ''}>
            <div>
              <Label htmlFor="name">{formData.hasPrimaryEntity ? 'Individual Name (optional)' : 'Customer Name *'}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder={account.type === 'household' ? "Primary Insured" : "Business Name"}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive mt-1">{errors.name}</p>
              )}

              {/* Date of Birth for Primary Insured */}
              <div className="mt-3">
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                />
              </div>

              {/* Trust/Estate Toggle for Primary Insured */}
              <div className="flex items-center gap-2 mt-3">
                <Switch
                  id="edit-primary-entity-toggle"
                  checked={formData.hasPrimaryEntity}
                  onCheckedChange={(checked) => {
                    setFormData(prev => ({
                      ...prev,
                      hasPrimaryEntity: checked,
                      primary_entity_type: checked ? (prev.primary_entity_type || 'trust') : null,
                      primary_entity_name: checked ? prev.primary_entity_name : '',
                      trustee_name: checked ? prev.trustee_name : '',
                      trust_date: checked ? prev.trust_date : '',
                    }));
                  }}
                />
                <Label htmlFor="edit-primary-entity-toggle" className="text-sm font-normal">Add Trust or Estate</Label>
              </div>

              {formData.hasPrimaryEntity && (
                <div className="space-y-3 pl-4 border-l-2 border-muted mt-3">
                  <div>
                    <Label htmlFor="edit_primary_entity_type">Entity Type *</Label>
                    <Select
                      value={formData.primary_entity_type || 'trust'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, primary_entity_type: value as EntityType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trust">Trust</SelectItem>
                        <SelectItem value="estate">Estate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="edit_primary_entity_name">
                      {formData.primary_entity_type === 'estate' ? 'Estate Name *' : 'Trust Name *'}
                    </Label>
                    <Input
                      id="edit_primary_entity_name"
                      value={formData.primary_entity_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, primary_entity_name: e.target.value }))}
                      placeholder={formData.primary_entity_type === 'estate'
                        ? 'Estate of John Smith'
                        : 'The Smith Family Trust'}
                      className={errors.primary_entity_name ? 'border-destructive' : ''}
                    />
                    {errors.primary_entity_name && (
                      <p className="text-sm text-destructive mt-1">{errors.primary_entity_name}</p>
                    )}
                  </div>

                  {formData.primary_entity_type === 'trust' && (
                    <>
                      <div>
                        <Label htmlFor="edit_trustee_name">Trustee Name</Label>
                        <Input
                          id="edit_trustee_name"
                          value={formData.trustee_name}
                          onChange={(e) => setFormData(prev => ({ ...prev, trustee_name: e.target.value }))}
                          placeholder="Brian Lewis, Trustee"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit_trust_date">Trust Date</Label>
                        <Input
                          id="edit_trust_date"
                          type="date"
                          value={formData.trust_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, trust_date: e.target.value }))}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {account.type === 'household' && (
              <div>
                <Label htmlFor="spouse_name">{formData.hasSecondaryEntity ? 'Spouse Name (optional)' : 'Spouse / Co-Insured'}</Label>
                <Input
                  id="spouse_name"
                  value={formData.spouse_name}
                  onChange={(e) => handleInputChange('spouse_name', e.target.value)}
                  placeholder="Second Named Insured"
                />

                {/* Date of Birth for Secondary Insured */}
                <div className="mt-3">
                  <Label htmlFor="spouse_date_of_birth">Date of Birth</Label>
                  <Input
                    id="spouse_date_of_birth"
                    type="date"
                    value={formData.spouse_date_of_birth}
                    onChange={(e) => handleInputChange('spouse_date_of_birth', e.target.value)}
                  />
                </div>

                {/* Trust/Estate Toggle for Secondary Insured */}
                <div className="flex items-center gap-2 mt-3">
                  <Switch
                    id="edit-secondary-entity-toggle"
                    checked={formData.hasSecondaryEntity}
                    onCheckedChange={(checked) => {
                      setFormData(prev => ({
                        ...prev,
                        hasSecondaryEntity: checked,
                        secondary_entity_type: checked ? (prev.secondary_entity_type || 'trust') : null,
                        secondary_entity_name: checked ? prev.secondary_entity_name : '',
                      }));
                    }}
                  />
                  <Label htmlFor="edit-secondary-entity-toggle" className="text-sm font-normal">Add Trust or Estate</Label>
                </div>

                {formData.hasSecondaryEntity && (
                  <div className="space-y-3 pl-4 border-l-2 border-muted mt-3">
                    <div>
                      <Label htmlFor="edit_secondary_entity_type">Entity Type *</Label>
                      <Select
                        value={formData.secondary_entity_type || 'trust'}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, secondary_entity_type: value as EntityType }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trust">Trust</SelectItem>
                          <SelectItem value="estate">Estate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="edit_secondary_entity_name">
                        {formData.secondary_entity_type === 'estate' ? 'Estate Name *' : 'Trust Name *'}
                      </Label>
                      <Input
                        id="edit_secondary_entity_name"
                        value={formData.secondary_entity_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, secondary_entity_name: e.target.value }))}
                        placeholder={formData.secondary_entity_type === 'estate'
                          ? 'Estate of Jane Smith'
                          : 'The Smith Family Trust'}
                        className={errors.secondary_entity_name ? 'border-destructive' : ''}
                      />
                      {errors.secondary_entity_name && (
                        <p className="text-sm text-destructive mt-1">{errors.secondary_entity_name}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
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