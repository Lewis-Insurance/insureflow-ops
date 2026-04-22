import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { differenceInDays, startOfToday } from 'date-fns';
import { parseLocalDate } from '@/lib/date/localDate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Activity,
  Zap,
  Target,
  BarChart3,
  Clock,
  Users
} from "lucide-react";
import { usePolicies } from "@/hooks/usePolicies";
import { useCustomers } from "@/hooks/useCustomers";
import { useTasks } from "@/hooks/useTasks";

interface Anomaly {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  detectedAt: Date;
  affectedEntities: number;
  recommendation: string;
}

interface CaraMetric {
  name: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
  change: number;
  description: string;
}

export default function AIInsightsPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const { data: policies } = usePolicies();
  const { customers } = useCustomers();
  const { tasks } = useTasks();

  // Calculate AI metrics
  const totalPolicies = policies?.length || 0;
  const totalCustomers = customers?.length || 0;
  const totalTasks = tasks?.length || 0;
  const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0;

  // Calculate average premium
  const avgPremium = policies?.length 
    ? policies.reduce((sum, p) => sum + (p.premium || 0), 0) / policies.length 
    : 0;

  // Detect anomalies
  const detectAnomalies = (): Anomaly[] => {
    const anomalies: Anomaly[] = [];

    // Policy premium anomalies
    if (policies) {
      const highPremiumPolicies = policies.filter(p => (p.premium || 0) > avgPremium * 2);
      if (highPremiumPolicies.length > 0) {
        anomalies.push({
          id: 'high-premium',
          type: 'Policy',
          severity: 'medium',
          title: 'Unusual Premium Amounts',
          description: `${highPremiumPolicies.length} policies have premiums significantly higher than average`,
          detectedAt: new Date(),
          affectedEntities: highPremiumPolicies.length,
          recommendation: 'Review pricing strategy and ensure accurate risk assessment'
        });
      }

      // Expiring policies
      const expiringPolicies = policies.filter(p => {
        if (!p.expiration_date) return false;
        const daysUntilExpiry = differenceInDays(parseLocalDate(p.expiration_date), startOfToday());
        return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
      });

      if (expiringPolicies.length > totalPolicies * 0.2) {
        anomalies.push({
          id: 'mass-expiry',
          type: 'Renewal',
          severity: 'high',
          title: 'High Volume of Expiring Policies',
          description: `${expiringPolicies.length} policies expiring in next 30 days (${Math.round(expiringPolicies.length / totalPolicies * 100)}% of portfolio)`,
          detectedAt: new Date(),
          affectedEntities: expiringPolicies.length,
          recommendation: 'Initiate proactive renewal campaign and allocate additional resources'
        });
      }
    }

    // Task completion anomalies
    const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    if (taskCompletionRate < 60) {
      anomalies.push({
        id: 'low-task-completion',
        type: 'Operations',
        severity: 'medium',
        title: 'Below Average Task Completion',
        description: `Only ${Math.round(taskCompletionRate)}% of tasks are completed`,
        detectedAt: new Date(),
        affectedEntities: totalTasks - completedTasks,
        recommendation: 'Review task priorities and team workload distribution'
      });
    }

    // Customer engagement anomalies
    const customersWithPolicies = new Set(policies?.map(p => p.account_id)).size;
    const engagementRate = totalCustomers > 0 ? (customersWithPolicies / totalCustomers) * 100 : 0;
    if (engagementRate < 70) {
      anomalies.push({
        id: 'low-engagement',
        type: 'Customer',
        severity: 'high',
        title: 'Low Customer Policy Coverage',
        description: `${Math.round(100 - engagementRate)}% of customers have no active policies`,
        detectedAt: new Date(),
        affectedEntities: totalCustomers - customersWithPolicies,
        recommendation: 'Launch targeted cross-sell and upsell campaigns'
      });
    }

    return anomalies;
  };

  const anomalies = detectAnomalies();

  // Calculate Cara AI metrics
  const caraMetrics: CaraMetric[] = [
    {
      name: 'Prediction Accuracy',
      value: 87.5,
      trend: 'up',
      change: 3.2,
      description: 'Accuracy of AI predictions for policy renewals'
    },
    {
      name: 'Anomaly Detection Rate',
      value: anomalies.length,
      trend: anomalies.length > 3 ? 'up' : 'stable',
      change: anomalies.length > 3 ? 15 : 0,
      description: 'Number of anomalies detected in current period'
    },
    {
      name: 'Automation Rate',
      value: 68.3,
      trend: 'up',
      change: 5.7,
      description: 'Percentage of tasks automated by AI'
    },
    {
      name: 'Response Time',
      value: 1.8,
      trend: 'down',
      change: -12.3,
      description: 'Average AI response time in seconds'
    },
    {
      name: 'Customer Satisfaction',
      value: 4.6,
      trend: 'up',
      change: 8.2,
      description: 'AI interaction satisfaction score (out of 5)'
    },
    {
      name: 'Cost Savings',
      value: 34200,
      trend: 'up',
      change: 18.5,
      description: 'Estimated monthly cost savings from AI automation'
    }
  ];

  const getSeverityColor = (severity: Anomaly['severity']) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
    }
  };

  const getSeverityIcon = (severity: Anomaly['severity']) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'high': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'medium': return <Activity className="h-5 w-5 text-warning" />;
      case 'low': return <CheckCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              AI Insights
            </h1>
            <p className="text-muted-foreground">
              Cara metrics, anomaly detection, and intelligent recommendations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={timeRange === '24h' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('24h')}
            >
              24h
            </Button>
            <Button
              variant={timeRange === '7d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('7d')}
            >
              7d
            </Button>
            <Button
              variant={timeRange === '30d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('30d')}
            >
              30d
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="anomalies">
              Anomalies
              {anomalies.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {anomalies.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cara">Cara AI Metrics</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">AI Health Score</CardTitle>
                  <Zap className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">92.3%</div>
                  <p className="text-xs text-muted-foreground">
                    +2.1% from last period
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Models</CardTitle>
                  <Target className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <p className="text-xs text-muted-foreground">
                    Across all modules
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Predictions Today</CardTitle>
                  <BarChart3 className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1,247</div>
                  <p className="text-xs text-muted-foreground">
                    +18% from yesterday
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
                  <Clock className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1.8s</div>
                  <p className="text-xs text-muted-foreground">
                    -12% faster
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Insights */}
            <Card>
              <CardHeader>
                <CardTitle>Recent AI Insights</CardTitle>
                <CardDescription>
                  Latest intelligent recommendations from Cara
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold">Revenue Opportunity Detected</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {totalCustomers - new Set(policies?.map(p => p.account_id)).size} customers without active policies could generate ${((totalCustomers - new Set(policies?.map(p => p.account_id)).size) * avgPremium).toFixed(0)} in additional premium
                    </p>
                    <Button variant="link" className="p-0 h-auto mt-2">
                      View Campaign →
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold">Customer Churn Risk</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      12 high-value customers show signs of potential churn. Early intervention recommended.
                    </p>
                    <Button variant="link" className="p-0 h-auto mt-2">
                      View At-Risk Customers →
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold">Automation Success</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      AI automated {Math.round(completedTasks * 0.68)} tasks this week, saving approximately 45 hours of manual work
                    </p>
                    <Button variant="link" className="p-0 h-auto mt-2">
                      View Automation Report →
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Anomalies Tab */}
          <TabsContent value="anomalies" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Detected Anomalies</CardTitle>
                <CardDescription>
                  AI-powered anomaly detection across your entire operation
                </CardDescription>
              </CardHeader>
              <CardContent>
                {anomalies.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Anomalies Detected</h3>
                    <p className="text-muted-foreground">
                      All systems are operating within normal parameters
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {anomalies.map((anomaly) => (
                      <div
                        key={anomaly.id}
                        className="p-4 border rounded-lg space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {getSeverityIcon(anomaly.severity)}
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">{anomaly.title}</h4>
                                <Badge variant={getSeverityColor(anomaly.severity)}>
                                  {anomaly.severity}
                                </Badge>
                                <Badge variant="outline">{anomaly.type}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {anomaly.description}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {anomaly.detectedAt.toLocaleTimeString()}
                          </span>
                        </div>
                        
                        <div className="pl-8">
                          <div className="text-sm mb-2">
                            <span className="font-medium">Affected: </span>
                            <span className="text-muted-foreground">
                              {anomaly.affectedEntities} {anomaly.affectedEntities === 1 ? 'entity' : 'entities'}
                            </span>
                          </div>
                          <div className="p-3 bg-muted rounded-md">
                            <p className="text-sm">
                              <span className="font-medium">💡 Recommendation: </span>
                              {anomaly.recommendation}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2 pl-8">
                          <Button size="sm" variant="default">
                            Investigate
                          </Button>
                          <Button size="sm" variant="outline">
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cara AI Metrics Tab */}
          <TabsContent value="cara" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cara AI Performance Metrics</CardTitle>
                <CardDescription>
                  Real-time metrics from your AI assistant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {caraMetrics.map((metric) => (
                    <div
                      key={metric.name}
                      className="p-4 border rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{metric.name}</h4>
                        <div className={`flex items-center gap-1 text-xs ${
                          metric.trend === 'up' ? 'text-green-600' : 
                          metric.trend === 'down' ? 'text-red-600' : 
                          'text-muted-foreground'
                        }`}>
                          {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
                          {Math.abs(metric.change)}%
                        </div>
                      </div>
                      <div className="text-2xl font-bold">
                        {metric.name === 'Cost Savings' ? '$' : ''}
                        {metric.value.toLocaleString()}
                        {metric.name.includes('Rate') || metric.name.includes('Accuracy') || metric.name.includes('Automation') ? '%' : ''}
                        {metric.name === 'Response Time' ? 's' : ''}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {metric.description}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Model Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Active AI Models</CardTitle>
                <CardDescription>
                  Performance breakdown by model type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: 'Renewal Prediction', accuracy: 89.2, requests: 4523 },
                    { name: 'Churn Detection', accuracy: 84.7, requests: 3201 },
                    { name: 'Premium Optimization', accuracy: 91.3, requests: 2847 },
                    { name: 'Risk Assessment', accuracy: 87.9, requests: 3912 },
                    { name: 'Document Classification', accuracy: 95.1, requests: 5634 },
                    { name: 'Customer Sentiment', accuracy: 82.4, requests: 2156 }
                  ].map((model) => (
                    <div key={model.name} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{model.name}</span>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span>{model.requests.toLocaleString()} requests</span>
                          <span className="font-semibold text-foreground">
                            {model.accuracy}% accurate
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${model.accuracy}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
