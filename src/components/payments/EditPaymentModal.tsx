import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import type { PremiumPayment, PaymentMethod } from '@/types/payments';

interface EditPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PremiumPayment | null;
  onSuccess?: () => void;
}

export function EditPaymentModal({ open, onOpenChange, payment, onSuccess }: EditPaymentModalProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [formData, setFormData] = useState({
    amount: '',
    payment_method_id: '',
    received_date: '',
    reference_number: '',
    check_number: '',
    payer_name: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Populate form when payment changes
  useEffect(() => {
    if (payment && open) {
      setFormData({
        amount: payment.amount?.toString() || '',
        payment_method_id: payment.payment_method_id || '',
        received_date: payment.received_date?.split('T')[0] || '',
        reference_number: payment.reference_number || '',
        check_number: payment.check_number || '',
        payer_name: payment.payer_name || '',
        notes: payment.notes || '',
      });
      fetchPaymentMethods();
    }
  }, [payment, open]);

  async function fetchPaymentMethods() {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, type, org_id, requires_reference, requires_check_number, gl_account_code, is_active, display_order, created_at, updated_at, deleted_at')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    }
  }

  async function handleSave() {
    if (!payment) return;

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid payment amount',
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
      const { error } = await supabase
        .from('premium_payments')
        .update({
          amount: parseFloat(formData.amount),
          payment_method_id: formData.payment_method_id,
          received_date: formData.received_date,
          reference_number: formData.reference_number || null,
          check_number: formData.check_number || null,
          payer_name: formData.payer_name || null,
          notes: formData.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment updated successfully',
      });

      // Invalidate payment and day sheet queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['day-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['day-sheet'] });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Update error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update payment',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const selectedMethod = paymentMethods.find(m => m.id === formData.payment_method_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-blue-600" />
            Edit Payment
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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

          <div>
            <Label htmlFor="payment_method">Payment Method *</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="reference_number">Reference #</Label>
              <Input
                id="reference_number"
                value={formData.reference_number}
                onChange={(e) => setFormData(prev => ({ ...prev, reference_number: e.target.value }))}
                placeholder="Trans ID"
              />
            </div>
            <div>
              <Label htmlFor="check_number">Check #</Label>
              <Input
                id="check_number"
                value={formData.check_number}
                onChange={(e) => setFormData(prev => ({ ...prev, check_number: e.target.value }))}
                placeholder="Check number"
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
