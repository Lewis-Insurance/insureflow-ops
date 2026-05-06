import { useState } from 'react';
import { useDashboardMetrics, useHistoricalTrend } from '@/hooks/useDashboardMetrics';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Target,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Phone,
  Mail,
  Calendar,
  ArrowRight,
  Activity,
  Users,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Link } from 'react-router-dom';
import { UpcomingTasksCard } from '@/components/dashboard/UpcomingTasksCard';
import QuickAddTaskBar from '@/components/tasks/QuickAddTaskBar';
import { CustomerSearchWidget, PolicySearchWidget, UpcomingRenewalsWidget, WorkspaceWidgets } from '@/components/dashboard/WorkspaceWidgets';
import { DashboardGlobalSearch } from '@/components/dashboard/DashboardGlobalSearch';

export default function ProducerDashboard() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: metrics, isLoading } = useDashboardMetrics(userId);
  const { data: trendData } = useHistoricalTrend(30, userId);
  const [activeTab, setActiveTab] = useState<'workspace' | 'sales' | 'activity'>('workspace');

  if (isLoading || !metrics) {
    return (
      <AppLayout>
        <div className="flex-1 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
            <p className="text-muted-foreground">
              Track your daily progress and monthly trends
            </p>
          </div>
        </div>

        {/* Prominent Global Search */}
        <DashboardGlobalSearch />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Workspace Tab */}
          <TabsContent value="workspace" className="space-y-6 mt-6">
            <UpcomingTasksCard />
            <QuickAddTaskBar />
            <WorkspaceWidgets />
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className="space-y-6 mt-6">
            {/* Today's Goal Card - Sales */}
            <Card className="border-2 border-primary shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <Target className="h-6 w-6" />
                      Today's Goal
                    </CardTitle>
                    <CardDescription className="text-base">
                      Your daily target progress
                    </CardDescription>
                  </div>
                  <Link to="/leads">
                    <Button variant="outline" size="sm">
                      View All Leads
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-5xl font-bold text-primary">{metrics.today.won}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        of {metrics.today.goalTarget} deals closed today
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary">
                        {Math.round(metrics.today.goalProgress)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Complete</div>
                    </div>
                  </div>
                  <Progress value={metrics.today.goalProgress} className="h-4" />
                  
                  {/* Today's Pipeline Breakdown */}
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{metrics.today.newLeads}</div>
                      <div className="text-xs text-muted-foreground mt-1">New Leads</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{metrics.today.contacted}</div>
                      <div className="text-xs text-muted-foreground mt-1">Contacted</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">{metrics.today.qualified}</div>
                      <div className="text-xs text-muted-foreground mt-1">Qualified</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{metrics.today.quoted}</div>
                      <div className="text-xs text-muted-foreground mt-1">Quoted</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trend & MTD Cards - Sales */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Trend Card - Sales */}
              <Card className="shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {metrics.trend.onTrack ? (
                          <TrendingUp className="h-5 w-5 text-green-500" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-500" />
                        )}
                        Trending For This Month
                      </CardTitle>
                      <CardDescription>Projected vs target</CardDescription>
                    </div>
                    <Badge variant={metrics.trend.onTrack ? 'default' : 'destructive'} className="text-sm">
                      {metrics.trend.onTrack ? 'On Track' : 'Behind'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-3xl font-bold">{metrics.trend.projectedWins}</div>
                        <div className="text-sm text-muted-foreground">Projected Wins</div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-green-600">
                          ${(metrics.trend.projectedRevenue / 1000).toFixed(1)}k
                        </div>
                        <div className="text-sm text-muted-foreground">Projected Revenue</div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Daily Average</span>
                        <span className="font-semibold">{metrics.trend.dailyAverage} deals/day</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Days Remaining</span>
                        <span className="font-semibold">{metrics.trend.daysRemaining} days</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Pace Needed</span>
                        <span className="font-semibold text-primary">
                          {metrics.trend.daysRemaining > 0 
                            ? ((100 - metrics.today.won) / metrics.trend.daysRemaining).toFixed(1) 
                            : 0} deals/day
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* MTD Actuals Card - Sales */}
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Month-to-Date Actuals
                  </CardTitle>
                  <CardDescription>Your actual numbers this month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-3xl font-bold text-green-600">{metrics.mtd.won}</div>
                        <div className="text-sm text-muted-foreground">Deals Won</div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-blue-600">
                          ${(metrics.mtd.revenue / 1000).toFixed(1)}k
                        </div>
                        <div className="text-sm text-muted-foreground">Revenue</div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Total Leads</span>
                        <span className="font-semibold">{metrics.mtd.newLeads}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Qualified</span>
                        <span className="font-semibold">{metrics.mtd.qualified}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Quoted</span>
                        <span className="font-semibold">{metrics.mtd.quoted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Conversion Rate</span>
                        <Badge variant="secondary" className="font-semibold">
                          {metrics.mtd.conversionRate.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6 mt-6">
            {/* Today's Activity Card */}
            <Card className="border-2 border-primary shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <Activity className="h-6 w-6" />
                      Today's Activity
                    </CardTitle>
                    <CardDescription className="text-base">
                      Your daily activity metrics
                    </CardDescription>
                  </div>
                  <Link to="/leads">
                    <Button variant="outline" size="sm">
                      View All Leads
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Activity Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <Phone className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                      <div className="text-3xl font-bold text-blue-600">{metrics.today.contacted}</div>
                      <div className="text-sm text-muted-foreground mt-1">Calls Made</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                      <Mail className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                      <div className="text-3xl font-bold text-purple-600">{metrics.today.newLeads}</div>
                      <div className="text-sm text-muted-foreground mt-1">Emails Sent</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
                      <div className="text-3xl font-bold text-green-600">{metrics.today.qualified + metrics.today.quoted}</div>
                      <div className="text-sm text-muted-foreground mt-1">Tasks Completed</div>
                    </div>
                    <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                      <div className="text-3xl font-bold text-orange-600">{metrics.today.contacted}</div>
                      <div className="text-sm text-muted-foreground mt-1">Follow-ups</div>
                    </div>
                  </div>

                  {/* Activity Summary */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <div className="text-xl font-bold">{metrics.today.newLeads + metrics.today.contacted + metrics.today.qualified}</div>
                      <div className="text-xs text-muted-foreground">Total Actions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold">{metrics.today.won}</div>
                      <div className="text-xs text-muted-foreground">Conversions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold">{metrics.today.contacted > 0 ? Math.round((metrics.today.won / metrics.today.contacted) * 100) : 0}%</div>
                      <div className="text-xs text-muted-foreground">Contact→Close Rate</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity MTD Cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Activity Breakdown Card */}
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-blue-500" />
                    Communication Activity
                  </CardTitle>
                  <CardDescription>Your outreach this month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-3xl font-bold text-blue-600">{metrics.mtd.contacted}</div>
                        <div className="text-sm text-muted-foreground">Calls Made</div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-purple-600">
                          {metrics.mtd.newLeads}
                        </div>
                        <div className="text-sm text-muted-foreground">Emails Sent</div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Follow-ups Completed</span>
                        <span className="font-semibold">{metrics.mtd.contacted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Response Rate</span>
                        <Badge variant="secondary" className="font-semibold">
                          {metrics.mtd.contacted > 0 ? Math.round((metrics.mtd.qualified / metrics.mtd.contacted) * 100) : 0}%
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Avg. Daily Actions</span>
                        <span className="font-semibold">
                          {Math.round((metrics.mtd.contacted + metrics.mtd.newLeads) / Math.max(metrics.trend.daysRemaining, 1))}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Task Completion Card */}
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Task Performance
                  </CardTitle>
                  <CardDescription>Productivity metrics this month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-3xl font-bold text-green-600">{metrics.mtd.qualified + metrics.mtd.quoted}</div>
                        <div className="text-sm text-muted-foreground">Tasks Completed</div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-orange-600">
                          {metrics.mtd.newLeads + metrics.mtd.contacted}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Actions</div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Leads Contacted</span>
                        <span className="font-semibold">{metrics.mtd.contacted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Quotes Sent</span>
                        <span className="font-semibold">{metrics.mtd.quoted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Efficiency Score</span>
                        <Badge variant="secondary" className="font-semibold">
                          {metrics.mtd.newLeads > 0 ? Math.min(Math.round((metrics.mtd.won / metrics.mtd.newLeads) * 100), 100) : 0}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks to keep your pipeline moving</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link to="/leads?status=new">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Users className="h-6 w-6" />
                  <span className="text-xs">Follow Up on New Leads</span>
                </Button>
              </Link>
              <Link to="/leads?status=contacted">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Phone className="h-6 w-6" />
                  <span className="text-xs">Contact Pending Leads</span>
                </Button>
              </Link>
              <Link to="/leads?status=qualified">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Mail className="h-6 w-6" />
                  <span className="text-xs">Send Quotes</span>
                </Button>
              </Link>
              <Link to="/leads">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-2">
                  <Target className="h-6 w-6" />
                  <span className="text-xs">View All Leads</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
