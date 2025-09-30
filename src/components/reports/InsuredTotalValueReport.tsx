import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, DollarSign, Award, Loader2 } from 'lucide-react';
import { useInsuredTotalValue } from '@/hooks/useInsuredTotalValue';

const COLORS = ['hsl(210, 70%, 50%)', 'hsl(250, 70%, 60%)', 'hsl(290, 70%, 70%)', 'hsl(330, 70%, 80%)'];

const getRiskBadgeColor = (risk: string) => {
  switch (risk) {
    case 'Low':
      return 'bg-green-500/10 text-green-700 border-green-200';
    case 'Medium':
      return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
    case 'High':
      return 'bg-red-500/10 text-red-700 border-red-200';
    default:
      return 'bg-gray-500/10 text-gray-700 border-gray-200';
  }
};

export function InsuredTotalValueReport() {
  const { data, isLoading, error } = useInsuredTotalValue();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Error loading insured value data</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { valueSegments, topCustomers, totalValue, totalCustomers, avgValuePerCustomer } = data;
  
  const pieData = valueSegments.map((item, index) => ({
    name: item.segment,
    value: item.totalValue,
    customers: item.customers,
    color: COLORS[index % COLORS.length]
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Insured Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(totalValue / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground">
              +8.2% from last quarter
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
            <p className="text-xs text-muted-foreground">
              Active insured accounts
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Math.round(avgValuePerCustomer).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Per customer
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Value Clients</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{valueSegments[0]?.customers || 0}</div>
            <p className="text-xs text-muted-foreground">
              &gt;$100k in coverage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Value Distribution by Segment</CardTitle>
            <p className="text-sm text-muted-foreground">
              Total insured value breakdown by customer segments
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name, props) => [
                      `$${(value as number).toLocaleString()}`,
                      `${props.payload.customers} customers`
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Count by Segment</CardTitle>
            <p className="text-sm text-muted-foreground">
              Number of customers in each value segment
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueSegments} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="segment" 
                    type="category" 
                    width={120}
                    fontSize={12}
                  />
                  <Tooltip formatter={(value) => [`${value} customers`, 'Count']} />
                  <Bar dataKey="customers" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Customers by Insured Value</CardTitle>
          <p className="text-sm text-muted-foreground">
            Highest value customers and their risk profiles
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Name</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead className="text-right">Policies</TableHead>
                <TableHead className="text-center">Risk Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCustomers.map((customer, index) => (
                <TableRow key={customer.name}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {index + 1}
                      </span>
                      {customer.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${customer.value.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">{customer.policies}</TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant="outline" 
                      className={getRiskBadgeColor(customer.risk)}
                    >
                      {customer.risk}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Value Segment Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {valueSegments.map((segment, index) => (
              <div key={segment.segment} className="p-4 border rounded-lg">
                <div className="text-sm font-medium text-muted-foreground mb-2">
                  {segment.segment}
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold">
                    ${(segment.totalValue / 1000000).toFixed(1)}M
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {segment.customers} customers
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg: ${segment.avgValue.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}