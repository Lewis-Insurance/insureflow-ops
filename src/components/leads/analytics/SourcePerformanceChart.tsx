import { useLeadSourcePerformance } from '@/hooks/useLeadAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#ef4444'];

export function SourcePerformanceChart({ dateRange }: { dateRange?: { start: string; end: string } }) {
  const { data: sourceData, isLoading } = useLeadSourcePerformance(dateRange);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Format source names for display
  const formattedData = sourceData?.map(item => ({
    ...item,
    displayName: item.source_name,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Source Performance</CardTitle>
        <CardDescription>
          Compare conversion rates and volume by source
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="displayName" 
              className="text-xs"
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
              formatter={(value: any, name: string) => {
                if (name === 'conversion_rate') return `${value.toFixed(1)}%`;
                if (name === 'total_value') return `$${value.toLocaleString()}`;
                return value;
              }}
            />
            <Legend />
            <Bar dataKey="total_leads" fill="#3b82f6" name="Total Leads">
              {formattedData?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
            <Bar dataKey="won" fill="#10b981" name="Won" />
            <Bar dataKey="lost" fill="#ef4444" name="Lost" />
          </BarChart>
        </ResponsiveContainer>

        {/* Source Stats Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Source</th>
                <th className="text-right py-2">Total</th>
                <th className="text-right py-2">Won</th>
                <th className="text-right py-2">Conv. Rate</th>
                <th className="text-right py-2">Avg Value</th>
                <th className="text-right py-2">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {formattedData?.map((source, index) => (
                <tr key={source.source_id} className="border-b">
                  <td className="py-2 font-medium">{source.displayName}</td>
                  <td className="text-right">{source.total_leads}</td>
                  <td className="text-right text-green-600">{source.won}</td>
                  <td className="text-right">
                    <span className={
                      source.conversion_rate >= 20 ? 'text-green-600' :
                      source.conversion_rate >= 10 ? 'text-amber-600' :
                      'text-red-600'
                    }>
                      {source.conversion_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right">${source.avg_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="text-right">${source.total_value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
