import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeadSourcePerformance } from '@/hooks/useLeadAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];

interface LeadSourcePerformanceCardProps {
  dateRange?: { start: string; end: string };
}

export function LeadSourcePerformanceCard({ dateRange }: LeadSourcePerformanceCardProps) {
  const { data: sourceData, isLoading } = useLeadSourcePerformance(dateRange);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  if (!sourceData || sourceData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Lead Source Performance
          </CardTitle>
          <CardDescription>Conversion rates and ROI by marketing channel</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No lead source data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Lead Source Performance
        </CardTitle>
        <CardDescription>Conversion rates and ROI by marketing channel</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Conversion Rate Chart */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Conversion Rate by Source</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceData.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="source_name" 
                  style={{ fontSize: '11px' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis style={{ fontSize: '11px' }} />
                <Tooltip />
                <Bar dataKey="conversion_rate" name="Conversion %" radius={[8, 8, 0, 0]}>
                  {sourceData.slice(0, 6).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Performance Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2 font-semibold">Source</th>
                  <th className="text-center p-2 font-semibold">Leads</th>
                  <th className="text-center p-2 font-semibold">Won</th>
                  <th className="text-center p-2 font-semibold">Conv %</th>
                  <th className="text-center p-2 font-semibold">Win %</th>
                  <th className="text-right p-2 font-semibold">Value</th>
                  <th className="text-center p-2 font-semibold">Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {sourceData.map((source) => (
                  <tr key={source.source_id} className="border-t hover:bg-muted/50">
                    <td className="p-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{source.source_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {source.source_type}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-2 text-center">{source.total_leads}</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className="text-green-600">
                        {source.won}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">
                      <Badge 
                        variant={source.conversion_rate >= 20 ? 'default' : source.conversion_rate >= 10 ? 'secondary' : 'outline'}
                      >
                        {source.conversion_rate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {source.win_rate >= 50 ? (
                          <TrendingUp className="h-3 w-3 text-green-600" />
                        ) : source.win_rate >= 30 ? (
                          <TrendingUp className="h-3 w-3 text-yellow-600" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-600" />
                        )}
                        <span>{source.win_rate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="p-2 text-right font-medium">
                      ${source.total_value.toLocaleString()}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">
                      {source.avg_days_to_close > 0 ? Math.round(source.avg_days_to_close) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
