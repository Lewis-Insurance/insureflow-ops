// ============================================================================
// COTERIE QUOTE FORM (internal staff only, MOCK)
// ============================================================================
// Minimal commercial intake form for an existing account. Submitting calls the
// `coterie-quote` edge function which runs the Coterie adapter in mock mode.
// No client-facing action occurs — the result is for internal review only.
// ============================================================================

import React, { useMemo, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useCreateCoterieQuote } from '@/hooks/useCoterieQuote';
import {
  COMMERCIAL_LINES,
  GL_LIMIT_OPTIONS,
  type CommercialLine,
  type CommercialLocationType,
  type CoterieQuoteFormValues,
  type CoterieQuoteResponse,
} from '@/integrations/coterie/types';
import { CoterieQuoteResultCard } from './CoterieQuoteResultCard';

/** Risk-location type for the location derived from the mailing address. */
const LOCATION_TYPE_OPTIONS: { value: CommercialLocationType; label: string }[] = [
  { value: 'BuildingLeased', label: 'Leased space' },
  { value: 'BuildingOwned', label: 'Owned building' },
  { value: 'Home', label: 'Home-based' },
];

interface CoterieQuoteFormProps {
  accountId: string;
  defaultBusinessName?: string;
  onQuoted?: (response: CoterieQuoteResponse) => void;
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function CoterieQuoteForm({
  accountId,
  defaultBusinessName = '',
  onQuoted,
}: CoterieQuoteFormProps) {
  const createQuote = useCreateCoterieQuote();
  const [response, setResponse] = useState<CoterieQuoteResponse | null>(null);

  // Stable idempotency key per form instance — guards against double submits.
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `coterie-${Date.now()}`,
  );

  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [lines, setLines] = useState<CommercialLine[]>(['BOP']);
  const [glLimit, setGlLimit] = useState<number | undefined>(1000000);
  const [annualPayroll, setAnnualPayroll] = useState('');
  const [grossAnnualSales, setGrossAnnualSales] = useState('');
  const [numEmployees, setNumEmployees] = useState('');
  const [businessStartDate, setBusinessStartDate] = useState('');

  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [locationType, setLocationType] = useState<CommercialLocationType>('BuildingLeased');

  const showGlLimit = useMemo(() => lines.includes('GL') || lines.includes('BOP'), [lines]);

  const toggleLine = (line: CommercialLine) => {
    setLines((prev) =>
      prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    if (lines.length === 0) {
      toast({ title: 'Select at least one line', variant: 'destructive' });
      return;
    }
    if (!contactFirstName || !contactLastName || !contactEmail || !contactPhone) {
      toast({ title: 'Complete the contact section', variant: 'destructive' });
      return;
    }
    if (!street || !city || !state || !zip) {
      toast({ title: 'Complete the mailing address', variant: 'destructive' });
      return;
    }

    const values: CoterieQuoteFormValues = {
      accountId,
      lines,
      businessName: businessName.trim(),
      legalBusinessName: legalBusinessName.trim() || undefined,
      businessStartDate: businessStartDate || undefined,
      glLimit: showGlLimit ? glLimit : undefined,
      annualPayroll: toNumber(annualPayroll),
      grossAnnualSales: toNumber(grossAnnualSales),
      numEmployees: toNumber(numEmployees),
      contact: {
        firstName: contactFirstName.trim(),
        lastName: contactLastName.trim(),
        email: contactEmail.trim(),
        phone: contactPhone.trim(),
      },
      mailingAddress: {
        street: street.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zip: zip.trim(),
      },
      locationType,
      idempotencyKey: idempotencyKeyRef.current,
    };

    createQuote.mutate(values, {
      onSuccess: (data) => {
        setResponse(data);
        onQuoted?.(data);
        const decision = data.result?.status ?? 'unknown';
        toast({
          title: `Mock quote ${decision}`,
          description:
            decision === 'quoted'
              ? 'Created a pending approval gate for human review.'
              : 'Review the result below. No client-facing action was taken.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Quote request failed',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const startNewQuote = () => {
    idempotencyKeyRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `coterie-${Date.now()}`;
    setResponse(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            New Coterie commercial quote (mock)
          </CardTitle>
          <CardDescription>
            Internal only. Generates a mock quote from fixtures and opens an approval gate. No
            carrier call, bind, send, or payment occurs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Business */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business name *</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Acme Coffee Roasters"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legalBusinessName">Legal business name</Label>
                <Input
                  id="legalBusinessName"
                  value={legalBusinessName}
                  onChange={(e) => setLegalBusinessName(e.target.value)}
                  placeholder="Defaults to business name"
                />
              </div>
            </div>

            {/* Lines */}
            <div className="space-y-2">
              <Label>Lines of business *</Label>
              <div className="flex flex-wrap gap-4">
                {COMMERCIAL_LINES.map((line) => (
                  <label key={line.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={lines.includes(line.value)}
                      onCheckedChange={() => toggleLine(line.value)}
                    />
                    {line.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Financials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {showGlLimit && (
                <div className="space-y-1.5">
                  <Label>GL per-occurrence limit</Label>
                  <Select
                    value={glLimit ? String(glLimit) : undefined}
                    onValueChange={(v) => setGlLimit(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select limit" />
                    </SelectTrigger>
                    <SelectContent>
                      {GL_LIMIT_OPTIONS.map((limit) => (
                        <SelectItem key={limit} value={String(limit)}>
                          ${limit.toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="annualPayroll">Annual payroll</Label>
                <Input
                  id="annualPayroll"
                  inputMode="numeric"
                  value={annualPayroll}
                  onChange={(e) => setAnnualPayroll(e.target.value)}
                  placeholder="250000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grossAnnualSales">Gross annual sales</Label>
                <Input
                  id="grossAnnualSales"
                  inputMode="numeric"
                  value={grossAnnualSales}
                  onChange={(e) => setGrossAnnualSales(e.target.value)}
                  placeholder="800000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="numEmployees"># Employees</Label>
                <Input
                  id="numEmployees"
                  inputMode="numeric"
                  value={numEmployees}
                  onChange={(e) => setNumEmployees(e.target.value)}
                  placeholder="6"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessStartDate">Business start date</Label>
                <Input
                  id="businessStartDate"
                  type="date"
                  value={businessStartDate}
                  onChange={(e) => setBusinessStartDate(e.target.value)}
                />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Primary contact *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Input
                  value={contactFirstName}
                  onChange={(e) => setContactFirstName(e.target.value)}
                  placeholder="First name"
                  aria-label="Contact first name"
                />
                <Input
                  value={contactLastName}
                  onChange={(e) => setContactLastName(e.target.value)}
                  placeholder="Last name"
                  aria-label="Contact last name"
                />
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email"
                  aria-label="Contact email"
                />
                <Input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Phone"
                  aria-label="Contact phone"
                />
              </div>
            </div>

            {/* Mailing address */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mailing address *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Input
                  className="sm:col-span-2 lg:col-span-1"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Street"
                  aria-label="Street"
                />
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  aria-label="City"
                />
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  maxLength={2}
                  aria-label="State"
                />
                <Input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="ZIP"
                  aria-label="ZIP"
                />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="locationType">Primary location type</Label>
                <Select
                  value={locationType}
                  onValueChange={(v) => setLocationType(v as CommercialLocationType)}
                >
                  <SelectTrigger id="locationType" aria-label="Primary location type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for the risk location derived from the mailing address.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={createQuote.isPending}>
                {createQuote.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Generate mock quote
              </Button>
              {response && (
                <Button type="button" variant="outline" onClick={startNewQuote}>
                  Start new quote
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Tip: include “decline” or “invalid” in the business name to preview those states.
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {response?.result && (
        <CoterieQuoteResultCard
          result={response.result}
          rawPayload={response.result}
          mock={response.mock}
        />
      )}
    </div>
  );
}

export default CoterieQuoteForm;
