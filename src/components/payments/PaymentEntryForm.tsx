import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon, DollarSign, Search, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

import { PaymentMethodSelector } from './PaymentMethodSelector';
import { useRecordPayment } from '@/hooks/usePayments';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { recordPaymentSchema, type RecordPaymentInput, type PaymentSource } from '@/types/payments';
import { supabase } from '@/integrations/supabase/client';

interface PolicyOption {
  id: string;
  policy_number: string;
  policy_type: string;
  account_id: string;
  account_name: string;
}

interface PaymentEntryFormProps {
  onSuccess?: (data: { receipt_number: string; change_given: number | null }) => void;
  defaultPolicyId?: string;
  defaultAccountId?: string;
}

const paymentSources: { value: PaymentSource; label: string }[] = [
  { value: 'in_person', label: 'In Person' },
  { value: 'mail', label: 'Mail' },
  { value: 'phone', label: 'Phone' },
  { value: 'online', label: 'Online' },
  { value: 'lockbox', label: 'Lockbox' },
];

export function PaymentEntryForm({
  onSuccess,
  defaultPolicyId,
  defaultAccountId,
}: PaymentEntryFormProps) {
  const { toast } = useToast();
  const recordPayment = useRecordPayment();
  const { data: paymentMethods } = usePaymentMethods();

  const [policySearch, setPolicySearch] = useState('');
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [policyPopoverOpen, setPolicyPopoverOpen] = useState(false);

  const form = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      policy_id: defaultPolicyId || null,
      account_id: defaultAccountId || null,
      payment_method_id: '',
      amount: 0,
      amount_tendered: null,
      reference_number: null,
      check_number: null,
      check_date: null,
      payer_name: null,
      payer_address: null,
      received_date: format(new Date(), 'yyyy-MM-dd'),
      payment_source: 'in_person',
      invoice_number: null,
      notes: null,
    },
  });

  const selectedMethodId = form.watch('payment_method_id');
  const amount = form.watch('amount');
  const amountTendered = form.watch('amount_tendered');

  const selectedMethod = useMemo(
    () => paymentMethods?.find((m) => m.id === selectedMethodId),
    [paymentMethods, selectedMethodId]
  );

  const showCheckFields = selectedMethod?.type === 'check';
  const showCashFields = selectedMethod?.type === 'cash';
  const showReferenceField = selectedMethod?.requires_reference;

  const changeGiven = useMemo(() => {
    if (!showCashFields || !amountTendered || amountTendered < amount) return null;
    return amountTendered - amount;
  }, [showCashFields, amountTendered, amount]);

  // Search for policies
  useEffect(() => {
    if (policySearch.length < 2) {
      setPolicies([]);
      return;
    }

    const searchPolicies = async () => {
      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('policies')
          .select(`
            id,
            policy_number,
            policy_type,
            account_id,
            account:accounts(name)
          `)
          .or(`policy_number.ilike.%${policySearch}%`)
          .eq('status', 'active')
          .limit(10);

        if (error) throw error;

        setPolicies(
          (data || []).map((p: any) => ({
            id: p.id,
            policy_number: p.policy_number,
            policy_type: p.policy_type,
            account_id: p.account_id,
            account_name: p.account?.name || 'Unknown',
          }))
        );
      } catch (error) {
        console.error('Policy search error:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchPolicies, 300);
    return () => clearTimeout(debounce);
  }, [policySearch]);

  const handlePolicySelect = (policy: PolicyOption) => {
    form.setValue('policy_id', policy.id);
    form.setValue('account_id', policy.account_id);
    setPolicyPopoverOpen(false);
    setPolicySearch('');
  };

  const onSubmit = async (data: RecordPaymentInput) => {
    try {
      const result = await recordPayment.mutateAsync(data);

      toast({
        title: 'Payment Recorded',
        description: `Receipt #${result.receipt_number}. ${
          result.change_given ? `Change due: $${result.change_given.toFixed(2)}` : ''
        }`,
      });

      form.reset();
      onSuccess?.({
        receipt_number: result.receipt_number,
        change_given: result.change_given,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record payment',
        variant: 'destructive',
      });
    }
  };

  const selectedPolicy = policies.find((p) => p.id === form.watch('policy_id'));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Record Payment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Policy Search */}
            <FormField
              control={form.control}
              name="policy_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Policy (Optional)</FormLabel>
                  <Popover open={policyPopoverOpen} onOpenChange={setPolicyPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            'justify-between',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {selectedPolicy
                            ? `${selectedPolicy.policy_number} - ${selectedPolicy.account_name}`
                            : 'Search for a policy...'}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search by policy number..."
                          value={policySearch}
                          onValueChange={setPolicySearch}
                        />
                        <CommandList>
                          {isSearching ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>No policies found.</CommandEmpty>
                              <CommandGroup>
                                {policies.map((policy) => (
                                  <CommandItem
                                    key={policy.id}
                                    value={policy.policy_number}
                                    onSelect={() => handlePolicySelect(policy)}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-medium">{policy.policy_number}</span>
                                      <span className="text-sm text-muted-foreground">
                                        {policy.account_name} - {policy.policy_type}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Payment Method */}
            <FormField
              control={form.control}
              name="payment_method_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method *</FormLabel>
                  <FormControl>
                    <PaymentMethodSelector
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="pl-7"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showCashFields && (
                <FormField
                  control={form.control}
                  name="amount_tendered"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount Tendered</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="pl-7"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                            }
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Change Display */}
            {showCashFields && changeGiven !== null && changeGiven > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-lg font-semibold text-green-700">
                  Change Due: ${changeGiven.toFixed(2)}
                </p>
              </div>
            )}

            {/* Check Fields */}
            {showCheckFields && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="check_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check Number *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter check number"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="check_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Check Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? (
                                format(new Date(field.value), 'PPP')
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) =>
                              field.onChange(date ? format(date, 'yyyy-MM-dd') : null)
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Reference Number */}
            {showReferenceField && (
              <FormField
                control={form.control}
                name="reference_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Number *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter reference or confirmation number"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Payer Info and Received Date */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="payer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payer Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Name on payment"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="received_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Received Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(new Date(field.value), 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) =>
                            field.onChange(date ? format(date, 'yyyy-MM-dd') : '')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Payment Source */}
            <FormField
              control={form.control}
              name="payment_source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentSources.map((source) => (
                        <SelectItem key={source.value} value={source.value}>
                          {source.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional notes..."
                      className="resize-none"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={recordPayment.isPending}
            >
              {recordPayment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording Payment...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Record Payment
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default PaymentEntryForm;
