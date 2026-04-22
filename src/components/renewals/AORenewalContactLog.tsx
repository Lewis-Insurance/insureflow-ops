import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Phone, Mail, User, MessageSquare, Calendar, CheckCircle2, Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { todayLocalDate, formatLocalDateDisplay } from "@/lib/date/localDate";
import { useMarkAORenewalFollowUpDone } from "@/hooks/useAORenewals";

interface ContactLog {
  id: string;
  contact_date: string;
  contact_method: string;
  notes: string;
  created_at: string;
  created_by: string;
  user_name?: string;
}

interface AORenewalContactLogProps {
  renewalId: string;
  renewal?: { follow_up_date: string | null; follow_up_task_id: string | null };
}

const methodIcons = {
  phone: Phone,
  email: Mail,
  in_person: User,
  sms: MessageSquare,
  other: Calendar,
};

const methodLabels = {
  phone: "Phone Call",
  email: "Email",
  in_person: "In Person",
  sms: "SMS",
  other: "Other",
};

export function AORenewalContactLog({ renewalId, renewal }: AORenewalContactLogProps) {
  const [contactDate, setContactDate] = useState(todayLocalDate());
  const [contactMethod, setContactMethod] = useState<string>("phone");
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ContactLog | null>(null);
  const [completing, setCompleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const markDoneMutation = useMarkAORenewalFollowUpDone();

  // Fetch contact logs
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["ao-renewal-contact-log", renewalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewal_contact_log")
        .select("*")
        .eq("renewal_id", renewalId)
        .order("contact_date", { ascending: false });

      if (error) throw error;

      const userIds = [...new Set(data?.map((log: any) => log.created_by) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

      return (data || []).map((log: any) => ({
        id: log.id,
        contact_date: log.contact_date,
        contact_method: log.contact_method,
        notes: log.notes,
        created_at: log.created_at,
        created_by: log.created_by,
        user_name: profileMap.get(log.created_by) || "Unknown User",
      }));
    },
  });

  // Add contact log mutation
  const addLogMutation = useMutation({
    mutationFn: async (data: { contact_date: string; contact_method: string; status: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newStatus = data.status && data.status !== 'no_change' ? data.status : null;

      const { error: logError } = await supabase.from("ao_renewal_contact_log").insert({
        renewal_id: renewalId,
        contact_date: data.contact_date,
        contact_method: data.contact_method,
        status: newStatus,
        notes: data.notes.trim(),
        created_by: user.id,
      });
      if (logError) throw new Error(`Failed to log contact: ${logError.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-contact-log", renewalId] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewal", renewalId] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-analytics-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["ao-pipeline-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-priority-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-monthly-forecast"] });
      queryClient.invalidateQueries({ queryKey: ["ao-at-risk-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-top-renewals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "Failed to log contact", variant: "destructive" });
    },
  });

  // Edit contact log mutation
  const updateLogMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("ao_renewal_contact_log")
        .update({ notes: notes.trim() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-contact-log", renewalId] });
      setEditingId(null);
      toast({ title: "Updated", description: "Contact log entry updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete contact log mutation
  const deleteLogMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ao_renewal_contact_log").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-contact-log", renewalId] });
      setDeleteTarget(null);
      toast({ title: "Deleted", description: "Contact log entry removed" });
    },
    onError: (err: Error) => {
      setDeleteTarget(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNotes("");
    setContactDate(todayLocalDate());
    setContactMethod("phone");
    setStatus("");
  };

  const handleAddLog = async () => {
    if (!notes.trim() || !contactDate) return;
    try {
      await addLogMutation.mutateAsync({ contact_date: contactDate, contact_method: contactMethod, status, notes });
      resetForm();
      toast({ title: "Success", description: "Contact logged successfully" });
    } catch {
      // onError already showed the error toast
    }
  };

  const handleLogAndComplete = async () => {
    if (!notes.trim() || !contactDate || !renewal?.follow_up_date) return;
    setCompleting(true);
    try {
      // Step 1: insert contact log
      try {
        await addLogMutation.mutateAsync({ contact_date: contactDate, contact_method: contactMethod, status, notes });
      } catch {
        return; // onError showed error toast; form stays; don't proceed to mark done
      }
      // Step 2: mark follow-up done
      try {
        await markDoneMutation.mutateAsync({
          renewalId,
          taskId: renewal.follow_up_task_id,
          completionNote: notes.trim(),
        });
        resetForm();
        toast({ title: "Done", description: "Contact logged and follow-up completed." });
      } catch {
        toast({
          title: "Partial",
          description: "Contact logged, but couldn't complete the follow-up — please use Mark Done.",
          variant: "destructive",
        });
        // Don't clear form — user knows where they stand
      }
    } finally {
      setCompleting(false);
    }
  };

  const startEdit = (log: ContactLog) => {
    setEditingId(log.id);
    setEditNotes(log.notes);
  };

  const cancelEdit = () => { setEditingId(null); setEditNotes(""); };

  const saveEdit = (id: string) => {
    if (!editNotes.trim()) return;
    updateLogMutation.mutate({ id, notes: editNotes });
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const getMethodIcon = (method: string) => {
    const Icon = methodIcons[method as keyof typeof methodIcons] || Calendar;
    return <Icon className="h-4 w-4" />;
  };

  const getMethodLabel = (method: string) =>
    methodLabels[method as keyof typeof methodLabels] || method;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Contact Log Form */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="contact_date">Contact Date</Label>
              <Input
                id="contact_date"
                type="date"
                value={contactDate}
                onChange={(e) => setContactDate(e.target.value)}
                max={todayLocalDate()}
              />
            </div>
            <div>
              <Label htmlFor="contact_method">Contact Method</Label>
              <Select value={contactMethod} onValueChange={setContactMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="phone">
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4" />Phone Call</div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2"><Mail className="h-4 w-4" />Email</div>
                  </SelectItem>
                  <SelectItem value="in_person">
                    <div className="flex items-center gap-2"><User className="h-4 w-4" />In Person</div>
                  </SelectItem>
                  <SelectItem value="sms">
                    <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />SMS</div>
                  </SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Call Outcome</Label>
              <Select value={status || undefined} onValueChange={(v) => setStatus(v === 'no_change' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="no_change">No change</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="renewed">Renewed</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="contact_notes">Notes</Label>
            <Textarea
              id="contact_notes"
              placeholder="What was discussed during this contact?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleAddLog}
              disabled={!notes.trim() || !contactDate || addLogMutation.isPending || completing}
              size="sm"
            >
              {addLogMutation.isPending && !completing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              Log Contact
            </Button>
            {renewal?.follow_up_date && (
              <Button
                onClick={handleLogAndComplete}
                disabled={!notes.trim() || !contactDate || addLogMutation.isPending || completing}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {completing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Log &amp; Complete Follow-up
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Contact History */}
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading contact history...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No contacts logged yet. Log your first contact above.
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {getInitials(log.user_name || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{log.user_name}</span>
                        <Badge variant="outline" className="flex items-center gap-1">
                          {getMethodIcon(log.contact_method)}
                          {getMethodLabel(log.contact_method)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatLocalDateDisplay(log.contact_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => startEdit(log)}
                          disabled={editingId === log.id || updateLogMutation.isPending}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(log)}
                          disabled={deleteLogMutation.isPending}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {editingId === log.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(log.id)}
                            disabled={!editNotes.trim() || updateLogMutation.isPending}
                          >
                            {updateLogMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5 mr-1" />
                            )}
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>
                            <X className="h-3.5 w-3.5 mr-1" />Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{log.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Logged {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact log entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This contact log entry will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteLogMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
