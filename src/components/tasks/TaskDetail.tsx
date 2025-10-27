import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { TaskChecklist } from './TaskChecklist';
import { TaskTimeTracker } from './TaskTimeTracker';
import { TaskActivityFeed } from './TaskActivityFeed';
import { TaskDependencyVisualizer } from './TaskDependencyVisualizer';
import { TaskReminderManager } from './TaskReminderManager';
import { TaskRecurrenceForm } from './TaskRecurrenceForm';
import {
  Calendar,
  User,
  Clock,
  MessageSquare,
  Paperclip,
  Send,
  FileText,
  Trash2,
} from 'lucide-react';
import { Task, TaskComment, TaskAttachment, useTasks, TaskStatus } from '@/hooks/useTasks';
import { format, formatDistanceToNow } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfiles } from '@/hooks/useProfiles';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

interface TaskDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onEdit: () => void;
  onUpdate: () => void;
}

export function TaskDetail({ open, onOpenChange, task, onEdit, onUpdate }: TaskDetailProps) {
  const { canEdit } = usePermissions();
  const { profiles } = useProfiles();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const {
    fetchComments,
    addComment,
    fetchAttachments,
    removeAttachment,
    updateTask,
  } = useTasks();

  useEffect(() => {
    if (task?.id && open) {
      Promise.all([loadComments(), loadAttachments()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, open]);

  const loadComments = async () => {
    if (!task?.id) return;
    try {
      setLoadingComments(true);
      const data = await fetchComments(task.id);
      setComments(data);
    } catch (error) {
      console.error('Error loading comments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load comments',
        variant: 'destructive',
      });
    } finally {
      setLoadingComments(false);
    }
  };

  const loadAttachments = async () => {
    if (!task?.id) return;
    try {
      setLoadingAttachments(true);
      const data = await fetchAttachments(task.id);
      setAttachments(data);
    } catch (error) {
      console.error('Error loading attachments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load attachments',
        variant: 'destructive',
      });
    } finally {
      setLoadingAttachments(false);
    }
  };

  const handleAddComment = async () => {
    if (!task?.id || !newComment.trim()) return;
    
    try {
      const success = await addComment(task.id, newComment);
      if (success) {
        setNewComment('');
        await loadComments();
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        title: 'Error',
        description: 'Failed to add comment',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    try {
      const success = await removeAttachment(attachmentId);
      if (success) {
        await loadAttachments();
      }
    } catch (error) {
      console.error('Error removing attachment:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove attachment',
        variant: 'destructive',
      });
    }
  };

  const handleViewAttachment = async (document: any) => {
    if (!document?.storage_path) return;
    
    try {
      const { data, error } = await supabase.storage
        .from(document.storage_bucket || 'documents')
        .createSignedUrl(document.storage_path, 3600);

      if (error) throw error;
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing attachment:', error);
      toast({
        title: 'Error',
        description: 'Failed to open attachment',
        variant: 'destructive',
      });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!task?.id) return;
    
    try {
      const success = await updateTask(task.id, { 
        status: newStatus as Database['public']['Enums']['task_status'],
        completed_at: newStatus === 'completed' ? new Date().toISOString() : undefined,
      });
      if (success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task status',
        variant: 'destructive',
      });
    }
  };

  const handleAssigneeChange = async (assigneeId: string) => {
    if (!task?.id) return;
    
    try {
      const success = await updateTask(task.id, {
        assignee_id: assigneeId === 'unassigned' ? null : assigneeId,
      });
      if (success) {
        onUpdate();
        toast({
          title: 'Success',
          description: 'Task assignment updated',
        });
      }
    } catch (error) {
      console.error('Error updating assignee:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task assignment',
        variant: 'destructive',
      });
    }
  };

  if (!task) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-800';
      case 'high':
        return 'text-red-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-xl mb-2">{task.title}</DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={getStatusColor(task.status)}>
                  {task.status.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className={getPriorityColor(task.priority)}>
                  {task.priority} priority
                </Badge>
                <Badge variant="outline">{task.category}</Badge>
              </div>
            </div>
            {canEdit && (
              <Button onClick={onEdit} variant="outline" size="sm">
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Description */}
              {task.description && (
                <div>
                  <h4 className="font-medium mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                </div>
              )}

              {/* Task Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {/* Customer & Policy Info from metadata */}
                {task.metadata && (
                  <>
                    {(task.metadata as any).renewal_customer_name && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Customer</div>
                          <div className="font-medium">{(task.metadata as any).renewal_customer_name}</div>
                        </div>
                      </div>
                    )}
                    
                    {(task.metadata as any).renewal_policy_number && (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Policy Number</div>
                          <div className="font-medium">{(task.metadata as any).renewal_policy_number}</div>
                        </div>
                      </div>
                    )}
                    
                    {(task.metadata as any).customer_name && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Customer</div>
                          <div className="font-medium">{(task.metadata as any).customer_name}</div>
                        </div>
                      </div>
                    )}
                    
                    {(task.metadata as any).policy_number && (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Policy Number</div>
                          <div className="font-medium">{(task.metadata as any).policy_number}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {task.due_at && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Due Date</div>
                      <div>{format(new Date(task.due_at), 'PPP')}</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</div>
                  </div>
                </div>
              </div>

              {/* Status & Assignment */}
              {canEdit && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Status</h4>
                    <Select value={task.status} onValueChange={handleStatusChange}>
                      <SelectTrigger className="w-full">
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
                  
                  <div>
                    <h4 className="font-medium mb-2">Assigned To</h4>
                    <Select 
                      value={task.assignee_id || 'unassigned'} 
                      onValueChange={handleAssigneeChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <Separator />

              {/* Attachments */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="h-4 w-4" />
                  <h4 className="font-medium">Attachments ({attachments.length})</h4>
                </div>
                {loadingAttachments ? (
                  <div className="text-sm text-muted-foreground">Loading attachments...</div>
                ) : attachments.length > 0 ? (
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <Card 
                        key={attachment.id}
                        className="cursor-pointer hover:bg-accent transition-colors"
                        onClick={() => handleViewAttachment(attachment.document)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="text-sm font-medium">
                                  {attachment.document?.filename || 'Unknown file'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {attachment.document?.size_bytes
                                    ? `${Math.round(attachment.document.size_bytes / 1024)} KB`
                                    : 'Size unknown'}
                                </div>
                              </div>
                            </div>
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveAttachment(attachment.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No attachments</div>
                )}
              </div>

              <Separator />

              {/* Checklist Section */}
              <TaskChecklist taskId={task.id} />

              <Separator />

              {/* Time Tracking */}
              <TaskTimeTracker taskId={task.id} />

              <Separator />

              {/* Dependencies */}
              <TaskDependencyVisualizer taskId={task.id} accountId={task.account_id} />

              <Separator />

              {/* Reminders */}
              <TaskReminderManager taskId={task.id} />

              <Separator />

              {/* Recurrence */}
              <TaskRecurrenceForm taskId={task.id} />

              <Separator />

              {/* Activity Feed */}
              <TaskActivityFeed taskId={task.id} />

              <Separator />

              {/* Comments */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="h-4 w-4" />
                  <h4 className="font-medium">Comments ({comments.length})</h4>
                </div>

                {loadingComments ? (
                  <div className="text-sm text-muted-foreground">Loading comments...</div>
                ) : (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <Card key={comment.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2">
                            <User className="h-4 w-4 mt-1 text-muted-foreground" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium">
                                  {comment.user?.full_name || 'Unknown User'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">{comment.comment_text}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Add Comment */}
                {canEdit && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                    />
                    <Button
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      size="sm"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Add Comment
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
