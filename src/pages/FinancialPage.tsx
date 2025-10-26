import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { usePolicies } from '@/hooks/usePolicies';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Percent, Calculator, Building2 } from 'lucide-react';

export default function FinancialPage() {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '12m'>('12m');
  const { data: policies } = usePolicies({});

  // Fetch carriers with commission rates
  const { data: carriers } = useQuery({
    queryKey: ['carriers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carriers')
        .select('id, name, default_commission_rate');
      if (error) throw error;
      return data;
    }
  });

  // Calculate monthly financial data
  const monthlyData = useMemo(() => {
    const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
    const endDate = new Date();
    const startDate = subMonths(endDate, months);
    const monthsArray = eachMonthOfInterval({ start: startDate, end: endDate });

    return monthsArray.map(month => {
      const monthPolicies = policies?.filter(p => {
        const effectiveDate = p.effective_date ? new Date(p.effective_date) : null;
        return effectiveDate && 
               effectiveDate >= startOfMonth(month) && 
               effectiveDate <= endOfMonth(month);
      }) || [];

      const writtenPremium = monthPolicies.reduce((sum, p) => sum + (Number(p.premium) || 0), 0);
      
      // Calculate earned premium (simplified - assumes monthly earning)
      const earnedPremium = policies?.filter(p => {
        const effectiveDate = p.effective_date ? new Date(p.effective_date) : null;
        const expirationDate = p.expiration_date ? new Date(p.expiration_date) : null;
        return effectiveDate && expirationDate &&
               effectiveDate <= endOfMonth(month) &&
               expirationDate >= startOfMonth(month) &&
               (p.status === 'active' || p.status === 'pending');
      }).reduce((sum, p) => {
        const premium = Number(p.premium) || 0;
        const effectiveDate = new Date(p.effective_date!);
        const expirationDate = new Date(p.expiration_date!);
        const policyMonths = Math.max(1, Math.round((expirationDate.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
        return sum + (premium / policyMonths);
      }, 0) || 0;

      // Calculate commissions
      const commissions = monthPolicies.reduce((sum, p) => {
        const carrier = carriers?.find(c => c.id === p.carrier_id || c.name === p.carrier);
        const rate = carrier?.default_commission_rate || 0.10;
        return sum + ((Number(p.premium) || 0) * rate);
      }, 0);

      return {
        month: format(month, 'MMM yyyy'),
        writtenPremium: Math.round(writtenPremium),
        earnedPremium: Math.round(earnedPremium),
        commissions: Math.round(commissions),
        profit: Math.round(commissions * 0.7), // Simplified profit = 70% of commissions
      };
    });
  }, [policies, carriers, timeRange]);

  // Calculate key metrics
  const metrics = useMemo(() => {
    const totalWritten = monthlyData.reduce((sum, d) => sum + d.writtenPremium, 0);
    const totalEarned = monthlyData.reduce((sum, d) => sum + d.earnedPremium, 0);
    const totalCommissions = monthlyData.reduce((sum, d) => sum + d.commissions, 0);
    const totalProfit = monthlyData.reduce((sum, d) => sum + d.profit, 0);
    
    const avgCommissionRate = totalWritten > 0 ? (totalCommissions / totalWritten) * 100 : 0;
    const profitMargin = totalCommissions > 0 ? (totalProfit / totalCommissions) * 100 : 0;

    // Growth calculations
    const recentMonths = monthlyData.slice(-3);
    const previousMonths = monthlyData.slice(-6, -3);
    const recentWritten = recentMonths.reduce((sum, d) => sum + d.writtenPremium, 0);
    const previousWritten = previousMonths.reduce((sum, d) => sum + d.writtenPremium, 0);
    const writtenGrowth = previousWritten > 0 ? ((recentWritten - previousWritten) / previousWritten) * 100 : 0;

    return {
      totalWritten,
      totalEarned,
      totalCommissions,
      totalProfit,
      avgCommissionRate,
      profitMargin,
      writtenGrowth,
    };
  }, [monthlyData]);

  // Commission by carrier
  const commissionByCarrier = useMemo(() => {
    if (!policies || !carriers) return [];

    const carrierMap: Record<string, { commissions: number; premium: number; policies: number }> = {};

    policies.forEach(p => {
      const carrier = carriers.find(c => c.id === p.carrier_id || c.name === p.carrier);
      const carrierName = carrier?.name || p.carrier || 'Unknown';
      const rate = carrier?.default_commission_rate || 0.10;
      const premium = Number(p.premium) || 0;
      const commission = premium * rate;

      if (!carrierMap[carrierName]) {
        carrierMap[carrierName] = { commissions: 0, premium: 0, policies: 0 };
      }
      carrierMap[carrierName].commissions += commission;
      carrierMap[carrierName].premium += premium;
      carrierMap[carrierName].policies++;
    });

    return Object.entries(carrierMap)
      .map(([carrier, data]) => ({
        carrier,
        commissions: Math.round(data.commissions),
        premium: Math.round(data.premium),
        policies: data.policies,
        rate: data.premium > 0 ? ((data.commissions / data.premium) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.commissions - a.commissions)
      .slice(0, 10);
  }, [policies, carriers]);

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Financial Dashboard</h1>
            <p className="text-muted-foreground">
              Written/earned premium, commissions, and profitability
            </p>
          </div>
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Written Premium</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(metrics.totalWritten / 1000).toFixed(0)}K
              </div>
              {metrics.writtenGrowth !== 0 && (
                <div className="flex items-center text-xs text-muted-foreground">
                  {metrics.writtenGrowth >= 0 ? (
                    <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                  )}
                  <span className={metrics.writtenGrowth >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {Math.abs(metrics.writtenGrowth).toFixed(1)}%
                  </span>
                  <span className="ml-1">vs prev period</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Earned Premium</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(metrics.totalEarned / 1000).toFixed(0)}K
              </div>
              <Progress 
                value={metrics.totalWritten > 0 ? (metrics.totalEarned / metrics.totalWritten) * 100 : 0} 
                className="h-2 mt-2" 
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(metrics.totalCommissions / 1000).toFixed(0)}K
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg rate: {metrics.avgCommissionRate.toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(metrics.totalProfit / 1000).toFixed(0)}K
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Margin: {metrics.profitMargin.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="commissions">Commissions</TabsTrigger>
            <TabsTrigger value="profitability">Profitability</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Premium Trends</CardTitle>
                  <CardDescription>Written vs Earned Premium</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="writtenPremium"
                        stackId="1"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary) / 0.3)"
                        name="Written Premium"
                      />
                      <Area
                        type="monotone"
                        dataKey="earnedPremium"
                        stackId="2"
                        stroke="hsl(var(--chart-2))"
                        fill="hsl(var(--chart-2) / 0.3)"
                        name="Earned Premium"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Commission Income</CardTitle>
                  <CardDescription>Monthly commission revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="commissions" fill="hsl(var(--chart-3))" name="Commissions" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="commissions" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Commissions by Carrier</CardTitle>
                  <CardDescription>Top carriers by commission revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {commissionByCarrier.slice(0, 8).map((item, index) => (
                      <div key={item.carrier} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{item.carrier}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{item.rate}%</Badge>
                            <span className="font-bold">${(item.commissions / 1000).toFixed(1)}K</span>
                          </div>
                        </div>
                        <Progress 
                          value={(item.commissions / commissionByCarrier[0].commissions) * 100} 
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          {item.policies} policies • ${(item.premium / 1000).toFixed(1)}K premium
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Commission Distribution</CardTitle>
                  <CardDescription>Share by carrier</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={commissionByCarrier.slice(0, 5)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.carrier}: ${(((Number(entry.commissions) || 0) / (Number(metrics.totalCommissions) || 1)) * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="commissions"
                      >
                        {commissionByCarrier.slice(0, 5).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="profitability" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Profit Trend</CardTitle>
                  <CardDescription>Monthly net profit</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        name="Net Profit"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue Breakdown</CardTitle>
                  <CardDescription>Commissions vs Profit</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="commissions" fill="hsl(var(--chart-3))" name="Commissions" />
                      <Bar dataKey="profit" fill="hsl(var(--primary))" name="Net Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
