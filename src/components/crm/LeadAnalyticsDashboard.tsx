import { useDashboardMetrics, useHistoricalTrend, usePipelineHealth } from '@/hooks/useDashboardMetrics';
import { useLeads } from '@/hooks/useLeads';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ActivityHeatmap } from '@/components/visualizations/ActivityHeatmap';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Target,
  Activity,
  Calendar,
  Clock,
  Award,
  Zap,
} from 'lucide-react';
import { format, parseISO, getHours, getDay } from 'date-fns';

const COLORS = ['#3b82f6', '#8b5cf6', '#eab308', '#f97316', '#10b981', '#ef4444', '#6b7280'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function LeadAnalyticsDashboard() {
  const { data: metrics } = useDashboardMetrics();
  const { data: trendData } = useHistoricalTrend(30);
  const { data: pipelineHealth } = usePipelineHealth();
  const { data: allLeads } = useLeads();

  if (!metrics) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-32 bg-muted rounded mb-4"></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 bg-muted rounded"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate conversion funnel
  const funnelData = [
    { stage: 'New Leads', count: metrics.pipeline.new, percentage: 100 },
    { stage: 'Contacted', count: metrics.pipeline.contacted, percentage: metrics.pipeline.new > 0 ? (metrics.pipeline.contacted / metrics.pipeline.new * 100) : 0 },
    { stage: 'Qualified', count: metrics.pipeline.qualified, percentage: metrics.pipeline.new > 0 ? (metrics.pipeline.qualified / metrics.pipeline.new * 100) : 0 },
    { stage: 'Quoted', count: metrics.pipeline.quoted, percentage: metrics.pipeline.new > 0 ? (metrics.pipeline.quoted / metrics.pipeline.new * 100) : 0 },
    { stage: 'Won', count: metrics.pipeline.won, percentage: metrics.pipeline.new > 0 ? (metrics.pipeline.won / metrics.pipeline.new * 100) : 0 },
  ];

  // Calculate source distribution
  const sourceMap: Record<string, number> = {};
  allLeads?.forEach(lead => {
    const source = lead.source_name || 'Unknown';
    sourceMap[source] = (sourceMap[source] || 0) + 1;
  });
  const sourceData = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));

  // Calculate insurance type distribution
  const insuranceTypeMap: Record<string, number> = {};
  allLeads?.forEach(lead => {
    lead.insurance_types?.forEach(type => {
      insuranceTypeMap[type] = (insuranceTypeMap[type] || 0) + 1;
    });
  });
  const insuranceTypeData = Object.entries(insuranceTypeMap).map(([name, value]) => ({ name, value }));

  // Calculate activity heatmap data
  const heatmapData = allLeads?.reduce((acc, lead) => {
    const date = parseISO(lead.created_at);
    const hour = getHours(date);
    const dayIndex = getDay(date);
    const day = DAY_NAMES[dayIndex];
    
    const key = `${day}-${hour}`;
    const existing = acc.find(d => d.day === day && d.hour === hour);
    
    if (existing) {
      existing.count++;
    } else {
      acc.push({ day, hour, count: 1 });
    }
    
    return acc;
  }, [] as { day: string; hour: number; count: number }[]) || [];

  // Lead score distribution
  const scoreRanges = [
    { range: '0-20', count: 0 },
    { range: '21-40', count: 0 },
    { range: '41-60', count: 0 },
    { range: '61-80', count: 0 },
    { range: '81-100', count: 0 },
  ];
  allLeads?.forEach(lead => {
    const score = lead.lead_score;
    if (score <= 20) scoreRanges[0].count++;
    else if (score <= 40) scoreRanges[1].count++;
    else if (score <= 60) scoreRanges[2].count++;
    else if (score <= 80) scoreRanges[3].count++;
    else scoreRanges[4].count++;
  });

  // Velocity metrics (time to conversion)
  const avgTimeToWin = allLeads
    ?.filter(l => l.status === 'won')
    .reduce((sum, lead) => {
      const days = Math.floor((new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0) / (allLeads?.filter(l => l.status === 'won').length || 1);

  return (
    <div className="space-y-6">
      {/* Key Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allLeads?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.mtd.newLeads} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.mtd.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Lead to close ratio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Deal Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.mtd.won > 0 ? Math.round(metrics.mtd.revenue / metrics.mtd.won / 1000) : 0}k
            </div>
            <p className="text-xs text-muted-foreground">
              Per closed deal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Time to Win</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(avgTimeToWin || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Days on average
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
          <CardDescription>Lead progression through pipeline stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {funnelData.map((stage, index) => (
              <div key={stage.stage} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={index === 0 ? 'default' : 'secondary'}>
                      {stage.stage}
                    </Badge>
                    <span className="text-sm font-medium">{stage.count} leads</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {stage.percentage.toFixed(1)}%
                    </span>
                    {index > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({((stage.count / funnelData[index - 1].count) * 100).toFixed(0)}% conv)
                      </span>
                    )}
                  </div>
                </div>
                <Progress value={stage.percentage} className="h-3" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Pipeline Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Distribution</CardTitle>
            <CardDescription>Current leads by stage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'New', value: metrics.pipeline.new },
                    { name: 'Contacted', value: metrics.pipeline.contacted },
                    { name: 'Qualified', value: metrics.pipeline.qualified },
                    { name: 'Quoted', value: metrics.pipeline.quoted },
                    { name: 'Won', value: metrics.pipeline.won },
                    { name: 'Lost', value: metrics.pipeline.lost },
                    { name: 'Nurturing', value: metrics.pipeline.nurturing },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(props: any) => {
                    const { name, percent } = props;
                    return percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : '';
                  }}
                  outerRadius={100}
                  dataKey="value"
                >
                  {COLORS.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lead Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Score Distribution</CardTitle>
            <CardDescription>Quality distribution of leads</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={scoreRanges}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lead Sources */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
            <CardDescription>Where leads are coming from</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sourceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Insurance Types Interest */}
        <Card>
          <CardHeader>
            <CardTitle>Insurance Type Interest</CardTitle>
            <CardDescription>Most requested insurance types</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={insuranceTypeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 30-Day Trend */}
      <Card>
        <CardHeader>
          <CardTitle>30-Day Lead Trend</CardTitle>
          <CardDescription>New leads and conversions over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => format(parseISO(value), 'MMM d')}
                className="text-xs"
              />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))' 
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="newLeads" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="New Leads"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="won" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Deals Won"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity Heatmap */}
      <ActivityHeatmap 
        data={heatmapData}
        title="Lead Activity Heatmap"
        description="When leads are most active (by day and hour)"
      />

      {/* Pipeline Health Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Health Metrics</CardTitle>
          <CardDescription>Detailed performance by stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pipelineHealth?.map((stage, index) => (
              <div key={stage.stage} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index] }}
                  />
                  <div>
                    <div className="font-medium capitalize">{stage.stage}</div>
                    <div className="text-sm text-muted-foreground">
                      {stage.count} leads • ${(stage.value / 1000).toFixed(1)}k value
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline">
                    {((stage.count / (allLeads?.length || 1)) * 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Velocity</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {metrics.trend.dailyAverage.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              Deals per day average
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {((metrics.pipeline.won / ((allLeads?.length || 1))) * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Of all leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pipeline</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {metrics.pipeline.new + metrics.pipeline.contacted + metrics.pipeline.qualified + metrics.pipeline.quoted}
            </div>
            <p className="text-xs text-muted-foreground">
              Leads in active stages
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
