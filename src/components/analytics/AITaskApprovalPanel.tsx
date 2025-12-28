import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAIGeneratedTasks,
  useApproveAITask,
  useDismissAITask,
  useDocumentInsightStats,
} from '@/hooks/useDocumentInsights';
import {
  Bot,
  Check,
  X,
  Edit,
  FileText,
  Clock,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';

interface AITaskApprovalPanelProps {
  agencyWorkspaceId?: string;
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

const confidenceToLabel = (confidence: number) => {
  if (confidence >= 0.9) return { label: 'High', color: 'text-green-600' };
  if (confidence >= 0.7) return { label: 'Medium', color: 'text-yellow-600' };
  return { label: 'Low', color: 'text-red-600' };
};

export function AITaskApprovalPanel({ agencyWorkspaceId }: AITaskApprovalPanelProps) {
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editedTask, setEditedTask] = useState<{
    title: string;
    description: string;
    priority: string;
  } | null>(null);

  const { data: tasks, isLoading } = useAIGeneratedTasks({
    status: 'pending',
    limit: 50,
  });
  const { data: stats } = useDocumentInsightStats(agencyWorkspaceId);

  const approveTask = useApproveAITask();
  const dismissTask = useDismissAITask();

  const handleApprove = (taskId: string) => {
    approveTask.mutate({ taskId });
  };

  const handleApproveWithEdits = () => {
    if (selectedTask && editedTask) {
      approveTask.mutate({
        taskId: selectedTask.id,
        modifications: editedTask,
      });
      setEditDialogOpen(false);
      setSelectedTask(null);
      setEditedTask(null);
    }
  };

  const handleDismiss = (taskId: string, reason?: string) => {
    dismissTask.mutate({ taskId, reason });
  };

  const openEditDialog = (task: any) => {
    setSelectedTask(task);
    setEditedTask({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
    });
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            AI-Suggested Tasks
          </h2>
          <p className="text-muted-foreground">
            Review and approve tasks automatically generated from document analysis
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents Processed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.jobs.completed || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.jobs.queued || 0} in queue
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700">
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">
              {stats?.tasks.pending || 0}
            </div>
            <p className="text-xs text-purple-600">tasks awaiting review</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {stats?.tasks.approved || 0}
            </div>
            <p className="text-xs text-green-600">tasks accepted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dismissed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.tasks.dismissed || 0}</div>
            <p className="text-xs text-muted-foreground">tasks rejected</p>
          </CardContent>
        </Card>
      </div>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Tasks Pending Approval
          </CardTitle>
          <CardDescription>
            AI-generated tasks require human approval before being added to your workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading tasks...
            </div>
          ) : tasks?.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                No tasks pending approval. Upload documents to generate AI suggestions.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {tasks?.map((task) => {
                  const confidence = confidenceToLabel(task.confidence || 0);

                  return (
                    <Card key={task.id} className="border-l-4 border-l-purple-500">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={priorityColors[task.priority]}>
                                {task.priority}
                              </Badge>
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Bot className="h-3 w-3" />
                                AI Generated
                              </Badge>
                              <span className={`text-xs ${confidence.color}`}>
                                {confidence.label} confidence ({((task.confidence || 0) * 100).toFixed(0)}%)
                              </span>
                            </div>

                            <h4 className="font-medium mb-1">{task.title}</h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              {task.description}
                            </p>

                            {task.evidence && task.evidence.length > 0 && (
                              <div className="mb-3">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Evidence:
                                </span>
                                <div className="mt-1 space-y-1">
                                  {task.evidence.slice(0, 2).map((e: string, idx: number) => (
                                    <div
                                      key={idx}
                                      className="text-xs bg-muted px-2 py-1 rounded"
                                    >
                                      {e}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {task.due_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Due: {format(new Date(task.due_at), 'MMM d')}
                                </span>
                              )}
                              {task.document_id && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  From document
                                </span>
                              )}
                              {task.suggested_assignee_role && (
                                <span>
                                  Suggested: {task.suggested_assignee_role}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(task.id)}
                              disabled={approveTask.isPending}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(task)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDismiss(task.id)}
                              disabled={dismissTask.isPending}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task Before Approval</DialogTitle>
            <DialogDescription>
              Modify the AI-suggested task before adding it to your workflow
            </DialogDescription>
          </DialogHeader>

          {editedTask && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editedTask.title}
                  onChange={(e) =>
                    setEditedTask({ ...editedTask, title: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editedTask.description}
                  onChange={(e) =>
                    setEditedTask({ ...editedTask, description: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={editedTask.priority}
                  onValueChange={(value) =>
                    setEditedTask({ ...editedTask, priority: value })
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
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApproveWithEdits} disabled={approveTask.isPending}>
              <Check className="h-4 w-4 mr-1" />
              Approve with Edits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AITaskApprovalPanel;
