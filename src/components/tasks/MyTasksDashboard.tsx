import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useTasks, Task } from '@/hooks/useTasks';
import { TaskBulkActionsBar } from './TaskBulkActionsBar';
import { TaskEditModal } from './TaskEditModal';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Calendar, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatInTimeZone } from 'date-fns-tz';
import { logger } from '@/lib/logger';
const TZ = 'America/New_York';

interface MyTasksDashboardProps {
  defaultFilter?: string | null;
}

export function MyTasksDashboard({ defaultFilter }: MyTasksDashboardProps = {}) {
  const { tasks, loading, fetchTasks, backfillAssignmentsForUser, backfillDueDatesForUser } = useTasks();
  const [activeTab, setActiveTab] = useState(defaultFilter || 'all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
      } catch (error) {
        logger.error('Auth error:', error);
      }
    };
    getCurrentUser();
  }, []);

  // Update activeTab when defaultFilter changes
  useEffect(() => {
    if (defaultFilter) {
      setActiveTab(defaultFilter);
    }
  }, [defaultFilter]);

  useEffect(() => {
    // Fetch tasks assigned to the current user
    if (currentUserId) {
      fetchTasks({ assignedTo: currentUserId });
    }
  }, [currentUserId, fetchTasks]);

  const backfilledOnce = useRef(false);
  useEffect(() => {
    if (currentUserId && !backfilledOnce.current) {
      backfilledOnce.current = true;
      // One-time backfill of unassigned tasks + missing due dates for this user, then refresh
      (async () => {
        try {
          await backfillAssignmentsForUser(currentUserId);
          await backfillDueDatesForUser(currentUserId);
        } finally {
          fetchTasks({ assignedTo: currentUserId });
        }
      })();
    }
  }, [currentUserId, fetchTasks]);

  useEffect(() => {
    if (currentUserId && tasks.length > 0) {
      logger.debug('Current User ID:', currentUserId);
      logger.debug('Tasks:', tasks.map(t => ({
        title: t.title,
        assignee_id: t.assignee_id,
        due_at: t.due_at,
        status: t.status,
        isAssignedToMe: t.assignee_id === currentUserId
      })));
      logger.debug('Completed tasks count:', tasks.filter(t => t.status === 'completed').length);
      logger.debug('Completed & assigned to me:', tasks.filter(t => t.status === 'completed' && t.assignee_id === currentUserId).length);
    }
  }, [tasks, currentUserId]);

  const isAssignedToMe = (task: Task) => {
    if (!currentUserId) return true;
    return task.assignee_id === currentUserId;
  };

  const todayTasks = useMemo(() => {
    const todayStr = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
    return tasks.filter(task => {
      if (!isAssignedToMe(task)) return false;
      if (!task.due_at || task.status === 'completed') return false;
      const dueStr = formatInTimeZone(new Date(task.due_at), TZ, 'yyyy-MM-dd');
      return dueStr === todayStr;
    });
  }, [tasks, currentUserId]);

  const tomorrowTasks = useMemo(() => {
    const tomorrow = addDays(new Date(), 1);
    const tomorrowStr = formatInTimeZone(tomorrow, TZ, 'yyyy-MM-dd');
    return tasks.filter(task => {
      if (!isAssignedToMe(task)) return false;
      if (!task.due_at || task.status === 'completed') return false;
      const dueStr = formatInTimeZone(new Date(task.due_at), TZ, 'yyyy-MM-dd');
      return dueStr === tomorrowStr;
    });
  }, [tasks, currentUserId]);

  const weekTasks = useMemo(() => {
    const isoDow = parseInt(formatInTimeZone(new Date(), TZ, 'i'), 10); // 1=Mon .. 7=Sun
    const startDate = addDays(new Date(), -(isoDow % 7)); // previous Sunday
    const endDate = addDays(startDate, 6);
    const startStr = formatInTimeZone(startDate, TZ, 'yyyy-MM-dd');
    const endStr = formatInTimeZone(endDate, TZ, 'yyyy-MM-dd');
    return tasks.filter(task => {
      if (!isAssignedToMe(task)) return false;
      if (!task.due_at || task.status === 'completed') return false;
      const dueStr = formatInTimeZone(new Date(task.due_at), TZ, 'yyyy-MM-dd');
      return dueStr >= startStr && dueStr <= endStr;
    });
  }, [tasks, currentUserId]);

  const futureTasks = useMemo(() => {
    const isoDow = parseInt(formatInTimeZone(new Date(), TZ, 'i'), 10);
    const startDate = addDays(new Date(), -(isoDow % 7));
    const endDate = addDays(startDate, 6);
    const weekEndStr = formatInTimeZone(endDate, TZ, 'yyyy-MM-dd');
    return tasks.filter(task => {
      if (!isAssignedToMe(task)) return false;
      if (!task.due_at || task.status === 'completed') return false;
      const dueStr = formatInTimeZone(new Date(task.due_at), TZ, 'yyyy-MM-dd');
      return dueStr > weekEndStr;
    });
  }, [tasks, currentUserId]);

  const overdueTasks = useMemo(() => {
    const todayStr = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
    return tasks.filter(task => {
      if (!isAssignedToMe(task)) return false;
      if (!task.due_at || task.status === 'completed') return false;
      const dueStr = formatInTimeZone(new Date(task.due_at), TZ, 'yyyy-MM-dd');
      return dueStr < todayStr;
    });
  }, [tasks, currentUserId]);

  const completedTasks = useMemo(() => {
    return tasks.filter(task => task.status === 'completed' && isAssignedToMe(task));
  }, [tasks, currentUserId]);

  const allTasks = useMemo(() => {
    return tasks.filter(task => task.status !== 'completed' && isAssignedToMe(task));
  }, [tasks, currentUserId]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleTaskClick = (task: Task, e: React.MouseEvent) => {
    // Don't open edit modal if clicking on checkbox
    if ((e.target as HTMLElement).closest('[role="checkbox"]')) {
      return;
    }
    setEditingTask(task);
    setEditModalOpen(true);
  };

  const renderTaskCard = (task: Task) => (
    <Card
      key={task.id}
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={(e) => handleTaskClick(task, e)}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <Checkbox
                checked={selectedTaskIds.includes(task.id)}
                onCheckedChange={() => toggleTaskSelection(task.id)}
              />
              <h4 className="font-medium">{task.title}</h4>
            </div>
            <Badge variant={getPriorityColor(task.priority)}>
              {task.priority}
            </Badge>
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Customer & Policy Info from joined data */}
          <div className="flex flex-wrap gap-2 text-xs">
            {task.account?.name && (
              <Badge variant="secondary" className="font-normal bg-blue-50 text-blue-700 border-blue-200">
                👤 {task.account.name}
              </Badge>
            )}
            {task.policy && (
              <Badge variant="outline" className="font-normal">
                📋 {task.policy.policy_number} • {task.policy.carrier}
              </Badge>
            )}
            {/* Fallback to metadata if no joined data */}
            {!task.account?.name && task.metadata && (
              <>
                {((task.metadata as Record<string, string>).renewal_customer_name || (task.metadata as Record<string, string>).customer_name) && (
                  <Badge variant="secondary" className="font-normal">
                    👤 {(task.metadata as Record<string, string>).renewal_customer_name || (task.metadata as Record<string, string>).customer_name}
                  </Badge>
                )}
              </>
            )}
            {!task.policy && task.metadata && (
              <>
                {((task.metadata as Record<string, string>).renewal_policy_number || (task.metadata as Record<string, string>).policy_number) && (
                  <Badge variant="outline" className="font-normal">
                    📋 {(task.metadata as Record<string, string>).renewal_policy_number || (task.metadata as Record<string, string>).policy_number}
                  </Badge>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {task.due_at && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatInTimeZone(new Date(task.due_at), TZ, 'MMM d, h:mm a zzz')}
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
    return <LoadingSkeleton variant="dashboard" count={1} />;
  }


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
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="future">Future</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          {allTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No assigned tasks
              </CardContent>
            </Card>
          ) : (
            allTasks.map(renderTaskCard)
          )}
        </TabsContent>

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

        <TabsContent value="future" className="space-y-3">
          {futureTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No future tasks
              </CardContent>
            </Card>
          ) : (
            futureTasks.map(renderTaskCard)
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

      {/* Bulk Actions Bar */}
      <TaskBulkActionsBar 
        selectedTaskIds={selectedTaskIds}
        onClearSelection={() => setSelectedTaskIds([])}
        onComplete={() => {
          if (currentUserId) {
            fetchTasks({ assignedTo: currentUserId });
          }
          setSelectedTaskIds([]);
        }}
      />

      {/* Edit Task Modal */}
      <TaskEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        task={editingTask}
        onTaskUpdate={() => {
          if (currentUserId) {
            fetchTasks({ assignedTo: currentUserId });
          }
          setEditModalOpen(false);
        }}
      />
    </div>
  );
}