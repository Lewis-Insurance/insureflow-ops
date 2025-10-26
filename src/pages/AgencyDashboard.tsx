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
import { Button } from '@/components/ui/button';
import {
  Trophy,
  TrendingUp,
  Users,
  DollarSign,
  Target,
  Activity,
  Medal,
  Award,
  ArrowRight,
} from 'lucide-react';
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
} from 'recharts';
import { Link } from 'react-router-dom';

const COLORS = ['#3b82f6', '#8b5cf6', '#eab308', '#f97316', '#10b981', '#ef4444', '#6b7280'];

export default function AgencyDashboard() {
  const { data: metrics, isLoading } = useDashboardMetrics(); // Agency-wide (no producer filter)
  const { data: leaderboard } = useProducerLeaderboard();
  const { data: pipelineHealth } = usePipelineHealth();

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

  const pipelineData = [
    { name: 'New', value: metrics.pipeline.new, color: COLORS[0] },
    { name: 'Contacted', value: metrics.pipeline.contacted, color: COLORS[1] },
    { name: 'Qualified', value: metrics.pipeline.qualified, color: COLORS[2] },
    { name: 'Quoted', value: metrics.pipeline.quoted, color: COLORS[3] },
    { name: 'Won', value: metrics.pipeline.won, color: COLORS[4] },
    { name: 'Lost', value: metrics.pipeline.lost, color: COLORS[5] },
    { name: 'Nurturing', value: metrics.pipeline.nurturing, color: COLORS[6] },
  ];

  const totalActiveLeads = metrics.pipeline.new + metrics.pipeline.contacted + 
                           metrics.pipeline.qualified + metrics.pipeline.quoted;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Agency Dashboard</h2>
          <p className="text-muted-foreground">
            Leadership view of Lewis Insurance performance
          </p>
        </div>
        <Link to="/leads">
          <Button>
            View All Leads
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(metrics.pipeline.totalValue / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all stages
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${(metrics.mtd.revenue / 1000).toFixed(1)}k
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.mtd.won} deals closed
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {metrics.mtd.conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Lead to close ratio
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {totalActiveLeads}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              In active pipeline
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-7">
        {/* Producer Leaderboard */}
        <Card className="col-span-4 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <CardTitle>Producer Leaderboard</CardTitle>
              </div>
              <Badge variant="secondary">This Month</Badge>
            </div>
            <CardDescription>Top performers ranked by wins and revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Rank</TableHead>
                  <TableHead>Producer</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Conv %</TableHead>
                  <TableHead className="text-right">Avg Deal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard && leaderboard.length > 0 ? (
                  leaderboard.slice(0, 10).map((producer, index) => (
                    <TableRow key={producer.producer_id}>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {index === 0 && <Medal className="h-5 w-5 text-yellow-500" />}
                          {index === 1 && <Medal className="h-5 w-5 text-gray-400" />}
                          {index === 2 && <Medal className="h-5 w-5 text-amber-600" />}
                          {index > 2 && (
                            <Badge variant="outline" className="w-8 h-8 flex items-center justify-center p-0">
                              {index + 1}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={producer.avatar_url} />
                            <AvatarFallback>
                              {producer.producer_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{producer.producer_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={index < 3 ? 'default' : 'secondary'}>
                          {producer.wins}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${(producer.revenue / 1000).toFixed(1)}k
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={producer.conversion_rate > 20 ? 'text-green-600 font-semibold' : ''}>
                          {producer.conversion_rate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ${(producer.avg_deal_size / 1000).toFixed(1)}k
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No producer data available yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pipeline Distribution Pie Chart */}
        <Card className="col-span-3 shadow-md">
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
                  label={(props: any) => {
                    const { name, percent } = props;
                    return percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : '';
                  }}
                  outerRadius={100}
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
            
            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {pipelineData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Health */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Pipeline Health Details</CardTitle>
          <CardDescription>Comprehensive view of each pipeline stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pipelineHealth?.map((stage, index) => (
              <div key={stage.stage} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-32 capitalize font-medium flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index] }}
                      />
                      {stage.stage}
                    </div>
                    <Badge variant="outline" className="min-w-[80px]">
                      {stage.count} leads
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      ${(stage.value / 1000).toFixed(1)}k total value
                    </span>
                  </div>
                  <div className="text-sm font-semibold">
                    {totalActiveLeads > 0 
                      ? `${((stage.count / totalActiveLeads) * 100).toFixed(1)}%`
                      : '0%'
                    }
                  </div>
                </div>
                <Progress 
                  value={totalActiveLeads > 0 ? (stage.count / totalActiveLeads) * 100 : 0}
                  className="h-2" 
                  style={{ 
                    // @ts-ignore
                    '--progress-background': COLORS[index] 
                  }}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Flow Visualization */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Pipeline Flow</CardTitle>
          <CardDescription>Visual representation of leads moving through stages</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={pipelineHealth}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" className="text-xs" />
              <YAxis 
                dataKey="stage" 
                type="category" 
                className="text-xs capitalize"
                width={100}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))' 
                }}
              />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 8, 8, 0]}>
                {pipelineHealth?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
