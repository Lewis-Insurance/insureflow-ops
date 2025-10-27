import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useQuotesAnalytics, useDenialAnalysis } from '@/hooks/useAORenewalQuotes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];

export function QuotesAnalyticsTab() {
  const { data: analytics = [], isLoading: analyticsLoading, error: analyticsError } = useQuotesAnalytics();
  const { data: denialData = [], isLoading: denialsLoading, error: denialsError } = useDenialAnalysis();

  // Memoize expensive calculations
  const analyticsMetrics = useMemo(() => {
    if (!analytics.length) return null;

    const sortedByPremium = [...analytics].sort((a, b) => 
      (Number(a.avg_annual_premium) || 0) - (Number(b.avg_annual_premium) || 0)
    );
    
    const sortedByVolume = [...analytics].sort((a, b) => 
      (b.total_quotes || 0) - (a.total_quotes || 0)
    );
    
    const sortedByDenial = [...analytics].sort((a, b) => 
      (Number(b.denial_rate_pct) || 0) - (Number(a.denial_rate_pct) || 0)
    );

    return {
      bestCarrier: sortedByPremium[0],
      worstCarrier: sortedByPremium[sortedByPremium.length - 1],
      highestVolumeCarrier: sortedByVolume[0],
      highestDenialCarrier: sortedByDenial[0],
    };
  }, [analytics]);

  const carrierComparisonData = useMemo(() => {
    // Find Auto-Owners baseline
    const autoOwnersData = analytics.find(a => 
      a.carrier.toLowerCase().includes('auto-owners') || 
      a.carrier.toLowerCase().includes('auto owners')
    );

    const autoOwnersBaseline = autoOwnersData?.avg_annual_premium 
      ? Number(autoOwnersData.avg_annual_premium) 
      : null;

    // Enhanced comparison data with Auto-Owners delta
    return {
      baseline: autoOwnersBaseline,
      data: analytics.map(a => {
        const annualPremium = Number(a.avg_annual_premium || 0);
        const delta = autoOwnersBaseline 
          ? ((annualPremium - autoOwnersBaseline) / autoOwnersBaseline * 100) 
          : 0;
        
        return {
          carrier: a.carrier,
          avgAnnualPremium: annualPremium,
          totalQuotes: a.total_quotes,
          denialRate: Number(a.denial_rate_pct || 0),
          deltaVsAutoOwners: delta,
          savingsVsAutoOwners: autoOwnersBaseline ? (autoOwnersBaseline - annualPremium) : 0,
        };
      })
    };
  }, [analytics]);

  const quoteStatusData = useMemo(() => 
    analytics.map(a => ({
      name: a.carrier,
      quoted: a.quoted_count,
      denied: a.denied_count,
      selected: a.selected_count,
    })),
    [analytics]
  );

  const denialReasonData = useMemo(() => 
    denialData.reduce((acc, curr) => {
      const existing = acc.find(item => item.name === curr.denial_reason);
      if (existing) {
        existing.value += curr.denial_count;
      } else {
        acc.push({ name: curr.denial_reason, value: curr.denial_count });
      }
      return acc;
    }, [] as Array<{ name: string; value: number }>),
    [denialData]
  );

  // Error handling
  if (analyticsError || denialsError) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load analytics. Please try again.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (analyticsLoading || denialsLoading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  // Empty state
  if (!analytics.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>No quote data available yet. Start adding quotes to see analytics.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Best Average Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{analyticsMetrics?.bestCarrier?.carrier || 'N/A'}</div>
                <div className="text-sm text-muted-foreground">
                  {analyticsMetrics?.bestCarrier && formatCurrency(Number(analyticsMetrics.bestCarrier.avg_annual_premium))} avg annual
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
                  {analyticsMetrics?.highestVolumeCarrier?.carrier || 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {analyticsMetrics?.highestVolumeCarrier?.total_quotes || 0} quotes
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
                  {analyticsMetrics?.highestDenialCarrier?.carrier || 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {analyticsMetrics?.highestDenialCarrier?.denial_rate_pct?.toFixed(1)}% denial rate
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {carrierComparisonData.baseline && (
          <Card className="border-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Auto-Owners Baseline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-2xl font-bold">
                  {formatCurrency(carrierComparisonData.baseline)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Average annual premium
                </div>
                {analyticsMetrics?.bestCarrier && (
                  <div className="text-sm font-medium text-green-600 flex items-center gap-1">
                    <TrendingDown className="h-4 w-4" />
                    Save {formatCurrency(carrierComparisonData.baseline - Number(analyticsMetrics.bestCarrier.avg_annual_premium))} 
                    {' '}with {analyticsMetrics.bestCarrier.carrier}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Average Premium Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Average Annual Premium by Carrier</CardTitle>
          <CardDescription>Compare average annual premiums across carriers</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={carrierComparisonData.data}>
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
                <TableHead className="text-right">vs Auto-Owners</TableHead>
                <TableHead className="text-right">6-mo / 12-mo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carrierComparisonData.data.map((row) => {
                const analytics_row = analytics.find(a => a.carrier === row.carrier);
                const isAutoOwners = row.carrier.toLowerCase().includes('auto-owners') || 
                                    row.carrier.toLowerCase().includes('auto owners');
                
                return (
                  <TableRow key={row.carrier}>
                    <TableCell className="font-medium">{row.carrier}</TableCell>
                    <TableCell className="text-right">{row.totalQuotes}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{analytics_row?.quoted_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{analytics_row?.denied_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="default">{analytics_row?.selected_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.denialRate.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(analytics_row?.avg_premium))}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(row.avgAnnualPremium)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAutoOwners ? (
                        <Badge variant="outline">Baseline</Badge>
                      ) : row.savingsVsAutoOwners > 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          <TrendingDown className="h-3 w-3 text-green-600" />
                          <span className="text-green-600 font-medium">
                            {formatCurrency(row.savingsVsAutoOwners)} ({row.deltaVsAutoOwners.toFixed(1)}%)
                          </span>
                        </div>
                      ) : row.savingsVsAutoOwners < 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          <TrendingUp className="h-3 w-3 text-red-600" />
                          <span className="text-red-600 font-medium">
                            {formatCurrency(Math.abs(row.savingsVsAutoOwners))} ({Math.abs(row.deltaVsAutoOwners).toFixed(1)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {analytics_row?.six_month_count} / {analytics_row?.twelve_month_count}
                    </TableCell>
                  </TableRow>
                );
              })}
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
