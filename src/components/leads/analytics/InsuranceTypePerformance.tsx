import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useInsuranceTypePerformance } from '@/hooks/useLeadAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Target } from 'lucide-react';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];

export function InsuranceTypePerformance({ dateRange }: { dateRange?: { start: string; end: string } }) {
  const { data: typeData, isLoading } = useInsuranceTypePerformance(dateRange);

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

  if (!typeData || typeData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Win Rate by Insurance Type
          </CardTitle>
          <CardDescription>Performance breakdown by insurance product</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No insurance type data available
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
          Win Rate by Insurance Type
        </CardTitle>
        <CardDescription>Performance breakdown by insurance product</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Chart */}
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={typeData.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="type" 
                style={{ fontSize: '12px' }}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis style={{ fontSize: '12px' }} />
              <Tooltip />
              <Bar dataKey="win_rate" name="Win Rate %" radius={[8, 8, 0, 0]}>
                {typeData.slice(0, 8).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Details Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Type</th>
                  <th className="text-center p-3 text-sm font-semibold">Total</th>
                  <th className="text-center p-3 text-sm font-semibold">Won</th>
                  <th className="text-center p-3 text-sm font-semibold">Win Rate</th>
                  <th className="text-right p-3 text-sm font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {typeData.map((type, index) => (
                  <tr key={type.type} className="border-t hover:bg-muted/50">
                    <td className="p-3 font-medium">{type.type}</td>
                    <td className="p-3 text-center">{type.total}</td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="text-green-600">
                        {type.won}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge 
                        variant={type.win_rate >= 30 ? 'default' : type.win_rate >= 15 ? 'secondary' : 'outline'}
                      >
                        {type.win_rate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-medium">
                      ${type.total_value.toLocaleString()}
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
