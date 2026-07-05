// ============================================================================
// COMMERCIAL PROFILE CARD (Commercial Lines SOW v3 Phase 1, Path A + B intake)
// ============================================================================
// The account's business profile: legal identity (feeds ACORD 125 + Sunbiz
// prefill in Phase 2), operations description, size/revenue, WC x-mod.
// Read view by default (FEIN masked per constitution.md); Edit toggles the
// form. Saves through useSaveCommercialProfile, which stamps field-level
// provenance src='manual' for changed fields only.
//
// Calm Command: cc-* tokens both themes, NO lime in this card (the customer
// record's action hierarchy is owned elsewhere), tabular figures, no em or
// en dashes.
// ============================================================================

import { useEffect, useState } from 'react';
import { Building2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { maskTaxId } from '@/components/cc/mask';
import {
  useCommercialProfile,
  useSaveCommercialProfile,
  type CommercialProfileInput,
} from '@/hooks/useCommercialProfile';

const ENTITY_TYPES = [
  'individual', 'partnership', 'corporation', 'llc', 'joint_venture', 'trust', 'other',
] as const;

const ENTITY_LABEL: Record<string, string> = {
  individual: 'Individual', partnership: 'Partnership', corporation: 'Corporation',
  llc: 'LLC', joint_venture: 'Joint venture', trust: 'Trust', other: 'Other',
};

function ReadField({ label, value, num }: { label: string; value: string | null; num?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium text-cc-text-muted">{label}</div>
      <div className={`text-sm text-cc-text-primary ${num ? 'cc-num [font-variant-numeric:tabular-nums]' : ''}`}>
        {value && value.trim() !== '' ? value : <span className="text-cc-text-muted">Not set</span>}
      </div>
    </div>
  );
}

export function CommercialProfileCard({ accountId }: { accountId: string }) {
  const { data: profile, isLoading } = useCommercialProfile(accountId);
  const saveMutation = useSaveCommercialProfile();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CommercialProfileInput>({});

  // Seed the form each time editing opens (or the profile refreshes underneath).
  useEffect(() => {
    if (editing) {
      setForm({
        legal_name: profile?.legal_name ?? '',
        dba: profile?.dba ?? '',
        fein: profile?.fein ?? '',
        entity_type: profile?.entity_type ?? null,
        naics_code: profile?.naics_code ?? '',
        description_of_operations: profile?.description_of_operations ?? '',
        years_in_business: profile?.years_in_business ?? null,
        employee_count: profile?.employee_count ?? null,
        annual_revenue: profile?.annual_revenue ?? null,
        website: profile?.website ?? '',
        wc_experience_mod: profile?.wc_experience_mod ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const set = (key: keyof CommercialProfileInput, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const numOrNull = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = () => {
    saveMutation.mutate(
      { accountId, existing: profile ?? null, changes: form },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-cc-text-primary">Business profile</h3>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="text-cc-text-secondary hover:text-cc-text-primary"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {profile ? 'Edit' : 'Add details'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-cc-md bg-cc-surface-raised" />
          ))}
        </div>
      ) : !editing ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <ReadField label="Legal name" value={profile?.legal_name ?? null} />
          <ReadField label="DBA" value={profile?.dba ?? null} />
          <ReadField label="FEIN" value={profile?.fein ? maskTaxId(profile.fein) : null} num />
          <ReadField label="Entity type" value={profile?.entity_type ? ENTITY_LABEL[profile.entity_type] ?? profile.entity_type : null} />
          <ReadField label="NAICS" value={profile?.naics_code ?? null} num />
          <ReadField label="Years in business" value={profile?.years_in_business != null ? String(profile.years_in_business) : null} num />
          <ReadField label="Employees" value={profile?.employee_count != null ? String(profile.employee_count) : null} num />
          <ReadField label="Annual revenue" value={profile?.annual_revenue != null ? `$${Number(profile.annual_revenue).toLocaleString('en-US')}` : null} num />
          <ReadField label="WC experience mod" value={profile?.wc_experience_mod != null ? String(profile.wc_experience_mod) : null} num />
          <div className="col-span-2 md:col-span-3">
            <ReadField label="Description of operations" value={profile?.description_of_operations ?? null} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-legal" className="text-cc-text-secondary">Legal name</Label>
              <Input id="cp-legal" value={(form.legal_name as string) ?? ''} onChange={(e) => set('legal_name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-dba" className="text-cc-text-secondary">DBA</Label>
              <Input id="cp-dba" value={(form.dba as string) ?? ''} onChange={(e) => set('dba', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-fein" className="text-cc-text-secondary">FEIN</Label>
              <Input id="cp-fein" autoComplete="off" placeholder="12-3456789" value={(form.fein as string) ?? ''} onChange={(e) => set('fein', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-cc-text-secondary">Entity type</Label>
              <Select
                value={(form.entity_type as string) ?? undefined}
                onValueChange={(v) => set('entity_type', v)}
              >
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{ENTITY_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-naics" className="text-cc-text-secondary">NAICS code</Label>
              <Input id="cp-naics" value={(form.naics_code as string) ?? ''} onChange={(e) => set('naics_code', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-years" className="text-cc-text-secondary">Years in business</Label>
              <Input id="cp-years" inputMode="numeric" value={form.years_in_business ?? ''} onChange={(e) => set('years_in_business', numOrNull(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-emp" className="text-cc-text-secondary">Employees</Label>
              <Input id="cp-emp" inputMode="numeric" value={form.employee_count ?? ''} onChange={(e) => set('employee_count', numOrNull(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-rev" className="text-cc-text-secondary">Annual revenue</Label>
              <Input id="cp-rev" inputMode="numeric" value={form.annual_revenue ?? ''} onChange={(e) => set('annual_revenue', numOrNull(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-xmod" className="text-cc-text-secondary">WC experience mod</Label>
              <Input id="cp-xmod" inputMode="decimal" placeholder="1.00" value={form.wc_experience_mod ?? ''} onChange={(e) => set('wc_experience_mod', numOrNull(e.target.value))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="cp-web" className="text-cc-text-secondary">Website</Label>
              <Input id="cp-web" value={(form.website as string) ?? ''} onChange={(e) => set('website', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-ops" className="text-cc-text-secondary">Description of operations</Label>
            <Textarea id="cp-ops" rows={3} value={(form.description_of_operations as string) ?? ''} onChange={(e) => set('description_of_operations', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving' : 'Save profile'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saveMutation.isPending}
              className="text-cc-text-secondary hover:text-cc-text-primary">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
