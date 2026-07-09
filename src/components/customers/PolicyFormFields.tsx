import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EnumCombobox } from '@/components/ui/enum-combobox';
import { calcExpirationDate, parsePolicyTerm } from '@/lib/policyDates';
import { mapLineOfBusiness, mapCarrier } from '@/lib/policyParserMap';
import { format } from 'date-fns';
import { z } from 'zod';

/**
 * Lookup option shape shared by the carrier / line-of-business datalists.
 */
export interface LookupOption {
  id: string;
  name: string;
}

/**
 * The unified policy-form shape used by BOTH the standalone AddPolicyModal and
 * the "Also add a policy" section inside AddCustomerModal. Superset of what
 * either modal needs so the form fields, matching logic, and save payload stay
 * identical across both surfaces.
 */
export interface PolicyFormData {
  policy_number: string;
  carrier: string;
  line_of_business: string;
  premium: string;
  effective_date: string;
  expiration_date: string;
  billing_frequency: string;
  billing_method: string;
  policy_term: string;
  status: string;
}

export const initialPolicyFormData: PolicyFormData = {
  policy_number: '',
  carrier: '',
  line_of_business: '',
  premium: '',
  effective_date: '',
  expiration_date: '',
  billing_frequency: 'semiannual', // Default to semi-annual
  billing_method: 'direct_bill', // Default to direct bill
  policy_term: 'semiannual', // Default to semi-annual
  status: 'active',
};

export const policySchema = z.object({
  policy_number: z.string().min(1, 'Policy number is required').max(50, 'Policy number too long'),
  carrier: z.string().min(1, 'Carrier is required').max(100, 'Carrier name too long'),
  line_of_business: z.string().min(1, 'Line of business is required').max(100, 'Line of business too long'),
  premium: z.string().optional(),
  effective_date: z.string().min(1, 'Effective date is required'),
  expiration_date: z.string().min(1, 'Expiration date is required'),
  billing_frequency: z.string().optional(),
  policy_term: z.string().optional(),
  status: z.string().min(1, 'Status is required'),
});

/**
 * Shared change handler. Auto-calculates the expiration date whenever the
 * effective date or policy term changes, using manual date-part parsing to
 * avoid the timezone off-by-one that `new Date('2026-01-15')` introduces.
 */
export function applyPolicyFieldChange(
  prev: PolicyFormData,
  field: string,
  value: string,
): PolicyFormData {
  const next = { ...prev, [field]: value };

  if (field === 'effective_date' || field === 'policy_term') {
    const effectiveDate = field === 'effective_date' ? value : prev.effective_date;
    const policyTerm = field === 'policy_term' ? value : prev.policy_term;

    if (effectiveDate && policyTerm) {
      // Parse date parts manually to avoid timezone issues
      // new Date('2026-01-15') interprets as UTC midnight, which shifts in local timezone
      const [year, month, day] = effectiveDate.split('-').map(Number);
      const startDate = new Date(year, month - 1, day); // month is 0-indexed
      const term = parsePolicyTerm(policyTerm);
      const expirationDate = calcExpirationDate(startDate, term);
      next.expiration_date = format(expirationDate, 'yyyy-MM-dd');
    }
  }

  return next;
}

/**
 * Shared prefill mapping. Maps a parser-extracted document (from
 * ai-document-analysis-azure) into the unified policy-form shape, flagging any
 * field that couldn't be confidently mapped for user confirmation.
 */
export function mapExtractedToPolicyForm(
  extracted: any,
  carriers: LookupOption[],
  linesOfBusiness: LookupOption[],
): { data: PolicyFormData; needsConfirmation: Record<string, boolean> } {
  const data: PolicyFormData = { ...initialPolicyFormData };
  const needsConfirmation: Record<string, boolean> = {};

  if (extracted.policy_number) data.policy_number = extracted.policy_number;

  // Carrier — best-effort match against the carriers lookup, but free-text is allowed
  const carrierResult = mapCarrier(extracted.carrier, carriers);
  if (carrierResult.value) data.carrier = carrierResult.value;

  // Line of Business — must match the canonical lookup; otherwise leave empty
  // and flag for user confirmation rather than save a non-canonical value.
  const lobResult = mapLineOfBusiness(
    { line_of_business: extracted.line_of_business, document_type: extracted.document_type },
    linesOfBusiness,
  );
  if (lobResult.value) {
    data.line_of_business = lobResult.value;
  } else if (lobResult.needsConfirmation) {
    data.line_of_business = '';
    needsConfirmation.line_of_business = true;
  }

  if (extracted.effective_date) {
    const date = new Date(extracted.effective_date);
    if (!isNaN(date.getTime())) {
      data.effective_date = date.toISOString().split('T')[0];
    }
  }
  if (extracted.expiration_date) {
    const date = new Date(extracted.expiration_date);
    if (!isNaN(date.getTime())) {
      data.expiration_date = date.toISOString().split('T')[0];
    }
  }

  // Handle premium
  const premiumValue = typeof extracted.premium === 'object'
    ? extracted.premium?.total
    : extracted.premium;
  if (premiumValue) {
    const premiumStr = String(premiumValue).replace(/[$,]/g, '');
    const premiumNum = parseFloat(premiumStr);
    if (!isNaN(premiumNum)) {
      data.premium = premiumNum.toString();
    }
  }

  // Check for policy term from document
  if (extracted.policy_term_months) {
    const months = parseInt(extracted.policy_term_months);
    if (months === 6) {
      data.policy_term = 'semiannual';
    } else if (months === 12) {
      data.policy_term = 'annual';
    }
  }

  // Auto-detect if this is auto insurance, default to semi-annual
  // Use the mapped line_of_business which includes document_type mapping
  const lob = (data.line_of_business || extracted.line_of_business || '').toLowerCase();
  const docType = (extracted.document_type || '').toLowerCase();
  if (lob.includes('auto') || lob.includes('vehicle') || lob.includes('car') || docType.includes('auto')) {
    if (!extracted.policy_term_months) {
      data.policy_term = 'semiannual';
      data.billing_frequency = 'semiannual';
    }
  }

  return { data, needsConfirmation };
}

/**
 * Build the `policies` insert payload from the unified form shape. Matches the
 * columns/casts both modals persist so the save behavior is identical.
 */
export function buildPolicyInsert(
  data: PolicyFormData,
  accountId: string,
  userId: string | null,
) {
  // Parse premium - remove commas and convert to number, default to 0
  const premiumValue = data.premium
    ? parseFloat(data.premium.replace(/,/g, ''))
    : 0;

  return {
    account_id: accountId,
    insured_user_id: userId,
    policy_number: data.policy_number.trim(),
    carrier: data.carrier.trim(),
    line_of_business: data.line_of_business.trim(),
    premium: isNaN(premiumValue) ? 0 : premiumValue,
    effective_date: data.effective_date,
    expiration_date: data.expiration_date,
    billing_frequency: data.billing_frequency as 'annual' | 'monthly' | 'quarterly' | 'semiannual',
    billing_method: data.billing_method as 'direct_bill' | 'agency_bill',
    policy_term: data.policy_term || null,
    status: data.status,
  };
}

interface PolicyFormFieldsProps {
  value: PolicyFormData;
  onChange: (field: string, value: string) => void;
  errors?: Record<string, string>;
  needsConfirmation?: Record<string, boolean>;
  carriers: LookupOption[];
  linesOfBusiness: LookupOption[];
  lobLoading?: boolean;
}

/**
 * Controlled, presentational policy-form field set (everything below the
 * dropzone). The single source of truth for the policy form used by both
 * AddPolicyModal and AddCustomerModal. The dropzone stays in each parent modal.
 */
export function PolicyFormFields({
  value,
  onChange,
  errors = {},
  needsConfirmation = {},
  carriers,
  linesOfBusiness,
  lobLoading = false,
}: PolicyFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="policy_number">Policy Number *</Label>
          <Input
            id="policy_number"
            value={value.policy_number}
            onChange={(e) => onChange('policy_number', e.target.value)}
            placeholder="POL-2024-001"
            className={errors.policy_number ? 'border-destructive' : ''}
          />
          {errors.policy_number && (
            <p className="text-sm text-destructive mt-1">{errors.policy_number}</p>
          )}
        </div>
        <div>
          <Label htmlFor="carrier">Carrier *</Label>
          <Input
            id="carrier"
            list="carrier-list"
            value={value.carrier}
            onChange={(e) => onChange('carrier', e.target.value)}
            placeholder="Type or select carrier"
            className={errors.carrier ? 'border-destructive' : ''}
          />
          <datalist id="carrier-list">
            {carriers.map(carrier => (
              <option key={carrier.id} value={carrier.name} />
            ))}
          </datalist>
          {errors.carrier && (
            <p className="text-sm text-destructive mt-1">{errors.carrier}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="line_of_business">Line of Business *</Label>
        <EnumCombobox
          id="line_of_business"
          value={value.line_of_business}
          onChange={(v) => onChange('line_of_business', v)}
          options={linesOfBusiness.map(lob => ({ value: lob.name }))}
          placeholder="Select line of business"
          searchPlaceholder="Search lines of business..."
          emptyText="No matching line of business."
          loading={lobLoading}
          error={!!errors.line_of_business}
          needsConfirmation={!!needsConfirmation.line_of_business}
        />
        {errors.line_of_business && (
          <p className="text-sm text-destructive mt-1">{errors.line_of_business}</p>
        )}
        {needsConfirmation.line_of_business && !errors.line_of_business && (
          <p className="text-sm text-warning mt-1">
            Couldn't auto-match the parsed line of business — please pick one.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="premium">Premium Amount</Label>
          <Input
            id="premium"
            type="number"
            step="0.01"
            min="0"
            value={value.premium}
            onChange={(e) => onChange('premium', e.target.value)}
            placeholder="1200.00"
          />
        </div>
        <div>
          <Label htmlFor="billing_frequency">Billing Frequency</Label>
          <Select value={value.billing_frequency} onValueChange={(v) => onChange('billing_frequency', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="semiannual">Semi-Annual</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="policy_term">Policy Term</Label>
          <Select value={value.policy_term} onValueChange={(v) => onChange('policy_term', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semiannual">Semi-Annual (6 months)</SelectItem>
              <SelectItem value="annual">Annual (12 months)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="billing_method">Billing Method</Label>
          <Select value={value.billing_method} onValueChange={(v) => onChange('billing_method', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct_bill">Direct Bill</SelectItem>
              <SelectItem value="agency_bill">Agency Bill</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="effective_date">Effective Date *</Label>
          <Input
            id="effective_date"
            type="date"
            value={value.effective_date}
            onChange={(e) => onChange('effective_date', e.target.value)}
            className={errors.effective_date ? 'border-destructive' : ''}
          />
          {errors.effective_date && (
            <p className="text-sm text-destructive mt-1">{errors.effective_date}</p>
          )}
        </div>
        <div>
          <Label htmlFor="expiration_date">Expiration Date *</Label>
          <Input
            id="expiration_date"
            type="date"
            value={value.expiration_date}
            onChange={(e) => onChange('expiration_date', e.target.value)}
            className={errors.expiration_date ? 'border-destructive' : ''}
          />
          {errors.expiration_date && (
            <p className="text-sm text-destructive mt-1">{errors.expiration_date}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="status">Status *</Label>
        <Select value={value.status} onValueChange={(v) => onChange('status', v)}>
          <SelectTrigger className={errors.status ? 'border-destructive' : ''}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
            <SelectItem value="bound">Bound</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        {errors.status && (
          <p className="text-sm text-destructive mt-1">{errors.status}</p>
        )}
      </div>
    </>
  );
}
