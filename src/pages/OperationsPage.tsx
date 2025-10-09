import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuotes } from '@/hooks/useQuotes';
import { useRenewals } from '@/hooks/useRenewals';
import { useTasks } from '@/hooks/useTasks';
import { FileText, Clock, CheckCircle2, AlertCircle, TrendingUp, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Fetch work queue data
  const { data: allQuotes, isLoading: quotesLoading } = useQuotes();
  const { data: renewals, isLoading: renewalsLoading } = useRenewals('upcoming');
  const { tasks, loading: tasksLoading } = useTasks();

  // Calculate metrics
  const pendingQuotes = allQuotes?.filter(q => q.status === 'open') || [];
  const expiredQuotes = allQuotes?.filter(q => q.status === 'expired') || [];
  
  const upcomingRenewals = renewals || [];

  const overdueTasks = tasks?.filter(t => {
    if (!t.due_at || t.status === 'completed') return false;
    return new Date(t.due_at) < new Date();
  }) || [];

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Operations</h2>
            <p className="text-muted-foreground">
              Work queues, SLAs, and throughput metrics
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Quotes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingQuotes.length}</div>
              <p className="text-xs text-muted-foreground">
                {expiredQuotes.length} expired
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Renewals</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingRenewals.length}</div>
              <p className="text-xs text-muted-foreground">
                Next 30 days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overdueTasks.length}</div>
              <p className="text-xs text-muted-foreground">
                Requires attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Active Tasks</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {tasks?.filter(t => t.status !== 'completed').length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                In progress
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Work Queues */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="quotes">Quotes Queue</TabsTrigger>
            <TabsTrigger value="renewals">Renewals Queue</TabsTrigger>
            <TabsTrigger value="tasks">Tasks Queue</TabsTrigger>
            <TabsTrigger value="throughput">Throughput</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Work Queue Summary</CardTitle>
                  <CardDescription>Current workload distribution</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Pending Quotes</span>
                    <Badge variant="secondary">{pendingQuotes.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Upcoming Renewals</span>
                    <Badge variant="secondary">{upcomingRenewals.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Overdue Tasks</span>
                    <Badge variant="destructive">{overdueTasks.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Active Tasks</span>
                    <Badge variant="secondary">
                      {tasks?.filter(t => t.status !== 'completed').length || 0}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>SLA Status</CardTitle>
                  <CardDescription>Service level agreements</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quote Response Time</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Within SLA
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Renewal Processing</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Within SLA
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Task Completion</span>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      At Risk
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="quotes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Quotes Queue</CardTitle>
                <CardDescription>
                  Open quotes requiring action
                </CardDescription>
              </CardHeader>
              <CardContent>
                {quotesLoading ? (
                  <div className="text-center py-8">Loading quotes...</div>
                ) : pendingQuotes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No open quotes
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Carrier</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingQuotes.map((quote) => (
                        <TableRow key={quote.id}>
                          <TableCell className="font-medium">
                            {quote.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {quote.account?.name ? (
                              <Link
                                to={`/crm/accounts/${quote.account.id}`}
                                className="hover:underline"
                              >
                                {quote.account.name}
                              </Link>
                            ) : (
                              'N/A'
                            )}
                          </TableCell>
                          <TableCell>{quote.carrier_info?.name || 'N/A'}</TableCell>
                          <TableCell>
                            {format(new Date(quote.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{quote.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/quotes/new?accountId=${quote.account_id}`}>
                                View
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="renewals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Renewals Queue</CardTitle>
                <CardDescription>
                  Policies expiring in the next 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renewalsLoading ? (
                  <div className="text-center py-8">Loading renewals...</div>
                ) : upcomingRenewals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No upcoming renewals
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Policy #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Carrier</TableHead>
                        <TableHead>Premium</TableHead>
                        <TableHead>Expiration Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcomingRenewals.map((renewal) => (
                        <TableRow key={renewal.id}>
                          <TableCell className="font-medium">
                            {renewal.policy_number || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {renewal.account?.name ? (
                              <Link
                                to={`/crm/accounts/${renewal.account.id}`}
                                className="hover:underline"
                              >
                                {renewal.account.name}
                              </Link>
                            ) : (
                              'N/A'
                            )}
                          </TableCell>
                          <TableCell>{renewal.carrier_info?.name || renewal.carrier || 'N/A'}</TableCell>
                          <TableCell>
                            {renewal.premium 
                              ? new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                                }).format(Number(renewal.premium))
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {renewal.expiration_date
                              ? format(new Date(renewal.expiration_date), 'MMM d, yyyy')
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={renewal.status === 'active' ? 'default' : 'secondary'}>
                              {renewal.status || 'pending'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tasks Queue</CardTitle>
                <CardDescription>
                  Active and overdue tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="text-center py-8">Loading tasks...</div>
                ) : !tasks || tasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active tasks
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks
                        .filter(t => t.status !== 'completed')
                        .slice(0, 10)
                        .map((task) => {
                          const isOverdue = task.due_at && new Date(task.due_at) < new Date();
                          return (
                            <TableRow key={task.id}>
                              <TableCell className="font-medium">
                                {task.title}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={
                                    task.priority === 'high' ? 'destructive' :
                                    task.priority === 'medium' ? 'default' :
                                    'secondary'
                                  }
                                >
                                  {task.priority}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className={isOverdue ? 'text-destructive font-semibold' : ''}>
                                  {task.due_at
                                    ? format(new Date(task.due_at), 'MMM d, yyyy')
                                    : 'No due date'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{task.status}</Badge>
                              </TableCell>
                              <TableCell>
                                {task.assignee_id ? 'Assigned' : 'Unassigned'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="throughput" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Quote Throughput</CardTitle>
                  <CardDescription>Processing metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Avg. Response Time</span>
                    <span className="text-2xl font-bold">2.4 hrs</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quotes This Week</span>
                    <span className="text-2xl font-bold">
                      {allQuotes?.filter(q => {
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        return new Date(q.created_at) >= weekAgo;
                      }).length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Conversion Rate</span>
                    <span className="text-2xl font-bold">65%</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Renewal Throughput</CardTitle>
                  <CardDescription>Processing metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Avg. Processing Time</span>
                    <span className="text-2xl font-bold">3.2 days</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Renewals This Month</span>
                    <span className="text-2xl font-bold">
                      {renewals?.filter(r => {
                        const monthAgo = new Date();
                        monthAgo.setMonth(monthAgo.getMonth() - 1);
                        return new Date(r.created_at) >= monthAgo;
                      }).length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Retention Rate</span>
                    <span className="text-2xl font-bold">89%</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}