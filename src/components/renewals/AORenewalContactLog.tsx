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
import { Phone, Mail, User, MessageSquare, Calendar, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

export function AORenewalContactLog({ renewalId }: AORenewalContactLogProps) {
  const [contactDate, setContactDate] = useState(new Date().toISOString().split("T")[0]);
  const [contactMethod, setContactMethod] = useState<string>("phone");
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

      // Fetch user names for all logs
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

      const { error } = await supabase.from("ao_renewal_contact_log").insert({
        renewal_id: renewalId,
        contact_date: data.contact_date,
        contact_method: data.contact_method,
        status: data.status && data.status !== 'no_change' ? data.status : null,
        notes: data.notes.trim(),
        created_by: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate contact log and renewal data
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-contact-log", renewalId] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewal", renewalId] });
      queryClient.invalidateQueries({ queryKey: ["ao-renewals-stats"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-ao-renewals"] });
      
      // Invalidate analytics queries
      queryClient.invalidateQueries({ queryKey: ["ao-analytics-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["ao-pipeline-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-priority-summary"] });
      queryClient.invalidateQueries({ queryKey: ["ao-monthly-forecast"] });
      queryClient.invalidateQueries({ queryKey: ["ao-at-risk-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["ao-top-renewals"] });
      
      setNotes("");
      setContactDate(new Date().toISOString().split("T")[0]);
      setContactMethod("phone");
      setStatus("");
      toast({
        title: "Success",
        description: "Contact logged successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log contact",
        variant: "destructive",
      });
    },
  });

  const handleAddLog = () => {
    if (!notes.trim() || !contactDate) return;
    addLogMutation.mutate({
      contact_date: contactDate,
      contact_method: contactMethod,
      status,
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
                  <SelectItem value="phone">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Call
                    </div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </div>
                  </SelectItem>
                  <SelectItem value="in_person">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      In Person
                    </div>
                  </SelectItem>
                  <SelectItem value="sms">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      SMS
                    </div>
                  </SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Update Status</Label>
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
          <Button
            onClick={handleAddLog}
            disabled={!notes.trim() || !contactDate || addLogMutation.isPending}
            size="sm"
          >
            {addLogMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4 mr-2" />
            )}
            Log Contact
          </Button>
        </div>

        <Separator />

        {/* Contact History */}
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading contact history...
            </div>
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
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {log.notes}
                    </p>
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
