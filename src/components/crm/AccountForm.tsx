import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Building2, Users, Loader2 } from 'lucide-react';
import type { Account, CreateAccountData } from '@/types/crm';
import { COMMON_ACCOUNT_SOURCES } from '@/types/crm';

// Zod validation schema for account form
const accountSchema = z.object({
  account_type: z.enum(['household', 'business']),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200, 'Name too long'),
  tin_last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits').optional().or(z.literal('')),
  address_line1: z.string().trim().max(200, 'Address too long').optional().or(z.literal('')),
  address_line2: z.string().trim().max(200, 'Address too long').optional().or(z.literal('')),
  city: z.string().trim().max(100, 'City name too long').optional().or(z.literal('')),
  state: z.string().length(2, 'State must be 2 characters').optional().or(z.literal('')),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format (12345 or 12345-6789)').optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[\d\s\-\(\)\.]+$/, 'Invalid phone format').optional().or(z.literal('')),
  email: z.string().email('Invalid email format').max(255, 'Email too long').optional().or(z.literal('')),
  source: z.string().optional().or(z.literal('')),
});

type AccountFormValues = z.infer<typeof accountSchema>;

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

// Helper function to map database account_type to UI values
function mapAccountTypeForUI(dbAccountType: string | null | undefined): 'household' | 'business' {
  if (dbAccountType === 'business') return 'business';
  return 'household'; // Map 'individual' and null/undefined to 'household'
}

// Helper function to map UI values back to database account_type
function mapAccountTypeForDB(uiAccountType: 'household' | 'business'): 'individual' | 'business' {
  if (uiAccountType === 'business') return 'business';
  return 'individual'; // Map 'household' back to 'individual' for database
}

export function AccountForm({ open, onOpenChange, onSubmit, account, loading }: AccountFormProps) {
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      account_type: 'household',
      name: '',
      tin_last4: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      zip_code: '',
      phone: '',
      email: '',
      source: '',
    },
  });

  // Update form data when account prop changes or dialog opens
  useEffect(() => {
    if (open) {
      if (account) {
        form.reset({
          account_type: mapAccountTypeForUI(account.account_type),
          name: account.name || '',
          tin_last4: account.tin_last4 || '',
          address_line1: account.address_line1 || '',
          address_line2: account.address_line2 || '',
          city: account.city || '',
          state: account.state || '',
          zip_code: account.zip_code || '',
          phone: account.phone || '',
          email: account.email || '',
          source: account.source || '',
        });
      } else {
        form.reset({
          account_type: 'household',
          name: '',
          tin_last4: '',
          address_line1: '',
          address_line2: '',
          city: '',
          state: '',
          zip_code: '',
          phone: '',
          email: '',
          source: '',
        });
      }
    }
  }, [account, open, form]);

  const handleFormSubmit = async (values: AccountFormValues) => {
    try {
      // Map UI account_type back to database format before submitting
      const dbFormData = {
        ...values,
        account_type: mapAccountTypeForDB(values.account_type)
      };
      await onSubmit(dbFormData);
      onOpenChange(false);
      if (!account) {
        form.reset();
      }
    } catch (error) {
      console.error('AccountForm: onSubmit failed:', error);
    }
  };

  const watchAccountType = form.watch('account_type');

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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            {/* Account Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Type</CardTitle>
                <CardDescription>
                  Choose whether this is a household or business account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="account_type"
                  render={({ field }) => (
                    <FormItem>
                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          type="button"
                          variant={field.value === 'household' ? 'default' : 'outline'}
                          className="h-20 flex-col"
                          onClick={() => field.onChange('household')}
                        >
                          <Users className="h-6 w-6 mb-2" />
                          Household
                        </Button>
                        <Button
                          type="button"
                          variant={field.value === 'business' ? 'default' : 'outline'}
                          className="h-20 flex-col"
                          onClick={() => field.onChange('business')}
                        >
                          <Building2 className="h-6 w-6 mb-2" />
                          Business
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {watchAccountType === 'business' ? 'Business Name' : 'Household Name'} *
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={watchAccountType === 'business' ? 'ABC Company Inc.' : 'Smith Family'}
                            maxLength={200}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchAccountType === 'business' && (
                    <FormField
                      control={form.control}
                      name="tin_last4"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tax ID (Last 4 digits)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="1234"
                              maxLength={4}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" maxLength={20} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@example.com" maxLength={255} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="How did they find you?" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COMMON_ACCOUNT_SOURCES.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Address Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Address Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="address_line1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main Street" maxLength={200} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_line2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 2 (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Apt 4B, Suite 200, etc." maxLength={200} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="City" maxLength={100} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {US_STATES.map((state) => (
                              <SelectItem key={state.value} value={state.value}>
                                {state.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="zip_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP Code</FormLabel>
                        <FormControl>
                          <Input placeholder="12345" maxLength={10} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Saving...' : account ? 'Update Account' : 'Create Account'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}