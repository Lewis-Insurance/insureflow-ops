import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { differenceInDays, startOfToday } from 'date-fns';
import { parseLocalDate, todayLocalDate, addDaysLocalDate, extractLocalDate } from '@/lib/date/localDate';
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
  DollarSign,
  Clock,
  Target,
  Bell,
} from 'lucide-react';

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

export default function RetentionPage() {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '12m'>('6m');
  const [activeTab, setActiveTab] = useState<'overview' | 'risk'>('overview');
  
  const { data: policies } = usePolicies({});
  const { data: renewalsStats } = useRenewalsStats();

  // Calculate real churn metrics
  const totalPolicies = policies?.length || 0;
  const activePolicies = policies?.filter(p => p.status === 'active').length || 0;
  const expiredPolicies = policies?.filter(p => p.status === 'expired').length || 0;
  const cancelledPolicies = policies?.filter(p => p.status === 'cancelled').length || 0;
  const totalChurned = expiredPolicies + cancelledPolicies;
  
  const churnRate = totalPolicies > 0 ? (totalChurned / totalPolicies) * 100 : 0;
  const retentionRate = 100 - churnRate;
  const atRiskCount = renewalsStats?.upcoming || 0;
  
  const churnMetrics: ChurnMetrics = {
    rate: Number(churnRate.toFixed(1)),
    trend: 0, // No historical data to calculate trend
    totalChurned: totalChurned,
    atRisk: atRiskCount,
    recovered: 0, // No data to track recoveries
  };

  // Calculate total at-risk value from upcoming renewals
  const _atRiskTodayStr = todayLocalDate();
  const _atRiskFutureStr = addDaysLocalDate(_atRiskTodayStr, 30);
  const atRiskValue = policies
    ?.filter(p => {
      if (!p.expiration_date) return false;
      const expStr = extractLocalDate(p.expiration_date);
      return expStr >= _atRiskTodayStr && expStr <= _atRiskFutureStr &&
             (p.status === 'active' || p.status === 'pending');
    })
    .reduce((sum, p) => sum + (Number(p.premium) || 0), 0) || 0;

  // Get at-risk customers (policies expiring within 30 days)
  const todayStr = todayLocalDate();
  const thirtyDaysStr = addDaysLocalDate(todayStr, 30);

  const atRiskCustomers: RiskCustomer[] = policies
    ?.filter(p => {
      if (!p.expiration_date) return false;
      const expStr = extractLocalDate(p.expiration_date);
      return expStr >= todayStr && expStr <= thirtyDaysStr &&
             (p.status === 'active' || p.status === 'pending');
    })
    .slice(0, 10) // Show top 10
    .map(p => {
      const daysUntilExpiration = differenceInDays(parseLocalDate(p.expiration_date!), startOfToday());
      const riskScore = Math.max(0, Math.min(100, 100 - (daysUntilExpiration * 3.33))); // Higher score = closer to expiration
      
      let riskLevel: RiskLevel = 'low';
      if (riskScore >= 80) riskLevel = 'critical';
      else if (riskScore >= 60) riskLevel = 'high';
      else if (riskScore >= 40) riskLevel = 'medium';
      
      return {
        id: p.id,
        name: p.account?.name || 'Unknown',
        riskScore: Math.round(riskScore),
        riskLevel,
        reason: daysUntilExpiration <= 7 ? ['Expires within 7 days'] : ['Upcoming renewal'],
        value: Number(p.premium) || 0,
        daysSinceContact: 0, // No contact tracking data
        renewalDate: new Date(p.expiration_date!),
      };
    }) || [];

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
              <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{expiredPolicies}</span>
                <Shield className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Expired policies
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Retention Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{retentionRate.toFixed(1)}%</span>
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <Progress value={retentionRate} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Risk Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">${(atRiskValue / 1000).toFixed(0)}k</span>
                <DollarSign className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total at-risk premium
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="risk">At-Risk Policies</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Policy Status Distribution</CardTitle>
                  <CardDescription>Current status breakdown of all policies</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Active</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-muted-foreground">{activePolicies} policies</span>
                          <Badge variant="outline">{totalPolicies > 0 ? Math.round((activePolicies / totalPolicies) * 100) : 0}%</Badge>
                        </div>
                      </div>
                      <Progress value={totalPolicies > 0 ? (activePolicies / totalPolicies) * 100 : 0} className="h-2" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Expired</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-muted-foreground">{expiredPolicies} policies</span>
                          <Badge variant="outline">{totalPolicies > 0 ? Math.round((expiredPolicies / totalPolicies) * 100) : 0}%</Badge>
                        </div>
                      </div>
                      <Progress value={totalPolicies > 0 ? (expiredPolicies / totalPolicies) * 100 : 0} className="h-2" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Cancelled</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-muted-foreground">{cancelledPolicies} policies</span>
                          <Badge variant="outline">{totalPolicies > 0 ? Math.round((cancelledPolicies / totalPolicies) * 100) : 0}%</Badge>
                        </div>
                      </div>
                      <Progress value={totalPolicies > 0 ? (cancelledPolicies / totalPolicies) * 100 : 0} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Retention Metrics</CardTitle>
                  <CardDescription>Key performance indicators</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Overall Retention Rate</span>
                        <span className="text-2xl font-bold">{retentionRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={retentionRate} className="h-3" />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Churn Rate</span>
                        <span className="text-2xl font-bold text-orange-600">{churnRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={churnRate} className="h-3" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-3xl font-bold">{totalPolicies}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total Policies</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-3xl font-bold">{atRiskCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">At Risk</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Policies Expiring Soon</CardTitle>
                <CardDescription>
                  Policies expiring within the next 30 days requiring renewal attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                {atRiskCustomers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No policies expiring in the next 30 days
                  </div>
                ) : (
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
