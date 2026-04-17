import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { addDaysLocalDate, localDateToNoonIso, todayLocalDate } from '@/lib/date/localDate';

interface QuickAddTaskBarProps {
  className?: string;
}

export default function QuickAddTaskBar({ className }: QuickAddTaskBarProps) {
  const { createTask } = useTasks();
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await createTask({
        title: title.trim(),
        status: 'pending',
        priority: 'medium',
        due_at: dueAt ? localDateToNoonIso(dueAt) : undefined,
        assignee_id: user?.id,
        category: 'general',
      });
      // notify other components (e.g., UpcomingTasksCard) to refresh
      window.dispatchEvent(new CustomEvent('tasks:updated'));
      setTitle('');
      setDueAt('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={className}>
      <CardContent className="pt-4 flex flex-col md:flex-row gap-3 items-start md:items-end">
        <div className="w-full md:flex-1">
          <Label htmlFor="quick-task-title">New Task</Label>
          <Input
            id="quick-task-title"
            placeholder="What do you need to do?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="quick-task-due">Due</Label>
          <Input
            id="quick-task-due"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <Button onClick={handleAdd} disabled={!title.trim() || loading} className="md:self-end">
          {loading ? 'Adding...' : 'Add Task'}
        </Button>
      </CardContent>
    </Card>
  );
}
