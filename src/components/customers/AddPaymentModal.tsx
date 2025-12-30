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

interface Policy {
  id: string;
  policy_number: string;
  carrier: string | null;
}

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'ach', label: 'ACH/Bank Transfer' },
  { value: 'money_order', label: 'Money Order' },
  { value: 'other', label: 'Other' },
];

export function AddPaymentModal({ open, onOpenChange, accountId, onSuccess }: AddPaymentModalProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [formData, setFormData] = useState({
    policy_id: '',
    amount: '',
    payment_method: 'check',
    payment_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const { toast } = useToast();

  // Fetch policies for this account
  useEffect(() => {
    if (open && accountId) {
      fetchPolicies();
    }
  }, [open, accountId]);

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

      // Get the selected policy details for the note
      const selectedPolicy = policies.find(p => p.id === formData.policy_id);
      const policyDisplay = selectedPolicy
        ? `${selectedPolicy.policy_number}${selectedPolicy.carrier ? ` (${selectedPolicy.carrier})` : ''}`
        : formData.policy_id;

      const paymentMethodLabel = PAYMENT_METHODS.find(m => m.value === formData.payment_method)?.label || formData.payment_method;
      const amount = parseFloat(formData.amount).toFixed(2);

      // Record as a communication/activity note
      const { error } = await supabase
        .from('communications')
        .insert({
          account_id: accountId,
          agent_id: user.id,
          type: 'note',
          direction: 'internal',
          subject: `Payment Recorded: $${amount}`,
          body: [
            `Payment of $${amount} recorded`,
            `Policy: ${policyDisplay}`,
            `Method: ${paymentMethodLabel}`,
            formData.reference_number ? `Reference: ${formData.reference_number}` : null,
            formData.notes ? `Notes: ${formData.notes}` : null,
          ].filter(Boolean).join('\n'),
          occurred_at: formData.payment_date,
          meta: {
            type: 'payment',
            amount: parseFloat(formData.amount),
            policy_id: formData.policy_id,
            policy_number: selectedPolicy?.policy_number,
            carrier: selectedPolicy?.carrier,
            payment_method: formData.payment_method,
            reference_number: formData.reference_number || null,
            payment_date: formData.payment_date,
          },
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Payment of $${amount} recorded`,
      });

      // Reset form
      setFormData({
        policy_id: '',
        amount: '',
        payment_method: 'check',
        payment_date: new Date().toISOString().split('T')[0],
        reference_number: '',
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
                value={formData.payment_method}
                onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(method => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
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
