import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import type { PaymentMethodType } from '@/types/payments';
import {
  Banknote,
  FileCheck,
  CreditCard,
  Building2,
  Wallet,
  ArrowRightLeft,
  HelpCircle,
} from 'lucide-react';

interface PaymentMethodSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const methodIcons: Record<PaymentMethodType, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  check: <FileCheck className="h-4 w-4" />,
  credit_card: <CreditCard className="h-4 w-4" />,
  debit_card: <Wallet className="h-4 w-4" />,
  ach: <ArrowRightLeft className="h-4 w-4" />,
  agency_bill: <Building2 className="h-4 w-4" />,
  finance_company: <Building2 className="h-4 w-4" />,
  other: <HelpCircle className="h-4 w-4" />,
};

export function PaymentMethodSelector({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select payment method',
  className,
}: PaymentMethodSelectorProps) {
  const { data: methods, isLoading } = usePaymentMethods();

  const selectedMethod = useMemo(
    () => methods?.find((m) => m.id === value),
    [methods, value]
  );

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? 'Loading...' : placeholder}>
          {selectedMethod && (
            <div className="flex items-center gap-2">
              {methodIcons[selectedMethod.type]}
              <span>{selectedMethod.name}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {methods?.map((method) => (
          <SelectItem key={method.id} value={method.id}>
            <div className="flex items-center gap-2">
              {methodIcons[method.type]}
              <span>{method.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default PaymentMethodSelector;
