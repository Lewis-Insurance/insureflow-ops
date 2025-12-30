import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DollarSign } from 'lucide-react';
import { useRecordPayment } from '@/hooks/usePayments';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

interface Policy {
  id: string;
  policy_number: string;
  carrier: string;
}

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

export function AddPaymentModal({ open, onOpenChange, accountId, onSuccess }: AddPaymentModalProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [formData, setFormData] = useState({
    policy_id: '',
    amount: '',
    payment_method_id: '',
    received_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    check_number: '',
    notes: '',
  });
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const { toast } = useToast();

  const recordPayment = useRecordPayment();
  const { data: paymentMethods, isLoading: loadingPaymentMethods } = usePaymentMethods();

  // Get the selected payment method details
  const selectedMethod = paymentMethods?.find(m => m.id === formData.payment_method_id);

  // Fetch policies for this account
  useEffect(() => {
    if (open && accountId) {
      fetchPolicies();
    }
  }, [open, accountId]);

  // Set default payment method when methods load
  useEffect(() => {
    if (paymentMethods?.length && !formData.payment_method_id) {
      setFormData(prev => ({ ...prev, payment_method_id: paymentMethods[0].id }));
    }
  }, [paymentMethods]);

  async function fetchPolicies() {
    setLoadingPolicies(true);
    try {
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, carrier')
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

    // Validate check number if required
    if (selectedMethod?.requires_check_number && !formData.check_number.trim()) {
      toast({
        title: 'Error',
        description: 'Check number is required for this payment method',
        variant: 'destructive',
      });
      return;
    }

    // Validate reference number if required
    if (selectedMethod?.requires_reference && !formData.reference_number.trim()) {
      toast({
        title: 'Error',
        description: 'Reference number is required for this payment method',
        variant: 'destructive',
      });
      return;
    }

    try {
      await recordPayment.mutateAsync({
        account_id: accountId,
        policy_id: formData.policy_id,
        payment_method_id: formData.payment_method_id,
        amount: parseFloat(formData.amount),
        received_date: formData.received_date,
        reference_number: formData.reference_number.trim() || null,
        check_number: formData.check_number.trim() || null,
        notes: formData.notes.trim() || null,
        payment_source: 'in_person',
      });

      toast({
        title: 'Success',
        description: `Payment of $${parseFloat(formData.amount).toFixed(2)} recorded`,
      });

      // Reset form
      setFormData({
        policy_id: '',
        amount: '',
        payment_method_id: paymentMethods?.[0]?.id || '',
        received_date: new Date().toISOString().split('T')[0],
        reference_number: '',
        check_number: '',
        notes: '',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record payment',
        variant: 'destructive',
      });
    }
  }

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
                    {policy.policy_number} - {policy.carrier}
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
              <Label htmlFor="received_date">Payment Date</Label>
              <Input
                id="received_date"
                type="date"
                value={formData.received_date}
                onChange={(e) => setFormData(prev => ({ ...prev, received_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="payment_method">Payment Method *</Label>
              <Select
                value={formData.payment_method_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingPaymentMethods ? 'Loading...' : 'Select method'} />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map(method => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.name}
                    </SelectItem>
                  ))}
                  {(!paymentMethods || paymentMethods.length === 0) && !loadingPaymentMethods && (
                    <SelectItem value="none" disabled>No payment methods configured</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reference_number">
                {selectedMethod?.type === 'check' ? 'Check #' : 'Reference #'}
                {(selectedMethod?.requires_reference || selectedMethod?.requires_check_number) && ' *'}
              </Label>
              <Input
                id="reference_number"
                value={selectedMethod?.type === 'check' ? formData.check_number : formData.reference_number}
                onChange={(e) => {
                  if (selectedMethod?.type === 'check') {
                    setFormData(prev => ({ ...prev, check_number: e.target.value }));
                  } else {
                    setFormData(prev => ({ ...prev, reference_number: e.target.value }));
                  }
                }}
                placeholder={selectedMethod?.type === 'check' ? 'Check number' : 'Trans ID'}
              />
            </div>
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
              disabled={recordPayment.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {recordPayment.isPending ? 'Saving...' : 'Record Payment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
