import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LostReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

const LOST_REASONS = [
  { value: 'price', label: 'Price / Premium too high' },
  { value: 'coverage', label: 'Coverage not adequate' },
  { value: 'service', label: 'Service issues' },
  { value: 'competitor', label: 'Went to competitor' },
  { value: 'no_response', label: 'Customer unresponsive' },
  { value: 'sold_property', label: 'Sold property / No longer needs coverage' },
  { value: 'deceased', label: 'Insured deceased' },
  { value: 'moved', label: 'Moved out of service area' },
  { value: 'other', label: 'Other' },
];

export function LostReasonModal({ open, onOpenChange, onConfirm }: LostReasonModalProps) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalReason = reason === 'other' ? customReason : LOST_REASONS.find(r => r.value === reason)?.label || reason;

    if (!finalReason) return;

    onConfirm(finalReason);

    // Reset form
    setReason('');
    setCustomReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lost Renewal</DialogTitle>
          <DialogDescription>
            Please select the reason why this renewal was lost.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === 'other' && (
            <div className="space-y-2">
              <Label htmlFor="customReason">Please specify</Label>
              <Textarea
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter the reason..."
                rows={3}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!reason || (reason === 'other' && !customReason)}
            >
              Mark as Lost
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
