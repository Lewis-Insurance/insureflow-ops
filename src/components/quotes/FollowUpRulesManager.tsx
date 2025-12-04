import { useState } from "react";
import { useFollowUpRules, useCreateFollowUpRule, useUpdateFollowUpRule, useToggleRuleStatus } from "@/hooks/useQuoteFollowups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, AlertCircle, Clock, Mail, MessageSquare, Bell } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { FollowUpRule } from "@/hooks/useQuoteFollowups";

export function FollowUpRulesManager() {
  const { data: rules, isLoading, error } = useFollowUpRules();
  const createRule = useCreateFollowUpRule();
  const updateRule = useUpdateFollowUpRule();
  const toggleStatus = useToggleRuleStatus();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FollowUpRule | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    trigger_type: "quote_created",
    delay_hours: 24,
    max_follow_ups: 3,
    follow_up_interval_hours: 72,
    action_type: "create_task",
    task_priority: "medium",
    min_quote_score: null as number | null,
    max_quote_score: null as number | null,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      trigger_type: "quote_created",
      delay_hours: 24,
      max_follow_ups: 3,
      follow_up_interval_hours: 72,
      action_type: "create_task",
      task_priority: "medium",
      min_quote_score: null,
      max_quote_score: null,
    });
    setEditingRule(null);
  };

  const handleOpenDialog = (rule?: FollowUpRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        description: rule.description || "",
        trigger_type: rule.trigger_type,
        delay_hours: rule.delay_hours,
        max_follow_ups: rule.max_follow_ups || 3,
        follow_up_interval_hours: rule.follow_up_interval_hours || 72,
        action_type: rule.action_type,
        task_priority: rule.task_priority || "medium",
        min_quote_score: rule.min_quote_score,
        max_quote_score: rule.max_quote_score,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingRule) {
      updateRule.mutate(
        { id: editingRule.id, updates: formData },
        {
          onSuccess: () => {
            setIsDialogOpen(false);
            resetForm();
          },
        }
      );
    } else {
      createRule.mutate(formData, {
        onSuccess: () => {
          setIsDialogOpen(false);
          resetForm();
        },
      });
    }
  };

  const triggerTypeLabels: Record<string, string> = {
    quote_created: "Quote Created",
    quote_sent: "Quote Sent",
    quote_viewed: "Quote Viewed",
    quote_expired: "Quote Expired",
    quote_not_responded: "No Response",
    quote_score_threshold: "Score Threshold",
    days_since_activity: "Days Since Activity",
  };

  const actionTypeIcons: Record<string, React.ReactNode> = {
    create_task: <Clock className="h-4 w-4" />,
    send_email: <Mail className="h-4 w-4" />,
    send_sms: <MessageSquare className="h-4 w-4" />,
    create_notification: <Bell className="h-4 w-4" />,
    all: <Bell className="h-4 w-4" />,
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load rules: {error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Follow-Up Rules</CardTitle>
            <CardDescription>
              Configure automatic follow-up triggers for quotes
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                New Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingRule ? "Edit Follow-Up Rule" : "Create Follow-Up Rule"}
                  </DialogTitle>
                  <DialogDescription>
                    Define when and how to automatically follow up on quotes
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Basic Info */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Rule Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., High-Value Quote Follow-Up"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      placeholder="Describe when this rule should trigger..."
                      rows={2}
                    />
                  </div>

                  {/* Trigger Configuration */}
                  <div className="space-y-2">
                    <Label htmlFor="trigger_type">Trigger Type *</Label>
                    <Select
                      value={formData.trigger_type}
                      onValueChange={(value) =>
                        setFormData({ ...formData, trigger_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(triggerTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="delay_hours">Delay (hours) *</Label>
                      <Input
                        id="delay_hours"
                        type="number"
                        min="0"
                        value={formData.delay_hours}
                        onChange={(e) =>
                          setFormData({ ...formData, delay_hours: parseInt(e.target.value) })
                        }
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max_follow_ups">Max Follow-Ups</Label>
                      <Input
                        id="max_follow_ups"
                        type="number"
                        min="1"
                        max="10"
                        value={formData.max_follow_ups}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            max_follow_ups: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="follow_up_interval_hours">
                      Follow-Up Interval (hours)
                    </Label>
                    <Input
                      id="follow_up_interval_hours"
                      type="number"
                      min="1"
                      value={formData.follow_up_interval_hours}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          follow_up_interval_hours: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>

                  {/* Score Filters */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="min_quote_score">Min Quote Score</Label>
                      <Input
                        id="min_quote_score"
                        type="number"
                        min="0"
                        max="100"
                        value={formData.min_quote_score || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            min_quote_score: e.target.value
                              ? parseInt(e.target.value)
                              : null,
                          })
                        }
                        placeholder="No minimum"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max_quote_score">Max Quote Score</Label>
                      <Input
                        id="max_quote_score"
                        type="number"
                        min="0"
                        max="100"
                        value={formData.max_quote_score || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            max_quote_score: e.target.value
                              ? parseInt(e.target.value)
                              : null,
                          })
                        }
                        placeholder="No maximum"
                      />
                    </div>
                  </div>

                  {/* Action Configuration */}
                  <div className="space-y-2">
                    <Label htmlFor="action_type">Action Type *</Label>
                    <Select
                      value={formData.action_type}
                      onValueChange={(value) =>
                        setFormData({ ...formData, action_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="create_task">Create Task</SelectItem>
                        <SelectItem value="send_email">Send Email</SelectItem>
                        <SelectItem value="send_sms">Send SMS</SelectItem>
                        <SelectItem value="create_notification">
                          Create Notification
                        </SelectItem>
                        <SelectItem value="all">All Actions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.action_type === "create_task" ||
                    formData.action_type === "all") && (
                    <div className="space-y-2">
                      <Label htmlFor="task_priority">Task Priority</Label>
                      <Select
                        value={formData.task_priority}
                        onValueChange={(value) =>
                          setFormData({ ...formData, task_priority: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createRule.isPending || updateRule.isPending}
                  >
                    {createRule.isPending || updateRule.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : editingRule ? (
                      "Update Rule"
                    ) : (
                      "Create Rule"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {!rules || rules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No follow-up rules configured</p>
            <p className="text-sm">Create your first rule to automate quote follow-ups</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{rule.name}</span>
                      {!rule.is_active && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>

                    {rule.description && (
                      <p className="text-sm text-muted-foreground">
                        {rule.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">
                        {triggerTypeLabels[rule.trigger_type] || rule.trigger_type}
                      </Badge>
                      <Badge variant="outline">
                        Delay: {rule.delay_hours}h
                      </Badge>
                      <Badge variant="outline">
                        Max: {rule.max_follow_ups} attempts
                      </Badge>
                      <Badge variant="outline">
                        Interval: {rule.follow_up_interval_hours}h
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        {actionTypeIcons[rule.action_type]}
                        {rule.action_type}
                      </Badge>
                      {rule.min_quote_score && (
                        <Badge variant="outline">
                          Score ≥ {rule.min_quote_score}
                        </Badge>
                      )}
                      {rule.max_quote_score && (
                        <Badge variant="outline">
                          Score ≤ {rule.max_quote_score}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => toggleStatus.mutate(rule.id)}
                      disabled={toggleStatus.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
