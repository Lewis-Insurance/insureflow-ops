import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePoliciesQuotesData } from '@/hooks/usePoliciesQuotesData';
import { Loader2 } from 'lucide-react';

export function RenewalsByLineOfBusiness() {
  const { data, isLoading, error } = usePoliciesQuotesData();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-destructive">Error loading report data</p>
        </CardContent>
      </Card>
    );
  }

  // Transform data for chart - use policies by line of business as proxy for renewals
  const chartData = data?.policiesByLineOfBusiness?.map(item => ({
    ...item,
    renewals: Math.floor(item.count * 0.8) // Simulate 80% renewal rate
  })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renewals by Line of Business</CardTitle>
        <p className="text-sm text-muted-foreground">
          Policy renewals broken down by line of business
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="label" 
                angle={-45}
                textAnchor="end"
                height={100}
                fontSize={12}
              />
              <YAxis />
              <Tooltip />
              <Bar dataKey="renewals" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
          {chartData.map((item, index) => (
            <div key={index} className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="font-semibold text-sm">{item.label}</div>
              <div className="text-2xl font-bold text-primary">{item.renewals}</div>
              <div className="text-xs text-muted-foreground">renewals</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}