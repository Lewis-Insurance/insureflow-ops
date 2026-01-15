import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckSquare, Calendar, User, CheckCircle2 } from 'lucide-react';
import { useTasks, Task } from '@/hooks/useTasks';
import { TaskForm } from '@/components/tasks/TaskForm';
import { TaskDetail } from '@/components/tasks/TaskDetail';
import { formatDistanceToNow } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';

interface CustomerTasksSectionProps {
  accountId: string;
}

export function CustomerTasksSection({ accountId }: CustomerTasksSectionProps) {
  const { canEdit } = usePermissions();
  const { tasks, loading, fetchTasks, createTask, updateTask } = useTasks(accountId);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreateTask = async (taskData: Partial<Task>) => {
    await createTask(taskData);
  };

  const handleEditTask = async (taskData: Partial<Task>) => {
    if (editingTask?.id) {
      await updateTask(editingTask.id, taskData);
      setEditingTask(null);
    }
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  };

  const handleEditFromDetail = () => {
    setEditingTask(selectedTask);
    setTaskDetailOpen(false);
    setTaskFormOpen(true);
  };

  const handleQuickComplete = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation(); // Prevent opening task detail
    await updateTask(task.id, {
      status: 'completed',
      completed_at: new Date().toISOString()
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              <CardTitle>Tasks</CardTitle>
              <Badge variant="secondary">{activeTasks.length} active</Badge>
            </div>
            {canEdit && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingTask(null);
                  setTaskFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No tasks yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleViewTask(task)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{task.title}</h4>
                      {getStatusBadge(task.status)}
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {task.due_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Due {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}</span>
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
                  {/* Quick Complete Button */}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 shrink-0 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400"
                      onClick={(e) => handleQuickComplete(e, task)}
                      title="Mark Complete"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              ))}

              {completedTasks.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    Show {completedTasks.length} completed task{completedTasks.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="space-y-2 mt-2">
                    {completedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 border rounded opacity-60 hover:opacity-100 cursor-pointer"
                        onClick={() => handleViewTask(task)}
                      >
                        <div className="flex-1">
                          <h4 className="text-sm font-medium line-through">{task.title}</h4>
                        </div>
                        {getStatusBadge(task.status)}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskForm
        open={taskFormOpen}
        onOpenChange={setTaskFormOpen}
        task={editingTask}
        accountId={accountId}
        onSubmit={editingTask ? handleEditTask : handleCreateTask}
      />

      <TaskDetail
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        task={selectedTask}
        onEdit={handleEditFromDetail}
        onUpdate={() => fetchTasks()}
      />
    </>
  );
}
