// ============================================================================
// LOCATIONS CARD (Commercial Lines SOW v3, Phase 3 Property - COPE editor)
// ============================================================================
// The account's commercial locations: full COPE capture with the Florida
// emphasis (wind/hail deductible, flood zone, roof and system update years).
// List + add/edit dialog grouped Address / Construction / Protection /
// Values. Saves stamp per-field provenance src='manual' (machine feeders
// stage suggestions elsewhere). Feeds ACORD 140/125 (Phase 3b) and property
// quoting; locations also serve as garaging targets for the fleet (Phase 6).
// Calm Command: cc-* tokens, NO lime, cc-num tabular figures, no em or en
// dashes, content-shaped loading.
// ============================================================================

import { useEffect, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useCommercialLocations,
  useDeleteCommercialLocation,
  useSaveCommercialLocation,
  type CommercialLocationInput,
} from '@/hooks/useCommercialLocations';
import type { CommercialLocation } from '@/types/commercial';

const CONSTRUCTION_TYPES = [
  'Frame', 'Joisted Masonry', 'Non-Combustible', 'Masonry Non-Combustible',
  'Modified Fire Resistive', 'Fire Resistive',
];

const money = (n: number | null | undefined): string =>
  n == null ? '' : `$${Number(n).toLocaleString('en-US')}`;

function num(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}

export function LocationsCard({ accountId }: { accountId: string }) {
  const { data: locations = [], isLoading } = useCommercialLocations(accountId);
  const saveMutation = useSaveCommercialLocation();
  const deleteMutation = useDeleteCommercialLocation();

  const [editing, setEditing] = useState<CommercialLocation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [sprinklered, setSprinklered] = useState(false);

  // Seed the dialog form from the row being edited (or blank for add).
  useEffect(() => {
    if (!dialogOpen) return;
    const l = editing;
    const f: Record<string, string> = {};
    const put = (k: string, v: unknown) => { if (v != null) f[k] = String(v); };
    if (l) {
      put('location_number', l.location_number); put('address_line1', l.address_line1);
      put('address_line2', l.address_line2); put('city', l.city); put('state', l.state);
      put('zip', l.zip); put('county', l.county); put('interest', l.interest);
      put('occupancy', l.occupancy); put('construction_type', l.construction_type);
      put('year_built', l.year_built); put('square_footage', l.square_footage);
      put('stories', l.stories); put('sprinkler_coverage_pct', l.sprinkler_coverage_pct);
      put('alarm_type', l.alarm_type); put('roof_type', l.roof_type);
      put('roof_update_year', l.roof_update_year); put('wiring_update_year', l.wiring_update_year);
      put('plumbing_update_year', l.plumbing_update_year); put('heating_update_year', l.heating_update_year);
      put('building_value', l.building_value); put('bpp_value', l.bpp_value);
      put('business_income_value', l.business_income_value);
      put('property_deductible', l.property_deductible); put('wind_hail_deductible', l.wind_hail_deductible);
      put('flood_zone', l.flood_zone);
      setSprinklered(!!l.sprinklered);
    } else {
      f.state = 'FL';
      setSprinklered(false);
    }
    setForm(f);
  }, [dialogOpen, editing]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const changes: CommercialLocationInput = {
      location_number: num(form.location_number ?? ''),
      address_line1: form.address_line1 ?? '',
      address_line2: form.address_line2 ?? '',
      city: form.city ?? '',
      state: form.state ?? '',
      zip: form.zip ?? '',
      county: form.county ?? '',
      interest: form.interest ?? '',
      occupancy: form.occupancy ?? '',
      construction_type: form.construction_type ?? '',
      year_built: num(form.year_built ?? ''),
      square_footage: num(form.square_footage ?? ''),
      stories: num(form.stories ?? ''),
      sprinklered,
      sprinkler_coverage_pct: num(form.sprinkler_coverage_pct ?? ''),
      alarm_type: form.alarm_type ?? '',
      roof_type: form.roof_type ?? '',
      roof_update_year: num(form.roof_update_year ?? ''),
      wiring_update_year: num(form.wiring_update_year ?? ''),
      plumbing_update_year: num(form.plumbing_update_year ?? ''),
      heating_update_year: num(form.heating_update_year ?? ''),
      building_value: num(form.building_value ?? ''),
      bpp_value: num(form.bpp_value ?? ''),
      business_income_value: num(form.business_income_value ?? ''),
      property_deductible: form.property_deductible ?? '',
      wind_hail_deductible: form.wind_hail_deductible ?? '',
      flood_zone: form.flood_zone ?? '',
    };
    saveMutation.mutate(
      { accountId, existing: editing, changes },
      { onSuccess: () => { setDialogOpen(false); setEditing(null); } },
    );
  };

  const field = (id: string, label: string, opts?: { placeholder?: string; numeric?: boolean; span2?: boolean }) => (
    <div className={`space-y-1.5 ${opts?.span2 ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={`loc-${id}`} className="text-cc-text-secondary">{label}</Label>
      <Input
        id={`loc-${id}`}
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
          <MapPin className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-cc-text-primary">Locations</h3>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="text-cc-text-secondary hover:text-cc-text-primary"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add location
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-cc-md bg-cc-surface-raised" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <p className="py-4 text-center text-sm text-cc-text-muted">
          No locations yet. Property quoting and the ACORD packet start here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {locations.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2.5 rounded-cc-md border border-cc-border-subtle px-3 py-2.5">
              {l.location_number != null && (
                <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">#{l.location_number}</span>
              )}
              <span className="text-sm text-cc-text-primary">
                {[l.address_line1, l.city, l.state].filter(Boolean).join(', ') || '(no address)'}
              </span>
              {l.construction_type && <span className="text-xs text-cc-text-muted">{l.construction_type}</span>}
              {l.year_built != null && (
                <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">built {l.year_built}</span>
              )}
              {l.building_value != null && (
                <span className="cc-num text-xs text-cc-text-secondary [font-variant-numeric:tabular-nums]">bldg {money(l.building_value)}</span>
              )}
              {l.flood_zone && (
                <span className="inline-flex items-center rounded-pill bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  flood {l.flood_zone}
                </span>
              )}
              <span className="ml-auto flex gap-1">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { setEditing(l); setDialogOpen(true); }}
                  className="text-cc-text-secondary hover:text-cc-text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => deleteMutation.mutate({ accountId, locationId: l.id })}
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

      {/* Add / edit dialog: Address -> Construction -> Protection -> Values */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saveMutation.isPending) { setDialogOpen(o); if (!o) setEditing(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-cc-surface-raised sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">
              {editing ? 'Edit location' : 'Add location'}
            </DialogTitle>
            <DialogDescription className="text-cc-text-muted">
              Full COPE detail feeds property quoting, the ACORD packet, and wind/flood
              placement. Fill what you know; everything is editable later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Address</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field('location_number', 'Location #', { numeric: true })}
                {field('interest', 'Interest (owner / tenant)')}
                {field('address_line1', 'Address line 1', { span2: true })}
                {field('address_line2', 'Address line 2', { span2: true })}
                {field('city', 'City')}
                {field('state', 'State')}
                {field('zip', 'ZIP')}
                {field('county', 'County')}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Construction and occupancy</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-cc-text-secondary">Construction type</Label>
                  <Select value={form.construction_type ?? undefined} onValueChange={(v) => set('construction_type', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {CONSTRUCTION_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field('occupancy', 'Occupancy (what happens here)')}
                {field('year_built', 'Year built', { numeric: true })}
                {field('square_footage', 'Square footage', { numeric: true })}
                {field('stories', 'Stories', { numeric: true })}
                {field('roof_type', 'Roof type')}
                {field('roof_update_year', 'Roof updated (year)', { numeric: true })}
                {field('wiring_update_year', 'Wiring updated (year)', { numeric: true })}
                {field('plumbing_update_year', 'Plumbing updated (year)', { numeric: true })}
                {field('heating_update_year', 'HVAC updated (year)', { numeric: true })}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Protection</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 pt-6 text-sm text-cc-text-primary">
                  <Checkbox checked={sprinklered} onCheckedChange={(v) => setSprinklered(v === true)} />
                  Sprinklered
                </label>
                {field('sprinkler_coverage_pct', 'Sprinkler coverage %', { numeric: true })}
                {field('alarm_type', 'Alarm (central / local / none)')}
                {field('flood_zone', 'Flood zone', { placeholder: 'X, AE, VE...' })}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Values and deductibles</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field('building_value', 'Building value', { numeric: true })}
                {field('bpp_value', 'Business personal property', { numeric: true })}
                {field('business_income_value', 'Business income', { numeric: true })}
                {field('property_deductible', 'AOP deductible', { placeholder: '2500' })}
                {field('wind_hail_deductible', 'Wind/hail deductible', { placeholder: '2% or 5000' })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditing(null); }} disabled={saveMutation.isPending}
              className="text-cc-text-secondary hover:text-cc-text-primary">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving' : 'Save location'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
