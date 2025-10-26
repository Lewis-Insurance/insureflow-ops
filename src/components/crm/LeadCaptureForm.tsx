import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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
import { useCreateLead, useLeadSources } from '@/hooks/useLeads';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

const leadFormSchema = z.object({
  first_name: z.string().trim().min(2, 'First name must be at least 2 characters').max(100, 'First name too long'),
  last_name: z.string().trim().min(2, 'Last name must be at least 2 characters').max(100, 'Last name too long'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email too long').optional().or(z.literal('')),
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits').max(20, 'Phone too long').optional().or(z.literal('')),
  source_id: z.string().uuid('Please select a lead source'),
  insurance_types: z.array(z.string()).min(1, 'Select at least one insurance type'),
  decision_timeframe: z.enum(['immediate', '1_3_months', '3_6_months', '6_12_months', 'just_shopping']),
  current_premium: z.string().optional(),
  address_line1: z.string().trim().max(255, 'Address too long').optional(),
  address_line2: z.string().trim().max(255, 'Address too long').optional(),
  city: z.string().trim().max(100, 'City name too long').optional(),
  state: z.string().trim().max(2, 'Use 2-letter state code').optional(),
  zip_code: z.string().trim().max(10, 'ZIP code too long').optional(),
  notes: z.string().trim().max(2000, 'Notes too long (max 2000 characters)').optional(),
}).refine(data => data.email || data.phone, {
  message: 'Either email or phone is required',
  path: ['email'],
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

const insuranceTypeOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'home', label: 'Home' },
  { value: 'life', label: 'Life' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'health', label: 'Health' },
  { value: 'umbrella', label: 'Umbrella' },
];

interface LeadCaptureFormProps {
  onSuccess?: () => void;
  defaultSourceId?: string;
}

export function LeadCaptureForm({ onSuccess, defaultSourceId }: LeadCaptureFormProps) {
  const { data: sources, isLoading: sourcesLoading } = useLeadSources();
  const createLead = useCreateLead();
  const [step, setStep] = useState(1);

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      source_id: defaultSourceId || '',
      insurance_types: [],
      decision_timeframe: 'just_shopping',
      current_premium: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      zip_code: '',
      notes: '',
    },
  });

  const onSubmit = async (values: LeadFormValues) => {
    await createLead.mutateAsync({
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email || null,
      phone: values.phone || null,
      source_id: values.source_id,
      insurance_types: values.insurance_types,
      decision_timeframe: values.decision_timeframe,
      current_premium: values.current_premium ? parseFloat(values.current_premium) : null,
      address_line1: values.address_line1 || null,
      address_line2: values.address_line2 || null,
      city: values.city || null,
      state: values.state?.toUpperCase() || null,
      zip_code: values.zip_code || null,
      notes: values.notes || null,
      status: 'new',
    });
    form.reset();
    setStep(1);
    onSuccess?.();
  };

  if (sourcesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 1: Contact Information */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Contact Information</h3>
              <p className="text-sm text-muted-foreground">
                Basic information about the lead
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormDescription>At least email or phone required</FormDescription>
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
                      <Input type="tel" placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormDescription>At least email or phone required</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Source *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select lead source" />
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

            <div className="flex justify-end">
              <Button type="button" onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Insurance Needs */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Insurance Needs</h3>
              <p className="text-sm text-muted-foreground">
                What type of insurance are they interested in?
              </p>
            </div>

            <FormField
              control={form.control}
              name="insurance_types"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel>Insurance Types *</FormLabel>
                    <FormDescription>
                      Select all that apply
                    </FormDescription>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {insuranceTypeOptions.map((item) => (
                      <FormField
                        key={item.value}
                        control={form.control}
                        name="insurance_types"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={item.value}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item.value)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, item.value])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== item.value
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {item.label}
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="decision_timeframe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Decision Timeframe *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="When are they looking to buy?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate (within 1 week)</SelectItem>
                        <SelectItem value="1_3_months">1-3 months</SelectItem>
                        <SelectItem value="3_6_months">3-6 months</SelectItem>
                        <SelectItem value="6_12_months">6-12 months</SelectItem>
                        <SelectItem value="just_shopping">Just shopping</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="current_premium"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Premium (Annual)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="5000" {...field} />
                    </FormControl>
                    <FormDescription>Optional - helps with scoring</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Address & Notes */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Additional Information</h3>
              <p className="text-sm text-muted-foreground">
                Optional details that help us serve them better
              </p>
            </div>

            <FormField
              control={form.control}
              name="address_line1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 1</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St" {...field} />
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
                  <FormLabel>Address Line 2</FormLabel>
                  <FormControl>
                    <Input placeholder="Apt 4B" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Miami" {...field} />
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
                      <Input placeholder="FL" {...field} maxLength={2} />
                    </FormControl>
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
                      <Input placeholder="33101" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional information about this lead..."
                      className="resize-none"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional notes about the conversation or lead details
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="submit" disabled={createLead.isPending}>
                {createLead.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Lead
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
}
