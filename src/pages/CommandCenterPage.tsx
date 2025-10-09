import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuotes } from '@/hooks/useQuotes';
import { useRenewals } from '@/hooks/useRenewals';
import { useTasks } from '@/hooks/useTasks';
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Activity,
  TrendingUp,
  Users,
  MessageSquare,
  FileText,
  Bell
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

interface ActivityItem {
  id: string;
  type: 'quote' | 'renewal' | 'task' | 'escalation';
  title: string;
  description: string;
  status: 'critical' | 'warning' | 'normal';
  timestamp: Date;
  link: string;
}

export default function CommandCenterPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [liveActivity, setLiveActivity] = useState<ActivityItem[]>([]);
  
  const { data: quotes, isLoading: quotesLoading } = useQuotes();
  const { data: renewals, isLoading: renewalsLoading } = useRenewals('upcoming');
  const { tasks, loading: tasksLoading } = useTasks();

  // Calculate critical metrics
  const criticalQuotes = quotes?.filter(q => {
    const created = new Date(q.created_at);
    const hoursSinceCreated = (Date.now() - created.getTime()) / (1000 * 60 * 60);
    return q.status === 'open' && hoursSinceCreated > 24;
  }) || [];

  const criticalRenewals = renewals?.filter(r => {
    if (!r.expiration_date) return false;
    const daysUntilExpiration = Math.ceil(
      (new Date(r.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiration <= 7;
  }) || [];

  const criticalTasks = tasks?.filter(t => {
    if (t.status === 'completed' || !t.due_at) return false;
    return new Date(t.due_at) < new Date();
  }) || [];

  const escalations = [
    ...criticalQuotes.map(q => ({
      id: q.id,
      type: 'quote' as const,
      title: `Quote Response Overdue`,
      description: `Account: ${q.account?.name || 'Unknown'}`,
      status: 'critical' as const,
      timestamp: new Date(q.created_at),
      link: `/quotes/new?accountId=${q.account_id}`,
    })),
    ...criticalRenewals.map(r => ({
      id: r.id,
      type: 'renewal' as const,
      title: `Urgent Renewal`,
      description: `Policy ${r.policy_number} expires ${format(new Date(r.expiration_date), 'MMM d')}`,
      status: 'critical' as const,
      timestamp: new Date(r.expiration_date),
      link: `/policies/${r.id}`,
    })),
    ...criticalTasks.slice(0, 3).map(t => ({
      id: t.id,
      type: 'escalation' as const,
      title: `Overdue Task`,
      description: t.title,
      status: 'critical' as const,
      timestamp: new Date(t.due_at!),
      link: `/tasks`,
    })),
  ];

  // Simulate live activity feed (in production, this would use real-time subscriptions)
  useEffect(() => {
    const generateActivity = () => {
      const activities: ActivityItem[] = [];
      
      // Recent quotes
      quotes?.slice(0, 5).forEach(q => {
        activities.push({
          id: q.id,
          type: 'quote',
          title: 'New Quote Request',
          description: `${q.account?.name} - ${q.carrier_info?.name || 'Carrier TBD'}`,
          status: 'normal',
          timestamp: new Date(q.created_at),
          link: `/quotes/new?accountId=${q.account_id}`,
        });
      });

      // Recent renewals
      renewals?.slice(0, 3).forEach(r => {
        const daysUntil = Math.ceil(
          (new Date(r.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        activities.push({
          id: r.id,
          type: 'renewal',
          title: 'Renewal Due Soon',
          description: `${r.policy_number} - ${daysUntil} days`,
          status: daysUntil <= 7 ? 'warning' : 'normal',
          timestamp: new Date(r.expiration_date),
          link: `/policies/${r.id}`,
        });
      });

      // Recent tasks
      tasks?.slice(0, 5).forEach(t => {
        if (t.status !== 'completed') {
          activities.push({
            id: t.id,
            type: 'task',
            title: 'Task Update',
            description: t.title,
            status: t.priority === 'high' ? 'warning' : 'normal',
            timestamp: new Date(t.created_at),
            link: `/tasks`,
          });
        }
      });

      // Sort by timestamp
      activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLiveActivity(activities.slice(0, 15));
    };

    generateActivity();
  }, [quotes, renewals, tasks]);

  const loading = quotesLoading || renewalsLoading || tasksLoading;

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Command Center</h2>
            <p className="text-muted-foreground">
              Real-time monitoring of critical operations
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="h-8">
              <Activity className="mr-2 h-4 w-4" />
              Live
            </Badge>
          </div>
        </div>

        {/* Critical Alerts */}
        {escalations.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center text-destructive">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Critical Escalations ({escalations.length})
              </CardTitle>
              <CardDescription>
                Items requiring immediate attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {escalations.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="font-medium">{item.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.description}
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" asChild>
                      <Link to={item.link}>Act Now</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Items</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {escalations.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Require immediate action
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Quotes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {quotes?.filter(q => q.status === 'open').length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {criticalQuotes.length} over 24hrs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Renewals Due</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {renewals?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {criticalRenewals.length} urgent (≤7 days)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {tasks?.filter(t => t.status !== 'completed').length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {criticalTasks.length} overdue
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Live Activity</TabsTrigger>
            <TabsTrigger value="sla">SLA Monitor</TabsTrigger>
            <TabsTrigger value="threads">Open Threads</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>System Health</CardTitle>
                  <CardDescription>Overall system status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quote Processing</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Healthy
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Renewal Pipeline</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Healthy
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Task Queue</span>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      At Capacity
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Response Time</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Fast
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Escalations</CardTitle>
                  <CardDescription>Last 24 hours</CardDescription>
                </CardHeader>
                <CardContent>
                  {escalations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No escalations
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {escalations.slice(0, 4).map((item) => (
                        <div key={item.id} className="flex items-start space-x-3">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.description}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={item.link}>View</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Live Activity Feed</CardTitle>
                <CardDescription>
                  Real-time updates from across the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading activity...</div>
                ) : liveActivity.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent activity
                  </div>
                ) : (
                  <div className="space-y-3">
                    {liveActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start space-x-3 flex-1">
                          <div className="mt-1">
                            {activity.type === 'quote' && (
                              <FileText className="h-4 w-4 text-blue-500" />
                            )}
                            {activity.type === 'renewal' && (
                              <Clock className="h-4 w-4 text-orange-500" />
                            )}
                            {activity.type === 'task' && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {activity.type === 'escalation' && (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <p className="text-sm font-medium">{activity.title}</p>
                              {activity.status === 'critical' && (
                                <Badge variant="destructive" className="text-xs">
                                  Critical
                                </Badge>
                              )}
                              {activity.status === 'warning' && (
                                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                                  Warning
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {activity.description}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={activity.link}>View</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sla" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Quote Response SLA</CardTitle>
                  <CardDescription>Target: &lt;24 hours</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Within SLA</span>
                      <span className="text-2xl font-bold text-green-600">
                        {quotes && quotes.length > 0
                          ? Math.round(
                              ((quotes.length - criticalQuotes.length) / quotes.length) * 100
                            )
                          : 100}
                        %
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Breaching SLA</span>
                      <span className="text-2xl font-bold text-destructive">
                        {criticalQuotes.length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Renewal Processing SLA</CardTitle>
                  <CardDescription>Target: 7+ days notice</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Within SLA</span>
                      <span className="text-2xl font-bold text-green-600">
                        {renewals && renewals.length > 0
                          ? Math.round(
                              ((renewals.length - criticalRenewals.length) / renewals.length) *
                                100
                            )
                          : 100}
                        %
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">At Risk</span>
                      <span className="text-2xl font-bold text-destructive">
                        {criticalRenewals.length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="threads" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Open Threads</CardTitle>
                <CardDescription>
                  Active conversations and pending items
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes?.filter(q => q.status === 'open').slice(0, 5).map((quote) => (
                      <TableRow key={quote.id}>
                        <TableCell>
                          <Badge variant="outline">Quote</Badge>
                        </TableCell>
                        <TableCell>{quote.account?.name || 'Unknown'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{quote.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(quote.created_at))}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/quotes/new?accountId=${quote.account_id}`}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {tasks?.filter(t => t.status !== 'completed').slice(0, 5).map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <Badge variant="outline">Task</Badge>
                        </TableCell>
                        <TableCell>{task.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{task.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {task.due_at
                            ? formatDistanceToNow(new Date(task.due_at))
                            : 'No due date'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to="/tasks">View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}