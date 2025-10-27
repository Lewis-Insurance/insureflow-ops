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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { LeadScoreBreakdown } from "./LeadScoreBreakdown";

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
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);

  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  // Fetch lead tasks - simplified to show recent tasks
  const { data: leadTasks } = useQuery<any[]>({
    queryKey: ["tasks", "lead", lead?.id ?? ""] as const,
    queryFn: async () => {
      if (!lead?.id) return [];
      
      try {
        // Show recent tasks - tasks table doesn't have lead relationships
        const response = await (supabase as any)
          .from("tasks")
          .select("*")
          .order("due_at", { ascending: true })
          .limit(10);

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
  const { data: activities } = useQuery<any[]>({
    queryKey: ["activities", "lead", lead?.id ?? ""] as const,
    queryFn: async () => {
      if (!lead?.id) return [];
      
      try {
        const response = await (supabase as any)
          .from("lead_activities")
          .select("*")
          .eq("lead_id", lead.id)
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

  // Fetch assigned user profile
  const { data: assignedUser } = useQuery({
    queryKey: ["profile", lead?.assigned_to ?? ""] as const,
    queryFn: async () => {
      if (!lead?.assigned_to) return null;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", lead.assigned_to)
        .single();

      if (error) {
        console.error("Error fetching assigned user:", error);
        return null;
      }
      return data;
    },
    enabled: !!lead?.assigned_to && open,
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: any }) => {
      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", "lead", lead?.id] });
      setSelectedTask(null);
      setEditingTask(null);
      toast.success("Task updated successfully");
    },
    onError: (error: any) => {
      toast.error("Failed to update task: " + error.message);
    },
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      if (!lead?.id) return;
      
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Fetch user profile for name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const userName = profile?.full_name || "Unknown User";
      const currentNotes = lead.notes || "";
      const timestamp = new Date().toISOString();
      const formattedNote = `[${format(new Date(timestamp), "PPpp")} - ${userName}]\n${note}\n\n`;
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
                  {((lead as any).city || (lead as any).state || (lead as any).zip_code) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground opacity-0" />
                      {isEditing ? (
                        <div className="flex gap-2 flex-1">
                          <Input
                            placeholder="City"
                            value={(editedLead as any).city !== undefined ? (editedLead as any).city : (lead as any).city || ""}
                            onChange={(e) =>
                              setEditedLead({ ...editedLead, city: e.target.value } as any)
                            }
                            className="flex-1"
                          />
                          <Input
                            placeholder="State"
                            value={(editedLead as any).state !== undefined ? (editedLead as any).state : (lead as any).state || ""}
                            onChange={(e) =>
                              setEditedLead({ ...editedLead, state: e.target.value } as any)
                            }
                            className="w-20"
                          />
                          <Input
                            placeholder="Zip"
                            value={(editedLead as any).zip_code !== undefined ? (editedLead as any).zip_code : (lead as any).zip_code || ""}
                            onChange={(e) =>
                              setEditedLead({ ...editedLead, zip_code: e.target.value } as any)
                            }
                            className="w-24"
                          />
                        </div>
                      ) : (
                        <span className="text-sm">
                          {[
                            (lead as any).city,
                            (lead as any).state,
                            (lead as any).zip_code
                          ].filter(Boolean).join(", ")}
                        </span>
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

                </div>
              </div>

              <Separator />

              <LeadScoreBreakdown
                leadId={lead.id}
                score={lead.lead_score}
                factors={(lead as any).scoring_factors}
                recommendation={(lead as any).scoring_recommendation}
                lastScoredAt={(lead as any).last_scored_at}
              />

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
                      <span className="text-sm">
                        Assigned to: {assignedUser?.full_name || "Loading..."}
                      </span>
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
                          <span className="text-sm font-medium">{activity.title}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(activity.created_at), "PPp")}
                        </span>
                      </div>
                      {activity.description && (
                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                      )}
                      {(activity.old_value || activity.new_value) && (
                        <div className="flex items-center gap-2 text-xs">
                          {activity.old_value && (
                            <span className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded">
                              {activity.old_value}
                            </span>
                          )}
                          <span className="text-muted-foreground">→</span>
                          {activity.new_value && (
                            <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded">
                              {activity.new_value}
                            </span>
                          )}
                        </div>
                      )}
                      {activity.created_by && (
                        <p className="text-xs text-muted-foreground">
                          By: {activity.created_by.slice(0, 8)}
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
                      className="border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setSelectedTask(task);
                        setEditingTask({ ...task });
                      }}
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

      {/* Task Edit Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => {
        if (!open) {
          setSelectedTask(null);
          setEditingTask(null);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update task details and status
            </DialogDescription>
          </DialogHeader>
          
          {editingTask && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  value={editingTask.title || ""}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={editingTask.description || ""}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-status">Status</Label>
                <Select
                  value={editingTask.status || "pending"}
                  onValueChange={(value) => setEditingTask({ ...editingTask, status: value })}
                >
                  <SelectTrigger id="task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-priority">Priority</Label>
                <Select
                  value={editingTask.priority || "medium"}
                  onValueChange={(value) => setEditingTask({ ...editingTask, priority: value })}
                >
                  <SelectTrigger id="task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingTask.due_at && (
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{format(new Date(editingTask.due_at), "PPP")}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedTask(null);
                setEditingTask(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingTask && selectedTask) {
                  updateTaskMutation.mutate({
                    taskId: selectedTask.id,
                    updates: {
                      title: editingTask.title,
                      description: editingTask.description,
                      status: editingTask.status,
                      priority: editingTask.priority,
                    },
                  });
                }
              }}
              disabled={updateTaskMutation.isPending}
            >
              {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
