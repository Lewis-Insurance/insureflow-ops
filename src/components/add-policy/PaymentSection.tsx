import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PaymentInput } from '@/hooks/useUnifiedIntakeSave';

interface PaymentMethodRow {
  id: string;
  name: string;
  type: string;
  requires_check_number: boolean;
}

const COMPANY_TYPES = ['credit_card', 'ach'];
const ESCROW_TYPES = ['cash', 'check'];

interface PaymentSectionProps {
  value: PaymentInput;
  onChange: (patch: Partial<PaymentInput>) => void;
  customerName: string;
  policyLabel: string;
}

/**
 * Payment fields for the unified Add Policy page. Mirrors RecordPaymentForm's
 * rules (paid-to drives which method types show; checks carry a check number,
 * card/ACH carry a reference number) but does NOT write on its own -- the page's
 * Save orchestration inserts the payment after the policy exists so it attaches
 * to the new policy and lands on the day sheet.
 */
export function PaymentSection({ value, onChange, customerName, policyLabel }: PaymentSectionProps) {
  const { data: methods = [] } = useQuery({
    queryKey: ['payment_methods', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, type, requires_check_number')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('display_order');
      if (error) throw new Error(error.message);
      return (data || []) as PaymentMethodRow[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const visibleMethods = useMemo(() => {
    if (value.paid_to === 'company') return methods.filter((m) => COMPANY_TYPES.includes(m.type));
    if (value.paid_to === 'escrow') return methods.filter((m) => ESCROW_TYPES.includes(m.type));
    return [];
  }, [methods, value.paid_to]);

  const selectedMethod = methods.find((m) => m.id === value.payment_method_id) || null;
  const isCheck = selectedMethod?.type === 'check';
  const isRef = selectedMethod?.type === 'credit_card' || selectedMethod?.type === 'ach';

  const handlePaidTo = (paid_to: 'company' | 'escrow') => {
    const stillValid = methods.some(
      (m) => m.id === value.payment_method_id && (paid_to === 'company' ? COMPANY_TYPES : ESCROW_TYPES).includes(m.type),
    );
    onChange({ paid_to, payment_method_id: stillValid ? value.payment_method_id : '' });
  };

  return (
    <div className="mt-4 border-t border-cc-border-subtle pt-4">
      {/* Locked context: this payment attaches to the new customer + policy */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-cc-sm border border-cc-border-subtle bg-cc-surface-raised px-3 py-1.5 text-xs text-cc-text-muted">
          <Lock className="h-3 w-3 text-cc-text-faint" />
          Customer <span className="font-semibold text-cc-text-primary">{customerName || 'New customer'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-cc-sm border border-cc-border-subtle bg-cc-surface-raised px-3 py-1.5 text-xs text-cc-text-muted">
          <Lock className="h-3 w-3 text-cc-text-faint" />
          Policy <span className="font-semibold text-cc-text-primary">{policyLabel || 'New policy'}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="pay_amount">Amount *</Label>
          <Input
            id="pay_amount"
            type="number"
            step="0.01"
            min="0"
            value={value.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label htmlFor="pay_date">Payment date</Label>
          <Input id="pay_date" type="date" value={value.payment_date} onChange={(e) => onChange({ payment_date: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="pay_sheet">Day sheet date</Label>
          <Input id="pay_sheet" type="date" value={value.day_sheet_date} onChange={(e) => onChange({ day_sheet_date: e.target.value })} />
          <p className="mt-1 text-xs text-cc-text-faint">Which day's sheet this lands on.</p>
        </div>

        <div>
          <Label htmlFor="pay_paidto">Paid to *</Label>
          <Select value={value.paid_to || undefined} onValueChange={(v) => handlePaidTo(v as 'company' | 'escrow')}>
            <SelectTrigger id="pay_paidto">
              <SelectValue placeholder="Select destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Paid to Company</SelectItem>
              <SelectItem value="escrow">Paid to Escrow</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pay_method">Payment method *</Label>
          <Select
            value={value.payment_method_id || undefined}
            onValueChange={(v) => onChange({ payment_method_id: v })}
            disabled={!value.paid_to}
          >
            <SelectTrigger id="pay_method">
              <SelectValue placeholder={value.paid_to ? 'Select method' : 'Select Paid To first'} />
            </SelectTrigger>
            <SelectContent>
              {visibleMethods.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isCheck ? (
          <div>
            <Label htmlFor="pay_check">Check #{selectedMethod?.requires_check_number ? ' *' : ''}</Label>
            <Input id="pay_check" value={value.check_number} onChange={(e) => onChange({ check_number: e.target.value })} placeholder="Check number" />
          </div>
        ) : isRef ? (
          <div>
            <Label htmlFor="pay_ref">Reference #</Label>
            <Input id="pay_ref" value={value.reference_number} onChange={(e) => onChange({ reference_number: e.target.value })} placeholder="Transaction ID (optional)" />
          </div>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}

        <div className="sm:col-span-2">
          <Label htmlFor="pay_payer">Payer name</Label>
          <Input id="pay_payer" value={value.payer_name} onChange={(e) => onChange({ payer_name: e.target.value })} placeholder="Name on check or card" />
        </div>
        <div className="sm:col-span-1">
          <Label htmlFor="pay_notes">Notes</Label>
          <Input id="pay_notes" value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Optional" />
        </div>
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-cc-text-faint">
        <CalendarClock className="h-3.5 w-3.5" />
        Books onto the day sheet for the date above. A sheet is opened automatically if none exists.
      </p>
    </div>
  );
}
