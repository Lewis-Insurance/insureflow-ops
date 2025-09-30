import React, { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTasks, Task } from '@/hooks/useTasks';
import { isSameDay, format, startOfMonth, endOfMonth } from 'date-fns';

interface TaskCalendarViewProps {
  accountId?: string;
}

export function TaskCalendarView({ accountId }: TaskCalendarViewProps) {
  const { tasks, loading, fetchTasks } = useTasks(accountId);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => 
      task.due_at && isSameDay(new Date(task.due_at), date)
    );
  };

  const getTasksForSelectedDate = () => {
    return getTasksForDate(selectedDate);
  };

  const getDateModifiers = () => {
    const datesWithTasks = tasks
      .filter(task => task.due_at)
      .map(task => new Date(task.due_at!));
    
    return datesWithTasks;
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
    return <div className="text-center py-8">Loading calendar...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Task Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              modifiers={{
                hasTasks: getDateModifiers(),
              }}
              modifiersStyles={{
                hasTasks: {
                  fontWeight: 'bold',
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
                },
              }}
              className="rounded-md border pointer-events-auto"
            />
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Tasks for {format(selectedDate, 'MMMM d, yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getTasksForSelectedDate().length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks due on this date</p>
            ) : (
              <div className="space-y-3">
                {getTasksForSelectedDate().map(task => (
                  <div key={task.id} className="p-3 border rounded-md space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm">{task.title}</h4>
                      <Badge variant={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </div>
                    
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {task.status}
                      </Badge>
                      {task.category && (
                        <Badge variant="outline" className="text-xs">
                          {task.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}