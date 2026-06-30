import { useState, useEffect, useMemo } from 'react';
import { todayLocalDate } from '@/lib/date/localDate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, User } from 'lucide-react';
import type { PaidTo } from '@/types/payments';

interface Policy {
  id: string;
  policy_number: string;
  carrier: string | null;
  account_id: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

export interface RecordPaymentFormProps {
  /** When provided, the customer is locked and the customer search is hidden. */
  accountId?: string;
  /** Customer name used to default the Payer Name field. */
  customerName?: string;
  /** Pre-select a specific policy. */
  policyId?: string;
  onSuccess?: () => void;
  /** Render a Cancel button (used inside dialogs). */
  onCancel?: () => void;
}

// Method type -> which "Paid To" bucket it belongs to.
const COMPANY_TYPES = ['credit_card', 'ach'];
const ESCROW_TYPES = ['cash', 'check'];

const paidToOptions: { value: PaidTo; label: string }[] = [
  { value: 'company', label: 'Paid to Company' },
  { value: 'escrow', label: 'Paid to Escrow' },
];

export function RecordPaymentForm({
  accountId,
  customerName,
  policyId,
  onSuccess,
  onCancel,
}: RecordPaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const lockedCustomer = !!accountId;

  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(accountId);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | undefined>(customerName);

  // Customer search (only used when no accountId provided)
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [formData, setFormData] = useState({
    policy_id: policyId || '',
    amount: '',
    paid_to: '' as '' | PaidTo,
    payment_method_id: '',
    payment_date: todayLocalDate(),
    reference_number: '',
    payer_name: customerName || '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);

  // Keep internal state in sync if the host passes a customer in later.
  useEffect(() => {
    setSelectedAccountId(accountId);
  }, [accountId]);

  useEffect(() => {
    if (customerName) {
      setSelectedCustomerName(customerName);
      setFormData((prev) => ({ ...prev, payer_name: prev.payer_name || customerName }));
    }
  }, [customerName]);

  // Load active payment methods once.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, type')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('display_order');
      if (!error) setPaymentMethods(data || []);
    })();
  }, []);

  // Load policies whenever the selected customer changes.
  useEffect(() => {
    if (!selectedAccountId) {
      setPolicies([]);
      return;
    }
    let cancelled = false;
    setLoadingPolicies(true);
    (async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, carrier, account_id')
        .eq('account_id', selectedAccountId)
        .order('policy_number');
      if (!cancelled) {
        if (!error) setPolicies(data || []);
        setLoadingPolicies(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId]);

  // Customer search (debounced) — only when not locked to a customer.
  useEffect(() => {
    if (lockedCustomer) return;
    if (customerSearch.trim().length < 2) {
      setCustomers([]);
      return;
    }
    setSearchingCustomers(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name')
        .ilike('name', `%${customerSearch}%`)
        .is('deleted_at', null)
        .order('name')
        .limit(20);
      if (!error) setCustomers(data || []);
      setSearchingCustomers(false);
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch, lockedCustomer]);

  const filteredMethods = useMemo(() => {
    if (formData.paid_to === 'company') {
      return paymentMethods.filter((m) => COMPANY_TYPES.includes(m.type));
    }
    if (formData.paid_to === 'escrow') {
      return paymentMethods.filter((m) => ESCROW_TYPES.includes(m.type));
    }
    return [];
  }, [paymentMethods, formData.paid_to]);

  const handleSelectCustomer = (customer: CustomerOption) => {
    setSelectedAccountId(customer.id);
    setSelectedCustomerName(customer.name);
    setCustomerPopoverOpen(false);
    setCustomerSearch('');
    setFormData((prev) => ({
      ...prev,
      policy_id: '',
      payer_name: prev.payer_name || customer.name,
    }));
  };

  const handlePaidToChange = (value: PaidTo) => {
    setFormData((prev) => {
      const stillValid =
        value === 'company'
          ? paymentMethods.some((m) => m.id === prev.payment_method_id && COMPANY_TYPES.includes(m.type))
          : paymentMethods.some((m) => m.id === prev.payment_method_id && ESCROW_TYPES.includes(m.type));
      return {
        ...prev,
        paid_to: value,
        payment_method_id: stillValid ? prev.payment_method_id : '',
      };
    });
  };

  const formatPolicyOption = (policy: Policy) =>
    policy.carrier ? `${policy.policy_number} - ${policy.carrier}` : policy.policy_number;

  const resetForm = () => {
    setFormData({
      policy_id: '',
      amount: '',
      paid_to: '',
      payment_method_id: '',
      payment_date: todayLocalDate(),
      reference_number: '',
      payer_name: lockedCustomer ? customerName || '' : '',
      notes: '',
    });
    if (!lockedCustomer) {
      setSelectedAccountId(undefined);
      setSelectedCustomerName(undefined);
    }
  };

  async function handleSave() {
    if (!selectedAccountId) {
      toast({ title: 'Error', description: 'Please select a customer', variant: 'destructive' });
      return;
    }
    if (!formData.policy_id) {
      toast({ title: 'Error', description: 'Please select a policy', variant: 'destructive' });
      return;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid payment amount', variant: 'destructive' });
      return;
    }
    if (!formData.paid_to) {
      toast({ title: 'Error', description: 'Please select Paid to Company or Escrow', variant: 'destructive' });
      return;
    }
    if (!formData.payment_method_id) {
      toast({ title: 'Error', description: 'Please select a payment method', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Error', description: 'You must be logged in', variant: 'destructive' });
        return;
      }

      const amount = parseFloat(formData.amount);

      // Resolve org via the DB's own function so org_id matches RLS WITH CHECK.
      const { data: orgId, error: orgError } = await supabase.rpc('get_user_org_id');
      if (orgError || !orgId) {
        toast({
          title: 'Error',
          description: 'Could not determine your agency workspace. Please re-select your workspace and try again.',
          variant: 'destructive',
        });
        return;
      }

      // day_sheet_id is intentionally left null — the BEFORE INSERT trigger
      // links the payment to the correct day sheet based on received_date.
      const { error } = await supabase.from('premium_payments').insert({
        policy_id: formData.policy_id,
        account_id: selectedAccountId,
        payment_method_id: formData.payment_method_id,
        amount,
        received_date: formData.payment_date,
        received_by: user.id,
        payment_source: 'in_person',
        status: 'recorded',
        paid_to: formData.paid_to || null,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null,
        payer_name: formData.payer_name || selectedCustomerName || null,
        org_id: orgId,
      });

      if (error) throw error;

      toast({ title: 'Success', description: `Payment of $${amount.toFixed(2)} recorded` });

      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['day-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['day-sheet'] });

      resetForm();
      onSuccess?.();
    } catch (error: any) {
      console.error('Payment error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to record payment',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Customer Search (dashboard / standalone mode) */}
      {!lockedCustomer && (
        <div>
          <Label>Customer *</Label>
          <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                <span className="flex items-center gap-2 truncate">
                  <User className="h-4 w-4 shrink-0 opacity-50" />
                  {selectedCustomerName || 'Search for a customer...'}
                </span>
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Type a customer name..."
                  value={customerSearch}
                  onValueChange={setCustomerSearch}
                />
                <CommandList>
                  {searchingCustomers ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>
                        {customerSearch.trim().length < 2
                          ? 'Type at least 2 characters.'
                          : 'No customers found.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.id}
                            onSelect={() => handleSelectCustomer(customer)}
                          >
                            {customer.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Everything below requires a customer. */}
      <fieldset
        disabled={!selectedAccountId}
        className={!selectedAccountId ? 'opacity-50 pointer-events-none space-y-4' : 'space-y-4'}
      >
        {/* Policy */}
        <div>
          <Label htmlFor="rp-policy">Policy *</Label>
          <Select
            value={formData.policy_id}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, policy_id: value }))}
          >
            <SelectTrigger id="rp-policy">
              <SelectValue placeholder={loadingPolicies ? 'Loading...' : 'Select policy'} />
            </SelectTrigger>
            <SelectContent>
              {policies.map((policy) => (
                <SelectItem key={policy.id} value={policy.id}>
                  {formatPolicyOption(policy)}
                </SelectItem>
              ))}
              {policies.length === 0 && !loadingPolicies && (
                <SelectItem value="none" disabled>
                  No policies found
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Amount + Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rp-amount">Amount *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="rp-amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="rp-date">Payment Date</Label>
            <Input
              id="rp-date"
              type="date"
              value={formData.payment_date}
              onChange={(e) => setFormData((prev) => ({ ...prev, payment_date: e.target.value }))}
            />
          </div>
        </div>

        {/* Paid To + Payment Method */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rp-paid-to">Paid To *</Label>
            <Select value={formData.paid_to} onValueChange={(v) => handlePaidToChange(v as PaidTo)}>
              <SelectTrigger id="rp-paid-to">
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                {paidToOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rp-method">Payment Method *</Label>
            <Select
              value={formData.payment_method_id}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, payment_method_id: value }))}
              disabled={!formData.paid_to}
            >
              <SelectTrigger id="rp-method">
                <SelectValue placeholder={formData.paid_to ? 'Select method' : 'Select Paid To first'} />
              </SelectTrigger>
              <SelectContent>
                {filteredMethods.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    {method.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Payer Name */}
        <div>
          <Label htmlFor="rp-payer">Payer Name</Label>
          <Input
            id="rp-payer"
            value={formData.payer_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, payer_name: e.target.value }))}
            placeholder="Name on check or card"
          />
        </div>

        {/* Reference */}
        <div>
          <Label htmlFor="rp-ref">Reference #</Label>
          <Input
            id="rp-ref"
            value={formData.reference_number}
            onChange={(e) => setFormData((prev) => ({ ...prev, reference_number: e.target.value }))}
            placeholder="Check # or Transaction ID (optional)"
          />
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="rp-notes">Notes</Label>
          <Textarea
            id="rp-notes"
            value={formData.notes}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Optional notes about this payment"
            rows={2}
          />
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={loading || !selectedAccountId}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
        >
          {loading ? 'Saving...' : 'Record Payment'}
        </Button>
      </div>
    </div>
  );
}

export default RecordPaymentForm;
