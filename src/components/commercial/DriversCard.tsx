// ============================================================================
// DRIVERS CARD (Commercial Lines SOW v3, Phase 6 Business Auto)
// ============================================================================
// The account's driver roster for commercial auto: name, license (MASKED in
// display per the design-system non-negotiable, full value only inside the
// edit dialog), DOB (masked, date input in edit), experience, 3-year
// violation/accident counts, excluded flag. Feeds ACORD 127's driver
// schedule when that engine lands. Saves stamp provenance src='manual'.
// Calm Command: cc-* tokens, NO lime, cc-num tabular figures, no em or en
// dashes, content-shaped loading.
// ============================================================================

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  useCommercialDrivers,
  useDeleteCommercialDriver,
  useSaveCommercialDriver,
  type CommercialDriverInput,
} from '@/hooks/useCommercialFleet';
import { maskDln } from '@/components/cc/mask';
import type { CommercialDriver } from '@/types/commercial';

function num(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}

export function DriversCard({ accountId }: { accountId: string }) {
  const { data: drivers = [], isLoading } = useCommercialDrivers(accountId);
  const saveMutation = useSaveCommercialDriver();
  const deleteMutation = useDeleteCommercialDriver();

  const [editing, setEditing] = useState<CommercialDriver | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    const d = editing;
    const f: Record<string, string> = {};
    const put = (k: string, v: unknown) => { if (v != null) f[k] = String(v); };
    if (d) {
      put('first_name', d.first_name); put('last_name', d.last_name);
      put('date_of_birth', d.date_of_birth); put('license_number', d.license_number);
      put('license_state', d.license_state); put('years_licensed', d.years_licensed);
      put('hire_date', d.hire_date); put('violations_3yr', d.violations_3yr);
      put('accidents_3yr', d.accidents_3yr);
      setExcluded(!!d.excluded);
    } else {
      f.license_state = 'FL';
      setExcluded(false);
    }
    setForm(f);
  }, [dialogOpen, editing]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const changes: CommercialDriverInput = {
      first_name: form.first_name ?? '',
      last_name: form.last_name ?? '',
      date_of_birth: form.date_of_birth ?? '',
      license_number: (form.license_number ?? '').trim(),
      license_state: form.license_state ?? '',
      years_licensed: num(form.years_licensed ?? ''),
      hire_date: form.hire_date ?? '',
      violations_3yr: num(form.violations_3yr ?? ''),
      accidents_3yr: num(form.accidents_3yr ?? ''),
      excluded,
    };
    saveMutation.mutate(
      { accountId, existing: editing, changes },
      { onSuccess: () => { setDialogOpen(false); setEditing(null); } },
    );
  };

  const field = (id: string, label: string, opts?: { placeholder?: string; numeric?: boolean; type?: string }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`drv-${id}`} className="text-cc-text-secondary">{label}</Label>
      <Input
        id={`drv-${id}`}
        type={opts?.type}
        inputMode={opts?.numeric ? 'numeric' : undefined}
        placeholder={opts?.placeholder}
        value={form[id] ?? ''}
        onChange={(e) => set(id, e.target.value)}
      />
    </div>
  );

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-cc-text-primary">Drivers</h3>
          {drivers.length > 0 && (
            <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">
              {drivers.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="text-cc-text-secondary hover:text-cc-text-primary"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add driver
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-cc-md bg-cc-surface-raised" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <p className="py-4 text-center text-sm text-cc-text-muted">
          No drivers yet. The roster feeds auto quoting and the ACORD 127 driver schedule.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {drivers.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2.5 rounded-cc-md border border-cc-border-subtle px-3 py-2.5">
              <span className="text-sm text-cc-text-primary">
                {[d.first_name, d.last_name].filter(Boolean).join(' ') || '(no name)'}
              </span>
              {d.license_number && (
                <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  {maskDln(d.license_number)}{d.license_state ? ` ${d.license_state}` : ''}
                </span>
              )}
              {d.years_licensed != null && (
                <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">
                  {d.years_licensed} yrs
                </span>
              )}
              {(d.violations_3yr ?? 0) > 0 && (
                <span className="inline-flex items-center rounded-pill bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {d.violations_3yr} viol
                </span>
              )}
              {(d.accidents_3yr ?? 0) > 0 && (
                <span className="inline-flex items-center rounded-pill bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {d.accidents_3yr} acc
                </span>
              )}
              {d.excluded && (
                <span className="inline-flex items-center rounded-pill bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  excluded
                </span>
              )}
              <span className="ml-auto flex gap-1">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { setEditing(d); setDialogOpen(true); }}
                  className="text-cc-text-secondary hover:text-cc-text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => deleteMutation.mutate({ accountId, id: d.id })}
                  disabled={deleteMutation.isPending}
                  className="text-cc-text-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saveMutation.isPending) { setDialogOpen(o); if (!o) setEditing(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-cc-surface-raised sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">
              {editing ? 'Edit driver' : 'Add driver'}
            </DialogTitle>
            <DialogDescription className="text-cc-text-muted">
              License and date of birth stay masked outside this dialog.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('first_name', 'First name')}
            {field('last_name', 'Last name')}
            {field('date_of_birth', 'Date of birth', { type: 'date' })}
            {field('hire_date', 'Hire date', { type: 'date' })}
            {field('license_number', 'License number')}
            {field('license_state', 'License state')}
            {field('years_licensed', 'Years licensed', { numeric: true })}
            <div className="space-y-1.5">
              <Label className="text-cc-text-secondary">Last 3 years</Label>
              <div className="flex gap-2">
                <Input
                  aria-label="Violations in the last 3 years"
                  inputMode="numeric" placeholder="Viol"
                  value={form.violations_3yr ?? ''}
                  onChange={(e) => set('violations_3yr', e.target.value)}
                />
                <Input
                  aria-label="Accidents in the last 3 years"
                  inputMode="numeric" placeholder="Acc"
                  value={form.accidents_3yr ?? ''}
                  onChange={(e) => set('accidents_3yr', e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-cc-text-primary sm:col-span-2">
              <Checkbox checked={excluded} onCheckedChange={(v) => setExcluded(v === true)} />
              Excluded driver (named exclusion on the policy)
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditing(null); }} disabled={saveMutation.isPending}
              className="text-cc-text-secondary hover:text-cc-text-primary">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving' : 'Save driver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
