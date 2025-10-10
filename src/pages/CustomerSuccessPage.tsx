import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { usePolicies } from '@/hooks/usePolicies';
import { useRenewalsStats } from '@/hooks/useRenewals';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Heart,
  MessageCircle,
  ArrowRight,
  Target,
  ThumbsUp,
  ThumbsDown,
  Minus,
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type JourneyStage = 'lead' | 'prospect' | 'customer' | 'advocate' | 'at-risk' | 'churned';

interface CustomerSegment {
  stage: JourneyStage;
  count: number;
  percentage: number;
  avgDuration: string;
  conversionRate: number;
}

interface NPSData {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  totalResponses: number;
}

interface TouchPoint {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'support' | 'renewal';
  customer: string;
  timestamp: Date;
  sentiment: 'positive' | 'neutral' | 'negative';
  notes: string;
}

const COLORS = {
  promoter: '#22c55e',
  passive: '#eab308',
  detractor: '#ef4444',
  lead: '#94a3b8',
  prospect: '#3b82f6',
  customer: '#10b981',
  advocate: '#8b5cf6',
  atRisk: '#f59e0b',
  churned: '#ef4444',
};

export default function CustomerSuccessPage() {
  const [activeTab, setActiveTab] = useState<'journey' | 'nps' | 'health' | 'touchpoints'>('journey');
  
  const { data: policies } = usePolicies({});
  const { data: renewalsStats } = useRenewalsStats();

  // Mock NPS data (in production, this would come from surveys)
  const npsData: NPSData = {
    score: 42,
    promoters: 156,
    passives: 89,
    detractors: 32,
    totalResponses: 277,
  };

  // Calculate customer segments based on policies
  const totalCustomers = policies?.length || 0;
  const segments: CustomerSegment[] = [
    {
      stage: 'lead',
      count: Math.floor(totalCustomers * 0.15),
      percentage: 15,
      avgDuration: '12 days',
      conversionRate: 45,
    },
    {
      stage: 'prospect',
      count: Math.floor(totalCustomers * 0.20),
      percentage: 20,
      avgDuration: '21 days',
      conversionRate: 62,
    },
    {
      stage: 'customer',
      count: Math.floor(totalCustomers * 0.50),
      percentage: 50,
      avgDuration: '18 months',
      conversionRate: 85,
    },
    {
      stage: 'advocate',
      count: Math.floor(totalCustomers * 0.08),
      percentage: 8,
      avgDuration: '36 months',
      conversionRate: 95,
    },
    {
      stage: 'at-risk',
      count: Math.floor(totalCustomers * 0.05),
      percentage: 5,
      avgDuration: '3 months',
      conversionRate: 25,
    },
    {
      stage: 'churned',
      count: Math.floor(totalCustomers * 0.02),
      percentage: 2,
      avgDuration: 'N/A',
      conversionRate: 0,
    },
  ];

  // Mock NPS trend data
  const npsTrend = [
    { month: 'Jan', score: 35, responses: 45 },
    { month: 'Feb', score: 38, responses: 52 },
    { month: 'Mar', score: 41, responses: 48 },
    { month: 'Apr', score: 39, responses: 61 },
    { month: 'May', score: 42, responses: 57 },
    { month: 'Jun', score: 42, responses: 65 },
  ];

  // Mock touchpoints
  const recentTouchpoints: TouchPoint[] = [
    {
      id: '1',
      type: 'renewal',
      customer: 'Acme Corp',
      timestamp: new Date('2025-01-08'),
      sentiment: 'positive',
      notes: 'Renewed policy with upgraded coverage',
    },
    {
      id: '2',
      type: 'call',
      customer: 'Tech Solutions Inc',
      timestamp: new Date('2025-01-07'),
      sentiment: 'neutral',
      notes: 'Discussed claim process',
    },
    {
      id: '3',
      type: 'support',
      customer: 'Global Logistics',
      timestamp: new Date('2025-01-06'),
      sentiment: 'negative',
      notes: 'Complaint about response time',
    },
    {
      id: '4',
      type: 'meeting',
      customer: 'First Financial',
      timestamp: new Date('2025-01-05'),
      sentiment: 'positive',
      notes: 'Quarterly business review - very satisfied',
    },
  ];

  const npsBreakdown = [
    { name: 'Promoters', value: npsData.promoters, percentage: Math.round((npsData.promoters / npsData.totalResponses) * 100) },
    { name: 'Passives', value: npsData.passives, percentage: Math.round((npsData.passives / npsData.totalResponses) * 100) },
    { name: 'Detractors', value: npsData.detractors, percentage: Math.round((npsData.detractors / npsData.totalResponses) * 100) },
  ];

  const getStageLabel = (stage: JourneyStage): string => {
    const labels: Record<JourneyStage, string> = {
      lead: 'Lead',
      prospect: 'Prospect',
      customer: 'Customer',
      advocate: 'Advocate',
      'at-risk': 'At Risk',
      churned: 'Churned',
    };
    return labels[stage];
  };

  const getStageColor = (stage: JourneyStage): string => {
    const colors: Record<JourneyStage, string> = {
      lead: COLORS.lead,
      prospect: COLORS.prospect,
      customer: COLORS.customer,
      advocate: COLORS.advocate,
      'at-risk': COLORS.atRisk,
      churned: COLORS.churned,
    };
    return colors[stage];
  };

  const getSentimentIcon = (sentiment: 'positive' | 'neutral' | 'negative') => {
    switch (sentiment) {
      case 'positive':
        return <ThumbsUp className="h-4 w-4 text-green-600" />;
      case 'neutral':
        return <Minus className="h-4 w-4 text-yellow-600" />;
      case 'negative':
        return <ThumbsDown className="h-4 w-4 text-destructive" />;
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Customer Success</h2>
            <p className="text-muted-foreground">
              Journey mapping, NPS tracking, and customer health monitoring
            </p>
          </div>
          <Button>
            <Target className="h-4 w-4 mr-2" />
            Run Survey
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">NPS Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{npsData.score}</span>
                <div className="flex items-center space-x-1">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">+7</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on {npsData.totalResponses} responses
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{segments[2].count}</span>
                <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">
                  {segments[2].percentage}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg tenure: {segments[2].avgDuration}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Customer Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">85</span>
                <div className="flex items-center space-x-1">
                  <Heart className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Healthy</span>
                </div>
              </div>
              <Progress value={85} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">At Risk</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{segments[4].count}</span>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  {segments[4].percentage}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Requires immediate attention
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="journey">Journey Mapping</TabsTrigger>
            <TabsTrigger value="nps">NPS Analysis</TabsTrigger>
            <TabsTrigger value="health">Health Scores</TabsTrigger>
            <TabsTrigger value="touchpoints">Touch Points</TabsTrigger>
          </TabsList>

          <TabsContent value="journey" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Customer Journey Stages</CardTitle>
                <CardDescription>Distribution across the customer lifecycle</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Journey Flow Visualization */}
                  <div className="flex items-center justify-between py-4">
                    {segments.slice(0, 4).map((segment, index) => (
                      <div key={segment.stage} className="flex items-center">
                        <div className="flex flex-col items-center space-y-2">
                          <div
                            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg"
                            style={{ backgroundColor: getStageColor(segment.stage) }}
                          >
                            {segment.count}
                          </div>
                          <span className="text-sm font-medium">{getStageLabel(segment.stage)}</span>
                          <span className="text-xs text-muted-foreground">{segment.percentage}%</span>
                        </div>
                        {index < 3 && (
                          <ArrowRight className="h-6 w-6 text-muted-foreground mx-4" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Detailed Breakdown */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {segments.map((segment) => (
                      <Card key={segment.stage}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{getStageLabel(segment.stage)}</CardTitle>
                            <Badge
                              variant="outline"
                              style={{
                                backgroundColor: `${getStageColor(segment.stage)}20`,
                                borderColor: getStageColor(segment.stage),
                                color: getStageColor(segment.stage),
                              }}
                            >
                              {segment.count}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Percentage</span>
                            <span className="font-medium">{segment.percentage}%</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Avg Duration</span>
                            <span className="font-medium">{segment.avgDuration}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Conversion</span>
                            <span className="font-medium">{segment.conversionRate}%</span>
                          </div>
                          <Progress value={segment.conversionRate} className="h-2" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nps" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>NPS Distribution</CardTitle>
                  <CardDescription>Breakdown of customer sentiment</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={npsBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percentage }) => `${name}: ${percentage}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          <Cell fill={COLORS.promoter} />
                          <Cell fill={COLORS.passive} />
                          <Cell fill={COLORS.detractor} />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {npsBreakdown.map((item) => (
                      <div key={item.name} className="text-center">
                        <div className="text-2xl font-bold">{item.value}</div>
                        <div className="text-sm text-muted-foreground">{item.name}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>NPS Trend</CardTitle>
                  <CardDescription>6-month NPS score evolution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={npsTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.2}
                          name="NPS Score"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Response Rate by Month</CardTitle>
                <CardDescription>Survey participation trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={npsTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="responses" fill="#10b981" name="Responses" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Health Score Factors</CardTitle>
                  <CardDescription>Key indicators affecting customer health</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Product Usage</span>
                      <span className="text-sm font-bold">92%</span>
                    </div>
                    <Progress value={92} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Payment History</span>
                      <span className="text-sm font-bold">88%</span>
                    </div>
                    <Progress value={88} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Support Satisfaction</span>
                      <span className="text-sm font-bold">85%</span>
                    </div>
                    <Progress value={85} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Renewal Likelihood</span>
                      <span className="text-sm font-bold">79%</span>
                    </div>
                    <Progress value={79} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Engagement Level</span>
                      <span className="text-sm font-bold">75%</span>
                    </div>
                    <Progress value={75} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>At-Risk Customers</CardTitle>
                  <CardDescription>Accounts requiring immediate attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { name: 'Tech Innovations LLC', score: 42, reason: 'Low engagement', days: 45 },
                      { name: 'Metro Services', score: 38, reason: 'Payment issues', days: 12 },
                      { name: 'Coastal Logistics', score: 35, reason: 'Support tickets', days: 8 },
                      { name: 'Downtown Retail', score: 31, reason: 'No usage', days: 60 },
                    ].map((customer) => (
                      <div key={customer.name} className="flex items-start justify-between p-3 border rounded-lg">
                        <div className="space-y-1">
                          <div className="font-medium">{customer.name}</div>
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Badge variant="destructive" className="h-5">
                              Score: {customer.score}
                            </Badge>
                            <span>• {customer.reason}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last activity: {customer.days} days ago
                          </div>
                        </div>
                        <Button size="sm" variant="outline">
                          Contact
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="touchpoints" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Touch Points</CardTitle>
                <CardDescription>Latest customer interactions and their sentiment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentTouchpoints.map((touchpoint) => (
                    <div key={touchpoint.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                      <div className="flex-shrink-0">
                        {getSentimentIcon(touchpoint.sentiment)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{touchpoint.customer}</div>
                          <span className="text-sm text-muted-foreground">
                            {touchpoint.timestamp.toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="capitalize">
                            <MessageCircle className="h-3 w-3 mr-1" />
                            {touchpoint.type}
                          </Badge>
                          <Badge
                            variant={
                              touchpoint.sentiment === 'positive'
                                ? 'default'
                                : touchpoint.sentiment === 'neutral'
                                ? 'secondary'
                                : 'destructive'
                            }
                            className={
                              touchpoint.sentiment === 'positive'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : touchpoint.sentiment === 'neutral'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                : ''
                            }
                          >
                            {touchpoint.sentiment}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{touchpoint.notes}</p>
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
