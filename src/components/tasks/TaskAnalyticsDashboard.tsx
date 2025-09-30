import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTasks } from '@/hooks/useTasks';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export function TaskAnalyticsDashboard() {
  const { tasks, loading, fetchTasks } = useTasks();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const getStatusStats = () => {
    return [
      { name: 'Pending', value: tasks.filter(t => t.status === 'pending').length, color: '#f59e0b' },
      { name: 'In Progress', value: tasks.filter(t => t.status === 'in_progress').length, color: '#3b82f6' },
      { name: 'Completed', value: tasks.filter(t => t.status === 'completed').length, color: '#10b981' },
      { name: 'Cancelled', value: tasks.filter(t => t.status === 'cancelled').length, color: '#6b7280' },
    ];
  };

  const getPriorityStats = () => {
    return [
      { name: 'Low', count: tasks.filter(t => t.priority === 'low').length },
      { name: 'Medium', count: tasks.filter(t => t.priority === 'medium').length },
      { name: 'High', count: tasks.filter(t => t.priority === 'high').length },
      { name: 'Urgent', count: tasks.filter(t => t.priority === 'urgent').length },
    ];
  };

  const getCategoryStats = () => {
    return [
      { name: 'Quote', count: tasks.filter(t => t.category === 'quote').length },
      { name: 'Policy', count: tasks.filter(t => t.category === 'policy').length },
      { name: 'Claim', count: tasks.filter(t => t.category === 'claim').length },
      { name: 'Renewal', count: tasks.filter(t => t.category === 'renewal').length },
      { name: 'Service', count: tasks.filter(t => t.category === 'service').length },
      { name: 'General', count: tasks.filter(t => t.category === 'general').length },
    ].filter(s => s.count > 0);
  };

  const getCompletionRate = () => {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const getOverdueTasks = () => {
    const now = new Date();
    return tasks.filter(t => 
      t.due_at && 
      new Date(t.due_at) < now && 
      t.status !== 'completed' && 
      t.status !== 'cancelled'
    ).length;
  };

  if (loading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  const statusStats = getStatusStats();
  const priorityStats = getPriorityStats();
  const categoryStats = getCategoryStats();
  const completionRate = getCompletionRate();
  const overdueTasks = getOverdueTasks();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Total Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Completion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tasks.filter(t => t.status === 'in_progress').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdueTasks}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusStats}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={priorityStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tasks by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}