import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTasks, Task, TaskStatus } from '@/hooks/useTasks';
import { Calendar, User, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { TaskEditModal } from './TaskEditModal';

interface TaskKanbanBoardProps {
  accountId?: string;
}

const statusColumns: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'To Do', color: 'bg-slate-100' },
  { status: 'in_progress', label: 'In Progress', color: 'bg-blue-100' },
  { status: 'completed', label: 'Completed', color: 'bg-green-100' },
  { status: 'cancelled', label: 'Cancelled', color: 'bg-red-100' },
];

export function TaskKanbanBoard({ accountId }: TaskKanbanBoardProps) {
  const { tasks, loading, fetchTasks, updateTask } = useTasks(accountId);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter(task => task.status === status);
  };

  const handleDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (status: TaskStatus) => {
    if (!draggedTask) return;

    if (draggedTask.status !== status) {
      await updateTask(draggedTask.id, { status });
    }
    setDraggedTask(null);
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setEditModalOpen(true);
  };
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading tasks...</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statusColumns.map(({ status, label, color }) => (
        <div
          key={status}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(status)}
          className="flex flex-col gap-2"
        >
          <Card className={color}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                {label}
                <Badge variant="secondary" className="ml-2">
                  {getTasksByStatus(status).length}
                </Badge>
              </CardTitle>
            </CardHeader>
          </Card>

          <div className="space-y-2 min-h-[200px]">
            {getTasksByStatus(status).map((task) => (
              <Card
                key={task.id}
                draggable
                onDragStart={() => handleDragStart(task)}
                onClick={() => handleTaskClick(task)}
                className="cursor-pointer cursor-move hover:shadow-md transition-shadow"
              >
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
                      <Badge variant={getPriorityColor(task.priority)} className="shrink-0">
                        {task.priority}
                      </Badge>
                    </div>
                    
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {task.due_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(task.due_at), 'MMM d')}
                        </div>
                      )}
                      {task.assigned_to && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Assigned
                        </div>
                      )}
                      {task.status === 'cancelled' && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <AlertCircle className="h-3 w-3" />
                          Cancelled
                        </div>
                      )}
                    </div>

                    {task.category && (
                      <Badge variant="outline" className="text-xs">
                        {task.category}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>

      <TaskEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        task={editingTask as any}
        onTaskUpdate={() => {
          fetchTasks();
          setEditModalOpen(false);
        }}
      />
    </>
  );
}