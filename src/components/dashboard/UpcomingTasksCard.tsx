import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { Task } from '@/hooks/useTasks';

interface TasksByDate {
  today: Task[];
  tomorrow: Task[];
  thisWeek: Task[];
}

export function UpcomingTasksCard() {
  const [tasks, setTasks] = useState<TasksByDate>({ today: [], tomorrow: [], thisWeek: [] });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUpcomingTasks();

    const onTasksUpdated = () => fetchUpcomingTasks();
    window.addEventListener('tasks:updated', onTasksUpdated as EventListener);
    return () => window.removeEventListener('tasks:updated', onTasksUpdated as EventListener);
  }, []);

  const fetchUpcomingTasks = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const tomorrowStart = startOfDay(addDays(now, 1));
      const tomorrowEnd = endOfDay(addDays(now, 1));
      const weekStart = startOfWeek(now);
      const weekEnd = endOfWeek(now);

      // Fetch tasks due this week that are assigned to current user OR unassigned
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          account:accounts(id, name),
          policy:policies(id, policy_number, carrier, line_of_business)
        `)
        .lte('due_at', weekEnd.toISOString())
        .in('status', ['pending', 'in_progress'])
        .or(`assignee_id.eq.${user.id},assignee_id.is.null`)
        .order('due_at', { ascending: true });

      if (error) throw error;

      const allTasks = (data as Task[]) || [];

      // Categorize tasks
      const categorized: TasksByDate = {
        today: [],
        tomorrow: [],
        thisWeek: [],
      };

      allTasks.forEach((task) => {
        if (!task.due_at) return;
        
        const dueDate = new Date(task.due_at);
        
        if (dueDate >= todayStart && dueDate <= todayEnd) {
          categorized.today.push(task);
        } else if (dueDate >= tomorrowStart && dueDate <= tomorrowEnd) {
          categorized.tomorrow.push(task);
        } else if (dueDate >= weekStart && dueDate <= weekEnd) {
          categorized.thisWeek.push(task);
        }
      });

      setTasks(categorized);
    } catch (error) {
      console.error('Error fetching upcoming tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { variant: any; className: string }> = {
      urgent: { variant: 'destructive', className: 'bg-red-600' },
      high: { variant: 'destructive', className: 'bg-orange-600' },
      medium: { variant: 'secondary', className: 'bg-yellow-600' },
      low: { variant: 'outline', className: '' },
    };
    
    const config = variants[priority] || variants.low;
    return (
      <Badge variant={config.variant} className={config.className}>
        {priority}
      </Badge>
    );
  };

  const renderTaskList = (taskList: Task[], emptyMessage: string, filterParam: string) => {
    if (loading) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          Loading tasks...
        </div>
      );
    }

    if (taskList.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {taskList.map((task) => (
          <div
            key={task.id}
            className="flex items-start justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => navigate(`/tasks?filter=${filterParam}`)}
          >
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{task.title}</h4>
                {getPriorityBadge(task.priority)}
                {task.category && (
                  <Badge variant="outline" className="text-xs">
                    {task.category}
                  </Badge>
                )}
              </div>
              {/* Customer & Policy Context */}
              {((task as any).account?.name || (task as any).policy) && (
                <div className="flex flex-wrap gap-2">
                  {(task as any).account?.name && (
                    <Badge variant="secondary" className="text-xs font-normal bg-blue-50 text-blue-700">
                      👤 {(task as any).account.name}
                    </Badge>
                  )}
                  {(task as any).policy && (
                    <Badge variant="outline" className="text-xs font-normal">
                      📋 {(task as any).policy.policy_number} • {(task as any).policy.carrier}
                    </Badge>
                  )}
                </div>
              )}
              {task.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {task.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {task.due_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due: {format(new Date(task.due_at), 'MMM d, h:mm a')}
                  </span>
                )}
                {task.status && (
                  <Badge variant="secondary" className="text-xs">
                    {task.status}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="ml-2">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  const totalCount = tasks.today.length + tasks.tomorrow.length + tasks.thisWeek.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Upcoming Tasks
            {totalCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {totalCount}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/tasks')}
          >
            View All Tasks
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today" className="relative">
              Today
              {tasks.today.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {tasks.today.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tomorrow" className="relative">
              Tomorrow
              {tasks.tomorrow.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {tasks.tomorrow.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="week" className="relative">
              This Week
              {tasks.thisWeek.length > 0 && (
                <Badge variant="outline" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {tasks.thisWeek.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="mt-4">
            {renderTaskList(tasks.today, 'No tasks due today! 🎉', 'today')}
          </TabsContent>
          <TabsContent value="tomorrow" className="mt-4">
            {renderTaskList(tasks.tomorrow, 'No tasks due tomorrow.', 'tomorrow')}
          </TabsContent>
          <TabsContent value="week" className="mt-4">
            {renderTaskList(tasks.thisWeek, 'No tasks due this week.', 'week')}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
