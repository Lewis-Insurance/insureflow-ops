// ============================================================================
// WORKERS COMP CARD (Commercial Lines SOW v3, Phase 4)
// ============================================================================
// The account's WC exposure: experience mod (stored on the commercial
// profile), class/payroll rows with a seeded FL class-code picker (free
// entry allowed - the reference list is a helper, not a gate), and the FL
// DWC exemption roster with expiry warnings. Payroll figures are the PII
// posture's quiet zone: shown to staff, never sent to AI unredacted.
// Calm Command: cc-* tokens, NO lime, cc-num tabular, no em or en dashes.
// ============================================================================

import { useMemo, useState } from 'react';
import { HardHat, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useDeleteWcClass, useDeleteWcExemption, useSaveWcClass, useSaveWcExemption,
  useWcClassCodes, useWcClasses, useWcExemptions,
} from '@/hooks/useWorkersComp';
import { useCommercialProfile, useSaveCommercialProfile } from '@/hooks/useCommercialProfile';

const money = (n: number | string | null | undefined): string =>
  n == null || n === '' ? '' : `$${Number(n).toLocaleString('en-US')}`;

const num = (raw: string): number | null => {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
};

const isoToUs = (iso: string | null): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
};

export function WorkersCompCard({ accountId }: { accountId: string }) {
  const { data: classes = [] } = useWcClasses(accountId);
  const { data: exemptions = [] } = useWcExemptions(accountId);
  const { data: classCodes = [] } = useWcClassCodes();
  const profileQuery = useCommercialProfile(accountId);
  const profile = profileQuery.data ?? null;
  const saveClass = useSaveWcClass();
  const deleteClass = useDeleteWcClass();
  const saveExemption = useSaveWcExemption();
  const deleteExemption = useDeleteWcExemption();
  const saveProfile = useSaveCommercialProfile();

  // Add-class inline form.
  const [cCode, setCCode] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cEmployees, setCEmployees] = useState('');
  const [cPayroll, setCPayroll] = useState('');

  // Add-exemption inline form.
  const [eName, setEName] = useState('');
  const [eNumber, setENumber] = useState('');
  const [eScope, setEScope] = useState<'construction' | 'non_construction' | ''>('');
  const [eExpires, setEExpires] = useState('');

  // X-mod inline edit.
  const [xmod, setXmod] = useState('');
  const [xmodEff, setXmodEff] = useState('');
  const [xmodEditing, setXmodEditing] = useState(false);

  const totalPayroll = useMemo(
    () => classes.reduce((sum, c) => sum + (Number(c.annual_payroll) || 0), 0),
    [classes],
  );

  const handleCodePick = (code: string) => {
    setCCode(code);
    const match = classCodes.find((c) => c.code === code);
    if (match && !cDesc.trim()) setCDesc(match.description);
  };

  const handleAddClass = () => {
    if (!cCode.trim()) {
      toast.error('Enter the class code.');
      return;
    }
    saveClass.mutate(
      {
        accountId,
        existing: null,
        changes: {
          state: 'FL',
          class_code: cCode.trim(),
          class_description: cDesc.trim() || null,
          employee_count: num(cEmployees),
          annual_payroll: num(cPayroll),
        },
      },
      { onSuccess: () => { setCCode(''); setCDesc(''); setCEmployees(''); setCPayroll(''); } },
    );
  };

  const handleAddExemption = () => {
    if (!eName.trim()) {
      toast.error('Enter the exempt person\'s name.');
      return;
    }
    saveExemption.mutate(
      {
        accountId,
        existing: null,
        changes: {
          person_name: eName.trim(),
          exemption_number: eNumber.trim() || null,
          scope: eScope || null,
          expiration_date: eExpires || null,
        },
      },
      { onSuccess: () => { setEName(''); setENumber(''); setEScope(''); setEExpires(''); } },
    );
  };

  const handleSaveXmod = () => {
    saveProfile.mutate(
      {
        accountId,
        existing: profile,
        changes: {
          wc_experience_mod: num(xmod),
          wc_experience_mod_effective: xmodEff || null,
        },
      },
      { onSuccess: () => setXmodEditing(false) },
    );
  };

  const exemptionTone = (exp: string | null): { label: string; cls: string } | null => {
    if (!exp) return null;
    const days = Math.floor((new Date(exp).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: 'expired', cls: 'bg-destructive/10 text-destructive' };
    if (days <= 60) return { label: `expires in ${days}d`, cls: 'bg-warning/10 text-warning' };
    return null;
  };

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardHat className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-cc-text-primary">Workers comp</h3>
        </div>
        {/* Experience mod block */}
        {xmodEditing ? (
          <span className="flex items-center gap-2">
            <Input className="w-20" inputMode="decimal" placeholder="1.00" value={xmod} onChange={(e) => setXmod(e.target.value)} aria-label="Experience mod" />
            <Input className="w-36" type="date" value={xmodEff} onChange={(e) => setXmodEff(e.target.value)} aria-label="Experience mod effective date" />
            <Button size="sm" onClick={handleSaveXmod} disabled={saveProfile.isPending}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setXmodEditing(false)} className="text-cc-text-muted">Cancel</Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setXmod(profile?.wc_experience_mod != null ? String(profile.wc_experience_mod) : '');
              setXmodEff(profile?.wc_experience_mod_effective ?? '');
              setXmodEditing(true);
            }}
            className="text-sm text-cc-text-secondary underline-offset-4 hover:text-cc-text-primary hover:underline"
          >
            x-mod{' '}
            <span className="cc-num [font-variant-numeric:tabular-nums]">
              {profile?.wc_experience_mod != null ? String(profile.wc_experience_mod) : 'not set'}
            </span>
            {profile?.wc_experience_mod_effective && (
              <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">
                {' '}eff {isoToUs(profile.wc_experience_mod_effective)}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Class / payroll rows */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-semibold text-cc-text-primary">
            Classes and payroll
          </h4>
          {classes.length > 0 && (
            <span className="cc-num text-sm text-cc-text-secondary [font-variant-numeric:tabular-nums]">
              total {money(totalPayroll)}
            </span>
          )}
        </div>
        {classes.length > 0 && (
          <ul className="space-y-1">
            {classes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-2.5 text-sm">
                <span className="cc-num font-medium text-cc-text-primary [font-variant-numeric:tabular-nums]">{c.class_code}</span>
                <span className="text-cc-text-secondary">{c.class_description}</span>
                {c.employee_count != null && (
                  <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">{c.employee_count} empl</span>
                )}
                {c.annual_payroll != null && (
                  <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">{money(c.annual_payroll)}</span>
                )}
                <Button
                  variant="ghost" size="sm"
                  onClick={() => deleteClass.mutate({ accountId, id: c.id })}
                  disabled={deleteClass.isPending}
                  className="ml-auto h-6 px-1.5 text-cc-text-muted hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[8rem_1fr_7rem_9rem_auto]">
          <div>
            <Input
              placeholder="Code"
              list="wc-class-codes"
              value={cCode}
              onChange={(e) => handleCodePick(e.target.value)}
              aria-label="WC class code"
            />
            <datalist id="wc-class-codes">
              {classCodes.map((c) => (
                <option key={`${c.code}-${c.state}`} value={c.code}>{c.description}</option>
              ))}
            </datalist>
          </div>
          <Input placeholder="Description" value={cDesc} onChange={(e) => setCDesc(e.target.value)} aria-label="Class description" />
          <Input placeholder="Empl" inputMode="numeric" value={cEmployees} onChange={(e) => setCEmployees(e.target.value)} aria-label="Employee count" />
          <Input placeholder="Annual payroll" inputMode="numeric" value={cPayroll} onChange={(e) => setCPayroll(e.target.value)} aria-label="Annual payroll" />
          <Button variant="ghost" onClick={handleAddClass} disabled={saveClass.isPending}
            className="text-cc-text-secondary hover:text-cc-text-primary">
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add
          </Button>
        </div>
      </div>

      {/* FL exemptions */}
      <div className="mt-5 space-y-2">
        <h4 className="text-sm font-semibold text-cc-text-primary">
          FL exemptions <span className="font-normal text-cc-text-muted">(DWC officer/member exemptions)</span>
        </h4>
        {exemptions.length > 0 && (
          <ul className="space-y-1">
            {exemptions.map((x) => {
              const tone = exemptionTone(x.expiration_date);
              return (
                <li key={x.id} className="flex flex-wrap items-baseline gap-2.5 text-sm">
                  <span className="text-cc-text-primary">{x.person_name}</span>
                  {x.exemption_number && (
                    <span className="cc-num text-cc-text-muted [font-variant-numeric:tabular-nums]">{x.exemption_number}</span>
                  )}
                  {x.scope && <span className="text-xs text-cc-text-muted">{x.scope === 'construction' ? 'construction' : 'non-construction'}</span>}
                  {x.expiration_date && (
                    <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">
                      exp {isoToUs(x.expiration_date)}
                    </span>
                  )}
                  {tone && (
                    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium ${tone.cls}`}>
                      {tone.label}
                    </span>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => deleteExemption.mutate({ accountId, id: x.id })}
                    disabled={deleteExemption.isPending}
                    className="ml-auto h-6 px-1.5 text-cc-text-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_9rem_11rem_10rem_auto]">
          <Input placeholder="Exempt person" value={eName} onChange={(e) => setEName(e.target.value)} aria-label="Exempt person name" />
          <Input placeholder="Exemption #" value={eNumber} onChange={(e) => setENumber(e.target.value)} aria-label="Exemption number" />
          <Select value={eScope || undefined} onValueChange={(v) => setEScope(v as 'construction' | 'non_construction')}>
            <SelectTrigger aria-label="Exemption scope"><SelectValue placeholder="Scope" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="construction">Construction</SelectItem>
              <SelectItem value="non_construction">Non-construction</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={eExpires} onChange={(e) => setEExpires(e.target.value)} aria-label="Exemption expiration" />
          <Button variant="ghost" onClick={handleAddExemption} disabled={saveExemption.isPending}
            className="text-cc-text-secondary hover:text-cc-text-primary">
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add
          </Button>
        </div>
        <p className="text-xs text-cc-text-muted">
          An expired construction exemption is an audit exposure; record renewals as they arrive.
        </p>
      </div>
    </div>
  );
}
