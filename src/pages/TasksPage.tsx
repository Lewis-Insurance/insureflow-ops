import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { TaskKanbanBoard } from '@/components/tasks/TaskKanbanBoard';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { MyTasksDashboard } from '@/components/tasks/MyTasksDashboard';
import { TaskAnalyticsDashboard } from '@/components/tasks/TaskAnalyticsDashboard';
import { TaskForm } from '@/components/tasks/TaskForm';
import { useTasks } from '@/hooks/useTasks';
import { useToast } from '@/hooks/use-toast';
import { LayoutGrid, Calendar, User, BarChart3, Plus } from 'lucide-react';

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState('my-tasks');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { createTask } = useTasks();
  const { toast } = useToast();

const handleCreateTask = async (taskData: any) => {
  try {
    await createTask(taskData);
    setCreateDialogOpen(false);
    setRefreshKey((k) => k + 1);
    toast({
      title: 'Success',
      description: 'Task created successfully',
    });
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to create task',
      variant: 'destructive',
    });
  }
};

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tasks</h1>
            <p className="text-muted-foreground">
              Manage your tasks with multiple views
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Task
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-tasks" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              My Tasks
            </TabsTrigger>
            <TabsTrigger value="kanban" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Kanban Board
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-tasks" className="mt-6">
            <MyTasksDashboard key={`my-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="kanban" className="mt-6">
            <TaskKanbanBoard key={`kanban-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            <TaskCalendarView key={`cal-${refreshKey}`} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <TaskAnalyticsDashboard key={`ana-${refreshKey}`} />
          </TabsContent>
        </Tabs>

        <TaskForm
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateTask}
        />
      </div>
    </AppLayout>
  );
}