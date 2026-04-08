import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCreateLead } from '@/hooks/useLeads';
import { useLeadSources } from '@/integrations/supabase/hooks/useLeadSources';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const leadSchema = z.object({
  first_name: z.string().trim().min(2, 'First name must be at least 2 characters').max(100, 'First name too long'),
  last_name: z.string().trim().min(2, 'Last name must be at least 2 characters').max(100, 'Last name too long'),
  email: z.string().trim().email('Invalid email').max(255, 'Email too long').optional().or(z.literal('')),
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits').max(20, 'Phone too long').optional().or(z.literal('')),
  company_name: z.string().trim().max(200, 'Company name too long').optional(),
  address: z.string().trim().max(200, 'Address too long').optional(),
  city: z.string().trim().max(100, 'City name too long').optional(),
  state: z.string().trim().length(2, 'State must be 2 characters').toUpperCase().optional().or(z.literal('')),
  zip: z.string().trim().max(10, 'ZIP code too long').optional(),
  source_id: z.string().optional(),
  insurance_types: z.array(z.string()).min(1, 'Select at least one insurance type'),
  decision_timeframe: z.enum(['immediate', '1_3_months', '3_6_months', '6_12_months', 'just_shopping']).optional(),
  current_carrier: z.string().trim().max(100, 'Carrier name too long').optional(),
  current_premium: z.string().max(20, 'Invalid premium amount').optional(),
  notes: z.string().trim().max(2000, 'Notes too long (max 2000 characters)').optional(),
}).refine(data => data.email || data.phone, {
  message: 'Either email or phone is required',
  path: ['email'],
});

type LeadFormValues = z.infer<typeof leadSchema>;

const INSURANCE_TYPES = [
  { id: 'auto', label: 'Auto' },
  { id: 'home', label: 'Home' },
  { id: 'life', label: 'Life' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'health', label: 'Health' },
  { id: 'umbrella', label: 'Umbrella' },
];

interface LeadCaptureFormProps {
  onSuccess?: () => void;
}

export function LeadCaptureForm({ onSuccess }: LeadCaptureFormProps) {
  const { data: sources } = useLeadSources();
  const createLead = useCreateLead();
  const { activeAgency } = useActiveAgency();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      company_name: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      insurance_types: [],
      decision_timeframe: 'just_shopping',
      current_carrier: '',
      current_premium: '',
      notes: '',
    },
  });

  const onSubmit = async (values: LeadFormValues) => {
    await createLead.mutateAsync({
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email || null,
      phone: values.phone || null,
      address_line1: values.address || null,
      city: values.city || null,
      state: values.state || null,
      zip_code: values.zip || null,
      source_id: values.source_id || null,
      insurance_types: values.insurance_types,
      decision_timeframe: values.decision_timeframe || null,
      current_premium: values.current_premium ? parseFloat(values.current_premium) : null,
      notes: values.notes || null,
      status: 'new',
      agency_workspace_id: activeAgency?.agency_workspace_id,
    });
    form.reset();
    onSuccess?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture New Lead</CardTitle>
        <CardDescription>
          Enter lead information to add them to your pipeline
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Contact Information */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" maxLength={255} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" maxLength={20} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Company & Address */}
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corporation" maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St" maxLength={200} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Miami" maxLength={100} {...field} />
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
                    <FormControl>
                      <Input 
                        placeholder="FL" 
                        maxLength={2} 
                        style={{ textTransform: 'uppercase' }}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP Code</FormLabel>
                    <FormControl>
                      <Input placeholder="33101" maxLength={10} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="source_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Source</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sources?.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Insurance Details */}
            <FormField
              control={form.control}
              name="insurance_types"
              render={() => (
                <FormItem>
                  <FormLabel>Insurance Types of Interest *</FormLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {INSURANCE_TYPES.map((type) => (
                      <FormField
                        key={type.id}
                        control={form.control}
                        name="insurance_types"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={type.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(type.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, type.id])
                                      : field.onChange(
                                          field.value?.filter((value) => value !== type.id)
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {type.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="current_carrier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Carrier</FormLabel>
                    <FormControl>
                      <Input placeholder="State Farm" maxLength={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="current_premium"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Annual Premium</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        min="0"
                        max="9999999.99"
                        placeholder="2500" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="decision_timeframe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Decision Timeframe</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select timeframe" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="immediate">Immediate</SelectItem>
                      <SelectItem value="1_3_months">1-3 Months</SelectItem>
                      <SelectItem value="3_6_months">3-6 Months</SelectItem>
                      <SelectItem value="6_12_months">6-12 Months</SelectItem>
                      <SelectItem value="just_shopping">Just Shopping</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any additional information..."
                      className="resize-none"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
              >
                Reset
              </Button>
              <Button type="submit" disabled={createLead.isPending}>
                {createLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Lead
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
