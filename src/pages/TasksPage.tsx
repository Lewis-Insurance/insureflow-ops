import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckSquare, Calendar, User, Clock, AlertCircle, Edit3, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { TaskEditModal } from '@/components/tasks/TaskEditModal';

interface Task {
  id: string;
  account_id: string;
  title: string;
  description?: string;
  details?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_at?: string;
  assignee_id?: string;
  created_at: string;
  updated_at: string;
}

interface Account {
  id: string;
  name: string;
}

interface StaffMember {
  id: string;
  full_name: string;
}

interface TaskWithRelations extends Task {
  account?: Account;
  assignee?: StaffMember;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchStaffMembers();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          account:accounts(id, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch assignee details separately
      const tasksWithAssignees = await Promise.all(
        (data || []).map(async (task) => {
          let assignee = null;
          if (task.assignee_id) {
            const { data: assigneeData } = await supabase
              .from('profiles')
              .select('id, full_name')
              .eq('id', task.assignee_id)
              .single();
            assignee = assigneeData;
          }
          return { ...task, assignee };
        })
      );

      setTasks(tasksWithAssignees);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load tasks',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['staff', 'admin'])
        .order('full_name');

      if (error) throw error;
      setStaffMembers(data || []);
    } catch (error: any) {
      console.error('Error fetching staff members:', error);
    }
  };

  const updateTaskStatus = async (taskId: string, status: Task['status']) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;
      
      await fetchTasks();
      toast({
        title: 'Success',
        description: 'Task status updated',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update task',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">In Progress</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-800';
      case 'high':
        return 'text-red-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const handleEditTask = (task: TaskWithRelations) => {
    setEditingTask(task);
    setEditModalOpen(true);
  };

  const filteredTasks = tasks.filter(task => {
    // Status filter
    let statusMatch = true;
    if (filter === 'pending') statusMatch = task.status === 'pending' || task.status === 'in_progress';
    else if (filter === 'completed') statusMatch = task.status === 'completed';
    
    // Staff filter
    let staffMatch = true;
    if (staffFilter !== 'all') {
      if (staffFilter === 'unassigned') {
        staffMatch = !task.assignee_id;
      } else {
        staffMatch = task.assignee_id === staffFilter;
      }
    }
    
    return statusMatch && staffMatch;
  });

  const overdueTasks = tasks.filter(task => 
    task.due_at && 
    new Date(task.due_at) < new Date() && 
    task.status !== 'completed' && 
    task.status !== 'cancelled'
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="text-center py-8">Loading tasks...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-muted-foreground">Manage all your tasks across accounts</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          {/* Status Filter */}
          <div className="flex gap-2">
            <Button 
              size="sm"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              All ({tasks.length})
            </Button>
            <Button 
              size="sm"
              variant={filter === 'pending' ? 'default' : 'outline'}
              onClick={() => setFilter('pending')}
            >
              Active ({tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length})
            </Button>
            <Button 
              size="sm"
              variant={filter === 'completed' ? 'default' : 'outline'}
              onClick={() => setFilter('completed')}
            >
              Completed ({tasks.filter(t => t.status === 'completed').length})
            </Button>
          </div>

          {/* Staff Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Assigned to:</span>
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staffMembers.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {overdueTasks.length > 0 && (
          <Card className="mb-6 bg-red-50 border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                Overdue Tasks ({overdueTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {overdueTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-white rounded border border-red-200">
                    <div className="flex-1">
                      <h4 className="font-medium">{task.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        <Link to={`/customers/${task.account_id}`} className="text-primary hover:underline">
                          {task.account?.name || 'Unknown Account'}
                        </Link>
                        {task.due_at && (
                          <span className="ml-2">
                            Due {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => updateTaskStatus(task.id, 'in_progress')}
                    >
                      Start
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <CheckSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Tasks</h3>
                <p className="text-muted-foreground">
                  {filter === 'all' ? 'No tasks found.' : `No ${filter} tasks found.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredTasks.map((task) => (
              <Card 
                key={task.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleEditTask(task)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold truncate">{task.title}</h3>
                        {getStatusBadge(task.status)}
                        <span className={`text-xs font-medium uppercase ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                      </div>
                      
                      {task.description && (
                        <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                      )}

                      {task.details && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          <strong>Notes:</strong> {task.details}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <Link 
                            to={`/customers/${task.account_id}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {task.account?.name || 'Unknown Account'}
                          </Link>
                        </div>

                        {task.assignee && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="text-primary font-medium">
                              {task.assignee.full_name}
                            </span>
                          </div>
                        )}
                        
                        {task.due_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Created {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTask(task);
                        }}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      {task.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTaskStatus(task.id, 'in_progress');
                          }}
                        >
                          Start
                        </Button>
                      )}
                      {task.status === 'in_progress' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTaskStatus(task.id, 'completed');
                          }}
                        >
                          Complete
                        </Button>
                      )}
                      {task.status === 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTaskStatus(task.id, 'pending');
                          }}
                        >
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Task Edit Modal */}
        <TaskEditModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          task={editingTask}
          onTaskUpdate={fetchTasks}
        />
      </div>
    </AppLayout>
  );
}