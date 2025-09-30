import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTasks, Task } from '@/hooks/useTasks';

interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  created_at: string;
}

interface TaskDependencyVisualizerProps {
  taskId: string;
  accountId?: string;
}

export function TaskDependencyVisualizer({ taskId, accountId }: TaskDependencyVisualizerProps) {
  const { tasks, fetchTasks } = useTasks(accountId);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [blockedBy, setBlockedBy] = useState<Task[]>([]);
  const [blocking, setBlocking] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');

  useEffect(() => {
    fetchTasks();
    fetchDependencies();
  }, [taskId, fetchTasks]);

  const fetchDependencies = async () => {
    try {
      setLoading(true);
      
      // Fetch dependencies where this task depends on others
      const { data: blockedByData, error: blockedByError } = await supabase
        .from('task_dependencies')
        .select('*')
        .eq('task_id', taskId);

      if (blockedByError) throw blockedByError;
      
      // Fetch dependencies where other tasks depend on this one
      const { data: blockingData, error: blockingError } = await supabase
        .from('task_dependencies')
        .select('*')
        .eq('depends_on_task_id', taskId);

      if (blockingError) throw blockingError;

      setDependencies([...(blockedByData || []), ...(blockingData || [])]);

      // Get full task details for blocked by
      if (blockedByData && blockedByData.length > 0) {
        const blockedByTasks = tasks.filter(t => 
          blockedByData.some(d => d.depends_on_task_id === t.id)
        );
        setBlockedBy(blockedByTasks);
      }

      // Get full task details for blocking
      if (blockingData && blockingData.length > 0) {
        const blockingTasks = tasks.filter(t => 
          blockingData.some(d => d.task_id === t.id)
        );
        setBlocking(blockingTasks);
      }
    } catch (error: any) {
      console.error('Error fetching dependencies:', error);
      toast({
        title: 'Error',
        description: 'Failed to load task dependencies',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addDependency = async () => {
    if (!selectedTaskId) return;

    try {
      const { error } = await supabase
        .from('task_dependencies')
        .insert({
          task_id: taskId,
          depends_on_task_id: selectedTaskId,
          dependency_type: 'finish_to_start',
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Dependency added',
      });

      setShowAddForm(false);
      setSelectedTaskId('');
      await fetchDependencies();
    } catch (error: any) {
      console.error('Error adding dependency:', error);
      toast({
        title: 'Error',
        description: 'Failed to add dependency',
        variant: 'destructive',
      });
    }
  };

  const removeDependency = async (dependencyId: string) => {
    try {
      const { error } = await supabase
        .from('task_dependencies')
        .delete()
        .eq('id', dependencyId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Dependency removed',
      });

      await fetchDependencies();
    } catch (error: any) {
      console.error('Error removing dependency:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove dependency',
        variant: 'destructive',
      });
    }
  };

  const availableTasks = tasks.filter(t => t.id !== taskId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <h4 className="font-medium">Dependencies</h4>
        </div>
        {!showAddForm && (
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Add Dependency Form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>This task depends on:</Label>
            <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a task..." />
              </SelectTrigger>
              <SelectContent>
                {availableTasks.map(task => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={addDependency} disabled={!selectedTaskId} className="flex-1">
                Add Dependency
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setSelectedTaskId('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blocked By */}
      {blockedBy.length > 0 && (
        <div>
          <h5 className="text-sm font-medium mb-2 text-red-600">Blocked By:</h5>
          <div className="space-y-2">
            {blockedBy.map((task) => {
              const dep = dependencies.find(d => d.depends_on_task_id === task.id && d.task_id === taskId);
              return (
                <Card key={task.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{task.title}</p>
                      <Badge variant="outline" className="mt-1">
                        {task.status}
                      </Badge>
                    </div>
                    {dep && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeDependency(dep.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Blocking */}
      {blocking.length > 0 && (
        <div>
          <h5 className="text-sm font-medium mb-2 text-orange-600">Blocking:</h5>
          <div className="space-y-2">
            {blocking.map((task) => (
              <Card key={task.id}>
                <CardContent className="p-3">
                  <p className="font-medium text-sm">{task.title}</p>
                  <Badge variant="outline" className="mt-1">
                    {task.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {blockedBy.length === 0 && blocking.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">No dependencies</p>
      )}
    </div>
  );
}