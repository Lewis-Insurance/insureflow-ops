import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { Lead, LeadStatus } from "@/types/leads";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Clock,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit2,
  Save,
} from "lucide-react";
import { format } from "date-fns";

interface LeadDetailViewProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailView({ lead, open, onOpenChange }: LeadDetailViewProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState<Partial<Lead>>({});
  const [newNote, setNewNote] = useState("");

  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  // Fetch lead tasks
  const { data: leadTasks } = useQuery({
    queryKey: ["tasks", "lead", lead?.id],
    queryFn: async () => {
      if (!lead?.id) return [];
      
      try {
        const response = await (supabase as any)
          .from("tasks")
          .select("*")
          .eq("related_to_type", "lead")
          .eq("related_to_id", lead.id)
          .order("due_at", { ascending: true });

        if (response.error) throw response.error;
        return response.data || [];
      } catch (error) {
        console.error("Error fetching tasks:", error);
        return [];
      }
    },
    enabled: !!lead?.id && open,
  });

  // Fetch lead activities (audit logs)
  const { data: activities } = useQuery({
    queryKey: ["activities", "lead", lead?.id],
    queryFn: async () => {
      if (!lead?.id) return [];
      
      try {
        const response = await (supabase as any)
          .from("audit_logs")
          .select("*")
          .eq("entity_type", "lead")
          .eq("entity_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (response.error) throw response.error;
        return response.data || [];
      } catch (error) {
        console.error("Error fetching activities:", error);
        return [];
      }
    },
    enabled: !!lead?.id && open,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      if (!lead?.id) return;
      
      const currentNotes = lead.notes || "";
      const timestamp = new Date().toISOString();
      const formattedNote = `[${format(new Date(timestamp), "PPpp")}]\n${note}\n\n`;
      const updatedNotes = formattedNote + currentNotes;

      const { error } = await supabase
        .from("leads")
        .update({ 
          notes: updatedNotes,
          last_contact_at: new Date().toISOString()
        })
        .eq("id", lead.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activities", "lead", lead?.id] });
      setNewNote("");
      toast.success("Note added successfully");
    },
    onError: (error) => {
      toast.error("Failed to add note: " + error.message);
    },
  });

  const handleSave = () => {
    if (!lead?.id) return;

    updateLead.mutate(
      { id: lead.id, ...editedLead },
      {
        onSuccess: () => {
          setIsEditing(false);
          setEditedLead({});
          toast.success("Lead updated successfully");
        },
      }
    );
  };

  const handleDelete = () => {
    if (!lead?.id) return;
    if (!confirm("Are you sure you want to delete this lead? This action cannot be undone.")) {
      return;
    }

    deleteLead.mutate(lead.id, {
      onSuccess: () => {
        onOpenChange(false);
        toast.success("Lead deleted successfully");
      },
    });
  };

  const getLeadScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-blue-600 bg-blue-50";
    if (score >= 40) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getStatusColor = (status: LeadStatus) => {
    const colors: Record<LeadStatus, string> = {
      new: "bg-blue-100 text-blue-800",
      contacted: "bg-purple-100 text-purple-800",
      qualified: "bg-green-100 text-green-800",
      quoted: "bg-yellow-100 text-yellow-800",
      won: "bg-emerald-100 text-emerald-800",
      lost: "bg-red-100 text-red-800",
      nurturing: "bg-orange-100 text-orange-800",
    };
    return colors[status];
  };

  if (!lead) return null;

  const insuranceTypes = (lead as any).insurance_types || [];
  const address = (lead as any).address_line1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={editedLead.first_name !== undefined ? editedLead.first_name : lead.first_name}
                    onChange={(e) =>
                      setEditedLead({ ...editedLead, first_name: e.target.value })
                    }
                    placeholder="First name"
                    className="text-lg font-semibold"
                  />
                  <Input
                    value={editedLead.last_name !== undefined ? editedLead.last_name : lead.last_name}
                    onChange={(e) =>
                      setEditedLead({ ...editedLead, last_name: e.target.value })
                    }
                    placeholder="Last name"
                    className="text-lg font-semibold"
                  />
                </div>
              ) : (
                <SheetTitle className="text-2xl">
                  {lead.first_name} {lead.last_name}
                </SheetTitle>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={getStatusColor(lead.status)}>
                  {lead.status.replace("_", " ").toUpperCase()}
                </Badge>
                <Badge className={getLeadScoreColor(lead.lead_score)}>
                  Score: {lead.lead_score}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button onClick={handleSave} size="sm" disabled={updateLead.isPending}>
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedLead({});
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => setIsEditing(true)} size="sm" variant="outline">
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    onClick={handleDelete}
                    size="sm"
                    variant="destructive"
                    disabled={deleteLead.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
          <SheetDescription>
            Lead ID: {lead.id.slice(0, 8)} • Created {format(new Date(lead.created_at), "PPP")}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">
              Activity
              {activities && activities.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activities.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks
              {leadTasks && leadTasks.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {leadTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          {/* DETAILS TAB */}
          <TabsContent value="details" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-3">Contact Information</h3>
                <div className="space-y-3">
                  {lead.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {isEditing ? (
                        <Input
                          type="email"
                          value={editedLead.email !== undefined ? editedLead.email : lead.email}
                          onChange={(e) =>
                            setEditedLead({ ...editedLead, email: e.target.value })
                          }
                        />
                      ) : (
                        <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                          {lead.email}
                        </a>
                      )}
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {isEditing ? (
                        <Input
                          type="tel"
                          value={editedLead.phone !== undefined ? editedLead.phone : lead.phone}
                          onChange={(e) =>
                            setEditedLead({ ...editedLead, phone: e.target.value })
                          }
                        />
                      ) : (
                        <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                          {lead.phone}
                        </a>
                      )}
                    </div>
                  )}
                  {address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {isEditing ? (
                        <Input
                          value={(editedLead as any).address_line1 !== undefined ? (editedLead as any).address_line1 : address}
                          onChange={(e) =>
                            setEditedLead({ ...editedLead, address_line1: e.target.value } as any)
                          }
                        />
                      ) : (
                        <span className="text-sm">{address}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3">Lead Information</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      {isEditing ? (
                        <Select
                          value={editedLead.status || lead.status}
                          onValueChange={(value) =>
                            setEditedLead({ ...editedLead, status: value as LeadStatus })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="qualified">Qualified</SelectItem>
                            <SelectItem value="quoted">Quoted</SelectItem>
                            <SelectItem value="won">Won</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                            <SelectItem value="nurturing">Nurturing</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-medium mt-1">
                          {lead.status.replace("_", " ").toUpperCase()}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Lead Score</Label>
                      <p className="text-sm font-medium mt-1">{lead.lead_score}</p>
                    </div>
                  </div>

                  {insuranceTypes.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Insurance Types</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {insuranceTypes.map((type) => (
                          <Badge key={type} variant="outline">
                            {type.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {lead.current_carrier && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Current Carrier</Label>
                      <p className="text-sm font-medium mt-1">{lead.current_carrier}</p>
                    </div>
                  )}

                  {lead.current_premium && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Current Premium</Label>
                      <p className="text-sm font-medium mt-1">
                        ${lead.current_premium.toLocaleString()}/year
                      </p>
                    </div>
                  )}

                  {lead.decision_timeframe && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Decision Timeframe</Label>
                      <p className="text-sm font-medium mt-1 capitalize">
                        {lead.decision_timeframe.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3">Timeline</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created:</span>
                    <span className="font-medium">{format(new Date(lead.created_at), "PPp")}</span>
                  </div>
                  {lead.last_contact_at && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Last Contact:</span>
                      <span className="font-medium">
                        {format(new Date(lead.last_contact_at), "PPp")}
                      </span>
                    </div>
                  )}
                  {lead.converted_at && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-muted-foreground">Converted:</span>
                      <span className="font-medium">
                        {format(new Date(lead.converted_at), "PPp")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {lead.assigned_to && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Assignment</h3>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Assigned to: {lead.assigned_to.slice(0, 8)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* ACTIVITY TAB */}
          <TabsContent value="activity">
            <ScrollArea className="h-[500px] pr-4">
              {activities && activities.length > 0 ? (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{activity.action}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(activity.created_at), "PPp")}
                        </span>
                      </div>
                      {activity.diff && (
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(activity.diff, null, 2)}
                        </pre>
                      )}
                      {activity.user_id && (
                        <p className="text-xs text-muted-foreground">
                          By: {activity.user_id.slice(0, 8)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2" />
                  <p>No activity recorded yet</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* TASKS TAB */}
          <TabsContent value="tasks">
            <ScrollArea className="h-[500px] pr-4">
              {leadTasks && leadTasks.length > 0 ? (
                <div className="space-y-3">
                  {leadTasks.map((task) => (
                    <div
                      key={task.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium">{task.title}</h4>
                        <Badge variant={task.status === "completed" ? "default" : "secondary"}>
                          {task.status}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                      )}
                      {task.due_at && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Due: {format(new Date(task.due_at), "PPP")}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2" />
                  <p>No tasks for this lead</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* NOTES TAB */}
          <TabsContent value="notes" className="space-y-4">
            <div>
              <Label htmlFor="new-note">Add Note</Label>
              <Textarea
                id="new-note"
                placeholder="Enter your note here..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={4}
                className="mt-2"
              />
              <Button
                onClick={() => addNoteMutation.mutate(newNote)}
                disabled={!newNote.trim() || addNoteMutation.isPending}
                className="mt-2"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Add Note
              </Button>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-3">Previous Notes</h3>
              <ScrollArea className="h-[400px] pr-4">
                {lead.notes ? (
                  <div className="whitespace-pre-wrap text-sm space-y-4">
                    {lead.notes.split("\n\n").map((note, index) => (
                      <div key={index} className="border-l-2 border-muted pl-4 py-2">
                        {note}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mb-2" />
                    <p>No notes yet</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
