// src/components/leads/LeadAssignmentDialog.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAssignLead, useReassignLead } from '@/hooks/useAssignmentRules';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface LeadAssignmentDialogProps {
  leadId: string;
  currentAssignedTo?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadAssignmentDialog({
  leadId,
  currentAssignedTo,
  open,
  onOpenChange,
}: LeadAssignmentDialogProps) {
  const [producerId, setProducerId] = useState('');
  const [reason, setReason] = useState('');

  const assignLead = useAssignLead();
  const reassignLead = useReassignLead();

  const isReassignment = !!currentAssignedTo;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!producerId.trim()) {
      return;
    }

    try {
      if (isReassignment) {
        await reassignLead.mutateAsync({
          lead_id: leadId,
          assigned_to: producerId.trim(),
          reason: reason.trim() || undefined,
        });
      } else {
        await assignLead.mutateAsync({
          lead_id: leadId,
          assigned_to: producerId.trim(),
          reason: reason.trim() || undefined,
        });
      }

      // Reset form and close
      setProducerId('');
      setReason('');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to assign lead:', error);
    }
  };

  const handleCancel = () => {
    setProducerId('');
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReassignment ? 'Reassign Lead' : 'Assign Lead'}
          </DialogTitle>
          <DialogDescription>
            {isReassignment
              ? 'Change the producer assigned to this lead'
              : 'Assign this lead to a producer'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isReassignment && currentAssignedTo && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Currently assigned to: {currentAssignedTo.substring(0, 8)}...
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="producer_id">Producer ID *</Label>
            <Input
              id="producer_id"
              value={producerId}
              onChange={(e) => setProducerId(e.target.value)}
              placeholder="Enter producer user ID"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              The UUID of the producer to assign this lead to
            </p>
          </div>

          <div>
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you assigning/reassigning this lead?"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={assignLead.isPending || reassignLead.isPending}
            >
              {assignLead.isPending || reassignLead.isPending
                ? 'Assigning...'
                : isReassignment
                ? 'Reassign Lead'
                : 'Assign Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
