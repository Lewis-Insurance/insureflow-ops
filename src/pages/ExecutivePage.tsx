import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { usePolicies, usePolicyStats } from '@/hooks/usePolicies';
import { useRenewals, useRenewalsStats } from '@/hooks/useRenewals';
import { useTasks } from '@/hooks/useTasks';
import { 
  TrendingUp, 
  TrendingDown,
  Target,
  DollarSign,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Download,
  Calendar,
  Percent
} from 'lucide-react';
import { format } from 'date-fns';

interface Metric {
  name: string;
  actual: number;
  target: number;
  unit: 'currency' | 'number' | 'percentage';
  trend: 'up' | 'down' | 'neutral';
  trendValue: number;
}

interface Initiative {
  id: string;
  name: string;
  owner: string;
  status: 'on-track' | 'at-risk' | 'behind';
  progress: number;
  dueDate: Date;
}

export default function ExecutivePage() {
  const [activeTab, setActiveTab] = useState('metrics');
  
  const { data: policies } = usePolicies({});
  const { data: policyStats } = usePolicyStats();
  const { data: renewalsStats } = useRenewalsStats();
  const { tasks } = useTasks();

  // Calculate north-star metrics
  const totalPremium = policies?.reduce((sum, p) => sum + (Number(p.premium) || 0), 0) || 0;
  const activePolicies = policyStats?.active || 0;
  const renewalRate = renewalsStats ? 
    Math.round((renewalsStats.upcoming / (renewalsStats.total || 1)) * 100) : 0;
  
  const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0;
  const totalTasks = tasks?.length || 1;
  const taskCompletionRate = Math.round((completedTasks / totalTasks) * 100);

  // North-star metrics with targets
  const northStarMetrics: Metric[] = [
    {
      name: 'Total Written Premium',
      actual: totalPremium,
      target: 5000000,
      unit: 'currency',
      trend: 'up',
      trendValue: 12.5,
    },
    {
      name: 'Active Policies',
      actual: activePolicies,
      target: 1000,
      unit: 'number',
      trend: 'up',
      trendValue: 8.3,
    },
    {
      name: 'Retention Rate',
      actual: renewalRate,
      target: 90,
      unit: 'percentage',
      trend: renewalRate >= 90 ? 'up' : 'down',
      trendValue: renewalRate >= 90 ? 2.1 : -3.2,
    },
    {
      name: 'Customer Satisfaction',
      actual: 92,
      target: 95,
      unit: 'percentage',
      trend: 'up',
      trendValue: 1.5,
    },
  ];

  // Strategic initiatives
  const initiatives: Initiative[] = [
    {
      id: '1',
      name: 'Digital Transformation',
      owner: 'CTO',
      status: 'on-track',
      progress: 75,
      dueDate: new Date('2025-06-30'),
    },
    {
      id: '2',
      name: 'Market Expansion',
      owner: 'VP Sales',
      status: 'on-track',
      progress: 60,
      dueDate: new Date('2025-09-30'),
    },
    {
      id: '3',
      name: 'Process Automation',
      owner: 'COO',
      status: 'at-risk',
      progress: 45,
      dueDate: new Date('2025-05-31'),
    },
    {
      id: '4',
      name: 'Customer Experience Program',
      owner: 'VP Customer Success',
      status: 'on-track',
      progress: 80,
      dueDate: new Date('2025-04-30'),
    },
  ];

  // Risk items
  const risks = [
    {
      id: '1',
      title: 'Carrier Capacity Constraints',
      severity: 'high',
      impact: 'Revenue',
      mitigation: 'Diversify carrier partnerships',
    },
    {
      id: '2',
      title: 'Regulatory Changes',
      severity: 'medium',
      impact: 'Compliance',
      mitigation: 'Monitor legislative updates',
    },
    {
      id: '3',
      title: 'Technology Debt',
      severity: 'medium',
      impact: 'Operations',
      mitigation: 'Planned tech modernization',
    },
  ];

  const formatValue = (value: number, unit: Metric['unit']) => {
    switch (unit) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value);
      case 'percentage':
        return `${value}%`;
      default:
        return value.toLocaleString();
    }
  };

  const handleExport = () => {
    // In production, this would generate a PDF or Excel export
    alert('Exporting executive report...');
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Executive Dashboard</h2>
            <p className="text-muted-foreground">
              North-star metrics, targets, and strategic initiatives
            </p>
          </div>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>

        {/* North-Star Metrics Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {northStarMetrics.map((metric) => {
            const progress = Math.min((metric.actual / metric.target) * 100, 100);
            const isOnTrack = metric.actual >= metric.target * 0.9; // Within 90% of target

            return (
              <Card key={metric.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {metric.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold">
                        {formatValue(metric.actual, metric.unit)}
                      </span>
                      <div className="flex items-center space-x-1">
                        {metric.trend === 'up' ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : metric.trend === 'down' ? (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        ) : null}
                        <span
                          className={`text-xs font-medium ${
                            metric.trend === 'up'
                              ? 'text-green-600'
                              : metric.trend === 'down'
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {metric.trendValue > 0 ? '+' : ''}
                          {metric.trendValue}%
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Target: {formatValue(metric.target, metric.unit)}
                        </span>
                        <Badge
                          variant={isOnTrack ? 'default' : 'secondary'}
                          className="h-5"
                        >
                          {Math.round(progress)}%
                        </Badge>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="metrics">Detailed Metrics</TabsTrigger>
            <TabsTrigger value="initiatives">Strategic Initiatives</TabsTrigger>
            <TabsTrigger value="risks">Risks & Mitigation</TabsTrigger>
            <TabsTrigger value="trends">Trends & Forecasts</TabsTrigger>
          </TabsList>

          <TabsContent value="metrics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Revenue Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Performance</CardTitle>
                  <CardDescription>Written premium breakdown</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Written Premium</span>
                    <span className="text-lg font-bold">
                      {formatValue(totalPremium, 'currency')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Target Annual</span>
                    <span className="text-lg font-bold">
                      {formatValue(5000000, 'currency')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">YTD Achievement</span>
                    <Badge variant="default">
                      {Math.round((totalPremium / 5000000) * 100)}%
                    </Badge>
                  </div>
                  <Progress
                    value={Math.min((totalPremium / 5000000) * 100, 100)}
                    className="h-2"
                  />
                </CardContent>
              </Card>

              {/* Policy Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Policy Portfolio</CardTitle>
                  <CardDescription>Active policies and growth</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Active Policies</span>
                    <span className="text-lg font-bold">{activePolicies}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Target</span>
                    <span className="text-lg font-bold">1,000</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Achievement</span>
                    <Badge variant="default">
                      {Math.round((activePolicies / 1000) * 100)}%
                    </Badge>
                  </div>
                  <Progress
                    value={Math.min((activePolicies / 1000) * 100, 100)}
                    className="h-2"
                  />
                </CardContent>
              </Card>

              {/* Retention Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Retention</CardTitle>
                  <CardDescription>Renewal and retention rates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Current Rate</span>
                    <span className="text-lg font-bold">{renewalRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Target Rate</span>
                    <span className="text-lg font-bold">90%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status</span>
                    <Badge variant={renewalRate >= 90 ? 'default' : 'secondary'}>
                      {renewalRate >= 90 ? 'On Target' : 'Below Target'}
                    </Badge>
                  </div>
                  <Progress value={Math.min((renewalRate / 90) * 100, 100)} className="h-2" />
                </CardContent>
              </Card>

              {/* Operational Efficiency */}
              <Card>
                <CardHeader>
                  <CardTitle>Operational Efficiency</CardTitle>
                  <CardDescription>Task completion and productivity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Task Completion</span>
                    <span className="text-lg font-bold">{taskCompletionRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Target</span>
                    <span className="text-lg font-bold">95%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status</span>
                    <Badge variant={taskCompletionRate >= 90 ? 'default' : 'secondary'}>
                      {taskCompletionRate >= 90 ? 'On Target' : 'Below Target'}
                    </Badge>
                  </div>
                  <Progress
                    value={Math.min((taskCompletionRate / 95) * 100, 100)}
                    className="h-2"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="initiatives" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Strategic Initiatives</CardTitle>
                <CardDescription>
                  Key initiatives and their progress
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {initiatives.map((initiative) => (
                    <div key={initiative.id} className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold">{initiative.name}</h4>
                            <Badge
                              variant={
                                initiative.status === 'on-track'
                                  ? 'default'
                                  : initiative.status === 'at-risk'
                                  ? 'outline'
                                  : 'destructive'
                              }
                              className={
                                initiative.status === 'on-track'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : initiative.status === 'at-risk'
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  : ''
                              }
                            >
                              {initiative.status === 'on-track'
                                ? 'On Track'
                                : initiative.status === 'at-risk'
                                ? 'At Risk'
                                : 'Behind'}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-4 mt-1 text-sm text-muted-foreground">
                            <span>Owner: {initiative.owner}</span>
                            <span className="flex items-center">
                              <Calendar className="mr-1 h-3 w-3" />
                              Due: {format(initiative.dueDate, 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold">{initiative.progress}%</span>
                        </div>
                      </div>
                      <Progress value={initiative.progress} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Risk Register</CardTitle>
                <CardDescription>
                  Identified risks and mitigation strategies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {risks.map((risk) => (
                    <div
                      key={risk.id}
                      className="flex items-start space-x-4 p-4 rounded-lg border"
                    >
                      <AlertTriangle
                        className={`h-5 w-5 mt-0.5 ${
                          risk.severity === 'high'
                            ? 'text-destructive'
                            : 'text-yellow-600'
                        }`}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold">{risk.title}</h4>
                          <Badge
                            variant={risk.severity === 'high' ? 'destructive' : 'outline'}
                            className={
                              risk.severity === 'medium'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                : ''
                            }
                          >
                            {risk.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Impact: {risk.impact}
                        </p>
                        <p className="text-sm">
                          <span className="font-medium">Mitigation:</span> {risk.mitigation}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Growth Trends</CardTitle>
                  <CardDescription>Quarter-over-quarter performance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Q1 Growth</span>
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-bold text-green-600">+15.2%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Q2 Forecast</span>
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-bold text-green-600">+18.5%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Annual Projection</span>
                    <span className="text-sm font-bold">
                      {formatValue(5800000, 'currency')}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Market Position</CardTitle>
                  <CardDescription>Competitive standing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Market Share</span>
                    <span className="text-lg font-bold">3.2%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Target Share</span>
                    <span className="text-lg font-bold">5.0%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Growth Rate</span>
                    <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">
                      Above Market
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}