import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign } from 'lucide-react';

interface SourceROIData {
  source: string;
  leads: number;
  won: number;
  revenue: number;
  conversionRate: number;
}

interface LeadSourceROIProps {
  data: SourceROIData[];
  title?: string;
  description?: string;
}

export function LeadSourceROI({ data, title = "Lead Source ROI", description }: LeadSourceROIProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="source" 
              className="text-xs"
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis 
              yAxisId="left"
              className="text-xs"
              label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft' }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              className="text-xs"
              label={{ value: 'Conversion %', angle: 90, position: 'insideRight' }}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              formatter={(value: number, name: string) => {
                if (name === 'revenue') return [`$${(value / 1000).toFixed(1)}k`, 'Revenue'];
                if (name === 'conversionRate') return [`${value.toFixed(1)}%`, 'Conversion Rate'];
                return [value, name];
              }}
            />
            <Legend />
            <Bar 
              yAxisId="left"
              dataKey="revenue" 
              fill="#10b981" 
              name="Revenue"
              radius={[8, 8, 0, 0]}
            />
            <Bar 
              yAxisId="right"
              dataKey="conversionRate" 
              fill="#8b5cf6" 
              name="Conversion Rate"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        
        {/* Top performers */}
        <div className="mt-6 space-y-2">
          <h4 className="font-semibold text-sm">Top Performing Sources</h4>
          {data
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 3)
            .map((item, index) => (
              <div key={item.source} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold text-muted-foreground">#{index + 1}</div>
                  <div>
                    <div className="font-medium">{item.source}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.won} won from {item.leads} leads
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">
                    ${(item.revenue / 1000).toFixed(1)}k
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.conversionRate.toFixed(1)}% conversion
                  </div>
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
