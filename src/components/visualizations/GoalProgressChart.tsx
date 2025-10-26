import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface GoalProgressData {
  date: string;
  actual: number;
  goal: number;
  percentage: number;
}

interface GoalProgressChartProps {
  data: GoalProgressData[];
  title?: string;
  description?: string;
}

export function GoalProgressChart({ data, title = "Goal Progress Over Time", description }: GoalProgressChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              formatter={(value: number, name: string) => {
                if (name === 'percentage') return `${value.toFixed(1)}%`;
                return value;
              }}
            />
            <Legend />
            <ReferenceLine y={100} stroke="hsl(var(--primary))" strokeDasharray="3 3" label="Target" />
            <Line 
              type="monotone" 
              dataKey="actual" 
              stroke="#10b981" 
              name="Actual Deals" 
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="goal" 
              stroke="hsl(var(--primary))" 
              name="Goal" 
              strokeWidth={2}
              strokeDasharray="5 5"
            />
            <Line 
              type="monotone" 
              dataKey="percentage" 
              stroke="#8b5cf6" 
              name="% of Goal" 
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
