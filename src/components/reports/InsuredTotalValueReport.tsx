import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, DollarSign, Award } from 'lucide-react';

// Mock data for insured total value - in real app, this would come from customer/policy data
const customerValueData = [
  { 
    segment: 'High Value (>$100k)', 
    customers: 25, 
    totalValue: 4250000, 
    avgValue: 170000,
    percentage: 42.5
  },
  { 
    segment: 'Medium Value ($50k-$100k)', 
    customers: 45, 
    totalValue: 3375000, 
    avgValue: 75000,
    percentage: 33.8
  },
  { 
    segment: 'Standard Value ($25k-$50k)', 
    customers: 78, 
    totalValue: 2925000, 
    avgValue: 37500,
    percentage: 29.3
  },
  { 
    segment: 'Basic Value (<$25k)', 
    customers: 92, 
    totalValue: 1840000, 
    avgValue: 20000,
    percentage: 18.4
  }
];

const topCustomers = [
  { name: 'Johnson Manufacturing Corp', value: 485000, policies: 8, risk: 'Low' },
  { name: 'Metro Construction LLC', value: 425000, policies: 6, risk: 'Medium' },
  { name: 'Riverside Healthcare Group', value: 380000, policies: 12, risk: 'Low' },
  { name: 'Advanced Tech Solutions', value: 350000, policies: 5, risk: 'High' },
  { name: 'Golden State Logistics', value: 325000, policies: 7, risk: 'Medium' },
  { name: 'Premium Auto Group', value: 290000, policies: 9, risk: 'Low' },
  { name: 'Northern Retail Chain', value: 275000, policies: 4, risk: 'Medium' },
  { name: 'Elite Property Management', value: 260000, policies: 11, risk: 'Low' },
];

const pieData = customerValueData.map((item, index) => ({
  name: item.segment,
  value: item.totalValue,
  customers: item.customers,
  color: `hsl(${210 + (index * 40)}, 70%, ${50 + (index * 10)}%)`
}));

const COLORS = pieData.map(item => item.color);

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
  const totalValue = customerValueData.reduce((sum, segment) => sum + segment.totalValue, 0);
  const totalCustomers = customerValueData.reduce((sum, segment) => sum + segment.customers, 0);
  const avgValuePerCustomer = totalValue / totalCustomers;

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
            <div className="text-2xl font-bold">{customerValueData[0].customers}</div>
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
                <BarChart data={customerValueData} layout="horizontal">
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
            {customerValueData.map((segment, index) => (
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