// ============================================================================
// COTERIE APPROVAL PANEL (internal review)
// ============================================================================
// Shows a quote's approval gate: summary + risk flags, with named-human
// Approve / Deny actions that write to `carrier_approval_gates`.
//
// IMPORTANT: Approving records an internal decision ONLY. In Phase 1 there is
// NO bind, NO client-facing send, and NO payment — the gate is a review record.
// ============================================================================

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, ShieldX, ShieldAlert, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useUpdateCoterieApprovalGate } from '@/hooks/useCoterieQuote';
import type { CarrierApprovalGateRow } from '@/integrations/coterie/types';

interface CoterieApprovalPanelProps {
  gate: CarrierApprovalGateRow;
}

function GateStatusBadge({ status }: { status: CarrierApprovalGateRow['status'] }) {
  switch (status) {
    case 'approved':
      return (
        <Badge className="bg-green-600 hover:bg-green-600">
          <ShieldCheck className="w-3 h-3 mr-1" />
          Approved
        </Badge>
      );
    case 'denied':
      return (
        <Badge variant="destructive">
          <ShieldX className="w-3 h-3 mr-1" />
          Denied
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Expired
        </Badge>
      );
    case 'pending':
    default:
      return (
        <Badge variant="secondary">
          <Clock className="w-3 h-3 mr-1" />
          Pending review
        </Badge>
      );
  }
}

export function CoterieApprovalPanel({ gate }: CoterieApprovalPanelProps) {
  const updateGate = useUpdateCoterieApprovalGate();
  const [showDeny, setShowDeny] = useState(false);
  const [denialReason, setDenialReason] = useState('');

  const isResolved = gate.status !== 'pending';

  const handleApprove = () => {
    updateGate.mutate(
      { gateId: gate.id, decision: 'approved', requestedBy: gate.requested_by },
      {
        onSuccess: () =>
          toast({
            title: 'Approval recorded',
            description: 'Internal decision only — nothing was bound or sent.',
          }),
        onError: (error) =>
          toast({ title: 'Could not approve', description: error.message, variant: 'destructive' }),
      },
    );
  };

  const handleDeny = () => {
    if (!denialReason.trim()) {
      toast({ title: 'A denial reason is required', variant: 'destructive' });
      return;
    }
    updateGate.mutate(
      {
        gateId: gate.id,
        decision: 'denied',
        denialReason: denialReason.trim(),
        requestedBy: gate.requested_by,
      },
      {
        onSuccess: () => {
          setShowDeny(false);
          toast({ title: 'Denial recorded' });
        },
        onError: (error) =>
          toast({ title: 'Could not deny', description: error.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Approval gate
              <GateStatusBadge status={gate.status} />
            </CardTitle>
            <CardDescription className="mt-1">
              Requested {formatDistanceToNow(new Date(gate.created_at), { addSuffix: true })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm">{gate.summary}</p>

        {gate.risk_flags && gate.risk_flags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {gate.risk_flags.map((flag) => (
              <Badge key={flag} variant="outline" className="text-xs">
                <ShieldAlert className="w-3 h-3 mr-1" />
                {flag.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        )}

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Review only</AlertTitle>
          <AlertDescription>
            Approving or denying records a named-human decision. It does not bind coverage, send
            anything to the client, or take payment.
          </AlertDescription>
        </Alert>

        {isResolved ? (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Decision: <span className="font-medium capitalize">{gate.status}</span>
              {gate.approved_at &&
                ` · ${formatDistanceToNow(new Date(gate.approved_at), { addSuffix: true })}`}
            </p>
            {gate.denial_reason && <p>Reason: {gate.denial_reason}</p>}
          </div>
        ) : (
          <>
            <Separator />
            {showDeny ? (
              <div className="space-y-3">
                <Textarea
                  value={denialReason}
                  onChange={(e) => setDenialReason(e.target.value)}
                  placeholder="Reason for denial (required)"
                  rows={3}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleDeny}
                    disabled={updateGate.isPending}
                  >
                    {updateGate.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Confirm denial
                  </Button>
                  <Button variant="ghost" onClick={() => setShowDeny(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button onClick={handleApprove} disabled={updateGate.isPending}>
                  {updateGate.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button variant="outline" onClick={() => setShowDeny(true)}>
                  <ShieldX className="w-4 h-4 mr-2" />
                  Deny
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default CoterieApprovalPanel;
