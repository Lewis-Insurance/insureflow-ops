import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useQuotesAnalytics, useDenialAnalysis } from '@/hooks/useAORenewalQuotes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];

export function QuotesAnalyticsTab() {
  const { data: analytics = [], isLoading: analyticsLoading } = useQuotesAnalytics();
  const { data: denialData = [], isLoading: denialsLoading } = useDenialAnalysis();

  if (analyticsLoading || denialsLoading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  // Prepare chart data
  const carrierComparisonData = analytics.map(a => ({
    carrier: a.carrier,
    avgAnnualPremium: Number(a.avg_annual_premium?.toFixed(2) || 0),
    totalQuotes: a.total_quotes,
    denialRate: Number(a.denial_rate_pct || 0),
  }));

  const quoteStatusData = analytics.map(a => ({
    name: a.carrier,
    quoted: a.quoted_count,
    denied: a.denied_count,
    selected: a.selected_count,
  }));

  const denialReasonData = denialData.reduce((acc, curr) => {
    const existing = acc.find(item => item.name === curr.denial_reason);
    if (existing) {
      existing.value += curr.denial_count;
    } else {
      acc.push({ name: curr.denial_reason, value: curr.denial_count });
    }
    return acc;
  }, [] as Array<{ name: string; value: number }>);

  // Find best and worst performers
  const sortedByPremium = [...analytics].sort((a, b) => 
    (Number(a.avg_annual_premium) || 0) - (Number(b.avg_annual_premium) || 0)
  );
  const bestCarrier = sortedByPremium[0];
  const worstCarrier = sortedByPremium[sortedByPremium.length - 1];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Best Average Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{bestCarrier?.carrier || 'N/A'}</div>
                <div className="text-sm text-muted-foreground">
                  {bestCarrier && formatCurrency(Number(bestCarrier.avg_annual_premium))} avg annual
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Highest Quote Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">
                  {analytics[0]?.carrier || 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {analytics[0]?.total_quotes || 0} quotes
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Highest Denial Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <div>
                <div className="text-2xl font-bold">
                  {[...analytics].sort((a, b) => (Number(b.denial_rate_pct) || 0) - (Number(a.denial_rate_pct) || 0))[0]?.carrier || 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[...analytics].sort((a, b) => (Number(b.denial_rate_pct) || 0) - (Number(a.denial_rate_pct) || 0))[0]?.denial_rate_pct?.toFixed(1)}% denial rate
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Average Premium Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Average Annual Premium by Carrier</CardTitle>
          <CardDescription>Compare average annual premiums across carriers</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={carrierComparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="carrier" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="avgAnnualPremium" fill="#0088FE" name="Avg Annual Premium" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Quote Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Quote Status Distribution</CardTitle>
          <CardDescription>Breakdown of quote statuses by carrier</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={quoteStatusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="quoted" fill="#00C49F" name="Quoted" stackId="a" />
              <Bar dataKey="denied" fill="#FF8042" name="Denied" stackId="a" />
              <Bar dataKey="selected" fill="#0088FE" name="Selected" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Denial Reasons Pie Chart */}
      {denialReasonData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Denial Reasons</CardTitle>
            <CardDescription>Distribution of quote denial reasons</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={denialReasonData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {denialReasonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detailed Analytics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Carrier Analytics</CardTitle>
          <CardDescription>Comprehensive breakdown by carrier</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carrier</TableHead>
                <TableHead className="text-right">Total Quotes</TableHead>
                <TableHead className="text-right">Quoted</TableHead>
                <TableHead className="text-right">Denied</TableHead>
                <TableHead className="text-right">Selected</TableHead>
                <TableHead className="text-right">Denial Rate</TableHead>
                <TableHead className="text-right">Avg Premium</TableHead>
                <TableHead className="text-right">Avg Annual</TableHead>
                <TableHead className="text-right">6-mo / 12-mo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.map((row) => (
                <TableRow key={row.carrier}>
                  <TableCell className="font-medium">{row.carrier}</TableCell>
                  <TableCell className="text-right">{row.total_quotes}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{row.quoted_count}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">{row.denied_count}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="default">{row.selected_count}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(row.denial_rate_pct || 0).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(row.avg_premium))}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Number(row.avg_annual_premium))}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {row.six_month_count} / {row.twelve_month_count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Denial Analysis by Carrier */}
      {denialData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Denial Analysis by Carrier</CardTitle>
            <CardDescription>Specific reasons for quote denials</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Denial Reason</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Avg Attempted Premium</TableHead>
                  <TableHead>First Denial</TableHead>
                  <TableHead>Last Denial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {denialData.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.carrier}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.denial_reason}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.denial_count}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(row.avg_attempted_premium))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.first_denial).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.last_denial).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
