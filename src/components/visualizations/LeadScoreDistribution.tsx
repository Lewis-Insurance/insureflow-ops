import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ScoreDistributionProps {
  data: { range: string; count: number }[];
  title?: string;
  description?: string;
}

export function LeadScoreDistribution({ data, title = "Lead Score Distribution", description }: ScoreDistributionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="range" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            />
            <Bar 
              dataKey="count" 
              fill="hsl(var(--primary))" 
              radius={[8, 8, 0, 0]}
              name="Number of Leads"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
