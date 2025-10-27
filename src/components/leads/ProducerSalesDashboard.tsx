import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useLeads } from "@/hooks/useLeads";
import { TrendingUp, Target, DollarSign, Award, Activity } from "lucide-react";
import { useMemo } from "react";
import {
  LineChart,
  Line,
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
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";

interface ProducerSalesDashboardProps {
  producerId: string;
  producerName?: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const ProducerSalesDashboard = ({
  producerId,
  producerName = "Producer",
}: ProducerSalesDashboardProps) => {
  const { data: allLeads } = useLeads({ assigned_to: producerId });

  const metrics = useMemo(() => {
    if (!allLeads) return null;

    const today = startOfDay(new Date());
    const last30Days = subDays(today, 30);

    // Filter leads from last 30 days
    const recentLeads = allLeads.filter(
      (lead) => new Date(lead.created_at) >= last30Days
    );

    // Calculate metrics
    const totalLeads = allLeads.length;
    const newLeads = allLeads.filter((l) => l.status === 'new').length;
    const inProgress = allLeads.filter((l) =>
      ['contacted', 'qualified', 'quoted'].includes(l.status)
    ).length;
    const wonLeads = allLeads.filter((l) => l.status === 'won').length;
    const lostLeads = allLeads.filter((l) => l.status === 'lost').length;

    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

    // Calculate revenue
    const totalRevenue = allLeads
      .filter((l) => l.status === 'won' && l.current_premium)
      .reduce((sum, l) => sum + (l.current_premium || 0), 0);

    const pipelineValue = allLeads
      .filter(
        (l) =>
          ['contacted', 'qualified', 'quoted'].includes(l.status) &&
          l.current_premium
      )
      .reduce((sum, l) => sum + (l.current_premium || 0), 0);

    // Activity over last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i);
      const dateStr = format(date, 'MMM dd');
      const leadsCreated = recentLeads.filter(
        (l) =>
          format(new Date(l.created_at), 'MMM dd') === dateStr
      ).length;

      return {
        date: dateStr,
        leads: leadsCreated,
      };
    });

    // Leads by stage
    const leadsByStage = [
      { name: 'New', value: newLeads, color: COLORS[0] },
      { name: 'In Progress', value: inProgress, color: COLORS[1] },
      { name: 'Won', value: wonLeads, color: COLORS[2] },
      { name: 'Lost', value: lostLeads, color: COLORS[3] },
    ];

    // Insurance types breakdown
    const insuranceTypes = allLeads
      .flatMap((l) => l.insurance_types || [])
      .reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const insuranceData = Object.entries(insuranceTypes).map(([name, value]) => ({
      name,
      value,
    }));

    // Goals (example - you'd fetch these from a goals table)
    const monthlyGoal = {
      target: 20,
      current: wonLeads,
      percentage: Math.min((wonLeads / 20) * 100, 100),
    };

    const revenueGoal = {
      target: 50000,
      current: totalRevenue,
      percentage: Math.min((totalRevenue / 50000) * 100, 100),
    };

    return {
      totalLeads,
      newLeads,
      inProgress,
      wonLeads,
      lostLeads,
      conversionRate,
      totalRevenue,
      pipelineValue,
      last7Days,
      leadsByStage,
      insuranceData,
      monthlyGoal,
      revenueGoal,
    };
  }, [allLeads]);

  if (!metrics) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">{producerName}'s Dashboard</h2>
          <p className="text-muted-foreground">Track your sales performance</p>
        </div>
        <Badge className="text-lg px-4 py-2">
          <Award className="mr-2 h-5 w-5" />
          Top Performer
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.newLeads} new leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Conversion Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.wonLeads} / {metrics.totalLeads} closed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Annual premium</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.pipelineValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
      </div>

      {/* Goals */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Monthly Sales Goal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">
                {metrics.monthlyGoal.current} / {metrics.monthlyGoal.target} policies
              </span>
            </div>
            <Progress value={metrics.monthlyGoal.percentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {metrics.monthlyGoal.percentage.toFixed(0)}% of monthly goal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue Goal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">
                ${metrics.revenueGoal.current.toLocaleString()} / $
                {metrics.revenueGoal.target.toLocaleString()}
              </span>
            </div>
            <Progress value={metrics.revenueGoal.percentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {metrics.revenueGoal.percentage.toFixed(0)}% of revenue goal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Activity (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={metrics.last7Days}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pipeline Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={metrics.leadsByStage}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {metrics.leadsByStage.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Insurance Types */}
      {metrics.insuranceData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Insurance Types Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.insuranceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
