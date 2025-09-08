import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Users } from 'lucide-react';
import type { Account, CreateAccountData } from '@/types/crm';
import { COMMON_ACCOUNT_SOURCES } from '@/types/crm';

interface AccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAccountData) => Promise<void>;
  account?: Account | null;
  loading?: boolean;
}

const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' }
];

export function AccountForm({ open, onOpenChange, onSubmit, account, loading }: AccountFormProps) {
  const [formData, setFormData] = useState<CreateAccountData>({
    type: account?.type || 'household',
    name: account?.name || '',
    tin_last4: account?.tin_last4 || '',
    address_line1: account?.address_line1 || '',
    address_line2: account?.address_line2 || '',
    city: account?.city || '',
    state: account?.state || '',
    zip_code: account?.zip_code || '',
    phone: account?.phone || '',
    email: account?.email || '',
    source: account?.source || ''
  });

  const [errors, setErrors] = useState<Partial<CreateAccountData>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<CreateAccountData> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Account name is required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (formData.phone && !/^\+?[\d\s\-\(\)\.]+$/.test(formData.phone)) {
      newErrors.phone = 'Invalid phone format';
    }

    if (formData.zip_code && !/^\d{5}(-\d{4})?$/.test(formData.zip_code)) {
      newErrors.zip_code = 'Invalid ZIP code format';
    }

    if (formData.tin_last4 && !/^\d{4}$/.test(formData.tin_last4)) {
      newErrors.tin_last4 = 'Must be 4 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
      onOpenChange(false);
      // Reset form
      setFormData({
        type: 'household',
        name: '',
        tin_last4: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        zip_code: '',
        phone: '',
        email: '',
        source: ''
      });
      setErrors({});
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const updateField = (field: keyof CreateAccountData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {account ? 'Edit Account' : 'Create New Account'}
          </DialogTitle>
          <DialogDescription>
            {account 
              ? 'Update the account information below.'
              : 'Add a new customer account to your CRM system.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Type</CardTitle>
              <CardDescription>
                Choose whether this is a household or business account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={formData.type === 'household' ? 'default' : 'outline'}
                  className="h-20 flex-col"
                  onClick={() => updateField('type', 'household')}
                >
                  <Users className="h-6 w-6 mb-2" />
                  Household
                </Button>
                <Button
                  type="button"
                  variant={formData.type === 'business' ? 'default' : 'outline'}
                  className="h-20 flex-col"
                  onClick={() => updateField('type', 'business')}
                >
                  <Building2 className="h-6 w-6 mb-2" />
                  Business
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">
                    {formData.type === 'business' ? 'Business Name' : 'Household Name'} *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder={formData.type === 'business' ? 'ABC Company Inc.' : 'Smith Family'}
                    className={errors.name ? 'border-destructive' : ''}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive mt-1">{errors.name}</p>
                  )}
                </div>

                {formData.type === 'business' && (
                  <div>
                    <Label htmlFor="tin_last4">Tax ID (Last 4 digits)</Label>
                    <Input
                      id="tin_last4"
                      value={formData.tin_last4}
                      onChange={(e) => updateField('tin_last4', e.target.value)}
                      placeholder="1234"
                      maxLength={4}
                      className={errors.tin_last4 ? 'border-destructive' : ''}
                    />
                    {errors.tin_last4 && (
                      <p className="text-sm text-destructive mt-1">{errors.tin_last4}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                    className={errors.phone ? 'border-destructive' : ''}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive mt-1">{errors.phone}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                    className={errors.email ? 'border-destructive' : ''}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive mt-1">{errors.email}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="source">Source</Label>
                <Select value={formData.source} onValueChange={(value) => updateField('source', value)}>
                  <SelectTrigger id="source">
                    <SelectValue placeholder="How did they find you?" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_ACCOUNT_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Address Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Address Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="address_line1">Street Address</Label>
                <Input
                  id="address_line1"
                  value={formData.address_line1}
                  onChange={(e) => updateField('address_line1', e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>

              <div>
                <Label htmlFor="address_line2">Address Line 2 (Optional)</Label>
                <Input
                  id="address_line2"
                  value={formData.address_line2}
                  onChange={(e) => updateField('address_line2', e.target.value)}
                  placeholder="Apt 4B, Suite 200, etc."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    placeholder="City"
                  />
                </div>

                <div>
                  <Label htmlFor="state">State</Label>
                  <Select value={formData.state} onValueChange={(value) => updateField('state', value)}>
                    <SelectTrigger id="state">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="zip_code">ZIP Code</Label>
                  <Input
                    id="zip_code"
                    value={formData.zip_code}
                    onChange={(e) => updateField('zip_code', e.target.value)}
                    placeholder="12345"
                    className={errors.zip_code ? 'border-destructive' : ''}
                  />
                  {errors.zip_code && (
                    <p className="text-sm text-destructive mt-1">{errors.zip_code}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : account ? 'Update Account' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}