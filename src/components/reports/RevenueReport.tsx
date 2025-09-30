import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, DollarSign, Calendar } from 'lucide-react';

// Mock revenue data - in real app, this would come from an API
const monthlyRevenue = [
  { month: 'Jan', revenue: 125000, premiums: 110000, commissions: 15000 },
  { month: 'Feb', revenue: 132000, premiums: 115000, commissions: 17000 },
  { month: 'Mar', revenue: 145000, premiums: 128000, commissions: 17000 },
  { month: 'Apr', revenue: 138000, premiums: 121000, commissions: 17000 },
  { month: 'May', revenue: 155000, premiums: 135000, commissions: 20000 },
  { month: 'Jun', revenue: 162000, premiums: 140000, commissions: 22000 },
  { month: 'Jul', revenue: 158000, premiums: 138000, commissions: 20000 },
  { month: 'Aug', revenue: 171000, premiums: 148000, commissions: 23000 },
  { month: 'Sep', revenue: 165000, premiums: 142000, commissions: 23000 },
  { month: 'Oct', revenue: 178000, premiums: 152000, commissions: 26000 },
  { month: 'Nov', revenue: 185000, premiums: 158000, commissions: 27000 },
  { month: 'Dec', revenue: 195000, premiums: 165000, commissions: 30000 },
];

export function RevenueReport() {
  const currentYear = new Date().getFullYear();
  const totalRevenue = monthlyRevenue.reduce((sum, month) => sum + month.revenue, 0);
  const avgMonthlyRevenue = totalRevenue / monthlyRevenue.length;
  const lastMonth = monthlyRevenue[monthlyRevenue.length - 1];
  const previousMonth = monthlyRevenue[monthlyRevenue.length - 2];
  const growthRate = ((lastMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue ({currentYear})</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              +12.5% from last year
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Average</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Math.round(avgMonthlyRevenue).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across {monthlyRevenue.length} months
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Growth Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{growthRate > 0 ? '+' : ''}{growthRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Month over month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trend ({currentYear})</CardTitle>
          <p className="text-sm text-muted-foreground">
            Monthly revenue breakdown including premiums and commissions
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value, name) => [`$${value.toLocaleString()}`, name]}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="premiums" 
                  stackId="1"
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary))" 
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="commissions" 
                  stackId="1"
                  stroke="hsl(var(--secondary))" 
                  fill="hsl(var(--secondary))" 
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Total Revenue Growth</CardTitle>
          <p className="text-sm text-muted-foreground">
            Year-over-year revenue comparison
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Revenue']} />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}