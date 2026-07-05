// ============================================================================
// FLEET CARD (Commercial Lines SOW v3, Phase 6 Business Auto)
// ============================================================================
// The account's scheduled vehicles: identity (VIN with one-click NHTSA
// decode), operation (use, radius), values/deductibles, ownership and
// lienholder, garaging link to a commercial location. Feeds ACORD 127 and
// the umbrella underlying schedule (131) when those engines land; garaging
// links are cross-account guarded in the DB. VIN decode fills stamp
// provenance src='extracted' (manual re-edit reclaims); everything else
// saves src='manual'. Calm Command: cc-* tokens, NO lime, cc-num tabular
// figures, no em or en dashes, content-shaped loading.
// ============================================================================

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Sparkles, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useCommercialVehicles,
  useDeleteCommercialVehicle,
  useSaveCommercialVehicle,
  type CommercialVehicleInput,
} from '@/hooks/useCommercialFleet';
import { useCommercialLocations } from '@/hooks/useCommercialLocations';
import { decodeVin, isEmptyDecode, isLikelyVin } from '@/lib/commercial/vinDecode';
import type { CommercialVehicle } from '@/types/commercial';

const VEHICLE_TYPES = ['Truck', 'Tractor', 'Trailer', 'Van', 'Pickup', 'Private Passenger', 'Other'];
const OWNERSHIP = ['owned', 'leased', 'financed'];

const money = (n: number | null | undefined): string =>
  n == null ? '' : `$${Number(n).toLocaleString('en-US')}`;

function num(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}

const NO_GARAGE = 'none';

export function FleetCard({ accountId }: { accountId: string }) {
  const { data: vehicles = [], isLoading } = useCommercialVehicles(accountId);
  const { data: locations = [] } = useCommercialLocations(accountId);
  const saveMutation = useSaveCommercialVehicle();
  const deleteMutation = useDeleteCommercialVehicle();

  const [editing, setEditing] = useState<CommercialVehicle | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  // Fields the VIN decode filled and the user has not retyped since: those
  // save with provenance src='extracted' so a later manual edit reclaims.
  const [decodedFields, setDecodedFields] = useState<Set<string>>(new Set());
  const [decoding, setDecoding] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    const v = editing;
    const f: Record<string, string> = {};
    const put = (k: string, val: unknown) => { if (val != null) f[k] = String(val); };
    if (v) {
      put('unit_number', v.unit_number); put('vin', v.vin); put('year', v.year);
      put('make', v.make); put('model', v.model); put('vehicle_type', v.vehicle_type);
      put('body_type', v.body_type); put('gvwr', v.gvwr);
      put('radius_of_operation', v.radius_of_operation); put('vehicle_use', v.vehicle_use);
      put('cost_new', v.cost_new); put('stated_value', v.stated_value);
      put('comprehensive_deductible', v.comprehensive_deductible);
      put('collision_deductible', v.collision_deductible);
      put('ownership', v.ownership); put('lienholder_name', v.lienholder_name);
      put('lienholder_address', v.lienholder_address);
      put('garaging_location_id', v.garaging_location_id);
    }
    setForm(f);
    setDecodedFields(new Set());
  }, [dialogOpen, editing]);

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // A manual keystroke on a decoded field reclaims it for src='manual'.
    setDecodedFields((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  };

  const handleDecode = async () => {
    const vin = (form.vin ?? '').trim();
    if (!isLikelyVin(vin)) {
      toast.error('Enter the full 17-character VIN first.');
      return;
    }
    setDecoding(true);
    try {
      const decoded = await decodeVin(vin);
      if (isEmptyDecode(decoded)) {
        toast.info('The VIN decoded to nothing usable; enter the details manually.');
        return;
      }
      const filled = new Set<string>();
      setForm((f) => {
        const next = { ...f };
        const fill = (k: string, val: string | number | null) => {
          if (val == null) return;
          next[k] = String(val);
          filled.add(k);
        };
        fill('year', decoded.year); fill('make', decoded.make); fill('model', decoded.model);
        fill('body_type', decoded.body_type); fill('vehicle_type', decoded.vehicle_type);
        fill('gvwr', decoded.gvwr);
        return next;
      });
      setDecodedFields((prev) => new Set([...prev, ...filled]));
      toast.success('VIN decoded; review the filled fields.');
    } catch (e) {
      toast.error(`VIN decode failed: ${e instanceof Error ? e.message : 'network error'}`);
    } finally {
      setDecoding(false);
    }
  };

  const handleSave = () => {
    const changes: CommercialVehicleInput = {
      unit_number: form.unit_number ?? '',
      vin: (form.vin ?? '').trim().toUpperCase(),
      year: num(form.year ?? ''),
      make: form.make ?? '',
      model: form.model ?? '',
      vehicle_type: form.vehicle_type ?? '',
      body_type: form.body_type ?? '',
      gvwr: num(form.gvwr ?? ''),
      radius_of_operation: form.radius_of_operation ?? '',
      vehicle_use: form.vehicle_use ?? '',
      cost_new: num(form.cost_new ?? ''),
      stated_value: num(form.stated_value ?? ''),
      comprehensive_deductible: form.comprehensive_deductible ?? '',
      collision_deductible: form.collision_deductible ?? '',
      ownership: form.ownership ?? '',
      lienholder_name: form.lienholder_name ?? '',
      lienholder_address: form.lienholder_address ?? '',
      garaging_location_id: form.garaging_location_id && form.garaging_location_id !== NO_GARAGE
        ? form.garaging_location_id : null,
    };
    const sources: Partial<Record<keyof CommercialVehicleInput, 'extracted'>> = {};
    for (const k of decodedFields) sources[k as keyof CommercialVehicleInput] = 'extracted';
    saveMutation.mutate(
      { accountId, existing: editing, changes, sources },
      { onSuccess: () => { setDialogOpen(false); setEditing(null); } },
    );
  };

  const field = (id: string, label: string, opts?: { placeholder?: string; numeric?: boolean; span2?: boolean }) => (
    <div className={`space-y-1.5 ${opts?.span2 ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={`veh-${id}`} className="text-cc-text-secondary">{label}</Label>
      <Input
        id={`veh-${id}`}
        inputMode={opts?.numeric ? 'numeric' : undefined}
        placeholder={opts?.placeholder}
        value={form[id] ?? ''}
        onChange={(e) => set(id, e.target.value)}
      />
    </div>
  );

  const locationLabel = (id: string | null): string | null => {
    if (!id) return null;
    const l = locations.find((x) => x.id === id);
    if (!l) return null;
    return [l.address_line1, l.city].filter(Boolean).join(', ') || `Location ${l.location_number ?? ''}`;
  };

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-cc-text-primary">Fleet</h3>
          {vehicles.length > 0 && (
            <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">
              {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="text-cc-text-secondary hover:text-cc-text-primary"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add vehicle
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-cc-md bg-cc-surface-raised" />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <p className="py-4 text-center text-sm text-cc-text-muted">
          No vehicles yet. The fleet schedule feeds auto quoting, ACORD 127, and the umbrella underlying schedule.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {vehicles.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2.5 rounded-cc-md border border-cc-border-subtle px-3 py-2.5">
              {v.unit_number && (
                <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">#{v.unit_number}</span>
              )}
              <span className="text-sm text-cc-text-primary">
                {[v.year, v.make, v.model].filter(Boolean).join(' ') || '(no description)'}
              </span>
              {v.vin && (
                <span className="cc-num text-xs text-cc-text-muted [font-variant-numeric:tabular-nums]">{v.vin}</span>
              )}
              {v.vehicle_type && <span className="text-xs text-cc-text-muted">{v.vehicle_type}</span>}
              {v.stated_value != null && (
                <span className="cc-num text-xs text-cc-text-secondary [font-variant-numeric:tabular-nums]">
                  value {money(v.stated_value)}
                </span>
              )}
              {locationLabel(v.garaging_location_id) && (
                <span className="text-xs text-cc-text-muted">garaged {locationLabel(v.garaging_location_id)}</span>
              )}
              <span className="ml-auto flex gap-1">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { setEditing(v); setDialogOpen(true); }}
                  className="text-cc-text-secondary hover:text-cc-text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => deleteMutation.mutate({ accountId, id: v.id })}
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

      {/* Add / edit dialog: Identity -> Operation -> Values -> Ownership */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saveMutation.isPending) { setDialogOpen(o); if (!o) setEditing(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-cc-surface-raised sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-cc-text-primary">
              {editing ? 'Edit vehicle' : 'Add vehicle'}
            </DialogTitle>
            <DialogDescription className="text-cc-text-muted">
              Decode the VIN to fill identity fields, then complete operation and values.
              The schedule feeds auto quoting and the ACORD packet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Identity</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="veh-vin" className="text-cc-text-secondary">VIN</Label>
                  <div className="flex gap-2">
                    <Input
                      id="veh-vin"
                      className="cc-num uppercase [font-variant-numeric:tabular-nums]"
                      placeholder="17 characters"
                      value={form.vin ?? ''}
                      onChange={(e) => set('vin', e.target.value)}
                    />
                    <Button
                      type="button" variant="ghost" onClick={handleDecode}
                      disabled={decoding || !isLikelyVin(form.vin ?? '')}
                      className="shrink-0 text-cc-text-secondary hover:text-cc-text-primary"
                    >
                      {decoding ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Decode
                    </Button>
                  </div>
                </div>
                {field('unit_number', 'Unit #')}
                {field('year', 'Year', { numeric: true })}
                {field('make', 'Make')}
                {field('model', 'Model')}
                <div className="space-y-1.5">
                  <Label className="text-cc-text-secondary">Vehicle type</Label>
                  <Select value={form.vehicle_type ?? undefined} onValueChange={(v) => set('vehicle_type', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                      {form.vehicle_type && !VEHICLE_TYPES.includes(form.vehicle_type) && (
                        <SelectItem value={form.vehicle_type}>{form.vehicle_type}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {field('body_type', 'Body type')}
                {field('gvwr', 'GVWR (lbs)', { numeric: true })}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Operation</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field('vehicle_use', 'Use', { placeholder: 'service, delivery, hauling...' })}
                {field('radius_of_operation', 'Radius of operation', { placeholder: '0-50 mi local' })}
                <div className="space-y-1.5">
                  <Label className="text-cc-text-secondary">Garaged at</Label>
                  <Select
                    value={form.garaging_location_id || NO_GARAGE}
                    onValueChange={(v) => set('garaging_location_id', v === NO_GARAGE ? '' : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_GARAGE}>Not linked</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {[l.address_line1, l.city].filter(Boolean).join(', ') || `Location ${l.location_number ?? ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Values and deductibles</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field('cost_new', 'Cost new', { numeric: true })}
                {field('stated_value', 'Stated value', { numeric: true })}
                {field('comprehensive_deductible', 'Comprehensive deductible', { placeholder: '1000' })}
                {field('collision_deductible', 'Collision deductible', { placeholder: '1000' })}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cc-text-muted">Ownership</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-cc-text-secondary">Ownership</Label>
                  <Select value={form.ownership ?? undefined} onValueChange={(v) => set('ownership', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {OWNERSHIP.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field('lienholder_name', 'Lienholder / lessor')}
                {field('lienholder_address', 'Lienholder address', { span2: true })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditing(null); }} disabled={saveMutation.isPending}
              className="text-cc-text-secondary hover:text-cc-text-primary">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving' : 'Save vehicle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
