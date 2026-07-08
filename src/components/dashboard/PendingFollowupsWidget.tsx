import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhoneForDisplay } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, X, Calendar, User } from "lucide-react";
import { usePendingFollowupConfirmations, useConfirmFollowup, useDismissFollowup } from "@/hooks/useLeadFollowupConfirmations";
import { useProfiles } from "@/hooks/useProfiles";
import { format } from "date-fns";

export function PendingFollowupsWidget() {
  const { data: confirmations, isLoading } = usePendingFollowupConfirmations();
  const { profiles } = useProfiles();
  const confirmFollowup = useConfirmFollowup();
  const dismissFollowup = useDismissFollowup();
  
  const [selectedConfirmation, setSelectedConfirmation] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const currentConfirmation = confirmations?.find(c => c.id === selectedConfirmation);

  const handleOpenDialog = (confirmationId: string) => {
    const confirmation = confirmations?.find(c => c.id === confirmationId);
    if (confirmation) {
      setSelectedConfirmation(confirmationId);
      setAssignedTo(confirmation.assigned_to || "");
      setEffectiveDate(confirmation.estimated_effective_date || "");
      setValidationErrors([]);
    }
  };

  const handleConfirm = async () => {
    const errors: string[] = [];

    if (!effectiveDate) {
      errors.push("Estimated effective date is required");
    }

    if (!assignedTo) {
      errors.push("Assigned staff member is required");
    }

    // Check if assigned user still exists in the system
    if (assignedTo && !profiles?.find(p => p.id === assignedTo)) {
      errors.push("The assigned staff member is no longer in the system. Please select a different person.");
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    if (currentConfirmation) {
      await confirmFollowup.mutateAsync({
        confirmationId: selectedConfirmation!,
        assigned_to: assignedTo,
        estimated_effective_date: effectiveDate,
        lead_name: currentConfirmation.lead_name,
        insurance_types: currentConfirmation.insurance_types || undefined,
      });
      setSelectedConfirmation(null);
    }
  };

  const handleDismiss = async (confirmationId: string) => {
    await dismissFollowup.mutateAsync(confirmationId);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Follow-ups</CardTitle>
          <CardDescription>Loading confirmations...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!confirmations || confirmations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Follow-ups</CardTitle>
          <CardDescription>No pending follow-up confirmations</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            When leads are marked as "Lost", they will appear here for follow-up confirmation.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Pending Follow-ups
          </CardTitle>
          <CardDescription>
            {confirmations.length} lead{confirmations.length !== 1 ? 's' : ''} marked as Lost need follow-up confirmation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {confirmations.map((confirmation) => (
              <div
                key={confirmation.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium">{confirmation.lead_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {confirmation.insurance_types?.join(", ") || "No insurance types specified"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Created {format(new Date(confirmation.created_at), "MMM d, yyyy")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleOpenDialog(confirmation.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDismiss(confirmation.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedConfirmation} onOpenChange={(open) => !open && setSelectedConfirmation(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirm Follow-up Task</DialogTitle>
            <DialogDescription>
              Review and confirm the details for creating a follow-up task for {currentConfirmation?.lead_name}.
              The task will be due 5 months from the estimated effective date.
            </DialogDescription>
          </DialogHeader>

          {validationErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm text-destructive">Required Information Missing</div>
                  <ul className="text-sm text-destructive/90 mt-1 space-y-1">
                    {validationErrors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="assigned_to" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Assigned To *
              </Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="assigned_to">
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || 'User ' + profile.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="effective_date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Estimated Effective Date *
              </Label>
              <Input
                id="effective_date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>

            {currentConfirmation && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-sm font-medium">Lead Information</div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {currentConfirmation.lead_email && (
                    <div>Email: {currentConfirmation.lead_email}</div>
                  )}
                  {currentConfirmation.lead_phone && (
                    <div>Phone: {formatPhoneForDisplay(currentConfirmation.lead_phone)}</div>
                  )}
                  {currentConfirmation.insurance_types && currentConfirmation.insurance_types.length > 0 && (
                    <div>
                      Insurance Types:{" "}
                      {currentConfirmation.insurance_types.map((type) => (
                        <Badge key={type} variant="secondary" className="ml-1">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedConfirmation(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={confirmFollowup.isPending}>
              {confirmFollowup.isPending ? "Creating..." : "Create Follow-up Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
