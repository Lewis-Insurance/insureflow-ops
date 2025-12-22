import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { WCPolicyDetails } from '@/types/workers-comp';
import { Plus, Trash2 } from 'lucide-react';

type KVType = 'text' | 'number' | 'boolean';
type KVRow = {
  id: string;
  key: string;
  type: KVType;
  valueText: string;
  valueBool: boolean;
};

type InsuredItemForm = {
  id: string;
  name: string;
  description: string;
  valueText: string;
  extra: KVRow[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toKVRows(value: unknown): { rows: KVRow[]; droppedKeys: string[] } {
  if (!isPlainObject(value)) return { rows: [], droppedKeys: [] };

  const rows: KVRow[] = [];
  const droppedKeys: string[] = [];

  for (const [k, v] of Object.entries(value)) {
    if (v == null) continue;
    if (typeof v === 'string') {
      rows.push({ id: crypto.randomUUID(), key: k, type: 'text', valueText: v, valueBool: false });
      continue;
    }
    if (typeof v === 'number') {
      rows.push({ id: crypto.randomUUID(), key: k, type: 'number', valueText: String(v), valueBool: false });
      continue;
    }
    if (typeof v === 'boolean') {
      rows.push({ id: crypto.randomUUID(), key: k, type: 'boolean', valueText: '', valueBool: v });
      continue;
    }
    droppedKeys.push(k);
  }

  return { rows, droppedKeys };
}

function fromKVRows(rows: KVRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.type === 'boolean') out[key] = row.valueBool;
    else if (row.type === 'number') {
      const n = Number(row.valueText);
      if (!Number.isFinite(n)) continue;
      out[key] = n;
    } else out[key] = row.valueText;
  }
  return out;
}

function toInsuredItems(value: unknown): { items: InsuredItemForm[]; legacyDetected: boolean } {
  if (Array.isArray(value)) {
    const items: InsuredItemForm[] = value.map((v) => {
      const obj = isPlainObject(v) ? v : {};
      const name = typeof obj.name === 'string' ? obj.name : '';
      const description = typeof obj.description === 'string' ? obj.description : '';
      const amount = typeof obj.value === 'number' ? String(obj.value) : typeof obj.amount === 'number' ? String(obj.amount) : '';

      const { rows } = toKVRows(obj);
      const extra = rows.filter((r) => !['name', 'description', 'value', 'amount'].includes(r.key));

      return { id: crypto.randomUUID(), name, description, valueText: amount, extra };
    });
    return { items, legacyDetected: false };
  }
  return { items: [], legacyDetected: value != null };
}

function wcTemplate(): WCPolicyDetails {
  const now = new Date().toISOString();
  return {
    identity: {
      carrier_name: '',
      carrier_naic: '',
      policy_number: '',
      status: 'issued',
      line_of_business: 'Workers Compensation',
      named_insured: '',
      dba: '',
      mailing_address: { street: '', city: '', state: '', zip: '' },
      primary_location_address: undefined,
      fein: '',
      producer: '',
      agency: '',
      sub_producer: '',
    },
    dates: {
      effective_date: '',
      expiration_date: '',
      issue_date: '',
      policy_term: '12 months',
    },
    coverage: {
      policy_type: 'standard',
      covered_states: [],
      part_one_wc: 'statutory',
      part_two_employers_liability: {
        each_accident: 100000,
        disease_each_employee: 100000,
        disease_policy_limit: 500000,
      },
    },
    classifications: [],
    experience_rating: { rating_bureau: 'NCCI' },
    premium: { estimated_annual_premium: 0 },
    employer_info: {},
    ownership_elections: { officers: [] },
    extraction_source: 'manual',
    extracted_at: now,
    last_updated_at: now,
  };
}

function mergeWCDetails(existing: unknown): WCPolicyDetails {
  const base = wcTemplate();
  if (!isPlainObject(existing)) return base;
  const e = existing as any;

  return {
    ...base,
    ...e,
    identity: {
      ...base.identity,
      ...(isPlainObject(e.identity) ? e.identity : {}),
      mailing_address: {
        ...base.identity.mailing_address,
        ...(isPlainObject(e.identity?.mailing_address) ? e.identity.mailing_address : {}),
      },
    },
    dates: { ...base.dates, ...(isPlainObject(e.dates) ? e.dates : {}) },
    coverage: {
      ...base.coverage,
      ...(isPlainObject(e.coverage) ? e.coverage : {}),
      part_two_employers_liability: {
        ...base.coverage.part_two_employers_liability,
        ...(isPlainObject(e.coverage?.part_two_employers_liability) ? e.coverage.part_two_employers_liability : {}),
      },
    },
    classifications: Array.isArray(e.classifications) ? e.classifications : base.classifications,
    experience_rating: {
      ...base.experience_rating,
      ...(isPlainObject(e.experience_rating) ? e.experience_rating : {}),
    },
    premium: { ...base.premium, ...(isPlainObject(e.premium) ? e.premium : {}) },
    employer_info: { ...base.employer_info, ...(isPlainObject(e.employer_info) ? e.employer_info : {}) },
    ownership_elections: {
      ...base.ownership_elections,
      ...(isPlainObject(e.ownership_elections) ? e.ownership_elections : {}),
      officers: Array.isArray(e.ownership_elections?.officers) ? e.ownership_elections.officers : base.ownership_elections.officers,
    },
  };
}

function KVEditor({
  title,
  rows,
  onChange,
  droppedKeys,
}: {
  title: string;
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  droppedKeys: string[];
}) {
  const addRow = () => onChange([...rows, { id: crypto.randomUUID(), key: '', type: 'text', valueText: '', valueBool: false }]);
  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const updateRow = (id: string, patch: Partial<KVRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-2" />
            Add row
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {droppedKeys.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Some existing fields are complex and aren’t editable here: <span className="font-medium">{droppedKeys.join(', ')}</span>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No rows yet. Click “Add row” to start.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <Input value={row.key} placeholder="Field name (e.g., liability_limit)" onChange={(e) => updateRow(row.id, { key: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <Select
                    value={row.type}
                    onValueChange={(v) =>
                      updateRow(row.id, {
                        type: v as KVType,
                        valueText: v === 'boolean' ? '' : row.valueText,
                        valueBool: v === 'boolean' ? row.valueBool : false,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="boolean">Yes/No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  {row.type === 'boolean' ? (
                    <Select value={row.valueBool ? 'true' : 'false'} onValueChange={(v) => updateRow(row.id, { valueBool: v === 'true' })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={row.valueText} placeholder={row.type === 'number' ? '1234' : 'Value'} onChange={(e) => updateRow(row.id, { valueText: e.target.value })} />
                  )}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PolicyManualDetailsModal({
  open,
  onOpenChange,
  policyId,
  isWorkersComp,
  initialCoverage,
  initialCustom,
  initialInsuredItems,
  initialWcDetails,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  isWorkersComp: boolean;
  initialCoverage: unknown;
  initialCustom: unknown;
  initialInsuredItems: unknown;
  initialWcDetails: unknown;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const initialCoverageRows = useMemo(() => toKVRows(initialCoverage), [initialCoverage]);
  const initialCustomRows = useMemo(() => toKVRows(initialCustom), [initialCustom]);
  const initialInsured = useMemo(() => toInsuredItems(initialInsuredItems), [initialInsuredItems]);

  const [coverageRows, setCoverageRows] = useState<KVRow[]>(() => initialCoverageRows.rows);
  const [customRows, setCustomRows] = useState<KVRow[]>(() => initialCustomRows.rows);
  const [insuredItems, setInsuredItems] = useState<InsuredItemForm[]>(() => initialInsured.items);
  const [wcDetailsDraft, setWcDetailsDraft] = useState<WCPolicyDetails>(() => mergeWCDetails(initialWcDetails));

  const hasErrors = useMemo(() => {
    const invalidNumbers = (rows: KVRow[]) =>
      rows.some((r) => r.type === 'number' && r.valueText.trim().length > 0 && !Number.isFinite(Number(r.valueText)));
    const invalidCoverage = invalidNumbers(coverageRows);
    const invalidCustom = invalidNumbers(customRows);
    const invalidItems = insuredItems.some((it) => it.valueText.trim().length > 0 && !Number.isFinite(Number(it.valueText)));
    return invalidCoverage || invalidCustom || invalidItems;
  }, [coverageRows, customRows, insuredItems]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const coverage = fromKVRows(coverageRows);
      const custom = fromKVRows(customRows);
      const insured_items = insuredItems
        .map((it) => {
          const out: Record<string, unknown> = { name: it.name.trim() };
          if (it.description.trim()) out.description = it.description.trim();
          if (it.valueText.trim()) {
            const n = Number(it.valueText);
            if (Number.isFinite(n)) out.value = n;
          }
          const extra = fromKVRows(it.extra);
          for (const [k, v] of Object.entries(extra)) {
            if (k === 'name' || k === 'description' || k === 'value' || k === 'amount') continue;
            out[k] = v;
          }
          return out;
        })
        .filter((it) => (it.name as string).trim().length > 0);

      const update: Record<string, unknown> = {
        coverage,
        custom,
        insured_items,
      };

      // WC details are stored separately on the policy row in this codebase
      if (isWorkersComp) {
        update.wc_details = {
          ...wcDetailsDraft,
          extraction_source: 'manual',
          last_updated_at: new Date().toISOString(),
        };
        update.extraction_source = 'manual';
      }

      const { error } = await supabase
        .from('policies')
        .update(update)
        .eq('id', policyId);

      if (error) throw error;

      toast({
        title: 'Saved',
        description: 'Manual policy details saved successfully.',
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Failed to save policy details',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const addInsuredItem = () => {
    setInsuredItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', description: '', valueText: '', extra: [] },
    ]);
  };

  const removeInsuredItem = (id: string) => {
    setInsuredItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manual Policy Details</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="coverage" className="space-y-4">
          <TabsList className={isWorkersComp ? 'grid w-full grid-cols-4' : 'grid w-full grid-cols-3'}>
            <TabsTrigger value="coverage">Coverage</TabsTrigger>
            <TabsTrigger value="insured">Insured Items</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
            {isWorkersComp && <TabsTrigger value="wc">Workers Comp</TabsTrigger>}
          </TabsList>

          <TabsContent value="coverage" className="space-y-3">
            <Label className="text-sm text-muted-foreground">
              Enter coverage details as key/value rows (no JSON).
            </Label>
            <KVEditor title="Coverage" rows={coverageRows} onChange={setCoverageRows} droppedKeys={initialCoverageRows.droppedKeys} />
          </TabsContent>

          <TabsContent value="custom" className="space-y-3">
            <Label className="text-sm text-muted-foreground">
              Use custom fields for anything that doesn’t fit other sections.
            </Label>
            <KVEditor title="Custom Fields" rows={customRows} onChange={setCustomRows} droppedKeys={initialCustomRows.droppedKeys} />
          </TabsContent>

          <TabsContent value="insured" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm text-muted-foreground">
                Add insured items as a list (this saves as an array).
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addInsuredItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add item
              </Button>
            </div>

            {initialInsured.legacyDetected && (
              <p className="text-sm text-amber-600">
                Note: this policy had insured items in a legacy format. Saving will normalize it to a list.
              </p>
            )}

            {insuredItems.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground">
                  No insured items yet. Click “Add item” to create one.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {insuredItems.map((it, idx) => (
                  <Card key={it.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Item {idx + 1}</CardTitle>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeInsuredItem(it.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label>Name</Label>
                          <Input
                            value={it.name}
                            placeholder="e.g., Main building / Equipment / Location #1"
                            onChange={(e) =>
                              setInsuredItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, name: e.target.value } : p)))
                            }
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Description</Label>
                          <Input
                            value={it.description}
                            placeholder="Optional"
                            onChange={(e) =>
                              setInsuredItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, description: e.target.value } : p)))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label>Value (Number)</Label>
                          <Input
                            value={it.valueText}
                            placeholder="e.g., 250000"
                            onChange={(e) =>
                              setInsuredItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, valueText: e.target.value } : p)))
                            }
                          />
                        </div>
                      </div>

                      <Separator />
                      <KVEditor
                        title="Additional Fields"
                        rows={it.extra}
                        droppedKeys={[]}
                        onChange={(rows) => setInsuredItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, extra: rows } : p)))}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {isWorkersComp && (
          <div className="mt-6 space-y-4">
            <Separator />
            <div className="space-y-1">
              <Label className="text-sm">Workers Comp (friendly form)</Label>
              <p className="text-sm text-muted-foreground">
                Fill out key WC fields. This writes a safe WC details template so the WC Details panel can display without uploading a document.
              </p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Policy Identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Carrier</Label>
                    <Input
                      value={wcDetailsDraft.identity.carrier_name}
                      onChange={(e) => setWcDetailsDraft((p) => ({ ...p, identity: { ...p.identity, carrier_name: e.target.value } }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Policy Number</Label>
                    <Input
                      value={wcDetailsDraft.identity.policy_number}
                      onChange={(e) => setWcDetailsDraft((p) => ({ ...p, identity: { ...p.identity, policy_number: e.target.value } }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={wcDetailsDraft.identity.status} onValueChange={(v) => setWcDetailsDraft((p) => ({ ...p, identity: { ...p.identity, status: v as any } }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quote">Quote</SelectItem>
                        <SelectItem value="bound">Bound</SelectItem>
                        <SelectItem value="issued">Issued</SelectItem>
                        <SelectItem value="renewed">Renewed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Named Insured</Label>
                    <Input
                      value={wcDetailsDraft.identity.named_insured}
                      onChange={(e) => setWcDetailsDraft((p) => ({ ...p, identity: { ...p.identity, named_insured: e.target.value } }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>FEIN</Label>
                    <Input
                      value={wcDetailsDraft.identity.fein || ''}
                      onChange={(e) => setWcDetailsDraft((p) => ({ ...p, identity: { ...p.identity, fein: e.target.value } }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Policy Period</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Effective Date</Label>
                    <Input
                      type="date"
                      value={wcDetailsDraft.dates.effective_date || ''}
                      onChange={(e) => setWcDetailsDraft((p) => ({ ...p, dates: { ...p.dates, effective_date: e.target.value } }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Expiration Date</Label>
                    <Input
                      type="date"
                      value={wcDetailsDraft.dates.expiration_date || ''}
                      onChange={(e) => setWcDetailsDraft((p) => ({ ...p, dates: { ...p.dates, expiration_date: e.target.value } }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Policy Term</Label>
                    <Input
                      value={wcDetailsDraft.dates.policy_term || '12 months'}
                      onChange={(e) => setWcDetailsDraft((p) => ({ ...p, dates: { ...p.dates, policy_term: e.target.value } }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Financials</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Estimated Annual Premium (Number)</Label>
                    <Input
                      value={String(wcDetailsDraft.premium.estimated_annual_premium ?? 0)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setWcDetailsDraft((p) => ({ ...p, premium: { ...p.premium, estimated_annual_premium: Number.isFinite(n) ? n : 0 } }));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Experience Mod (Number)</Label>
                    <Input
                      value={wcDetailsDraft.experience_rating.experience_mod == null ? '' : String(wcDetailsDraft.experience_rating.experience_mod)}
                      placeholder="e.g., 0.850"
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const n = v === '' ? undefined : Number(v);
                        setWcDetailsDraft((p) => ({
                          ...p,
                          experience_rating: { ...p.experience_rating, experience_mod: v === '' ? undefined : Number.isFinite(n as number) ? (n as number) : p.experience_rating.experience_mod },
                        }));
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || hasErrors}>
            {saving ? 'Saving...' : 'Save Manual Details'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
