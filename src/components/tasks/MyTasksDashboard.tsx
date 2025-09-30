import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTasks, Task } from '@/hooks/useTasks';
import { Calendar, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, isThisWeek } from 'date-fns';

export function MyTasksDashboard() {
  const { tasks, loading, fetchTasks } = useTasks();
  const [activeTab, setActiveTab] = useState('today');

  useEffect(() => {
    // Fetch all tasks (filtering by current user would need to be added to the hook)
    fetchTasks();
  }, [fetchTasks]);

  const getTodayTasks = () => {
    return tasks.filter(task => 
      task.due_at && isToday(new Date(task.due_at)) && task.status !== 'completed'
    );
  };

  const getTomorrowTasks = () => {
    return tasks.filter(task => 
      task.due_at && isTomorrow(new Date(task.due_at)) && task.status !== 'completed'
    );
  };

  const getThisWeekTasks = () => {
    return tasks.filter(task => 
      task.due_at && isThisWeek(new Date(task.due_at)) && task.status !== 'completed'
    );
  };

  const getOverdueTasks = () => {
    return tasks.filter(task => 
      task.due_at && isPast(new Date(task.due_at)) && task.status !== 'completed'
    );
  };

  const getCompletedTasks = () => {
    return tasks.filter(task => task.status === 'completed');
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

  const renderTaskCard = (task: Task) => (
    <Card key={task.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium">{task.title}</h4>
            <Badge variant={getPriorityColor(task.priority)}>
              {task.priority}
            </Badge>
          </div>
          
          {task.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {task.due_at && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(task.due_at), 'MMM d, h:mm a')}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Badge variant="outline">{task.status}</Badge>
            </div>
            {task.category && (
              <Badge variant="outline">{task.category}</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return <div className="text-center py-8">Loading your tasks...</div>;
  }

  const todayTasks = getTodayTasks();
  const tomorrowTasks = getTomorrowTasks();
  const weekTasks = getThisWeekTasks();
  const overdueTasks = getOverdueTasks();
  const completedTasks = getCompletedTasks();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayTasks.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weekTasks.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdueTasks.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Task Lists */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-3">
          {todayTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No tasks due today
              </CardContent>
            </Card>
          ) : (
            todayTasks.map(renderTaskCard)
          )}
        </TabsContent>

        <TabsContent value="tomorrow" className="space-y-3">
          {tomorrowTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No tasks due tomorrow
              </CardContent>
            </Card>
          ) : (
            tomorrowTasks.map(renderTaskCard)
          )}
        </TabsContent>

        <TabsContent value="week" className="space-y-3">
          {weekTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No tasks due this week
              </CardContent>
            </Card>
          ) : (
            weekTasks.map(renderTaskCard)
          )}
        </TabsContent>

        <TabsContent value="overdue" className="space-y-3">
          {overdueTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No overdue tasks
              </CardContent>
            </Card>
          ) : (
            overdueTasks.map(renderTaskCard)
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3">
          {completedTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No completed tasks
              </CardContent>
            </Card>
          ) : (
            completedTasks.map(renderTaskCard)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}