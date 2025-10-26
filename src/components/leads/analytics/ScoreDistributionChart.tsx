import { useLeadScoreDistribution } from '@/hooks/useLeadAnalytics';
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

const SCORE_COLORS = ['#ef4444', '#f59e0b', '#eab308', '#3b82f6', '#10b981'];

export function ScoreDistributionChart() {
  const { data: scoreData, isLoading } = useLeadScoreDistribution();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Score Distribution</CardTitle>
        <CardDescription>
          Lead count and win rate by score range
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={scoreData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="range" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
              formatter={(value: any, name: string) => {
                if (name === 'win_rate') return `${value.toFixed(1)}%`;
                return value;
              }}
            />
            <Legend />
            <Bar dataKey="count" name="Lead Count">
              {scoreData?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={SCORE_COLORS[index]} />
              ))}
            </Bar>
            <Bar dataKey="win_rate" fill="#10b981" name="Win Rate %" />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-4 text-sm text-muted-foreground">
          <p>💡 <strong>Insight:</strong> Higher score ranges typically show better conversion rates</p>
        </div>
      </CardContent>
    </Card>
  );
}
