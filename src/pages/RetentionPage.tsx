import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePolicies } from '@/hooks/usePolicies';
import { useRenewalsStats } from '@/hooks/useRenewals';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Shield,
  Users,
  DollarSign,
  Clock,
  Target,
  Bell,
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface ChurnMetrics {
  rate: number;
  trend: number;
  totalChurned: number;
  atRisk: number;
  recovered: number;
}

interface RiskCustomer {
  id: string;
  name: string;
  riskScore: number;
  riskLevel: RiskLevel;
  reason: string[];
  value: number;
  daysSinceContact: number;
  renewalDate: Date;
}

interface CohortData {
  cohort: string;
  month0: number;
  month1: number;
  month3: number;
  month6: number;
  month12: number;
}

export default function RetentionPage() {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '12m'>('6m');
  const [activeTab, setActiveTab] = useState<'overview' | 'risk' | 'cohorts' | 'campaigns'>('overview');
  
  const { data: policies } = usePolicies({});
  const { data: renewalsStats } = useRenewalsStats();

  // Calculate churn metrics
  const totalPolicies = policies?.length || 0;
  const churnMetrics: ChurnMetrics = {
    rate: 8.2,
    trend: -1.3,
    totalChurned: Math.floor(totalPolicies * 0.082),
    atRisk: Math.floor(totalPolicies * 0.15),
    recovered: Math.floor(totalPolicies * 0.03),
  };

  // Mock churn trend data
  const churnTrend = [
    { month: 'Jul', rate: 10.2, count: 45 },
    { month: 'Aug', rate: 9.8, count: 42 },
    { month: 'Sep', rate: 9.1, count: 38 },
    { month: 'Oct', rate: 8.7, count: 36 },
    { month: 'Nov', rate: 8.5, count: 35 },
    { month: 'Dec', rate: 8.2, count: 33 },
  ];

  // Mock cohort retention data
  const cohortData: CohortData[] = [
    { cohort: 'Jan 2024', month0: 100, month1: 95, month3: 88, month6: 82, month12: 75 },
    { cohort: 'Feb 2024', month0: 100, month1: 96, month3: 90, month6: 84, month12: 78 },
    { cohort: 'Mar 2024', month0: 100, month1: 94, month3: 87, month6: 81, month12: 73 },
    { cohort: 'Apr 2024', month0: 100, month1: 97, month3: 91, month6: 85, month12: 0 },
    { cohort: 'May 2024', month0: 100, month1: 96, month3: 89, month6: 83, month12: 0 },
    { cohort: 'Jun 2024', month0: 100, month1: 95, month3: 88, month6: 0, month12: 0 },
  ];

  // Mock at-risk customers
  const atRiskCustomers: RiskCustomer[] = [
    {
      id: '1',
      name: 'Tech Solutions Inc',
      riskScore: 92,
      riskLevel: 'critical',
      reason: ['No engagement', 'Payment delays', 'Support escalations'],
      value: 12500,
      daysSinceContact: 67,
      renewalDate: new Date('2025-02-15'),
    },
    {
      id: '2',
      name: 'Metro Logistics',
      riskScore: 78,
      riskLevel: 'high',
      reason: ['Low usage', 'Competitor inquiry'],
      value: 8900,
      daysSinceContact: 45,
      renewalDate: new Date('2025-03-01'),
    },
    {
      id: '3',
      name: 'Coastal Retail LLC',
      riskScore: 65,
      riskLevel: 'high',
      reason: ['Poor NPS score', 'Multiple claims'],
      value: 15600,
      daysSinceContact: 32,
      renewalDate: new Date('2025-02-28'),
    },
    {
      id: '4',
      name: 'Downtown Services',
      riskScore: 58,
      riskLevel: 'medium',
      reason: ['Decreased activity', 'Budget concerns'],
      value: 6700,
      daysSinceContact: 28,
      renewalDate: new Date('2025-04-10'),
    },
    {
      id: '5',
      name: 'Global Enterprises',
      riskScore: 52,
      riskLevel: 'medium',
      reason: ['Contract ending soon'],
      value: 22400,
      daysSinceContact: 18,
      renewalDate: new Date('2025-01-31'),
    },
  ];

  // Mock churn reasons distribution
  const churnReasons = [
    { reason: 'Price increase', count: 28, percentage: 35 },
    { reason: 'Competitor offer', count: 18, percentage: 22 },
    { reason: 'Service quality', count: 15, percentage: 19 },
    { reason: 'Business closure', count: 10, percentage: 13 },
    { reason: 'Other', count: 9, percentage: 11 },
  ];

  // Mock retention campaigns
  const campaigns = [
    {
      id: '1',
      name: 'Win-Back Campaign Q4',
      status: 'active',
      target: 150,
      contacted: 132,
      recovered: 18,
      successRate: 13.6,
    },
    {
      id: '2',
      name: 'At-Risk Outreach',
      status: 'active',
      target: 85,
      contacted: 85,
      recovered: 12,
      successRate: 14.1,
    },
    {
      id: '3',
      name: 'Loyalty Rewards',
      status: 'completed',
      target: 200,
      contacted: 200,
      recovered: 32,
      successRate: 16.0,
    },
  ];

  const getRiskLevelColor = (level: RiskLevel) => {
    const colors: Record<RiskLevel, string> = {
      low: 'bg-green-50 text-green-700 border-green-200',
      medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      high: 'bg-orange-50 text-orange-700 border-orange-200',
      critical: 'bg-red-50 text-red-700 border-red-200',
    };
    return colors[level];
  };

  const getRiskLevelVariant = (level: RiskLevel): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (level === 'critical') return 'destructive';
    if (level === 'high') return 'outline';
    return 'secondary';
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Retention Analytics</h2>
            <p className="text-muted-foreground">
              Churn analysis, risk scoring, and retention strategies
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3m">Last 3 months</SelectItem>
                <SelectItem value="6m">Last 6 months</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Button>
              <Bell className="h-4 w-4 mr-2" />
              Set Alerts
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Churn Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{churnMetrics.rate}%</span>
                <div className="flex items-center space-x-1">
                  <TrendingDown className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">{churnMetrics.trend}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {churnMetrics.totalChurned} customers churned
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">At Risk</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{churnMetrics.atRisk}</span>
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                15% of active customers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recovered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{churnMetrics.recovered}</span>
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Win-back success rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Retention Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">91.8%</span>
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <Progress value={91.8} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Risk Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">$66k</span>
                <DollarSign className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total at-risk revenue
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="overview">Churn Overview</TabsTrigger>
            <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
            <TabsTrigger value="cohorts">Cohort Retention</TabsTrigger>
            <TabsTrigger value="campaigns">Retention Campaigns</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Churn Rate Trend</CardTitle>
                  <CardDescription>Monthly churn rate over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={churnTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="rate"
                          stroke="#ef4444"
                          fill="#ef4444"
                          fillOpacity={0.2}
                          name="Churn Rate (%)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Churned Customers</CardTitle>
                  <CardDescription>Number of customers lost per month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={churnTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill="#ef4444" name="Churned" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Churn Reasons</CardTitle>
                <CardDescription>Top reasons customers leave</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {churnReasons.map((item) => (
                    <div key={item.reason} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.reason}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-muted-foreground">{item.count} customers</span>
                          <Badge variant="outline">{item.percentage}%</Badge>
                        </div>
                      </div>
                      <Progress value={item.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>High-Risk Customers</CardTitle>
                <CardDescription>
                  Customers with elevated churn risk requiring immediate attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {atRiskCustomers.map((customer) => (
                    <div key={customer.id} className="flex items-start justify-between p-4 border rounded-lg">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-lg">{customer.name}</div>
                          <Badge
                            variant={getRiskLevelVariant(customer.riskLevel)}
                            className={getRiskLevelColor(customer.riskLevel)}
                          >
                            {customer.riskLevel.toUpperCase()} RISK
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Risk Score:</span>
                            <div className="flex items-center space-x-2 mt-1">
                              <Progress value={customer.riskScore} className="h-2 flex-1" />
                              <span className="font-bold">{customer.riskScore}</span>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Annual Value:</span>
                            <div className="font-bold mt-1">
                              ${customer.value.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Last Contact:</span>
                            <div className="font-bold mt-1 flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {customer.daysSinceContact} days ago
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-sm font-medium">Risk Factors:</span>
                          <div className="flex flex-wrap gap-2">
                            {customer.reason.map((reason, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Renewal date: {customer.renewalDate.toLocaleDateString()}
                        </div>
                      </div>

                      <div className="ml-4 space-y-2">
                        <Button size="sm" className="w-full">
                          <Target className="h-3 w-3 mr-1" />
                          Engage
                        </Button>
                        <Button size="sm" variant="outline" className="w-full">
                          Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Risk Distribution</CardTitle>
                  <CardDescription>Customer risk level breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { level: 'Critical', count: 12, percentage: 8, color: 'bg-red-500' },
                      { level: 'High', count: 28, percentage: 19, color: 'bg-orange-500' },
                      { level: 'Medium', count: 45, percentage: 30, color: 'bg-yellow-500' },
                      { level: 'Low', count: 65, percentage: 43, color: 'bg-green-500' },
                    ].map((item) => (
                      <div key={item.level} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${item.color}`} />
                            <span className="text-sm font-medium">{item.level} Risk</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-muted-foreground">{item.count}</span>
                            <Badge variant="outline">{item.percentage}%</Badge>
                          </div>
                        </div>
                        <Progress value={item.percentage} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Early Warning Indicators</CardTitle>
                  <CardDescription>Signals that predict churn risk</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { indicator: 'No login (30+ days)', impact: 'High', count: 23 },
                    { indicator: 'Payment delay', impact: 'High', count: 18 },
                    { indicator: 'Support escalation', impact: 'Medium', count: 15 },
                    { indicator: 'Decreased usage', impact: 'Medium', count: 31 },
                    { indicator: 'Competitor inquiry', impact: 'High', count: 8 },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{item.indicator}</div>
                        <Badge
                          variant={item.impact === 'High' ? 'destructive' : 'secondary'}
                          className={item.impact === 'High' ? '' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}
                        >
                          {item.impact} Impact
                        </Badge>
                      </div>
                      <div className="text-2xl font-bold">{item.count}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cohorts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cohort Retention Analysis</CardTitle>
                <CardDescription>
                  Customer retention rates by cohort over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Cohort</th>
                        <th className="text-center p-2 font-medium">Month 0</th>
                        <th className="text-center p-2 font-medium">Month 1</th>
                        <th className="text-center p-2 font-medium">Month 3</th>
                        <th className="text-center p-2 font-medium">Month 6</th>
                        <th className="text-center p-2 font-medium">Month 12</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortData.map((cohort) => (
                        <tr key={cohort.cohort} className="border-b">
                          <td className="p-2 font-medium">{cohort.cohort}</td>
                          <td className="text-center p-2">
                            <Badge variant="outline">{cohort.month0}%</Badge>
                          </td>
                          <td className="text-center p-2">
                            <Badge
                              variant="outline"
                              className={
                                cohort.month1 >= 95
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : cohort.month1 >= 90
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }
                            >
                              {cohort.month1}%
                            </Badge>
                          </td>
                          <td className="text-center p-2">
                            <Badge
                              variant="outline"
                              className={
                                cohort.month3 >= 85
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : cohort.month3 >= 80
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }
                            >
                              {cohort.month3}%
                            </Badge>
                          </td>
                          <td className="text-center p-2">
                            {cohort.month6 > 0 ? (
                              <Badge
                                variant="outline"
                                className={
                                  cohort.month6 >= 80
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : cohort.month6 >= 75
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }
                              >
                                {cohort.month6}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="text-center p-2">
                            {cohort.month12 > 0 ? (
                              <Badge
                                variant="outline"
                                className={
                                  cohort.month12 >= 75
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : cohort.month12 >= 70
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }
                              >
                                {cohort.month12}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
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
                <CardTitle>Retention Curve</CardTitle>
                <CardDescription>Average retention over customer lifetime</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={[
                        { month: '0', rate: 100 },
                        { month: '1', rate: 95 },
                        { month: '3', rate: 89 },
                        { month: '6', rate: 83 },
                        { month: '9', rate: 79 },
                        { month: '12', rate: 75 },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" label={{ value: 'Months', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Retention %', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="#10b981"
                        strokeWidth={2}
                        name="Retention Rate"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Retention Campaigns</CardTitle>
                <CardDescription>Ongoing initiatives to reduce churn</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-lg">{campaign.name}</div>
                        <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                          {campaign.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Target</div>
                          <div className="text-xl font-bold">{campaign.target}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Contacted</div>
                          <div className="text-xl font-bold">{campaign.contacted}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Recovered</div>
                          <div className="text-xl font-bold text-green-600">{campaign.recovered}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Success Rate</div>
                          <div className="text-xl font-bold">{campaign.successRate}%</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Progress</span>
                          <span className="font-medium">
                            {campaign.contacted} / {campaign.target}
                          </span>
                        </div>
                        <Progress value={(campaign.contacted / campaign.target) * 100} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Performance</CardTitle>
                  <CardDescription>Recovery rate by campaign type</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={campaigns}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="successRate" fill="#10b981" name="Success Rate (%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recommended Actions</CardTitle>
                  <CardDescription>AI-powered retention strategies</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      action: 'Personal outreach',
                      target: 'Critical risk customers',
                      impact: 'High',
                      effort: 'Medium',
                    },
                    {
                      action: 'Loyalty discount',
                      target: 'High-value at-risk',
                      impact: 'High',
                      effort: 'Low',
                    },
                    {
                      action: 'Feature training',
                      target: 'Low engagement',
                      impact: 'Medium',
                      effort: 'Medium',
                    },
                    {
                      action: 'Check-in calls',
                      target: 'No recent contact',
                      impact: 'Medium',
                      effort: 'High',
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <div className="font-medium">{item.action}</div>
                        <div className="text-sm text-muted-foreground">
                          Target: {item.target}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{item.impact} Impact</Badge>
                          <Badge variant="secondary">{item.effort} Effort</Badge>
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Launch
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
