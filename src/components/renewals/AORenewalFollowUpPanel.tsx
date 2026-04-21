import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isPast } from "date-fns";

interface AORenewalFollowUpPanelProps {
  renewalId: string;
  followUpDate: string | null;
  followUpReason: string | null;
}

export function AORenewalFollowUpPanel({
  renewalId,
  followUpDate,
  followUpReason,
}: AORenewalFollowUpPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"view" | "set" | "done">("view");
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["ao-renewal", renewalId] });
    queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
  };

  const handleSet = async () => {
    if (!newDate) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ao_renewals")
        .update({ follow_up_date: newDate, follow_up_reason: newReason.trim() || null })
        .eq("id", renewalId);
      if (error) throw error;
      invalidateQueries();
      setMode("view");
      setNewDate("");
      setNewReason("");
      toast({ title: "Follow-up set" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkDone = async () => {
    if (!outcomeNote.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: logError } = await supabase.from("ao_renewal_contact_log").insert({
        renewal_id: renewalId,
        contact_date: new Date().toISOString().split("T")[0],
        contact_method: "other",
        notes: `Follow-up completed: ${outcomeNote.trim()}`,
        created_by: user.id,
      });
      if (logError) throw logError;

      const { error: updateError } = await supabase
        .from("ao_renewals")
        .update({ follow_up_date: null, follow_up_reason: null })
        .eq("id", renewalId);
      if (updateError) throw updateError;

      invalidateQueries();
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-contact-log", renewalId] });
      setMode("view");
      setOutcomeNote("");
      toast({ title: "Follow-up marked done", description: "Outcome logged to contact history." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ao_renewals")
        .update({ follow_up_date: null, follow_up_reason: null })
        .eq("id", renewalId);
      if (error) throw error;
      invalidateQueries();
      setShowClearDialog(false);
      toast({ title: "Follow-up cleared" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = followUpDate
    ? isPast(parseISO(followUpDate + "T23:59:59"))
    : false;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Follow-up
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current follow-up */}
          {followUpDate && mode === "view" && (
            <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/60">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={isOverdue ? "destructive" : "secondary"}>
                    {isOverdue ? "Overdue" : "Scheduled"}
                  </Badge>
                  <span className="font-medium text-sm">
                    {format(parseISO(followUpDate), "MMM d, yyyy")}
                  </span>
                </div>
                {followUpReason && (
                  <p className="text-sm text-muted-foreground">{followUpReason}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode("done")}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Done
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewDate(followUpDate);
                    setNewReason(followUpReason || "");
                    setMode("set");
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setShowClearDialog(true)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* No follow-up set */}
          {!followUpDate && mode === "view" && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>No follow-up scheduled.</span>
              <Button size="sm" onClick={() => setMode("set")}>
                <Calendar className="h-3.5 w-3.5 mr-1" />
                Set Follow-up
              </Button>
            </div>
          )}

          {/* Set / Edit form */}
          {mode === "set" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="fu-date">Follow-up Date *</Label>
                <Input
                  id="fu-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div>
                <Label htmlFor="fu-reason">Reason</Label>
                <Textarea
                  id="fu-reason"
                  placeholder="What needs to happen by this date?"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSet} disabled={!newDate || saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMode("view");
                    setNewDate("");
                    setNewReason("");
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Mark Done form */}
          {mode === "done" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="fu-outcome">Outcome *</Label>
                <Textarea
                  id="fu-outcome"
                  placeholder="What happened? This will be logged to contact history."
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleMarkDone}
                  disabled={!outcomeNote.trim() || saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Mark Done & Log
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMode("view");
                    setOutcomeNote("");
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear confirmation */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              The scheduled follow-up will be removed without logging anything to contact history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear} disabled={saving}>
              {saving ? "Clearing…" : "Clear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
