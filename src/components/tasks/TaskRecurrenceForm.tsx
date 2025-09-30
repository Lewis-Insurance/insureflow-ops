import React, { useState, useEffect } from 'react';
import { useRecurringTasks } from '@/hooks/useRecurringTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Repeat, Trash2 } from 'lucide-react';

interface TaskRecurrenceFormProps {
  taskId: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function TaskRecurrenceForm({ taskId }: TaskRecurrenceFormProps) {
  const { recurrenceRules, loading, fetchRecurrenceRules, createRecurrenceRule, deleteRecurrenceRule } = useRecurringTasks();
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [interval, setInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchRecurrenceRules(taskId);
  }, [taskId, fetchRecurrenceRules]);

  const existingRule = recurrenceRules.find(r => r.task_id === taskId && r.is_active);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate) return;

    const nextOccurrence = new Date(startDate).toISOString();

    const success = await createRecurrenceRule({
      task_id: taskId,
      frequency,
      interval,
      days_of_week: frequency === 'weekly' ? selectedDays : undefined,
      day_of_month: frequency === 'monthly' ? dayOfMonth : undefined,
      start_date: new Date(startDate).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : undefined,
      next_occurrence: nextOccurrence,
      is_active: true,
    });

    if (success) {
      fetchRecurrenceRules(taskId);
    }
  };

  const handleDelete = async (ruleId: string) => {
    const success = await deleteRecurrenceRule(ruleId);
    if (success) {
      fetchRecurrenceRules(taskId);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  if (loading) {
    return <div className="text-center py-4 text-muted-foreground">Loading...</div>;
  }

  if (existingRule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Recurring Task
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium capitalize">
                  Every {existingRule.interval} {existingRule.frequency}
                </div>
                <div className="text-sm text-muted-foreground">
                  Started: {new Date(existingRule.start_date).toLocaleDateString()}
                  {existingRule.end_date && ` • Ends: ${new Date(existingRule.end_date).toLocaleDateString()}`}
                </div>
                {existingRule.days_of_week && existingRule.days_of_week.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    On: {existingRule.days_of_week.map(d => DAYS_OF_WEEK[d].label).join(', ')}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(existingRule.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="h-4 w-4" />
          Make Recurring
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="frequency">Frequency</Label>
              <Select value={frequency} onValueChange={(value: any) => setFrequency(value)}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="interval">Repeat Every</Label>
              <Input
                id="interval"
                type="number"
                min={1}
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value))}
              />
            </div>
          </div>

          {frequency === 'weekly' && (
            <div>
              <Label>Days of Week</Label>
              <div className="flex gap-2 mt-2">
                {DAYS_OF_WEEK.map(day => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={selectedDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <Label htmlFor={`day-${day.value}`} className="text-sm">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {frequency === 'monthly' && (
            <div>
              <Label htmlFor="dayOfMonth">Day of Month</Label>
              <Input
                id="dayOfMonth"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit">Create Recurring Task</Button>
        </form>
      </CardContent>
    </Card>
  );
}
