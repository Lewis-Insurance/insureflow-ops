import { useState, useEffect } from 'react';
import { todayLocalDate } from '@/lib/date/localDate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DollarSign } from 'lucide-react';

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

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

export function AddPaymentModal({ open, onOpenChange, accountId, onSuccess }: AddPaymentModalProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [formData, setFormData] = useState({
    policy_id: '',
    amount: '',
    payment_method_id: '',
    payment_date: todayLocalDate(),
    reference_number: '',
    payer_name: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch policies for this account
  useEffect(() => {
    if (open && accountId) {
      fetchPolicies();
      fetchPaymentMethods();
    }
  }, [open, accountId]);

  async function fetchPolicies() {
    setLoadingPolicies(true);
    try {
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, carrier, account_id')
        .eq('account_id', accountId)
        .order('policy_number');

      if (error) throw error;
      setPolicies(data || []);
    } catch (error) {
      console.error('Failed to fetch policies:', error);
    } finally {
      setLoadingPolicies(false);
    }
  }

  async function fetchPaymentMethods() {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, type')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setPaymentMethods(data || []);

      // Set default payment method if available
      if (data && data.length > 0 && !formData.payment_method_id) {
        setFormData(prev => ({ ...prev, payment_method_id: data[0].id }));
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    }
  }

  async function handleSave() {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid payment amount',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.policy_id) {
      toast({
        title: 'Error',
        description: 'Please select a policy',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.payment_method_id) {
      toast({
        title: 'Error',
        description: 'Please select a payment method',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in',
          variant: 'destructive',
        });
        return;
      }

      const amount = parseFloat(formData.amount);
      const selectedPolicy = policies.find(p => p.id === formData.policy_id);

      // Resolve the user's agency workspace (org) using the DB's own
      // get_user_org_id() function. This guarantees the inserted org_id matches
      // the premium_payments RLS WITH CHECK (org_id = get_user_org_id()).
      // NOTE: the previous code read from a non-existent `user_profiles` table,
      // which silently resolved to null and now fails RLS now that it is enabled.
      const { data: orgId, error: orgError } = await supabase.rpc('get_user_org_id');

      if (orgError || !orgId) {
        toast({
          title: 'Error',
          description: 'Could not determine your agency workspace. Please re-select your workspace and try again.',
          variant: 'destructive',
        });
        return;
      }

      // Get or create today's day sheet
      let daySheetId: string | null = null;
      {
        const { data: sheetId, error: sheetError } = await supabase
          .rpc('get_or_create_day_sheet', { p_org_id: orgId });

        if (!sheetError && sheetId) {
          daySheetId = sheetId;
        }
      }

      // Insert into premium_payments table
      const { error } = await supabase
        .from('premium_payments')
        .insert({
          policy_id: formData.policy_id,
          account_id: accountId,
          payment_method_id: formData.payment_method_id,
          amount: amount,
          received_date: formData.payment_date,
          received_by: user.id,
          payment_source: 'in_person',
          status: 'recorded',
          reference_number: formData.reference_number || null,
          notes: formData.notes || null,
          payer_name: formData.payer_name || null,
          day_sheet_id: daySheetId,
          org_id: orgId,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Payment of $${amount.toFixed(2)} recorded`,
      });

      // Invalidate payment and day sheet queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['day-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['day-sheet'] });

      // Reset form
      setFormData({
        policy_id: '',
        amount: '',
        payment_method_id: paymentMethods[0]?.id || '',
        payment_date: todayLocalDate(),
        reference_number: '',
        payer_name: '',
        notes: '',
      });
      onOpenChange(false);
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

  // Format policy display with carrier
  const formatPolicyOption = (policy: Policy) => {
    if (policy.carrier) {
      return `${policy.policy_number} - ${policy.carrier}`;
    }
    return policy.policy_number;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Record Payment
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="policy">Policy *</Label>
            <Select
              value={formData.policy_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, policy_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingPolicies ? 'Loading...' : 'Select policy'} />
              </SelectTrigger>
              <SelectContent>
                {policies.map(policy => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {formatPolicyOption(policy)}
                  </SelectItem>
                ))}
                {policies.length === 0 && !loadingPolicies && (
                  <SelectItem value="none" disabled>No policies found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amount">Amount *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="payment_date">Payment Date</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="payment_method">Payment Method</Label>
              <Select
                value={formData.payment_method_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(method => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reference_number">Reference #</Label>
              <Input
                id="reference_number"
                value={formData.reference_number}
                onChange={(e) => setFormData(prev => ({ ...prev, reference_number: e.target.value }))}
                placeholder="Check # or Trans ID"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="payer_name">Payer Name</Label>
            <Input
              id="payer_name"
              value={formData.payer_name}
              onChange={(e) => setFormData(prev => ({ ...prev, payer_name: e.target.value }))}
              placeholder="Name on check or card"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes about this payment"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? 'Saving...' : 'Record Payment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
