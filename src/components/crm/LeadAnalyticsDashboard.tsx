import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePipelineStats, useLeadSourcePerformance } from '@/hooks/useLeadManagement';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { TrendingUp, Users, DollarSign, Target } from 'lucide-react';

const COLORS = ['#3b82f6', '#eab308', '#a855f7', '#f97316', '#22c55e', '#ef4444', '#64748b'];

export function LeadAnalyticsDashboard() {
  const { data: pipelineStats } = usePipelineStats();
  const { data: sourcePerformance } = useLeadSourcePerformance();

  const totalLeads = pipelineStats?.reduce((sum, stat) => sum + stat.count, 0) || 0;
  const totalValue = pipelineStats?.reduce((sum, stat) => sum + stat.value, 0) || 0;
  const wonLeads = pipelineStats?.find(s => s.stage === 'won')?.count || 0;
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const pipelineChartData = pipelineStats?.filter(s => s.stage !== 'lost' && s.stage !== 'nurturing').map(stat => ({
    stage: stat.stage.charAt(0).toUpperCase() + stat.stage.slice(1),
    count: stat.count,
    value: stat.value,
  })) || [];

  const sourceChartData = sourcePerformance?.slice(0, 5).map(source => ({
    name: source.name,
    leads: source.total_leads,
    conversion: source.conversion_rate,
    roi: source.roi,
  })) || [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Lead Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              Active in pipeline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              Estimated annual premium
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {wonLeads} leads won
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Deal Size</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {wonLeads > 0 ? formatCurrency(totalValue / wonLeads) : '$0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Per won lead
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pipeline by Stage */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline by Stage</CardTitle>
            <CardDescription>Lead count and value per stage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pipelineChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="Lead Count" />
                <Bar yAxisId="right" dataKey="value" fill="#22c55e" name="Value ($)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lead Sources Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
            <CardDescription>Top 5 sources by lead volume</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sourceChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.leads}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="leads"
                >
                  {sourceChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Source Conversion Rates */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Source Conversion Rates</CardTitle>
            <CardDescription>Conversion percentage by lead source</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sourceChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="conversion" stroke="#3b82f6" name="Conversion Rate (%)" strokeWidth={2} />
                <Line type="monotone" dataKey="roi" stroke="#22c55e" name="ROI (%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
