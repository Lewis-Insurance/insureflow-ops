// ============================================================================
// LOSS RUN REQUEST DIALOG (Commercial Lines SOW v3, feeder #8 - Phase 2)
// ============================================================================
// Compose a loss-run request letter (with the insured's LOA block) for a
// prior carrier, then Copy / Print it and log the request: a submission_events
// row plus a follow-up task (due in 10 business days-ish: +14 calendar days).
// The letter itself is pure composition (lossRunLetter.ts, unit tested);
// returned loss runs feed the document-extraction pipeline.
// Calm Command: cc-* tokens, NO lime, no em or en dashes.
// ============================================================================

import { useMemo, useState } from 'react';
import { Copy, Printer } from 'lucide-react';
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
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { composeLossRunLetter } from '@/lib/commercial/lossRunLetter';

interface LossRunRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  submissionId: string;
  insuredName: string;
}

const todayUs = (): string => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

export function LossRunRequestDialog({
  open, onOpenChange, accountId, submissionId, insuredName,
}: LossRunRequestDialogProps) {
  const [carrier, setCarrier] = useState('');
  const [policyNumbers, setPolicyNumbers] = useState('');
  const [years, setYears] = useState('5');
  const [logging, setLogging] = useState(false);
  const queryClient = useQueryClient();

  const letter = useMemo(
    () =>
      carrier.trim()
        ? composeLossRunLetter({
            carrierName: carrier,
            insuredName,
            policyNumbers: policyNumbers.split(',').map((p) => p.trim()).filter(Boolean),
            yearsBack: Number(years),
            dateUs: todayUs(),
          })
        : '',
    [carrier, insuredName, policyNumbers, years],
  );

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) {
      toast.error('Pop-up blocked. Use Copy instead.');
      return;
    }
    w.document.write(
      `<pre style="font: 13px/1.5 ui-monospace, Menlo, monospace; padding: 40px; white-space: pre-wrap;">${letter
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const handleLog = async () => {
    if (!carrier.trim()) {
      toast.error('Enter the carrier first.');
      return;
    }
    setLogging(true);
    try {
      const due = new Date();
      due.setDate(due.getDate() + 14);
      // Dedupe key makes retries safe: a re-log after a partial failure can
      // never create a second follow-up task for the same carrier+submission.
      // Years included: a different lookback window is a distinct request.
      const dedupeKey = `loss_run:${submissionId}:${carrier.trim().toLowerCase()}:${years}`;
      const { error: taskError } = await supabase.from('tasks').insert({
        account_id: accountId,
        title: `Loss runs: follow up with ${carrier.trim()}`,
        description: `Loss runs requested from ${carrier.trim()} for ${insuredName} (past ${years} years). Chase if not received; carriers customarily respond within 10 business days. Upload returned runs to the customer record so extraction can stage them.`,
        status: 'pending',
        priority: 'medium',
        due_at: due.toISOString(),
        dedupe_key: dedupeKey,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // 23505 = the follow-up already exists from a prior attempt.
      const taskAlreadyExisted = (taskError as { code?: string } | null)?.code === '23505';
      if (taskError && !taskAlreadyExisted) throw taskError;
      // Append the audit event, but never duplicate it: when the task already
      // existed, only write the event if a prior attempt failed to (covers
      // retry-after-partial without double-logging a re-submitted carrier).
      let writeEvent = true;
      if (taskAlreadyExisted) {
        const { data: existingEvents } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('submission_events' as any)
          .select('id, metadata')
          .eq('submission_id', submissionId)
          .eq('action', 'loss_run_requested');
        writeEvent = !((existingEvents as Array<{ metadata?: { carrier?: string; years_back?: number } }> | null) ?? []).some(
          (e) =>
            (e.metadata?.carrier ?? '').toLowerCase() === carrier.trim().toLowerCase() &&
            e.metadata?.years_back === Number(years),
        );
      }
      if (writeEvent) {
        const { error: eventError } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('submission_events' as any)
          .insert({
            submission_id: submissionId,
            action: 'loss_run_requested',
            metadata: { carrier: carrier.trim(), years_back: Number(years) },
          });
        if (eventError) throw eventError;
      }
      // Surface the new task on the customer record without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['customer-tasks', accountId] });
      toast.success('Request logged; follow-up task created (due in 14 days).');
      setCarrier(''); setPolicyNumbers('');
      onOpenChange(false);
    } catch (err) {
      toast.error(`Could not log the request: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setLogging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!logging) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-cc-surface-raised sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-cc-text-primary">Request loss runs</DialogTitle>
          <DialogDescription className="text-cc-text-muted">
            Compose the request letter with the insured's authorization block, send it
            your usual way (copy into email or print), then log it for follow-up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="lr-carrier" className="text-cc-text-secondary">Prior carrier</Label>
              <Input id="lr-carrier" placeholder="Progressive" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lr-policies" className="text-cc-text-secondary">Policy numbers <span className="text-cc-text-muted">(optional, comma separated)</span></Label>
              <Input id="lr-policies" value={policyNumbers} onChange={(e) => setPolicyNumbers(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-cc-text-secondary">Years</Label>
              <Select value={years} onValueChange={setYears}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['3', '5', '7'].map((y) => (
                    <SelectItem key={y} value={y}>{y} years</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {letter && (
            <div className="space-y-2">
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-cc-md border border-cc-border-subtle bg-cc-surface p-4 font-mono text-xs leading-relaxed text-cc-text-secondary">
                {letter}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { void navigator.clipboard.writeText(letter); toast.success('Letter copied'); }}
                  className="text-cc-text-secondary hover:text-cc-text-primary"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Copy letter
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={handlePrint}
                  className="text-cc-text-secondary hover:text-cc-text-primary"
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Print
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={logging}
            className="text-cc-text-secondary hover:text-cc-text-primary">
            Close
          </Button>
          <Button onClick={() => void handleLog()} disabled={logging || !carrier.trim()}>
            {logging ? 'Logging' : 'Log request + follow-up task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
