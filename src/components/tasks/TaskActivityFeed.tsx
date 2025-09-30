import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Activity, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  task_id: string;
  user_id: string | null;
  action_type: string;
  changes: any;
  metadata: any;
  created_at: string;
}

interface TaskActivityFeedProps {
  taskId: string;
}

export function TaskActivityFeed({ taskId }: TaskActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, [taskId]);

  const fetchActivities = async () => {
    if (!taskId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('task_activity_feed')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error fetching activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionDescription = (actionType: string, changes: any) => {
    switch (actionType) {
      case 'created':
        return 'created this task';
      case 'status_changed':
        return `changed status from ${changes?.old?.status} to ${changes?.new?.status}`;
      case 'assigned':
        return 'assigned this task';
      case 'updated':
        return 'updated this task';
      case 'commented':
        return 'added a comment';
      default:
        return actionType;
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading activity...</p>;
  }

  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4" />
        <h4 className="font-medium">Activity Timeline</h4>
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-2 pr-4">
          {activities.map((activity) => (
            <Card key={activity.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">User</span>{' '}
                      {getActionDescription(activity.action_type, activity.changes)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}