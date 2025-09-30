import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskKanbanBoard } from '@/components/tasks/TaskKanbanBoard';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { MyTasksDashboard } from '@/components/tasks/MyTasksDashboard';
import { TaskAnalyticsDashboard } from '@/components/tasks/TaskAnalyticsDashboard';
import { LayoutGrid, Calendar, User, BarChart3 } from 'lucide-react';

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState('my-tasks');

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">
            Manage your tasks with multiple views
          </p>
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
            <MyTasksDashboard />
          </TabsContent>

          <TabsContent value="kanban" className="mt-6">
            <TaskKanbanBoard />
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            <TaskCalendarView />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <TaskAnalyticsDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}