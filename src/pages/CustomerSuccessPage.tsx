import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  Phone,
  Mail,
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface CustomerSegment {
  stage: string;
  count: number;
  percentage: number;
}

interface TouchPoint {
  id: string;
  type: string;
  account_name: string;
  contact_name?: string;
  timestamp: Date;
  notes?: string;
}

const STAGE_COLORS: Record<string, string> = {
  lead: '#94a3b8',
  prospect: '#3b82f6',
  active: '#10b981',
  inactive: '#f59e0b',
  churned: '#ef4444',
};

export default function CustomerSuccessPage() {
  const [activeTab, setActiveTab] = useState<'journey' | 'health' | 'touchpoints'>('journey');
  
  const { data: policies } = usePolicies({});
  const { data: renewalsStats } = useRenewalsStats();

  // Fetch account status distribution
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-status-distribution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('account_status, id')
        .is('deleted_at', null);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch recent communications/touchpoints
  const { data: callSessions } = useQuery({
    queryKey: ['recent-call-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_sessions')
        .select(`
          id,
          created_at,
          disposition,
          duration_seconds,
          account_id,
          accounts(name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate customer segments from actual account data
  const totalAccounts = accountsData?.length || 0;
  const statusCounts = accountsData?.reduce((acc, account) => {
    const status = account.account_status || 'active';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const segments: CustomerSegment[] = Object.entries(statusCounts).map(([stage, count]) => ({
    stage,
    count,
    percentage: totalAccounts > 0 ? Math.round((count / totalAccounts) * 100) : 0,
  })).sort((a, b) => b.count - a.count);

  // Transform call sessions to touchpoints
  const recentTouchpoints: TouchPoint[] = (callSessions || []).map(session => ({
    id: session.id,
    type: 'call',
    account_name: session.accounts?.name || 'Unknown',
    timestamp: new Date(session.created_at),
    notes: session.disposition || undefined,
  }));

  // Calculate health metrics from real data
  const activePolicies = policies?.filter(p => p.status === 'active').length || 0;
  const totalPolicies = policies?.length || 0;
  const healthScore = totalPolicies > 0 ? Math.round((activePolicies / totalPolicies) * 100) : 0;

  const getStageColor = (stage: string): string => {
    return STAGE_COLORS[stage.toLowerCase()] || STAGE_COLORS.active;
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{totalAccounts}</span>
                <Users className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active customer accounts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Policies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{activePolicies}</span>
                <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">
                  {totalPolicies > 0 ? Math.round((activePolicies / totalPolicies) * 100) : 0}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Of {totalPolicies} total policies
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Customer Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{healthScore}</span>
                <div className="flex items-center space-x-1">
                  <Heart className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">
                    {healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'Fair' : 'At Risk'}
                  </span>
                </div>
              </div>
              <Progress value={healthScore} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recent Touchpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{recentTouchpoints.length}</span>
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last 10 interactions
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="journey">Customer Journey</TabsTrigger>
            <TabsTrigger value="health">Health Metrics</TabsTrigger>
            <TabsTrigger value="touchpoints">Recent Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="journey" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Account Status Distribution</CardTitle>
                <CardDescription>Customer accounts by status</CardDescription>
              </CardHeader>
              <CardContent>
                {segments.length > 0 ? (
                  <div className="space-y-6">
                    {/* Status Distribution Chart */}
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={segments}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="stage" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" fill="#3b82f6" name="Accounts" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Detailed Breakdown */}
                    <div className="grid gap-4 md:grid-cols-3">
                      {segments.map((segment) => (
                        <Card key={segment.stage}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base capitalize">{segment.stage}</CardTitle>
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
                            <Progress value={segment.percentage} className="h-2" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No account data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="health" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Policy Health Metrics</CardTitle>
                  <CardDescription>Overview of policy portfolio health</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Active Policies</span>
                      <span className="text-sm font-bold">{healthScore}%</span>
                    </div>
                    <Progress value={healthScore} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {activePolicies} active out of {totalPolicies} total
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Renewal Rate</span>
                      <span className="text-sm font-bold">
                        {renewalsStats?.total ? Math.round((renewalsStats.upcoming / renewalsStats.total) * 100) : 0}%
                      </span>
                    </div>
                    <Progress 
                      value={renewalsStats?.total ? (renewalsStats.upcoming / renewalsStats.total) * 100 : 0} 
                      className="h-2" 
                    />
                    <p className="text-xs text-muted-foreground">
                      {renewalsStats?.upcoming || 0} upcoming renewals
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="text-sm font-medium mb-2">Account Status Summary</div>
                    {segments.length > 0 ? (
                      segments.map((segment) => (
                        <div key={segment.stage} className="flex items-center justify-between py-2">
                          <span className="text-sm capitalize">{segment.stage}</span>
                          <Badge variant="outline">{segment.count}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No data available</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Overall Health Score</CardTitle>
                  <CardDescription>Composite health indicator</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="relative w-48 h-48">
                    <svg className="transform -rotate-90 w-48 h-48">
                      <circle
                        cx="96"
                        cy="96"
                        r="80"
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="none"
                        className="text-muted"
                      />
                      <circle
                        cx="96"
                        cy="96"
                        r="80"
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="none"
                        strokeDasharray={`${(healthScore / 100) * 502.4} 502.4`}
                        className={
                          healthScore >= 80
                            ? 'text-green-500'
                            : healthScore >= 60
                            ? 'text-yellow-500'
                            : 'text-red-500'
                        }
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-5xl font-bold">{healthScore}</div>
                        <div className="text-sm text-muted-foreground">Health Score</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 text-center">
                    <Badge
                      variant={healthScore >= 80 ? 'default' : healthScore >= 60 ? 'secondary' : 'destructive'}
                      className={
                        healthScore >= 80
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : healthScore >= 60
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : ''
                      }
                    >
                      {healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'Fair' : 'Needs Attention'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="touchpoints" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Customer Interactions</CardTitle>
                <CardDescription>Latest touchpoints from call sessions and communications</CardDescription>
              </CardHeader>
              <CardContent>
                {recentTouchpoints.length > 0 ? (
                  <div className="space-y-4">
                    {recentTouchpoints.map((touchpoint) => (
                      <div key={touchpoint.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                        <div className="flex-shrink-0">
                          <Phone className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{touchpoint.account_name}</div>
                            <span className="text-sm text-muted-foreground">
                              {format(touchpoint.timestamp, 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="capitalize">
                              <MessageCircle className="h-3 w-3 mr-1" />
                              {touchpoint.type}
                            </Badge>
                            {touchpoint.contact_name && (
                              <span className="text-sm text-muted-foreground">
                                Contact: {touchpoint.contact_name}
                              </span>
                            )}
                          </div>
                          {touchpoint.notes && (
                            <p className="text-sm text-muted-foreground">{touchpoint.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent interactions found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
