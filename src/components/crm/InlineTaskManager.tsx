import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarIcon, Plus, CheckCircle2, Clock, AlertTriangle, ChevronDown, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/crm';

interface InlineTaskManagerProps {
  tasks: Task[];
  entityType: 'account' | 'contact';
  entityId: string;
  onTaskCreate: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => void;
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
  className?: string;
}

export function InlineTaskManager({
  tasks,
  entityType,
  entityId,
  onTaskCreate,
  onTaskUpdate,
  className
}: InlineTaskManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    due_at: '',
    assignee_id: '',
  });

  const handleCreateTask = () => {
    if (!newTask.title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a task title.",
        variant: "destructive",
      });
      return;
    }

    const task: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
      entity_type: entityType,
      entity_id: entityId,
      title: newTask.title.trim(),
      description: newTask.description.trim() || undefined,
      priority: newTask.priority,
      status: 'pending',
      due_at: newTask.due_at || undefined,
      assignee_id: newTask.assignee_id || undefined,
      completed_at: undefined,
    };

    onTaskCreate(task);
    
    // Reset form
    setNewTask({
      title: '',
      description: '',
      priority: 'medium',
      due_at: '',
      assignee_id: '',
    });
    setIsCreating(false);

    toast({
      title: "Task created",
      description: `"${task.title}" has been added.`,
    });
  };

  const handleTaskStatusUpdate = (taskId: string, status: Task['status']) => {
    const updates: Partial<Task> = { 
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : undefined
    };
    
    onTaskUpdate(taskId, updates);
    
    toast({
      title: "Task updated",
      description: `Task status changed to ${status}.`,
    });
  };

  const getPriorityIcon = (priority: Task['priority']) => {
    switch (priority) {
      case 'urgent':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'medium':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'low':
        return <Clock className="h-4 w-4 text-green-500" />;
    }
  };

  const getStatusBadge = (status: Task['status']) => {
    const variants = {
      pending: 'secondary',
      in_progress: 'default',
      completed: 'default',
      cancelled: 'secondary',
    } as const;

    const colors = {
      pending: 'text-yellow-600',
      in_progress: 'text-blue-600',
      completed: 'text-green-600',
      cancelled: 'text-gray-600',
    };

    return (
      <Badge variant={variants[status]} className={colors[status]}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const overdueTasks = tasks.filter(task => 
    task.due_at && 
    new Date(task.due_at) < new Date() && 
    task.status !== 'completed' && 
    task.status !== 'cancelled'
  );

  const activeTasks = tasks.filter(task => 
    task.status === 'pending' || task.status === 'in_progress'
  );

  const completedTasks = tasks.filter(task => 
    task.status === 'completed'
  );

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Tasks</CardTitle>
          <div className="flex items-center gap-2">
            {overdueTasks.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {overdueTasks.length} Overdue
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreating(!isCreating)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Quick create form */}
        {isCreating && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label htmlFor="task-title">Title *</Label>
                <Input
                  id="task-title"
                  placeholder="e.g., Follow up on renewal"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  placeholder="Optional task details..."
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select 
                    value={newTask.priority} 
                    onValueChange={(value: Task['priority']) => setNewTask({ ...newTask, priority: value })}
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
                
                <div>
                  <Label>Assignee</Label>
                  <Select 
                    value={newTask.assignee_id} 
                    onValueChange={(value) => setNewTask({ ...newTask, assignee_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user1">John Smith</SelectItem>
                      <SelectItem value="user2">Sarah Johnson</SelectItem>
                      <SelectItem value="user3">Mike Davis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleCreateTask}>
                  Create Task
                </Button>
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active tasks */}
        {activeTasks.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">Active Tasks</h4>
            {activeTasks.map(task => (
              <Card key={task.id} className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getPriorityIcon(task.priority)}
                        <span className="font-medium">{task.title}</span>
                        {getStatusBadge(task.status)}
                      </div>
                      
                      {task.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {task.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {task.due_at && (
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            <span className={cn(
                              new Date(task.due_at) < new Date() ? 'text-red-600 font-medium' : ''
                            )}>
                              Due {format(new Date(task.due_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        )}
                        
                        {task.assignee_id && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>Assigned</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTaskStatusUpdate(task.id, 'completed')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Completed tasks (collapsible) */}
        {completedTasks.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="text-sm text-muted-foreground">
                  Completed Tasks ({completedTasks.length})
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2">
              {completedTasks.map(task => (
                <Card key={task.id} className="border-l-4 border-l-green-500 opacity-60">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="font-medium line-through">{task.title}</span>
                      {getStatusBadge(task.status)}
                    </div>
                    
                    {task.completed_at && (
                      <p className="text-xs text-muted-foreground">
                        Completed {format(new Date(task.completed_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {tasks.length === 0 && !isCreating && (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No tasks yet</p>
            <p className="text-sm">Click "Add Task" to get started</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}