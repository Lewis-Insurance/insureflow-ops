import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface AgingData {
  stage: string;
  avgDays: number;
  count: number;
}

interface LeadAgingChartProps {
  data: AgingData[];
  title?: string;
  description?: string;
}

const STAGE_COLORS: Record<string, string> = {
  new: '#3b82f6',
  contacted: '#8b5cf6',
  qualified: '#eab308',
  quoted: '#f97316',
  won: '#10b981',
  lost: '#ef4444',
  nurturing: '#6b7280',
};

export function LeadAgingChart({ data, title = "Lead Aging by Stage", description }: LeadAgingChartProps) {
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
            <XAxis 
              dataKey="stage" 
              className="text-xs capitalize"
            />
            <YAxis 
              className="text-xs"
              label={{ value: 'Average Days', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              formatter={(value: number, name: string) => {
                if (name === 'avgDays') return [`${value.toFixed(1)} days`, 'Average Time'];
                return [value, name];
              }}
            />
            <Legend />
            <Bar dataKey="avgDays" name="Average Days in Stage" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={STAGE_COLORS[entry.stage.toLowerCase()] || '#8884d8'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        
        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {data.map((item) => (
            <div key={item.stage} className="text-center">
              <div className="font-semibold capitalize">{item.stage}</div>
              <div className="text-muted-foreground">{item.avgDays.toFixed(1)} days</div>
              <div className="text-xs text-muted-foreground">{item.count} leads</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
