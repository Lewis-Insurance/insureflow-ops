import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useLeadProjections, ProjectionMetric } from '@/hooks/useLeadProjections';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, FileCheck, Phone, Target, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

const metricConfig = {
  revenue: {
    label: 'Revenue',
    icon: DollarSign,
    color: '#22c55e',
    format: (value: number) => `$${(value / 1000).toFixed(1)}k`,
  },
  leads: {
    label: 'Leads',
    icon: Users,
    color: '#3b82f6',
    format: (value: number) => value.toFixed(0),
  },
  policies: {
    label: 'Policies',
    icon: FileCheck,
    color: '#8b5cf6',
    format: (value: number) => value.toFixed(0),
  },
  calls: {
    label: 'Calls',
    icon: Phone,
    color: '#f97316',
    format: (value: number) => value.toFixed(0),
  },
  quotes: {
    label: 'Quotes',
    // Avoid FileText in module-scope config (Safari init-order edge case)
    icon: FileCheck,
    color: '#eab308',
    format: (value: number) => value.toFixed(0),
  },
};

export function ProjectionMetricsToggle() {
  const [selectedMetric, setSelectedMetric] = useState<ProjectionMetric>('revenue');
  const { data: projection, isLoading } = useLeadProjections(selectedMetric);

  const config = metricConfig[selectedMetric];
  const Icon = config.icon;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading projections...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!projection) return null;

  const { summary, data, trend } = projection;

  return (
    <div className="space-y-4">
      {/* Metric Selector */}
      <Tabs value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as ProjectionMetric)}>
        <TabsList className="grid w-full grid-cols-5">
          {(Object.keys(metricConfig) as ProjectionMetric[]).map((metric) => {
            const MetricIcon = metricConfig[metric].icon;
            return (
              <TabsTrigger key={metric} value={metric} className="flex items-center gap-2">
                <MetricIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{metricConfig[metric].label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current</CardTitle>
            <Icon className="h-4 w-4" style={{ color: config.color }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{config.format(summary.current)}</div>
            <p className="text-xs text-muted-foreground">
              {summary.percentOfPeriod.toFixed(1)}% of period elapsed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projected</CardTitle>
            {trend === 'up' ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : trend === 'down' ? (
              <TrendingDown className="h-4 w-4 text-red-500" />
            ) : (
              <Target className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{config.format(summary.projected)}</div>
            <p className="text-xs text-muted-foreground">
              End of month estimate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Target</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{config.format(summary.target)}</div>
            <p className="text-xs text-muted-foreground">
              Monthly goal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            {summary.onTrack ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.percentOfTarget.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground">
              {summary.onTrack ? (
                <span className="text-green-600">On track ✓</span>
              ) : (
                <span className="text-orange-600">
                  {config.format(Math.abs(summary.variance))} {summary.variance < 0 ? 'behind' : 'ahead'}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Projection Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" style={{ color: config.color }} />
            {config.label} Projection & Trend
          </CardTitle>
          <CardDescription>
            Actual performance vs projected trajectory vs target goal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`color-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config.color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={config.color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                className="text-xs"
              />
              <YAxis 
                tickFormatter={config.format}
                className="text-xs"
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))' 
                }}
                labelFormatter={(value) => format(new Date(value as string), 'PPP')}
                formatter={(value: number, name: string) => [config.format(value), name]}
              />
              <Legend />
              
              {/* Target line */}
              <Line 
                type="monotone" 
                dataKey="target" 
                stroke="#94a3b8" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Target"
                dot={false}
              />

              {/* Projected line */}
              <Line 
                type="monotone" 
                dataKey="projected" 
                stroke={config.color}
                strokeWidth={2}
                strokeDasharray="3 3"
                name="Projected"
                dot={false}
              />

              {/* Actual performance */}
              <Area
                type="monotone"
                dataKey="actual"
                stroke={config.color}
                strokeWidth={3}
                fill={`url(#color-${selectedMetric})`}
                name="Actual"
              />

              {/* Current day marker */}
              <ReferenceLine 
                x={format(new Date(), 'yyyy-MM-dd')}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                label={{ 
                  value: 'Today', 
                  position: 'top',
                  fill: 'hsl(var(--primary))'
                }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Insights */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              {trend === 'up' ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : trend === 'down' ? (
                <TrendingDown className="h-5 w-5 text-red-500" />
              ) : (
                <Target className="h-5 w-5 text-blue-500" />
              )}
              <div>
                <div className="text-sm font-medium">Trend</div>
                <div className="text-xs text-muted-foreground">
                  {trend === 'up' ? 'Accelerating' : trend === 'down' ? 'Slowing' : 'Steady'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Target className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-medium">Pace Required</div>
                <div className="text-xs text-muted-foreground">
                  {config.format((summary.target - summary.current) / Math.max(1, 30 - summary.percentOfPeriod * 30 / 100))} per day
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              {summary.projected >= summary.target ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-orange-500" />
              )}
              <div>
                <div className="text-sm font-medium">Forecast vs Target</div>
                <div className="text-xs text-muted-foreground">
                  {summary.projected >= summary.target ? (
                    <span className="text-green-600">
                      {config.format(summary.projected - summary.target)} above target
                    </span>
                  ) : (
                    <span className="text-orange-600">
                      {config.format(summary.target - summary.projected)} below target
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
