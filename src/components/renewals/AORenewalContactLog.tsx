import { useEffect, useMemo, useState } from "react";
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
import { Phone, Mail, User, MessageSquare, Calendar, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addDaysLocalDate, extractLocalDate, formatLocalDateDisplay, todayLocalDate } from "@/lib/date/localDate";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
  currentStatus?: string;
  currentFollowUpDate?: string | null;
  currentFollowUpReason?: string | null;
  currentFollowUpNote?: string | null;
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

const FOLLOW_UP_REASON_PRESETS = [
  "Waiting on insured decision",
  "Quote review",
  "Documents needed",
  "Call back requested",
  "No answer, retry",
];

export function AORenewalContactLog({
  renewalId,
  currentStatus,
  currentFollowUpDate,
  currentFollowUpReason,
  currentFollowUpNote,
}: AORenewalContactLogProps) {
  const [contactDate, setContactDate] = useState(todayLocalDate());
  const [contactMethod, setContactMethod] = useState<string>("phone");
  const [status, setStatus] = useState<string>(currentStatus || "");
  const [followUpDate, setFollowUpDate] = useState(currentFollowUpDate || "");
  const [followUpReason, setFollowUpReason] = useState(currentFollowUpReason || "");
  const [followUpNote, setFollowUpNote] = useState(currentFollowUpNote || "");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setStatus(currentStatus || "");
  }, [currentStatus]);

  useEffect(() => {
    setFollowUpDate(extractLocalDate(currentFollowUpDate));
  }, [currentFollowUpDate]);

  useEffect(() => {
    setFollowUpReason(currentFollowUpReason || "");
  }, [currentFollowUpReason]);

  useEffect(() => {
    setFollowUpNote(currentFollowUpNote || "");
  }, [currentFollowUpNote]);

  const requiresFollowUp = status === "quoted" || status === "waiting_on_insured";
  const followUpSummary = useMemo(() => {
    if (!followUpDate && !followUpReason && !followUpNote) {
      return "No follow-up set yet";
    }

    const parts = [
      followUpDate ? `Next follow-up ${formatLocalDateDisplay(followUpDate)}` : null,
      followUpReason || null,
      followUpNote || null,
    ].filter(Boolean);

    return parts.join(" • ");
  }, [followUpDate, followUpReason, followUpNote]);

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

  const addLogMutation = useMutation({
    mutationFn: async (data: {
      contact_date: string;
      contact_method: string;
      status: string;
      follow_up_date: string;
      follow_up_reason: string;
      follow_up_note: string;
      notes: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const normalizedStatus = data.status && data.status !== "no_change" ? data.status : null;
      const effectiveStatus = normalizedStatus || currentStatus || null;

      const followUpContext = [
        data.follow_up_date ? `Next follow-up: ${data.follow_up_date}` : null,
        data.follow_up_reason ? `Reason: ${data.follow_up_reason}` : null,
        data.follow_up_note ? `Follow-up note: ${data.follow_up_note}` : null,
      ].filter(Boolean);

      const logNotes = [data.notes.trim(), ...followUpContext].filter(Boolean).join("\n");

      const { error } = await supabase.from("ao_renewal_contact_log").insert({
        renewal_id: renewalId,
        contact_date: data.contact_date,
        contact_method: data.contact_method,
        status: normalizedStatus,
        notes: logNotes,
        created_by: user.id,
      });

      if (error) throw error;

      const updates: Record<string, string | null> = {
        last_contact_date: data.contact_date,
        follow_up_date: data.follow_up_date || null,
        follow_up_reason: data.follow_up_reason.trim() || null,
        follow_up_note: data.follow_up_note.trim() || null,
      };

      if (normalizedStatus) {
        updates.status = normalizedStatus;
      }

      if (effectiveStatus === "quoted") {
        updates.quoted_at = new Date().toISOString();
        updates.waiting_on_insured_since = null;
      }

      if (effectiveStatus === "waiting_on_insured") {
        updates.waiting_on_insured_since = new Date().toISOString();
      }

      if (["renewed", "lost", "cancelled", "moved"].includes(effectiveStatus || "")) {
        updates.follow_up_date = null;
        updates.follow_up_reason = null;
        updates.follow_up_note = null;
        updates.waiting_on_insured_since = null;
      }

      const { error: renewalError } = await supabase
        .from("ao_renewals")
        .update(updates)
        .eq("id", renewalId);

      if (renewalError) throw renewalError;
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

      setNotes("");
      setContactDate(todayLocalDate());
      setContactMethod("phone");
      toast({
        title: "Success",
        description: "Contact and follow-up saved",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save contact and follow-up",
        variant: "destructive",
      });
    },
  });

  const handleAddLog = () => {
    if (!notes.trim() || !contactDate) return;
    if (requiresFollowUp && !followUpDate) return;

    addLogMutation.mutate({
      contact_date: contactDate,
      contact_method: contactMethod,
      status,
      follow_up_date: followUpDate,
      follow_up_reason: followUpReason,
      follow_up_note: followUpNote,
      notes,
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getMethodIcon = (method: string) => {
    const Icon = methodIcons[method as keyof typeof methodIcons] || Calendar;
    return <Icon className="h-4 w-4" />;
  };

  const getMethodLabel = (method: string) => {
    return methodLabels[method as keyof typeof methodLabels] || method;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="text-sm font-medium">Current follow-up commitment</div>
          <div className="text-sm text-muted-foreground">{followUpSummary}</div>
          {requiresFollowUp && !followUpDate && (
            <Badge variant="destructive">Follow-up required before saving this contact</Badge>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="contact_date">Contact Date</Label>
              <Input
                id="contact_date"
                type="date"
                value={contactDate}
                onChange={(e) => setContactDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div>
              <Label htmlFor="contact_method">Contact Method</Label>
              <Select value={contactMethod} onValueChange={setContactMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="phone">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="in_person">In Person</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Outcome</Label>
              <Select value={status || undefined} onValueChange={(v) => setStatus(v === "no_change" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="no_change">No change</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="waiting_on_insured">Waiting on insured</SelectItem>
                  <SelectItem value="renewed">Retained</SelectItem>
                  <SelectItem value="moved">Moved</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="contact_notes">What happened?</Label>
            <Textarea
              id="contact_notes"
              placeholder="What happened on this contact?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-lg border border-dashed p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowRight className="h-4 w-4" />
              Set the next move
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="follow_up_date">Next Follow-Up</Label>
                <Input
                  id="follow_up_date"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  min={contactDate}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    setFollowUpDate(addDaysLocalDate(contactDate || todayLocalDate(), 1));
                  }}>Tomorrow</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    setFollowUpDate(addDaysLocalDate(contactDate || todayLocalDate(), 3));
                  }}>+3 days</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    setFollowUpDate(addDaysLocalDate(contactDate || todayLocalDate(), 7));
                  }}>+7 days</Button>
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground space-y-2">
                <div>Quoted and waiting-on-insured files must leave here with a real next follow-up.</div>
                <div><strong>Recommended:</strong> {status === 'quoted' ? '1 to 3 days so the quote gets presented.' : status === 'waiting_on_insured' ? '3 to 7 days depending on urgency.' : 'Use a next touch whenever the file is still moving.'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="follow_up_reason">Reason</Label>
                <Input
                  id="follow_up_reason"
                  value={followUpReason}
                  onChange={(e) => setFollowUpReason(e.target.value)}
                  maxLength={120}
                  placeholder="Why is the next touch needed?"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {FOLLOW_UP_REASON_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setFollowUpReason(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="follow_up_note">Follow-Up Note</Label>
                <Textarea
                  id="follow_up_note"
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                  maxLength={240}
                  placeholder="Short context for the next touch"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <Button
            onClick={handleAddLog}
            disabled={
              !notes.trim() ||
              !contactDate ||
              (requiresFollowUp && !followUpDate) ||
              addLogMutation.isPending
            }
            size="sm"
          >
            {addLogMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4 mr-2" />
            )}
            Save Contact + Follow-Up
          </Button>
        </div>

        <Separator />

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{log.user_name}</span>
                      <Badge variant="outline" className="flex items-center gap-1">
                        {getMethodIcon(log.contact_method)}
                        {getMethodLabel(log.contact_method)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.contact_date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{log.notes}</p>
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
    </Card>
  );
}
