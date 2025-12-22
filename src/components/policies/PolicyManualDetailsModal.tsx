import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function parseJson(text: string): { ok: true; value: JsonValue } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) as JsonValue };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
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

  const [coverageText, setCoverageText] = useState(() => safeStringify(initialCoverage));
  const [customText, setCustomText] = useState(() => safeStringify(initialCustom));
  const [insuredItemsText, setInsuredItemsText] = useState(() => safeStringify(initialInsuredItems));
  const [wcDetailsText, setWcDetailsText] = useState(() => safeStringify(initialWcDetails));

  const genericParseErrors = useMemo(() => {
    const e: Record<string, string | null> = {
      coverage: null,
      custom: null,
      insured_items: null,
      wc_details: null,
    };
    const c = parseJson(coverageText);
    if (!c.ok) e.coverage = c.error;
    const cu = parseJson(customText);
    if (!cu.ok) e.custom = cu.error;
    const ii = parseJson(insuredItemsText);
    if (!ii.ok) e.insured_items = ii.error;
    const wc = parseJson(wcDetailsText);
    if (!wc.ok) e.wc_details = wc.error;
    return e;
  }, [coverageText, customText, insuredItemsText, wcDetailsText]);

  const hasErrors =
    Boolean(genericParseErrors.coverage) ||
    Boolean(genericParseErrors.custom) ||
    Boolean(genericParseErrors.insured_items) ||
    (isWorkersComp && Boolean(genericParseErrors.wc_details));

  const handleSave = async () => {
    const coverage = parseJson(coverageText);
    const custom = parseJson(customText);
    const insuredItems = parseJson(insuredItemsText);
    const wc = parseJson(wcDetailsText);

    if (!coverage.ok || !custom.ok || !insuredItems.ok || (isWorkersComp && !wc.ok)) {
      toast({
        title: 'Invalid JSON',
        description: 'Please fix JSON errors before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const update: Record<string, unknown> = {
        coverage: coverage.value,
        custom: custom.value,
        insured_items: insuredItems.value,
      };

      // WC details are stored separately on the policy row in this codebase
      if (isWorkersComp) {
        update.wc_details = wc.value;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manual Policy Details</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="coverage" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="coverage">Coverage JSON</TabsTrigger>
            <TabsTrigger value="insured">Insured Items JSON</TabsTrigger>
            <TabsTrigger value="custom">Custom JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="coverage" className="space-y-2">
            <Label>policies.coverage</Label>
            <Textarea value={coverageText} onChange={(e) => setCoverageText(e.target.value)} rows={14} className="font-mono text-sm" />
            {genericParseErrors.coverage && <p className="text-sm text-destructive">{genericParseErrors.coverage}</p>}
          </TabsContent>

          <TabsContent value="insured" className="space-y-2">
            <Label>policies.insured_items</Label>
            <Textarea value={insuredItemsText} onChange={(e) => setInsuredItemsText(e.target.value)} rows={14} className="font-mono text-sm" />
            {genericParseErrors.insured_items && <p className="text-sm text-destructive">{genericParseErrors.insured_items}</p>}
          </TabsContent>

          <TabsContent value="custom" className="space-y-2">
            <Label>policies.custom</Label>
            <Textarea value={customText} onChange={(e) => setCustomText(e.target.value)} rows={14} className="font-mono text-sm" />
            {genericParseErrors.custom && <p className="text-sm text-destructive">{genericParseErrors.custom}</p>}
          </TabsContent>
        </Tabs>

        {isWorkersComp && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Workers Comp Details (policies.wc_details)</Label>
              <span className="text-xs text-muted-foreground">Optional, but required to populate the WC Details panel</span>
            </div>
            <Textarea value={wcDetailsText} onChange={(e) => setWcDetailsText(e.target.value)} rows={10} className="font-mono text-sm" />
            {genericParseErrors.wc_details && <p className="text-sm text-destructive">{genericParseErrors.wc_details}</p>}
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


