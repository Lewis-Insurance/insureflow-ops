import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLeads } from '@/hooks/useLeads';
import { useUsers } from '@/hooks/useLeads';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Award,
  Activity,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function TeamPipelineView() {
  const { data: leadsResponse, isLoading } = useLeads();
  const allLeads = leadsResponse?.data || [];
  const { data: users = [] } = useUsers();

  const teamMetrics = useMemo(() => {
    // Overall team stats
    const totalLeads = allLeads.length;
    const activeLeads = allLeads.filter((l) =>
      ['new', 'contacted', 'qualified', 'quoted'].includes(l.status)
    ).length;
    const wonLeads = allLeads.filter((l) => l.status === 'won').length;
    const lostLeads = allLeads.filter((l) => l.status === 'lost').length;
    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

    const totalRevenue = allLeads
      .filter((l) => l.status === 'won' && l.estimated_premium)
      .reduce((sum, l) => sum + (l.estimated_premium || 0), 0);

    const pipelineValue = allLeads
      .filter(
        (l) =>
          ['contacted', 'qualified', 'quoted'].includes(l.status) &&
          l.estimated_premium
      )
      .reduce((sum, l) => sum + (l.estimated_premium || 0), 0);

    // Producer performance breakdown
    const producerStats = users.map((user) => {
      const userLeads = allLeads.filter((l) => l.assigned_to === user.id);
      const userWon = userLeads.filter((l) => l.status === 'won').length;
      const userActive = userLeads.filter((l) =>
        ['new', 'contacted', 'qualified', 'quoted'].includes(l.status)
      ).length;
      const userRevenue = userLeads
        .filter((l) => l.status === 'won' && l.estimated_premium)
        .reduce((sum, l) => sum + (l.estimated_premium || 0), 0);

      return {
        id: user.id,
        name: user.full_name || 'Unknown',
        avatar: user.avatar_url,
        totalLeads: userLeads.length,
        activeLeads: userActive,
        wonLeads: userWon,
        conversionRate: userLeads.length > 0 ? (userWon / userLeads.length) * 100 : 0,
        revenue: userRevenue,
      };
    }).sort((a, b) => b.wonLeads - a.wonLeads);

    // Stage distribution
    const stageDistribution = [
      {
        name: 'New',
        value: allLeads.filter((l) => l.status === 'new').length,
      },
      {
        name: 'Contacted',
        value: allLeads.filter((l) => l.status === 'contacted').length,
      },
      {
        name: 'Qualified',
        value: allLeads.filter((l) => l.status === 'qualified').length,
      },
      {
        name: 'Quoted',
        value: allLeads.filter((l) => l.status === 'quoted').length,
      },
      {
        name: 'Won',
        value: wonLeads,
      },
      {
        name: 'Lost',
        value: lostLeads,
      },
    ];

    // Producer comparison data for chart
    const producerComparison = producerStats.slice(0, 6).map((p) => ({
      name: p.name.split(' ')[0], // First name only for chart
      leads: p.totalLeads,
      won: p.wonLeads,
      revenue: p.revenue,
    }));

    return {
      totalLeads,
      activeLeads,
      wonLeads,
      lostLeads,
      conversionRate,
      totalRevenue,
      pipelineValue,
      producerStats,
      stageDistribution,
      producerComparison,
    };
  }, [allLeads, users]);

  return (
    <div className="space-y-6">
      {/* Team Overview Header */}
      <div>
        <h2 className="text-3xl font-bold">Team Pipeline Overview</h2>
        <p className="text-muted-foreground">
          Aggregated performance across all producers
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamMetrics.totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              {teamMetrics.activeLeads} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Team Conversion Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teamMetrics.conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {teamMetrics.wonLeads} / {teamMetrics.totalLeads} won
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${teamMetrics.totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Closed deals</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${teamMetrics.pipelineValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Producer Performance Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Producer Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={teamMetrics.producerComparison}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="leads" fill="#3b82f6" name="Total Leads" />
                <Bar dataKey="won" fill="#10b981" name="Won" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pipeline Stage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={teamMetrics.stageDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {teamMetrics.stageDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Producer Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Producer Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {teamMetrics.producerStats.map((producer, index) => (
              <div
                key={producer.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex items-center gap-3">
                    {index < 3 && (
                      <Award
                        className={`h-6 w-6 ${
                          index === 0
                            ? 'text-yellow-500'
                            : index === 1
                            ? 'text-gray-400'
                            : 'text-amber-600'
                        }`}
                      />
                    )}
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={producer.avatar} />
                      <AvatarFallback>
                        {producer.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{producer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {producer.totalLeads} total leads
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {producer.wonLeads} Won
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {producer.conversionRate.toFixed(1)}% rate
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-medium">
                      ${producer.revenue.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                  </div>

                  <div className="w-32">
                    <Progress
                      value={producer.conversionRate}
                      className="h-2"
                    />
                  </div>

                  <Badge
                    variant={
                      producer.activeLeads > 10
                        ? 'default'
                        : producer.activeLeads > 5
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {producer.activeLeads} Active
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
