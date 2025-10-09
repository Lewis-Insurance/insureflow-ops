import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Users, DollarSign, FileText, Calendar } from 'lucide-react';
import { usePolicies } from '@/hooks/usePolicies';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '12m' | '24m'>('12m');
  const { data: policies } = usePolicies({});

  // Generate monthly trend data
  const trendData = useMemo(() => {
    const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : timeRange === '12m' ? 12 : 24;
    const endDate = new Date();
    const startDate = subMonths(endDate, months);
    const monthsArray = eachMonthOfInterval({ start: startDate, end: endDate });

    return monthsArray.map(month => {
      const monthPolicies = policies?.filter(p => {
        const policyDate = new Date(p.created_at);
        return policyDate >= startOfMonth(month) && policyDate <= endOfMonth(month);
      }) || [];

      const revenue = monthPolicies.reduce((sum, p) => sum + (Number(p.premium) || 0), 0);
      
      return {
        month: format(month, 'MMM yyyy'),
        revenue: Math.round(revenue),
        policies: monthPolicies.length,
        customers: monthPolicies.length, // Simplified - would need unique account count
        avgPolicyValue: monthPolicies.length > 0 ? Math.round(revenue / monthPolicies.length) : 0,
      };
    });
  }, [policies, timeRange]);

  // Cohort analysis data (mock for demonstration)
  const cohortData = useMemo(() => {
    const cohorts = ['Jan 2024', 'Feb 2024', 'Mar 2024', 'Apr 2024', 'May 2024', 'Jun 2024'];
    return cohorts.map((cohort, idx) => ({
      cohort,
      month0: 100,
      month1: 100 - (idx * 2 + 5),
      month2: 100 - (idx * 2 + 12),
      month3: 100 - (idx * 2 + 18),
      month4: 100 - (idx * 2 + 23),
      month5: 100 - (idx * 2 + 27),
      month6: 100 - (idx * 2 + 30),
    }));
  }, []);

  // Forecasting data
  const forecastData = useMemo(() => {
    const lastValue = trendData[trendData.length - 1]?.revenue || 0;
    const growthRate = 1.08; // 8% monthly growth assumption
    
    const forecast = [];
    for (let i = 1; i <= 6; i++) {
      const forecastDate = new Date();
      forecastDate.setMonth(forecastDate.getMonth() + i);
      forecast.push({
        month: format(forecastDate, 'MMM yyyy'),
        actual: null,
        forecast: Math.round(lastValue * Math.pow(growthRate, i)),
        lower: Math.round(lastValue * Math.pow(growthRate * 0.9, i)),
        upper: Math.round(lastValue * Math.pow(growthRate * 1.1, i)),
      });
    }

    return [
      ...trendData.slice(-6).map(d => ({
        month: d.month,
        actual: d.revenue,
        forecast: null,
        lower: null,
        upper: null,
      })),
      ...forecast,
    ];
  }, [trendData]);

  // Key metrics
  const metrics = useMemo(() => {
    const recent = trendData.slice(-3);
    const previous = trendData.slice(-6, -3);
    
    const recentRevenue = recent.reduce((sum, d) => sum + d.revenue, 0);
    const previousRevenue = previous.reduce((sum, d) => sum + d.revenue, 0);
    const revenueGrowth = previousRevenue > 0 ? ((recentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    const recentPolicies = recent.reduce((sum, d) => sum + d.policies, 0);
    const previousPolicies = previous.reduce((sum, d) => sum + d.policies, 0);
    const policyGrowth = previousPolicies > 0 ? ((recentPolicies - previousPolicies) / previousPolicies) * 100 : 0;

    return [
      {
        label: 'Revenue Trend',
        value: `$${(recentRevenue / 1000).toFixed(0)}K`,
        change: revenueGrowth,
        icon: DollarSign,
      },
      {
        label: 'Policy Growth',
        value: recentPolicies.toString(),
        change: policyGrowth,
        icon: FileText,
      },
      {
        label: 'Avg Policy Value',
        value: `$${(recentRevenue / recentPolicies).toFixed(0)}`,
        change: 0,
        icon: TrendingUp,
      },
      {
        label: 'Customer Retention',
        value: '87%',
        change: 2.3,
        icon: Users,
      },
    ];
  }, [trendData]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Trends, cohort analysis, and forecasting
          </p>
        </div>
        <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">Last 3 months</SelectItem>
            <SelectItem value="6m">Last 6 months</SelectItem>
            <SelectItem value="12m">Last 12 months</SelectItem>
            <SelectItem value="24m">Last 24 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const isPositive = metric.change >= 0;
          return (
            <Card key={metric.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {metric.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metric.value}</div>
                {metric.change !== 0 && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    {isPositive ? (
                      <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                    )}
                    <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
                      {Math.abs(metric.change).toFixed(1)}%
                    </span>
                    <span className="ml-1">vs prev period</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="cohorts">Cohort Analysis</TabsTrigger>
          <TabsTrigger value="forecast">Forecasting</TabsTrigger>
          <TabsTrigger value="segments">Segmentation</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Monthly revenue over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Policy Volume</CardTitle>
                <CardDescription>Number of policies written</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="policies" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Growth</CardTitle>
                <CardDescription>New customers per month</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="customers"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Policy Value</CardTitle>
                <CardDescription>Average premium per policy</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="avgPolicyValue"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cohorts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Retention Cohorts</CardTitle>
              <CardDescription>
                Retention rate by customer acquisition month (% retained)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Cohort</th>
                      <th className="text-center p-2 font-medium">M0</th>
                      <th className="text-center p-2 font-medium">M1</th>
                      <th className="text-center p-2 font-medium">M2</th>
                      <th className="text-center p-2 font-medium">M3</th>
                      <th className="text-center p-2 font-medium">M4</th>
                      <th className="text-center p-2 font-medium">M5</th>
                      <th className="text-center p-2 font-medium">M6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortData.map((cohort) => (
                      <tr key={cohort.cohort} className="border-b">
                        <td className="p-2 font-medium">{cohort.cohort}</td>
                        <td className="text-center p-2 bg-primary/20">{cohort.month0}%</td>
                        <td className="text-center p-2" style={{ backgroundColor: `hsl(var(--primary) / ${cohort.month1 / 100 * 0.3})` }}>
                          {cohort.month1}%
                        </td>
                        <td className="text-center p-2" style={{ backgroundColor: `hsl(var(--primary) / ${cohort.month2 / 100 * 0.3})` }}>
                          {cohort.month2}%
                        </td>
                        <td className="text-center p-2" style={{ backgroundColor: `hsl(var(--primary) / ${cohort.month3 / 100 * 0.3})` }}>
                          {cohort.month3}%
                        </td>
                        <td className="text-center p-2" style={{ backgroundColor: `hsl(var(--primary) / ${cohort.month4 / 100 * 0.3})` }}>
                          {cohort.month4}%
                        </td>
                        <td className="text-center p-2" style={{ backgroundColor: `hsl(var(--primary) / ${cohort.month5 / 100 * 0.3})` }}>
                          {cohort.month5}%
                        </td>
                        <td className="text-center p-2" style={{ backgroundColor: `hsl(var(--primary) / ${cohort.month6 / 100 * 0.3})` }}>
                          {cohort.month6}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cohort Retention Visualization</CardTitle>
              <CardDescription>Visual representation of retention trends</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={cohortData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="cohort" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="month1" stroke="hsl(var(--chart-1))" name="Month 1" />
                  <Line type="monotone" dataKey="month3" stroke="hsl(var(--chart-2))" name="Month 3" />
                  <Line type="monotone" dataKey="month6" stroke="hsl(var(--chart-3))" name="Month 6" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Forecast</CardTitle>
              <CardDescription>
                6-month revenue projection with confidence intervals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    stroke="none"
                    fill="hsl(var(--muted))"
                    name="Lower Bound"
                  />
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="none"
                    fill="hsl(var(--muted))"
                    name="Upper Bound"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    name="Actual"
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Forecast"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Best Case
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${((forecastData[forecastData.length - 1]?.upper || 0) / 1000).toFixed(0)}K
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  6-month projection (optimistic)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Expected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${((forecastData[forecastData.length - 1]?.forecast || 0) / 1000).toFixed(0)}K
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  6-month projection (baseline)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Worst Case
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  ${((forecastData[forecastData.length - 1]?.lower || 0) / 1000).toFixed(0)}K
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  6-month projection (conservative)
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="segments" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Customer Segmentation</CardTitle>
                <CardDescription>By policy count and value</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={[
                      { segment: 'High Value', count: 45, revenue: 450000 },
                      { segment: 'Medium Value', count: 120, revenue: 360000 },
                      { segment: 'Low Value', count: 235, revenue: 235000 },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="segment" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="hsl(var(--primary))" name="Customer Count" />
                    <Bar dataKey="revenue" fill="hsl(var(--chart-2))" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Line of Business Mix</CardTitle>
                <CardDescription>Distribution by line of business</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={[
                      { lob: 'Auto', policies: 180, premium: 540000 },
                      { lob: 'Home', policies: 150, premium: 450000 },
                      { lob: 'Life', policies: 90, premium: 270000 },
                      { lob: 'Commercial', policies: 60, premium: 360000 },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="lob" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="policies" fill="hsl(var(--chart-3))" name="Policies" />
                    <Bar dataKey="premium" fill="hsl(var(--chart-4))" name="Premium" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
