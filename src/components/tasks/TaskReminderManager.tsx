import React, { useState, useEffect } from 'react';
import { useTaskReminders } from '@/hooks/useTaskReminders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface TaskReminderManagerProps {
  taskId: string;
}

export function TaskReminderManager({ taskId }: TaskReminderManagerProps) {
  const { reminders, loading, fetchReminders, createReminder, deleteReminder } = useTaskReminders();
  const [showForm, setShowForm] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [reminderType, setReminderType] = useState<'email' | 'in_app' | 'both'>('in_app');

  useEffect(() => {
    fetchReminders(taskId);
  }, [taskId, fetchReminders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reminderDate || !reminderTime) return;

    const remindAt = new Date(`${reminderDate}T${reminderTime}`).toISOString();

    const success = await createReminder({
      task_id: taskId,
      remind_at: remindAt,
      reminder_type: reminderType,
    });

    if (success) {
      setShowForm(false);
      setReminderDate('');
      setReminderTime('');
      setReminderType('in_app');
      fetchReminders(taskId);
    }
  };

  const handleDelete = async (reminderId: string) => {
    const success = await deleteReminder(reminderId);
    if (success) {
      fetchReminders(taskId);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Reminders
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Reminder
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reminderDate">Date</Label>
                <Input
                  id="reminderDate"
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="reminderTime">Time</Label>
                <Input
                  id="reminderTime"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="reminderType">Type</Label>
              <Select value={reminderType} onValueChange={(value: any) => setReminderType(value)}>
                <SelectTrigger id="reminderType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_app">In-App</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Create Reminder</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center py-4 text-muted-foreground">Loading reminders...</div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">No reminders set</div>
        ) : (
          <div className="space-y-2">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">
                    {format(new Date(reminder.remind_at), 'PPp')}
                  </div>
                  <div className="text-sm text-muted-foreground capitalize">
                    {reminder.reminder_type.replace('_', ' ')} • {reminder.status}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(reminder.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
