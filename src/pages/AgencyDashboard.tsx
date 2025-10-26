import { useDashboardMetrics, useProducerLeaderboard, usePipelineHealth } from '@/hooks/useDashboardMetrics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Trophy,
  TrendingUp,
  DollarSign,
  Target,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#eab308', '#f97316', '#10b981', '#ef4444', '#6b7280'];

export default function AgencyDashboard() {
  const { data: metrics } = useDashboardMetrics(); // Agency-wide (no producer filter)
  const { data: leaderboard } = useProducerLeaderboard();
  const { data: pipelineHealth } = usePipelineHealth();

  if (!metrics) {
    return <div className="flex-1 p-8">Loading...</div>;
  }

  const pipelineData = [
    { name: 'New', value: metrics.pipeline.new, color: COLORS[0] },
    { name: 'Contacted', value: metrics.pipeline.contacted, color: COLORS[1] },
    { name: 'Qualified', value: metrics.pipeline.qualified, color: COLORS[2] },
    { name: 'Quoted', value: metrics.pipeline.quoted, color: COLORS[3] },
    { name: 'Won', value: metrics.pipeline.won, color: COLORS[4] },
    { name: 'Lost', value: metrics.pipeline.lost, color: COLORS[5] },
    { name: 'Nurturing', value: metrics.pipeline.nurturing, color: COLORS[6] },
  ];

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Agency Dashboard</h2>
        <p className="text-muted-foreground">
          Leadership view of agency performance
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(metrics.pipeline.totalValue / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">
              Across all stages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(metrics.mtd.revenue / 1000).toFixed(1)}k
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.mtd.won} deals closed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.mtd.conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Lead to close ratio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.pipeline.new + metrics.pipeline.contacted + metrics.pipeline.qualified}
            </div>
            <p className="text-xs text-muted-foreground">
              In pipeline
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        {/* Producer Leaderboard */}
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <CardTitle>Producer Leaderboard</CardTitle>
            </div>
            <CardDescription>Top performers this month</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Producer</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Conv %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard?.slice(0, 10).map((producer, index) => (
                  <TableRow key={producer.producer_id}>
                    <TableCell className="font-medium">
                      <Badge variant={index < 3 ? 'default' : 'outline'}>
                        #{index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={producer.avatar_url} />
                          <AvatarFallback>
                            {producer.producer_name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span>{producer.producer_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {producer.wins}
                    </TableCell>
                    <TableCell className="text-right">
                      ${(producer.revenue / 1000).toFixed(1)}k
                    </TableCell>
                    <TableCell className="text-right">
                      {producer.conversion_rate}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pipeline Distribution Pie Chart */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Pipeline Distribution</CardTitle>
            <CardDescription>Leads by stage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pipelineData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((Number(percent) || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pipelineData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Health */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Health</CardTitle>
          <CardDescription>Detailed view of each pipeline stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pipelineHealth?.map((stage) => (
              <div key={stage.stage} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-32 capitalize font-medium">{stage.stage}</div>
                    <Badge variant="outline">{stage.count} leads</Badge>
                    <span className="text-sm text-muted-foreground">
                      ${(stage.value / 1000).toFixed(1)}k value
                    </span>
                  </div>
                </div>
                <Progress 
                  value={((stage.count || 0) / Math.max(1, (metrics.pipeline.new || 0) + (metrics.pipeline.contacted || 0) + (metrics.pipeline.qualified || 0) + (metrics.pipeline.quoted || 0))) * 100} 
                  className="h-2" 
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
