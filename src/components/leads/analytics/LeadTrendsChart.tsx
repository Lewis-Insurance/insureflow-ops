import { useState } from 'react';
import { useLeadTrends } from '@/hooks/useLeadAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export function LeadTrendsChart() {
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const { data: trendsData, isLoading } = useLeadTrends(period);

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Lead Trends</CardTitle>
            <CardDescription>
              Track lead volume and outcomes over time
            </CardDescription>
          </div>
          <Tabs value={period} onValueChange={(v) => setPeriod(v)}>
            <TabsList>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="quarter">Quarter</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={trendsData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="total" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Total Leads"
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="contacted" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              name="Contacted"
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="won" 
              stroke="#10b981" 
              strokeWidth={2}
              name="Won"
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="lost" 
              stroke="#ef4444" 
              strokeWidth={2}
              name="Lost"
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
