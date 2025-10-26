import { useState } from 'react';
import { useDashboardMetrics, useHistoricalTrend } from '@/hooks/useDashboardMetrics';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Target,
  TrendingUp,
  TrendingDown,
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

export default function ProducerDashboard() {
  const { user } = useAuth();
  const { data: metrics, isLoading } = useDashboardMetrics(user?.id);
  const { data: trendData } = useHistoricalTrend(30, user?.id);
  const [metricType, setMetricType] = useState<'sales' | 'activity'>('sales');

  if (isLoading || !metrics) {
    return (
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
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
          <p className="text-muted-foreground">
            Track your daily progress and monthly trends
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={metricType === 'sales' ? 'default' : 'outline'} 
                 className="cursor-pointer" 
                 onClick={() => setMetricType('sales')}>
            Sales
          </Badge>
          <Badge variant={metricType === 'activity' ? 'default' : 'outline'} 
                 className="cursor-pointer" 
                 onClick={() => setMetricType('activity')}>
            Activity
          </Badge>
        </div>
      </div>

      {/* Today's Goal Card */}
      <Card className="border-2 border-primary">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Today's Goal</CardTitle>
              <CardDescription>Your daily target progress</CardDescription>
            </div>
            <Target className="h-8 w-8 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-4xl font-bold">{metrics.today.won}</div>
                <div className="text-sm text-muted-foreground">
                  of {metrics.today.goalTarget} deals closed
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">
                  {Math.round(metrics.today.goalProgress)}%
                </div>
                <div className="text-sm text-muted-foreground">Complete</div>
              </div>
            </div>
            <Progress value={metrics.today.goalProgress} className="h-3" />
            <div className="grid grid-cols-4 gap-4 text-center text-sm">
              <div>
                <div className="font-semibold text-blue-600">{metrics.today.newLeads}</div>
                <div className="text-muted-foreground">New</div>
              </div>
              <div>
                <div className="font-semibold text-purple-600">{metrics.today.contacted}</div>
                <div className="text-muted-foreground">Contacted</div>
              </div>
              <div>
                <div className="font-semibold text-yellow-600">{metrics.today.qualified}</div>
                <div className="text-muted-foreground">Qualified</div>
              </div>
              <div>
                <div className="font-semibold text-orange-600">{metrics.today.quoted}</div>
                <div className="text-muted-foreground">Quoted</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trend & MTD Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Trend Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Trending For This Month</CardTitle>
                <CardDescription>Projected vs target</CardDescription>
              </div>
              {metrics.trend.onTrack ? (
                <TrendingUp className="h-6 w-6 text-green-500" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-500" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{metrics.trend.projectedWins}</div>
                  <div className="text-sm text-muted-foreground">projected wins</div>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  ${(metrics.trend.projectedRevenue / 1000).toFixed(1)}k projected revenue
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Daily Average</span>
                  <span className="font-semibold">{metrics.trend.dailyAverage} deals/day</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Days Remaining</span>
                  <span className="font-semibold">{metrics.trend.daysRemaining} days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={metrics.trend.onTrack ? 'default' : 'destructive'}>
                    {metrics.trend.onTrack ? 'On Track' : 'Behind'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MTD Actuals Card */}
        <Card>
          <CardHeader>
            <CardTitle>Month-to-Date Actuals</CardTitle>
            <CardDescription>Your actual numbers this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold text-green-600">{metrics.mtd.won}</div>
                  <div className="text-sm text-muted-foreground">Deals Won</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    ${(metrics.mtd.revenue / 1000).toFixed(1)}k
                  </div>
                  <div className="text-sm text-muted-foreground">Revenue</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Leads</span>
                  <span className="font-semibold">{metrics.mtd.newLeads}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quoted</span>
                  <span className="font-semibold">{metrics.mtd.quoted}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Conversion Rate</span>
                  <span className="font-semibold">{metrics.mtd.conversionRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle>30-Day Performance Trend</CardTitle>
          <CardDescription>Your activity over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="newLeads" 
                stroke="#3b82f6" 
                name="New Leads" 
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="won" 
                stroke="#10b981" 
                name="Deals Won" 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pipeline Status */}
      <Card>
        <CardHeader>
          <CardTitle>My Pipeline</CardTitle>
          <CardDescription>Current leads distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={[
                { stage: 'New', count: metrics.pipeline.new },
                { stage: 'Contacted', count: metrics.pipeline.contacted },
                { stage: 'Qualified', count: metrics.pipeline.qualified },
                { stage: 'Quoted', count: metrics.pipeline.quoted },
                { stage: 'Won', count: metrics.pipeline.won },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
